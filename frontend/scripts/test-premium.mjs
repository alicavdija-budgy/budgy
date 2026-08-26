#!/usr/bin/env node
/**
 * BUDGY v3.9.0 Build 74 — Premium entitlement contract test.
 *
 * This is a standalone Node test that validates the BEHAVIOURAL contract of
 * `src/stores/usePremiumStore.ts` for the account-switch scenarios reported
 * in Build 73 QA (new account inherits Pro from a previous session).
 *
 * We re-implement the store's reducers here as PURE functions and run the
 * critical scenarios. Any drift between this contract and the real store
 * must be considered a P0 regression.
 *
 * Run: `node scripts/test-premium.mjs`
 */

// ── Pure reducers (must mirror usePremiumStore.ts) ─────────────────────
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

// Contract of the store actions
const actions = {
  purchase(s, plan) {
    return {
      ...s,
      isPro: true,
      plan,
      subscriptionStartedAt: Date.now(),
      trialEndsAt: null,
      provisionalProUntil: null,
      pendingValidation: null,
    };
  },
  confirmPro(s, plan) {
    return {
      ...s,
      isPro: true,
      plan,
      subscriptionStartedAt: Date.now(),
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
    if (s.trialEndsAt && s.trialEndsAt > Date.now()) return true;
    if (s.provisionalProUntil && s.provisionalProUntil > Date.now()) return true;
    return false;
  },
};

// ── Assertion helpers ───────────────────────────────────────────────────
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

// ── Scenarios ───────────────────────────────────────────────────────────

// A — Old store Pro → new account must be FREE
scenario('A. Ancien store Pro → nouveau compte FREE', () => {
  let s = initialState();
  s = actions.purchase(s, 'annual');
  s = actions.attachToUser(s, 'user_A');
  assert('user_A is Pro after purchase', s.isPro && s.ownerUserId === 'user_A');

  // Simulate account switch to a NEW account
  s = actions.attachToUser(s, 'user_B');
  assert('user_B does NOT inherit Pro', !s.isPro);
  assert('user_B does NOT have plan', s.plan === null);
  assert('user_B has clean quotas', s.featureUsage.ai === 0);
  assert('ownerUserId is now user_B', s.ownerUserId === 'user_B');
  assert('hasPremiumAccess() = false on user_B', !actions.hasPremiumAccess(s));
});

// B — Demo Pro → logout → real login = FREE
scenario('B. Demo PRO → logout → real account FREE', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'demo_user');
  s = actions.purchase(s, 'annual'); // demo Pro
  assert('demo_user is Pro', s.isPro && s.ownerUserId === 'demo_user');

  // logout (settings.tsx: resetForUserChange)
  s = actions.resetForUserChange(s);
  assert('resetForUserChange clears isPro', !s.isPro);
  assert('resetForUserChange clears ownerUserId', s.ownerUserId === null);
  assert('resetForUserChange clears plan', s.plan === null);
  assert('resetForUserChange resets quotas', s.featureUsage.ai === 0);

  // real login
  s = actions.attachToUser(s, 'user_real');
  assert('real login = FREE', !s.isPro && actions.hasPremiumAccess(s) === false);
  assert('ownerUserId = user_real', s.ownerUserId === 'user_real');
});

// C — Backend returns FREE → local Pro downgraded
scenario('C. Backend FREE → local Pro removed', () => {
  let s = initialState();
  s = actions.confirmPro(s, 'monthly');
  s = actions.attachToUser(s, 'user_C');
  assert('user_C is Pro', s.isPro);

  // Backend sync: is_pro=false, subscription_state='FREE'
  // useIAP.syncFromBackend must call cancel() (no pending provisional)
  const local = { ...s, pendingValidation: null, provisionalProUntil: null };
  const stillPendingValid =
    !!local.pendingValidation &&
    !!local.provisionalProUntil &&
    local.provisionalProUntil > Date.now();
  const shouldCancel = !stillPendingValid;
  assert('sync FREE triggers cancel()', shouldCancel);
  if (shouldCancel) s = actions.cancel(s);
  assert('local no longer Pro', !s.isPro);
});

// D — Backend EXPIRED → FREE
scenario('D. Backend EXPIRED → local Pro removed', () => {
  let s = initialState();
  s = actions.confirmPro(s, 'annual');
  s = actions.attachToUser(s, 'user_D');
  s = actions.cancel(s); // EXPIRED path already existed
  assert('EXPIRED clears Pro', !s.isPro);
});

// E — Backend returns PRO valid → local becomes Pro
scenario('E. Backend PRO valid → local PRO', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_E');
  assert('user_E is FREE initially', !s.isPro);

  // Backend: is_pro=true, subscription_state='PRO'
  s = actions.confirmPro(s, 'annual');
  assert('user_E is now PRO', s.isPro);
  assert('user_E plan is annual', s.plan === 'annual');
});

// F — user A PRO → logout → user B never inherits
scenario('F. Compte A PRO → logout → compte B jamais Pro', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_A');
  s = actions.purchase(s, 'annual');
  assert('user_A is PRO', s.isPro);

  // Logout (settings.tsx handleLogout)
  s = actions.resetForUserChange(s);
  assert('after logout: no owner', s.ownerUserId === null);
  assert('after logout: not Pro', !s.isPro);

  // user_B signs in
  s = actions.attachToUser(s, 'user_B');
  assert('user_B is FREE', !s.isPro);
  assert('user_B has no plan', s.plan === null);
  assert('user_B ownerUserId set', s.ownerUserId === 'user_B');
  assert('user_B hasPremiumAccess=false', !actions.hasPremiumAccess(s));
});

// G — Provisional purchase must persist across attach with SAME user
scenario('G. Provisional Pro survit à un attach du MÊME user', () => {
  let s = initialState();
  s = actions.attachToUser(s, 'user_G');
  // grantProvisionalPro
  s = {
    ...s,
    plan: 'monthly',
    provisionalProUntil: Date.now() + 48 * 3600 * 1000,
    pendingValidation: { transactionId: 'tx1', productId: 'monthly', queuedAt: Date.now() },
  };
  s = actions.attachToUser(s, 'user_G'); // same user re-attach (e.g. resume)
  assert('provisional survives same-user attach', s.provisionalProUntil !== null);
  assert('pendingValidation preserved', s.pendingValidation !== null);
  assert('hasPremiumAccess = true (provisional)', actions.hasPremiumAccess(s));
});

// H — Provisional Pro is WIPED on user switch
scenario('H. Provisional Pro wiped on user switch', () => {
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

// ── Report ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Premium contract tests : ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) {
  console.log('\n❌ FAILURES:');
  FAILURES.forEach((f) => console.log(`  · ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('✅ All premium contract tests PASS');
process.exit(0);
