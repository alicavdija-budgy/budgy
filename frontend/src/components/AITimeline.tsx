/**
 * BUDGY — AI Timeline (proactive insights feed)
 *
 * A small, deliberate stream of intelligent observations about the user's
 * finances. Inspired by Apple Wallet smart cards, Notion callouts and Arc's
 * sidebar nudges.
 *
 * ▸ All insights are generated LOCALLY from the Zustand store, in pure JS.
 *   No backend call, no LLM cost, instant offline.
 * ▸ We surface MAX 4 insights, scored & sorted by relevance/severity.
 * ▸ Cards have a tinted left rail, subtle gradient, a contextual icon and
 *   an optional delta pill. No dark patterns, no motion overload.
 *
 * Insight categories
 *   positive · info · warning · alert · tip
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';

type Tone = 'positive' | 'info' | 'warning' | 'alert' | 'tip';

interface Insight {
  id: string;
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  delta?: string; // e.g. "+18%" / "-12%" / "3 abos"
  weight: number; // 0..100, higher = more relevant
}

// ── Tone palette ───────────────────────────────────────────────────────────
const TONE: Record<Tone, { primary: string; soft: string; rail: string; halo: string }> = {
  positive: { primary: '#16E0C6', soft: '#7BFCE3', rail: 'rgba(22, 224, 198, 0.65)',  halo: 'rgba(22, 224, 198, 0.10)'  },
  info:     { primary: '#74B2FF', soft: '#B2D6FF', rail: 'rgba(116, 178, 255, 0.65)', halo: 'rgba(116, 178, 255, 0.08)' },
  warning:  { primary: '#FFCB6B', soft: '#FFE0A8', rail: 'rgba(255, 203, 107, 0.70)', halo: 'rgba(255, 203, 107, 0.10)' },
  alert:    { primary: '#FF7A8A', soft: '#FFB1B9', rail: 'rgba(255, 122, 138, 0.70)', halo: 'rgba(255, 122, 138, 0.10)' },
  tip:      { primary: '#BE99FF', soft: '#D8C2FF', rail: 'rgba(190, 153, 255, 0.65)', halo: 'rgba(190, 153, 255, 0.08)' },
};

// ── Pure generator ─────────────────────────────────────────────────────────
interface GenInput {
  transactions: any[];
  incomes: any[];
  recurring: any[];
  goals: any[];
}

function generateInsights({ transactions, incomes, recurring, goals }: GenInput): Insight[] {
  const out: Insight[] = [];
  const now = new Date();

  // ── Helpers
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

  // Group transactions by week & by category
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

  // ── Insight 1: weekly variation ──────────────────────────────────────────
  if (lastWeek > 0 && thisWeek >= 0) {
    const delta = ((thisWeek - lastWeek) / lastWeek) * 100;
    if (delta >= 10) {
      out.push({
        id: 'week-up',
        tone: delta >= 30 ? 'alert' : 'warning',
        icon: 'trending-up',
        title: `Vous avez dépensé +${Math.round(delta)}% cette semaine`,
        subtitle: 'Comparé à la semaine précédente',
        delta: `+${Math.round(delta)}%`,
        weight: Math.min(100, 50 + delta),
      });
    } else if (delta <= -10) {
      out.push({
        id: 'week-down',
        tone: 'positive',
        icon: 'trending-down',
        title: `Belle baisse de ${Math.abs(Math.round(delta))}% cette semaine`,
        subtitle: 'Vos dépenses ralentissent. Continuez ainsi.',
        delta: `${Math.round(delta)}%`,
        weight: 60 + Math.abs(delta) / 2,
      });
    } else {
      out.push({
        id: 'week-stable',
        tone: 'info',
        icon: 'pulse',
        title: 'Vos dépenses sont stables cette semaine',
        subtitle: 'Aucun écart significatif détecté',
        weight: 30,
      });
    }
  }

  // ── Insight 2: top spending category ─────────────────────────────────────
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
        id: 'cat-good',
        tone: 'positive',
        icon: 'checkmark-circle',
        title: `Bonne maîtrise de votre ${meta.label}`,
        subtitle: `${Math.round(share)}% de vos dépenses ce mois`,
        weight: 55,
      });
    } else if (share >= 30) {
      out.push({
        id: 'cat-watch',
        tone: meta.tip === 'watch' ? 'warning' : 'info',
        icon: 'pie-chart',
        title: `${cat[0].toUpperCase() + cat.slice(1)} — ${Math.round(share)}% de vos dépenses`,
        subtitle: meta.tip === 'watch'
          ? `Attention aux dépenses ${meta.label}`
          : 'Premier poste de dépense ce mois',
        delta: `${Math.round(share)}%`,
        weight: 65,
      });
    }
  }

  // ── Insight 3: subscription audit ────────────────────────────────────────
  if (subsActive.length >= 8) {
    out.push({
      id: 'subs-many',
      tone: 'warning',
      icon: 'sync',
      title: `${subsActive.length} abonnements actifs`,
      subtitle: 'Quelques-uns pourraient être inutiles. Auditez-les.',
      delta: `${subsActive.length} abos`,
      weight: 75,
    });
  } else if (subsActive.length >= 4 && subsActive.length <= 7) {
    out.push({
      id: 'subs-ok',
      tone: 'info',
      icon: 'sync',
      title: `${subsActive.length} abonnements maîtrisés`,
      subtitle: 'Total mensuel raisonnable',
      weight: 25,
    });
  }

  // ── Insight 4: savings goal progress ─────────────────────────────────────
  if (goals.length > 0) {
    const totalSaved = goals.reduce((s, g) => s + Number(g.saved ?? 0), 0);
    const totalTarget = goals.reduce((s, g) => s + Number(g.target ?? 0), 0);
    const pct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    if (pct >= 60) {
      out.push({
        id: 'savings-good',
        tone: 'positive',
        icon: 'trophy',
        title: 'Votre épargne progresse bien ce mois-ci',
        subtitle: `${Math.round(pct)}% de vos objectifs atteints`,
        delta: `${Math.round(pct)}%`,
        weight: 70,
      });
    } else if (pct >= 20) {
      out.push({
        id: 'savings-mid',
        tone: 'info',
        icon: 'trending-up',
        title: 'Votre épargne avance régulièrement',
        subtitle: `${Math.round(pct)}% de vos objectifs`,
        weight: 40,
      });
    }
  }

  // ── Insight 5: anomaly detection (unusually large transaction) ───────────
  if (ofThisMonth.length >= 4) {
    const amounts = ofThisMonth.map((t: any) => Number(t.amount) || 0);
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const max = Math.max(...amounts);
    if (max > avg * 3 && max > 80) {
      const txn = ofThisMonth.find((t: any) => Number(t.amount) === max);
      out.push({
        id: 'anomaly',
        tone: 'alert',
        icon: 'warning',
        title: 'Dépense inhabituelle détectée',
        subtitle: txn?.title
          ? `${txn.title} — CHF ${max.toFixed(0)} (×${(max / avg).toFixed(1)} la moyenne)`
          : `CHF ${max.toFixed(0)} — bien au-dessus de votre moyenne`,
        delta: `×${(max / avg).toFixed(1)}`,
        weight: 80,
      });
    }
  }

  // ── Insight 6: macro mood (only if score is excellent / risky) ───────────
  if (ratio >= 0.35 && monthlyIncome > 0) {
    out.push({
      id: 'mood-excellent',
      tone: 'positive',
      icon: 'star',
      title: 'Excellent équilibre financier cette semaine',
      subtitle: `Vous mettez de côté ${Math.round(ratio * 100)}% de vos revenus`,
      delta: `${Math.round(ratio * 100)}%`,
      weight: 85,
    });
  } else if (ratio < 0 && monthlyIncome > 0) {
    out.push({
      id: 'mood-risk',
      tone: 'alert',
      icon: 'alert-circle',
      title: 'Vos dépenses dépassent vos revenus',
      subtitle: 'Réduire un poste non essentiel ce mois aiderait.',
      delta: `${Math.round(ratio * 100)}%`,
      weight: 95,
    });
  }

  // ── Insight 7: Smart "tip" (only if very few insights and we have data) ──
  if (out.length < 2 && transactions.length > 0) {
    out.push({
      id: 'tip-explore',
      tone: 'tip',
      icon: 'sparkles',
      title: 'Budgy comprend mieux vos finances chaque jour',
      subtitle: 'Continuez à enregistrer dépenses et revenus pour des insights plus fins.',
      weight: 20,
    });
  }

  // ── Sort by weight (desc), keep max 4
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

// ── Card UI ────────────────────────────────────────────────────────────────
function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const tone = TONE[insight.tone];
  return (
    <Animated.View
      entering={FadeInDown.duration(420).delay(80 + index * 70).springify().damping(16)}
      style={[
        styles.card,
        Platform.select({
          ios: {
            shadowColor: tone.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 14,
          },
          android: { elevation: 2 },
          default: {},
        }) as any,
      ]}
    >
      {/* Tinted left rail (the only "color signature") */}
      <View style={[styles.rail, { backgroundColor: tone.rail }]} />

      {/* Top inner sheen for glass feel */}
      <View style={styles.cardSheen} pointerEvents="none" />

      {/* Subtle tinted gradient body */}
      <LinearGradient
        colors={[tone.halo, 'rgba(255,255,255,0.012)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.cardInner}>
        <View style={[styles.iconOrb, { backgroundColor: tone.halo, borderColor: tone.rail }]}>
          <Ionicons name={insight.icon} size={16} color={tone.primary} />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{insight.title}</Text>
          {!!insight.subtitle && (
            <Text style={styles.cardSub} numberOfLines={2}>{insight.subtitle}</Text>
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

// ── Component ──────────────────────────────────────────────────────────────
export default function AITimeline() {
  const transactions = useStore((s) => s.transactions);
  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const goals = useStore((s) => s.savingsGoals);

  const insights = useMemo(
    () => generateInsights({ transactions: transactions || [], incomes: incomes || [], recurring: recurring || [], goals: goals || [] }),
    [transactions, incomes, recurring, goals],
  );

  // Hide entirely when there is truly nothing to say (avoids visual noise on empty state)
  if (insights.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.eyebrow}>BUDGY · INSIGHTS</Text>
        <View style={styles.liveDot} />
      </Animated.View>
      {insights.map((ins, i) => (
        <InsightCard key={ins.id} insight={ins} index={i} />
      ))}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#16E0C6',
    shadowColor: '#16E0C6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    minHeight: 60,
  },
  rail: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },
  cardSheen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 16, // accommodate the rail
    gap: 12,
  },
  iconOrb: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  cardSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11.5,
    lineHeight: 15,
  },
  deltaPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deltaTxt: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
