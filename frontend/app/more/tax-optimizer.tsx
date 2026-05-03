/**
 * BUDGY - Swiss Tax Optimizer (Premium)
 * Family-aware questionnaire → auto-computes deductions, LAMal premium, IFD + ICC.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { Card, Button } from '../../src/components/ui';
import { useStore } from '../../src/stores/useStore';

const API = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CANTONS = ['GE','VD','ZH','BE','FR','NE','VS','JU','TI','BS','LU','SG','AG','SO','GR','SH','ZG','SZ'];
const FRANCHISES = [300, 500, 1000, 1500, 2000, 2500];

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");

interface Result {
  success: boolean;
  gross_salary: number;
  lamal_annual: number;
  lamal_monthly: number;
  deductions: { label: string; amount: number; source: string }[];
  total_deductions: number;
  taxable_income: number;
  ifd: number;
  icc: number;
  total_tax: number;
  net_income: number;
  effective_rate: number;
  savings_tips: string[];
}

export default function TaxOptimizerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences } = useStore();

  const [step, setStep] = useState<'form' | 'result'>('form');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [form, setForm] = useState({
    gross_salary: '85000',
    canton: (preferences as any).canton || 'VD',
    civil_status: 'single' as 'single' | 'married' | 'partnership',
    spouse_income: '',
    num_children: 0,
    age: '35',
    lamal_franchise: 300,
    pillar_3a: '',
    transport_costs: '',
  });

  const run = async () => {
    setLoading(true);
    try {
      const body = {
        gross_salary: parseFloat(form.gross_salary) || 0,
        canton: form.canton,
        civil_status: form.civil_status,
        spouse_income: parseFloat(form.spouse_income) || 0,
        num_children: form.num_children,
        age: parseInt(form.age) || 35,
        lamal_franchise: form.lamal_franchise,
        pillar_3a: parseFloat(form.pillar_3a) || 0,
        transport_costs: parseFloat(form.transport_costs) || 0,
      };
      const r = await fetch(`${API}/api/tax/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResult(data);
      setStep('result');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de calculer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 'result' ? setStep('form') : router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Optimiseur d'impôts</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'form' && (
            <>
              <Animated.View entering={FadeInDown.duration(500)}>
                <LinearGradient colors={['#7C3AED', '#6366F1']} style={styles.hero}>
                  <Text style={styles.heroEmoji}>🇨🇭</Text>
                  <Text style={styles.heroTitle}>Simulateur fiscal suisse</Text>
                  <Text style={styles.heroSub}>
                    Impôts (IFD + ICC), déductions automatiques et prime LAMal selon votre situation familiale
                  </Text>
                </LinearGradient>
              </Animated.View>

              {/* Salary */}
              <Text style={styles.sectionTitle}>1. Salaire brut annuel</Text>
              <TextInput
                style={styles.inputBig}
                value={form.gross_salary}
                onChangeText={(t) => setForm((p) => ({ ...p, gross_salary: t }))}
                placeholder="85000"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />

              {/* Canton */}
              <Text style={styles.sectionTitle}>2. Canton</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CANTONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, form.canton === c && styles.chipActive]}
                    onPress={() => setForm((p) => ({ ...p, canton: c }))}
                  >
                    <Text style={[styles.chipTxt, form.canton === c && styles.chipTxtActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Family status */}
              <Text style={styles.sectionTitle}>3. Situation familiale</Text>
              <View style={styles.segmentRow}>
                {[
                  { k: 'single', lbl: '👤 Célibataire' },
                  { k: 'married', lbl: '💍 Marié(e)' },
                  { k: 'partnership', lbl: '🏳️‍🌈 Pacsé(e)' },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.k}
                    style={[styles.segment, form.civil_status === s.k && styles.segmentActive]}
                    onPress={() => setForm((p) => ({ ...p, civil_status: s.k as any }))}
                  >
                    <Text style={[styles.segmentLbl, form.civil_status === s.k && styles.segmentLblActive]}>
                      {s.lbl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Spouse income if married */}
              {(form.civil_status === 'married' || form.civil_status === 'partnership') && (
                <>
                  <Text style={styles.sectionTitle}>4. Salaire annuel du conjoint (optionnel)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.spouse_income}
                    onChangeText={(t) => setForm((p) => ({ ...p, spouse_income: t }))}
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                  />
                </>
              )}

              {/* Children */}
              <Text style={styles.sectionTitle}>
                {(form.civil_status === 'married' || form.civil_status === 'partnership') ? '5' : '4'}. Nombre d'enfants à charge
              </Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setForm((p) => ({ ...p, num_children: Math.max(0, p.num_children - 1) }))}
                >
                  <Ionicons name="remove" size={24} color={Colors.text} />
                </TouchableOpacity>
                <View style={styles.counterDisplay}>
                  <Text style={styles.counterValue}>{form.num_children}</Text>
                  <Text style={styles.counterSub}>
                    {form.num_children === 0 ? 'aucun' : form.num_children === 1 ? 'enfant' : 'enfants'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setForm((p) => ({ ...p, num_children: Math.min(10, p.num_children + 1) }))}
                >
                  <Ionicons name="add" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* LAMal franchise */}
              <Text style={styles.sectionTitle}>Franchise LAMal</Text>
              <Text style={styles.help}>Plus la franchise est élevée, plus la prime est basse.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {FRANCHISES.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, form.lamal_franchise === f && styles.chipActive]}
                    onPress={() => setForm((p) => ({ ...p, lamal_franchise: f }))}
                  >
                    <Text style={[styles.chipTxt, form.lamal_franchise === f && styles.chipTxtActive]}>
                      CHF {fmt(f)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* 3a */}
              <Text style={styles.sectionTitle}>3ᵉ pilier lié (3a) versé cette année</Text>
              <Text style={styles.help}>Max 2025 : CHF 7'258/an pour salariés</Text>
              <TextInput
                style={styles.input}
                value={form.pillar_3a}
                onChangeText={(t) => setForm((p) => ({ ...p, pillar_3a: t }))}
                placeholder="0"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />

              {/* Transport */}
              <Text style={styles.sectionTitle}>Frais de transport annuels (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={form.transport_costs}
                onChangeText={(t) => setForm((p) => ({ ...p, transport_costs: t }))}
                placeholder="0 (max CHF 3'200)"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />

              <Button
                title="Calculer mes impôts →"
                onPress={run}
                fullWidth size="lg"
                loading={loading}
                style={{ marginTop: Spacing.xl, marginBottom: 40 }}
              />
            </>
          )}

          {step === 'result' && result && (
            <>
              <Animated.View entering={FadeInDown.duration(500)}>
                <LinearGradient colors={['#06D6A0', '#0891B2']} style={styles.resultHero}>
                  <Text style={styles.heroLabel}>IMPÔTS ESTIMÉS</Text>
                  <Text style={styles.resultBig}>CHF {fmt(result.total_tax)}</Text>
                  <Text style={styles.resultSub}>soit {result.effective_rate.toFixed(2)}% de votre revenu brut</Text>

                  <View style={styles.resultSplit}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.splitLbl}>IFD (fédéral)</Text>
                      <Text style={styles.splitVal}>CHF {fmt(result.ifd)}</Text>
                    </View>
                    <View style={styles.splitSep} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.splitLbl}>ICC ({form.canton})</Text>
                      <Text style={styles.splitVal}>CHF {fmt(result.icc)}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* LAMal summary */}
              <Animated.View entering={FadeInDown.duration(500).delay(100)}>
                <Card style={styles.lamalCard}>
                  <View style={styles.lamalRow}>
                    <View>
                      <Text style={styles.lamalLbl}>🏥 Prime LAMal</Text>
                      <Text style={styles.lamalBig}>CHF {fmt(result.lamal_monthly)}/mois</Text>
                      <Text style={styles.lamalSub}>CHF {fmt(result.lamal_annual)}/an · Franchise {form.lamal_franchise}</Text>
                    </View>
                    <TouchableOpacity style={styles.lamalCta} onPress={() => router.push('/more/lamal-comparator' as any)}>
                      <Text style={styles.lamalCtaTxt}>Comparer →</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              </Animated.View>

              {/* Deductions breakdown */}
              <Animated.View entering={FadeInDown.duration(500).delay(200)}>
                <Card style={styles.dedCard}>
                  <View style={styles.dedHeader}>
                    <Text style={styles.dedTitle}>Déductions fiscales</Text>
                    <Text style={styles.dedTotal}>CHF {fmt(result.total_deductions)}</Text>
                  </View>
                  {result.deductions.map((d, i) => (
                    <View key={i} style={[styles.dedRow, i < result.deductions.length - 1 && styles.dedRowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dedLabel}>{d.label}</Text>
                        <Text style={styles.dedSource}>{d.source}</Text>
                      </View>
                      <Text style={styles.dedAmount}>− CHF {fmt(d.amount)}</Text>
                    </View>
                  ))}
                  <View style={styles.taxableBox}>
                    <Text style={styles.taxableLbl}>Revenu imposable</Text>
                    <Text style={styles.taxableVal}>CHF {fmt(result.taxable_income)}</Text>
                  </View>
                </Card>
              </Animated.View>

              {/* Tips */}
              {result.savings_tips.length > 0 && (
                <Animated.View entering={FadeInDown.duration(500).delay(300)}>
                  <Card style={styles.tipsCard}>
                    <Text style={styles.tipsTitle}>💡 Conseils d'économies</Text>
                    {result.savings_tips.map((t, i) => (
                      <View key={i} style={styles.tipRow}>
                        <Text style={styles.tipTxt}>{t}</Text>
                      </View>
                    ))}
                  </Card>
                </Animated.View>
              )}

              <Button
                title="Modifier ma situation"
                onPress={() => setStep('form')}
                fullWidth size="lg" variant="secondary"
                style={{ marginTop: Spacing.lg }}
              />
              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg },

  hero: { borderRadius: BorderRadius.xxl, padding: Spacing.xl, marginBottom: Spacing.lg, alignItems: 'center' },
  heroEmoji: { fontSize: 44, marginBottom: Spacing.sm },
  heroTitle: { color: '#FFF', fontSize: FontSizes.xl, fontWeight: FontWeights.black, textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.xs, lineHeight: 20 },

  sectionTitle: {
    color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold,
    marginTop: Spacing.lg, marginBottom: Spacing.xs,
  },
  help: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginBottom: Spacing.xs, fontStyle: 'italic' },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    color: Colors.text, fontSize: FontSizes.md,
  },
  inputBig: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.lg,
    color: Colors.text, fontSize: 28, fontWeight: FontWeights.black, textAlign: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    marginRight: Spacing.sm,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  chipTxtActive: { color: '#FFF' },

  segmentRow: { flexDirection: 'row', gap: 6, backgroundColor: Colors.card, padding: 4, borderRadius: BorderRadius.lg },
  segment: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.primary },
  segmentLbl: { color: Colors.textSecondary, fontSize: 12, fontWeight: FontWeights.semibold },
  segmentLblActive: { color: '#FFF' },

  counterRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center',
  },
  counterDisplay: { flex: 1, alignItems: 'center' },
  counterValue: { color: Colors.text, fontSize: 32, fontWeight: FontWeights.black },
  counterSub: { color: Colors.textSecondary, fontSize: FontSizes.xs },

  // Result
  resultHero: { borderRadius: BorderRadius.xxl, padding: Spacing.xl, marginBottom: Spacing.lg, alignItems: 'center' },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold,
    letterSpacing: 1.3, textTransform: 'uppercase',
  },
  resultBig: { color: '#FFF', fontSize: 48, fontWeight: FontWeights.black, letterSpacing: -1.5, marginTop: Spacing.sm },
  resultSub: { color: 'rgba(255,255,255,0.9)', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginTop: 4 },
  resultSplit: {
    flexDirection: 'row', marginTop: Spacing.lg, width: '100%', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  splitLbl: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  splitVal: { color: '#FFF', fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: 2 },
  splitSep: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.md },

  lamalCard: { padding: Spacing.lg, marginBottom: Spacing.md },
  lamalRow: { flexDirection: 'row', alignItems: 'center' },
  lamalLbl: { color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, textTransform: 'uppercase' },
  lamalBig: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black, marginTop: 4 },
  lamalSub: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
  lamalCta: {
    backgroundColor: `${Colors.success}25`, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 999,
  },
  lamalCtaTxt: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

  dedCard: { padding: Spacing.lg, marginBottom: Spacing.md },
  dedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: Spacing.md,
  },
  dedTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  dedTotal: { color: Colors.success, fontSize: FontSizes.md, fontWeight: FontWeights.black },
  dedRow: { flexDirection: 'row', paddingVertical: Spacing.sm, alignItems: 'center' },
  dedRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  dedLabel: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  dedSource: { color: Colors.textTertiary, fontSize: 10, marginTop: 2 },
  dedAmount: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  taxableBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginTop: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: 2, borderTopColor: Colors.primaryLight,
  },
  taxableLbl: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  taxableVal: { color: Colors.primaryLight, fontSize: FontSizes.lg, fontWeight: FontWeights.black },

  tipsCard: { padding: Spacing.lg },
  tipsTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
  tipRow: { marginBottom: Spacing.sm },
  tipTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
});
