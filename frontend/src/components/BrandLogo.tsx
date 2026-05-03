/**
 * BUDGY - BrandLogo (with real images via Clearbit Logo API)
 * Loads real brand logo via https://logo.clearbit.com/{domain}
 * Falls back gracefully to a colored initials tile if:
 *  - no domain in brand DB
 *  - image fails to load
 *  - no brand detected (generic tile with initials + category color)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ViewStyle } from 'react-native';
import { findBrand, initialsFromText, Brand } from '../data/swiss-brands';
import { Colors } from '../constants/theme';

interface Props {
  merchant: string;
  fallbackColor?: string;
  fallbackEmoji?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showEmoji?: boolean;
  style?: ViewStyle;
}

const SIZES = { xs: 32, sm: 40, md: 48, lg: 56 };
const FONT_SIZES = { xs: 12, sm: 14, md: 16, lg: 20 };

export const BrandLogo: React.FC<Props> = ({
  merchant,
  fallbackColor,
  fallbackEmoji,
  size = 'md',
  showEmoji = true,
  style,
}) => {
  const brand: Brand | null = findBrand(merchant);
  const [imgError, setImgError] = useState(false);

  const diameter = SIZES[size];
  const fontSize = FONT_SIZES[size];

  const logoUrl = brand?.domain && !imgError
    ? `https://logo.clearbit.com/${brand.domain}?size=128`
    : null;

  const bg = brand ? brand.color : (fallbackColor || `${Colors.primary}30`);
  const textColor = brand?.textColor || '#FFFFFF';
  const initials = brand?.initials || initialsFromText(merchant);
  const emoji = brand?.emoji || fallbackEmoji || '';

  return (
    <View style={[styles.wrap, { width: diameter, height: diameter }, style]}>
      {logoUrl ? (
        <View style={[styles.imgWrap, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: '#FFF' }]}>
          <Image
            source={{ uri: logoUrl }}
            style={{ width: diameter - 6, height: diameter - 6, borderRadius: (diameter - 6) / 2 }}
            resizeMode="contain"
            onError={() => setImgError(true)}
          />
        </View>
      ) : (
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
          <Text style={[styles.initials, { color: textColor, fontSize }]}>
            {initials}
          </Text>
        </View>
      )}
      {showEmoji && emoji && (
        <View style={[styles.emojiBadge, { right: -2, bottom: -2 }]}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  imgWrap: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  initials: { fontWeight: '900', letterSpacing: -0.3 },
  emojiBadge: {
    position: 'absolute',
    backgroundColor: '#FFF',
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  emojiText: { fontSize: 10 },
});

export default BrandLogo;
