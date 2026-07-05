/**
 * BUDGY — Tab Layout (theme-aware)
 *
 * 5 main tabs: Home, Expenses, [Central AI Button], Savings, More.
 * The central button replaces the previous scan button: it now opens the
 * AI Menu (5 actions) — see BudgyAIButton + AIMenuModal.
 *
 * Light/Dark mode is driven by useTheme(); tab bar uses dedicated palette
 * tokens (tabBarBackground, tabBarBorder, tabBarActive, tabBarInactive).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FontSizes, FontWeights, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useTranslation } from '../../src/hooks/useTranslation';
import BudgyAIButton from '../../src/components/BudgyAIButton';
import AIMenuModal from '../../src/components/AIMenuModal';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  // v3.8.0 — Light haptic feedback on tab press (iOS/Android native only).
  // No-op on web to avoid unnecessary warnings.
  const onTabPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
  }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.tabBarBackground,
            borderTopColor: theme.tabBarBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            // v3.8.0 — Modern iOS-style rounded top corners for premium feel.
            // On Android, radius still applies but shadow is replaced by elevation.
            borderTopLeftRadius: Platform.OS === 'ios' ? BorderRadius.xl : 0,
            borderTopRightRadius: Platform.OS === 'ios' ? BorderRadius.xl : 0,
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
            ...(Platform.OS === 'ios'
              ? {
                  shadowColor: theme.premiumShadow,
                  shadowOpacity: theme.premiumShadowOpacity * 1.1,
                  shadowOffset: { width: 0, height: -3 },
                  shadowRadius: 16,
                }
              : { elevation: 14 }),
          },
          tabBarActiveTintColor: theme.tabBarActive,
          tabBarInactiveTintColor: theme.tabBarInactive,
          tabBarLabelStyle: {
            fontSize: FontSizes.xs,
            fontWeight: FontWeights.semibold,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          listeners={{ tabPress: onTabPress }}
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="expenses"
          listeners={{ tabPress: onTabPress }}
          options={{
            title: t('tabs.expenses'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="scanner"
          options={{
            title: '',
            tabBarButton: () => (
              <View style={styles.centerSlot}>
                <BudgyAIButton onPress={() => setAiMenuOpen(true)} />
              </View>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              onTabPress();
              setAiMenuOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="savings"
          listeners={{ tabPress: onTabPress }}
          options={{
            title: t('tabs.savings'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'flag' : 'flag-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          listeners={{ tabPress: onTabPress }}
          options={{
            title: t('tabs.more'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>

      <AIMenuModal visible={aiMenuOpen} onClose={() => setAiMenuOpen(false)} />
    </>
  );
}

const makeStyles = (_Colors: ThemePalette) => StyleSheet.create({
  centerSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
