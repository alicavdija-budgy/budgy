#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 78 — react-native-iap v15 pre-build contract.
 *
 * Static/pure tests only: no native StoreKit is available in Node. Real
 * purchase/restore validation must still be done on TestFlight after build.
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

const MONTHLY_ID = 'com.budgy.ch.budgy.monthly';
const ANNUAL_ID = 'com.budgy.ch.budgy.annual';

const iapSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'iap.ts'), 'utf8');
const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'hooks', 'useIAP.ts'), 'utf8');
const premiumSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'stores', 'usePremiumStore.ts'), 'utf8');
const paywallSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'paywall.tsx'), 'utf8');
const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));

console.log('\n[test-iap-v15] Build 78 contract suite\n');

// ── Native v15 API contract ─────────────────────────────────────────────
ok('uses v15 fetchProducts()', () => {
  assert.match(iapSrc, /RNIap\.fetchProducts\s*\(/);
  assert.match(iapSrc, /type:\s*['"]subs['"]/);
});

ok('never calls removed getSubscriptions()', () => {
  assert.doesNotMatch(iapSrc, /RNIap\.getSubscriptions\s*\(/);
});

ok('uses v15 requestPurchase() Apple payload', () => {
  assert.match(iapSrc, /RNIap\.requestPurchase\s*\(/);
  assert.match(iapSrc, /request\.request\.apple\s*=/);
  assert.match(iapSrc, /sku:\s*productId/);
  assert.match(iapSrc, /andDangerouslyFinishTransactionAutomatically:\s*false/);
});

ok('registers purchase listeners', () => {
  assert.match(iapSrc, /purchaseUpdatedListener/);
  assert.match(iapSrc, /purchaseErrorListener/);
});

ok('finishes non-consumable transactions explicitly', () => {
  assert.match(iapSrc, /finishTransaction\s*\(\{/);
  assert.match(iapSrc, /isConsumable:\s*false/);
});

ok('restore uses getAvailablePurchases()', () => {
  assert.match(iapSrc, /getAvailablePurchases/);
});

ok('diagnostics cover missing products and fetch failures', () => {
  for (const code of ['PRODUCTS_NOT_FOUND', 'MONTHLY_MISSING', 'ANNUAL_MISSING', 'FETCH_PRODUCTS_FAILED']) {
    assert.ok(iapSrc.includes(code), `missing ${code}`);
  }
});

// ── Product / backend contract ──────────────────────────────────────────
ok('product IDs are canonical and unchanged', () => {
  assert.ok(iapSrc.includes(`monthly: '${MONTHLY_ID}'`));
  assert.ok(iapSrc.includes(`annual: '${ANNUAL_ID}'`));
});

ok('purchase flow validates on backend before confirmPro()', () => {
  const validateIndex = hookSrc.indexOf('validateOnBackend({');
  const confirmIndex = hookSrc.indexOf('confirmPro(plan)', validateIndex);
  assert.ok(validateIndex >= 0, 'validateOnBackend call missing');
  assert.ok(confirmIndex > validateIndex, 'confirmPro must happen after backend validation');
});

ok('restore flow is backend validated', () => {
  assert.match(hookSrc, /restoreOnBackend\s*\(/);
});

ok('boot sync uses backend subscription truth', () => {
  assert.match(hookSrc, /fetchSubscriptionFromBackend\s*\(/);
  assert.match(hookSrc, /remote\.is_pro/);
});

ok('no direct setPro(true) bypass exists in IAP hook', () => {
  assert.doesNotMatch(hookSrc, /setPro\s*\(\s*true\s*\)/);
});

// ── Premium store hardening ─────────────────────────────────────────────
ok('legacy purchase() is a NO-OP and cannot set isPro=true', () => {
  const start = premiumSrc.indexOf('purchase: (_plan: Plan) =>');
  const end = premiumSrc.indexOf('grantProvisionalPro:', start);
  assert.ok(start >= 0, 'hardened purchase helper missing');
  const block = premiumSrc.slice(start, end);
  assert.doesNotMatch(block, /isPro\s*:\s*true/);
});

ok('local trial timestamps cannot grant Premium access', () => {
  const start = premiumSrc.indexOf('hasPremiumAccess: () =>');
  const end = premiumSrc.indexOf('canUseFeature:', start);
  const block = premiumSrc.slice(start, end);
  assert.ok(start >= 0);
  assert.doesNotMatch(block, /trialEndsAt/);
});

ok('only confirmPro block sets isPro=true', () => {
  const matches = [...premiumSrc.matchAll(/isPro:\s*true/g)];
  assert.equal(matches.length, 1, `expected exactly one isPro:true, got ${matches.length}`);
  const confirmStart = premiumSrc.indexOf('confirmPro: (plan) =>');
  const confirmEnd = premiumSrc.indexOf('clearProvisional:', confirmStart);
  assert.ok(matches[0].index > confirmStart && matches[0].index < confirmEnd);
});

ok('persist migration clears legacy entitlement bits', () => {
  assert.match(premiumSrc, /version:\s*3/);
  assert.match(premiumSrc, /migrate:[\s\S]*isPro:\s*false/);
  assert.match(premiumSrc, /migrate:[\s\S]*trialEndsAt:\s*null/);
  assert.match(premiumSrc, /migrate:[\s\S]*pendingValidation:\s*null/);
});

// ── Paywall contract ────────────────────────────────────────────────────
ok('paywall purchase CTA routes through iap.purchase()', () => {
  assert.match(paywallSrc, /await\s+iap\.purchase\(selected\)/);
});

ok('paywall restore routes through iap.restore()', () => {
  assert.match(paywallSrc, /await\s+iap\.restore\(\)/);
});

ok('paywall has legal links', () => {
  assert.ok(paywallSrc.includes("https://budgy.ch/terms"));
  assert.ok(paywallSrc.includes("https://budgy.ch/privacy"));
});

ok('paywall has no hardcoded subscription CHF prices', () => {
  assert.doesNotMatch(paywallSrc, /CHF\s*4\.90/);
  assert.doesNotMatch(paywallSrc, /CHF\s*39\.90/);
});

// ── Expo native config / build identity ─────────────────────────────────
ok('app version is 3.9.0', () => {
  assert.equal(appJson.expo.version, '3.9.0');
});

ok('iOS buildNumber is 78', () => {
  assert.equal(appJson.expo.ios.buildNumber, '78');
});

ok('Android versionCode is 78', () => {
  assert.equal(appJson.expo.android.versionCode, 78);
});

ok('bundle/package IDs match Budgy production app', () => {
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.budgy.ch.budgy');
  assert.equal(appJson.expo.android.package, 'com.budgy.ch.budgy');
});

ok('Expo config includes react-native-iap plugin', () => {
  const names = (appJson.expo.plugins || []).map((p) => Array.isArray(p) ? p[0] : p);
  assert.ok(names.includes('react-native-iap'), 'react-native-iap config plugin missing');
});

console.log(`\n[test-iap-v15] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
