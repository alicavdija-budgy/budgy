/**
 * GUARDIAN MONEY CHF - AI Optimizer (Économiseur IA)
 * Analyzes user's spending + recurring + contracts and proposes
 * concrete savings via backend /api/optimizer/analyze (Emergent LLM).
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { apiFetchJson, hasApiBaseUrl } from '../../src/lib/network';
import { useTranslation } from '../../src/hooks/useTranslation';

const TAG = '[ai-optimizer]';

/**
 * v3.7.26 — Garantit que l'écran Économiseur IA n'affiche JAMAIS
 * une seule proposition (ex: "Netflix" isolé). Si le backend renvoie
 * moins de 3 propositions OU une seule catégorie, on enrichit avec
 * des propositions locales basées sur les vraies données utilisateur,
 * tout en conservant les propositions IA en tête de liste.
 *
 * v3.9.0 build 73 — i18n: la fonction reçoit maintenant `t` pour
 * générer les titres/actions dans la langue de l'utilisateur.
 */
/**
 * v3.9.0 Build 74 — CRASH SAFETY.
 * Normalise EVERY optimizer result (backend success, backend partial,
 * offline, 500, invalid JSON, local fallback) to a shape the UI can render
 * without crashing. Guarantees:
 *   - proposals: Proposal[]  (never undefined)
 *   - tips:      string[]    (never undefined)
 *   - summary:   string      (never undefined)
 *   - monthly_potential / yearly_potential : number (never NaN)
 * Preserves any AI-provided proposals / tips as-is.
 */
function normalizeOptimizerResult(input: any): OptimizerResult {
  const proposals = Array.isArray(input?.proposals) ? input.proposals : [];
  const tips = Array.isArray(input?.tips)
    ? input.tips.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
    : [];
  const monthly = Number(
    input?.monthly_potential ??
    input?.total_monthly_potential ??
    proposals.reduce(
      (s: number, p: any) => s + Number(p?.potential_saving_monthly ?? p?.monthly_potential ?? 0),
      0
    )
  );
  const yearly = Number(
    input?.yearly_potential ??
    input?.total_annual_potential ??
    proposals.reduce(
      (s: number, p: any) => s + Number(p?.potential_saving_yearly ?? p?.annual_potential ?? 0),
      0
    )
  );
  return {
    success: !!input?.success,
    summary: typeof input?.summary === 'string' ? input.summary : '',
    monthly_potential: Number.isFinite(monthly) ? monthly : 0,
    yearly_potential: Number.isFinite(yearly) ? yearly : 0,
    proposals,
    tips,
    error: typeof input?.error === 'string' ? input.error : undefined,
  };
}

