/**
 * GUARDIAN MONEY CHF - Root Layout
 * Main navigation structure + notifications init
 */

import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, FontSizes, FontWeights, Spacing } from '../src/constants/theme';
import {
  requestNotificationPermissions,
  scheduleMonthlyReminder,
} from '../src/services/notifications';
import { startSyncMonitor } from '../src/services/sync';
import { pullAllFromCloud, pushAllToCloud, isSignedInToSupabase } from '../src/services/cloudSync';
import { useStore } from '../src/stores/useStore';
import LockScreen from './lock';

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

function LockGate({ children }: { children: React.ReactNode }) {
  const { security, isLocked, setLocked, isAuthenticated, setDecoyMode } = useStore();
  const backgroundedAt = useRef<number | null>(null);

  // Re-lock when app goes to background past timeout
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (!security.appLockEnabled || !security.pinHash) return;
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current) {
        const elapsed = (Date.now() - backgroundedAt.current) / 1000;
        if (elapsed >= (security.autoLockSeconds || 60)) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [security.appLockEnabled, security.pinHash, security.autoLockSeconds]);

  // Auto-lock on first mount if user has app lock enabled
  useEffect(() => {
    if (security.appLockEnabled && security.pinHash && isAuthenticated) {
      setLocked(true);
    }
  }, []);

  if (security.appLockEnabled && security.pinHash && isLocked && isAuthenticated) {
    return (
      <LockScreen
        onUnlock={(decoy) => {
          setDecoyMode(decoy);
          setLocked(false);
        }}
      />
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const lastForegroundSync = useRef<number>(0);

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

  // Auto-sync with cloud on AppState changes:
  // - Foreground: pull latest data from cloud (throttled 30s)
  // - Background: push local data to cloud (fire & forget)
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      // Only run on native (web has no real foreground/background)
      if (Platform.OS === 'web') return;

      try {
        const signedIn = await isSignedInToSupabase();
        if (!signedIn) return;

        if (state === 'active') {
          const now = Date.now();
          if (now - lastForegroundSync.current < 30_000) return; // throttle
          lastForegroundSync.current = now;
          const r = await pullAllFromCloud();
          if (r.ok) console.log(`[foreground-sync] pulled ${r.pulled} items`);
        } else if (state === 'background' || state === 'inactive') {
          const r = await pushAllToCloud();
          if (r.ok) console.log(`[background-sync] pushed ${r.pushed} items`);
        }
      } catch (e) {
        console.warn('[app-state-sync] failed:', e);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OfflineBadge />
        <LockGate>
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
          <Stack.Screen name="lock" options={{ headerShown: false }} />
          <Stack.Screen
            name="scanner-modal"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </LockGate>
    </SafeAreaProvider>
    </GestureHandlerRootView>
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
