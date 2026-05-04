/**
 * BUDGY - Home Screen (Premium redesign)
 * Revolut/N26-inspired: glow hero, count-up, press-scale, minimal cognitive load.
 */

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { useOrganicPaywall } from '../../src/hooks/usePaywall';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useMoney } from '../../src/hooks/useMoney';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import AnimatedNumber from '../../src/components/AnimatedNumber';
import PressScale from '../../src/components/PressScale';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const fmt = (n: number) => {
  const s = Math.round(Math.abs(n)).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  useOrganicPaywall();
  const { t } = useTranslation();
  const m = useMoney();
  const {
    user,
    preferences,
    transactions,
    incomes,
    savingsGoals,
    recurringExpenses,
    notifications,
    isPro,
    loadSeedData,
  } = useStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.isDemo && transactions.length === 0 && incomes.length === 0) {
      loadSeedData();
    }
  }, [user]);

  const CUR = preferences.currency;

  // ─── Metrics ─────────────────────────────────────────
  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
  }, [incomes]);

  const now = new Date();
  const thisMonthTx = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [transactions]);

  const monthExpenses = thisMonthTx.reduce((s, t) => s + t.amount, 0);
  const monthlyRecurring = recurringExpenses
    .filter((r) => r.active && r.frequency === 'monthly')
    .reduce((sum, r) => sum + r.amount, 0);

  const available = Math.max(0, monthlyIncome - monthlyRecurring - monthExpenses);
  const spentPct = monthlyIncome > 0
    ? Math.min(100, ((monthExpenses + monthlyRecurring) / monthlyIncome) * 100)
    : 0;

  // Today / week
  const todayStr = new Date().toDateString();
  const todayExpenses = transactions
    .filter((t) => new Date(t.date).toDateString() === todayStr)
    .reduce((s, t) => s + t.amount, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekExpenses = transactions
    .filter((t) => new Date(t.date) >= weekAgo)
    .reduce((s, t) => s + t.amount, 0);

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const greeting = useMemo(() => t('home.hello'), [t]);
  const firstName = user?.name?.split(' ')[0] || '';

  // Savings preview
  const totalSaved = savingsGoals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = savingsGoals.reduce((s, g) => s + g.target, 0);
  const savingsPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // Hero glow pulse
  const glow = useSharedValue(0.35);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(0.65, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const styles = makeStyles(C);

  const quickActions = [
    { icon: 'scan' as const, label: 'Scanner', color: C.purple, route: '/scanner-modal' },
    { icon: 'cash' as const, label: 'Revenu', color: C.success, route: '/more/incomes' },
    { icon: 'remove-circle' as const, label: 'Dépense', color: C.error, route: '/(tabs)/expenses' },
    { icon: 'sparkles' as const, label: 'Économiser', color: C.secondary, route: '/more/ai-optimizer', isNew: true },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* ─── HEADER ─── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greeting}{firstName ? `, ${firstName}` : ''} 👋
            </Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <PressScale onPress={() => router.push('/more/notifications' as any)} style={styles.headerBtn}>
            <View style={styles.headerBtnInner}>
              <Ionicons name="notifications-outline" size={22} color={C.text} />
              {unreadNotifs > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>{unreadNotifs}</Text>
                </View>
              )}
            </View>
          </PressScale>
          <PressScale onPress={() => router.push('/(tabs)/more' as any)} style={styles.headerBtn}>
            <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </LinearGradient>
          </PressScale>
        </Animated.View>

        {/* ─── HERO CARD (glow + gradient + count-up) ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.heroWrap}>
          {/* Animated glow behind */}
          <Animated.View style={[styles.heroGlow, glowStyle, { backgroundColor: C.gradientGlow }]} />

          <LinearGradient
            colors={C.gradientHero as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>DISPONIBLE CE MOIS</Text>
              <View style={[styles.proPill, { backgroundColor: isPro ? 'rgba(251, 191, 36, 0.95)' : 'rgba(255,255,255,0.22)' }]}>
                <Ionicons name="flash" size={10} color={isPro ? '#1C1917' : '#FFF'} />
                <Text style={[styles.proPillText, { color: isPro ? '#1C1917' : '#FFF' }]}>
                  {isPro ? 'PRO' : 'Free'}
                </Text>
              </View>
            </View>

            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency}>{m.code}</Text>
              <AnimatedNumber
                value={m.convert(available)}
                duration={1400}
                style={styles.heroAmount}
              />
            </View>

            {/* progress bar */}
            <View style={styles.heroProgressBg}>
              <View style={[
                styles.heroProgressFill,
                { width: `${spentPct}%`, backgroundColor: spentPct > 85 ? '#FCA5A5' : 'rgba(255,255,255,0.95)' },
              ]} />
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <View style={styles.heroStatDot} />
                <View>
                  <Text style={styles.heroStatLabel}>Revenus</Text>
                  <Text style={styles.heroStatValue}>{m.format(monthlyIncome)}</Text>
                </View>
              </View>
              <View style={styles.heroStatSep} />
              <View style={styles.heroStat}>
                <View style={[styles.heroStatDot, { backgroundColor: '#FCA5A5' }]} />
                <View>
                  <Text style={styles.heroStatLabel}>Dépenses</Text>
                  <Text style={styles.heroStatValue}>{m.format(monthExpenses + monthlyRecurring)}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ─── 2 QUICK STATS ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.quickStats}>
          <View style={styles.quickStatCard}>
            <View style={[styles.quickStatIconWrap, { backgroundColor: `${C.error}20` }]}>
              <Ionicons name="today" size={18} color={C.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickStatLabel}>Aujourd'hui</Text>
              <Text style={styles.quickStatValue}>{m.format(todayExpenses)}</Text>
            </View>
          </View>
          <View style={styles.quickStatCard}>
            <View style={[styles.quickStatIconWrap, { backgroundColor: `${C.warning}20` }]}>
              <Ionicons name="calendar" size={18} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickStatLabel}>Cette semaine</Text>
              <Text style={styles.quickStatValue}>{m.format(weekExpenses)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ─── QUICK ACTIONS (4 cols) ─── */}
        <Animated.View entering={FadeInDown.duration(500).delay(300)}>
          <View style={styles.actionsGrid}>
            {quickActions.map((a) => (
              <PressScale
                key={a.label}
                haptic="light"
                onPress={() => router.push(a.route as any)}
                style={styles.actionCard}
              >
                <View style={styles.actionCardInner}>
                  <View style={[styles.actionIcon, { backgroundColor: `${a.color}20` }]}>
                    <Ionicons name={a.icon} size={22} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                  {a.isNew && <View style={[styles.newDot, { backgroundColor: C.error }]} />}
                </View>
              </PressScale>
            ))}
          </View>
        </Animated.View>

        {/* ─── SAVINGS progress ─── */}
        {savingsGoals.length > 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(400)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🎯 Objectifs</Text>
              <PressScale haptic="selection" onPress={() => router.push('/(tabs)/savings' as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </PressScale>
            </View>
            <View style={styles.savingsCard}>
              <View style={styles.savingsTop}>
                <AnimatedNumber
                  value={m.convert(totalSaved)}
                  prefix={`${m.code} `}
                  duration={1200}
                  style={styles.savingsAmount}
                />
                <Text style={styles.savingsTarget}>sur {m.format(totalTarget)}</Text>
              </View>
              <View style={styles.savingsProgressBg}>
                <LinearGradient
                  colors={C.gradientSuccess as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.savingsProgressFill, { width: `${Math.min(100, savingsPct)}%` }]}
                />
              </View>
              <Text style={styles.savingsPct}>{Math.round(savingsPct)}% atteint</Text>
            </View>
          </Animated.View>
        )}

        {/* ─── AI TEASER (hero-width banner) ─── */}
        {transactions.length >= 3 && (
          <Animated.View entering={FadeInDown.duration(500).delay(500)}>
            <PressScale haptic="medium" onPress={() => router.push('/more/ai-optimizer' as any)}>
              <LinearGradient
                colors={['#F43F5E', '#7C3AED', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.aiTeaser}
              >
                <View style={styles.aiSparkle}>
                  <Ionicons name="sparkles" size={28} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiTitle}>Trouvez des économies</Text>
                  <Text style={styles.aiSub}>L'IA analyse vos dépenses et propose des pistes concrètes</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#FFF" />
              </LinearGradient>
            </PressScale>
          </Animated.View>
        )}

        {/* ─── EMPTY STATE ─── */}
        {transactions.length === 0 && incomes.length === 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.emptyBox}>
            <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.emptyIcon}>
              <Ionicons name="rocket" size={32} color="#FFF" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>Bienvenue sur Budgy 🇨🇭</Text>
            <Text style={styles.emptySub}>
              Commencez par ajouter votre revenu mensuel pour voir votre budget en temps réel.
            </Text>
            <PressScale haptic="medium" onPress={() => router.push('/more/incomes' as any)}>
              <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>+ Ajouter mon salaire →</Text>
              </LinearGradient>
            </PressScale>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
    greeting: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black, letterSpacing: -0.5 },
    date: { color: C.textSecondary, fontSize: FontSizes.xs, marginTop: 2, textTransform: 'capitalize' },
    headerBtn: { borderRadius: 21 },
    headerBtnInner: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    notifDot: {
      position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17,
      borderRadius: 9, backgroundColor: C.error,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
      borderWidth: 2, borderColor: C.background,
    },
    notifDotText: { color: '#FFF', fontSize: 10, fontWeight: FontWeights.bold },
    avatar: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.bold },

    // HERO
    heroWrap: { marginBottom: Spacing.lg, position: 'relative' },
    heroGlow: {
      position: 'absolute', top: 30, left: 20, right: 20, bottom: -10,
      borderRadius: 60,
      filter: 'blur(40px)' as any,
    },
    hero: {
      borderRadius: BorderRadius.xxl, padding: Spacing.xl,
      overflow: 'hidden',
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroLabel: {
      color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1.3, textTransform: 'uppercase',
    },
    proPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    proPillText: { fontSize: 10, fontWeight: FontWeights.black, letterSpacing: 0.5 },

    heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: Spacing.md },
    heroCurrency: {
      color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xl,
      fontWeight: FontWeights.semibold, marginRight: 6,
    },
    heroAmount: {
      color: '#FFF', fontSize: 52, fontWeight: FontWeights.black,
      letterSpacing: -2, lineHeight: 58,
    },

    heroProgressBg: {
      height: 8, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999,
      marginTop: Spacing.lg, overflow: 'hidden',
    },
    heroProgressFill: { height: '100%', borderRadius: 999 },

    heroStatsRow: {
      flexDirection: 'row', marginTop: Spacing.lg, alignItems: 'center',
    },
    heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroStatDot: {
      width: 10, height: 10, borderRadius: 5, backgroundColor: '#6EE7B7',
    },
    heroStatSep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.sm },
    heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
    heroStatValue: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: 1 },

    // Quick stats
    quickStats: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    quickStatCard: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, padding: Spacing.md,
    },
    quickStatIconWrap: {
      width: 36, height: 36, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    quickStatLabel: { color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.semibold },
    quickStatValue: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: 1 },

    // Actions grid
    actionsGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    actionCard: { flex: 1 },
    actionCardInner: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs,
      alignItems: 'center', position: 'relative',
    },
    actionIcon: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs,
    },
    actionLabel: { color: C.text, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
    newDot: {
      position: 'absolute', top: 10, right: 10,
      width: 8, height: 8, borderRadius: 4,
    },

    // Sections
    sectionTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, letterSpacing: -0.3 },
    sectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: Spacing.md, marginBottom: Spacing.sm,
    },
    seeAll: { color: C.primaryLight, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

    // Savings
    savingsCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, padding: Spacing.lg,
    },
    savingsTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    savingsAmount: { color: C.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, letterSpacing: -1 },
    savingsTarget: { color: C.textSecondary, fontSize: FontSizes.sm },
    savingsProgressBg: {
      height: 10, backgroundColor: C.cardHover, borderRadius: 999,
      marginTop: Spacing.md, overflow: 'hidden',
    },
    savingsProgressFill: { height: '100%', borderRadius: 999 },
    savingsPct: { color: C.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, marginTop: Spacing.sm },

    // AI Teaser
    aiTeaser: {
      marginTop: Spacing.lg, borderRadius: BorderRadius.xl,
      padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    aiSparkle: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center', justifyContent: 'center',
    },
    aiTitle: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.black, letterSpacing: -0.3 },
    aiSub: { color: 'rgba(255,255,255,0.92)', fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },

    // Empty state
    emptyBox: {
      alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.lg,
      backgroundColor: C.card, borderRadius: BorderRadius.xl, marginTop: Spacing.lg,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    },
    emptyTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },
    emptySub: {
      color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center',
      marginBottom: Spacing.lg, lineHeight: 20,
    },
    emptyBtn: {
      paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.lg,
    },
    emptyBtnText: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.bold, letterSpacing: 0.3 },
  });
