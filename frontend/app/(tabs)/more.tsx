/**
 * BUDGY v3.9.0 Build 74 — More Screen (fully redesigned).
 *
 * Design principles (Apple 2.1(b) compliant + modern banking UX):
 *   - Compact profile (~80-90 px)
 *   - ONE single Pro hero card for Free users (no duplicate promo cards)
 *   - 2-col grid of Smart Tools (all Pro-tagged) — tap = paywall for Free
 *   - Compact section lists for Finance / Documents / Account / Help
 *   - No emoji-in-header labels, no rainbow icons
 *   - No hardcoded price / "7 days" — StoreKit is the ONLY source of price copy
 *   - Uses central FEATURES catalog — single source of truth
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
import { usePaywall } from '../../src/hooks/usePaywall';
import { useTranslation } from '../../src/hooks/useTranslation';
import PressScale from '../../src/components/PressScale';
import {
  FEATURES,
  featuresByGroup,
  type BudgyFeature,
  type FeatureGroup,
} from '../../src/config/features';

// ── Accent resolver ──────────────────────────────────────────────────────
const accentOf = (C: any, accent: BudgyFeature['accent']): string => {
  const map: Record<string, string> = {
    primary: C.primary,
    secondary: C.secondary,
    success: C.success,
    warning: C.warning,
    error: C.error,
    info: C.info,
    pink: C.pink,
    gold: C.gold,
    purple: C.purple,
    teal: C.teal,
    cyan: C.cyan,
    orange: C.orange,
  };
  return map[accent] || C.primary;
};

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { user } = useStore();
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  const isTrial = usePremiumStore(
    (s) => s.trialEndsAt !== null && s.trialEndsAt > Date.now() && !s.plan
  );
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const paywall = usePaywall();
  const { t } = useTranslation();

  const styles = useMemo(() => makeStyles(C), [C]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const goTo = (f: BudgyFeature) => {
    if (f.tier === 'pro' && !isPro) {
      // FREE user → paywall
      paywall.open('manual');
      return;
    }
    router.push(f.route as any);
  };

  const smartTools = featuresByGroup('tools');
  const finance = featuresByGroup('finance');
  const documents = featuresByGroup('documents');
  const account = featuresByGroup('account');
  const help = featuresByGroup('help');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── A. COMPACT PROFILE ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={styles.profileCard}>
            <LinearGradient
              colors={C.gradientPrimary as [string, string]}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {getInitials(user?.name || 'User')}
              </Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.name || t('more.title')}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.email || ''}
              </Text>
            </View>
            <View style={isPro ? styles.proTag : styles.freeTag}>
              <Text style={isPro ? styles.proTagText : styles.freeTagText}>
                {isPro ? 'PRO' : t('moreV2.freeAccount')}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── B. SINGLE PRO HERO (Free users only) ──────────────────── */}
        {!isPro && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(80)}
            style={{ marginBottom: Spacing.xl }}
          >
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => paywall.open('manual')}
              accessibilityRole="button"
              accessibilityLabel={t('moreV2.proHeroCta')}
            >
              <LinearGradient
                colors={['#0F766E', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.proHero}
              >
                <View style={styles.proHeroTop}>
                  <View style={styles.proHeroIconWrap}>
                    <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.proHeroBrand}>{t('moreV2.proHeroTitle')}</Text>
                </View>
                <Text style={styles.proHeroTitle}>{t('moreV2.proHeroSub')}</Text>
                <Text style={styles.proHeroDetails}>
                  {t('moreV2.proHeroDetails')}
                </Text>
                <View style={styles.proHeroCtaRow}>
                  <Text style={styles.proHeroCta}>{t('moreV2.proHeroCta')}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Trial banner (user in trial) */}
        {isTrial && trialEndsAt && (
          <Animated.View entering={FadeInDown.duration(300).delay(80)}>
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
              <TouchableOpacity onPress={() => paywall.open('manual')}>
                <Text style={styles.trialCta}>{t('more.subscribe')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── C. SMART TOOLS GRID ──────────────────────────────────── */}
        <SectionTitle title={t('moreV2.smartTools')} />
        <Animated.View
          entering={FadeInDown.duration(350).delay(120)}
          style={styles.toolsGrid}
        >
          {smartTools.map((f) => {
            const accent = accentOf(C, f.accent);
            const locked = f.tier === 'pro' && !isPro;
            return (
              <PressScale
                key={f.id}
                onPress={() => goTo(f)}
                style={[styles.toolCard, { borderColor: C.cardBorder }]}
                haptic="selection"
                accessibilityRole="button"
                accessibilityLabel={t(f.titleKey)}
              >
                <View style={[styles.toolIconWrap, { backgroundColor: `${accent}22` }]}>
                  <Ionicons name={f.icon} size={20} color={accent} />
                </View>
                <Text style={styles.toolTitle} numberOfLines={2}>
                  {t(f.titleKey)}
                </Text>
                <View style={styles.toolBadgeRow}>
                  {locked ? (
                    <View style={styles.lockPill}>
                      <Ionicons name="lock-closed" size={9} color={C.textTertiary} />
                      <Text style={styles.proBadgeTiny}>PRO</Text>
                    </View>
                  ) : f.tier === 'pro' ? (
                    <View style={[styles.proBadgeSmall, { backgroundColor: `${C.secondary}25` }]}>
                      <Text style={[styles.proBadgeTiny, { color: C.secondary }]}>PRO</Text>
                    </View>
                  ) : null}
                </View>
              </PressScale>
            );
          })}
        </Animated.View>

        {/* ── D. MY FINANCES ──────────────────────────────────────── */}
        <SectionTitle title={t('moreV2.myFinances')} />
        <MenuList
          items={finance}
          onPress={goTo}
          isPro={isPro}
          C={C}
          t={t}
          styles={styles}
        />

        {/* ── E. DOCUMENTS & SHARING ─────────────────────────────── */}
        <SectionTitle title={t('moreV2.documentsSharing')} />
        <MenuList
          items={documents}
          onPress={goTo}
          isPro={isPro}
          C={C}
          t={t}
          styles={styles}
        />

        {/* ── F. ACCOUNT & SECURITY ─────────────────────────────── */}
        <SectionTitle title={t('moreV2.accountSecurity')} />
        <MenuList
          items={account}
          onPress={goTo}
          isPro={isPro}
          C={C}
          t={t}
          styles={styles}
        />

        {/* ── G. HELP & LEGAL ────────────────────────────────────── */}
        <SectionTitle title={t('moreV2.helpInfo')} />
        <MenuList
          items={help}
          onPress={goTo}
          isPro={isPro}
          C={C}
          t={t}
          styles={styles}
        />

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

function SectionTitle({ title }: { title: string }) {
  const C = useTheme();
  return (
    <Text style={{
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: FontWeights.semibold,
      marginTop: Spacing.lg,
      marginBottom: Spacing.sm,
      marginLeft: Spacing.xs,
      letterSpacing: -0.1,
    }}>
      {title}
    </Text>
  );
}

function MenuList({
  items,
  onPress,
  isPro,
  C,
  t,
  styles,
}: {
  items: BudgyFeature[];
  onPress: (f: BudgyFeature) => void;
  isPro: boolean;
  C: any;
  t: (k: string, p?: any) => string;
  styles: any;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.menuCard}>
      {items.map((f, i) => {
        const accent = accentOf(C, f.accent);
        const locked = f.tier === 'pro' && !isPro;
        const subtitle = f.subtitleKey ? t(f.subtitleKey) : undefined;
        return (
          <PressScale
            key={f.id}
            haptic="selection"
            onPress={() => onPress(f)}
            style={[
              styles.menuItem,
              i < items.length - 1 && styles.menuItemBorder,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(f.titleKey)}
          >
            <View style={styles.menuItemInner}>
              <View style={[styles.menuIcon, { backgroundColor: `${accent}20` }]}>
                <Ionicons name={f.icon} size={18} color={accent} />
              </View>
              <View style={styles.menuContent}>
                <View style={styles.menuTitleRow}>
                  <Text style={styles.menuTitle} numberOfLines={1}>
                    {t(f.titleKey)}
                  </Text>
                  {f.tier === 'pro' && (
                    <View style={locked ? styles.lockPill : styles.proBadgeSmall}>
                      {locked && (
                        <Ionicons
                          name="lock-closed"
                          size={9}
                          color={C.textTertiary}
                        />
                      )}
                      <Text
                        style={[
                          styles.proBadgeTiny,
                          !locked && { color: C.secondary },
                        ]}
                      >
                        PRO
                      </Text>
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
          </PressScale>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    content: { padding: Spacing.lg, maxWidth: 760, alignSelf: 'stretch', width: '100%' },

    // Profile — compact
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl,
      padding: 14,
      marginBottom: Spacing.lg,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: '#FFF',
      fontSize: FontSizes.md,
      fontWeight: FontWeights.bold,
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
    proTag: {
      backgroundColor: C.secondary,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    proTagText: {
      color: '#1C1917',
      fontSize: 10,
      fontWeight: FontWeights.black,
      letterSpacing: 0.5,
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

    // Pro hero — single card, elegant gradient
    proHero: {
      borderRadius: BorderRadius.xl,
      padding: 18,
    },
    proHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
      letterSpacing: 1,
    },
    proHeroTitle: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: FontWeights.black,
      letterSpacing: -0.5,
      lineHeight: 24,
    },
    proHeroDetails: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: FontWeights.medium,
      marginTop: 6,
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
      fontWeight: FontWeights.bold,
    },

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

    // Tools 2-col grid
    toolsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    toolCard: {
      width: '48%',
      minHeight: 92,
      backgroundColor: C.card,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: 12,
      justifyContent: 'space-between',
    },
    toolIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolTitle: {
      color: C.text,
      fontSize: 13,
      fontWeight: FontWeights.bold,
      letterSpacing: -0.2,
      marginTop: 8,
    },
    toolBadgeRow: {
      flexDirection: 'row',
      marginTop: 6,
    },

    // Menu lists (finance / documents / account / help)
    menuCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl,
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
      paddingHorizontal: Spacing.md,
      gap: Spacing.md,
    },
    menuIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
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

    proBadgeSmall: {
      paddingVertical: 2,
      paddingHorizontal: 7,
      borderRadius: 999,
      backgroundColor: 'rgba(52,211,153,0.15)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    lockPill: {
      paddingVertical: 2,
      paddingHorizontal: 7,
      borderRadius: 999,
      backgroundColor: C.cardHover,
      borderWidth: 1,
      borderColor: C.cardBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    proBadgeTiny: {
      color: C.textTertiary,
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
