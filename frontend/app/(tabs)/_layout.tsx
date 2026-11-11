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
import { BlurView } from 'expo-blur';
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
          // iOS : barre FLOTTANTE « liquid glass » — verre système natif
          // (UIVisualEffectView via expo-blur), coins entièrement arrondis,
          // détachée des bords, le contenu diffuse derrière. NB : les vrais
          // onglets natifs iOS 26 (expo-router/unstable-native-tabs) existent
          // en SDK 54 mais la barre système ne peut PAS héberger le bouton
          // central Budgy AI personnalisé — compromis documenté : on garde
          // l'identité Budgy avec le matériau verre natif.
          ...(Platform.OS === 'ios'
            ? {
                tabBarBackground: () => (
                  <BlurView
                    tint={String(theme.background).toLowerCase().startsWith('#0')
                      ? 'systemChromeMaterialDark'
                      : 'systemChromeMaterialLight'}
                    intensity={90}
                    style={[StyleSheet.absoluteFill, {
                      borderRadius: 30,
                      overflow: 'hidden',
                    }]}
                  />
                ),
              }
            : {}),
          tabBarStyle: Platform.OS === 'ios'
            ? {
                position: 'absolute' as const,
                left: 14,
                right: 14,
                bottom: Math.max(insets.bottom, 10) + 4,
                height: 66,
                borderRadius: 30,
                borderTopWidth: 0,
                borderWidth: 1,
                borderColor: 'rgba(52,211,153,0.28)',
                backgroundColor: 'transparent',
                paddingBottom: 8,
                paddingTop: 8,
                shadowColor: theme.premiumShadow,
                shadowOpacity: theme.premiumShadowOpacity * 1.2,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 22,
              }
            : {
                backgroundColor: theme.tabBarBackground,
                borderTopColor: theme.tabBarBorder,
                borderTopWidth: StyleSheet.hairlineWidth,
                height: 70 + insets.bottom,
                paddingBottom: insets.bottom,
                paddingTop: 8,
                elevation: 14,
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