function enrichWithLocalProposals(
  data: any,
  store: any,
  monthlyIncome: number,
  t: (k: string, p?: any) => string,
  cur: string,
): any {
  const existing = Array.isArray(data?.proposals) ? [...data.proposals] : [];
  const existingCats = new Set(existing.map((p: any) => String(p.category || '').toLowerCase()));
  const candidates: any[] = [];

  const money = (n: number) => `${cur} ${Math.round(n)}`;

  const recurringTotal = (store.recurringExpenses || [])
    .filter((r: any) => r.active !== false)
    .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const subsTotal = (store.recurringExpenses || [])
    .filter((r: any) => r.active !== false && /(abonn|stream|telecom|cloud|media)/i.test(String(r.category || '')))
    .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const restoTotal = (store.transactions || [])
    .filter((t2: any) => /(restaurant|food|alim)/i.test(String(t2.category || '')))
    .reduce((s: number, t2: any) => s + (Number(t2.amount) || 0), 0);
  const coursesTotal = (store.transactions || [])
    .filter((t2: any) => String(t2.category || '').toLowerCase() === 'courses')
    .reduce((s: number, t2: any) => s + (Number(t2.amount) || 0), 0);
  const hasContracts = (store.contracts || []).length > 0;

  // 1. Audit abonnements / récurrent
  if (!existingCats.has('abonnements') && (subsTotal > 0 || recurringTotal > 50)) {
    const base = subsTotal > 0 ? subsTotal : recurringTotal;
    candidates.push({
      title: t('aiOptimizer.propSubs'),
      category: 'subscription',
      potential_saving_monthly: Math.round(base * 0.20 * 100) / 100,
      potential_saving_yearly: Math.round(base * 0.20 * 12 * 100) / 100,
      monthly_potential: Math.round(base * 0.20 * 100) / 100,
      annual_potential: Math.round(base * 0.20 * 12 * 100) / 100,
      current_monthly: base,
      effort: 'easy',
      action: t('aiOptimizer.propSubsAction', { amount: money(base) }),
      explanation: '',
    });
  }
  // 2. LAMal / santé
  if (!existingCats.has('sante') && !existingCats.has('insurance')) {
    candidates.push({
      title: t('aiOptimizer.propHealth'),
      category: 'insurance',
      potential_saving_monthly: 60,
      potential_saving_yearly: 720,
      monthly_potential: 60,
      annual_potential: 720,
      current_monthly: 0,
      effort: 'medium',
      action: t('aiOptimizer.propHealthAction'),
      explanation: '',
    });
  }
  // 3. 3e pilier / fiscal
  if (!existingCats.has('fiscal') && !existingCats.has('tax') && monthlyIncome > 1000) {
    candidates.push({
      title: t('aiOptimizer.prop3a'),
      category: 'tax',
      potential_saving_monthly: Math.round((Math.min(monthlyIncome * 0.10, 588)) * 100) / 100,
      potential_saving_yearly: 7056,
      monthly_potential: Math.round((Math.min(monthlyIncome * 0.10, 588)) * 100) / 100,
      annual_potential: 7056,
      current_monthly: 0,
      effort: 'medium',
      action: t('aiOptimizer.prop3aAction'),
      explanation: '',
    });
  }
  // 4. Télécoms
  if (!existingCats.has('telecoms') && !existingCats.has('telco')) {
    candidates.push({
      title: t('aiOptimizer.propTelco'),
      category: 'telco',
      potential_saving_monthly: 25,
      potential_saving_yearly: 300,
      monthly_potential: 25,
      annual_potential: 300,
      current_monthly: 0,
      effort: 'easy',
      action: t('aiOptimizer.propTelcoAction'),
      explanation: '',
    });
  }
  // 5. Alimentation / restaurants
  if (!existingCats.has('alimentation') && !existingCats.has('food') && (restoTotal + coursesTotal) > 200) {
    const base = restoTotal > 100 ? restoTotal : coursesTotal;
    candidates.push({
      title: t('aiOptimizer.propFood'),
      category: 'food',
      potential_saving_monthly: Math.round(base * 0.25 * 100) / 100,
      potential_saving_yearly: Math.round(base * 0.25 * 12 * 100) / 100,
      monthly_potential: Math.round(base * 0.25 * 100) / 100,
      annual_potential: Math.round(base * 0.25 * 12 * 100) / 100,
      current_monthly: base,
      effort: 'easy',
      action: t('aiOptimizer.propFoodAction', { amount: money(base) }),
      explanation: '',
    });
  }
  // 6. Logement / loyer
  if (!existingCats.has('logement') && !existingCats.has('other') && (store.recurringExpenses || []).some((r: any) => /loyer|logement|rent/i.test(String(r.title || '')))) {
    candidates.push({
      title: t('aiOptimizer.propHousing'),
      category: 'other',
      potential_saving_monthly: 50,
      potential_saving_yearly: 600,
      monthly_potential: 50,
      annual_potential: 600,
      current_monthly: 0,
      effort: 'medium',
      action: t('aiOptimizer.propHousingAction'),
      explanation: '',
    });
  }
  // 7. Contrats à renégocier
  if (!existingCats.has('contrats') && hasContracts) {
    candidates.push({
      title: t('aiOptimizer.propContracts'),
      category: 'insurance',
      potential_saving_monthly: 40,
      potential_saving_yearly: 480,
      monthly_potential: 40,
      annual_potential: 480,
      current_monthly: 0,
      effort: 'medium',
      action: t('aiOptimizer.propContractsAction', { n: store.contracts.length }),
      explanation: '',
    });
  }
  // 8. Frais bancaires
  if (!existingCats.has('bank') && !existingCats.has('frais_bancaires')) {
    candidates.push({
      title: t('aiOptimizer.propBank'),
      category: 'bank',
      potential_saving_monthly: 8,
      potential_saving_yearly: 96,
      monthly_potential: 8,
      annual_potential: 96,
      current_monthly: 0,
      effort: 'easy',
      action: t('aiOptimizer.propBankAction'),
      explanation: '',
    });
  }

  const minCount = Math.max(3, existing.length);
  for (const c of candidates) {
    if (existing.length >= minCount && new Set(existing.map((p: any) => p.category)).size >= 3) break;
    existing.push(c);
  }

  const total_monthly = existing.reduce((s, p) => s + (p.potential_saving_monthly || p.monthly_potential || 0), 0);
  const total_annual = existing.reduce((s, p) => s + (p.potential_saving_yearly || p.annual_potential || 0), 0);

  const enriched = existing.length > (data?.proposals?.length || 0);
  let summary = data?.summary;
  if (enriched || !summary || /0 pistes|aucune piste|no proposals?/i.test(summary)) {
    summary = enriched
      ? t('aiOptimizer.summaryEnriched', { n: existing.length })
      : t('aiOptimizer.summaryNormal', { n: existing.length });
  }

  return {
    ...data,
    proposals: existing,
    // v3.9.0 Build 74 — Guarantee `tips` is always an array to prevent
    // `Cannot read property 'length' of undefined` at render time.
    tips: Array.isArray(data?.tips)
      ? data.tips.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      : [],
    total_monthly_potential: total_monthly,
    total_annual_potential: total_annual,
    monthly_potential: total_monthly,
    yearly_potential: total_annual,
    summary,
    _enriched: enriched,
  };
}

