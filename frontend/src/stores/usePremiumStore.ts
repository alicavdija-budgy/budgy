/**
 * BUDGY - Premium / Subscription State
 * Tracks trial, subscription, usage triggers and PER-FEATURE quotas for paywall.
 *
 * Free Preview Mode:
 *   Chaque feature Pro a un quota gratuit d'essai (ex: 1 facture, 2 charges récurrentes,
 *   1 simulation fiscale, 1 analyse IA...). Une fois dépassé, le paywall s'active.
 *
 * MOCKED mode: works locally until RevenueCat keys are wired.
 * When RevenueCat is integrated, replace `startTrial` / `purchase` with real calls.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plan = 'monthly' | 'annual';

export type ProFeature =
  | 'ai'
  | 'tax'
  | 'export'
  | 'cloud'
  | 'invoices'
  | 'recurring'
  | 'analytics'
  | 'predict'
  | 'investments';

// Quotas gratuits par feature (0 = bloqué immédiatement, 999999 = illimité free)
// MAJ Budget v3.7.25 — Plan officiel TestFlight :
//   PRO : ai (Économiseur + Radar), predict (Coach + Prévisions),
//         tax (Optimisation fiscale avancée), export (PDF Premium / Excel).
//   FREE : invoices, recurring, analytics, investments (qu'on libère
//          intégralement), cloud (reste Pro / activé via session Supabase).
export const FREE_QUOTAS: Record<ProFeature, number> = {
  ai: 1,          // 1 analyse IA gratuite (Économiseur + Radar)
  tax: 1,         // 1 simulation fiscale avancée gratuite
  export: 1,      // 1 export PDF/Excel gratuit
  cloud: 0,       // Cloud sync = Pro
  invoices: 999999,    // FREE — illimité (Factures dans le plan gratuit)
  recurring: 999999,   // FREE — illimité (Charges récurrentes gratuites)
  analytics: 999999,   // FREE — illimité (Analytics basiques)
  predict: 1,     // 1 prédiction Coach gratuite
  investments: 999999, // FREE — illimité (vue Investissements)
};

export interface PremiumState {
  // Subscription
  isPro: boolean;
  plan: Plan | null;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  subscriptionStartedAt: number | null;

  // PROVISIONAL Pro grant — used when Apple StoreKit returns a valid receipt
  // but the backend cannot validate immediately (e.g. transaction_not_found
  // because Apple Sandbox/TestFlight takes a few minutes to propagate the
  // transaction to the App Store Server API). We grant 48h of provisional
  // access so the user gets the value he paid for instantly; a background
  // job re-validates on next foreground / app launch and upgrades to real Pro.
  provisionalProUntil: number | null;
  /** Receipt details we need to re-validate later. */
  pendingValidation: {
    transactionId: string;
    productId: string;
    receiptData?: string;
    queuedAt: number;
  } | null;

  // Usage tracking
  installedAt: number;
  transactionCount: number;
  budgetCount: number;
  lastPaywallShownAt: number | null;
  paywallSeenCount: number;
  dismissedCount: number;

  // Per-feature usage (free preview counters)
  featureUsage: Record<ProFeature, number>;

  // Actions
  startTrial: () => void;
  purchase: (plan: Plan) => void;
  /** Grant temporary Pro after a valid Apple receipt while waiting for
   *  backend confirmation. Pass the receipt info so we can retry later. */
  grantProvisionalPro: (
    plan: Plan,
    hours: number,
    receipt?: { transactionId: string; productId: string; receiptData?: string }
  ) => void;
  /** Clear provisional state once backend has confirmed real Pro. */
  confirmPro: (plan: Plan) => void;
  /** Remove provisional access (called after explicit refund/expiry). */
  clearProvisional: () => void;
  restore: () => void;
  cancel: () => void;
  incrementTx: () => void;
  incrementBudget: () => void;
  markPaywallShown: () => void;
  markPaywallDismissed: () => void;
  shouldShowPaywall: (trigger: PaywallTrigger) => boolean;
  isTrialActive: () => boolean;
  hasPremiumAccess: () => boolean;
  /** True when access is granted only via provisional / pending state. */
  isProvisional: () => boolean;

  // Feature gating with free preview
  canUseFeature: (f: ProFeature) => boolean;       // true si Pro OU quota dispo
  remainingQuota: (f: ProFeature) => number;       // quota restant
  consumeFeature: (f: ProFeature) => void;         // à appeler quand user utilise
  resetFeatureUsage: () => void;                   // reset quotas (tests / pro)
}

export type PaywallTrigger =
  | 'feature_ai'
  | 'feature_export'
  | 'feature_cloud'
  | 'feature_analytics'
  | 'feature_tax'
  | 'feature_lamal'
  | 'feature_invoices'
  | 'feature_recurring'
  | 'organic_days'
  | 'organic_transactions'
  | 'organic_budgets'
  | 'manual';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 7;
const MIN_BETWEEN_ORGANIC_PAYWALL = 2 * MS_PER_DAY;

const DEFAULT_USAGE: Record<ProFeature, number> = {
  ai: 0, tax: 0, export: 0, cloud: 0,
  invoices: 0, recurring: 0, analytics: 0,
  predict: 0, investments: 0,
};

