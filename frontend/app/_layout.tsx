/**
 * GUARDIAN MONEY CHF - Root Layout
 * Main navigation structure + notifications init
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors, FontSizes, FontWeights, Spacing } from '../src/constants/theme';
import {
  requestNotificationPermissions,
  scheduleMonthlyReminder,
} from '../src/services/notifications';
import { startSyncMonitor } from '../src/services/sync';
import { useStore } from '../src/stores/useStore';

function OfflineBadge() {
  const isOnline = useStore((s) => s.isOnline);
  const queueLen = useStore((s) => s.syncQueue.length);
  if (isOnline && queueLen === 0) return null;
  return (
    <View style={styles.offlineBar} pointerEvents="none">
      <Text style={styles.offlineText}>
        {!isOnline
          ? `🔌 Hors ligne · ${queueLen} actions en file`
          : `🔄 Synchronisation de ${queueLen} actions...`}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  // Initialize push notifications on app start (native only)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      requestNotificationPermissions().then((granted) => {
        if (granted) {
          scheduleMonthlyReminder();
        }
      });
    }
    // Start offline sync monitor
    startSyncMonitor();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <OfflineBadge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="more" options={{ headerShown: false }} />
        <Stack.Screen
          name="scanner-modal"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  offlineBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.warning,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    zIndex: 9999,
    alignItems: 'center',
  },
  offlineText: {
    color: '#000',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
});
