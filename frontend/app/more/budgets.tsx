/**
 * GUARDIAN MONEY CHF - Budgets Screen
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, ProgressBar, EmptyState } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import { formatNumber, pct } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, budgets, transactions, addBudget, deleteBudget } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: 'courses', limit: '' });

  const CUR = preferences.currency;

  const budgetData = useMemo(() => {
    return budgets.map(b => {
      const spent = transactions
        .filter(t => t.category === b.category)
        .reduce((sum, t) => sum + t.amount, 0);
      const remaining = b.limit - spent;
      const percentage = pct(spent, b.limit);
      return { ...b, spent, remaining, percentage };
    });
  }, [budgets, transactions]);

  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgetData.reduce((sum, b) => sum + b.spent, 0);

  const handleAddBudget = () => {
    if (!newBudget.limit) {
      Alert.alert('Erreur', 'Veuillez entrer un montant');
      return;
    }

    addBudget({
      id: `budget_${Date.now()}`,
      category: newBudget.category,
      limit: parseFloat(newBudget.limit),
      color: getCategoryColor(newBudget.category),
      createdAt: Date.now(),
    });

    setNewBudget({ category: 'courses', limit: '' });
    setShowAddModal(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Budgets</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Budget total</Text>
          <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalBudget)}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summarySpent}>Dépensé: {formatNumber(totalSpent)}</Text>
            <Text style={styles.summaryRemaining}>Reste: {formatNumber(totalBudget - totalSpent)}</Text>
          </View>
          <ProgressBar value={pct(totalSpent, totalBudget)} color={totalSpent > totalBudget ? Colors.error : Colors.primary} height={10} />
        </Card>

        {budgetData.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="Aucun budget"
            subtitle="Créez des enveloppes pour contrôler vos dépenses"
            action={{ label: 'Créer', onPress: () => setShowAddModal(true) }}
          />
        ) : (
          budgetData.map((b) => (
            <Card key={b.id} style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <CategoryIcon category={b.category} size="md" />
                <View style={styles.budgetInfo}>
                  <Text style={styles.budgetName}>{getCategoryName(b.category)}</Text>
                  <Text style={styles.budgetLimit}>Limite: {CUR} {formatNumber(b.limit)}</Text>
                </View>
                <View style={styles.budgetAmounts}>
                  <Text style={[styles.budgetSpent, { color: b.percentage > 100 ? Colors.error : Colors.text }]}>
                    {formatNumber(b.spent)}
                  </Text>
                  <Text style={styles.budgetRemaining}>
                    {b.remaining >= 0 ? `Reste ${formatNumber(b.remaining)}` : `Dépassé ${formatNumber(Math.abs(b.remaining))}`}
                  </Text>
                </View>
              </View>
              <ProgressBar
                value={b.percentage}
                color={b.percentage > 100 ? Colors.error : b.percentage > 80 ? Colors.warning : getCategoryColor(b.category)}
                height={8}
                showLabel
              />
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteBudget(b.id)}>
                <Ionicons name="trash-outline" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            </Card>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau budget</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.slice(0, 8).map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryItem, newBudget.category === cat.id && styles.categoryItemSelected]}
                    onPress={() => setNewBudget((p) => ({ ...p, category: cat.id }))}
                  >
                    <CategoryIcon category={cat.id} size="sm" />
                    <Text style={styles.categoryLabel}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Limite mensuelle ({CUR})</Text>
            <TextInput
              style={styles.input}
              value={newBudget.limit}
              onChangeText={(t) => setNewBudget((p) => ({ ...p, limit: t }))}
              placeholder="200"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
            />

            <Button title="Créer le budget" onPress={handleAddBudget} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  addButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  summaryCard: { marginBottom: Spacing.lg },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryAmount: { color: Colors.text, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: Spacing.sm },
  summarySpent: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryRemaining: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  budgetCard: { marginBottom: Spacing.md, position: 'relative' },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  budgetInfo: { flex: 1, marginLeft: Spacing.md },
  budgetName: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  budgetLimit: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  budgetAmounts: { alignItems: 'flex-end' },
  budgetSpent: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  budgetRemaining: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  deleteBtn: { position: 'absolute', top: Spacing.sm, right: Spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  categoryGrid: { flexDirection: 'row', gap: Spacing.sm },
  categoryItem: { alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, minWidth: 70 },
  categoryItemSelected: { backgroundColor: `${Colors.primary}30`, borderWidth: 1, borderColor: Colors.primary },
  categoryLabel: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: Spacing.xs },
});