export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => ({
      isPro: false,
      plan: null,
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionStartedAt: null,
      provisionalProUntil: null,
      pendingValidation: null,

      installedAt: Date.now(),
      transactionCount: 0,
      budgetCount: 0,
      lastPaywallShownAt: null,
      paywallSeenCount: 0,
      dismissedCount: 0,

      featureUsage: { ...DEFAULT_USAGE },

      /**
       * ⚠️ Apple App Review 2.1(b) — v3.9.0 / Build 73
       *
       * The Apple free trial MUST come from the Introductory Offer configured
       * in App Store Connect and be granted ONLY through a real StoreKit
       * transaction (`iap.purchase()` → App Store Server API → backend
       * verification). No path in production may activate Pro locally without
       * a validated Apple receipt.
       *
       * This method is kept as a NO-OP (with a dev-only warn) so that any
       * legacy call site fails safely — the caller will simply not unlock Pro,
       * forcing the paywall CTA to route through StoreKit.
       */
      startTrial: () => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Premium] startTrial() is intentionally a no-op since v3.9.0. ' +
              'Free trials must come from the Apple Introductory Offer via ' +
              'iap.purchase(). No local Pro activation is allowed.'
          );
        }
      },

      purchase: (plan: Plan) => {
        const now = Date.now();
        set({
          isPro: true,
          plan,
          subscriptionStartedAt: now,
          trialEndsAt: null,
          // Clear any provisional state once a real Pro purchase is confirmed
          provisionalProUntil: null,
          pendingValidation: null,
        });
      },

      grantProvisionalPro: (plan, hours, receipt) => {
        const now = Date.now();
        set({
          plan,
          provisionalProUntil: now + Math.max(1, hours) * 60 * 60 * 1000,
          pendingValidation: receipt
            ? {
                transactionId: receipt.transactionId,
                productId: receipt.productId,
                receiptData: receipt.receiptData,
                queuedAt: now,
              }
            : null,
        });
      },

      confirmPro: (plan) => {
        const now = Date.now();
        set({
          isPro: true,
          plan,
          subscriptionStartedAt: now,
          trialEndsAt: null,
          provisionalProUntil: null,
          pendingValidation: null,
        });
      },

      clearProvisional: () => {
        set({ provisionalProUntil: null, pendingValidation: null });
      },

      restore: () => {
        // Real flow: fetch RevenueCat entitlements
      },

      cancel: () => {
        set({
          isPro: false,
          plan: null,
          trialStartedAt: null,
          trialEndsAt: null,
          subscriptionStartedAt: null,
          provisionalProUntil: null,
          pendingValidation: null,
        });
      },

      incrementTx: () => set((s) => ({ transactionCount: s.transactionCount + 1 })),
      incrementBudget: () => set((s) => ({ budgetCount: s.budgetCount + 1 })),

      markPaywallShown: () =>
        set((s) => ({
          lastPaywallShownAt: Date.now(),
          paywallSeenCount: s.paywallSeenCount + 1,
        })),

      markPaywallDismissed: () => set((s) => ({ dismissedCount: s.dismissedCount + 1 })),

      isTrialActive: () => {
        const { trialEndsAt } = get();
        return !!trialEndsAt && trialEndsAt > Date.now();
      },

      isProvisional: () => {
        const s = get();
        if (s.isPro) return false;
        return !!s.provisionalProUntil && s.provisionalProUntil > Date.now();
      },

      hasPremiumAccess: () => {
        const s = get();
        if (s.isPro) return true;
        if (s.trialEndsAt && s.trialEndsAt > Date.now()) return true;
        if (s.provisionalProUntil && s.provisionalProUntil > Date.now()) return true;
        return false;
      },

      canUseFeature: (f: ProFeature) => {
        const s = get();
        if (s.hasPremiumAccess()) return true;
        const used = s.featureUsage[f] || 0;
        return used < (FREE_QUOTAS[f] || 0);
      },

      remainingQuota: (f: ProFeature) => {
        const s = get();
        if (s.hasPremiumAccess()) return Infinity;
        const used = s.featureUsage[f] || 0;
        return Math.max(0, (FREE_QUOTAS[f] || 0) - used);
      },

      consumeFeature: (f: ProFeature) => {
        const s = get();
        if (s.hasPremiumAccess()) return; // unlimited
        set({
          featureUsage: {
            ...s.featureUsage,
            [f]: (s.featureUsage[f] || 0) + 1,
          },
        });
      },

      resetFeatureUsage: () => set({ featureUsage: { ...DEFAULT_USAGE } }),

      shouldShowPaywall: (trigger: PaywallTrigger) => {
        const s = get();
        if (s.hasPremiumAccess()) return false;

        if (trigger.startsWith('feature_') || trigger === 'manual') return true;

        const now = Date.now();
        if (s.lastPaywallShownAt && now - s.lastPaywallShownAt < MIN_BETWEEN_ORGANIC_PAYWALL) {
          return false;
        }
        if (s.paywallSeenCount >= 3 && s.dismissedCount >= 3) return false;

        switch (trigger) {
          case 'organic_days': {
            const days = (now - s.installedAt) / MS_PER_DAY;
            return days >= 3;
          }
          case 'organic_transactions':
            return s.transactionCount >= 5;
          case 'organic_budgets':
            return s.budgetCount >= 1;
          default:
            return false;
        }
      },
    }),
    {
      name: 'budgy-premium-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        isPro: s.isPro,
        plan: s.plan,
        trialStartedAt: s.trialStartedAt,
        trialEndsAt: s.trialEndsAt,
        subscriptionStartedAt: s.subscriptionStartedAt,
        provisionalProUntil: s.provisionalProUntil,
        pendingValidation: s.pendingValidation,
        installedAt: s.installedAt,
        transactionCount: s.transactionCount,
        budgetCount: s.budgetCount,
        lastPaywallShownAt: s.lastPaywallShownAt,
        paywallSeenCount: s.paywallSeenCount,
        dismissedCount: s.dismissedCount,
        featureUsage: s.featureUsage,
      }),
    }
  )
);
