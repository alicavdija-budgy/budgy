/**
 * BUDGY — Family / Groups Cloud (Milestone A, v3.8.0)
 *
 * Enables real cross-device group sharing without Supabase Realtime:
 *   - publishInviteCode(group)  → inserts / updates the code in `group_invites`
 *   - joinByCode(code)          → calls RPC `join_group_by_code` which:
 *                                  · finds the group_id from the code
 *                                  · appends caller's auth.uid() to
 *                                    `expense_groups.member_user_ids`
 *                                  · returns the group + its expenses so we
 *                                    can hydrate the local Zustand store.
 *
 * Requires the SQL migration in `/app/docs/SUPABASE_FAMILY.sql`.
 * Realtime multi-device propagation arrives in Milestone B (v3.8.1+).
 */

import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import type { ExpenseGroup, GroupExpense, GroupMember } from '../types';

const INVITE_TTL_DAYS = 30;

// ─── Types ──────────────────────────────────────────────
export interface JoinResult {
  group: ExpenseGroup;
  expenses: GroupExpense[];
  alreadyMember: boolean;
}

// ─── Publish invite code ────────────────────────────────
/**
 * Publish (or refresh) a group invite code in Supabase. This makes the code
 * discoverable across devices/accounts. Idempotent: rejects on primary key
 * conflict and updates the row instead.
 *
 * Silently no-ops when Supabase is not configured or the user is offline —
 * the code stays valid locally as before.
 */
export async function publishInviteCode(
  group: ExpenseGroup,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'offline' };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'offline' };

  try {
    const { data: userData } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return { ok: false, error: 'not_authenticated' };

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await sb.from('group_invites').upsert(
      [{
        code: code.toUpperCase(),
        group_id: group.id,
        created_by: uid,
        expires_at: expiresAt,
      }] as any,
      { onConflict: 'code' },
    );
    if (error) {
      console.warn('[familyCloud] publishInviteCode failed:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─── Join by code ───────────────────────────────────────
/**
 * Attempt to join a group using an 8-char invite code.
 * Calls the SECURITY DEFINER RPC `join_group_by_code` which handles the
 * cross-user RLS access.
 */
export async function joinByCode(
  rawCode: string,
): Promise<{ ok: boolean; error?: string; data?: JoinResult }> {
  const code = (rawCode || '').trim().toUpperCase();
  if (code.length !== 8) return { ok: false, error: 'invalid_code' };

  if (!isSupabaseConfigured()) return { ok: false, error: 'offline' };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'offline' };

  try {
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user?.id) return { ok: false, error: 'not_authenticated' };

    const { data, error } = await (sb.rpc as any)('join_group_by_code', { p_code: code });
    if (error) {
      const msg = String(error.message || '');
      const code404 = String((error as any).code || '');
      // v3.8.0 — map missing table / RPC / not-found row to invite_not_found
      // so the UI shows the localised message instead of the raw SQL error.
      const isMissing =
        code404.startsWith('PGRST20') ||
        /Could not find|schema cache|does not exist|invite_not_found|not_found|group_missing/i.test(msg);
      console.warn('[familyCloud] joinByCode RPC failed:', msg, '/code=', code404);
      return { ok: false, error: isMissing ? 'invite_not_found' : msg };
    }
    if (!data || !data.group) return { ok: false, error: 'not_found' };

    // The RPC returns { group: {...}, expenses: [...], already_member: bool }
    const g = data.group as any;
    const group: ExpenseGroup = {
      id: g.id,
      name: g.name || 'Groupe',
      emoji: g.emoji || '👥',
      color: g.color || '#34D399',
      currency: g.currency || 'CHF',
      members: Array.isArray(g.members) ? g.members : [],
      createdAt: g.created_at || Date.now(),
      inviteCode: code,
    };

    const rawExpenses: any[] = Array.isArray(data.expenses) ? data.expenses : [];
    const expenses: GroupExpense[] = rawExpenses.map((e) => ({
      id: e.id,
      groupId: e.group_id,
      title: e.title || '',
      amount: Number(e.amount) || 0,
      currency: e.currency || group.currency || 'CHF',
      paidBy: e.paid_by || '',
      splitMode: (e.split_mode as any) || 'equal',
      shares: e.shares || {},
      date: e.date || new Date().toISOString().slice(0, 10),
      category: e.category,
      note: e.note,
      createdAt: e.created_at || Date.now(),
    }));

    return {
      ok: true,
      data: {
        group,
        expenses,
        alreadyMember: !!data.already_member,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─── Leave group ────────────────────────────────────────
/**
 * Remove the caller from a group's member_user_ids (server-side).
 * Returns { ok } — the local store cleanup is the caller's responsibility.
 */
export async function leaveGroupCloud(
  groupId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: true }; // no cloud → no-op
  const sb = getSupabase();
  if (!sb) return { ok: true };

  try {
    const { error } = await (sb.rpc as any)('leave_group', { p_group_id: groupId });
    if (error) {
      console.warn('[familyCloud] leaveGroup RPC failed:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─── Helper: add self as GroupMember for the local store ──────
/**
 * Build a GroupMember object for the current authenticated user (fallback
 * name = email prefix). Used when we join a cloud group.
 */
export async function makeSelfMember(color: string): Promise<GroupMember | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    const u = data?.user;
    if (!u?.id) return null;
    const email = u.email || '';
    const nameFromEmail = email.includes('@') ? email.split('@')[0] : 'Moi';
    const displayName =
      (u.user_metadata as any)?.full_name ||
      (u.user_metadata as any)?.name ||
      nameFromEmail;
    return {
      id: u.id,
      name: String(displayName).slice(0, 24),
      color,
      email,
      isMe: true,
    };
  } catch {
    return null;
  }
}
