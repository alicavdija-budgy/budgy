#!/usr/bin/env node
/**
 * BUDGY — Persistent cloud-deletion regression suite (Build 82 hotfix).
 *
 * Bug covered: deleting a transaction / invoice / recurring expense only
 * removed it locally; the Supabase row survived (push is upsert-only) and
 * pullAllFromCloud() resurrected the item on next app start.
 *
 * Two layers:
 *  1. BEHAVIORAL — src/services/cloudDelete.ts is transpiled with the
 *     project's TypeScript compiler and executed against a fake Supabase
 *     client (no new dependency, no network).
 *  2. STATIC — screens/store contracts (correct table mapping, cloud-first
 *     ordering, reminders only after success, Zustand actions untouched).
 *
 * Run: node scripts/test-cloud-delete.mjs (no package.json change needed).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const requireCjs = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
async function ok(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}\n    ${err?.stack || err}`);
  }
}

const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

// ── Transpile the real service (CommonJS) and load it with a mocked
//    '../lib/supabase' so the exact production logic is what we test. ──
const ts = requireCjs(path.join(root, 'node_modules', 'typescript'));
const serviceSrc = read('src', 'services', 'cloudDelete.ts');
const serviceJs = ts.transpileModule(serviceSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadService(supabaseMock) {
  const mod = { exports: {} };
  const fakeRequire = (name) => {
    if (name === '../lib/supabase') return supabaseMock;
    throw new Error(`Unexpected import in cloudDelete.ts: ${name}`);
  };
  new Function('require', 'module', 'exports', serviceJs)(fakeRequire, mod, mod.exports);
  return mod.exports;
}

/**
 * Fake Supabase client with an in-memory cloud table.
 * opts: { session, rows, failDelete, throwDelete, silentDelete, delayMs }
 */
function makeFakeCloud(opts = {}) {
  const state = {
    rows: [...(opts.rows || [])],
    deleteCalls: [],
    verifyCalls: [],
    seq: [],
  };
  const matches = (r, f) => r.id === f.id && r.user_id === f.user_id;
  const sb = {
    auth: { getSession: async () => ({ data: { session: opts.session ?? null } }) },
    from(table) {
      return {
        delete() {
          return {
            eq: (c1, v1) => ({
              eq: (c2, v2) => ({
                select: async () => {
                  const filters = { [c1]: v1, [c2]: v2 };
                  state.deleteCalls.push({ table, filters });
                  state.seq.push('cloud-delete');
                  if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
                  if (opts.throwDelete) throw new Error('network down');
                  if (opts.failDelete) return { data: null, error: { message: 'rls', code: '42501' } };
                  if (opts.silentDelete) return { data: [], error: null };
                  const deleted = state.rows.filter((r) => matches(r, filters));
                  state.rows = state.rows.filter((r) => !matches(r, filters));
                  return { data: deleted.map((r) => ({ id: r.id })), error: null };
                },
              }),
            }),
          };
        },
        select() {
          return {
            eq: (c1, v1) => ({
              eq: (c2, v2) => ({
                limit: async () => {
                  const filters = { [c1]: v1, [c2]: v2 };
                  state.verifyCalls.push({ table, filters });
                  if (opts.failVerify) return { data: null, error: { message: 'boom' } };
                  const found = state.rows.filter((r) => matches(r, filters));
                  return { data: found.map((r) => ({ id: r.id })), error: null };
                },
              }),
            }),
          };
        },
      };
    },
  };
  return { sb, state };
}

const SESSION = { user: { id: 'user-1' } };
const deps = (sb, configured = true) => ({ isConfigured: () => configured, getClient: () => sb });

console.log('\n[test-cloud-delete] Build 82 persistent deletion suite\n');

// ── 1. No Supabase session → local-only, zero remote DELETE ──────────────
await ok('no session → no remote DELETE, local deletion allowed', async () => {
  const svc = loadService({ isSupabaseConfigured: () => true, getSupabase: () => null });
  const { sb, state } = makeFakeCloud({ session: null, rows: [{ id: 't1', user_id: 'user-1' }] });
  let localDeleted = false;
  const res = await svc.deleteEntityWithCloud('transactions', 't1', () => { localDeleted = true; }, deps(sb));
  assert.equal(res.ok, true);
  assert.equal(res.cloudUsed, false);
  assert.equal(state.deleteCalls.length, 0, 'no remote DELETE must run without a session');
  assert.equal(localDeleted, true);
});

