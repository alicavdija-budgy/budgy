/**
 * GUARDIAN MONEY CHF - Cloud Sync Service
 * Syncs all local Zustand data to/from Supabase tables.
 *
 * @i18n-technical-file
 *
 * ⚠ Returns stable internal reason strings via `.error` fields. Cloud sync
 * UI (more/cloud-sync.tsx) maps them to translated messages at display time.
 *
 * Strategy:
 *  - Push: local store → Supabase (upsert on user_id+id)
 *  - Pull: Supabase → local store (replaces local arrays)
 *  - Realtime: subscribes to row changes (via Supabase Realtime channels)
 *
 * Each entity has a snake_case ↔ camelCase mapper.
 */

import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { mergeCollectionsV2, diffDirty, hashItem, legacyHashOf, isConfirmedHash } from '../lib/syncMerge';
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
async function upsertTable(table: string, rows: any[], conflictCol: string = 'id') {
  const sb = getSupabase();
  if (!sb || rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows as any, { onConflict: conflictCol });
  if (error) {
    // v3.7.28 — log enrichi pour diagnostiquer RLS / schéma / etc.
    // Codes Supabase fréquents :
    //   42501  → RLS policy bloque l'INSERT/UPDATE (manque "Users can manage their own data")
    //   42P01  → Table inexistante (schéma non appliqué — voir docs/SUPABASE_SCHEMA.sql)
    //   42703  → Colonne inexistante (PK mismatch ou onConflict invalide)
    //   23503  → Foreign key viol. (user_id ne référence pas auth.users)
    //   PGRST204 → Colonne du payload absente du schéma (drift TS ↔ SQL)
    //   PGRST301 → Row not visible (RLS SELECT manquant côté pull)
    const code = (error as any).code || (error as any).status || '?';
    const hint = (error as any).hint || (error as any).details || '';
    console.warn(
      `[sync] upsert ${table} failed (code=${code}) — ${error.message}${hint ? ' | ' + hint : ''}`,
    );
    if (String(code) === '42501') {
      console.warn(`[sync] → RLS POLICY manquante sur "${table}". Appliquer docs/SUPABASE_SCHEMA.sql.`);
    } else if (String(code) === '42P01') {
      console.warn(`[sync] → Table "${table}" n'existe pas dans Supabase. Appliquer docs/SUPABASE_SCHEMA.sql.`);
    } else if (String(code) === 'PGRST204' || String(code) === '42703') {
      console.warn(`[sync] → Schema drift sur "${table}" : une colonne du payload n'existe pas en DB. Vérifier TABLE_FIELDS dans cloudSync.ts.`);
    }
    throw error;
  }
}

