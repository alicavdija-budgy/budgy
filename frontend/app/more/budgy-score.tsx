/**
 * BUDGY — Score Budgy (santé financière pédagogique)
 *
 * Mesure la santé financière de l'utilisateur sur une échelle 0–100.
 * Ce N'EST PAS un score bancaire — c'est un score pédagogique destiné à
 * motiver et guider, calculé à partir des données réellement saisies par
 * l'utilisateur dans Budgy. Aucune donnée externe, aucun bureau de crédit.
 *
 * Le calcul (offline, transparent) repose sur 5 dimensions :
 *
 *   1. Taux d'épargne          (25 pts)  épargne_mensuelle / revenus
 *   2. Charges fixes maîtrisées (20 pts) recurring / revenus  (lower = better)
 *   3. Discipline abonnements   (15 pts) abos / revenus (lower = better)
 *   4. Stabilité des revenus    (15 pts) revenus récurrents identifiés ?
 *   5. Objectifs atteints       (25 pts) progression moyenne des savings goals
 *
 * Total : 100 pts. Historique sauvegardé chaque mois dans AsyncStorage
 * pour afficher l'évolution "+X ce mois" / "+Y cette année".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import type { Income, RecurringExpense, SavingsGoal } from '../../src/types';

const STORAGE_KEY = 'budgy:score-history:v1';

// ─────────── Score breakdown ───────────
interface Dimension {
  id: 'savings' | 'fixed' | 'subscriptions' | 'income' | 'goals';
  label: string;
  emoji: string;
  maxPts: number;
  scored: number;
  value: number;     // raw computed metric, 0..1
  badText: string;
  goodText: string;
}

interface ScoreResult {
  total: number;
  grade: 'excellent' | 'bon' | 'moyen' | 'à améliorer';
  dimensions: Dimension[];
  monthlyIncome: number;
  monthlyRecurring: number;
  monthlySubs: number;
  monthlySavingsCapacity: number;
}

// Subscription detection (matches typical streaming/services)
const SUB_RE = /netflix|spotify|apple|disney|youtube|amazon.*prime|hbo|paramount|adobe|microsoft.*365|office.*365|icloud|google.*one|notion|chatgpt|midjourney|fitness|gym|premium|abonnement/i;

function monthlyizeIncome(i: Income): number {
  if (i.type !== 'recurring') return 0;
  const f = i.frequency || 'monthly';
  if (f === 'monthly') return i.amount;
  if (f === 'quarterly') return i.amount / 3;
  return i.amount / 12;
}
function monthlyizeRecurring(r: RecurringExpense): number {
  if (!r.active) return 0;
  return r.frequency === 'yearly' ? r.amount / 12 : r.amount;
}

function compute(
  incomes: Income[],
  recurring: RecurringExpense[],
  goals: SavingsGoal[],
): ScoreResult {
  const monthlyIncome = (incomes || []).reduce((s, i) => s + monthlyizeIncome(i), 0);
  const recurringActive = (recurring || []).filter((r) => r.active);
  const monthlyRecurring = recurringActive.reduce((s, r) => s + monthlyizeRecurring(r), 0);
  const subs = recurringActive.filter((r) => SUB_RE.test(`${r.title} ${r.category}`));
  const monthlySubs = subs.reduce((s, r) => s + monthlyizeRecurring(r), 0);
  const monthlySavingsCapacity = Math.max(0, monthlyIncome - monthlyRecurring);

  // 1) Savings rate (25 pts)
  const savingsRate = monthlyIncome > 0 ? monthlySavingsCapacity / monthlyIncome : 0;
  const savingsPts = Math.round(Math.min(1, savingsRate / 0.20) * 25);

  // 2) Fixed expenses ratio (20 pts) — lower is better, target <50%
  const fixedRatio = monthlyIncome > 0 ? monthlyRecurring / monthlyIncome : 1;
  const fixedScore = Math.max(0, 1 - Math.max(0, fixedRatio - 0.30) / 0.40);
  const fixedPts = Math.round(fixedScore * 20);

  // 3) Subscription discipline (15 pts) — target <8% of income
  const subRatio = monthlyIncome > 0 ? monthlySubs / monthlyIncome : 0;
  const subScore = Math.max(0, 1 - Math.max(0, subRatio - 0.04) / 0.16);
  const subPts = Math.round(subScore * 15);

  // 4) Income stability (15 pts) — at least one recurring income → 15
  const stabilityPts = (incomes || []).some((i) => i.type === 'recurring') ? 15 : 0;

  // 5) Goals progress (25 pts) — average completion of savings goals
  let goalsPts = 0;
  if (goals && goals.length > 0) {
    const avgProgress = goals.reduce((s, g) => s + Math.min(1, (g.saved || 0) / Math.max(1, g.target)), 0) / goals.length;
    goalsPts = Math.round(avgProgress * 25);
  }

  const total = Math.max(0, Math.min(100, savingsPts + fixedPts + subPts + stabilityPts + goalsPts));
  const grade: ScoreResult['grade'] =
    total >= 85 ? 'excellent' : total >= 70 ? 'bon' : total >= 50 ? 'moyen' : 'à améliorer';

  const dims: Dimension[] = [
    {
      id: 'savings', label: 'Taux d\'épargne', emoji: '🐷', maxPts: 25, scored: savingsPts,
      value: savingsRate,
      badText: 'Votre épargne est faible. Tentez de mettre de côté 10–20% de vos revenus.',
      goodText: 'Excellent taux d\'épargne — gardez cette discipline.',
    },
    {
      id: 'fixed', label: 'Charges fixes', emoji: '🏠', maxPts: 20, scored: fixedPts,
      value: fixedRatio,
      badText: 'Vos charges fixes sont élevées par rapport à vos revenus. Renégociez certains contrats.',
      goodText: 'Charges fixes bien maîtrisées.',
    },
    {
      id: 'subscriptions', label: 'Abonnements', emoji: '🎬', maxPts: 15, scored: subPts,
      value: subRatio,
      badText: 'Beaucoup d\'abonnements pour votre budget. Faites le tri sur ceux que vous utilisez réellement.',
      goodText: 'Vos abonnements sont raisonnables.',
    },
    {
      id: 'income', label: 'Stabilité des revenus', emoji: '💼', maxPts: 15, scored: stabilityPts,
      value: stabilityPts / 15,
      badText: 'Ajoutez vos revenus récurrents dans Budgy pour des prévisions plus fiables.',
      goodText: 'Vos revenus récurrents sont bien identifiés.',
    },
    {
      id: 'goals', label: 'Objectifs atteints', emoji: '🎯', maxPts: 25, scored: goalsPts,
      value: goals && goals.length > 0 ? goalsPts / 25 : 0,
      badText: 'Créez un objectif d\'épargne pour visualiser vos progrès.',
      goodText: 'Vos objectifs progressent — continuez !',
    },
  ];

  return { total, grade, dimensions: dims, monthlyIncome, monthlyRecurring, monthlySubs, monthlySavingsCapacity };
}

// ─────────── Top 3 advice ───────────
function topAdvice(result: ScoreResult): { title: string; text: string; icon: keyof typeof Ionicons.glyphMap }[] {
  // Sort dimensions by points-gap (maxPts - scored) descending
  const gaps = [...result.dimensions]
    .map((d) => ({ ...d, gap: d.maxPts - d.scored }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);

  return gaps.map((d) => {
    if (d.id === 'savings') {
      const targetMonthly = Math.round(result.monthlyIncome * 0.15);
      return {
        title: 'Augmentez votre épargne mensuelle',
        text: `Visez ${targetMonthly > 0 ? `CHF ${targetMonthly.toLocaleString('fr-CH').replace(/,/g, "'")}/mois` : 'environ 15% de vos revenus'}. Programmez un virement automatique le jour de votre salaire.`,
        icon: 'trending-up',
      };
    }
    if (d.id === 'fixed') {
      return {
        title: 'Réduisez vos charges fixes',
        text: 'Repassez en revue assurances, télécom et internet. Le Radar d\'économies peut vous aider à identifier où économiser.',
        icon: 'home',
      };
    }
    if (d.id === 'subscriptions') {
      return {
        title: 'Faites le tri dans vos abonnements',
        text: 'Annulez les abonnements que vous n\'utilisez pas chaque mois. Une seule annulation peut représenter CHF 100–200/an.',
        icon: 'film',
      };
    }
    if (d.id === 'income') {
      return {
        title: 'Ajoutez vos revenus récurrents',
        text: 'Renseignez votre salaire (et autres revenus fixes) pour que Budgy puisse calculer votre capacité d\'épargne réelle.',
        icon: 'cash',
      };
    }
    return {
      title: 'Créez un objectif d\'épargne',
      text: 'Un objectif concret (vacances, urgence, projet) augmente la motivation et la régularité de l\'épargne.',
      icon: 'flag',
    };
  });
}

// ─────────── History (AsyncStorage) ───────────
interface ScoreSnapshot { month: string; score: number; ts: number }

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadHistory(): Promise<ScoreSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function persistTodaySnapshot(score: number): Promise<ScoreSnapshot[]> {
  const list = await loadHistory();
  const k = thisMonthKey();
  const idx = list.findIndex((s) => s.month === k);
  const snap: ScoreSnapshot = { month: k, score, ts: Date.now() };
  if (idx >= 0) list[idx] = snap;
  else list.push(snap);
  // Keep last 36 months
  list.sort((a, b) => a.month.localeCompare(b.month));
  const trimmed = list.slice(-36);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

// ─────────── Score gauge (SVG) ───────────
function Gauge({ value, size = 200, color }: { value: number; size?: number; color: string }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#1f2533" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        fill="none"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

// ─────────── Screen ───────────
export default function BudgyScoreScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const goals = useStore((s) => s.savingsGoals);

  const result = useMemo(() => compute(incomes || [], recurring || [], goals || []), [incomes, recurring, goals]);
  const advice = useMemo(() => topAdvice(result), [result]);

  const [history, setHistory] = useState<ScoreSnapshot[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let mounted = true;
    persistTodaySnapshot(result.total).then((h) => { if (mounted) setHistory(h); });
    return () => { mounted = false; };
  }, [result.total]);

  // Evolution: current month vs last month and vs 12 months ago
  const { deltaMonth, deltaYear } = useMemo(() => {
    if (history.length === 0) return { deltaMonth: 0, deltaYear: 0 };
    const lastMonth = history.find((s) => s.month === monthsAgo(1));
    const lastYear = history.find((s) => s.month === monthsAgo(12));
    return {
      deltaMonth: lastMonth ? result.total - lastMonth.score : 0,
      deltaYear: lastYear ? result.total - lastYear.score : 0,
    };
  }, [history, result.total]);

  const gaugeColor =
    result.total >= 85 ? theme.gold :
    result.total >= 70 ? theme.success :
    result.total >= 50 ? theme.warning :
    theme.error;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="budgy-score">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Score Budgy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
        {/* Gauge + total */}
        <LinearGradient
          colors={[`${gaugeColor}25`, `${theme.gold}10`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroSubtle}>Santé financière globale</Text>
          <View style={styles.gaugeWrap}>
            <Gauge value={result.total} color={gaugeColor} />
            <View style={styles.gaugeCenter}>
              <Text style={[styles.gaugeNumber, { color: gaugeColor }]}>{result.total}</Text>
              <Text style={styles.gaugeOutOf}>/100</Text>
              <View style={[styles.gradeBadge, { backgroundColor: `${gaugeColor}25`, borderColor: gaugeColor }]}>
                <Text style={[styles.gradeBadgeTxt, { color: gaugeColor }]}>{result.grade}</Text>
              </View>
            </View>
          </View>

          {/* Evolution */}
          <View style={styles.evoRow}>
            <View style={styles.evoCell}>
              <Text style={styles.evoLabel}>Ce mois</Text>
              <Text style={[styles.evoValue, { color: deltaMonth > 0 ? theme.success : deltaMonth < 0 ? theme.error : theme.textSecondary }]}>
                {deltaMonth === 0 ? '—' : `${deltaMonth > 0 ? '+' : ''}${deltaMonth}`}
              </Text>
            </View>
            <View style={styles.evoDivider} />
            <View style={styles.evoCell}>
              <Text style={styles.evoLabel}>Cette année</Text>
              <Text style={[styles.evoValue, { color: deltaYear > 0 ? theme.success : deltaYear < 0 ? theme.error : theme.textSecondary }]}>
                {deltaYear === 0 ? '—' : `${deltaYear > 0 ? '+' : ''}${deltaYear}`}
              </Text>
            </View>
          </View>

          <View style={styles.disclaimer}>
            <Ionicons name="information-circle" size={13} color={theme.textTertiary} />
            <Text style={styles.disclaimerTxt}>
              Score pédagogique calculé à partir de vos données — ce N'est PAS un score bancaire.
            </Text>
          </View>
        </LinearGradient>

        {/* Top 3 advice */}
        {advice.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>3 actions prioritaires</Text>
            {advice.map((a, i) => (
              <View key={i} style={styles.adviceCard}>
                <View style={[styles.adviceIcon, { backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}55` }]}>
                  <Ionicons name={a.icon} size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adviceTitle}>{a.title}</Text>
                  <Text style={styles.adviceTxt}>{a.text}</Text>
                </View>
                <View style={[styles.priorityPill, { backgroundColor: `${theme.gold}20`, borderColor: theme.gold }]}>
                  <Text style={[styles.priorityTxt, { color: theme.gold }]}>{i + 1}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Breakdown toggle */}
        <Pressable style={styles.detailsToggle} onPress={() => setShowDetails((v) => !v)}>
          <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary} />
          <Text style={styles.detailsTxt}>Détail du score (5 dimensions)</Text>
        </Pressable>

        {showDetails && (
          <View style={{ marginTop: Spacing.sm }}>
            {result.dimensions.map((d) => {
              const pct = d.scored / d.maxPts;
              return (
                <View key={d.id} style={styles.dimRow}>
                  <View style={styles.dimHeader}>
                    <Text style={{ fontSize: 22 }}>{d.emoji}</Text>
                    <Text style={styles.dimLabel}>{d.label}</Text>
                    <Text style={styles.dimPts}>{d.scored} / {d.maxPts}</Text>
                  </View>
                  <View style={styles.dimBarBg}>
                    <View style={[styles.dimBar, { width: `${Math.round(pct * 100)}%`, backgroundColor: pct >= 0.7 ? theme.success : pct >= 0.4 ? theme.warning : theme.error }]} />
                  </View>
                  <Text style={styles.dimNote}>
                    {pct >= 0.7 ? d.goodText : d.badText}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────── Styles ───────────
const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },

    // Hero
    heroCard: {
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: `${C.gold}33`,
      marginBottom: Spacing.lg,
      alignItems: 'center',
    },
    heroSubtle: { color: C.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },

    gaugeWrap: {
      alignItems: 'center', justifyContent: 'center',
      marginVertical: Spacing.md,
      position: 'relative',
    },
    gaugeCenter: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gaugeNumber: { fontSize: 56, fontWeight: '900', lineHeight: 62 },
    gaugeOutOf: { color: C.textSecondary, fontSize: 13, fontWeight: '700', marginTop: -2 },
    gradeBadge: {
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    gradeBadgeTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },

    // Evolution
    evoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: `${C.gold}25`,
    },
    evoCell: { flex: 1, alignItems: 'center' },
    evoDivider: { width: 1, height: 36, backgroundColor: `${C.gold}25` },
    evoLabel: { color: C.textTertiary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    evoValue: { fontSize: 22, fontWeight: '900', marginTop: 2 },

    disclaimer: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      marginTop: Spacing.md, paddingHorizontal: Spacing.sm,
    },
    disclaimerTxt: { color: C.textTertiary, fontSize: 11, flex: 1, lineHeight: 16 },

    // Advice
    sectionTitle: {
      color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold,
      marginTop: Spacing.sm, marginBottom: Spacing.sm,
    },
    adviceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: Spacing.md,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.cardBorder,
      marginBottom: Spacing.sm,
    },
    adviceIcon: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1,
    },
    adviceTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: '800' },
    adviceTxt: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
    priorityPill: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1,
    },
    priorityTxt: { fontSize: 13, fontWeight: '900' },

    // Details toggle
    detailsToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'center', paddingVertical: Spacing.md,
    },
    detailsTxt: { color: C.primary, fontSize: 13, fontWeight: '700' },

    // Dimensions
    dimRow: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
    dimHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    dimLabel: { color: C.text, fontSize: FontSizes.sm, fontWeight: '800', flex: 1 },
    dimPts: { color: C.textSecondary, fontSize: 12, fontWeight: '800' },
    dimBarBg: {
      height: 6, borderRadius: 3,
      backgroundColor: `${C.textTertiary}30`, overflow: 'hidden',
    },
    dimBar: { height: 6, borderRadius: 3 },
    dimNote: { color: C.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 },
  });