await ok('Supabase not configured → local-only mode', async () => {
  const svc = loadService({ isSupabaseConfigured: () => false, getSupabase: () => null });
  let localDeleted = false;
  const res = await svc.deleteFromCloud('invoices', 'x', { isConfigured: () => false, getClient: () => null });
  assert.deepEqual(res, { ok: true, cloudUsed: false });
  const res2 = await svc.deleteEntityWithCloud('invoices', 'x', () => { localDeleted = true; }, { isConfigured: () => false, getClient: () => null });
  assert.equal(res2.ok, true);
  assert.equal(localDeleted, true);
});

// ── 2. Session + remote success: filters + cloud-first ordering ──────────
await ok('session + success → id AND session user_id filters, local delete AFTER remote', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({ session: SESSION, rows: [{ id: 't1', user_id: 'user-1' }] });
  const res = await svc.deleteEntityWithCloud('transactions', 't1', () => state.seq.push('local-delete'), deps(sb));
  assert.equal(res.ok, true);
  assert.equal(res.cloudUsed, true);
  assert.deepEqual(state.deleteCalls[0].filters, { id: 't1', user_id: 'user-1' });
  assert.deepEqual(state.seq, ['cloud-delete', 'local-delete'], 'local deletion must wait for cloud confirmation');
});

// ── 3. Supabase error → failure, local item kept ─────────────────────────
await ok('Supabase error → failed result, local item preserved', async () => {
  const svc = loadService({});
  const { sb } = makeFakeCloud({ session: SESSION, failDelete: true });
  let localDeleted = false;
  const res = await svc.deleteEntityWithCloud('invoices', 'i1', () => { localDeleted = true; }, deps(sb));
  assert.equal(res.ok, false);
  assert.equal(res.cloudUsed, true);
  assert.equal(localDeleted, false, 'local item must be kept on cloud failure');
});

// ── 4. Network exception → failure, handled, local kept ──────────────────
await ok('network exception → failed result, no unhandled throw, local kept', async () => {
  const svc = loadService({});
  const { sb } = makeFakeCloud({ session: SESSION, throwDelete: true });
  let localDeleted = false;
  const res = await svc.deleteEntityWithCloud('recurring_expenses', 'r1', () => { localDeleted = true; }, deps(sb));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'network_error');
  assert.equal(localDeleted, false);
});

// ── 5. DELETE ok but zero row → targeted verification ────────────────────
await ok('0 rows deleted + row absent → idempotent success (verified)', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({ session: SESSION, silentDelete: true, rows: [] });
  let localDeleted = false;
  const res = await svc.deleteEntityWithCloud('transactions', 'gone', () => { localDeleted = true; }, deps(sb));
  assert.equal(state.verifyCalls.length, 1, 'targeted verification must run');
  assert.equal(res.ok, true);
  assert.equal(localDeleted, true);
});

await ok('0 rows deleted + row STILL present → failure, local kept', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({
    session: SESSION,
    silentDelete: true,
    rows: [{ id: 't1', user_id: 'user-1' }],
  });
  let localDeleted = false;
  const res = await svc.deleteEntityWithCloud('transactions', 't1', () => { localDeleted = true; }, deps(sb));
  assert.equal(state.verifyCalls.length, 1);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'row_still_present');
  assert.equal(localDeleted, false);
});

// ── 6. Double click → single remote DELETE ───────────────────────────────
await ok('double tap → only ONE remote DELETE for the same table/id', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({
    session: SESSION,
    delayMs: 40,
    rows: [{ id: 't1', user_id: 'user-1' }],
  });
  const [r1, r2] = await Promise.all([
    svc.deleteFromCloud('transactions', 't1', deps(sb)),
    svc.deleteFromCloud('transactions', 't1', deps(sb)),
  ]);
  assert.equal(state.deleteCalls.length, 1, 'concurrent duplicate must be blocked');
  const results = [r1, r2];
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.error === 'delete_in_progress').length, 1);
});

// ── 7. Regression: after confirmed deletion a pull cannot resurrect ──────
await ok('after confirmed deletion, cloud pull no longer contains the item', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({
    session: SESSION,
    rows: [{ id: 'inv1', user_id: 'user-1' }, { id: 'inv2', user_id: 'user-1' }],
  });
  const res = await svc.deleteEntityWithCloud('invoices', 'inv1', () => {}, deps(sb));
  assert.equal(res.ok, true);
  const pulled = state.rows.map((r) => r.id); // what pullAllFromCloud would fetch
  assert.ok(!pulled.includes('inv1'), 'deleted row must be gone from the cloud');
  assert.ok(pulled.includes('inv2'), 'other rows must be untouched');
});

