/**
 * BUDGY - BrandLogo
 * Loads real brand logos via reliable favicon CDNs.
 *
 * Source chain (with auto-fallback on error):
 *   1. https://icons.duckduckgo.com/ip3/{domain}.ico    (HQ, returns 200)
 *   2. https://www.google.com/s2/favicons?domain={domain}&sz=128 (always works)
 *   3. Colored initials tile (offline fallback)
 *
 * (Note: Clearbit Logo API was shut down by HubSpot in 2024, hence this migration.)
 */

import React, { useState, useMemo } from 'react';
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

const buildSources = (domain: string) => [
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  `https://${domain}/favicon.ico`,
];

export const BrandLogo: React.FC<Props> = ({
  merchant,
  fallbackColor,
  fallbackEmoji,
  size = 'md',
  showEmoji = true,
  style,
}) => {
  const brand: Brand | null = findBrand(merchant);
  const [sourceIdx, setSourceIdx] = useState(0);

  const sources = useMemo(
    () => (brand?.domain ? buildSources(brand.domain) : []),
    [brand?.domain]
  );

  const diameter = SIZES[size];
  const fontSize = FONT_SIZES[size];

  const logoUrl = sources[sourceIdx] || null;
  const exhausted = sourceIdx >= sources.length;

  const bg = brand ? brand.color : (fallbackColor || `${Colors.primary}30`);
  const textColor = brand?.textColor || '#FFFFFF';
  const initials = brand?.initials || initialsFromText(merchant);
  const emoji = brand?.emoji || fallbackEmoji || '';

  const handleError = () => {
    if (sourceIdx < sources.length - 1) {
      setSourceIdx(sourceIdx + 1);
    } else {
      setSourceIdx(sources.length); // mark exhausted
    }
  };

  return (
    <View style={[styles.wrap, { width: diameter, height: diameter }, style]}>
      {logoUrl && !exhausted ? (
        <View style={[styles.imgWrap, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: '#FFF' }]}>
          <Image
            source={{ uri: logoUrl }}
            style={{ width: diameter - 8, height: diameter - 8, borderRadius: (diameter - 8) / 2 }}
            resizeMode="contain"
            onError={handleError}
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
