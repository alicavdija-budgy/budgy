/**
 * GUARDIAN MONEY CHF - LAMal Subsidy Calculator
 * Estimates eligibility and amount of LAMal subsidy per canton.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { CANTONS, type CantonCode } from '../../src/data/swiss-data';
import { Card, Button } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

const HOUSEHOLD_OPTIONS = [
  { id: 'single', emoji: '\ud83d\udc64', label: 'C\u00e9libataire' },
  { id: 'couple', emoji: '\ud83d\udc6b', label: 'Couple' },
  { id: 'family', emoji: '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67', label: 'Famille' },
  { id: 'single_parent', emoji: '\ud83d\udc69\u200d\ud83d\udc66', label: 'Parent solo' },
] as const;

export default function LamalSubsidyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences } = useStore();

  const [canton, setCanton] = useState<CantonCode>(preferences.canton || 'VD');
  const [income, setIncome] = useState(
    preferences.monthlyIncome ? String(preferences.monthlyIncome * 12) : ''
  );
  const [household, setHousehold] = useState<string>(preferences.household || 'single');
  const [children, setChildren] = useState<number>(preferences.children || 0);
  const [premium, setPremium] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    const inc = parseFloat(income.replace(/[\s']/g, '').replace(',', '.'));
    if (!inc || inc <= 0) return;
    const prem = parseFloat(premium.replace(',', '.')) || 0;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/lamal/subsidy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canton,
          yearly_income: inc,
          household,
          children,
          monthly_premium: prem,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Subsides LAMal</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Estimez vos droits aux subsides cantonaux d\u2019assurance-maladie selon votre revenu, canton et situation familiale.
        </Text>

        {/* Canton */}
        <Text style={styles.sectionLabel}>Canton</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {(Object.keys(CANTONS) as CantonCode[]).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.cantonChip, canton === c && styles.cantonChipActive]}
                onPress={() => setCanton(c)}
              >
                <Text
                  style={[
                    styles.cantonChipText,
                    canton === c && styles.cantonChipTextActive,
                  ]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Income */}
        <Text style={styles.sectionLabel}>Revenu annuel net (CHF)</Text>
        <View style={styles.inputBox}>
          <Text style={styles.cur}>CHF</Text>
          <TextInput
            style={styles.input}
            value={income}
            onChangeText={(t) => setIncome(t.replace(/[^0-9.,]/g, ''))}
            placeholder="60000"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={styles.curSuffix}>/ an</Text>
        </View>

        {/* Household */}
        <Text style={styles.sectionLabel}>Situation familiale</Text>
        <View style={styles.householdRow}>
          {HOUSEHOLD_OPTIONS.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[styles.hhOption, household === h.id && styles.hhOptionActive]}
              onPress={() => setHousehold(h.id)}
            >
              <Text style={styles.hhEmoji}>{h.emoji}</Text>
              <Text
                style={[styles.hhLabel, household === h.id && styles.hhLabelActive]}
              >
                {h.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(household === 'family' || household === 'single_parent') && (
          <>
            <Text style={styles.sectionLabel}>Nombre d\u2019enfants</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setChildren(Math.max(0, children - 1))}
              >
                <Ionicons name="remove" size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.counterValue}>{children}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setChildren(Math.min(10, children + 1))}
              >
                <Ionicons name="add" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Current premium */}
        <Text style={styles.sectionLabel}>Prime LAMal mensuelle actuelle (optionnel)</Text>
        <View style={styles.inputBox}>
          <Text style={styles.cur}>CHF</Text>
          <TextInput
            style={styles.input}
            value={premium}
            onChangeText={(t) => setPremium(t.replace(/[^0-9.,]/g, ''))}
            placeholder="450"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
          />
          <Text style={styles.curSuffix}>/ mois</Text>
        </View>

        <Button
          title={loading ? 'Calcul...' : 'Calculer mes subsides'}
          onPress={calculate}
          loading={loading}
          icon="calculator"
          fullWidth
          size="lg"
          style={{ marginTop: Spacing.lg }}
        />

        {loading && (
          <ActivityIndicator color={Colors.primaryLight} style={{ marginTop: Spacing.lg }} />
        )}

        {result && (
          <View style={{ marginTop: Spacing.xl }}>
            <LinearGradient
              colors={
                result.eligible
                  ? (Colors.gradientSuccess as [string, string])
                  : ['#374151', '#1F2937']
              }
              style={styles.resultCard}
            >
              <Ionicons
                name={result.eligible ? 'checkmark-circle' : 'close-circle'}
                size={36}
                color={Colors.text}
              />
              <Text style={styles.resultTitle}>
                {result.eligible ? 'Vous \u00eates \u00e9ligible !' : 'Pas de subside attendu'}
              </Text>
              {result.eligible && (
                <>
                  <Text style={styles.resultBig}>
                    CHF {formatNumber(result.estimated_monthly_subsidy)}
                  </Text>
                  <Text style={styles.resultSmall}>
                    par mois (~CHF {formatNumber(result.estimated_yearly_subsidy)} / an)
                  </Text>
                  {result.final_premium > 0 && (
                    <View style={styles.savingsBox}>
                      <Text style={styles.savingsLabel}>Prime apr\u00e8s subside</Text>
                      <Text style={styles.savingsValue}>
                        CHF {formatNumber(result.final_premium)}/mois
                      </Text>
                    </View>
                  )}
                </>
              )}
              <Text style={styles.resultExpl}>{result.explanation}</Text>
            </LinearGradient>

            <Card style={{ marginTop: Spacing.md, padding: Spacing.lg }}>
              <Text style={styles.tipTitle}>\ud83d\udca1 Comment demander ?</Text>
              <Text style={styles.tipText}>
                Adressez-vous \u00e0 l\u2019Office cantonal d\u2019assurance-maladie ({canton}). Pr\u00e9parez votre derni\u00e8re d\u00e9cision de taxation et un justificatif d\u2019affiliation.
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  intro: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.lg, lineHeight: 20 },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm },
  cantonChip: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  cantonChipActive: { backgroundColor: `${Colors.primary}25`, borderColor: Colors.primary },
  cantonChipText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  cantonChipTextActive: { color: Colors.primaryLight },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  cur: { color: Colors.textSecondary, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  input: { flex: 1, color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, paddingVertical: Spacing.md },
  curSuffix: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  householdRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  hhOption: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  hhOptionActive: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  hhEmoji: { fontSize: 24, marginBottom: 4 },
  hhLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  hhLabelActive: { color: Colors.text },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, justifyContent: 'center', marginBottom: Spacing.lg },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  counterValue: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, minWidth: 40, textAlign: 'center' },
  resultCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  resultBig: { color: Colors.text, fontSize: FontSizes.hero, fontWeight: FontWeights.black },
  resultSmall: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.sm },
  resultExpl: { color: 'rgba(255,255,255,0.95)', fontSize: FontSizes.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
  savingsBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  savingsLabel: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs },
  savingsValue: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  tipTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },
  tipText: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
});
