/**
 * GUARDIAN MONEY CHF - Debts Screen
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { Card, ProgressBar, EmptyState } from '../../src/components/ui';
import { useStore } from '../../src/stores/useStore';
import { formatNumber, pct } from '../../src/utils/calculations';

export default function DebtsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, debts } = useStore();
  const CUR = preferences.currency;

  const totalDebt = debts.reduce((sum, d) => sum + (d.total - d.paid), 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Dettes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Dette totale restante</Text>
          <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalDebt)}</Text>
        </Card>

        {debts.length === 0 ? (
          <EmptyState
            icon="card-outline"
            title="Aucune dette"
            subtitle="Félicitations, vous n'avez pas de dettes!"
          />
        ) : (
          debts.map((debt) => (
            <Card key={debt.id} style={styles.debtCard}>
              <View style={styles.debtHeader}>
                <Ionicons name="card" size={24} color={debt.color} />
                <View style={styles.debtInfo}>
                  <Text style={styles.debtTitle}>{debt.title}</Text>
                  <Text style={styles.debtRate}>Taux: {debt.interestRate}%</Text>
                </View>
                <View style={styles.debtAmounts}>
                  <Text style={styles.debtRemaining}>{formatNumber(debt.total - debt.paid)}</Text>
                  <Text style={styles.debtTotal}>/ {formatNumber(debt.total)}</Text>
                </View>
              </View>
              <ProgressBar value={pct(debt.paid, debt.total)} color={debt.color} height={8} showLabel />
              <Text style={styles.debtMonthly}>Mensualité: {CUR} {formatNumber(debt.monthlyPayment)}</Text>
            </Card>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  summaryCard: { marginBottom: Spacing.lg, alignItems: 'center' },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryAmount: { color: Colors.error, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black },
  debtCard: { marginBottom: Spacing.md },
  debtHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  debtInfo: { flex: 1, marginLeft: Spacing.md },
  debtTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  debtRate: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  debtAmounts: { alignItems: 'flex-end' },
  debtRemaining: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  debtTotal: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  debtMonthly: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.sm },
});
