/**
 * BUDGY - Paywall Hook
 * Handles organic & feature-gated triggers with PREVIEW QUOTA.
 *
 * Usage examples:
 *   const { gateFeature } = usePaywall();
 *   gateFeature('ai', () => router.push('/more/ai-optimizer'));
 *   // If user has quota remaining -> navigate AND consume quota
 *   // If quota exhausted -> open paywall
 */

import { useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  usePremiumStore,
  type PaywallTrigger,
  type ProFeature,
  FREE_QUOTAS,
} from '../stores/usePremiumStore';

// Map ProFeature → PaywallTrigger (for correct paywall copy)
const FEATURE_TO_TRIGGER: Record<ProFeature, PaywallTrigger> = {
  ai: 'feature_ai',
  predict: 'feature_ai',
  tax: 'feature_tax',
  export: 'feature_export',
  cloud: 'feature_cloud',
  invoices: 'feature_invoices',
  recurring: 'feature_recurring',
  analytics: 'feature_analytics',
  investments: 'feature_analytics',
};

export function usePaywall() {
  const router = useRouter();
  const markShown = usePremiumStore((s) => s.markPaywallShown);
  const hasAccess = usePremiumStore((s) => s.hasPremiumAccess);
  const canUseFeature = usePremiumStore((s) => s.canUseFeature);
  const consumeFeature = usePremiumStore((s) => s.consumeFeature);
  const remainingQuota = usePremiumStore((s) => s.remainingQuota);

  const open = useCallback(
    (trigger: PaywallTrigger = 'manual') => {
      markShown();
      router.push(`/paywall?trigger=${trigger}`);
    },
    [markShown, router]
  );

  /**
   * Gate a Pro feature with FREE PREVIEW support.
   * - If Pro/trial: execute action
   * - If quota remaining: execute action + consume quota
   * - If quota exhausted: open paywall
   */
  const gateFeature = useCallback(
    (feature: ProFeature, action: () => void) => {
      if (hasAccess()) {
        action();
        return;
      }
      if (canUseFeature(feature)) {
        consumeFeature(feature);
        action();
        return;
      }
      open(FEATURE_TO_TRIGGER[feature]);
    },
    [hasAccess, canUseFeature, consumeFeature, open]
  );

  // Legacy gate (always triggers paywall for non-pro)
  const gate = useCallback(
    (trigger: PaywallTrigger, action: () => void) => {
      if (hasAccess()) {
        action();
        return;
      }
      open(trigger);
    },
    [hasAccess, open]
  );

  const getRemaining = useCallback(
    (feature: ProFeature) => ({
      remaining: remainingQuota(feature),
      total: FREE_QUOTAS[feature] || 0,
    }),
    [remainingQuota]
  );

  return {
    open,
    gate,
    gateFeature,
    getRemaining,
    hasAccess: hasAccess(),
  };
}

/**
 * Auto-trigger hook for organic paywall prompts.
 */
export function useOrganicPaywall() {
  const router = useRouter();
  const shouldShow = usePremiumStore((s) => s.shouldShowPaywall);
  const markShown = usePremiumStore((s) => s.markPaywallShown);

  useEffect(() => {
    const timer = setTimeout(() => {
      const triggers: PaywallTrigger[] = [
        'organic_transactions',
        'organic_budgets',
        'organic_days',
      ];
      for (const t of triggers) {
        if (shouldShow(t)) {
          markShown();
          router.push(`/paywall?trigger=${t}`);
          break;
        }
      }
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
