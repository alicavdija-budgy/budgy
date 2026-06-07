/**
 * GUARDIAN MONEY CHF - Cloud Sync Service
 * Syncs all local Zustand data to/from Supabase tables.
 *
 * Strategy:
 *  - Push: local store → Supabase (upsert on user_id+id)
 *  - Pull: Supabase → local store (replaces local arrays)
 *  - Realtime: subscribes to row changes (via Supabase Realtime channels)
 *
 * Each entity has a snake_case ↔ camelCase mapper.
 */

import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { useStore } from '../stores/useStore';
import type {
  Transaction,
  Income,
  SavingsGoal,
  Budget,
  RecurringExpense,
  Contract,
  Debt,
  Investment,
  Receipt,
  Invoice,
  PersonalDocument,
  ExpenseGroup,
  GroupExpense,
} from '../types';

// ─── Mappers (camelCase ↔ snake_case) ────────────────────────
const toRow = (obj: any, userId: string) => ({ ...obj, user_id: userId });

function snake(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const sk = k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    out[sk] = obj[k];
  }
  return out;
}

function camel(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = obj[k];
  }
  return out;
}

// Strip user_id (we don't need it on the client)
const cleanCamel = (row: any) => {
  const c = camel(row);
  delete c.userId;
  return c;
};

// ─── Push: send local data to cloud ───────────────────────────
async function upsertTable(table: string, rows: any[]) {
  const sb = getSupabase();
  if (!sb || rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows as any, { onConflict: 'id' });
  if (error) {
    // v3.7.28 — log enrichi pour diagnostiquer RLS / schéma / etc.
    // Codes Supabase fréquents :
    //   42501  → RLS policy bloque l'INSERT/UPDATE (manque "Users can manage their own data")
    //   42P01  → Table inexistante (schéma non appliqué — voir docs/SUPABASE_SCHEMA.sql)
    //   23503  → Foreign key viol. (user_id ne référence pas auth.users)
    //   PGRST301 → Row not visible (RLS SELECT manquant côté pull)
    const code = (error as any).code || (error as any).status || '?';
    const hint = (error as any).hint || (error as any).details || '';
    console.warn(
      `[sync] upsert ${table} failed (code=${code}) — ${error.message}${hint ? ' | ' + hint : ''}`,
    );
    // Hint clair pour les 2 cas les plus probables :
    if (String(code) === '42501') {
      console.warn(`[sync] → RLS POLICY manquante sur "${table}". Appliquer docs/SUPABASE_SCHEMA.sql.`);
    } else if (String(code) === '42P01') {
      console.warn(`[sync] → Table "${table}" n'existe pas dans Supabase. Appliquer docs/SUPABASE_SCHEMA.sql.`);
    }
    throw error;
  }
}

export async function pushAllToCloud(): Promise<{
  ok: boolean;
  pushed: number;
  error?: string;
}> {
  if (!isSupabaseConfigured()) return { ok: false, pushed: 0, error: 'Supabase non configuré' };
  const sb = getSupabase();
  if (!sb) return { ok: false, pushed: 0, error: 'Client non initialisé' };

  const { data: sess } = await sb.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return { ok: false, pushed: 0, error: 'Non connecté' };

  const s = useStore.getState();
  let total = 0;
  const errors: string[] = [];

  // v3.7.28 — Defensive per-table try/catch: a single failing table MUST NOT
  // block subsequent tables. Previously, an error on user_preferences (e.g.
  // schema drift like extra columns rejected by PGRST204) threw and aborted
  // the whole push, causing transactions to never reach the cloud and the
  // user's data to "disappear" on reload.
  const safeUpsert = async (table: string, rows: any[]) => {
    if (rows.length === 0) return;
    try {
      await upsertTable(table, rows);
      total += rows.length;
    } catch (e: any) {
      errors.push(`${table}: ${e?.message || String(e)}`);
    }
  };

  // 1. preferences (single row) — STRICT column whitelist to avoid PGRST204
  //    on schema drift (client may have many local-only fields like
  //    languagePicked, themeMode, biometricEnabled, etc. that don't exist
  //    in the Supabase user_preferences table).
  const p: any = s.preferences || {};
  const prefsRow = {
    user_id: userId,
    currency: p.currency ?? 'CHF',
    language: p.language ?? 'fr',
    canton: p.canton ?? null,
    onboarded: !!p.onboarded,
    is_pro: !!(s as any).isPro,
  };
  await safeUpsert('user_preferences', [prefsRow]);

  // 2-N collections
  const collections: [string, any[]][] = [
    ['transactions', s.transactions],
    ['incomes', s.incomes],
    ['savings_goals', s.savingsGoals],
    ['budgets', s.budgets],
    ['recurring_expenses', s.recurringExpenses],
    ['contracts', s.contracts],
    ['debts', s.debts],
    ['investments', s.investments],
    ['receipts', s.receipts],
    ['invoices', s.invoices],
    ['documents', s.documents],
    ['expense_groups', s.groups],
    ['group_expenses', s.groupExpenses],
  ];
  for (const [table, items] of collections) {
    if (!items || items.length === 0) continue;
    const rows = items.map((it) => toRow(snake(it), userId));
    await safeUpsert(table, rows);
  }

  if (errors.length > 0) {
    // Partial success: we still pushed what we could.
    return { ok: total > 0, pushed: total, error: errors.join(' | ') };
  }
  return { ok: true, pushed: total };
}