// v3.7.28 — STRICT per-table column whitelist.
// Doit correspondre à docs/SUPABASE_SCHEMA.sql. Toute colonne du payload qui
// n'est pas dans cette liste est SILENCIEUSEMENT FILTRÉE avant l'upsert, ce
// qui évite les erreurs PGRST204 / 42703 dues au drift TS ↔ SQL (ex: champs
// client-only comme `synced`, `receipt` base64, `color`, `icon`, etc.).
const TABLE_FIELDS: Record<string, string[]> = {
  user_preferences: ['user_id', 'currency', 'language', 'canton', 'onboarded', 'is_pro'],
  // TÂCHE 3 — champs anti-double-comptage (liens par ID) désormais synchronisés
  transactions:       ['id', 'user_id', 'title', 'amount', 'category', 'date', 'payment_method', 'note', 'type', 'source', 'invoice_id', 'debt_id', 'recurring_id', 'created_at', 'updated_at'],
  incomes:            ['id', 'user_id', 'title', 'amount', 'frequency', 'type', 'category', 'created_at'],
  savings_goals:      ['id', 'user_id', 'title', 'emoji', 'color', 'target', 'saved', 'deadline', 'category', 'created_at'],
  budgets:            ['id', 'user_id', 'category', 'monthly', 'spent', 'created_at'],
  recurring_expenses: ['id', 'user_id', 'title', 'amount', 'category', 'frequency', 'active', 'next_date', 'created_at'],
  contracts:          ['id', 'user_id', 'title', 'issuer', 'amount', 'category', 'expiration_date', 'start_date', 'urgent', 'auto_renew', 'notes', 'document_id', 'notice_period', 'created_at'],
  debts:              ['id', 'user_id', 'title', 'color', 'total', 'paid', 'interest_rate', 'monthly_payment', 'created_at'],
  investments:        ['id', 'user_id', 'symbol', 'shares', 'avg_cost', 'current_price', 'name', 'type', 'created_at'],
  receipts:           ['id', 'user_id', 'merchant', 'amount', 'date', 'category', 'image_uri', 'currency', 'type', 'note', 'transaction_id', 'document_id', 'created_at'],
  invoices:           ['id', 'user_id', 'title', 'issuer', 'amount', 'currency', 'due_date', 'invoice_date', 'iban', 'reference', 'category', 'status', 'source', 'paid_at', 'recurring_id', 'created_at'],
  // TÂCHE 3 (audit §4) — SEULES les métadonnées PORTABLES et la référence
  // Storage (remote_path) sont synchronisées. Les chemins locaux file://
  // (file_uri, pdf_uri), les pages base64 et les binaires ne vont JAMAIS
  // en colonnes : ils restent locaux ou vont dans Supabase Storage.
  documents:          ['id', 'user_id', 'title', 'category', 'document_type', 'mime_type', 'tags', 'note', 'remote_path', 'file_size', 'imported_at', 'expires_at', 'created_at', 'updated_at'],
  expense_groups:     ['id', 'user_id', 'name', 'members', 'created_at'],
  group_expenses:     ['id', 'user_id', 'group_id', 'title', 'amount', 'paid_by', 'split', 'date', 'created_at'],
};

// TÂCHE 3 — REPLI « legacy » : tant que la migration additive
// (docs/MIGRATION_TASK3_storage_prive.sql) n'est PAS appliquée, les
// nouvelles colonnes n'existent pas en base. En cas d'erreur de colonne
// (42703/PGRST204), on retente avec la liste v3.7.28 : la synchro reste
// fonctionnelle AVANT et APRÈS migration, sans rien casser.
const TABLE_FIELDS_LEGACY: Record<string, string[]> = {
  transactions: ['id', 'user_id', 'title', 'amount', 'category', 'date', 'payment_method', 'note', 'created_at', 'updated_at'],
  contracts:    ['id', 'user_id', 'title', 'issuer', 'amount', 'category', 'expiration_date', 'start_date', 'urgent', 'auto_renew', 'notes', 'created_at'],
  receipts:     ['id', 'user_id', 'merchant', 'amount', 'date', 'category', 'image_uri', 'created_at'],
  invoices:     ['id', 'user_id', 'title', 'issuer', 'amount', 'currency', 'due_date', 'invoice_date', 'iban', 'reference', 'category', 'status', 'source', 'created_at'],
  documents:    ['id', 'user_id', 'title', 'category', 'data_uri', 'notes', 'created_at'],
};

// PK column for upsert conflict resolution. Most tables use 'id' (default),
// but user_preferences is keyed on user_id (1 row par user).
const TABLE_CONFLICT: Record<string, string> = {
  user_preferences: 'user_id',
};

