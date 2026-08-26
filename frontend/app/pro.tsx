/**
 * BUDGY v3.9.0 — Budgy Pro screen (dedicated marketing + Pro hub).
 *
 * Dual role by user state:
 *   • FREE user  → immersive marketing screen (hero, benefit categories,
 *                  Free vs Pro matrix, CTA "Discover Budgy Pro" → /paywall)
 *   • PRO user   → same layout but each category card is a TAPPABLE shortcut
 *                  into the underlying Pro feature; CTA becomes "Manage sub"
 *
 * Strict Apple 2.1(b): NO price is shown here — the actual price lives on
 * /paywall (StoreKit `localizedPrice`). This is a benefits / discovery page.
 *
 * Never reintroduces:
 *   - startTrial() bypass
 *   - hardcoded "7 days" or "CHF 4.90"
 *   - local Pro grant
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import { useTranslation } from '../src/hooks/useTranslation';
import { usePremiumStore } from '../src/stores/usePremiumStore';
import { useIAP } from '../src/hooks/useIAP';
import PressScale from '../src/components/PressScale';

// ── Benefit categories (all localized) ───────────────────────────────────
type CategoryKey = 'ai' | 'automation' | 'analysis' | 'cloud' | 'invest';

interface Benefit {
  icon: keyof typeof Ionicons.glyphMap;
  key: string;
  /** Optional deep-link for PRO users (route to the actual feature) */
  proRoute?: string;
}

interface Category {
  key: CategoryKey;
  titleKey: string;
  subtitleKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string; // hex resolved from theme
  benefits: Benefit[];
}

const buildCategories = (C: any): Category[] => [
  {
    key: 'ai',
    titleKey: 'proScreen.catAI',
    subtitleKey: 'proScreen.catAISub',
    icon: 'sparkles',
    accent: C.pink,
    benefits: [
      { icon: 'flash',        key: 'proScreen.benefits.aiSaver', proRoute: '/more/ai-optimizer' },
      { icon: 'radio',        key: 'proScreen.benefits.aiRadar', proRoute: '/more/savings-radar' },
      { icon: 'trending-up',  key: 'proScreen.benefits.aiCoach', proRoute: '/more/predict' },
      { icon: 'calculator',   key: 'proScreen.benefits.aiTax',   proRoute: '/more/tax-optimizer' },
    ],
  },
  {
    key: 'automation',
    titleKey: 'proScreen.catAutomation',
    subtitleKey: 'proScreen.catAutomationSub',
    icon: 'flash-off',
    accent: C.purple,
    benefits: [
      { icon: 'scan',         key: 'proScreen.benefits.automOcr' },
      { icon: 'mail-open',    key: 'proScreen.benefits.automEmail', proRoute: '/more/email-import' },
      { icon: 'document-text',key: 'proScreen.benefits.automDocs' },
    ],
  },
  {
    key: 'analysis',
    titleKey: 'proScreen.catAnalysis',
    subtitleKey: 'proScreen.catAnalysisSub',
    icon: 'analytics',
    accent: C.info,
    benefits: [
      { icon: 'calendar',     key: 'proScreen.benefits.analyticsCal',    proRoute: '/more/financial-calendar' },
      { icon: 'speedometer',  key: 'proScreen.benefits.analyticsScore',  proRoute: '/more/budgy-score' },
      { icon: 'pulse',        key: 'proScreen.benefits.analyticsInsights' },
    ],
  },
  {
    key: 'cloud',
    titleKey: 'proScreen.catCloud',
    subtitleKey: 'proScreen.catCloudSub',
    icon: 'cloud-done',
    accent: C.teal,
    benefits: [
      { icon: 'cloud-upload', key: 'proScreen.benefits.cloudSync',   proRoute: '/more/cloud-sync' },
      { icon: 'download',     key: 'proScreen.benefits.cloudExport', proRoute: '/more/export-pdf' },
      { icon: 'shield-checkmark', key: 'proScreen.benefits.cloudBackup' },
    ],
  },
  {
    key: 'invest',
    titleKey: 'proScreen.catInvest',
    subtitleKey: 'proScreen.catInvestSub',
    icon: 'stats-chart',
    accent: C.success,
    benefits: [
      { icon: 'briefcase',    key: 'proScreen.benefits.investPortfolio', proRoute: '/more/investments' },
      { icon: 'trending-up',  key: 'proScreen.benefits.investAnalysis' },
    ],
  },
];

