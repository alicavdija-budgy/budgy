/**
 * BUDGY v3.9.0 — More screen (fintech premium, clean hierarchy).
 *
 * Design mandate (this iteration):
 *   • NO more Pro-tools grid on this page — those live on the dedicated /pro screen
 *   • Strong, single Budgy Pro hero card (large, elegant, one CTA → /pro)
 *   • Section lists for "My finances", "Documents & sharing", "Account & security",
 *     "Help & info" — same visual language, minimal noise
 *   • Icons: unified Ionicons only; no rainbow palette. Each row uses ONE accent tone.
 *   • Compact profile at the top with clear FREE / PRO badge
 *   • No hardcoded price / trial — StoreKit remains the sole source of truth
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { useTranslation } from '../../src/hooks/useTranslation';
import PressScale from '../../src/components/PressScale';
import BentoPlus from '../../src/components/BentoPlus';
import { useAlertsStore } from '../../src/stores/useAlertsStore';
import {
  FEATURE_CATEGORIES,
  type BudgyFeature,
} from '../../src/config/features';

// Slim finance list — Savings surfaces at top (soft entry point)
export const SAVINGS_ROUTE: BudgyFeature = {
  id: 'savings',
  route: '/(tabs)/savings',
  tier: 'free',
  titleKey: 'moreV2.savings',
  subtitleKey: 'moreV2.savingsSub',
  icon: 'flag',
  accent: 'success',
  group: 'finance',
} as any;

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { user } = useStore();
  const legacyUnread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const alertsUnread = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);
  const unread = legacyUnread + alertsUnread;
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  const isTrial = usePremiumStore(
    (s) => s.trialEndsAt !== null && s.trialEndsAt > Date.now() && !s.plan
  );
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const { t } = useTranslation();

  const styles = useMemo(() => makeStyles(C), [C]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── A. En-tête bento : salutation, titre, alertes, avatar ── */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={styles.bentoHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bentoGreeting} numberOfLines={1}>
                {t('plusV2.greeting', { name: (user?.name || '').split(' ')[0] || t('more.title') })}
              </Text>
              <Text style={styles.bentoTitle}>{t('more.title')}</Text>
            </View>
            <PressScale
              haptic="selection"
              onPress={() => router.push('/more/notifications' as any)}
              style={styles.bellBtn}
              accessibilityLabel="Budgy Alerts"
            >
              <Ionicons name="notifications-outline" size={18} color={C.text} />
              {unread > 0 && <View style={styles.bellDot} />}
            </PressScale>
            <PressScale
              haptic="selection"
              onPress={() => router.push('/more/settings' as any)}
              accessibilityLabel={t('plusV2.prefs')}
            >
              <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(user?.name || 'User')}</Text>
                {isPro && (
                  <View style={styles.avatarProDot}>
                    <Ionicons name="diamond" size={8} color="#FFF" />
                  </View>
                )}
              </LinearGradient>
            </PressScale>
          </View>
        </Animated.View>

        {/* Trial banner */}
        {isTrial && trialEndsAt && (
          <View style={styles.trialBanner}>
            <Ionicons name="time" size={16} color={C.success} />
            <Text style={styles.trialText}>
              {t('moreV2.trialActive', {
                n: Math.max(
                  0,
                  Math.ceil((trialEndsAt - Date.now()) / (24 * 3600 * 1000))
                ),
              })}
            </Text>
            <TouchableOpacity onPress={() => router.push('/pro' as any)}>
              <Text style={styles.trialCta}>{t('more.subscribe')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── B→I. Tableau de bord bento (données réelles) ───────── */}
        <BentoPlus />

        {/* ── J. Hub — 5 rubriques premium (Budgy Smart 4.0) ─────── */}
        <SectionTitle title={t('moreHub.sections')} C={C} />
        <View style={styles.menuCard}>
          {FEATURE_CATEGORIES.map((cat, i) => (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.7}
              onPress={() => router.push(`/more/category/${cat.id}` as any)}
              style={[
                styles.menuItem,
                i < FEATURE_CATEGORIES.length - 1 && styles.menuItemBorder,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t(cat.titleKey)}
            >
              <View style={styles.menuItemInner}>
                <View style={styles.menuIcon}>
                  <Ionicons name={cat.icon} size={17} color={C.textSecondary} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle} numberOfLines={1}>
                    {t(cat.titleKey)}
                  </Text>
                  <Text style={styles.menuSubtitle} numberOfLines={1}>
                    {t(cat.subtitleKey)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Budgy v{Constants.expoConfig?.version ?? '3.9.0'}
          </Text>
          <Text style={styles.footerSub}>{t('more.dataPrivate')}</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function SectionTitle({ title, C }: { title: string; C: any }) {
  return (
    <Text
      style={{
        color: C.textSecondary,
        fontSize: 12,
        fontWeight: FontWeights.black,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      {title}
    </Text>
  );
}

export function MenuList({
  items,
  isPro,
  C,
  t,
  router,
  styles,
}: {
  items: BudgyFeature[];
  isPro: boolean;
  C: any;
  t: (k: string, p?: any) => string;
  router: ReturnType<typeof useRouter>;
  styles: any;
}) {
  if (items.length === 0) return null;
  const goTo = (f: BudgyFeature) => {
    // Special: "subscription" always → /pro (never straight to paywall)
    if (f.id === 'subscription') return router.push('/pro' as any);
    if (f.tier === 'pro' && !isPro) {
      router.push('/pro' as any);
      return;
    }
    router.push(f.route as any);
  };
  return (
    <View style={styles.menuCard}>
      {items.map((f, i) => {
        const locked = f.tier === 'pro' && !isPro;
        const subtitle = f.subtitleKey ? t(f.subtitleKey) : undefined;
        return (
          <TouchableOpacity
            key={f.id}
            activeOpacity={0.7}
            onPress={() => goTo(f)}
            style={[
              styles.menuItem,
              i < items.length - 1 && styles.menuItemBorder,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(f.titleKey)}
          >
            <View style={styles.menuItemInner}>
              <View style={styles.menuIcon}>
                <Ionicons name={f.icon} size={17} color={C.textSecondary} />
              </View>
              <View style={styles.menuContent}>
                <View style={styles.menuTitleRow}>
                  <Text style={styles.menuTitle} numberOfLines={1}>
                    {t(f.titleKey)}
                  </Text>
                  {locked && (
                    <View style={styles.lockChip}>
                      <Ionicons name="lock-closed" size={9} color={C.textTertiary} />
                    </View>
                  )}
                  {!locked && f.badge && (
                    <View style={{
                      backgroundColor: `${C.secondary}22`,
                      borderRadius: 5,
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      marginLeft: 2,
                    }}>
                      <Text style={{ color: C.secondary, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 }}>{f.badge}</Text>
                    </View>
                  )}
                  {!locked && f.tier === 'pro' && (
                    <View style={styles.proChipDiscrete}>
                      <Text style={styles.proChipText}>PRO</Text>
                    </View>
                  )}
                </View>
                {subtitle && (
                  <Text style={styles.menuSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
export const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    // ── Bento header ──
    bentoHeader: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    bentoGreeting: { color: C.textTertiary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
    bentoTitle: { color: C.text, fontSize: 26, fontWeight: FontWeights.black, letterSpacing: -0.6 },
    bellBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    bellDot: {
      position: 'absolute', top: 9, right: 10,
      width: 8, height: 8, borderRadius: 4, backgroundColor: C.error,
      borderWidth: 1.5, borderColor: C.card,
    },
    avatarProDot: {
      position: 'absolute', bottom: -2, right: -2,
      width: 16, height: 16, borderRadius: 8, backgroundColor: '#B45309',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: C.background,
    },
    content: {
      padding: Spacing.lg,
      maxWidth: 760,
      alignSelf: 'stretch',
      width: '100%',
    },

    // Profile
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      padding: 14,
      marginBottom: Spacing.lg,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: FontWeights.black,
    },
    profileInfo: { flex: 1 },
    profileName: {
      color: C.text,
      fontSize: 15,
      fontWeight: FontWeights.bold,
      letterSpacing: -0.2,
    },
    profileEmail: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    proBadgeElegant: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: '#0F766E',
    },
    proBadgeElegantText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: FontWeights.black,
      letterSpacing: 1,
    },
    freeTag: {
      backgroundColor: C.cardHover,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    freeTagText: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: FontWeights.bold,
      letterSpacing: 0.3,
    },

    // Hero
    proHero: {
      borderRadius: 22,
      padding: 20,
      overflow: 'hidden',
      minHeight: 158,
    },
    heroBlobA: {
      position: 'absolute',
      right: -28,
      top: -28,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroBlobB: {
      position: 'absolute',
      right: 40,
      bottom: -30,
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    proHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    proHeroIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    proHeroBrand: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: FontWeights.black,
      letterSpacing: 1.2,
    },
    proHeroStatusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginLeft: 'auto',
      backgroundColor: 'rgba(0,0,0,0.28)',
      paddingVertical: 3,
      paddingHorizontal: 7,
      borderRadius: 999,
    },
    proHeroStatusDot: {
      width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399',
    },
    proHeroStatusText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: FontWeights.black,
      letterSpacing: 0.5,
    },
    proHeroTitle: {
      color: '#FFFFFF',
      fontSize: 21,
      fontWeight: FontWeights.black,
      letterSpacing: -0.5,
      lineHeight: 25,
      marginTop: 4,
      maxWidth: 280,
    },
    proHeroDetails: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: FontWeights.medium,
      marginTop: 6,
      lineHeight: 17,
    },
    proHeroCtaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
    },
    proHeroCta: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: FontWeights.black,
      letterSpacing: -0.1,
    },

    // Trial
    trialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: 'rgba(52,211,153,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(52,211,153,0.25)',
    },
    trialText: { flex: 1, color: C.text, fontSize: 13, fontWeight: '600' },
    trialCta: { color: '#34D399', fontSize: 13, fontWeight: '800' },

    // Menu lists — monochrome icons, minimal chrome
    menuCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 16,
      overflow: 'hidden',
    },
    menuItem: {},
    menuItemBorder: {
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    menuItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
    },
    menuIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: C.cardHover,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuContent: { flex: 1 },
    menuTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    menuTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: FontWeights.semibold,
      letterSpacing: -0.15,
      flexShrink: 1,
    },
    menuSubtitle: {
      color: C.textSecondary,
      fontSize: 11,
      marginTop: 1,
    },

    lockChip: {
      width: 18,
      height: 18,
      borderRadius: 5,
      backgroundColor: C.cardHover,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    proChipDiscrete: {
      paddingVertical: 1,
      paddingHorizontal: 6,
      borderRadius: 4,
      backgroundColor: 'rgba(15,118,110,0.15)',
    },
    proChipText: {
      color: '#14B8A6',
      fontSize: 9,
      fontWeight: FontWeights.black,
      letterSpacing: 0.5,
    },

    footer: {
      alignItems: 'center',
      paddingVertical: Spacing.lg,
    },
    footerText: {
      color: C.textTertiary,
      fontSize: 12,
      fontWeight: FontWeights.semibold,
    },
    footerSub: {
      color: C.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
  });
