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

const API = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

const CATEGORY_META: Record<Category, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  subscription: { icon: 'play-circle', label: 'Abonnement', color: '#EC4899' },
  insurance: { icon: 'shield-checkmark', label: 'Assurance', color: '#10B981' },
  food: { icon: 'restaurant', label: 'Alimentation', color: '#F97316' },
  energy: { icon: 'flash', label: 'Énergie', color: '#F59E0B' },
  telco: { icon: 'cellular', label: 'Télécom', color: '#0EA5E9' },
  bank: { icon: 'card', label: 'Banque', color: '#8B5CF6' },
  tax: { icon: 'calculator', label: 'Impôts', color: '#6366F1' },
  other: { icon: 'sparkles', label: 'Autre', color: '#14B8A6' },
};

const EFFORT_META: Record<Effort, { label: string; color: string; emoji: string }> = {
  easy: { label: 'Facile', color: '#10B981', emoji: '⚡' },
  medium: { label: 'Moyen', color: '#F59E0B', emoji: '⏱️' },
  hard: { label: 'Démarche', color: '#EF4444', emoji: '🛠️' },
};

function fmt(n: number, cur: string): string {
  return `${cur} ${Math.round(n).toLocaleString('fr-CH').replace(/,/g, "'")}`;
}

export default function AIOptimizerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const store = useStore();
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
    if (!API) {
      setError('URL backend manquante');
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
        transactions: store.transactions.slice(0, 120).map((t) => ({
          title: t.title,
          amount: t.amount,
          category: t.category,
          date: t.date,
        })),
        recurring_expenses: store.recurringExpenses.map((r) => ({
          title: r.title,
          amount: r.amount,
          category: r.category,
          frequency: r.frequency,
        })),
        contracts: (store.contracts || []).map((c: any) => ({
          name: c.name,
          type: c.type,
          monthlyCost: c.monthlyCost,
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
      };

      const resp = await fetch(`${API}/api/optimizer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: OptimizerResult = await resp.json();
      if (!data.success) throw new Error(data.error || 'Analyse échouée');
      setResult(data);
    } catch (e: any) {
      setError(e?.message || String(e));
      Alert.alert('Erreur', e?.message || 'Impossible de lancer l\'analyse');
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
        <Text style={styles.title}>Économiseur IA</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!result && !loading && (
          <>
            <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.hero}>
              <Text style={styles.heroEmoji}>🧠</Text>
              <Text style={styles.heroTitle}>Analyse IA de vos finances</Text>
              <Text style={styles.heroSub}>
                Notre IA examine vos dépenses, abonnements et contrats pour proposer des économies concrètes adaptées à la Suisse.
              </Text>
            </LinearGradient>

            <Card style={styles.incomeCard}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Base de l'analyse</Text>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>Revenu mensuel estimé</Text>
                <Text style={styles.incomeValue}>{fmt(monthlyIncome, CUR)}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>Revenu annuel estimé</Text>
                <Text style={styles.incomeValue}>{fmt(yearlyIncome, CUR)}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>Transactions analysées</Text>
                <Text style={styles.incomeValue}>{store.transactions.length}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>Dépenses récurrentes</Text>
                <Text style={styles.incomeValue}>{store.recurringExpenses.length}</Text>
              </View>
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>Canton</Text>
                <Text style={styles.incomeValue}>{(store.preferences as any).canton || 'VD'}</Text>
              </View>
            </Card>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color={C.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button title="Lancer l'analyse IA" onPress={analyze} fullWidth size="lg" icon="sparkles" />
          </>
        )}

        {loading && (
          <View style={styles.loaderBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loaderText}>
              🧠 L'IA analyse vos finances...{'\n'}Identification des économies possibles (10-20 s)
            </Text>
          </View>
        )}

        {result && !loading && (
          <>
            <LinearGradient colors={C.gradientSuccess as [string, string]} style={styles.resultHero}>
              <Text style={styles.resultLabel}>Économie potentielle annuelle</Text>
              <Text style={styles.resultBig}>{fmt(result.yearly_potential, CUR)}</Text>
              <Text style={styles.resultSub}>soit ~{fmt(result.monthly_potential, CUR)}/mois</Text>
            </LinearGradient>

            {result.summary && <Text style={styles.summary}>{result.summary}</Text>}

            <Text style={styles.sectionTitle}>Propositions concrètes ({result.proposals.length})</Text>

            {result.proposals.map((p, idx) => {
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
                      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${effort.color}25` }]}>
                      <Text style={[styles.badgeText, { color: effort.color }]}>
                        {effort.emoji} {effort.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.savingRow}>
                    <Text style={styles.savingLabel}>💰 Économie / mois</Text>
                    <Text style={styles.savingMonth}>{fmt(p.potential_saving_monthly, CUR)}</Text>
                  </View>
                  <View style={styles.savingRow}>
                    <Text style={styles.savingLabel}>📅 Économie / an</Text>
                    <Text style={styles.savingYear}>{fmt(p.potential_saving_yearly, CUR)}</Text>
                  </View>

                  <Text style={styles.action}>👉 {p.action}</Text>
                  {p.explanation && <Text style={styles.explanation}>{p.explanation}</Text>}
                </Card>
              );
            })}

            {result.tips.length > 0 && (
              <Card style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>💡 Conseils Budgy</Text>
                {result.tips.map((tip, i) => (
                  <View key={i} style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Button
              title="Relancer l'analyse"
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
