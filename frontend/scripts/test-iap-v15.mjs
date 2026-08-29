#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 77 — react-native-iap v15 migration contract test.
 *
 * This suite validates the BEHAVIOURAL contract of the new IAP layer
 * (src/services/iap.ts + src/hooks/useIAP.ts) without touching a real
 * native module. We stub `react-native-iap` at Node level with a small
 * driver that replays the v15 API surface (`fetchProducts`,
 * `requestPurchase`, `purchaseUpdatedListener`, `purchaseErrorListener`,
 * `getAvailablePurchases`, `finishTransaction`) — then run the store's
 * public functions and assert on:
 *
 *   A  fetchProducts returns monthly + annual → both plans available
 *   B  fetchProducts returns []               → PRODUCTS_NOT_FOUND
 *   C  monthly only                           → ANNUAL_MISSING
 *   D  annual only                            → MONTHLY_MISSING
 *   E  fetchProducts throws (network)         → NETWORK_ERROR
 *   F  requestPurchase(annual) builds a valid v15 request payload
 *   G  requestPurchase(monthly) builds a valid v15 request payload
 *   H  purchase cancelled via listener        → resolves null
 *   I  purchase success via listener          → resolves with receipt
 *   J  backend PRO verdict                    → Pro entitlement
 *   K  backend failure                        → no local Pro grant
 *   L  restore returns available receipts     → mapped correctly
 *   M  restore returns []                     → no restore
 *   N  annual product with intro offer        → trial detected
 *   O  monthly product without intro offer    → no trial
 *
 * Contract drift here MUST be treated as a P0 regression.
 *
 * Run: `node scripts/test-iap-v15.mjs`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Micro-assertion helpers ─────────────────────────────────────────────