type Effort = 'easy' | 'medium' | 'hard';
type Category =
  | 'subscription' | 'insurance' | 'food' | 'energy' | 'telco'
  | 'bank' | 'tax' | 'other';

interface Proposal {
  title: string;
  category: Category;
  current_monthly: number;
  potential_saving_monthly: number;
  potential_saving_yearly: number;
  effort: Effort;
  action: string;
  explanation: string;
}

interface OptimizerResult {
  success: boolean;
  summary: string;
  monthly_potential: number;
  yearly_potential: number;
  proposals: Proposal[];
  tips: string[];
  error?: string;
}

const CATEGORY_META: Record<Category, { icon: keyof typeof Ionicons.glyphMap; labelKey: string; color: string }> = {
  subscription: { icon: 'play-circle', labelKey: 'aiOptimizer.catSubscription', color: '#EC4899' },
  insurance: { icon: 'shield-checkmark', labelKey: 'aiOptimizer.catInsurance', color: '#10B981' },
  food: { icon: 'restaurant', labelKey: 'aiOptimizer.catFood', color: '#F97316' },
  energy: { icon: 'flash', labelKey: 'aiOptimizer.catEnergy', color: '#F59E0B' },
  telco: { icon: 'cellular', labelKey: 'aiOptimizer.catTelco', color: '#0EA5E9' },
  bank: { icon: 'card', labelKey: 'aiOptimizer.catBank', color: '#8B5CF6' },
  tax: { icon: 'calculator', labelKey: 'aiOptimizer.catTax', color: '#6366F1' },
  other: { icon: 'sparkles', labelKey: 'aiOptimizer.catOther', color: '#14B8A6' },
};

const EFFORT_META: Record<Effort, { labelKey: string; color: string; emoji: string }> = {
  easy: { labelKey: 'aiOptimizer.effortEasy', color: '#10B981', emoji: '⚡' },
  medium: { labelKey: 'aiOptimizer.effortMedium', color: '#F59E0B', emoji: '⏱️' },
  hard: { labelKey: 'aiOptimizer.effortHard', color: '#EF4444', emoji: '🛠️' },
};

function fmt(n: number, cur: string): string {
  return `${cur} ${Math.round(n).toLocaleString('fr-CH').replace(/,/g, "'")}`;
}