// ── Free vs Pro matrix rows ──────────────────────────────────────────────
interface MatrixRow {
  labelKey: string;
  free: string | 'yes' | 'no';
  pro: string | 'yes';
}

const MATRIX: MatrixRow[] = [
  { labelKey: 'proScreen.matrix.transactions', free: 'yes', pro: 'yes' },
  { labelKey: 'proScreen.matrix.budgetsBasic', free: 'yes', pro: 'yes' },
  { labelKey: 'proScreen.matrix.savings',      free: 'proScreen.matrix.savingsFree', pro: 'proScreen.matrix.savingsPro' },
  { labelKey: 'proScreen.matrix.aiTools',      free: 'no',  pro: 'yes' },
  { labelKey: 'proScreen.matrix.cloud',        free: 'no',  pro: 'yes' },
  { labelKey: 'proScreen.matrix.exports',      free: 'no',  pro: 'yes' },
  { labelKey: 'proScreen.matrix.tax',          free: 'no',  pro: 'yes' },
  { labelKey: 'proScreen.matrix.investments',  free: 'no',  pro: 'yes' },
  { labelKey: 'proScreen.matrix.priority',     free: 'no',  pro: 'yes' },
];

export default function ProScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  const isTrial = usePremiumStore(
    (s) => s.trialEndsAt !== null && s.trialEndsAt > Date.now() && !s.plan
  );
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const subscriptionStartedAt = usePremiumStore((s) => s.subscriptionStartedAt);
  const iap = useIAP();
  const [restoring, setRestoring] = useState(false);

  const styles = useMemo(() => makeStyles(C), [C]);
  const CATEGORIES = useMemo(() => buildCategories(C), [C]);

  const handleDiscover = () => router.push('/paywall?trigger=manual' as any);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const r = await iap.restore();
      if (r.success && (r.state === 'PRO' || r.state === 'GRACE_PERIOD')) {
        Alert.alert(t('paywall.restoreDoneTitle'), t('paywall.restoreDoneBody', { n: r.restored ?? 1 }));
      } else if (r.success && (r.restored ?? 0) === 0) {
        Alert.alert(t('paywall.restoreNoneTitle'), t('paywall.restoreNoneBody'));
      } else if (r.state === 'EXPIRED' || r.state === 'REFUNDED') {
        Alert.alert(t('paywall.restoreExpiredTitle'), t('paywall.restoreExpiredBody'));
      } else if (r.cancelled) {
        // silent — user cancelled Apple sheet
      } else {
        Alert.alert(t('paywall.restoreFailedTitle'), t('paywall.restoreFailedBody'));
      }
    } catch {
      Alert.alert(t('paywall.restoreFailedTitle'), t('paywall.restoreFailedBody'));
    } finally {
      setRestoring(false);
    }
  };

  const handleBenefitTap = (benefit: Benefit) => {
    if (isPro && benefit.proRoute) {
      router.push(benefit.proRoute as any);
    } else if (!isPro) {
      handleDiscover();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="back"
        >
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('proScreen.screenTitle')}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(360)}>
          <LinearGradient
            colors={['#064E3B', '#0F766E', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroBadge}>
              <Ionicons name="diamond" size={14} color="#FFF" />
              <Text style={styles.heroBadgeText}>{t('proScreen.heroBrand')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('proScreen.heroTitle')}</Text>
            <Text style={styles.heroSub}>{t('proScreen.heroSub')}</Text>

            {/* Ambient sparkles (pure JS shapes, no external assets) */}
            <View style={styles.heroBlobA} />
            <View style={styles.heroBlobB} />

            {isPro ? (
              <View style={styles.proStatusRow}>
                <View style={styles.statusPill}>
                  <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                  <Text style={styles.statusPillText}>
                    {isTrial && trialEndsAt
                      ? `${t('proScreen.trialUntil')} ${new Date(trialEndsAt).toLocaleDateString()}`
                      : subscriptionStartedAt
                        ? `${t('proScreen.activeSince')} ${new Date(subscriptionStartedAt).toLocaleDateString()}`
                        : t('proScreen.yourPlan')}
                  </Text>
                </View>
              </View>
            ) : null}
          </LinearGradient>
        </Animated.View>

        {/* ── PRIMARY CTA ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(360).delay(80)}>
          <TouchableOpacity
            onPress={handleDiscover}
            activeOpacity={0.92}
            style={styles.primaryCta}
            accessibilityRole="button"
            accessibilityLabel={isPro ? t('proScreen.ctaManage') : t('proScreen.ctaDiscover')}
          >
            <LinearGradient
              colors={isPro ? [C.card, C.cardHover] : ['#10B981', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryCtaGradient}
            >
              <Text style={[styles.primaryCtaText, isPro && { color: C.text }]}>
                {isPro ? t('proScreen.ctaManage') : t('proScreen.ctaDiscover')}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={isPro ? C.text : '#FFF'}
              />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.trustRow}>
            <View style={styles.trustPill}>
              <Ionicons name="shield-checkmark" size={12} color={C.textSecondary} />
              <Text style={styles.trustText}>{t('proScreen.trustSecure')}</Text>
            </View>
            <View style={styles.trustPill}>
              <Ionicons name="close-circle" size={12} color={C.textSecondary} />
              <Text style={styles.trustText}>{t('proScreen.trustNoCommit')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── CATEGORY CARDS ─────────────────────────────────────── */}
        {CATEGORIES.map((cat, idx) => (
          <Animated.View
            key={cat.key}
            entering={FadeInDown.duration(320).delay(120 + idx * 50)}
            style={styles.catCard}
          >
            <View style={styles.catHeader}>
              <View
                style={[styles.catIconWrap, { backgroundColor: `${cat.accent}22` }]}
              >
                <Ionicons name={cat.icon} size={20} color={cat.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catTitle}>{t(cat.titleKey)}</Text>
                <Text style={styles.catSub}>{t(cat.subtitleKey)}</Text>
              </View>
            </View>

            <View style={styles.benefitList}>
              {cat.benefits.map((b, i) => {
                const clickable = isPro ? !!b.proRoute : true;
                return (
                  <TouchableOpacity
                    key={b.key}
                    disabled={!clickable}
                    activeOpacity={0.7}
                    onPress={() => handleBenefitTap(b)}
                    style={[
                      styles.benefitItem,
                      i < cat.benefits.length - 1 && styles.benefitItemBorder,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t(b.key)}
                  >
                    <View style={styles.benefitLeft}>
                      <Ionicons name={b.icon} size={16} color={cat.accent} />
                      <Text style={styles.benefitText} numberOfLines={2}>{t(b.key)}</Text>
                    </View>
                    {clickable && (
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={C.textTertiary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ))}

        {/* ── FREE vs PRO MATRIX ─────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(360).delay(400)}
          style={styles.matrixCard}
        >
          <Text style={styles.matrixTitle}>{t('proScreen.comparisonTitle')}</Text>
          <View style={styles.matrixHeader}>
            <Text style={[styles.matrixHeaderCell, { flex: 2, textAlign: 'left' }]}>
              {'\u00A0'}
            </Text>
            <Text style={styles.matrixHeaderCell}>
              {t('proScreen.comparisonFree')}
            </Text>
            <Text style={[styles.matrixHeaderCell, { color: C.secondary }]}>
              {t('proScreen.comparisonPro')}
            </Text>
          </View>
          {MATRIX.map((row, i) => {
            const freeLabel =
              row.free === 'yes'
                ? '✓'
                : row.free === 'no'
                  ? t('proScreen.matrix.no')
                  : t(row.free);
            const proLabel = row.pro === 'yes' ? '✓' : t(row.pro);
            return (
              <View
                key={row.labelKey}
                style={[
                  styles.matrixRow,
                  i < MATRIX.length - 1 && styles.matrixRowBorder,
                ]}
              >
                <Text style={styles.matrixLabel} numberOfLines={2}>
                  {t(row.labelKey)}
                </Text>
                <Text
                  style={[
                    styles.matrixValue,
                    row.free === 'no' && { color: C.textMuted, fontWeight: '400' },
                  ]}
                >
                  {freeLabel}
                </Text>
                <Text style={[styles.matrixValue, { color: C.secondary, fontWeight: '800' }]}>
                  {proLabel}
                </Text>
              </View>
            );
          })}
        </Animated.View>

        {/* ── SECONDARY CTA + RESTORE ────────────────────────────── */}
        {!isPro && (
          <Animated.View entering={FadeIn.duration(360).delay(500)}>
            <TouchableOpacity
              onPress={handleDiscover}
              activeOpacity={0.92}
              style={styles.secondaryCta}
            >
              <LinearGradient
                colors={['#10B981', '#06B6D4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryCtaGradient}
              >
                <Text style={styles.primaryCtaText}>{t('proScreen.ctaDiscover')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.trustFooter}>{t('proScreen.trustPriceStore')}</Text>
          </Animated.View>
        )}

        <TouchableOpacity
          onPress={handleRestore}
          disabled={restoring}
          style={styles.restoreBtn}
          accessibilityRole="button"
          accessibilityLabel={t('proScreen.ctaRestore')}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={C.textSecondary} />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color={C.textSecondary} />
              <Text style={styles.restoreText}>{t('proScreen.ctaRestore')}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
    },
    backBtn: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: FontWeights.bold,
      color: C.text,
      letterSpacing: -0.2,
    },
    content: {
      padding: Spacing.lg,
      maxWidth: 700,
      alignSelf: 'stretch',
      width: '100%',
    },

    // Hero
    hero: {
      borderRadius: 24,
      padding: 22,
      marginBottom: Spacing.lg,
      overflow: 'hidden',
      minHeight: 190,
    },
    heroBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.18)',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    heroBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: FontWeights.black,
      letterSpacing: 1,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: FontWeights.black,
      letterSpacing: -0.6,
      lineHeight: 30,
      marginTop: 12,
      maxWidth: 300,
    },
    heroSub: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 14,
      fontWeight: FontWeights.medium,
      marginTop: 10,
      lineHeight: 19,
      maxWidth: 340,
    },
    heroBlobA: {
      position: 'absolute',
      right: -30,
      top: -30,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroBlobB: {
      position: 'absolute',
      right: 30,
      bottom: -40,
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    proStatusRow: { flexDirection: 'row', marginTop: 14 },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.28)',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    statusPillText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: FontWeights.bold,
    },

    // Primary CTA
    primaryCta: {
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 12,
      shadowColor: '#0EA5E9',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    primaryCtaGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      paddingHorizontal: 20,
      gap: 8,
    },
    primaryCtaText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: FontWeights.black,
      letterSpacing: -0.2,
    },
    trustRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    trustPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 9,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 999,
    },
    trustText: {
      color: C.textSecondary,
      fontSize: 10.5,
      fontWeight: FontWeights.semibold,
    },
    trustFooter: {
      color: C.textTertiary,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 6,
    },

    // Category cards
    catCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    catHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    catIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: FontWeights.black,
      letterSpacing: -0.2,
    },
    catSub: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 1,
    },
    benefitList: {},
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 9,
      paddingHorizontal: 4,
      minHeight: 44,
    },
    benefitItemBorder: {
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    benefitLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      paddingRight: 24,
    },
    benefitText: {
      color: C.text,
      fontSize: 13,
      lineHeight: 17,
      flexShrink: 1,
      fontWeight: FontWeights.medium,
    },

    // Matrix
    matrixCard: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 18,
      padding: 14,
      marginTop: Spacing.md,
      marginBottom: Spacing.md,
    },
    matrixTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: FontWeights.black,
      letterSpacing: -0.2,
      marginBottom: 10,
    },
    matrixHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    matrixHeaderCell: {
      flex: 1,
      textAlign: 'center',
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: FontWeights.black,
      letterSpacing: 0.5,
    },
    matrixRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
    },
    matrixRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    matrixLabel: {
      flex: 2,
      color: C.text,
      fontSize: 12.5,
      fontWeight: FontWeights.medium,
    },
    matrixValue: {
      flex: 1,
      textAlign: 'center',
      color: C.text,
      fontSize: 13,
      fontWeight: FontWeights.bold,
    },

    // Secondary CTA
    secondaryCta: {
      borderRadius: 16,
      overflow: 'hidden',
      marginTop: Spacing.sm,
    },
    restoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      marginTop: 4,
    },
    restoreText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: FontWeights.semibold,
    },
  });
