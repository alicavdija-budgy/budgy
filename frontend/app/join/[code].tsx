/**
 * BUDGY — Deep link handler: budgy://join/<CODE>
 *
 * v3.8.0 — Opened either from:
 *   • Native deep link (iOS/Android): budgy://join/ABCD1234
 *   • Web preview:                    /join/ABCD1234
 *
 * Redirects to /more/family with the code pre-filled so the user can just
 * tap "Join". If the user is not authenticated yet, we still go to family
 * — that screen will show the "Sign in required" alert.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { FontSizes, Spacing } from '../../src/constants/theme';

export default function JoinDeepLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    const raw = (code || '').trim().toUpperCase();
    // Small timeout so the intermediate screen is briefly visible (feedback)
    const timer = setTimeout(() => {
      router.replace({
        pathname: '/more/family',
        params: raw ? { joinCode: raw } : {},
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [code, router]);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={[styles.label, { color: C.text }]}>
        {t('family.joinCta')}…
      </Text>
      {code ? (
        <Text style={[styles.code, { color: C.textSecondary }]}>
          {String(code).toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  label: { fontSize: FontSizes.md, fontWeight: '600' },
  code: { fontSize: FontSizes.sm, letterSpacing: 2 },
});
