/**
 * BUDGY — Fallback route handler
 *
 * Catches any unknown URL (e.g. when iOS opens budgy:// with an unknown path
 * after a Share-Sheet, a deep-link, or a navigation typo) and redirects
 * gracefully to a sane destination instead of showing the default
 * "Unmatched Route" error screen.
 *
 *   - If the original URL appears to come from a share/file import flow
 *     → route to /more/email-import (3-methods import screen).
 *   - Otherwise → route to the home tab.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Colors, FontSizes, Spacing } from '../src/constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const lower = (pathname || '').toLowerCase();
    const looksLikeImport =
      lower.includes('share') ||
      lower.includes('import') ||
      lower.includes('facture') ||
      lower.includes('invoice') ||
      lower.includes('receipt') ||
      lower.includes('pdf') ||
      lower.includes('mail');

    const target = looksLikeImport ? '/more/email-import' : '/(tabs)';
    // Slight delay so the loader is visible (avoids flicker)
    const t = setTimeout(() => {
      router.replace(target as any);
    }, 350);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.primary} size="large" />
      <Text style={styles.title}>Redirection…</Text>
      <Text style={styles.subtitle}>Préparation de votre écran</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginTop: Spacing.lg,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
});