// ─── Pull: fetch cloud data and replace local store ───────────
export async function pullAllFromCloud(): Promise<{ ok: boolean; pulled: number; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, pulled: 0, error: 'Supabase non configuré' };
  const { data: sess } = await sb.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return { ok: false, pulled: 0, error: 'Non connecté' };

  let total = 0;
  try {
    const fetch = async (table: string) => {
      const { data, error } = await sb.from(table).select('*').eq('user_id', userId);
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data || []).map(cleanCamel);
    };

    const [
      prefs,
      transactions,
      incomes,
      savingsGoals,
      budgets,
      recurringExpenses,
      contracts,
      debts,
      investments,
      receipts,
      invoices,
      documents,
      groups,
      groupExpenses,
    ] = await Promise.all([
      fetch('user_preferences'),
      fetch('transactions'),
      fetch('incomes'),
      fetch('savings_goals'),
      fetch('budgets'),
      fetch('recurring_expenses'),
      fetch('contracts'),
      fetch('debts'),
      fetch('investments'),
      fetch('receipts'),
      fetch('invoices'),
      fetch('documents'),
      fetch('expense_groups'),
      fetch('group_expenses'),
    ]);

    // Merge prefs (single row)
    const cur = useStore.getState();
    if (prefs.length > 0) {
      const p = prefs[0];
      useStore.setState({
        preferences: {
          ...cur.preferences,
          ...p,
          onboarded: !!p.onboarded,
        },
        isPro: !!p.isPro,
      });
    }

    useStore.setState({
      transactions: transactions as Transaction[],
      incomes: incomes as Income[],
      savingsGoals: savingsGoals as SavingsGoal[],
      budgets: budgets as Budget[],
      recurringExpenses: recurringExpenses as RecurringExpense[],
      contracts: contracts as Contract[],
      debts: debts as Debt[],
      investments: investments as Investment[],
      receipts: receipts as Receipt[],
      invoices: invoices as Invoice[],
      documents: documents as PersonalDocument[],
      groups: groups as ExpenseGroup[],
      groupExpenses: groupExpenses as GroupExpense[],
    });

    total =
      transactions.length + incomes.length + savingsGoals.length + budgets.length +
      recurringExpenses.length + contracts.length + debts.length + investments.length +
      receipts.length + invoices.length + documents.length + groups.length + groupExpenses.length +
      prefs.length;
    return { ok: true, pulled: total };
  } catch (e: any) {
    return { ok: false, pulled: total, error: e?.message || String(e) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────
export async function isSignedInToSupabase(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  return !!data.session?.user?.id;
}

export async function syncRoundTrip(): Promise<{
  pushed: number;
  pulled: number;
  error?: string;
}> {
  const push = await pushAllToCloud();
  if (!push.ok) return { pushed: 0, pulled: 0, error: push.error };
  const pull = await pullAllFromCloud();
  if (!pull.ok) return { pushed: push.pushed, pulled: 0, error: pull.error };
  return { pushed: push.pushed, pulled: pull.pulled };
}
