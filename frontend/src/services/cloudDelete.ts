/**
 * BUDGY — Persistent cloud deletion (Build 82 hotfix)
 *
 * @i18n-technical-file — `.error` values are stable internal reasons,
 * mapped to translated copy by the screens. Never shown raw.
 *
 * Bug fixed: deleteTransaction()/deleteInvoice()/deleteRecurringExpense()
 * only removed rows from the local Zustand/AsyncStorage store. cloudSync
 * pushAllToCloud() is upsert-only, so the Supabase row survived, and
 * pullAllFromCloud() (startup / foreground) resurrected the deleted item.
 *
 * Fix: for a signed-in Supabase user, delete the cloud row FIRST, wait for
 * confirmation, and only then remove the item locally. This ordering keeps
 * autoSync pushes harmless: the local item disappears only after the cloud
 * row is gone, so a debounced push can never re-upsert it.
 *
 * Scope (hotfix): transactions, invoices, recurring_expenses ONLY.
 * Local-only users (no real Supabase session) keep the plain local deletion.
 * proExpenses are not cloud-synced and are untouched.
 */

import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type CloudDeleteTable = 'transactions' | 'invoices' | 'recurring_expenses';

// Whitelist — arbitrary table names are rejected even if the union type is
// bypassed at runtime (e.g. a value coming from JS without type checking).
const CLOUD_DELETE_TABLES: readonly CloudDeleteTable[] = [
  'transactions',
  'invoices',
  'recurring_expenses',
];

export interface CloudDeleteResult {
  /** true → safe to remove the item from the local store */
  ok: boolean;
  /** true → a real Supabase session existed and the cloud was involved */
  cloudUsed: boolean;
  /** stable internal reason — NEVER rendered raw in the UI */
  error?: string;
}

/** Injectable for tests only — production always uses the real client. */
export interface CloudDeleteDeps {
  isConfigured: () => boolean;
  getClient: () => any;
}

const defaultDeps: CloudDeleteDeps = {
  isConfigured: isSupabaseConfigured,
  getClient: getSupabase,
};

const devWarn = (...args: any[]) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(...args);
};

// One in-flight deletion per table/id — double-tap guard, released in finally.
const inFlight = new Set<string>();

/**
 * Delete one row in Supabase, filtered by BOTH id and the session user id.
 * Idempotent and confirmed:
 *  - deleted row returned → success;
 *  - 0 rows without error → targeted re-check: row gone = idempotent success,
 *    row still present = failure (silent RLS/session mismatch);
 *  - any error/exception → failure, the caller must keep the local item.
 */
export async function deleteFromCloud(
  table: CloudDeleteTable,
  id: string,
  deps: CloudDeleteDeps = defaultDeps
): Promise<CloudDeleteResult> {
  if (!CLOUD_DELETE_TABLES.includes(table)) {
    return { ok: false, cloudUsed: false, error: 'invalid_table' };
  }
  if (!id || typeof id !== 'string') {
    return { ok: false, cloudUsed: false, error: 'invalid_id' };
  }

  // Local-only mode. Configuration alone is NOT a session: the decision is
  // based on the real Supabase session below.
  if (!deps.isConfigured()) return { ok: true, cloudUsed: false };
  const sb = deps.getClient();
  if (!sb) return { ok: true, cloudUsed: false };

  let userId: string | undefined;
  try {
    const { data } = await sb.auth.getSession();
    // EXCLUSIVELY the session user id — never a user_id from the UI/object.
    userId = data?.session?.user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) return { ok: true, cloudUsed: false };

  const key = `${table}:${id}`;
  if (inFlight.has(key)) {
    return { ok: false, cloudUsed: true, error: 'delete_in_progress' };
  }
  inFlight.add(key);
  try {
    const { data, error } = await sb
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      devWarn(`[cloud-delete] ${table} failed (code=${(error as any).code || '?'})`);
      return { ok: false, cloudUsed: true, error: 'delete_failed' };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { ok: true, cloudUsed: true };
    }

    // DELETE returned no row and no error: verify explicitly.
    const check = await sb
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .limit(1);
    if (check.error) {
      devWarn(`[cloud-delete] ${table} verify failed`);
      return { ok: false, cloudUsed: true, error: 'verify_failed' };
    }
    if (!check.data || check.data.length === 0) {
      // Row already gone → idempotent success.
      return { ok: true, cloudUsed: true };
    }
    // Row survived a "successful" DELETE → silently ignored (RLS/session).
    return { ok: false, cloudUsed: true, error: 'row_still_present' };
  } catch (e: any) {
    devWarn('[cloud-delete] network/exception:', e?.message || String(e));
    return { ok: false, cloudUsed: true, error: 'network_error' };
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Screen-facing orchestration. Zustand actions stay synchronous and purely
 * local — this layer awaits the cloud confirmation first, then removes the
 * item locally only on success.
 */
export async function deleteEntityWithCloud(
  table: CloudDeleteTable,
  id: string,
  removeLocally: () => void,
  deps: CloudDeleteDeps = defaultDeps
): Promise<CloudDeleteResult> {
  const res = await deleteFromCloud(table, id, deps);
  if (res.ok) removeLocally();
  return res;
}
