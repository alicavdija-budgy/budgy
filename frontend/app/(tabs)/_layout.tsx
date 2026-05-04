/**
 * GUARDIAN MONEY CHF - Tab Layout
 * 5 main tabs: Home, Expenses, Savings, More + central floating scanner button
 * Scanner button opens /scanner-modal (real camera)
 */

import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTranslation } from '../../src/hooks/useTranslation';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const openScanner = () => {
    try {
      router.push('/scanner-modal');
    } catch {
      // no-op fallback
    }
  };

  return (
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
            <View style={styles.scannerButtonContainer}>
              <TouchableOpacity onPress={openScanner} activeOpacity={0.8} testID="scanner-button">
                <LinearGradient
                  colors={Colors.gradientPrimary as [string, string]}
                  style={styles.scannerButton}
                >
                  <Ionicons name="scan" size={28} color={Colors.text} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // Prevent default tab navigation and open scanner instead
            e.preventDefault();
            openScanner();
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
  );
}

const styles = StyleSheet.create({
  scannerButtonContainer: {
    position: 'absolute',
    top: -20,
    left: '50%',
    marginLeft: -30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
