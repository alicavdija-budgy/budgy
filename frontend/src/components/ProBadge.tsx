/**
 * BUDGY - PRO badge for locked features
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface ProBadgeProps {
  size?: 'sm' | 'md';
  showLock?: boolean;
}

export function ProBadge({ size = 'sm', showLock = false }: ProBadgeProps) {
  const isSm = size === 'sm';
  return (
    <LinearGradient
      colors={['#34D399', '#22D3EE']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badge,
        isSm ? styles.sm : styles.md,
      ]}
    >
      {showLock && (
        <Ionicons name="lock-closed" size={isSm ? 10 : 12} color="#0E1530" />
      )}
      <Text style={[styles.text, isSm ? styles.textSm : styles.textMd]}>PRO</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
  },
  sm: { paddingHorizontal: 8, paddingVertical: 3 },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  text: {
    color: '#0E1530',
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  textSm: { fontSize: 10 },
  textMd: { fontSize: 12 },
});
