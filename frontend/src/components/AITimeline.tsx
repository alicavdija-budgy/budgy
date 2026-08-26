/**
 * BUDGY — AI Timeline (proactive insights feed) — i18n & theme aware
 *
 * @i18n-technical-file
 *
 * ⚠ The `PRETTY` map holds internal category → label mappings whose values
 * are passed as `t(titleKey, { cat: meta.label })` parameters. Multi-locale
 * mapping is planned via i18n keys `timeline.cat.*` (v3.9.1 backlog).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import { useFeatureFlag, FREE_LIMITS } from '../services/featureFlags';
import { useTheme, useThemeMode } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import SoftPaywall from './SoftPaywall';

type Tone = 'positive' | 'info' | 'warning' | 'alert' | 'tip';

interface Insight {
  id: string;
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  titleParams?: Record<string, any>;
  subKey?: string;
  subParams?: Record<string, any>;
  delta?: string;
  weight: number;
}

const TONE: Record<Tone, { primary: string; soft: string; rail: string; halo: string }> = {
  positive: { primary: '#16E0C6', soft: '#7BFCE3', rail: 'rgba(22, 224, 198, 0.65)',  halo: 'rgba(22, 224, 198, 0.10)'  },
  info:     { primary: '#74B2FF', soft: '#B2D6FF', rail: 'rgba(116, 178, 255, 0.65)', halo: 'rgba(116, 178, 255, 0.08)' },
  warning:  { primary: '#FFCB6B', soft: '#FFE0A8', rail: 'rgba(255, 203, 107, 0.70)', halo: 'rgba(255, 203, 107, 0.10)' },
  alert:    { primary: '#FF7A8A', soft: '#FFB1B9', rail: 'rgba(255, 122, 138, 0.70)', halo: 'rgba(255, 122, 138, 0.10)' },
  tip:      { primary: '#BE99FF', soft: '#D8C2FF', rail: 'rgba(190, 153, 255, 0.65)', halo: 'rgba(190, 153, 255, 0.08)' },
};

interface GenInput {
  transactions: any[];
  incomes: any[];
  recurring: any[];
  goals: any[];
}

function generateInsights({ transactions, incomes, recurring, goals }: GenInput): Insight[] {
  const out: Insight[] = [];
  const now = new Date();

  const monthlyIncome = incomes.reduce((s: number, i: any) => {
    if (i.type && i.type !== 'recurring') return s;
    const a = Number(i.amount) || 0;
    if (i.frequency === 'yearly') return s + a / 12;
    if (i.frequency === 'quarterly') return s + a / 3;
    return s + a;
  }, 0);

  const monthlyRecurring = recurring
    .filter((r: any) => r.active !== false && (!r.frequency || r.frequency === 'monthly'))
    .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const subsActive = recurring.filter((r: any) => r.active !== false);

  const dayMs = 24 * 60 * 60 * 1000;
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setHours(0, 0, 0, 0);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay());
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * dayMs);

  let thisWeek = 0, lastWeek = 0;
  const byCategoryMonth: Record<string, number> = {};
  const ofThisMonth: any[] = [];

  for (const t of transactions) {
    const d = new Date(t.date);
    const amt = Number(t.amount) || 0;
    if (d >= startOfThisWeek) thisWeek += amt;
    else if (d >= startOfLastWeek) lastWeek += amt;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      ofThisMonth.push(t);
      const k = (t.category || 'autre').toLowerCase();
      byCategoryMonth[k] = (byCategoryMonth[k] || 0) + amt;
    }
  }

  const monthExpenses = Object.values(byCategoryMonth).reduce((s, v) => s + v, 0) + monthlyRecurring;
  const ratio = monthlyIncome > 0 ? (monthlyIncome - monthExpenses) / monthlyIncome : 0;

  // weekly variation
  if (lastWeek > 0 && thisWeek >= 0) {
    const delta = ((thisWeek - lastWeek) / lastWeek) * 100;
    if (delta >= 10) {
      out.push({
        id: 'week-up', tone: delta >= 30 ? 'alert' : 'warning', icon: 'trending-up',
        titleKey: 'timeline.insWeekUp', titleParams: { p: Math.round(delta) },
        subKey: 'timeline.insWeekUpSub',
        delta: `+${Math.round(delta)}%`, weight: Math.min(100, 50 + delta),
      });
    } else if (delta <= -10) {
      out.push({
        id: 'week-down', tone: 'positive', icon: 'trending-down',
        titleKey: 'timeline.insWeekDown', titleParams: { p: Math.abs(Math.round(delta)) },
        subKey: 'timeline.insWeekDownSub',
        delta: `${Math.round(delta)}%`, weight: 60 + Math.abs(delta) / 2,
      });
    } else {
      out.push({
        id: 'week-stable', tone: 'info', icon: 'pulse',
        titleKey: 'timeline.insWeekStable', subKey: 'timeline.insWeekStableSub', weight: 30,
      });
    }
  }

  // top spending category
  const catEntries = Object.entries(byCategoryMonth).sort((a, b) => b[1] - a[1]);
  const topCat = catEntries[0];
  if (topCat && monthExpenses > 0) {
    const [cat, amt] = topCat;
    const share = (amt / monthExpenses) * 100;
    const PRETTY: Record<string, { label: string; tip: 'good' | 'watch' }> = {
      alimentation:   { label: 'alimentation', tip: 'good' },
      restaurant:     { label: 'restaurants',  tip: 'watch' },
      restaurants:    { label: 'restaurants',  tip: 'watch' },
      essence:        { label: 'transport',    tip: 'watch' },
      transport:      { label: 'transport',    tip: 'watch' },
      shopping:       { label: 'shopping',     tip: 'watch' },
      loisirs:        { label: 'loisirs',      tip: 'watch' },
      logement:       { label: 'logement',     tip: 'good' },
      sante:          { label: 'santé',        tip: 'good' },
      assurance:      { label: 'assurances',   tip: 'good' },
    };
    const meta = PRETTY[cat] || { label: cat, tip: 'good' as const };
    if (meta.tip === 'good' && share <= 35) {
      out.push({
        id: 'cat-good', tone: 'positive', icon: 'checkmark-circle',
        titleKey: 'timeline.insCatGood', titleParams: { cat: meta.label },
        subKey: 'timeline.insCatGoodSub', subParams: { p: Math.round(share) }, weight: 55,
      });
    } else if (share >= 30) {
      const isWatch = meta.tip === 'watch';
      out.push({
        id: 'cat-watch', tone: isWatch ? 'warning' : 'info', icon: 'pie-chart',
        titleKey: 'timeline.insCatWatch', titleParams: { cat: cat[0].toUpperCase() + cat.slice(1), p: Math.round(share) },
        subKey: isWatch ? 'timeline.insCatWatchSubWatch' : 'timeline.insCatWatchSubInfo',
        subParams: { cat: meta.label }, delta: `${Math.round(share)}%`, weight: 65,
      });
    }
  }

  // subs
  if (subsActive.length >= 8) {
    out.push({
      id: 'subs-many', tone: 'warning', icon: 'sync',
      titleKey: 'timeline.insSubsMany', titleParams: { n: subsActive.length },
      subKey: 'timeline.insSubsManySub', delta: `${subsActive.length}`, weight: 75,
    });
  } else if (subsActive.length >= 4 && subsActive.length <= 7) {
    out.push({
      id: 'subs-ok', tone: 'info', icon: 'sync',
      titleKey: 'timeline.insSubsOk', titleParams: { n: subsActive.length },
      subKey: 'timeline.insSubsOkSub', weight: 25,
    });
  }

  // savings
  if (goals.length > 0) {
    const totalSaved = goals.reduce((s, g) => s + Number(g.saved ?? 0), 0);
    const totalTarget = goals.reduce((s, g) => s + Number(g.target ?? 0), 0);
    const pct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    if (pct >= 60) {
      out.push({
        id: 'savings-good', tone: 'positive', icon: 'trophy',
        titleKey: 'timeline.insSavingsGood',
        subKey: 'timeline.insSavingsGoodSub', subParams: { p: Math.round(pct) },
        delta: `${Math.round(pct)}%`, weight: 70,
      });
    } else if (pct >= 20) {
      out.push({
        id: 'savings-mid', tone: 'info', icon: 'trending-up',
        titleKey: 'timeline.insSavingsMid',
        subKey: 'timeline.insSavingsMidSub', subParams: { p: Math.round(pct) }, weight: 40,
      });
    }
  }

  // anomaly
  if (ofThisMonth.length >= 4) {
    const amounts = ofThisMonth.map((t: any) => Number(t.amount) || 0);
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const max = Math.max(...amounts);
    if (max > avg * 3 && max > 80) {
      const txn = ofThisMonth.find((t: any) => Number(t.amount) === max);
      out.push({
        id: 'anomaly', tone: 'alert', icon: 'warning',
        titleKey: 'timeline.insAnomaly',
        subKey: txn?.title ? 'timeline.insAnomalySub' : 'timeline.insAnomalySubNoTitle',
        subParams: { title: txn?.title || '', a: max.toFixed(0), r: (max / avg).toFixed(1) },
        delta: `×${(max / avg).toFixed(1)}`, weight: 80,
      });
    }
  }

  // mood
  if (ratio >= 0.35 && monthlyIncome > 0) {
    out.push({
      id: 'mood-excellent', tone: 'positive', icon: 'star',
      titleKey: 'timeline.insMoodExc',
      subKey: 'timeline.insMoodExcSub', subParams: { p: Math.round(ratio * 100) },
      delta: `${Math.round(ratio * 100)}%`, weight: 85,
    });
  } else if (ratio < 0 && monthlyIncome > 0) {
    out.push({
      id: 'mood-risk', tone: 'alert', icon: 'alert-circle',
      titleKey: 'timeline.insMoodRisk',
      subKey: 'timeline.insMoodRiskSub',
      delta: `${Math.round(ratio * 100)}%`, weight: 95,
    });
  }

  // tip
  if (out.length < 2 && transactions.length > 0) {
    out.push({
      id: 'tip-explore', tone: 'tip', icon: 'sparkles',
      titleKey: 'timeline.insTip', subKey: 'timeline.insTipSub', weight: 20,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

function InsightCard({ insight, index, theme, isLight, t }: { insight: Insight; index: number; theme: any; isLight: boolean; t: any }) {
  const tone = TONE[insight.tone];
  return (
    <Animated.View
      entering={FadeInDown.duration(420).delay(80 + index * 70).springify().damping(16)}
      style={[
        {
          backgroundColor: isLight ? theme.card : 'rgba(255,255,255,0.025)',
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.cardBorder,
          overflow: 'hidden',
          minHeight: 60,
        },
        Platform.select({
          ios: {
            shadowColor: tone.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isLight ? 0.10 : 0.18,
            shadowRadius: 14,
          },
          android: { elevation: 2 },
          default: {},
        }) as any,
      ]}
    >
      <View style={[styles.rail, { backgroundColor: tone.rail }]} />
      <View style={[styles.cardSheen, { backgroundColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.08)' }]} pointerEvents="none" />
      <LinearGradient
        colors={[tone.halo, isLight ? 'rgba(15,23,42,0.01)' : 'rgba(255,255,255,0.012)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill as any}
      />
      <View style={styles.cardInner}>
        <View style={[styles.iconOrb, { backgroundColor: tone.halo, borderColor: tone.rail }]}>
          <Ionicons name={insight.icon} size={16} color={tone.primary} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {t(insight.titleKey, insight.titleParams)}
          </Text>
          {!!insight.subKey && (
            <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={2}>
              {t(insight.subKey, insight.subParams)}
            </Text>
          )}
        </View>
        {!!insight.delta && (
          <View style={[styles.deltaPill, { borderColor: tone.rail, backgroundColor: tone.halo }]}>
            <Text style={[styles.deltaTxt, { color: tone.primary }]}>{insight.delta}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function AITimeline() {
  const transactions = useStore((s) => s.transactions);
  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const goals = useStore((s) => s.savingsGoals);
  const theme = useTheme();
  const themeMode = useThemeMode();
  const isLight = themeMode === 'light';
  const { t } = useTranslation();
  const advanced = useFeatureFlag('canUseAdvancedTimeline');
  const [paywallOpen, setPaywallOpen] = useState(false);

  const allInsights = useMemo(
    () => generateInsights({ transactions: transactions || [], incomes: incomes || [], recurring: recurring || [], goals: goals || [] }),
    [transactions, incomes, recurring, goals],
  );

  const visible = advanced.enabled
    ? allInsights
    : allInsights.slice(0, FREE_LIMITS.timelineInsightsCap);
  const hidden = allInsights.length - visible.length;

  if (allInsights.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.textTertiary }]}>{t('timeline.eyebrow')}</Text>
        <View style={styles.liveDot} />
      </Animated.View>
      {visible.map((ins, i) => (
        <InsightCard key={ins.id} insight={ins} index={i} theme={theme} isLight={isLight} t={t} />
      ))}

      {hidden > 0 && (
        <Animated.View entering={FadeInDown.duration(420).delay(80 + visible.length * 70)}>
          <Pressable
            onPress={() => setPaywallOpen(true)}
            style={({ pressed }) => [
              styles.lockCard,
              {
                backgroundColor: isLight ? theme.card : 'rgba(255,255,255,0.02)',
                borderColor: 'rgba(22,224,198,0.32)',
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <LinearGradient
              colors={['rgba(22,224,198,0.10)', 'rgba(22,224,198,0.02)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill as any}
            />
            <View style={styles.lockOrb}>
              <Ionicons name="sparkles" size={14} color="#16E0C6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockTitle, { color: theme.text }]}>
                {t(hidden > 1 ? 'timeline.lockTitlePlural' : 'timeline.lockTitle', { n: hidden })}
              </Text>
              <Text style={[styles.lockSub, { color: theme.textSecondary }]}>{t('timeline.lockSub')}</Text>
            </View>
            <Ionicons name="lock-closed" size={14} color="rgba(22,224,198,0.85)" />
          </Pressable>
        </Animated.View>
      )}

      <SoftPaywall
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title={t('softPaywall.timelineTitle')}
        subtitle={t('softPaywall.timelineSubtitle')}
        icon="analytics"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12, gap: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 2, marginBottom: 4,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#16E0C6',
    shadowColor: '#16E0C6', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  cardSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  cardInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, paddingLeft: 16, gap: 12,
  },
  iconOrb: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.1, lineHeight: 18 },
  cardSub: { fontSize: 11.5, lineHeight: 15 },
  deltaPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deltaTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  lockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  lockOrb: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(22,224,198,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,224,198,0.32)',
  },
  lockTitle: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  lockSub: { fontSize: 11.5, lineHeight: 15, marginTop: 1 },
});
