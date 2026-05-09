/**
 * BUDGY — Financial Health Score widget
 *
 * Premium gauge based on simple but useful signals:
 *   - savings rate (income vs expenses)
 *   - fixed-cost ratio
 *   - subscriptions count
 *   - emergency fund ratio (savings goals)
 *
 * 100 pts = stellar, 50 = moyen, <30 = à risque.
 * The score is local-only (no backend) so it shows even offline.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useStore } from '../stores/useStore';

const ACCENT = '#16E0C6';
const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function computeScore(input: {
  monthlyIncome: number;
  monthlyExpenses: number;
  subsCount: number;
  savings: number;
}) {
  const { monthlyIncome, monthlyExpenses, subsCount, savings } = input;

  if (monthlyIncome <= 0 && monthlyExpenses <= 0 && savings <= 0) {
    return { score: 50, label: 'Démarrage', tone: 'neutral' as const, signals: [] as string[] };
  }

  // Savings rate (40 pts)
  const ratio = monthlyIncome > 0 ? (monthlyIncome - monthlyExpenses) / monthlyIncome : 0;
  const ratePts = clamp(ratio * 100, -20, 40);

  // Subscription discipline (20 pts)
  const subsPts = subsCount === 0 ? 20 : subsCount <= 4 ? 15 : subsCount <= 8 ? 10 : subsCount <= 12 ? 4 : 0;

  // Fixed-cost ratio (20 pts) — placeholder using expense load
  const loadPts = clamp(20 - Math.max(0, monthlyExpenses - monthlyIncome) / Math.max(monthlyIncome, 1) * 40, 0, 20);

  // Emergency fund (20 pts) — savings >= 3 monthly expenses → full
  const monthsCovered = monthlyExpenses > 0 ? savings / monthlyExpenses : 0;
  const fundPts = clamp((monthsCovered / 3) * 20, 0, 20);

  const score = Math.round(clamp(40 + ratePts + subsPts + loadPts + fundPts - 40, 0, 100));

  const signals: string[] = [];
  if (ratio < 0) signals.push('Vos dépenses dépassent vos revenus');
  else if (ratio > 0.3) signals.push(`Vous épargnez ${Math.round(ratio * 100)}% de vos revenus`);
  if (subsCount > 8) signals.push(`${subsCount} abonnements actifs — pensez à auditer`);
  if (monthsCovered < 1) signals.push("Fonds d'urgence < 1 mois de dépenses");
  else if (monthsCovered >= 3) signals.push("Fonds d'urgence solide (≥ 3 mois)");

  let label = 'À surveiller';
  let tone: 'good' | 'mid' | 'low' | 'neutral' = 'mid';
  if (score >= 80) { label = 'Excellent'; tone = 'good'; }
  else if (score >= 65) { label = 'Bonne santé'; tone = 'good'; }
  else if (score >= 45) { label = 'Correct'; tone = 'mid'; }
  else { label = 'À renforcer'; tone = 'low'; }

  return { score, label, tone, signals };
}

export default function FinancialHealthScore() {
  // Aggregate signals from Zustand store (no API calls)
  const transactions = useStore((s) => s.transactions);
  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const goals = useStore((s) => s.savingsGoals);

  const { score, label, tone, signals, monthlyIncome } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Monthly income (normalized by frequency, only recurring counted)
    const monthlyIncome = (incomes || []).reduce((sum: number, i: any) => {
      if (i.type && i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

    // Monthly expenses (this month transactions + active monthly recurring)
    const txnMonth = (transactions || []).reduce((sum: number, t: any) => {
      const d = new Date(t.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        return sum + (Number(t.amount) || 0);
      }
      return sum;
    }, 0);
    const recurringMonth = (recurring || [])
      .filter((r: any) => r.active !== false && (!r.frequency || r.frequency === 'monthly'))
      .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const monthlyExpenses = txnMonth + recurringMonth;

    // Savings = aggregated current saved across goals
    const savings = (goals || []).reduce(
      (s: number, g: any) => s + (Number(g.saved ?? g.currentAmount ?? g.current ?? 0)),
      0,
    );

    const subsCount = (recurring || []).filter((r: any) => r.active !== false).length;
    const result = computeScore({ monthlyIncome, monthlyExpenses, subsCount, savings });
    return { ...result, monthlyIncome };
  }, [transactions, incomes, recurring, goals]);

  const animated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animated, {
      toValue: score,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score]);

  const dashOffset = animated.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRC, CIRC * 0.05],
  });

  const ringColor = tone === 'good' ? ACCENT : tone === 'mid' ? '#FFCB6B' : tone === 'low' ? '#FF7A8A' : '#9aa0aa';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>BUDGY · SCORE</Text>
          <Text style={styles.title}>Santé financière</Text>
        </View>
        <View style={[styles.toneChip, { borderColor: ringColor }]}>
          <Text style={[styles.toneTxt, { color: ringColor }]}>{label}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.gauge}>
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <SvgGrad id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#7BFCE3" stopOpacity="1" />
                <Stop offset="1" stopColor={ringColor} stopOpacity="1" />
              </SvgGrad>
            </Defs>
            {/* Track */}
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} fill="none"
            />
            {/* Progress */}
            <AnimatedCircle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              stroke="url(#g)" strokeWidth={STROKE} fill="none"
              strokeDasharray={`${CIRC},${CIRC}`}
              strokeDashoffset={dashOffset as any}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <View style={styles.gaugeCenter} pointerEvents="none">
            <Text style={styles.scoreNum}>{score}</Text>
            <Text style={styles.scoreOf}>/ 100</Text>
          </View>
        </View>

        <View style={styles.signals}>
          {(signals.length ? signals : ['Ajoutez vos premières dépenses pour un diagnostic.']).slice(0, 3).map((s, i) => (
            <View key={i} style={styles.signalRow}>
              <View style={[styles.bullet, { backgroundColor: ringColor }]} />
              <Text style={styles.signalTxt}>{s}</Text>
            </View>
          ))}
        </View>
      </View>

      {monthlyIncome > 0 && (
        <Text style={styles.foot}>Calculé localement à partir de vos données</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 22,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  eyebrow: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 1.4, marginBottom: 2 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  toneChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  toneTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gauge: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  gaugeCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreNum: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  scoreOf: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: -2 },
  signals: { flex: 1, gap: 6 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  signalTxt: { color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 17, flex: 1 },
  foot: { color: 'rgba(255,255,255,0.32)', fontSize: 10, marginTop: 12, textAlign: 'right' },
});
