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

// Quotas gratuits par feature (0 = bloqué immédiatement)
export const FREE_QUOTAS: Record<ProFeature, number> = {
  ai: 1,          // 1 analyse IA gratuite
  tax: 1,         // 1 simulation fiscale gratuite
  export: 1,      // 1 export PDF gratuit
  cloud: 0,       // Cloud sync = Pro dès le départ
  invoices: 2,    // 2 factures gratuites puis paywall
  recurring: 2,   // 2 charges récurrentes gratuites
  analytics: 2,   // 2 accès analytics
  predict: 1,     // 1 prédiction gratuite
  investments: 1, // 1 vue investissement
};

export interface PremiumState {
  // Subscription
  isPro: boolean;
  plan: Plan | null;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  subscriptionStartedAt: number | null;

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
  restore: () => void;
  cancel: () => void;
  incrementTx: () => void;
  incrementBudget: () => void;
  markPaywallShown: () => void;
  markPaywallDismissed: () => void;
  shouldShowPaywall: (trigger: PaywallTrigger) => boolean;
  isTrialActive: () => boolean;
  hasPremiumAccess: () => boolean;

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

      installedAt: Date.now(),
      transactionCount: 0,
      budgetCount: 0,
      lastPaywallShownAt: null,
      paywallSeenCount: 0,
      dismissedCount: 0,

      featureUsage: { ...DEFAULT_USAGE },

      startTrial: () => {
        const now = Date.now();
        set({
          isPro: true,
          plan: null,
          trialStartedAt: now,
          trialEndsAt: now + TRIAL_DAYS * MS_PER_DAY,
        });
      },

      purchase: (plan: Plan) => {
        const now = Date.now();
        set({
          isPro: true,
          plan,
          subscriptionStartedAt: now,
          trialEndsAt: null,
        });
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

      hasPremiumAccess: () => {
        const s = get();
        if (s.isPro) return true;
        return !!s.trialEndsAt && s.trialEndsAt > Date.now();
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
