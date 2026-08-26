/**
 * BUDGY v3.9.0 Build 74 — Pro Route Guard.
 *
 * Apple Guideline 2.1(b) compliance: Pro routes MUST be gated at BOTH the
 * navigation origin AND the destination screen. A deep link, share, or
 * router.replace() call cannot bypass the paywall.
 *
 * Usage (inside any Pro screen):
 *
 *   export default function AIOptimizerScreen() {
 *     const gate = useRequirePro('ai-optimizer');
 *     if (gate.blocked) return gate.fallback;   // renders paywall + navigates
 *     return (<RealScreen />);
 *   }
 *
 * Or wrap the return:
 *
 *   return (
 *     <ProRouteGuard featureId="ai-optimizer">
 *       <RealScreen />
 *     </ProRouteGuard>
 *   );
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { usePremiumStore } from '../stores/usePremiumStore';
import { FEATURE_BY_ID, type BudgyFeature } from '../config/features';
import { useTranslation } from './useTranslation';

// ── Hook ────────────────────────────────────────────────────────────────

export function useRequirePro(featureId: string): {
  blocked: boolean;
  feature: BudgyFeature | undefined;
  fallback: React.ReactElement | null;
} {
  const router = useRouter();
  const { t } = useTranslation();
  const hasAccess = usePremiumStore((s) => s.hasPremiumAccess);
  const feature = FEATURE_BY_ID[featureId];
  const isPro = hasAccess();

  const blocked = !!feature && feature.tier === 'pro' && !isPro;

  useEffect(() => {
    if (!blocked || !feature) return;
    // Push paywall on next tick to avoid navigation during render
    const trigger =
      featureId === 'ai-optimizer' || featureId === 'savings-radar' || featureId === 'predict'
        ? 'feature_ai'
        : featureId === 'tax'
          ? 'feature_tax'
          : featureId === 'export-pdf'
            ? 'feature_export'
            : featureId === 'cloud-sync'
              ? 'feature_cloud'
              : 'manual';
    const timer = setTimeout(() => {
      try {
        router.replace(`/paywall?trigger=${trigger}` as any);
      } catch {
        try {
          router.push(`/paywall?trigger=${trigger}` as any);
        } catch {}
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [blocked, feature, featureId, router]);

  return {
    blocked,
    feature,
    fallback: blocked ? (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('proGuard.redirecting')}</Text>
      </View>
    ) : null,
  };
}

// ── Component wrapper ───────────────────────────────────────────────────

export function ProRouteGuard({
  featureId,
  children,
}: {
  featureId: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  const gate = useRequirePro(featureId);
  if (gate.blocked) return gate.fallback;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
