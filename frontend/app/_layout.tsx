/**
 * GUARDIAN MONEY CHF - Root Layout
 * Main navigation structure + notifications init
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../src/constants/theme';
import {
  requestNotificationPermissions,
  scheduleMonthlyReminder,
} from '../src/services/notifications';

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
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