// ── 8. Whitelist and input guards ────────────────────────────────────────
await ok('arbitrary table names and empty ids are rejected', async () => {
  const svc = loadService({});
  const { sb, state } = makeFakeCloud({ session: SESSION });
  const bad = await svc.deleteFromCloud('user_preferences', 'x', deps(sb));
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid_table');
  const noId = await svc.deleteFromCloud('transactions', '', deps(sb));
  assert.equal(noId.ok, false);
  assert.equal(state.deleteCalls.length, 0);
});

// ── 9. STATIC contracts (screens / store / service source) ───────────────
const expensesSrc = read('app', '(tabs)', 'expenses.tsx');
const invoicesSrc = read('app', 'more', 'invoices.tsx');
const recurringSrc = read('app', 'more', 'recurring.tsx');
const storeSrc = read('src', 'stores', 'useStore.ts');
const translationsSrc = read('src', 'i18n', 'translations.ts');

await ok('entity → table mappings are exact', () => {
  assert.match(expensesSrc, /deleteEntityWithCloud\('transactions'/);
  assert.match(invoicesSrc, /deleteEntityWithCloud\('invoices'/);
  assert.match(recurringSrc, /deleteEntityWithCloud\('recurring_expenses'/);
});

await ok('no direct local-only deletion remains on synced delete paths', () => {
  // The only local delete calls must sit inside the cloud-confirmed callback.
  for (const [src, action] of [
    [expensesSrc, 'deleteTransaction(id)'],
    [invoicesSrc, 'deleteInvoiceAction(id)'],
    [recurringSrc, 'deleteRecurringExpense(id)'],
  ]) {
    const occurrences = src.split(action).length - 1;
    const wrapped = src.split(`() => ${action}`).length - 1;
    assert.equal(occurrences, wrapped, `${action} must only run after cloud confirmation`);
  }
});

await ok('invoice reminders are cancelled ONLY after a successful deletion', () => {
  const fnStart = invoicesSrc.indexOf('const performInvoiceDelete');
  const fn = invoicesSrc.slice(fnStart, invoicesSrc.indexOf('};', fnStart));
  const okIdx = fn.indexOf('if (res.ok)');
  const cancelIdx = fn.indexOf('cancelDeadlineRemindersForEntity(id)');
  assert.ok(okIdx >= 0 && cancelIdx > okIdx, 'reminder cancellation must follow res.ok');
  // No remaining pre-deletion cancellation on delete paths.
  const sheetBlock = invoicesSrc.slice(invoicesSrc.indexOf('<EntityActionsSheet'));
  assert.doesNotMatch(sheetBlock, /cancelDeadlineRemindersForEntity/);
});

await ok('Zustand delete actions stay synchronous and local-only', () => {
  assert.match(storeSrc, /deleteTransaction: \(id\) => set\(/);
  assert.match(storeSrc, /deleteInvoice: \(id\) => set\(/);
  assert.match(storeSrc, /deleteRecurringExpense: \(id\) => set\(/);
  assert.doesNotMatch(storeSrc, /deleteFromCloud|deleteEntityWithCloud|supabase/i);
});

await ok('proExpenses deletion is untouched (not cloud-synced)', () => {
  assert.match(expensesSrc, /deleteProExpense\(id\);/);
  assert.doesNotMatch(expensesSrc, /deleteEntityWithCloud\('pro/);
});

await ok('service never trusts a caller-provided user_id', () => {
  assert.match(serviceSrc, /data\?\.session\?\.user\?\.id/);
  assert.doesNotMatch(serviceSrc, /user_id\s*:\s*string/, 'no user_id parameter allowed');
});

await ok('cloudDelete i18n keys exist in FR/EN/DE/IT', () => {
  const block = translationsSrc.slice(
    translationsSrc.indexOf('cloudDelete: {'),
    translationsSrc.indexOf('iapErrors: {')
  );
  for (const lang of ['fr:', 'en:', 'de:', 'it:']) assert.ok(block.includes(lang), `missing ${lang}`);
  assert.equal((block.match(/failedTitle/g) || []).length, 4);
  assert.equal((block.match(/failedBody/g) || []).length, 4);
});

await ok('screens show the localized failure message, never raw errors', () => {
  for (const src of [expensesSrc, invoicesSrc, recurringSrc]) {
    assert.match(src, /t\('cloudDelete\.failedTitle'\), t\('cloudDelete\.failedBody'\)/);
    assert.doesNotMatch(src, /res\.error \|\|/, 'raw internal error must not be rendered');
  }
});

console.log(`\n[test-cloud-delete] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
