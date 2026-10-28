/**
 * BUDGY TWIN — « Puis-je me permettre cet achat ? »
 *
 * Prototype Budgy Smart 4.0 (Étape 7) — écran isolé, 100 % lecture seule.
 * Calculs déterministes via src/services/twinSimulator.ts.
 * Aucune transaction réelle n'est modifiée, aucun paiement déclenché.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useMoney } from '../../src/hooks/useMoney';
import { getMonthlyFinancialSnapshot } from '../../src/stores/selectors';
import { simulatePurchase } from '../../src/services/twinSimulator';

export default function TwinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const m = useMoney();
  const { incomes, transactions, recurringExpenses, invoices, savingsGoals } = useStore();

  const [rawAmount, setRawAmount] = useState('');
  const [protectSavings, setProtectSavings] = useState(true);

  const snapshot = useMemo(
    () => getMonthlyFinancialSnapshot({ incomes, transactions, recurringExpenses, invoices }),
    [incomes, transactions, recurringExpenses, invoices],
  );
  const monthlyAutoSave = useMemo(
    () => savingsGoals.reduce((s, g) => s + (Number(g.autoSave) || 0), 0),
    [savingsGoals],
  );

  const amount = parseFloat(rawAmount.replace(',', '.')) || 0;
  const result = useMemo(
    () => simulatePurchase({ amount, snapshot, monthlyAutoSave, protectSavings }),
    [amount, snapshot, monthlyAutoSave, protectSavings],
  );

  const hasInput = amount > 0;
  const verdictColor =
    result.verdict === 'yes' ? C.success : result.verdict === 'tight' ? C.warning : C.error;
  const verdictIcon =
    result.verdict === 'yes' ? 'checkmark-circle' : result.verdict === 'tight' ? 'alert-circle' : 'close-circle';
  const verdictText =
    result.verdict === 'yes' ? t('twin.verdictYes') : result.verdict === 'tight' ? t('twin.verdictTight') : t('twin.verdictNo');

  const styles = makeStyles(C);

  const breakdownRows: { label: string; value: number; minus?: boolean }[] = [
    { label: t('twin.income'), value: result.breakdown.monthlyIncome },
    { label: t('twin.paid'), value: result.breakdown.paidExpenses, minus: true },
    { label: t('twin.recurring'), value: result.breakdown.recurringExpenses, minus: true },
    { label: t('twin.bills'), value: result.breakdown.upcomingBills, minus: true },
    ...(result.reservedSavings > 0
      ? [{ label: t('twin.reserved'), value: result.reservedSavings, minus: true }]
      : []),
    { label: t('twin.purchase'), value: result.breakdown.purchase, minus: true },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('twin.title')}</Text>
        <View style={styles.betaPill}>
          <Text style={styles.betaPillText}>BETA</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.prompt}>{t('twin.prompt')}</Text>

          {/* Montant */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>{t('twin.amountLabel')}</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputCurrency}>{m.code}</Text>
              <TextInput
                style={styles.input}
                value={rawAmount}
                onChangeText={setRawAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={C.placeholder}
                maxLength={10}
                testID="twin-amount-input"
              />
            </View>
          </View>

          {/* Préserver l'épargne */}
          <View style={styles.switchCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>{t('twin.protectSavings')}</Text>
              <Text style={styles.switchSub}>
                {t('twin.protectSavingsSub', { n: m.format(monthlyAutoSave) })}
              </Text>
            </View>
            <Switch
              value={protectSavings}
              onValueChange={setProtectSavings}
              trackColor={{ true: C.primary, false: C.cardBorder }}
              thumbColor="#FFF"
            />
          </View>

          {/* Avertissement données incomplètes */}
          {result.dataQuality !== 'ok' && (
            <View style={[styles.warnCard, { borderColor: `${C.warning}55` }]}>
              <Ionicons name="information-circle" size={18} color={C.warning} />
              <Text style={styles.warnText}>
                {result.dataQuality === 'none' ? t('twin.dataNone') : t('twin.dataPartial')}
              </Text>
            </View>
          )}

          {/* Résultat */}
          {hasInput && result.dataQuality !== 'none' && (
            <>
              <LinearGradient
                colors={C.gradientHero as [string, string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.resultCard}
              >
                <View style={[styles.verdictBadge, { backgroundColor: `${verdictColor}E6` }]}>
                  <Ionicons name={verdictIcon as any} size={16} color="#FFF" />
                  <Text style={styles.verdictText}>{verdictText}</Text>
                </View>
                <Text style={styles.resultLabel}>{t('twin.afterLabel')}</Text>
                <Text style={[styles.resultAmount, result.availableAfter < 0 && { color: '#FCA5A5' }]}>
                  {result.availableAfter < 0 ? '−' : ''}{m.code} {Math.abs(Math.round(result.availableAfter)).toLocaleString('fr-CH')}
                </Text>
                <Text style={styles.resultBefore}>
                  {t('twin.beforeLabel', { n: m.format(result.availableBefore) })}
                </Text>
              </LinearGradient>

              {/* Explication du calcul */}
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>{t('twin.breakdownTitle')}</Text>
                {breakdownRows.map((row) => (
                  <View key={row.label} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{row.label}</Text>
                    <Text style={[styles.breakdownValue, row.minus && { color: C.error }]}>
                      {row.minus ? '−' : '+'} {m.format(row.value)}
                    </Text>
                  </View>
                ))}
                <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                  <Text style={[styles.breakdownLabel, { color: C.text, fontWeight: FontWeights.bold }]}>
                    {t('twin.afterLabel')}
                  </Text>
                  <Text style={[styles.breakdownValue, { color: verdictColor, fontWeight: FontWeights.black }]}>
                    {result.availableAfter < 0 ? '−' : ''}{m.format(Math.abs(result.availableAfter))}
                  </Text>
                </View>
              </View>
            </>
          )}

          <Text style={styles.disclaimer}>{t('twin.disclaimer')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { flex: 1, color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, letterSpacing: -0.4 },
    betaPill: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
      backgroundColor: `${C.secondary}22`, borderWidth: 1, borderColor: `${C.secondary}55`,
    },
    betaPillText: { color: C.secondary, fontSize: 10, fontWeight: FontWeights.black, letterSpacing: 0.8 },
    prompt: { color: C.textSecondary, fontSize: FontSizes.md, marginBottom: Spacing.lg, lineHeight: 21 },

    inputCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.md,
    },
    inputLabel: {
      color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.xs,
    },
    inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    inputCurrency: { color: C.textSecondary, fontSize: FontSizes.lg, fontWeight: FontWeights.semibold },
    input: {
      flex: 1, minWidth: 0, color: C.text, fontSize: 40, fontWeight: FontWeights.black,
      letterSpacing: -1.5, padding: 0, fontVariant: ['tabular-nums'],
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },

    switchCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.md,
    },
    switchTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    switchSub: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },

    warnCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: C.card, borderWidth: 1,
      borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md,
    },
    warnText: { flex: 1, color: C.textSecondary, fontSize: FontSizes.xs, lineHeight: 17 },

    resultCard: {
      borderRadius: BorderRadius.xxl, padding: Spacing.xl,
      marginBottom: Spacing.md, overflow: 'hidden',
    },
    verdictBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 999,
      marginBottom: Spacing.md,
    },
    verdictText: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.black },
    resultLabel: {
      color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1.2, textTransform: 'uppercase',
    },
    resultAmount: {
      color: '#FFF', fontSize: 44, fontWeight: FontWeights.black,
      letterSpacing: -1.5, marginTop: 4, fontVariant: ['tabular-nums'],
    },
    resultBefore: { color: 'rgba(255,255,255,0.75)', fontSize: FontSizes.xs, marginTop: Spacing.sm },

    breakdownCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.md,
    },
    breakdownTitle: {
      color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.sm,
    },
    breakdownRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 7,
    },
    breakdownLabel: { color: C.textSecondary, fontSize: FontSizes.sm },
    breakdownValue: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, fontVariant: ['tabular-nums'] },
    breakdownTotal: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder,
      marginTop: Spacing.xs, paddingTop: Spacing.sm,
    },

    disclaimer: {
      color: C.textTertiary, fontSize: 11, lineHeight: 16,
      textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.md,
    },
  });
