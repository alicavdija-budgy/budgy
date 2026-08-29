import React, { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { Colors } from '../../src/constants/theme';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { FEATURE_BY_ROUTE, isProRoute } from '../../src/config/features';

/**
 * BUDGY v3.9.0 Build 78 — Pro Route Guard (double defence).
 *
 * Every navigation into a /more/* screen is checked against the central
 * FEATURES catalog. If the destination is `tier: 'pro'` and the user is
 * FREE, we redirect to the paywall BEFORE the screen renders — this
 * ensures deep-links, router.push, share intents, etc. all hit the wall.
 *
 * `usePathname()` is intentionally used instead of indexing the typed
 * `useSegments()` tuple. Expo Router can infer a one-element tuple for this
 * nested layout, making `segments[1]` both type-unsafe and unnecessary.
 */
export default function MoreLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hasAccess = usePremiumStore((s) => s.hasPremiumAccess);

  useEffect(() => {
    if (!pathname || !pathname.startsWith('/more/')) return;

    // usePathname() excludes the query string. Remove a trailing slash so
    // routes always match the canonical keys in FEATURE_BY_ROUTE.
    const route = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
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
  }, [pathname, hasAccess, router]);

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
