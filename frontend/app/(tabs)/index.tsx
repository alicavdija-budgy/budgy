/**
 * GUARDIAN MONEY CHF - Home Screen (Redesigned)
 * Inspired by Monarch Money, Copilot, YNAB, Linxo.
 * Clean hierarchy: Hero balance → Daily spending → Quick actions → Insights.
 */

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Compact number formatter — CH style with apostrophes as thousands separator
const fmt = (n: number) => {
  const s = Math.round(Math.abs(n)).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
};
const fmt2 = (n: number) => {
  const rounded = (Math.round(n * 100) / 100).toFixed(2);
  const [int, dec] = rounded.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const {
    user,
    preferences,
    transactions,
    incomes,
    savingsGoals,
    budgets,
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

  // ─── Key financial metrics ───────────────────────────
  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
  }, [incomes]);

  // This month transactions
  const now = new Date();
  const thisMonthTx = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [transactions]);

  const monthExpenses = useMemo(
    () => thisMonthTx.reduce((s, t) => s + t.amount, 0),
    [thisMonthTx]
  );

  const monthlyRecurring = useMemo(
    () =>
      recurringExpenses
        .filter((r) => r.active && r.frequency === 'monthly')
        .reduce((sum, r) => sum + r.amount, 0),
    [recurringExpenses]
  );

  // "Safe to spend" = revenu - dépenses fixes - dépenses variables du mois
  const available = Math.max(0, monthlyIncome - monthlyRecurring - monthExpenses);
  const spentPct = monthlyIncome > 0 ? Math.min(100, ((monthExpenses + monthlyRecurring) / monthlyIncome) * 100) : 0;

  // Today & this week
  const today = new Date().toDateString();
  const todayExpenses = useMemo(
    () =>
      transactions
        .filter((t) => new Date(t.date).toDateString() === today)
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekExpenses = useMemo(
    () =>
      transactions
        .filter((t) => new Date(t.date) >= weekAgo)
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  // Savings
  const totalSaved = useMemo(
    () => savingsGoals.reduce((s, g) => s + g.saved, 0),
    [savingsGoals]
  );
  const totalTarget = useMemo(
    () => savingsGoals.reduce((s, g) => s + g.target, 0),
    [savingsGoals]
  );
  const savingsPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // Top categories of the month
  const topCategories = useMemo(() => {
    const byCategory: Record<string, number> = {};
    thisMonthTx.forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });
    return Object.entries(byCategory)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [thisMonthTx]);

  // Recent transactions (5 last)
  const recentTx = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [transactions]
  );

  // Next recurring payments (sorted by day of month)
  const upcomingBills = useMemo(() => {
    const dom = new Date().getDate();
    return recurringExpenses
      .filter((r) => r.active)
      .map((r) => {
        const day = r.dayOfMonth || 1;
        const daysUntil = day >= dom ? day - dom : 30 - dom + day;
        return { ...r, daysUntil };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 3);
  }, [recurringExpenses]);

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  const firstName = user?.name?.split(' ')[0] || '';

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        {/* ─── Minimal Header ─── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/more/notifications' as any)}>
            <Ionicons name="notifications-outline" size={22} color={C.text} />
            {unreadNotifs > 0 && (
              <View style={styles.notifDot}>
                <Text style={styles.notifDotText}>{unreadNotifs}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/(tabs)/more' as any)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || 'U').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ─── HERO: Safe to spend card ─── */}
        <LinearGradient
          colors={C.gradientPrimary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>DISPONIBLE CE MOIS</Text>
            {isPro && (
              <View style={styles.proPill}>
                <Ionicons name="flash" size={10} color="#FFF" />
                <Text style={styles.proPillText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroAmount}>
            {CUR} <Text style={styles.heroAmountBig}>{fmt(available)}</Text>
          </Text>

          <View style={styles.heroProgressBg}>
            <View
              style={[
                styles.heroProgressFill,
                { width: `${spentPct}%`, backgroundColor: spentPct > 85 ? '#FCA5A5' : 'rgba(255,255,255,0.9)' },
              ]}
            />
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Revenus</Text>
              <Text style={styles.heroStatValue}>{CUR} {fmt(monthlyIncome)}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Dépenses</Text>
              <Text style={styles.heroStatValue}>{CUR} {fmt(monthExpenses + monthlyRecurring)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ─── Quick stats row (today + week) ─── */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatCard}>
            <View style={styles.quickStatIconWrap}>
              <Ionicons name="today-outline" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickStatLabel}>Aujourd'hui</Text>
              <Text style={styles.quickStatValue}>{CUR} {fmt2(todayExpenses)}</Text>
            </View>
          </View>
          <View style={styles.quickStatCard}>
            <View style={[styles.quickStatIconWrap, { backgroundColor: `${C.orange}25` }]}>
              <Ionicons name="calendar-outline" size={18} color={C.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickStatLabel}>Cette semaine</Text>
              <Text style={styles.quickStatValue}>{CUR} {fmt(weekExpenses)}</Text>
            </View>
          </View>
        </View>

        {/* ─── Quick actions (2x2 grid like Monarch) ─── */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/scanner-modal' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${C.purple}20` }]}>
              <Ionicons name="scan" size={22} color={C.purple} />
            </View>
            <Text style={styles.actionLabel}>Scanner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/expenses' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${C.error}20` }]}>
              <Ionicons name="remove-circle" size={22} color={C.error} />
            </View>
            <Text style={styles.actionLabel}>Dépense</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/savings' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${C.success}20` }]}>
              <Ionicons name="trending-up" size={22} color={C.success} />
            </View>
            <Text style={styles.actionLabel}>Épargne</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/more/ai-optimizer' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${C.pink}20` }]}>
              <Ionicons name="sparkles" size={22} color={C.pink} />
            </View>
            <Text style={styles.actionLabel}>Économiser</Text>
            <View style={styles.newDot} />
          </TouchableOpacity>
        </View>

        {/* ─── Savings goal progress (if exists) ─── */}
        {savingsGoals.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Objectifs d'épargne</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/savings' as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.savingsCard}>
              <View style={styles.savingsTop}>
                <Text style={styles.savingsAmount}>{CUR} {fmt(totalSaved)}</Text>
                <Text style={styles.savingsTarget}>sur {CUR} {fmt(totalTarget)}</Text>
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
          </>
        )}

        {/* ─── Top categories (budget breakdown this month) ─── */}
        {topCategories.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top catégories ce mois</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/expenses' as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.catCard}>
              {topCategories.map((c, i) => {
                const pct = monthExpenses > 0 ? (c.amount / monthExpenses) * 100 : 0;
                const color = getCategoryColor(c.cat);
                return (
                  <View key={c.cat} style={[styles.catRow, i < topCategories.length - 1 && styles.catRowBorder]}>
                    <CategoryIcon category={c.cat} size="sm" />
                    <View style={styles.catMiddle}>
                      <Text style={styles.catName}>{getCategoryName(c.cat)}</Text>
                      <View style={styles.catBarBg}>
                        <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                      </View>
                    </View>
                    <View style={styles.catAmountBox}>
                      <Text style={styles.catAmount}>{CUR} {fmt(c.amount)}</Text>
                      <Text style={styles.catPct}>{Math.round(pct)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── Upcoming bills ─── */}
        {upcomingBills.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Prochains paiements</Text>
              <TouchableOpacity onPress={() => router.push('/more/recurring' as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.billsCard}>
              {upcomingBills.map((b, i) => (
                <View key={b.id} style={[styles.billRow, i < upcomingBills.length - 1 && styles.billRowBorder]}>
                  <View style={[styles.billDateBox, { backgroundColor: `${C.warning}20` }]}>
                    <Text style={[styles.billDateBig, { color: C.warning }]}>{b.dayOfMonth}</Text>
                    <Text style={[styles.billDateSmall, { color: C.warning }]}>
                      {b.daysUntil === 0 ? 'auj.' : `+${b.daysUntil}j`}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.billName}>{b.title}</Text>
                    <Text style={styles.billCategory}>{getCategoryName(b.category)}</Text>
                  </View>
                  <Text style={styles.billAmount}>{CUR} {fmt(b.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ─── Recent transactions ─── */}
        {recentTx.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Transactions récentes</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/expenses' as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recentCard}>
              {recentTx.map((t, i) => {
                const d = new Date(t.date);
                const isToday = d.toDateString() === new Date().toDateString();
                const dateLabel = isToday
                  ? "Aujourd'hui"
                  : d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
                return (
                  <View key={t.id} style={[styles.recentRow, i < recentTx.length - 1 && styles.recentRowBorder]}>
                    <CategoryIcon category={t.category} size="sm" />
                    <View style={styles.recentMiddle}>
                      <Text style={styles.recentTitle}>{t.title}</Text>
                      <Text style={styles.recentMeta}>
                        {dateLabel} · {getCategoryName(t.category)}
                      </Text>
                    </View>
                    <Text style={styles.recentAmount}>−{CUR} {fmt2(t.amount)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── AI insight teaser (if transactions exist) ─── */}
        {transactions.length >= 5 && (
          <TouchableOpacity
            style={styles.aiTeaser}
            activeOpacity={0.85}
            onPress={() => router.push('/more/ai-optimizer' as any)}
          >
            <LinearGradient
              colors={['#EC4899', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.aiTeaserGradient}
            >
              <Ionicons name="sparkles" size={28} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.aiTeaserTitle}>Trouvez des économies</Text>
                <Text style={styles.aiTeaserSub}>
                  L'IA analyse vos dépenses et propose des pistes concrètes
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ─── Empty state: call to action to add first income ─── */}
        {transactions.length === 0 && incomes.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="rocket-outline" size={48} color={C.primary} />
            <Text style={styles.emptyTitle}>Bienvenue sur Guardian 🇨🇭</Text>
            <Text style={styles.emptySub}>
              Commencez par ajouter votre revenu mensuel pour voir votre budget en temps réel.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(tabs)/savings' as any)}
            >
              <Text style={styles.emptyBtnText}>Ajouter mon premier revenu</Text>
            </TouchableOpacity>
          </View>
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
    greeting: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black },
    date: { color: C.textSecondary, fontSize: FontSizes.xs, marginTop: 2, textTransform: 'capitalize' },
    headerBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    notifDot: {
      position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
      borderRadius: 8, backgroundColor: C.error,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    notifDotText: { color: '#FFF', fontSize: 10, fontWeight: FontWeights.bold },
    avatar: {
      width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

    // Hero
    hero: {
      borderRadius: BorderRadius.xxl, padding: Spacing.xl, marginBottom: Spacing.md,
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroLabel: {
      color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1.2, textTransform: 'uppercase',
    },
    proPill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999,
    },
    proPillText: { color: '#FFF', fontSize: 9, fontWeight: FontWeights.black, letterSpacing: 0.5 },
    heroAmount: { color: '#FFF', fontSize: FontSizes.xl, fontWeight: FontWeights.semibold, marginTop: Spacing.sm, opacity: 0.85 },
    heroAmountBig: { color: '#FFF', fontSize: 44, fontWeight: FontWeights.black, opacity: 1 },
    heroProgressBg: {
      height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999,
      marginTop: Spacing.lg, overflow: 'hidden',
    },
    heroProgressFill: { height: '100%', borderRadius: 999 },
    heroStatsRow: {
      flexDirection: 'row', marginTop: Spacing.lg, alignItems: 'center',
    },
    heroStat: { flex: 1 },
    heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.md },
    heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
    heroStatValue: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: 2 },

    // Quick stats
    quickStats: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    quickStatCard: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, padding: Spacing.md,
    },
    quickStatIconWrap: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: `${C.primary}25`, alignItems: 'center', justifyContent: 'center',
    },
    quickStatLabel: { color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.semibold },
    quickStatValue: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: 1 },

    // Sections
    sectionTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
    sectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: Spacing.lg, marginBottom: Spacing.sm,
    },
    seeAll: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

    // Actions grid
    actionsGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    actionCard: {
      flex: 1, minWidth: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 4 - 1,
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
      position: 'absolute', top: 8, right: 10,
      width: 8, height: 8, borderRadius: 4, backgroundColor: C.error,
    },

    // Savings
    savingsCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, padding: Spacing.lg,
    },
    savingsTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    savingsAmount: { color: C.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black },
    savingsTarget: { color: C.textSecondary, fontSize: FontSizes.sm },
    savingsProgressBg: {
      height: 8, backgroundColor: C.cardHover, borderRadius: 999,
      marginTop: Spacing.md, overflow: 'hidden',
    },
    savingsProgressFill: { height: '100%', borderRadius: 999 },
    savingsPct: { color: C.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, marginTop: Spacing.sm },

    // Categories
    catCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md,
    },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
    catRowBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    catMiddle: { flex: 1 },
    catName: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: 6 },
    catBarBg: { height: 5, backgroundColor: C.cardHover, borderRadius: 999, overflow: 'hidden' },
    catBarFill: { height: '100%', borderRadius: 999 },
    catAmountBox: { alignItems: 'flex-end' },
    catAmount: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    catPct: { color: C.textTertiary, fontSize: 11, marginTop: 1 },

    // Bills
    billsCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md,
    },
    billRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
    billRowBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    billDateBox: {
      width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    },
    billDateBig: { fontSize: FontSizes.lg, fontWeight: FontWeights.black, lineHeight: 20 },
    billDateSmall: { fontSize: 10, fontWeight: FontWeights.bold, marginTop: 1 },
    billName: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    billCategory: { color: C.textTertiary, fontSize: 11, marginTop: 1 },
    billAmount: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },

    // Recent
    recentCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md,
    },
    recentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
    recentRowBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    recentMiddle: { flex: 1 },
    recentTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    recentMeta: { color: C.textTertiary, fontSize: 11, marginTop: 1, textTransform: 'capitalize' },
    recentAmount: { color: C.error, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

    // AI teaser
    aiTeaser: { marginTop: Spacing.lg, borderRadius: BorderRadius.xl, overflow: 'hidden' },
    aiTeaserGradient: {
      padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    aiTeaserTitle: { color: '#FFF', fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    aiTeaserSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSizes.xs, marginTop: 2 },

    // Empty state
    emptyBox: {
      alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.lg,
      backgroundColor: C.card, borderRadius: BorderRadius.xl, marginTop: Spacing.lg,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    emptyTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.md },
    emptySub: {
      color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center',
      marginTop: Spacing.sm, lineHeight: 20, marginBottom: Spacing.lg,
    },
    emptyBtn: {
      backgroundColor: C.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.lg,
    },
    emptyBtnText: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  });
