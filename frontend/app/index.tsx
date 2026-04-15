/**
 * GUARDIAN MONEY CHF - Entry Point
 * Shows auth screen by default, redirects authenticated users
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../src/constants/theme';
import { useStore } from '../src/stores/useStore';

export default function Index() {
  const router = useRouter();
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const onboarded = useStore((state) => state.preferences.onboarded);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated && onboarded) {
        router.replace('/(tabs)');
      } else if (isAuthenticated && !onboarded) {
        router.replace('/onboarding');
      } else {
        router.replace('/auth');
      }
      setChecked(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [isAuthenticated, onboarded]);

  if (checked) return null;

  return (
    <View style={styles.loading} testID="loading-screen">
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
