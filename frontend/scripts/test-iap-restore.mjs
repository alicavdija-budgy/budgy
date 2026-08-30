#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 81 — Restore / already-owned / password-recovery
 * regression contract.
 *
 * Covers the two TestFlight bugs:
 *   1. "Restauration → Aucun abonnement actif" while Apple answers
 *      "Item already owned" on purchase (missing StoreKit sync).
 *   2. Raw "Item already owned" shown to the user instead of an automatic
 *      entitlement reconciliation.
 * Plus the password-recovery redirect hardening (no internal hostnames).
 *
 * Static/pure tests only — the native StoreKit path is validated on
 * TestFlight. Run alongside test-iap-v15.mjs / test-premium.mjs /
 * test-cloud-auth.mjs / test-auth-production.mjs.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
function ok(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}\n    ${err?.stack || err}`);
  }
}

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const iapSrc = read('src', 'services', 'iap.ts');
const hookSrc = read('src', 'hooks', 'useIAP.ts');
const premiumSrc = read('src', 'stores', 'usePremiumStore.ts');
const paywallSrc = read('app', 'paywall.tsx');
const proSrc = read('app', 'pro.tsx');
const forgotSrc = read('app', 'forgot-password.tsx');
const resetSrc = read('app', 'reset-password.tsx');
const redirectsSrc = read('src', 'lib', 'authRedirects.ts');
const translationsSrc = read('src', 'i18n', 'translations.ts');

const premiumExecutable = premiumSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const MONTHLY_ID = 'com.budgy.ch.budgy.monthly';
const ANNUAL_ID = 'com.budgy.ch.budgy.annual';

console.log('\n[test-iap-restore] Build 81 restore & recovery contract\n');

// ── 1. Restore performs a REAL Apple sync before concluding ──────────────
ok('restore syncs StoreKit (AppStore.sync) before reading purchases', () => {
  assert.match(iapSrc, /RNIap\.syncIOS\s*\(\)/);
  const fnStart = iapSrc.indexOf('async function syncNativeTransactions');
  assert.ok(fnStart >= 0, 'syncNativeTransactions missing');
  const receiptsFn = iapSrc.indexOf('export async function getAvailableReceipts');
  const syncCall = iapSrc.indexOf('await syncNativeTransactions()', receiptsFn);
  const getCall = iapSrc.indexOf('RNIap.getAvailablePurchases()', receiptsFn);
  assert.ok(syncCall > receiptsFn && getCall > syncCall, 'sync must run before getAvailablePurchases');
});

ok('sync failure is non-fatal (cached entitlements still read)', () => {
  const fn = iapSrc.slice(
    iapSrc.indexOf('async function syncNativeTransactions'),
    iapSrc.indexOf('export async function getAvailableReceipts')
  );
  assert.match(fn, /catch/);
  assert.doesNotMatch(fn, /throw/);
});

ok('reconciliation requests syncFirst: true', () => {
  assert.match(hookSrc, /getAvailableReceipts\(\{\s*syncFirst:\s*true\s*\}\)/);
});

// ── 2. Reconciliation: Budgy SKUs only, backend-validated ────────────────
ok('reconciliation filters to Budgy subscription SKUs', () => {
  assert.match(hookSrc, /IAP_SKUS\.includes\(r\.productId\)/);
});

ok('active monthly AND annual restore map to the right plan', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  assert.ok(fn.length > 0, 'reconcileEntitlements missing');
  assert.match(fn, /IAP_PRODUCT_IDS\.annual\s*\?\s*'annual'\s*:\s*'monthly'/);
});

ok('Pro is confirmed ONLY after backend verdict.valid', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  const validIdx = fn.indexOf('if (verdict.valid)');
  const confirmIdx = fn.indexOf('confirmProAction(plan)');
  assert.ok(validIdx >= 0 && confirmIdx > validIdx, 'confirm must sit inside verdict.valid');
  const restoreCall = fn.indexOf('restoreOnBackend({');
  assert.ok(restoreCall >= 0 && restoreCall < validIdx, 'backend restore must run before confirm');
});

ok('no StoreKit receipt alone grants Pro (no confirm outside verdict.valid)', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  const confirms = [...fn.matchAll(/confirmProAction\(/g)];
  assert.equal(confirms.length, 1, 'exactly one confirm path expected in reconciliation');
});

ok('expired/refunded never downgrades a freshly restored active subscription', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  assert.match(fn, /outcome\.restored === 0 && sawInactive/);
});

// ── 3. finishTransaction placement (Task E) ──────────────────────────────
ok('restored transactions are finished AFTER backend confirmation', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  const confirmIdx = fn.indexOf('confirmProAction(plan)');
  const finishIdx = fn.indexOf('await finishTransaction(receipt)', confirmIdx);
  assert.ok(finishIdx > confirmIdx, 'finishTransaction must follow the confirmed entitlement');
});

ok('endIap still removes listeners and closes the connection', () => {
  assert.match(iapSrc, /export async function endIap/);
  assert.match(iapSrc, /removeListeners\(\)/);
  assert.match(iapSrc, /RNIap\.endConnection/);
});

// ── 4. Already-owned recovery (Task D) ───────────────────────────────────
ok('already-owned detector exists and excludes user cancellation', () => {
  const fn = iapSrc.slice(
    iapSrc.indexOf('export function isAlreadyOwnedError'),
    iapSrc.indexOf('async function syncNativeTransactions')
  );
  assert.match(fn, /'already-owned'/);
  assert.match(fn, /'e_already_owned'/);
  assert.match(fn, /already owned/);
  assert.match(fn, /user-cancelled[\s\S]*return false/);
});

ok('purchase catch routes already-owned into the shared reconciliation', () => {
  const catchIdx = hookSrc.indexOf('isAlreadyOwnedError(e)');
  assert.ok(catchIdx >= 0, 'already-owned handling missing in purchase');
  const reconcileIdx = hookSrc.indexOf('reconcileEntitlements(ownerId', catchIdx);
  assert.ok(reconcileIdx > catchIdx, 'reconciliation must run for already-owned');
});

ok('already-owned + valid entitlement returns a successful restore', () => {
  const block = hookSrc.slice(
    hookSrc.indexOf('isAlreadyOwnedError(e)'),
    hookSrc.indexOf("console.warn('[IAP] purchase failed'")
  );
  assert.match(block, /success:\s*true,\s*restored:\s*outcome\.restored/);
});

ok('already-owned + expired entitlement does NOT grant Pro', () => {
  const block = hookSrc.slice(
    hookSrc.indexOf('isAlreadyOwnedError(e)'),
    hookSrc.indexOf("console.warn('[IAP] purchase failed'")
  );
  const expiredIdx = block.indexOf("outcome.lastState === 'EXPIRED'");
  assert.ok(expiredIdx >= 0);
  assert.match(block.slice(expiredIdx), /success:\s*false/);
});

ok('already-owned recovery never re-enters purchase (no loop)', () => {
  const block = hookSrc.slice(
    hookSrc.indexOf('isAlreadyOwnedError(e)'),
    hookSrc.indexOf("console.warn('[IAP] purchase failed'")
  );
  assert.doesNotMatch(block, /requestSubscription\(/);
  assert.doesNotMatch(block, /iap\.purchase\(/);
});

ok('user cancellation resolves silently, never as already-owned', () => {
  assert.match(iapSrc, /code === 'user-cancelled' \|\| code === 'e_user_cancelled'/);
  assert.match(hookSrc, /cancelled:\s*true/);
});

// ── 5. Auth preflight preserved (Build 79/80) ────────────────────────────
ok('purchase still auth-preflights BEFORE opening StoreKit', () => {
  const purchaseIdx = hookSrc.indexOf('const purchase = useCallback');
  const authIdx = hookSrc.indexOf('await getIapAuthenticatedUserId()', purchaseIdx);
  const skIdx = hookSrc.indexOf('await requestSubscription(', purchaseIdx);
  assert.ok(authIdx > purchaseIdx && skIdx > authIdx);
});

ok('restore still auth-preflights before reconciliation', () => {
  const restoreIdx = hookSrc.indexOf('const restore = useCallback');
  const authIdx = hookSrc.indexOf('await getIapAuthenticatedUserId()', restoreIdx);
  const reconcileIdx = hookSrc.indexOf('reconcileEntitlements(userId', restoreIdx);
  assert.ok(authIdx > restoreIdx && reconcileIdx > authIdx);
});

ok('service-level requestSubscription keeps its own auth guard', () => {
  const idx = iapSrc.indexOf('export async function requestSubscription');
  const guard = iapSrc.indexOf("authError.code = 'auth_required'", idx);
  const request = iapSrc.indexOf('await RNIap.requestPurchase(request)', idx);
  assert.ok(guard > idx && request > guard);
});

// ── 6. Premium security preserved (Task F) ───────────────────────────────
ok('startTrial stays a NO-OP (no local Premium bypass)', () => {
  const start = premiumExecutable.indexOf('startTrial: () => {');
  const end = premiumExecutable.indexOf('purchase: (_plan: Plan) =>', start);
  const block = premiumExecutable.slice(start, end);
  assert.ok(start >= 0);
  assert.doesNotMatch(block, /isPro\s*:\s*true/);
  assert.doesNotMatch(block, /provisionalProUntil\s*:/);
});

ok('only confirmPro executable block sets isPro=true', () => {
  const matches = [...premiumExecutable.matchAll(/isPro:\s*true/g)];
  assert.equal(matches.length, 1);
});

ok('auth failures are never provisional-eligible', () => {
  const purchaseIdx = hookSrc.indexOf('const purchase = useCallback');
  const block = hookSrc.slice(
    hookSrc.indexOf("if (verdict.error === 'auth_required')", purchaseIdx),
    hookSrc.indexOf('if (verdict.not_configured)', purchaseIdx)
  );
  assert.ok(block.length > 0);
  assert.doesNotMatch(block, /grantProvisional/);
});

ok('provisional path was not broadened (still transient-only)', () => {
  const grants = [...hookSrc.matchAll(/grantProvisional\(/g)];
  assert.equal(grants.length, 2, 'exactly two bounded provisional paths (not_configured + transient)');
});

// ── 7. UX: no raw technical strings in production UI ─────────────────────
ok('raw internal errors never reach purchase/restore alerts', () => {
  for (const uiSrc of [paywallSrc, proSrc]) {
    assert.doesNotMatch(uiSrc, /missing_token/);
    assert.doesNotMatch(uiSrc, /Item already owned/i);
    assert.doesNotMatch(uiSrc, /transaction_not_found/);
    assert.doesNotMatch(uiSrc, /supabase_config_missing/);
  }
  // hook returns localized copy, not e?.message, on purchase failure
  assert.doesNotMatch(hookSrc, /:\s*e\?\.message \|\| t\('iapErrors\.purchaseFailed'\)/);
});

ok('pro screen uses existing iap.* translation keys (no dead paywall.* keys)', () => {
  assert.doesNotMatch(proSrc, /t\('paywall\.restore/);
  assert.match(proSrc, /t\('iap\.restoreNoneTitle'\)/);
});

ok('localized restore copy matches the approved FR wording', () => {
  assert.ok(translationsSrc.includes("restoreDoneTitle: 'Abonnement restauré'"));
  assert.ok(
    translationsSrc.includes(
      "restoreDoneBody: 'Votre abonnement Budgy Pro a été restauré avec succès.'"
    )
  );
  assert.ok(
    translationsSrc.includes(
      "restoreNoneBody: 'Aucun abonnement Budgy actif n\\'a été trouvé sur ce compte Apple.'"
    )
  );
  assert.ok(translationsSrc.includes("buyFailedTitle: 'Achat impossible'"));
  assert.ok(
    translationsSrc.includes(
      "buyFailedBody: 'Une erreur est survenue avec l\\'App Store. Veuillez réessayer.'"
    )
  );
});

ok('paywall shows the restore confirmation when purchase recovers ownership', () => {
  assert.match(paywallSrc, /res\.restored ?\?\? 0\) > 0|\(res\.restored \?\? 0\) > 0/);
  assert.match(paywallSrc, /iap\.restoreDoneTitle/);
});

// ── 8. Product IDs stay exact ────────────────────────────────────────────
ok('product IDs remain exact', () => {
  assert.ok(iapSrc.includes(`monthly: '${MONTHLY_ID}'`));
  assert.ok(iapSrc.includes(`annual: '${ANNUAL_ID}'`));
});

// ── 9. Password recovery redirect (Task A) ───────────────────────────────
ok('password reset uses the centralized public redirect helper', () => {
  assert.match(forgotSrc, /getPasswordResetRedirectUrl\(\)/);
  assert.doesNotMatch(forgotSrc, /Linking\.createURL/);
});

ok('production redirect is the public budgy:// deep link', () => {
  assert.ok(redirectsSrc.includes("PASSWORD_RESET_REDIRECT = `budgy://${PASSWORD_RESET_PATH}`"));
  assert.ok(redirectsSrc.includes("PASSWORD_RESET_PATH = 'reset-password'"));
});

