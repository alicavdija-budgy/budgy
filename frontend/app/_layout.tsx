/**
 * GUARDIAN MONEY CHF - Root Layout
 * Main navigation structure + notifications init
 */

import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../src/constants/theme';
import {
  requestNotificationPermissions,
  scheduleMonthlyReminder,
} from '../src/services/notifications';
import { startSyncMonitor, bootstrapSession } from '../src/services/sync';
import { pullAllFromCloud, pushAllToCloud, isSignedInToSupabase } from '../src/services/cloudSync';
import { startAutoSync } from '../src/lib/autoSync';
import { retryPendingValidationOnce, syncSubscriptionFromBackendOnce } from '../src/hooks/useIAP';
import { useStore } from '../src/stores/useStore';
import LockScreen from './lock';
import ShareIntentRouter from '../src/components/ShareIntentRouter';
import { OfflineBanner } from '../src/components/OfflineBanner';
import LanguageOnboardModal from '../src/components/LanguageOnboardModal';

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
    // Start auto cloud-sync (v3.7.28 — debounced push after every Zustand mutation)
    startAutoSync();

    // Restore Supabase session and pull latest data
    (async () => {
      try {
        const hasSession = await bootstrapSession();
        if (hasSession) {
          const r = await pullAllFromCloud();
          if (r.ok) console.log(`[bootstrap-sync] pulled ${r.pulled} items from cloud`);
        }
        // Re-validate any pending Apple receipt (provisional Pro → confirmed)
        retryPendingValidationOnce().catch(() => {});
      } catch (e) {
        console.warn('[bootstrap-sync] failed:', e);
      }
    })();
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
          // Re-validate any pending Apple receipt + sync premium state
          retryPendingValidationOnce().catch(() => {});
          syncSubscriptionFromBackendOnce().catch(() => {});
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
        <OfflineBanner />
        <LanguageOnboardModal />
        <ShareIntentRouter />
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
          <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
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
          <Stack.Screen
            name="paywall"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="quick-add"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />

        </Stack>
      </LockGate>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