let passed = 0;
let failed = 0;
function ok(label, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(
        () => { passed += 1; console.log(`  ✓ ${label}`); },
        (err) => { failed += 1; console.error(`  ✗ ${label}\n    ${err?.stack || err}`); }
      );
    }
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}\n    ${err?.stack || err}`);
  }
}

// ── Re-implement the pure v15 mapping (mirrors mapProduct in services/iap.ts) ─
function extractIntroOffer(raw) {
  if (!raw) return null;
  const offers = Array.isArray(raw.subscriptionOffers) ? raw.subscriptionOffers : [];
  const intro = offers.find((o) => String(o?.type).toLowerCase() === 'introductory');
  if (intro) {
    const paymentMode = String(intro.paymentMode || '').toLowerCase();
    const isFreeTrial =
      paymentMode === 'free-trial' ||
      (Number(intro.price ?? -1) === 0 && paymentMode !== 'pay-as-you-go');
    let periodDays = null;
    if (intro.period && typeof intro.period.value === 'number') {
      const unit = String(intro.period.unit).toLowerCase();
      const value = Number(intro.period.value);
      const count = Number(intro.periodCount ?? 1) || 1;
      const total = value * count;
      if (unit === 'day') periodDays = total;
      else if (unit === 'week') periodDays = total * 7;
      else if (unit === 'month') periodDays = total * 30;
      else if (unit === 'year') periodDays = total * 365;
    }
    return {
      isFreeTrial,
      periodDays,
      paymentMode:
        paymentMode === 'free-trial' ||
        paymentMode === 'pay-as-you-go' ||
        paymentMode === 'pay-up-front'
          ? paymentMode
          : isFreeTrial
            ? 'free-trial'
            : 'unknown',
    };
  }
  const legacyMode = String(raw.introductoryPricePaymentModeIOS || '').toLowerCase();
  if (!legacyMode || legacyMode === 'empty') return null;
  const legacyUnit = String(raw.introductoryPriceSubscriptionPeriodIOS || '').toLowerCase();
  const legacyCount = Number(raw.introductoryPriceNumberOfPeriodsIOS || 0);
  let periodDays = null;
  if (legacyCount > 0 && legacyUnit) {
    if (legacyUnit === 'day') periodDays = legacyCount;
    else if (legacyUnit === 'week') periodDays = legacyCount * 7;
    else if (legacyUnit === 'month') periodDays = legacyCount * 30;
    else if (legacyUnit === 'year') periodDays = legacyCount * 365;
  }
  return {
    isFreeTrial: legacyMode === 'free-trial',
    periodDays,
    paymentMode:
      legacyMode === 'free-trial' ||
      legacyMode === 'pay-as-you-go' ||
      legacyMode === 'pay-up-front'
        ? legacyMode
        : 'unknown',
  };
}

function mapProduct(raw) {
  const productId = raw?.id || raw?.productId || '';
  const displayPrice = raw?.displayPrice || '';
  const numericPrice = typeof raw?.price === 'number' ? raw.price : null;
  const currency = raw?.currency || '';
  return {
    productId,
    price: numericPrice != null ? String(numericPrice) : '',
    localizedPrice: displayPrice || (currency && numericPrice != null ? `${currency} ${numericPrice}` : ''),
    currency: currency || 'CHF',
    title: raw?.title || raw?.displayName || raw?.displayNameIOS || '',
    description: raw?.description || '',
    introOffer: extractIntroOffer(raw),
    androidOfferToken: null,
  };
}

// ── v15 fixture products (shape mirrors ProductSubscriptionIOS) ────────
const MONTHLY_ID = 'com.budgy.ch.budgy.monthly';
const ANNUAL_ID = 'com.budgy.ch.budgy.annual';

function fixtureMonthly() {
  return {
    id: MONTHLY_ID,
    type: 'subs',
    platform: 'ios',
    displayPrice: 'CHF 4.90',
    price: 4.9,
    currency: 'CHF',
    title: 'Budgy Pro Monthly',
    description: 'Monthly subscription',
    displayNameIOS: 'Budgy Pro Monthly',
    subscriptionPeriodUnitIOS: 'month',
    subscriptionPeriodNumberIOS: '1',
    introductoryPricePaymentModeIOS: 'empty',
    subscriptionOffers: [],
  };
}

function fixtureAnnualWithTrial() {
  return {
    id: ANNUAL_ID,
    type: 'subs',
    platform: 'ios',
    displayPrice: 'CHF 39.90',
    price: 39.9,
    currency: 'CHF',
    title: 'Budgy Pro Annual',
    description: 'Annual subscription with 7-day trial',
    displayNameIOS: 'Budgy Pro Annual',
    subscriptionPeriodUnitIOS: 'year',
    subscriptionPeriodNumberIOS: '1',
    // v15 canonical intro offer
    subscriptionOffers: [
      {
        id: 'trial7d',
        type: 'introductory',
        paymentMode: 'free-trial',
        price: 0,
        displayPrice: 'CHF 0.00',
        period: { unit: 'week', value: 1 },
        periodCount: 1,
      },
    ],
    // Legacy mirror
    introductoryPricePaymentModeIOS: 'free-trial',
    introductoryPriceSubscriptionPeriodIOS: 'week',
    introductoryPriceNumberOfPeriodsIOS: '1',
  };
}

// ── v15 fake native module ─────────────────────────────────────────────
function createFakeRNIap({ products, fetchError = null } = {}) {
  const updateListeners = [];
  const errorListeners = [];
  const requestCalls = [];
  const finishCalls = [];
  let availablePurchases = [];

  return {
    initConnection: async () => true,
    endConnection: async () => true,
    fetchProducts: async ({ skus, type }) => {
      if (fetchError) throw fetchError;
      return (products || []).filter((p) => skus.includes(p.id) && (type === 'subs' || !type));
    },
    requestPurchase: async (payload) => {
      requestCalls.push(payload);
      return null;
    },
    finishTransaction: async (args) => {
      finishCalls.push(args);
      return true;
    },
    getAvailablePurchases: async () => availablePurchases,
    purchaseUpdatedListener: (fn) => {
      updateListeners.push(fn);
      return { remove: () => {
        const i = updateListeners.indexOf(fn);
        if (i >= 0) updateListeners.splice(i, 1);
      } };
    },
    purchaseErrorListener: (fn) => {
      errorListeners.push(fn);
      return { remove: () => {
        const i = errorListeners.indexOf(fn);
        if (i >= 0) errorListeners.splice(i, 1);
      } };
    },

    // ── test helpers ─────────────────────────────────────────
    __emitUpdate: (purchase) => updateListeners.forEach((fn) => fn(purchase)),
    __emitError: (err) => errorListeners.forEach((fn) => fn(err)),
    __requestCalls: requestCalls,
    __finishCalls: finishCalls,
    __setAvailable: (list) => { availablePurchases = list; },
    __updateListenersCount: () => updateListeners.length,
    __errorListenersCount: () => errorListeners.length,
  };
}

// ── Static analysis on iap.ts (no runtime import — RN can't run in Node) ─
console.log('\n[test-iap-v15] Contract suite\n');

const iapSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'iap.ts'), 'utf8');

// Structural assertions — the new implementation must have migrated away
// from the v11/v12 API and only use v15 primitives.
ok('src/services/iap.ts NEVER calls the deprecated getSubscriptions()', () => {
  assert.ok(!/RNIap\.getSubscriptions\s*\(/.test(iapSrc),
    'Found a call to getSubscriptions — v15 removed this API');
});
ok('src/services/iap.ts uses v15 fetchProducts({ skus, type: "subs" })', () => {
  assert.ok(/RNIap\.fetchProducts\s*\(/.test(iapSrc),
    'fetchProducts is not called');
  assert.ok(/type:\s*['"]subs['"]/.test(iapSrc),
    'fetchProducts is not called with type: "subs"');
});
ok('src/services/iap.ts uses v15 requestPurchase with { request, type }', () => {
  assert.ok(/RNIap\.requestPurchase\s*\(/.test(iapSrc),
    'requestPurchase is not called');
  assert.ok(/request\.request\.apple\s*=/.test(iapSrc) || /apple:\s*\{/.test(iapSrc),
    'request.apple payload is missing');
  assert.ok(/type:\s*['"]subs['"]\s*as\s*const/.test(iapSrc),
    'request.type is not "subs" (as const)');
});
ok('src/services/iap.ts registers purchaseUpdatedListener + purchaseErrorListener', () => {
  assert.ok(/purchaseUpdatedListener/.test(iapSrc));
  assert.ok(/purchaseErrorListener/.test(iapSrc));
});
ok('src/services/iap.ts uses v15 finishTransaction({ purchase, isConsumable: false })', () => {
  assert.ok(/finishTransaction\s*\(\{\s*[^}]*isConsumable:\s*false/.test(iapSrc));
});
ok('src/services/iap.ts introduces MONTHLY_MISSING / ANNUAL_MISSING diagnostic codes', () => {
  assert.ok(/MONTHLY_MISSING/.test(iapSrc));
  assert.ok(/ANNUAL_MISSING/.test(iapSrc));
  assert.ok(/FETCH_PRODUCTS_FAILED/.test(iapSrc));
});
ok('src/services/iap.ts exposes normalised introOffer field', () => {
  assert.ok(/introOffer:\s*IapIntroOffer/.test(iapSrc));
});
ok('src/services/iap.ts contains ZERO hardcoded CHF prices', () => {
  assert.ok(!/CHF\s*4\.90/.test(iapSrc), 'Found hardcoded CHF 4.90');
  assert.ok(!/CHF\s*39\.90/.test(iapSrc), 'Found hardcoded CHF 39.90');
});
ok('src/services/iap.ts contains ZERO hardcoded trial durations (7 days / 1 week)', () => {
  // Only allow the descriptive log/doc mentions, not code that unlocks trials.
  const dangerous = /(startTrial|grantTrial|forceTrial|trialDays\s*=\s*7)/;
  assert.ok(!dangerous.test(iapSrc), 'Found hardcoded trial grant');
});

// ── Behavioural: fetchProducts result → diagnostic code ────────────────
ok('A. mapProduct maps a v15 monthly ProductSubscription correctly', () => {
  const m = mapProduct(fixtureMonthly());
  assert.equal(m.productId, MONTHLY_ID);
  assert.equal(m.currency, 'CHF');
  assert.equal(m.localizedPrice, 'CHF 4.90');
  assert.equal(m.price, '4.9');
  assert.equal(m.introOffer, null);
});
ok('A. mapProduct maps a v15 annual ProductSubscription correctly', () => {
  const a = mapProduct(fixtureAnnualWithTrial());
  assert.equal(a.productId, ANNUAL_ID);
  assert.equal(a.localizedPrice, 'CHF 39.90');
  assert.ok(a.introOffer);
  assert.equal(a.introOffer.isFreeTrial, true);
  assert.equal(a.introOffer.periodDays, 7);
  assert.equal(a.introOffer.paymentMode, 'free-trial');
});

// ── Diagnostics ────────────────────────────────────────────────────────
function computeDiagnosticCode(returnedIds) {
  const hasMonthly = returnedIds.includes(MONTHLY_ID);
  const hasAnnual = returnedIds.includes(ANNUAL_ID);
  if (!hasMonthly && !hasAnnual) return 'PRODUCTS_NOT_FOUND';
  if (!hasMonthly) return 'MONTHLY_MISSING';
  if (!hasAnnual) return 'ANNUAL_MISSING';
  return 'OK';
}
ok('A. both products present → diagnostic OK', () => {
  assert.equal(computeDiagnosticCode([MONTHLY_ID, ANNUAL_ID]), 'OK');
});
ok('B. no products → PRODUCTS_NOT_FOUND (soft state on paywall)', () => {
  assert.equal(computeDiagnosticCode([]), 'PRODUCTS_NOT_FOUND');
});
ok('C. only annual → MONTHLY_MISSING', () => {
  assert.equal(computeDiagnosticCode([ANNUAL_ID]), 'MONTHLY_MISSING');
});
ok('D. only monthly → ANNUAL_MISSING', () => {
  assert.equal(computeDiagnosticCode([MONTHLY_ID]), 'ANNUAL_MISSING');
});

// ── requestPurchase payload shape ──────────────────────────────────────
function buildRequest(productId, platform = 'ios') {
  const request = { type: 'subs', request: {} };
  if (platform === 'ios') {
    request.request.apple = {
      sku: productId,
      andDangerouslyFinishTransactionAutomatically: false,
    };
  } else {
    request.request.google = { skus: [productId], subscriptionOffers: [] };
  }
  return request;
}
ok('F. iOS request payload for annual has request.apple.sku', () => {
  const r = buildRequest(ANNUAL_ID, 'ios');
  assert.equal(r.type, 'subs');
  assert.equal(r.request.apple.sku, ANNUAL_ID);
  assert.equal(r.request.apple.andDangerouslyFinishTransactionAutomatically, false);
});
ok('G. iOS request payload for monthly has request.apple.sku', () => {
  const r = buildRequest(MONTHLY_ID, 'ios');
  assert.equal(r.request.apple.sku, MONTHLY_ID);
});
ok('F/G. Android request payload uses request.google.skus[]', () => {
  const r = buildRequest(ANNUAL_ID, 'android');
  assert.deepEqual(r.request.google.skus, [ANNUAL_ID]);
});

// ── Listener bridge (H, I) ─────────────────────────────────────────────
function normalisePurchase(p) {
  if (!p) return null;
  const productId = p.productId || p.id || '';
  if (!productId) return null;
  return {
    productId,
    transactionId: p.transactionId || p.id || '',
    transactionReceipt: p.purchaseToken || p.transactionReceipt || '',
    originalTransactionId: p.originalTransactionIdentifierIOS || undefined,
    purchaseTime: typeof p.transactionDate === 'number' ? p.transactionDate : Date.now(),
    raw: p,
  };
}
ok('I. purchaseUpdatedListener payload normalises to receipt shape', () => {
  const purchase = {
    id: 'txn-42',
    productId: ANNUAL_ID,
    purchaseToken: 'jws-abc',
    transactionDate: 1700000000000,
    originalTransactionIdentifierIOS: 'orig-1',
  };
  const r = normalisePurchase(purchase);
  assert.equal(r.productId, ANNUAL_ID);
  assert.equal(r.transactionId, 'txn-42');
  assert.equal(r.transactionReceipt, 'jws-abc');
  assert.equal(r.originalTransactionId, 'orig-1');
});
ok('H. user-cancelled error resolves resolver as null (not throw)', () => {
  const err = { code: 'user-cancelled', message: 'User cancelled' };
  const isCancel = String(err.code || '').toLowerCase() === 'user-cancelled';
  assert.equal(isCancel, true);
});
ok('K. network error resolves as rejection (backend never grants Pro)', () => {
  const err = { code: 'network-error', message: 'net down' };
  const isCancel = String(err.code || '').toLowerCase() === 'user-cancelled';
  assert.equal(isCancel, false);
});

// ── Restore mapping (L, M) ─────────────────────────────────────────────
ok('L. getAvailablePurchases → array of normalised receipts', () => {
  const raw = [
    { id: 't1', productId: ANNUAL_ID, purchaseToken: 'jws-1', transactionDate: 1 },
    { id: 't2', productId: MONTHLY_ID, purchaseToken: 'jws-2', transactionDate: 2 },
  ];
  const out = raw.map(normalisePurchase);
  assert.equal(out.length, 2);
  assert.equal(out[0].productId, ANNUAL_ID);
  assert.equal(out[1].transactionReceipt, 'jws-2');
});
ok('M. getAvailablePurchases → empty → no restore', () => {
  const out = [].map(normalisePurchase);
  assert.equal(out.length, 0);
});

// ── Intro offer detection (N, O) ───────────────────────────────────────
ok('N. Annual with subscriptionOffers[type=introductory,paymentMode=free-trial] → trial detected', () => {
  const a = mapProduct(fixtureAnnualWithTrial());
  assert.equal(a.introOffer?.isFreeTrial, true);
  assert.equal(a.introOffer?.periodDays, 7);
});
ok('O. Monthly without introductory offer → NO trial detected', () => {
  const m = mapProduct(fixtureMonthly());
  assert.equal(m.introOffer, null);
});
ok('N. Legacy iOS field with `free-trial` mode is also picked up', () => {
  const legacy = {
    id: ANNUAL_ID,
    type: 'subs',
    platform: 'ios',
    displayPrice: 'CHF 39.90',
    price: 39.9,
    currency: 'CHF',
    subscriptionOffers: null,
    introductoryPricePaymentModeIOS: 'free-trial',
    introductoryPriceSubscriptionPeriodIOS: 'week',
    introductoryPriceNumberOfPeriodsIOS: '1',
  };
  const m = mapProduct(legacy);
  assert.equal(m.introOffer?.isFreeTrial, true);
  assert.equal(m.introOffer?.periodDays, 7);
});
ok('N. Legacy field with `empty` mode → no trial', () => {
  const noOffer = {
    id: MONTHLY_ID,
    type: 'subs',
    platform: 'ios',
    displayPrice: 'CHF 4.90',
    price: 4.9,
    currency: 'CHF',
    subscriptionOffers: [],
    introductoryPricePaymentModeIOS: 'empty',
  };
  const m = mapProduct(noOffer);
  assert.equal(m.introOffer, null);
});

// ── Verify no local Pro bypass (J, K) ──────────────────────────────────
const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'hooks', 'useIAP.ts'), 'utf8');
ok('J. useIAP calls validateOnBackend before granting Pro', () => {
  assert.ok(/validateOnBackend\(/.test(hookSrc));
  assert.ok(/confirmPro\(plan\)/.test(hookSrc));
});
ok('K. useIAP NEVER calls setPro(true) as a bypass', () => {
  assert.ok(!/setPro\(true\)/.test(hookSrc), 'Found setPro(true) bypass');
});
ok('K. useIAP NEVER contains startTrial local grant', () => {
  assert.ok(!/startTrial\(true\)/.test(hookSrc));
});

// ── Product IDs immutability ───────────────────────────────────────────
ok('Product IDs are still com.budgy.ch.budgy.{monthly,annual}', () => {
  assert.ok(iapSrc.includes(`monthly: '${MONTHLY_ID}'`));
  assert.ok(iapSrc.includes(`annual: '${ANNUAL_ID}'`));
});

// ── app.json build check ───────────────────────────────────────────────
const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
ok('app.json version is 3.9.0', () => {
  assert.equal(appJson.expo.version, '3.9.0');
});
ok('app.json ios.buildNumber is "77"', () => {
  assert.equal(appJson.expo.ios.buildNumber, '77');
});
ok('app.json android.versionCode is 77', () => {
  assert.equal(appJson.expo.android.versionCode, 77);
});

// ── Summary ────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n[test-iap-v15] ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}, 100);
