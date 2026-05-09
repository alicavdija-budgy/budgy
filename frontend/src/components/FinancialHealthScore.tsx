/**
 * BUDGY — Financial Health Score (Premium AI edition)
 *
 * What's new vs v1:
 *   ▸ Intelligent state labels: Excellent · Stable · Attention · Risque
 *   ▸ Tone-adapted color palette (mint / sky / amber / coral)
 *   ▸ Smart dynamic insights generated from real signals
 *     ("Bonne capacité d'épargne", "Charges fixes élevées", …)
 *   ▸ Animated count-up of the score number (no jarring jumps)
 *   ▸ Soft glow halo on the gauge ring, breathing subtly when calm
 *   ▸ Smoother gauge animation (cubic-bezier, 1100 ms)
 *   ▸ All animations native-driven where possible to stay 60fps
 *
 * The score is local-only (no backend) so it shows even offline.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useStore } from '../stores/useStore';
import { useTheme, useThemeMode } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';

const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Tone palette (luxury mint → coral) ─────────────────────────────────────
type Tone = 'good' | 'stable' | 'mid' | 'low' | 'neutral';
const TONE_COLOR: Record<Tone, { primary: string; soft: string; halo: string }> = {
  good:    { primary: '#16E0C6', soft: '#7BFCE3', halo: 'rgba(22, 224, 198, 0.20)' },
  stable:  { primary: '#74B2FF', soft: '#B2D6FF', halo: 'rgba(116, 178, 255, 0.18)' },
  mid:     { primary: '#FFCB6B', soft: '#FFE0A8', halo: 'rgba(255, 203, 107, 0.18)' },
  low:     { primary: '#FF7A8A', soft: '#FFB1B9', halo: 'rgba(255, 122, 138, 0.20)' },
  neutral: { primary: '#9aa0aa', soft: '#cfd2d8', halo: 'rgba(255, 255, 255, 0.06)' },
};

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

interface ComputeInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  fixedCosts: number;
  subsCount: number;
  savings: number;
  hasAnyData: boolean;
}

interface InsightSig { key: string; params?: Record<string, any>; weight: number }

interface ComputeOutput {
  score: number;
  tone: Tone;
  insights: InsightSig[];
  ratio: number;
  monthsCovered: number;
}

function computeScore(input: ComputeInput): ComputeOutput {
  const { monthlyIncome, monthlyExpenses, fixedCosts, subsCount, savings, hasAnyData } = input;

  if (!hasAnyData) {
    return {
      score: 50,
      tone: 'neutral',
      insights: [
        { key: 'health.emptyAdd1', weight: 100 },
        { key: 'health.emptyAdd2', weight: 90 },
      ],
      ratio: 0,
      monthsCovered: 0,
    };
  }

  const ratio = monthlyIncome > 0 ? (monthlyIncome - monthlyExpenses) / monthlyIncome : 0;
  const ratePts = clamp(ratio * 100, -20, 40);
  const subsPts =
    subsCount === 0 ? 20 :
    subsCount <= 4 ? 16 :
    subsCount <= 8 ? 10 :
    subsCount <= 12 ? 4 : 0;
  const fixedRatio = monthlyIncome > 0 ? fixedCosts / monthlyIncome : 1;
  const loadPts = clamp(20 - Math.max(0, fixedRatio - 0.4) * 80, 0, 20);
  const monthsCovered = monthlyExpenses > 0 ? savings / monthlyExpenses : 0;
  const fundPts = clamp((monthsCovered / 3) * 20, 0, 20);

  const score = Math.round(clamp(ratePts + subsPts + loadPts + fundPts, 0, 100));

  const insights: InsightSig[] = [];

  if (ratio < 0) {
    insights.push({ key: 'health.insOver', weight: 100 });
  } else if (ratio >= 0.3) {
    insights.push({ key: 'health.insSavingsGood', params: { p: Math.round(ratio * 100) }, weight: 70 });
  } else if (ratio >= 0.1) {
    insights.push({ key: 'health.insStable', weight: 50 });
  } else if (ratio > 0) {
    insights.push({ key: 'health.insMargin', weight: 80 });
  }

  if (fixedRatio > 0.6) insights.push({ key: 'health.insFixedHigh', weight: 90 });
  else if (fixedRatio > 0.4) insights.push({ key: 'health.insFixedOk', weight: 30 });

  if (subsCount >= 10) insights.push({ key: 'health.insSubsHigh', params: { n: subsCount }, weight: 75 });
  else if (subsCount >= 6) insights.push({ key: 'health.insSubsMid', params: { n: subsCount }, weight: 40 });

  if (monthsCovered >= 3) insights.push({ key: 'health.insFundGood', params: { m: monthsCovered.toFixed(1) }, weight: 35 });
  else if (monthsCovered >= 1) insights.push({ key: 'health.insFundMid', params: { m: monthsCovered.toFixed(1) }, weight: 60 });
  else if (monthlyExpenses > 0) insights.push({ key: 'health.insFundLow', weight: 85 });

  if (score >= 85) insights.unshift({ key: 'health.insExcellent', weight: 95 });
  else if (score >= 70) insights.unshift({ key: 'health.insSane', weight: 60 });

  insights.sort((a, b) => b.weight - a.weight);
  const top = insights.slice(0, 3);

  let tone: Tone = 'mid';
  if (score >= 80) tone = 'good';
  else if (score >= 65) tone = 'stable';
  else if (score >= 45) tone = 'mid';
  else tone = 'low';

  return { score, tone, insights: top, ratio, monthsCovered };
}

// ── Lightweight count-up text (smooth, no flicker) ─────────────────────────
function ScoreCounter({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef<any>(null);

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const from = display;
    const duration = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * eased);
      setDisplay(v);
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => animRef.current && cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <Text style={{ fontSize: 36, fontWeight: '800', letterSpacing: -1, color }}>{display}</Text>;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function FinancialHealthScore() {
  const transactions = useStore((s) => s.transactions);
  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const goals = useStore((s) => s.savingsGoals);
  const theme = useTheme();
  const themeMode = useThemeMode();
  const isLight = themeMode === 'light';
  const { t } = useTranslation();
  const styles = makeStyles(theme, isLight);

  const TONE_LABEL_KEY: Record<Tone, string> = {
    good: 'health.toneExcellent',
    stable: 'health.toneStable',
    mid: 'health.toneMid',
    low: 'health.toneLow',
    neutral: 'health.toneNeutral',
  };

  const { score, tone, insights } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const monthlyIncome = (incomes || []).reduce((sum: number, i: any) => {
      if (i.type && i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

    const txnMonth = (transactions || []).reduce((sum: number, t: any) => {
      const d = new Date(t.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        return sum + (Number(t.amount) || 0);
      }
      return sum;
    }, 0);
    const fixedCosts = (recurring || [])
      .filter((r: any) => r.active !== false && (!r.frequency || r.frequency === 'monthly'))
      .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const monthlyExpenses = txnMonth + fixedCosts;

    const savings = (goals || []).reduce(
      (s: number, g: any) => s + Number(g.saved ?? g.currentAmount ?? g.current ?? 0),
      0,
    );

    const subsCount = (recurring || []).filter((r: any) => r.active !== false).length;
    const hasAnyData =
      (incomes?.length || 0) > 0 ||
      (transactions?.length || 0) > 0 ||
      (recurring?.length || 0) > 0 ||
      (goals?.length || 0) > 0;

    return computeScore({ monthlyIncome, monthlyExpenses, fixedCosts, subsCount, savings, hasAnyData });
  }, [transactions, incomes, recurring, goals]);

  const palette = TONE_COLOR[tone];

  // ── Animations ──────────────────────────────────────────────────────────
  const ringProgress = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.timing(ringProgress, {
      toValue: score,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // strokeDashoffset is not native
    }).start();
  }, [score]);

  // Slow halo breathing (only when score is good or stable, more "alive")
  useEffect(() => {
    if (tone === 'good' || tone === 'stable') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.55, duration: 2400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      haloOpacity.setValue(0.7);
    }
  }, [tone]);

  const dashOffset = ringProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRC, CIRC * 0.05],
  });

  return (
    <View style={styles.card}>
      {/* Subtle inner top highlight */}
      <View style={styles.cardSheen} pointerEvents="none" />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{t('health.eyebrow')}</Text>
          <Text style={styles.title}>{t('health.title')}</Text>
        </View>
        <View style={[styles.toneChip, { borderColor: palette.primary, backgroundColor: palette.halo }]}>
          <View style={[styles.toneDot, { backgroundColor: palette.primary }]} />
          <Text style={[styles.toneTxt, { color: palette.primary }]}>{t(TONE_LABEL_KEY[tone])}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.gauge}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                backgroundColor: palette.halo,
                opacity: haloOpacity,
                shadowColor: palette.primary,
              },
            ]}
          />
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <SvgGrad id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={palette.soft} stopOpacity="1" />
                <Stop offset="1" stopColor={palette.primary} stopOpacity="1" />
              </SvgGrad>
            </Defs>
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              stroke={isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255,255,255,0.06)'} strokeWidth={STROKE} fill="none"
            />
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
            <ScoreCounter value={score} color={theme.text} />
            <Text style={styles.scoreOf}>/ 100</Text>
          </View>
        </View>

        <View style={styles.signals}>
          {(insights.length
            ? insights
            : [{ key: 'health.emptyHint' } as InsightSig]
          )
            .slice(0, 3)
            .map((s, i) => (
              <View key={i} style={styles.signalRow}>
                <View style={[styles.bullet, { backgroundColor: palette.primary }]} />
                <Text style={styles.signalTxt}>{t(s.key, s.params)}</Text>
              </View>
            ))}
        </View>
      </View>

      <Text style={styles.foot}>{t('health.foot')}</Text>
    </View>
  );
}

const makeStyles = (theme: any, isLight: boolean) => StyleSheet.create({
  card: {
    backgroundColor: isLight ? theme.card : 'rgba(255,255,255,0.025)',
    borderRadius: 22,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.cardBorder,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isLight ? 0.06 : 0.25,
        shadowRadius: 18,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  cardSheen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 1,
    backgroundColor: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255,255,255,0.10)',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  eyebrow: { color: theme.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, marginBottom: 2 },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  toneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toneDot: { width: 6, height: 6, borderRadius: 3 },
  toneTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gauge: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: isLight ? 0.35 : 0.6,
        shadowRadius: 22,
      },
      default: {},
    }),
  },
  gaugeCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  scoreOf: { color: theme.textTertiary, fontSize: 11, marginTop: -2 },
  signals: { flex: 1, gap: 6 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  signalTxt: { color: theme.textSecondary, fontSize: 12.5, lineHeight: 17, flex: 1 },
  foot: { color: theme.textMuted, fontSize: 10, marginTop: 12, textAlign: 'right' },
});
