/**
 * BUDGY - BrandLogo
 * Renders a branded circular tile with brand color + initials + emoji.
 * Auto-detects 100+ Swiss brands from merchant name.
 * Legally safe: uses colored initials (not trademarked logos).
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { findBrand, initialsFromText, Brand } from '../data/swiss-brands';
import { Colors } from '../constants/theme';

interface Props {
  merchant: string;                    // merchant or transaction name
  fallbackColor?: string;              // color if no brand match
  fallbackEmoji?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showEmoji?: boolean;                 // small emoji corner badge
  style?: ViewStyle;
}

const SIZES = {
  xs: 32,
  sm: 40,
  md: 48,
  lg: 56,
};

const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
};

export const BrandLogo: React.FC<Props> = ({
  merchant,
  fallbackColor,
  fallbackEmoji,
  size = 'md',
  showEmoji = true,
  style,
}) => {
  const brand: Brand | null = findBrand(merchant);

  const diameter = SIZES[size];
  const fontSize = FONT_SIZES[size];

  // Resolve display props
  const color = brand?.color || fallbackColor || Colors.primary;
  const bg = brand ? brand.color : (fallbackColor || `${Colors.primary}30`);
  const textColor = brand?.textColor || '#FFFFFF';
  const initials = brand?.initials || initialsFromText(merchant);
  const emoji = brand?.emoji || fallbackEmoji || '';

  return (
    <View style={[styles.wrap, { width: diameter, height: diameter }, style]}>
      <View
        style={[
          styles.circle,
          {
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: bg,
          },
        ]}
      >
        <Text
          style={[
            styles.initials,
            {
              color: textColor,
              fontSize,
            },
          ]}
        >
          {initials}
        </Text>
      </View>
      {showEmoji && emoji && (
        <View style={[styles.emojiBadge, { right: -2, bottom: -2 }]}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  emojiBadge: {
    position: 'absolute',
    backgroundColor: '#FFF',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  emojiText: {
    fontSize: 10,
  },
});

export default BrandLogo;
