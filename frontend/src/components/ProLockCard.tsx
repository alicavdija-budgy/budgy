/**
 * BUDGY — ProLockCard (premium conversion building block)
 *
 *   <ProLockCard kind="invest" />        full card with title/sub + CTA
 *   <ProLockCard kind="ocr" compact />   tighter inline variant
 *
 * Auto-hides when the user already has Pro (via usePremiumStore).
 * Tap → /paywall (or custom onPress).
 *
 * Subtle Apple-like design — never aggressive, never blocks brutally.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from '../hooks/useTranslation';
import { usePremiumStore } from '../stores/usePremiumStore';
import { ProBadge } from './ProBadge';

const ACCENT = '#16E0C6';
const ACCENT_SOFT = '#7BFCE3';

export type ProLockKind = 'invest' | 'tax' | 'ocr' | 'pdf' | 'timeline' | 'ai';

interface LockProps {
  kind: ProLockKind;
  title?: string;
  subtitle?: string;
  preview?: boolean;
  compact?: boolean;
  onPress?: () => void;
  hideWhenPro?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const ICON_BY_KIND: Record<ProLockKind, keyof typeof Ionicons.glyphMap> = {
  invest: 'trending-up',
  tax: 'calculator',
  ocr: 'scan',
  pdf: 'document-text',
  timeline: 'analytics',
  ai: 'sparkles',
};
const TITLE_KEY: Record<ProLockKind, string> = {
  invest: 'pro.lockTitleInvest',
  tax: 'pro.lockTitleTax',
  ocr: 'pro.lockTitleOcr',
  pdf: 'pro.lockTitlePdf',
  timeline: 'pro.lockTitleTimeline',
  ai: 'pro.lockTitleAi',
};
const SUB_KEY: Record<ProLockKind, string> = {
  invest: 'pro.lockSubInvest',
  tax: 'pro.lockSubTax',
  ocr: 'pro.lockSubOcr',
  pdf: 'pro.lockSubPdf',
  timeline: 'pro.lockSubTimeline',
  ai: 'pro.lockSubAi',
};

export function ProLockCard({
  kind,
  title,
  subtitle,
  preview,
  compact,
  onPress,
  hideWhenPro = true,
  icon,
}: LockProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  if (isPro && hideWhenPro) return null;

  const finalTitle = title ?? t(TITLE_KEY[kind]);
  const finalSub = subtitle ?? t(SUB_KEY[kind]);
  const finalIcon = icon ?? ICON_BY_KIND[kind];

  const goPaywall = () => {
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (onPress) {
      onPress();
      return;
    }
    try {
      router.push('/paywall' as any);
    } catch (e) {
      console.warn('[pro-lock] nav failed:', e);
    }
  };

  return (
    <Pressable
      onPress={goPaywall}
      style={({ pressed }) => [
        styles.card,
        compact ? styles.cardCompact : null,
        pressed && { opacity: 0.85 },
      ]}
    >
      <LinearGradient
        colors={['rgba(22, 224, 198, 0.10)', 'rgba(22, 224, 198, 0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill as any}
      />
      <View style={styles.cardSheen} pointerEvents="none" />

      <View style={styles.cardRow}>
        <View style={styles.cardIconWrap}>
          <LinearGradient
            colors={[ACCENT_SOFT, ACCENT]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={StyleSheet.absoluteFill as any}
          />
          <Ionicons name={finalIcon} size={16} color="#0F1115" style={{ zIndex: 1 }} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {finalTitle}
            </Text>
            <ProBadge size="sm" />
          </View>
          <Text style={styles.sub} numberOfLines={2}>
            {finalSub}
          </Text>
          {preview && (
            <Text style={styles.previewLabel}>· {t('pro.previewLabel')}</Text>
          )}
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaTxt}>{t('pro.lockCta')}</Text>
          <Ionicons name="chevron-forward" size={13} color={ACCENT} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 224, 198, 0.32)',
    backgroundColor: 'rgba(22, 224, 198, 0.04)',
  },
  cardCompact: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  cardSheen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    color: '#fff', fontSize: 14, fontWeight: '700',
    letterSpacing: -0.2, flexShrink: 1,
  },
  sub: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 12, lineHeight: 16 },
  previewLabel: {
    color: 'rgba(22, 224, 198, 0.85)',
    fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(22, 224, 198, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 224, 198, 0.32)',
  },
  ctaTxt: {
    color: ACCENT, fontSize: 11, fontWeight: '800', letterSpacing: 0.2,
  },
});

export default ProLockCard;
