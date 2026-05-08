/**
 * BUDGY — Tab Layout
 *
 * 5 main tabs: Home, Expenses, [Central AI Button], Savings, More.
 * The central button replaces the previous scan button: it now opens the
 * AI Menu (5 actions) — see BudgyAIButton + AIMenuModal.
 */

import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTranslation } from '../../src/hooks/useTranslation';
import BudgyAIButton from '../../src/components/BudgyAIButton';
import AIMenuModal from '../../src/components/AIMenuModal';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.backgroundSecondary,
            borderTopColor: Colors.cardBorder,
            borderTopWidth: 1,
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: {
            fontSize: FontSizes.xs,
            fontWeight: FontWeights.semibold,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="expenses"
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
              // Prevent default tab navigation — the AI button handles it
              e.preventDefault();
              setAiMenuOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="savings"
          options={{
            title: t('tabs.savings'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'flag' : 'flag-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('tabs.more'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* AI Menu modal — opened by central Budgy button */}
      <AIMenuModal visible={aiMenuOpen} onClose={() => setAiMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
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
