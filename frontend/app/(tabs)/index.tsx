/**
 * GUARDIAN MONEY CHF - Home Screen
 * Dashboard with overview, quick actions, and notifications
 */

import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, ProgressBar, Badge, AmountDisplay } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import { DonutChart, MiniBarChart, RingProgress } from '../../src/components/Charts';
import { formatNumber, pct, calculateGuardianScore } from '../../src/utils/calculations';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    user,
    preferences,
    transactions,
    incomes,
    savingsGoals,
    budgets,
    recurringExpenses,
    investments,
    notifications,
    isPro,
    markNotificationRead,
    loadSeedData,
  } = useStore();

  // Auto-load seed data ONLY for demo users who have no data
  useEffect(() => {
    if (user?.isDemo && transactions.length === 0 && incomes.length === 0) {
      loadSeedData();
    }
  }, [user]);

  const [refreshing, setRefreshing] = React.useState(false);

  // Calculate totals
  const monthlyIncome = useMemo(() => {
    return incomes
      .filter(i => i.type === 'recurring' && i.frequency === 'monthly')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [incomes]);

  const totalExpenses = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const totalSaved = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.saved, 0);
  }, [savingsGoals]);

  const totalTarget = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.target, 0);
  }, [savingsGoals]);

  const monthlyAutoSave = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.autoSave, 0);
  }, [savingsGoals]);

  const monthlyRecurring = useMemo(() => {
    return recurringExpenses
      .filter(r => r.active && r.frequency === 'monthly')
      .reduce((sum, r) => sum + r.amount, 0);
  }, [recurringExpenses]);

  const totalInvestments = useMemo(() => {
    return investments.reduce((sum, i) => sum + i.quantity * i.currentPrice, 0);
  }, [investments]);

  const investmentPnL = useMemo(() => {
    return investments.reduce(
      (sum, i) => sum + i.quantity * (i.currentPrice - i.buyPrice),
      0
    );
  }, [investments]);

  const patrimoine = totalSaved + totalInvestments;

  const guardianScore = useMemo(() => {
    const savingsRate = monthlyIncome > 0 ? (monthlyAutoSave / monthlyIncome) * 100 : 0;
    const budgetsRespected = budgets.filter(b => {
      const spent = transactions
        .filter(t => t.category === b.category)
        .reduce((sum, t) => sum + t.amount, 0);
      return spent <= b.limit;
    }).length;
    
    return calculateGuardianScore(
      savingsRate,
      budgetsRespected,
      budgets.length,
      0, // anomalies count
      monthlyIncome > 0 ? monthlyRecurring / monthlyIncome : 0
    );
  }, [monthlyIncome, monthlyAutoSave, budgets, transactions, monthlyRecurring]);

  const unreadNotifications = notifications.filter(n => !n.read);

  // Expense breakdown by category for donut chart
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    transactions.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });
    return Object.entries(byCategory)
      .map(([cat, amount]) => ({
        value: amount,
        color: getCategoryColor(cat),
        label: getCategoryName(cat),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // Top 6 categories
  }, [transactions]);

  // Monthly trend data (simulated for demo)
  const monthlyTrend = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'];
    return months.map((label, i) => ({
      value: Math.round(totalExpenses * (0.7 + Math.random() * 0.6)),
      label,
      color: i === months.length - 1 ? Colors.primary : undefined,
    }));
  }, [totalExpenses]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  const CUR = preferences.currency;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}, {user?.name?.split(' ')[0] || 'Guest'} 👋</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('fr-CH', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.notifButton}
            onPress={() => router.push('/more/notifications')}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.text} />
            {unreadNotifications.length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadNotifications.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Pro Badge */}
        {!isPro && (
          <TouchableOpacity
            style={styles.proBanner}
            onPress={() => router.push('/more/subscription')}
            activeOpacity={0.8}
          >
            <View style={styles.proBannerContent}>
              <Ionicons name="flash" size={16} color={Colors.primary} />
              <Text style={styles.proBannerText}>
                GRATUIT · {transactions.length}/5 transactions
              </Text>
            </View>
            <Text style={styles.proBannerAction}>Pro →</Text>
          </TouchableOpacity>
        )}

        {/* Patrimoine Card */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroLabel}>Patrimoine total</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroAmount}>
              {CUR} {formatNumber(patrimoine)}
            </Text>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreValue}>{guardianScore}</Text>
              <Text style={styles.scoreLabel}>score</Text>
            </View>
          </View>
          <View style={styles.heroTrend}>
            <Ionicons name="trending-up" size={14} color={Colors.success} />
            <Text style={styles.heroTrendText}>+{Math.round(guardianScore / 5 + 8)}% 12 mois</Text>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            {[
              { label: 'Revenus', value: monthlyIncome, color: Colors.success, icon: 'arrow-up' },
              { label: 'Dépenses', value: totalExpenses, color: Colors.error, icon: 'arrow-down' },
              { label: 'Épargne', value: totalSaved, color: Colors.primary, icon: 'flag' },
              { label: 'Invest.', value: totalInvestments, color: investmentPnL >= 0 ? Colors.success : Colors.error, icon: 'trending-up' },
            ].map((stat, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.statItem}
                onPress={() => {
                  if (stat.label === 'Dépenses') router.push('/expenses');
                  else if (stat.label === 'Épargne') router.push('/savings');
                  else router.push('/more/analytics');
                }}
              >
                <Ionicons name={stat.icon as any} size={16} color={stat.color} />
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, { color: stat.color }]}>
                  {formatNumber(stat.value, 0)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Notifications */}
        {unreadNotifications.length > 0 && (
          <Card style={styles.notifsCard}>
            {unreadNotifications.slice(0, 2).map((notif, idx) => (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.notifItem,
                  idx < unreadNotifications.length - 1 && styles.notifItemBorder,
                ]}
                onPress={() => markNotificationRead(notif.id)}
              >
                <Text style={styles.notifIcon}>{notif.icon}</Text>
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{notif.title}</Text>
                  <Text style={styles.notifSubtitle}>{notif.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* ─── Expense Donut + Monthly Bars ─── */}
        {(expenseBreakdown.length > 0 || monthlyTrend.length > 0) && (
          <>
            <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
            <View style={styles.chartsRow}>
              {/* Donut Chart */}
              {expenseBreakdown.length > 0 && (
                <Card style={styles.chartCard}>
                  <Text style={styles.chartLabel}>Répartition</Text>
                  <DonutChart
                    data={expenseBreakdown}
                    size={140}
                    strokeWidth={22}
                    centerValue={formatNumber(totalExpenses, 0)}
                    centerLabel="CHF"
                  />
                  <View style={styles.legendGrid}>
                    {expenseBreakdown.slice(0, 4).map((item, idx) => (
                      <View key={idx} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <Text style={styles.legendText} numberOfLines={1}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Monthly Bars */}
              <Card style={styles.chartCard}>
                <Text style={styles.chartLabel}>Tendance 6 mois</Text>
                <MiniBarChart data={monthlyTrend} height={110} barWidth={24} />
              </Card>
            </View>

            {/* Budget Rings */}
            {budgets.length > 0 && (
              <Card style={styles.ringsCard}>
                <Text style={styles.chartLabel}>Budgets</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.ringsRow}>
                    {budgets.map(b => {
                      const spent = transactions
                        .filter(t => t.category === b.category)
                        .reduce((sum, t) => sum + t.amount, 0);
                      const pc = pct(spent, b.limit);
                      return (
                        <RingProgress
                          key={b.id}
                          value={pc}
                          size={70}
                          strokeWidth={7}
                          color={pc > 100 ? Colors.error : pc > 80 ? Colors.warning : getCategoryColor(b.category)}
                          label={getCategoryName(b.category)}
                          sublabel={`${formatNumber(spent)}/${formatNumber(b.limit)}`}
                        />
                      );
                    })}
                  </View>
                </ScrollView>
              </Card>
            )}
          </>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <View style={styles.actionsGrid}>
          {[
            { icon: 'arrow-up', label: 'Revenus', sub: 'flux', color: Colors.success, route: '/more/analytics' },
            { icon: 'arrow-down', label: 'Dépenses', sub: 'scan IA', color: Colors.error, route: '/expenses' },
            { icon: 'flag', label: 'Épargne', sub: 'objectifs', color: Colors.primary, route: '/savings' },
            { icon: 'wallet', label: 'Budgets', sub: 'enveloppes', color: Colors.warning, route: '/more/budgets' },
            { icon: 'refresh', label: 'Récurrents', sub: 'abonnements', color: Colors.purple, route: '/more/recurring' },
            { icon: 'calculator', label: 'Impôts', sub: 'Swiss Tax', color: Colors.info, route: '/more/tax-optimizer' },
          ].map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.actionItem, { borderColor: `${action.color}30` }]}
              onPress={() => router.push(action.route as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${action.color}15` }]}>
                <Ionicons name={action.icon as any} size={20} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionSub}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recurring Strip */}
        {recurringExpenses.filter(r => r.active).length > 0 && (
          <Card style={styles.recurringCard}>
            <View style={styles.recurringHeader}>
              <Text style={styles.recurringTitle}>🔄 Sorties ce mois</Text>
              <Text style={styles.recurringAmount}>-{formatNumber(monthlyRecurring, 0)} {CUR}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recurringScroll}>
              {recurringExpenses.filter(r => r.active).slice(0, 5).map(rec => (
                <View key={rec.id} style={styles.recurringItem}>
                  <CategoryIcon category={rec.category} size="sm" />
                  <Text style={styles.recurringItemTitle} numberOfLines={1}>{rec.title}</Text>
                  <Text style={styles.recurringItemAmount}>{formatNumber(rec.amount, 0)}</Text>
                  <Text style={styles.recurringItemDate}>Le {rec.dayOfMonth}</Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Savings Preview */}
        {savingsGoals.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🎯 Épargne</Text>
              <TouchableOpacity onPress={() => router.push('/savings')}>
                <Text style={styles.sectionAction}>Tout voir →</Text>
              </TouchableOpacity>
            </View>
            {savingsGoals.slice(0, 2).map(goal => (
              <Card key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    <Text style={styles.goalAuto}>{CUR} {formatNumber(goal.autoSave, 0)}/mois</Text>
                  </View>
                  <View style={styles.goalAmounts}>
                    <Text style={styles.goalSaved}>{formatNumber(goal.saved, 0)}</Text>
                    <Text style={styles.goalTarget}>/ {formatNumber(goal.target, 0)}</Text>
                  </View>
                </View>
                <ProgressBar
                  value={pct(goal.saved, goal.target)}
                  color={goal.color}
                  height={8}
                  showLabel
                />
              </Card>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  date: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  notifButton: {
    position: 'relative',
    padding: Spacing.sm,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: FontWeights.bold,
  },
  proBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  proBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  proBannerText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  proBannerAction: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  heroCard: {
    marginBottom: Spacing.lg,
  },
  heroLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroAmount: {
    color: Colors.text,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
  },
  scoreContainer: {
    alignItems: 'center',
    backgroundColor: `${Colors.primary}20`,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  scoreValue: {
    color: Colors.primary,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black,
  },
  scoreLabel: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  heroTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  heroTrendText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  statsGrid: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: 4,
  },
  statValue: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginTop: 2,
  },
  notifsCard: {
    marginBottom: Spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  notifItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  notifIcon: {
    fontSize: 24,
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  notifSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  chartsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  chartLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textTertiary,
    fontSize: 10,
    maxWidth: 70,
  },
  ringsCard: {
    marginBottom: Spacing.lg,
  },
  ringsRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionItem: {
    width: '30%',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionLabel: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  actionSub: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  recurringCard: {
    marginBottom: Spacing.lg,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recurringTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  recurringAmount: {
    color: Colors.error,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  recurringScroll: {
    marginHorizontal: -Spacing.sm,
  },
  recurringItem: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    width: 80,
  },
  recurringItemTitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  recurringItemAmount: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  recurringItemDate: {
    color: Colors.textTertiary,
    fontSize: 10,
  },
  goalCard: {
    marginBottom: Spacing.md,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  goalEmoji: {
    fontSize: 32,
    marginRight: Spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  goalAuto: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  goalAmounts: {
    alignItems: 'flex-end',
  },
  goalSaved: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  goalTarget: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
});
