/**
 * BUDGY - Premium / Subscription State
 * Tracks subscription state, usage triggers and PER-FEATURE quotas for paywall.
 *
 * IMPORTANT — production entitlement model:
 *   - StoreKit starts purchases.
 *   - Budgy backend validates Apple transactions.
 *   - `confirmPro()` is the only action that may set `isPro: true`.
 *   - Legacy local trial/purchase helpers are retained as fail-safe NO-OPs.
 *
 * All literal strings in this store are either console-only diagnostics
 * (dev-mode) or stable ProFeature identifiers — never rendered as UI copy.
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
// v3.9.0 Build 78 — APPLE 2.1(b) STRICT.
// NO Pro route may be unlocked via a "free preview" counter. A Pro feature
// is Pro. Period. This map only reflects the tier boundary: 0 for Pro,
// unlimited for genuinely-free features.
export const FREE_QUOTAS: Record<ProFeature, number> = {
  ai: 0,               // PRO — no free preview
  tax: 0,              // PRO — no free preview
  export: 0,           // PRO — no free preview
  cloud: 0,            // PRO
  predict: 0,          // PRO — no free preview
  invoices: 999999,    // FREE
  recurring: 999999,   // FREE
  analytics: 999999,   // FREE
  investments: 0,      // PRO (portfolio tracker) — no free preview
};

export interface PremiumState {
  // Subscription
  isPro: boolean;
  plan: Plan | null;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  subscriptionStartedAt: number | null;

  // USER-SCOPED entitlement guard.
  ownerUserId: string | null;

  // A provisional entitlement is permitted only after StoreKit has delivered
  // a real transaction and backend validation is temporarily unavailable.
  // It is NEVER created by startTrial()/purchase() or a feature counter.
  provisionalProUntil: number | null;
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

  // Per-feature usage (free-tier counters only)
  featureUsage: Record<ProFeature, number>;

  // Actions
  startTrial: () => void;
  /** Legacy compatibility helper. MUST NEVER grant Pro locally. */
  purchase: (plan: Plan) => void;
  /** Grant short provisional access only after a real StoreKit transaction
   *  while backend verification is temporarily pending. */
  grantProvisionalPro: (
    plan: Plan,
    hours: number,
    receipt?: { transactionId: string; productId: string; receiptData?: string }
  ) => void;
  /** The only local action allowed to set isPro=true. Call only after server truth. */
  confirmPro: (plan: Plan) => void;
  clearProvisional: () => void;
  restore: () => void;
  cancel: () => void;
  resetForUserChange: () => void;
  attachToUser: (userId: string | null) => void;
  incrementTx: () => void;
  incrementBudget: () => void;
  markPaywallShown: () => void;
  markPaywallDismissed: () => void;
  shouldShowPaywall: (trigger: PaywallTrigger) => boolean;
  /** Legacy local trial metadata must never become an entitlement. */
  isTrialActive: () => boolean;
  hasPremiumAccess: () => boolean;
  isProvisional: () => boolean;

  // Feature gating
  canUseFeature: (f: ProFeature) => boolean;
  remainingQuota: (f: ProFeature) => number;
  consumeFeature: (f: ProFeature) => void;
  resetFeatureUsage: () => void;
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

      /**
       * Apple free trials are StoreKit introductory offers. There is no local
       * Budgy trial entitlement. This remains a NO-OP so legacy call sites fail
       * safely instead of unlocking Pro.
       */
      startTrial: () => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Premium] startTrial() is disabled. Apple introductory offers ' +
              'must flow through StoreKit + backend validation.'
          );
        }
      },

      /**
       * Legacy compatibility only. Before Build 78 this helper could set
       * isPro=true locally. It is now intentionally a NO-OP. Confirmed
       * entitlements must use confirmPro() after backend validation.
       */
      purchase: (_plan: Plan) => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Premium] purchase() cannot grant Pro locally. Use the StoreKit ' +
              'flow and confirmPro() only after backend validation.'
          );
        }
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
          // Apple trial eligibility/status is already reflected by server truth;
          // never maintain an independent local trial entitlement.
          trialStartedAt: null,
          trialEndsAt: null,
          provisionalProUntil: null,
          pendingValidation: null,
        });
      },

      clearProvisional: () => {
        set({ provisionalProUntil: null, pendingValidation: null });
      },

      restore: () => {
        // Legacy no-op. Real restore is implemented by useIAP.restore().
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

      resetForUserChange: () => {
        set({
          isPro: false,
          plan: null,
          trialStartedAt: null,
          trialEndsAt: null,
          subscriptionStartedAt: null,
          provisionalProUntil: null,
          pendingValidation: null,
          ownerUserId: null,
          featureUsage: { ...DEFAULT_USAGE },
        });
      },

      attachToUser: (userId: string | null) => {
        const s = get();
        if (s.ownerUserId && userId && s.ownerUserId !== userId) {
          set({
            isPro: false,
            plan: null,
            trialStartedAt: null,
            trialEndsAt: null,
            subscriptionStartedAt: null,
            provisionalProUntil: null,
            pendingValidation: null,
            featureUsage: { ...DEFAULT_USAGE },
            ownerUserId: userId,
          });
          return;
        }
        set({ ownerUserId: userId });
      },

      incrementTx: () => set((s) => ({ transactionCount: s.transactionCount + 1 })),
      incrementBudget: () => set((s) => ({ budgetCount: s.budgetCount + 1 })),

      markPaywallShown: () =>
        set((s) => ({
          lastPaywallShownAt: Date.now(),
          paywallSeenCount: s.paywallSeenCount + 1,
        })),

      markPaywallDismissed: () => set((s) => ({ dismissedCount: s.dismissedCount + 1 })),

      // Local trial timestamps are legacy metadata only. They never unlock Pro.
      isTrialActive: () => false,

      isProvisional: () => {
        const s = get();
        if (s.isPro) return false;
        return !!s.provisionalProUntil && s.provisionalProUntil > Date.now();
      },

      hasPremiumAccess: () => {
        const s = get();
        if (s.isPro) return true;
        // Provisional access is only produced after StoreKit delivered a real
        // transaction and is bounded while backend verification catches up.
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
        if (s.hasPremiumAccess()) return;
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
      // Build 78 security migration: never trust entitlement bits persisted by
      // older builds where local purchase/trial helpers could grant access.
      // Paid users are re-confirmed immediately from backend truth at boot.
      version: 3,
      migrate: (persistedState: unknown) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>;
        return {
          ...persisted,
          isPro: false,
          plan: null,
          trialStartedAt: null,
          trialEndsAt: null,
          subscriptionStartedAt: null,
          provisionalProUntil: null,
          pendingValidation: null,
        };
      },
      partialize: (s) => ({
        isPro: s.isPro,
        plan: s.plan,
        trialStartedAt: s.trialStartedAt,
        trialEndsAt: s.trialEndsAt,
        subscriptionStartedAt: s.subscriptionStartedAt,
        ownerUserId: s.ownerUserId,
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
