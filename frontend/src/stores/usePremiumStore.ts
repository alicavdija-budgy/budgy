/**
 * BUDGY - Premium / Subscription State
 * Tracks trial, subscription, usage triggers for paywall.
 *
 * MOCKED mode: works locally until RevenueCat keys are wired.
 * When RevenueCat is integrated, replace `startTrial` / `purchase` with real calls.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plan = 'monthly' | 'annual';

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
}

export type PaywallTrigger =
  | 'feature_ai'
  | 'feature_export'
  | 'feature_cloud'
  | 'feature_analytics'
  | 'feature_tax'
  | 'feature_lamal'
  | 'organic_days'
  | 'organic_transactions'
  | 'organic_budgets'
  | 'manual';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 7;
const MIN_BETWEEN_ORGANIC_PAYWALL = 2 * MS_PER_DAY; // 48 h

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

      startTrial: () => {
        const now = Date.now();
        set({
          isPro: true,
          plan: null, // trial has no plan yet
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
        // In real flow: fetch RevenueCat entitlements
        // For mock: no-op if no local state
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

      shouldShowPaywall: (trigger: PaywallTrigger) => {
        const s = get();
        if (s.hasPremiumAccess()) return false;

        // Feature-gated triggers always show (user clicked a locked feature)
        if (trigger.startsWith('feature_') || trigger === 'manual') return true;

        // Organic triggers respect cooldown
        const now = Date.now();
        if (s.lastPaywallShownAt && now - s.lastPaywallShownAt < MIN_BETWEEN_ORGANIC_PAYWALL) {
          return false;
        }
        // Cap organic nudges to 3 times total (anti-friction)
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
      name: 'budgy-premium-v1',
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
      }),
    }
  )
);
