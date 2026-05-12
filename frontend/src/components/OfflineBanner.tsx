/**
 * BUDGY — Offline Banner
 *
 * Premium iOS-style top banner that appears ONLY when a real network outage
 * is detected (NetInfo says no internet AND ping fallback fails).
 *
 * Designed to be unobtrusive: subtle slide-down animation, safe-area aware,
 * uses theme tokens (dark + light mode), i18n.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../stores/useStore';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';

export function OfflineBanner() {
  const isOnline = useStore((s) => s.isOnline);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useTranslation();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOnline) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 9,
          tension: 60,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 8) + 6,
          backgroundColor: theme.warning || '#F59E0B',
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.dot}>{'\u25CF'}</Text>
        <Text style={styles.text} numberOfLines={1}>
          {t('network.offlineBanner')}
        </Text>
      </View>
    </Animated.View>
  );
}

export default OfflineBanner;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 10,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
        }
      : {}),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    color: '#111827',
    fontSize: 10,
    marginRight: 4,
  },
  text: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