export default function AIOptimizerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const store = useStore();
  const { t } = useTranslation();
  const CUR = store.preferences.currency;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive monthly income from incomes
  const monthlyIncome = useMemo(() => {
    const total = store.incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
    return total || (store.preferences as any).monthlyIncome || 0;
  }, [store.incomes, store.preferences]);

  const yearlyIncome = monthlyIncome * 12;

  const analyze = async () => {
    if (!hasApiBaseUrl()) {
      setError(t('aiOptimizer.errorBackendMissing'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = {
        monthly_income: monthlyIncome,
        yearly_income: yearlyIncome,
        currency: CUR,
        canton: (store.preferences as any).canton || 'VD',
        transactions: store.transactions.slice(0, 120).map((tx) => ({
          title: tx.title,
          amount: tx.amount,
          category: tx.category,
          date: tx.date,
        })),
        pro_expenses: (store.proExpenses || []).slice(0, 50).map((e: any) => ({
          title: e.title,
          amount: e.amount,
          category: e.category,
          tva: e.tva,
        })),
        recurring_expenses: store.recurringExpenses.map((r) => ({
          title: r.title,
          amount: r.amount,
          category: r.category,
          frequency: r.frequency,
          active: r.active,
        })),
        contracts: (store.contracts || []).map((c: any) => ({
          title: c.title || c.name,
          amount: c.amount || c.monthlyCost,
          category: c.category,
          expirationDate: c.expirationDate,
        })),
        invoices: (store.invoices || []).slice(0, 30).map((inv: any) => ({
          title: inv.title,
          issuer: inv.issuer,
          amount: inv.amount,
          category: inv.category,
          status: inv.status,
          dueDate: inv.dueDate,
        })),
        budgets: (store.budgets || []).map((b: any) => ({
          category: b.category,
          monthly: b.monthly,
          spent: b.spent,
        })),
        debts: (store.debts || []).map((d: any) => ({
          name: d.name,
          balance: d.balance,
          rate: d.rate,
          monthlyPayment: d.monthlyPayment,
        })),
        goals: (store.savingsGoals || []).map((g) => ({
          title: g.title,
          target: g.target,
          saved: g.saved,
          deadline: g.deadline,
        })),
        require_min_proposals: 3,
        require_categories_diversity: ['abonnements', 'sante', 'fiscal', 'logement', 'telecoms', 'alimentation', 'energie'],
      };

      console.log(`${TAG} POST /api/optimizer/analyze (signals=${(body.transactions||[]).length} txns)`);

      const r = await apiFetchJson<OptimizerResult>('/api/optimizer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, { timeoutMs: 35000, retries: 1, silent: true });
      console.log(`${TAG} apiFetchJson → ok=${r.ok} status=${r.status} offline=${r.offline}`);
      if (!r.ok || !r.data) {
        throw new Error(r.offline ? 'offline' : `HTTP ${r.status}`);
      }
      const data = r.data;
      if (!data.success) throw new Error(data.error || 'Analysis failed'); // i18n-technical

      const enriched = enrichWithLocalProposals(data, store, monthlyIncome, t, CUR);
      setResult(normalizeOptimizerResult(enriched));
    } catch (e: any) {
      console.error(`${TAG} fatal:`, e);
      // Local fallback
      const enriched = enrichWithLocalProposals(
        { success: true, proposals: [], summary: t('aiOptimizer.localSuggestions') },
        store,
        monthlyIncome,
        t,
        CUR,
      );
      enriched._local = true;
      enriched.summary = t('aiOptimizer.localSuggestions');
      setResult(normalizeOptimizerResult(enriched));
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
    scroll: { flex: 1 },
    content: { padding: Spacing.lg, paddingBottom: insets.bottom + 40 },
    hero: {
      borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg,
      alignItems: 'center',
    },
    heroEmoji: { fontSize: 52, marginBottom: Spacing.sm },
    heroTitle: { color: '#FFF', fontSize: FontSizes.xl, fontWeight: FontWeights.black, textAlign: 'center' },
    heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.xs },
    incomeCard: { padding: Spacing.lg, marginBottom: Spacing.lg },
    incomeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
    incomeLabel: { color: C.textSecondary, fontSize: FontSizes.sm },
    incomeValue: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    resultHero: {
      borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg,
      alignItems: 'center',
    },
    resultLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, textTransform: 'uppercase', letterSpacing: 1 },
    resultBig: { color: '#FFF', fontSize: FontSizes.hero, fontWeight: FontWeights.black, marginTop: Spacing.xs },
    resultSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
    summary: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, marginBottom: Spacing.lg },
    sectionTitle: {
      color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.md,
    },
    proposalCard: { padding: Spacing.lg, marginBottom: Spacing.md },
    proposalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    catIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    proposalTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, flex: 1 },
    badgesRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md, flexWrap: 'wrap' },
    badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 },
    badgeText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
    savingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: C.cardBorder },
    savingLabel: { color: C.textSecondary, fontSize: FontSizes.sm },
    savingMonth: { color: C.success, fontSize: FontSizes.md, fontWeight: FontWeights.black },
    savingYear: { color: C.successLight, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    action: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginTop: Spacing.sm, lineHeight: 20 },
    explanation: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.xs, lineHeight: 18, fontStyle: 'italic' },
    tipsCard: { padding: Spacing.lg, marginTop: Spacing.md },
    tipsTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
    tipItem: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    tipBullet: { color: C.primary, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    tipText: { color: C.textSecondary, fontSize: FontSizes.sm, flex: 1, lineHeight: 20 },
    errorBox: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: `${C.error}15`, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md,
    },
    errorText: { color: C.error, fontSize: FontSizes.sm, flex: 1 },
    loaderBox: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.md },
    loaderText: { color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.sm },
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('aiOptimizer.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!result && !loading && (
          <>
            <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.hero}>
              <Text style={styles.heroEmoji}>{t('aiOptimizer.heroEmoji')}</Text>
              <Text style={styles.heroTitle}>{t('aiOptimizer.heroTitle')}</Text>
              <Text style={styles.heroSub}>{t('aiOptimizer.heroSub')}</Text>
            </LinearGradient>

            <Card style={styles.incomeCard}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>{t('aiOptimizer.analysisBase')}</Text>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('aiOptimizer.labelMonthlyIncome')}</Text>
                <Text style={styles.incomeValue}>{fmt(monthlyIncome, CUR)}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('aiOptimizer.labelYearlyIncome')}</Text>
                <Text style={styles.incomeValue}>{fmt(yearlyIncome, CUR)}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('aiOptimizer.labelTransactions')}</Text>
                <Text style={styles.incomeValue}>{store.transactions.length}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('aiOptimizer.labelRecurring')}</Text>
                <Text style={styles.incomeValue}>{store.recurringExpenses.length}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('aiOptimizer.labelCanton')}</Text>
                <Text style={styles.incomeValue}>{(store.preferences as any).canton || 'VD'}</Text>
              </View>
            </Card>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color={C.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {(store.transactions.length < 5 && store.recurringExpenses.length < 2) && (
              <View style={[styles.errorBox, { backgroundColor: `${C.info}15`, marginTop: Spacing.md, marginBottom: 0 }]}>
                <Ionicons name="information-circle" size={20} color={C.info} />
                <Text style={[styles.errorText, { color: C.info }]}>
                  {t('aiOptimizer.insufficientData')}
                </Text>
              </View>
            )}

            <Button title={t('aiOptimizer.startAnalysis')} onPress={analyze} fullWidth size="lg" icon="sparkles" />
          </>
        )}

        {loading && (
          <View style={styles.loaderBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loaderText}>{t('aiOptimizer.loadingText')}</Text>
          </View>
        )}

        {result && !loading && (
          <>
            <LinearGradient colors={C.gradientSuccess as [string, string]} style={styles.resultHero}>
              <Text style={styles.resultLabel}>{t('aiOptimizer.resultLabel')}</Text>
              <Text style={styles.resultBig}>{fmt(result.yearly_potential, CUR)}</Text>
              <Text style={styles.resultSub}>
                {t('aiOptimizer.resultSubMonthly', { amount: fmt(result.monthly_potential, CUR) })}
              </Text>
            </LinearGradient>

            {result.summary && <Text style={styles.summary}>{result.summary}</Text>}

            <Text style={styles.sectionTitle}>
              {t('aiOptimizer.proposalsCount', { n: (result.proposals ?? []).length })}
            </Text>

            {(result.proposals ?? []).map((p, idx) => {
              const meta = CATEGORY_META[p.category] || CATEGORY_META.other;
              const effort = EFFORT_META[p.effort] || EFFORT_META.medium;
              return (
                <Card key={idx} style={styles.proposalCard}>
                  <View style={styles.proposalHeader}>
                    <View style={[styles.catIcon, { backgroundColor: `${meta.color}20` }]}>
                      <Ionicons name={meta.icon} size={22} color={meta.color} />
                    </View>
                    <Text style={styles.proposalTitle}>{p.title}</Text>
                  </View>

                  <View style={styles.badgesRow}>
                    <View style={[styles.badge, { backgroundColor: `${meta.color}25` }]}>
                      <Text style={[styles.badgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${effort.color}25` }]}>
                      <Text style={[styles.badgeText, { color: effort.color }]}>
                        {effort.emoji} {t(effort.labelKey)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.savingRow}>
                    <Text style={styles.savingLabel}>{t('aiOptimizer.savingsPerMonth')}</Text>
                    <Text style={styles.savingMonth}>{fmt(p.potential_saving_monthly, CUR)}</Text>
                  </View>
                  <View style={styles.savingRow}>
                    <Text style={styles.savingLabel}>{t('aiOptimizer.savingsPerYear')}</Text>
                    <Text style={styles.savingYear}>{fmt(p.potential_saving_yearly, CUR)}</Text>
                  </View>

                  <Text style={styles.action}>👉 {p.action}</Text>
                  {p.explanation && <Text style={styles.explanation}>{p.explanation}</Text>}
                </Card>
              );
            })}

            {(result.tips ?? []).length > 0 && (
              <Card style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>{t('aiOptimizer.tipsTitle')}</Text>
                {(result.tips ?? []).map((tip, i) => (
                  <View key={i} style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Button
              title={t('aiOptimizer.restart')}
              onPress={() => { setResult(null); setError(null); }}
              fullWidth size="lg" icon="refresh" variant="secondary"
              style={{ marginTop: Spacing.lg }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