ok('recovery redirect can never contain an internal hostname', () => {
  for (const bad of ['supabase-kong', 'kong:8000', 'localhost', '127.0.0.1']) {
    assert.ok(redirectsSrc.includes(`'${bad}'`), `guard for ${bad} missing`);
  }
  assert.match(redirectsSrc, /if \(!__DEV__\) return PASSWORD_RESET_REDIRECT/);
});

ok('reset screen handles PKCE + implicit recovery and updates the password', () => {
  assert.match(resetSrc, /exchangeCodeForSession/);
  assert.match(resetSrc, /setSession/);
  assert.match(resetSrc, /updateUser\(\{ password: pwd \}\)/);
});

ok('recovery tokens are never logged', () => {
  for (const src of [resetSrc, forgotSrc, redirectsSrc]) {
    assert.doesNotMatch(src, /console\.(log|warn|error)\([^)]*access_token/);
    assert.doesNotMatch(src, /console\.(log|warn|error)\([^)]*refresh_token/);
  }
});

// ── 10. Diagnostics stay token-free ──────────────────────────────────────
ok('reconciliation diagnostics log product IDs only (dev-gated)', () => {
  const fn = hookSrc.slice(
    hookSrc.indexOf('async function reconcileEntitlements'),
    hookSrc.indexOf('export function useIAP')
  );
  assert.match(fn, /if \(__DEV__\)/);
  assert.doesNotMatch(fn, /transactionReceipt/);
  assert.doesNotMatch(fn, /jwsRepresentation/i);
});

console.log(`\n[test-iap-restore] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
