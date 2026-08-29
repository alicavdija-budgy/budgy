#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 78 — Premium entitlement contract test.
 *
 * Validates the security contract of `src/stores/usePremiumStore.ts`:
 * - legacy purchase/startTrial helpers never grant Pro;
 * - only backend-confirmed state can set isPro=true;
 * - local trial timestamps never unlock Pro;
 * - account switching never leaks entitlements;
 * - provisional access remains bounded to a StoreKit-pending transaction.
 *
 * Run: `node scripts/test-premium.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_USAGE = {
  ai: 0, tax: 0, export: 0, cloud: 0,
  invoices: 0, recurring: 0, analytics: 0,
  predict: 0, investments: 0,
};

function initialState() {
  return {
    isPro: false,
    plan: null,
    trialStartedAt: null,
    trialEndsAt: null,
    subscriptionStartedAt: null,
    ownerUserId: null,
    provisionalProUntil: null,
    pendingValidation: null,
    installedAt: Date.now(),
    transactionCount: 0,
    budgetCount: 0,
    lastPaywallShownAt: null,
    paywallSeenCount: 0,
    dismissedCount: 0,
    featureUsage: { ...DEFAULT_USAGE },
  };
}

const actions = {
  // Build 78: legacy helper is intentionally a NO-OP.
  purchase(s, _plan) {
    return { ...s };
  },
  confirmPro(s, plan) {
    return {
      ...s,
      isPro: true,
      plan,
      subscriptionStartedAt: Date.now(),
      trialStartedAt: null,
      trialEndsAt: null,
      provisionalProUntil: null,
      pendingValidation: null,
    };
  },
  cancel(s) {
    return {
      ...s,
      isPro: false,
      plan: null,
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionStartedAt: null,
      provisionalProUntil: null,
      pendingValidation: null,
    };
  },
  resetForUserChange(s) {
    return {
      ...s,
      isPro: false,
      plan: null,
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionStartedAt: null,
      provisionalProUntil: null,
      pendingValidation: null,
      ownerUserId: null,
      featureUsage: { ...DEFAULT_USAGE },
    };
  },
  attachToUser(s, userId) {
    if (s.ownerUserId && userId && s.ownerUserId !== userId) {
      return {
        ...s,
        isPro: false,
        plan: null,
        trialStartedAt: null,
        trialEndsAt: null,
        subscriptionStartedAt: null,
        provisionalProUntil: null,
        pendingValidation: null,
        featureUsage: { ...DEFAULT_USAGE },
        ownerUserId: userId,
      };
    }
    return { ...s, ownerUserId: userId };
  },
  hasPremiumAccess(s) {
    if (s.isPro) return true;
    if (s.provisionalProUntil && s.provisionalProUntil > Date.now()) return true;
    return false;
  },
};

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function assert(name, cond, detail = '') {
  if (cond) {
    PASS++;
    console.log(`  ✅ ${name}`);
  } else {
    FAIL++;
    FAILURES.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function scenario(title, fn) {
  console.log(`\n▶ ${title}`);
  fn();
}

scenario('A. Backend-confirmed Pro → nouveau compte FREE', () => {
  let s = initialState();
  s = actions.confirmPro(s, 'annual');
  s = actions.attachToUser(s, 'user_A');
  assert('user_A is Pro after backend confirmation', s.isPro && s.ownerUserId === 'user_A');

  s = actions.attachToUser(s, 'user_B');
  assert('user_B does NOT inherit Pro', !s.isPro);
  assert('user_B does NOT have plan', s.plan === null);
  assert('user_B has clean quotas', s.featureUsage.ai === 0);
  assert('ownerUserId is now user_B', s.ownerUserId === 'user_B');
  assert('hasPremiumAccess() = false on user_B', !actions.hasPremiumAccess(s));
});

scenario('B. Legacy purchase() cannot unlock demo or production', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'demo_user');
  s = actions.purchase(s, 'annual');
  assert('purchase() leaves isPro=false', !s.isPro);
  assert('purchase() leaves plan unchanged', s.plan === null);
  assert('purchase() does not create access', !actions.hasPremiumAccess(s));
});

scenario('C. Backend FREE → local Pro removed', () => {
  let s = initialState();
  s = actions.confirmPro(s, 'monthly');
  s = actions.attachToUser(s, 'user_C');
  assert('user_C is Pro', s.isPro);
  s = actions.cancel(s);
  assert('backend FREE clears local Pro', !s.isPro);
});

scenario('D. Backend EXPIRED → FREE', () => {
  let s = initialState();
  s = actions.confirmPro(s, 'annual');
  s = actions.attachToUser(s, 'user_D');
  s = actions.cancel(s);
  assert('EXPIRED clears Pro', !s.isPro);
  assert('EXPIRED clears plan', s.plan === null);
});

scenario('E. Backend PRO valid → local becomes Pro', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_E');
  assert('user_E is FREE initially', !s.isPro);
  s = actions.confirmPro(s, 'annual');
  assert('user_E is now PRO', s.isPro);
  assert('user_E plan is annual', s.plan === 'annual');
});

scenario('F. Compte A PRO → logout → compte B jamais Pro', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_A');
  s = actions.confirmPro(s, 'annual');
  assert('user_A is PRO', s.isPro);

  s = actions.resetForUserChange(s);
  assert('after logout: no owner', s.ownerUserId === null);
  assert('after logout: not Pro', !s.isPro);

  s = actions.attachToUser(s, 'user_B');
  assert('user_B is FREE', !s.isPro);
  assert('user_B has no plan', s.plan === null);
  assert('user_B ownerUserId set', s.ownerUserId === 'user_B');
  assert('user_B hasPremiumAccess=false', !actions.hasPremiumAccess(s));
});

scenario('G. StoreKit provisional entitlement stays scoped to SAME user', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_G');
  s = {
    ...s,
    plan: 'monthly',
    provisionalProUntil: Date.now() + 48 * 3600 * 1000,
    pendingValidation: { transactionId: 'tx1', productId: 'monthly', queuedAt: Date.now() },
  };
  s = actions.attachToUser(s, 'user_G');
  assert('provisional survives same-user attach', s.provisionalProUntil !== null);
  assert('pendingValidation preserved', s.pendingValidation !== null);
  assert('hasPremiumAccess = true while StoreKit validation is pending', actions.hasPremiumAccess(s));
});

scenario('H. Provisional entitlement is WIPED on user switch', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_H1');
  s = {
    ...s,
    plan: 'annual',
    provisionalProUntil: Date.now() + 48 * 3600 * 1000,
    pendingValidation: { transactionId: 'tx2', productId: 'annual', queuedAt: Date.now() },
  };
  assert('user_H1 has provisional access', actions.hasPremiumAccess(s));

  s = actions.attachToUser(s, 'user_H2');
  assert('user_H2 has NO provisional access', !actions.hasPremiumAccess(s));
  assert('user_H2 provisionalProUntil cleared', s.provisionalProUntil === null);
  assert('user_H2 pendingValidation cleared', s.pendingValidation === null);
});

scenario('I. Local trial timestamps NEVER grant Premium', () => {
  let s = initialState();
  s = {
    ...s,
    trialStartedAt: Date.now() - 1000,
    trialEndsAt: Date.now() + 7 * 24 * 3600 * 1000,
  };
  assert('legacy local trial does not set isPro', !s.isPro);
  assert('legacy local trial does not grant access', !actions.hasPremiumAccess(s));
});

scenario('J. Demo FREE → logout → real user stays FREE', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'demo_user');
  assert('demo_user is FREE', !s.isPro);
  s = actions.resetForUserChange(s);
  s = actions.attachToUser(s, 'user_real');
  assert('real user is FREE', !s.isPro);
  assert('real user has no plan', s.plan === null);
});

scenario('K. auth.tsx contains no premium grant path', () => {
  const authFile = path.join(__dirname, '..', 'app', 'auth.tsx');
  const src = fs.readFileSync(authFile, 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const banned = [
    { pattern: /premium\.purchase\s*\(/, name: 'premium.purchase(' },
    { pattern: /\.confirmPro\s*\(/, name: '.confirmPro(' },
    { pattern: /\.grantProvisionalPro\s*\(/, name: '.grantProvisionalPro(' },
    { pattern: /setPro\s*\(\s*true\s*\)/, name: 'setPro(true)' },
    { pattern: /isPro\s*:\s*true/, name: 'isPro: true (literal)' },
  ];

  for (const b of banned) {
    const found = b.pattern.test(stripped);
    assert(`auth.tsx has no ${b.name}`, !found, found ? `found forbidden token ${b.name}` : '');
  }
});

scenario('L. Store source enforces backend-first local helpers', () => {
  const storeFile = path.join(__dirname, '..', 'src', 'stores', 'usePremiumStore.ts');
  const src = fs.readFileSync(storeFile, 'utf8');

  const purchaseStart = src.indexOf('purchase: (_plan: Plan) =>');
  const provisionalStart = src.indexOf('grantProvisionalPro:', purchaseStart);
  const purchaseBlock = src.slice(purchaseStart, provisionalStart);
  assert('legacy purchase() exists as compatibility NO-OP', purchaseStart >= 0);
  assert('legacy purchase() block cannot set isPro=true', !/isPro\s*:\s*true/.test(purchaseBlock));

  const accessStart = src.indexOf('hasPremiumAccess: () =>');
  const accessEnd = src.indexOf('canUseFeature:', accessStart);
  const accessBlock = src.slice(accessStart, accessEnd);
  assert('hasPremiumAccess ignores local trialEndsAt', !/trialEndsAt/.test(accessBlock));

  assert('persist security migration is version 3', /version:\s*3/.test(src));
  assert('migration resets persisted isPro', /migrate:[\s\S]*isPro:\s*false/.test(src));
});

console.log('\n' + '─'.repeat(60));
console.log(`Premium contract tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All premium contract tests PASS');
process.exit(0);