function pickAllowed(allowed: string[] | undefined, row: any): any {
  if (!allowed) return row;
  const out: any = {};
  for (const f of allowed) {
    const v = row[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}

function pickFields(table: string, row: any): any {
  return pickAllowed(TABLE_FIELDS[table], row);
}

function isMissingColumnError(msg: string): boolean {
  return /42703|PGRST204|column .* does not exist|schema cache/i.test(msg);
}

export async function pushAllToCloud(): Promise<{
  ok: boolean;
  pushed: number;
  error?: string;
  /** P0 — tables dont certaines métadonnées attendent la migration additive (succès PARTIEL explicite). */
  pendingMigration?: string[];
}> {
  if (!isSupabaseConfigured()) return { ok: false, pushed: 0, error: 'Supabase non configuré' };
  const sb = getSupabase();
  if (!sb) return { ok: false, pushed: 0, error: 'Client non initialisé' };

  const { data: sess } = await sb.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return { ok: false, pushed: 0, error: 'Non connecté' };

  const s = useStore.getState();
  // TÂCHE 3 (audit §6) — isolation par compte : changement d'identité →
  // les marqueurs de l'ancien compte ne sont JAMAIS réutilisés.
  if (s.syncAccountId && s.syncAccountId !== userId) s.clearSyncMarkers();
  if (s.syncAccountId !== userId) s.setSyncAccountId(userId);
  // P0 — reprise sécurisée : documents non synchronisés mis de côté au
  // logout de CE compte → restaurés avant le push.
  useStore.getState().restoreAccountVault(userId);
  let total = 0;
  const errors: string[] = [];

  // v3.7.28 — Defensive per-table try/catch: a single failing table MUST NOT
  // block subsequent tables. Previously, an error on user_preferences (e.g.
  // schema drift like extra columns rejected by PGRST204) threw and aborted
  // the whole push, causing transactions to never reach the cloud and the
  // user's data to "disappear" on reload.
  const confirmPushed = (table: string, map: Record<string, string>) => {
    const cur = useStore.getState().syncedHashes[table] || {};
    useStore.getState().setSyncedHashes(table, { ...cur, ...map });
  };

  const safeUpsert = async (table: string, rows: any[], fullHashesById: Record<string, string>) => {
    if (rows.length === 0) return;
    try {
      // Strict per-table column whitelist + correct PK for upsert conflict
      const filtered = rows.map((r) => pickFields(table, r));
      const conflictCol = TABLE_CONFLICT[table] || 'id';
      await upsertTable(table, filtered, conflictCol);
      total += rows.length;
      // P0 — marqué « synchronisé » UNIQUEMENT après confirmation effective
      // du serveur, et SEULEMENT pour les lignes réellement envoyées.
      const confirmed: Record<string, string> = {};
      for (const r of rows) if (fullHashesById[String(r.id)]) confirmed[String(r.id)] = fullHashesById[String(r.id)];
      confirmPushed(table, confirmed);
    } catch (e: any) {
      const msg = e?.message || String(e);
      // P0 — repli legacy avant migration : seules les ANCIENNES colonnes
      // sont acceptées → on ne confirme QUE la projection legacy ('L:'+hash).
      // Les champs étendus restent explicitement « en attente de migration »
      // et seront poussés après la migration additive, sans boucle infinie.
      const legacy = TABLE_FIELDS_LEGACY[table];
      if (legacy && isMissingColumnError(msg)) {
        try {
          const filtered = rows.map((r) => pickAllowed(legacy, r));
          await upsertTable(table, filtered, TABLE_CONFLICT[table] || 'id');
          total += rows.length;
          const confirmed: Record<string, string> = {};
          for (const r of rows) confirmed[String(r.id)] = legacyHashOf(r, legacy);
          confirmPushed(table, confirmed);
          pendingMigration.add(table);
          return;
        } catch (e2: any) {
          errors.push(`${table}: ${e2?.message || String(e2)}`);
          return;
        }
      }
      errors.push(`${table}: ${msg}`);
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
  await safeUpsert('user_preferences', [prefsRow], {});

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
  // PUSH DELTA : seuls les éléments dont le contenu diffère de la dernière
  // version CONFIRMÉE sont envoyés. Une confirmation 'L:' (projection legacy)
  // reste valable tant que les champs legacy ne changent pas — les champs
  // étendus demeurent « en attente de migration » sans re-push en boucle.
  // Échec au milieu d'un push → la table en échec ne confirme rien, ses
  // éléments restent dirty et repartent au prochain cycle.
  const syncedHashes = useStore.getState().syncedHashes;
  const pendingMigration = new Set<string>();
  for (const [table, items] of collections) {
    if (!items || items.length === 0) continue;
    const stored = syncedHashes[table] || {};
    const legacy = TABLE_FIELDS_LEGACY[table];
    const dirtyItems: any[] = [];
    const fullHashesById: Record<string, string> = {};
    for (const it of items as any[]) {
      const id = String(it.id);
      const row = toRow(snake(it), userId);
      const fullH = hashItem(it);
      fullHashesById[id] = fullH;
      const st = stored[id];
      if (st && st.startsWith('L:')) pendingMigration.add(table);
      if (isConfirmedHash(st, fullH, legacy ? legacyHashOf(row, legacy) : null)) continue;
      dirtyItems.push(it);
    }
    if (dirtyItems.length === 0) continue;
    const rows = dirtyItems.map((it) => toRow(snake(it), userId));
    await safeUpsert(table, rows, fullHashesById);
  }

  // TÂCHE 3 (audit §1) — tombstones : suppressions EXPLICITES propagées via
  // la table sync_tombstones (migration additive). Table absente avant
  // migration → ignoré proprement, les tombstones locaux restent persistés.
  try {
    const tombs = useStore.getState().tombstones[userId] || {};
    const rows = Object.entries(tombs).map(([key, at]) => ({
      id: `${userId}:${key}`,
      user_id: userId,
      entity_key: key,
      deleted_at: at,
    }));
    if (rows.length > 0) await upsertTable('sync_tombstones', rows, 'id');
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Table absente avant migration = attendu (les tombstones restent en
    // attente, persistés localement) ; toute AUTRE erreur est VISIBLE.
    if (!isMissingColumnError(msg) && !/does not exist|relation|schema cache|404/i.test(msg)) {
      errors.push(`sync_tombstones: ${msg}`);
    }
  }

  if (errors.length > 0) {
    // Partial success: we still pushed what we could. lastCloudPushAt n'est
    // PAS avancé : les éléments des tables en échec restent protégés au pull.
    return { ok: total > 0, pushed: total, error: errors.join(' | ') };
  }
  useStore.getState().markCloudPushed(Date.now());
  if (pendingMigration.size > 0) {
    // P0 — succès PARTIEL explicite : certaines métadonnées attendent la
    // migration additive (jamais présenté comme une synchro complète).
    return { ok: true, pushed: total, pendingMigration: [...pendingMigration] };
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
      // v3.9.0 Build 74 — Do NOT hydrate `isPro` from cloud user_preferences.
      // The Apple StoreKit + backend IAP sync (/api/iap/me) is the ONLY source
      // of truth for Premium. If a stale `is_pro=true` sits in Supabase from
      // a previous life, we do NOT want to grant Pro back on account switch.
      useStore.setState({
        preferences: {
          ...cur.preferences,
          ...p,
          onboarded: !!p.onboarded,
        },
      });
    }

    // TÂCHE 3 (audit §1) — FUSION v2 SANS PERTE :
    //  • un élément local « dirty » (hash ≠ dernière version confirmée)
    //    GAGNE toujours — une modification hors ligne survit à la version
    //    cloud antérieure ;
    //  • l'absence dans la réponse cloud ne supprime JAMAIS rien (réponse
    //    incomplète = aucun effacement) ;
    //  • seules les suppressions explicites (tombstones) suppriment ou
    //    empêchent une résurrection ;
    //  • champ NULL/absent côté cloud → valeur locale préservée.
    if (cur.syncAccountId && cur.syncAccountId !== userId) cur.clearSyncMarkers();
    if (cur.syncAccountId !== userId) cur.setSyncAccountId(userId);
    useStore.getState().restoreAccountVault(userId);

    // Tombstones distants (suppressions confirmées sur d'autres appareils).
    let remoteTombs: { entity_key?: string; deleted_at?: number }[] = [];
    try {
      const { data: tData, error: tErr } = await sb.from('sync_tombstones').select('*').eq('user_id', userId);
      if (!tErr && tData) remoteTombs = tData;
    } catch {}
    const localTombs = useStore.getState().tombstones[userId] || {};
    const allTombs: Record<string, number> = { ...localTombs };
    for (const rt of remoteTombs) if (rt.entity_key) allTombs[rt.entity_key] = Number(rt.deleted_at) || Date.now();
    if (Object.keys(allTombs).length !== Object.keys(localTombs).length) {
      useStore.setState({ tombstones: { ...useStore.getState().tombstones, [userId]: allTombs } });
    }
    const tombIdsFor = (table: string): Set<string> => {
      const out = new Set<string>();
      for (const key of Object.keys(allTombs)) {
        if (key.startsWith(`${table}:`)) out.add(key.slice(table.length + 1));
      }
      return out;
    };

    const stateHashes = useStore.getState().syncedHashes;
    const TABLE_OF: Record<string, string> = {
      transactions: 'transactions', incomes: 'incomes', savingsGoals: 'savings_goals',
      budgets: 'budgets', recurringExpenses: 'recurring_expenses', contracts: 'contracts',
      debts: 'debts', investments: 'investments', receipts: 'receipts', invoices: 'invoices',
      documents: 'documents', groups: 'expense_groups', groupExpenses: 'group_expenses',
    };
    const postPullHashes: Record<string, Record<string, string>> = {};
    const mg = <T,>(stateKey: string, local: T[], remote: any[]): T[] => {
      const table = TABLE_OF[stateKey];
      const stored = stateHashes[table] || {};
      const legacy = TABLE_FIELDS_LEGACY[table];
      // « dirty » = modification locale non confirmée, en tenant compte des
      // confirmations partielles 'L:' (projection legacy avant migration).
      const dirtyIds = new Set<string>();
      for (const it of (local || []) as any[]) {
        const id = String(it.id);
        const lh = legacy ? legacyHashOf(toRow(snake(it), userId), legacy) : null;
        if (!isConfirmedHash(stored[id], hashItem(it), lh)) dirtyIds.add(id);
      }
      const res = mergeCollectionsV2((local || []) as any[], remote as any[], {
        dirtyIds,
        tombstoneIds: tombIdsFor(table),
      });
      // Les éléments NON dirty sont alignés sur le cloud → confirmés. Un
      // marqueur 'L:' est CONSERVÉ (recalculé sur l'élément fusionné) : les
      // champs étendus restent « en attente de migration », jamais perdus.
      const confirmed: Record<string, string> = {};
      for (const m of res.merged as any[]) {
        const id = String(m.id);
        if (dirtyIds.has(id)) continue;
        const wasLegacy = (stored[id] || '').startsWith('L:');
        confirmed[id] = wasLegacy && legacy ? legacyHashOf(toRow(snake(m), userId), legacy) : hashItem(m);
      }
      postPullHashes[table] = { ...stored, ...confirmed };
      return res.merged as T[];
    };
    useStore.setState({
      transactions: mg('transactions', cur.transactions, transactions) as Transaction[],
      incomes: mg('incomes', cur.incomes, incomes) as Income[],
      savingsGoals: mg('savingsGoals', cur.savingsGoals, savingsGoals) as SavingsGoal[],
      budgets: mg('budgets', cur.budgets, budgets) as Budget[],
      recurringExpenses: mg('recurringExpenses', cur.recurringExpenses, recurringExpenses) as RecurringExpense[],
      contracts: mg('contracts', cur.contracts, contracts) as Contract[],
      debts: mg('debts', cur.debts, debts) as Debt[],
      investments: mg('investments', cur.investments, investments) as Investment[],
      receipts: mg('receipts', cur.receipts, receipts) as Receipt[],
      invoices: mg('invoices', cur.invoices, invoices) as Invoice[],
      documents: mg('documents', cur.documents, documents) as PersonalDocument[],
      groups: mg('groups', cur.groups, groups) as ExpenseGroup[],
      groupExpenses: mg('groupExpenses', cur.groupExpenses, groupExpenses) as GroupExpense[],
    });
    useStore.setState({ syncedHashes: { ...useStore.getState().syncedHashes, ...postPullHashes } });

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
