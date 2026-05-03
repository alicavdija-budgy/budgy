/**
 * BUDGY - Paywall Hook
 * Handles organic & feature-gated triggers from anywhere in the app.
 */

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { usePremiumStore, type PaywallTrigger } from '../stores/usePremiumStore';

export function usePaywall() {
  const router = useRouter();
  const shouldShow = usePremiumStore((s) => s.shouldShowPaywall);
  const markShown = usePremiumStore((s) => s.markPaywallShown);
  const hasAccess = usePremiumStore((s) => s.hasPremiumAccess);

  const open = useCallback(
    (trigger: PaywallTrigger = 'manual') => {
      markShown();
      router.push(`/paywall?trigger=${trigger}`);
    },
    [markShown, router]
  );

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

  return { open, gate, hasAccess: hasAccess() };
}

/**
 * Auto-trigger hook for organic paywall prompts.
 * Call at app root. Checks triggers on mount (1× per session).
 */
export function useOrganicPaywall() {
  const router = useRouter();
  const shouldShow = usePremiumStore((s) => s.shouldShowPaywall);
  const markShown = usePremiumStore((s) => s.markPaywallShown);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Check triggers in order of priority
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
    }, 2500); // Delay so user sees home first
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
