import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Colors } from '../../src/constants/theme';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { FEATURE_BY_ROUTE, isProRoute } from '../../src/config/features';

/**
 * BUDGY v3.9.0 Build 74 — Pro Route Guard (double defence).
 *
 * Every navigation into a /more/* screen is checked against the central
 * FEATURES catalog. If the destination is `tier: 'pro'` and the user is
 * FREE, we redirect to the paywall BEFORE the screen renders — this
 * ensures deep-links, router.push, share intents, etc. all hit the wall.
 *
 * The paywall trigger is derived from the feature id so the copy matches.
 */
export default function MoreLayout() {
  const router = useRouter();
  const segments = useSegments();
  const hasAccess = usePremiumStore((s) => s.hasPremiumAccess);

  useEffect(() => {
    // segments looks like ['more', 'ai-optimizer'] for /more/ai-optimizer
    if (!segments || segments.length < 2) return;
    if (segments[0] !== 'more') return;
    const route = `/more/${segments[1]}`;
    if (!isProRoute(route)) return;
    if (hasAccess()) return;

    const feature = FEATURE_BY_ROUTE[route];
    const trigger =
      feature?.id === 'ai-optimizer' ||
      feature?.id === 'savings-radar' ||
      feature?.id === 'predict'
        ? 'feature_ai'
        : feature?.id === 'tax'
          ? 'feature_tax'
          : feature?.id === 'export-pdf'
            ? 'feature_export'
            : feature?.id === 'cloud-sync'
              ? 'feature_cloud'
              : 'manual';

    // Defer to next tick so the pending navigation completes first.
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
  }, [segments, hasAccess, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
