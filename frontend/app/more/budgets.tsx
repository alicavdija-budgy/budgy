/**
 * GUARDIAN MONEY CHF - Budgets Screen
 *
 *
 * ⚠ Residual FR-CH fallback labels / EditField props / examples;
 * multi-locale wrapping deferred to v3.9.1 backlog.
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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, ProgressBar, EmptyState } from '../../src/components/ui';
import AnimatedProgressBar from '../../src/components/AnimatedProgressBar';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import { formatNumber, pct } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

export default function BudgetsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, budgets, transactions, incomes, addBudget, updateBudget, deleteBudget } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: 'courses', limit: '' });
  const [incomeView, setIncomeView] = useState<'monthly' | 'yearly'>('monthly');

  // CRUD: actions sheet & edit modal
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const editingBudget = useMemo(
    () => budgets.find((b) => b.id === editingBudgetId) || null,
    [editingBudgetId, budgets]
  );
  const BUDGET_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'category', label: t('budgetsUi.category'), type: 'select', options: EXPENSE_CATEGORIES.slice(0, 12).map((c) => ({ value: c.id, label: t(`categoryLabels.${c.id}`) || c.name, color: c.color })) },
    { key: 'limit', label: t('budgetsUi.monthLimit'), type: 'number', icon: 'cash-outline', placeholder: '500', required: true },
  ], [t]);
  const handleEditBudgetSubmit = (values: Record<string, any>) => {
    if (!editingBudget) return;
    const limit = parseFloat(String(values.limit).replace(',', '.')) || editingBudget.limit;
    updateBudget(editingBudget.id, {
      category: values.category || editingBudget.category,
      limit,
      color: getCategoryColor(values.category || editingBudget.category),
    });
    setEditingBudgetId(null);
  };

  const CUR = preferences.currency;

  // Compute total income (from incomes store, normalized to monthly)
  const monthlyIncome = useMemo(() => {
    const fromIncomes = incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
    return fromIncomes || (preferences as any).monthlyIncome || 0;
  }, [incomes, preferences]);
  const yearlyIncome = monthlyIncome * 12;
  const displayedIncome = incomeView === 'monthly' ? monthlyIncome : yearlyIncome;
  const displayedBudget = 0; // computed below

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
  // Adjust totals for the selected view (monthly is base; yearly = ×12)
  const viewBudget = incomeView === 'monthly' ? totalBudget : totalBudget * 12;
  const viewSpent = incomeView === 'monthly' ? totalSpent : totalSpent * 12;
  const savingsCapacity = displayedIncome - viewBudget;

  const handleAddBudget = () => {
    if (!newBudget.limit) {
      Alert.alert('Erreur', t('budgetsUi.errAmount'));
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
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Budgets</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Revenue card with monthly/yearly toggle */}
        <Card style={styles.summaryCard}>
          <View style={styles.toggleRow}>
            {(['monthly', 'yearly'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.toggleBtn, incomeView === m && styles.toggleBtnActive]}
                onPress={() => setIncomeView(m)}
              >
                <Text style={[styles.toggleText, incomeView === m && styles.toggleTextActive]}>
                  {m === 'monthly' ? 'Mensuel' : 'Annuel'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.summaryLabel}>
            Revenu {incomeView === 'monthly' ? 'mensuel' : 'annuel'}
          </Text>
          <Text style={styles.summaryIncome}>{CUR} {formatNumber(displayedIncome)}</Text>

          <View style={styles.divider} />

          <Text style={styles.summaryLabel}>
            Budget total {incomeView === 'monthly' ? 'mensuel' : 'annuel'}
          </Text>
          <Text style={styles.summaryAmount}>{CUR} {formatNumber(viewBudget)}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summarySpent}>Dépensé: {formatNumber(viewSpent)}</Text>
            <Text style={styles.summaryRemaining}>Reste: {formatNumber(viewBudget - viewSpent)}</Text>
          </View>
          <AnimatedProgressBar
            value={pct(viewSpent, viewBudget)}
            height={10}
          />

          {/* Savings capacity = revenu - budget */}
          {displayedIncome > 0 && (
            <View style={styles.capacityBox}>
              <Ionicons
                name={savingsCapacity >= 0 ? 'trending-up' : 'trending-down'}
                size={18}
                color={savingsCapacity >= 0 ? theme.success : theme.error}
              />
              <Text style={styles.capacityLabel}>
                {t('budgetsScreen.savingsRatioSuffix')} {incomeView === 'monthly' ? '/mois' : '/an'}
              </Text>
              <Text style={[
                styles.capacityValue,
                { color: savingsCapacity >= 0 ? theme.success : theme.error }
              ]}>
                {savingsCapacity >= 0 ? '+' : ''}{CUR} {formatNumber(savingsCapacity)}
              </Text>
            </View>
          )}
        </Card>

        {budgetData.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title={t('budgetsScreen.emptyTitle')}
            subtitle={t('budgetsScreen.emptySub')}
            action={{ label: t('budgetsUi.createBtn'), onPress: () => setShowAddModal(true) }}
          />
        ) : (
          budgetData.map((b) => (
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.85}
              onLongPress={() => setActionsCtx({
                id: b.id,
                title: getCategoryName(b.category, t),
                subtitle: `Limite ${CUR} ${formatNumber(b.limit)} · Dépensé ${formatNumber(b.spent)}`,
                accent: getCategoryColor(b.category),
              })}
            >
            <Card style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <CategoryIcon category={b.category} size="md" />
                <View style={styles.budgetInfo}>
                  <Text style={styles.budgetName}>{getCategoryName(b.category, t)}</Text>
                  <Text style={styles.budgetLimit}>Limite: {CUR} {formatNumber(b.limit)}</Text>
                </View>
                <View style={styles.budgetAmounts}>
                  <Text style={[styles.budgetSpent, { color: b.percentage > 100 ? theme.error : theme.text }]}>
                    {formatNumber(b.spent)}
                  </Text>
                  <Text style={styles.budgetRemaining}>
                    {b.remaining >= 0 ? `Reste ${formatNumber(b.remaining)}` : `Dépassé ${formatNumber(Math.abs(b.remaining))}`}
                  </Text>
                </View>
              </View>
              <AnimatedProgressBar
                value={b.percentage}
                height={10}
              />
              <TouchableOpacity style={styles.deleteBtn} onPress={() => setActionsCtx({
                id: b.id,
                title: getCategoryName(b.category, t),
                subtitle: `Limite ${CUR} ${formatNumber(b.limit)}`,
                accent: getCategoryColor(b.category),
              })}>
                <Ionicons name="ellipsis-horizontal" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            </Card>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nouveau budget</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
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
                      <Text style={styles.categoryLabel}>{t(`categoryLabels.${cat.id}`) || cat.name}</Text>
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
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Button title={t('budgetsScreen.createBudget')} onPress={handleAddBudget} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* CRUD: actions sheet + edit modal */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingBudgetId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) deleteBudget(id);
        }}
        deleteConfirmTitle={t('budgetsScreen.deleteConfirm')}
      />
      <EntityEditModal
        visible={!!editingBudget}
        onClose={() => setEditingBudgetId(null)}
        title={t('budgetsScreen.editTitle')}
        fields={BUDGET_EDIT_FIELDS}
        initialValues={{
          category: editingBudget?.category || 'courses',
          limit: editingBudget?.limit?.toString() || '',
        }}
        onSubmit={handleEditBudgetSubmit}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  addButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  summaryCard: { marginBottom: Spacing.lg },
  toggleRow: {
    flexDirection: 'row', backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg, padding: 4, marginBottom: Spacing.md, gap: 4,
  },
  toggleBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  toggleTextActive: { color: Colors.text },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryIncome: { color: Colors.success, fontSize: FontSizes.xxl, fontWeight: FontWeights.black, marginTop: 4 },
  summaryAmount: { color: Colors.text, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginVertical: Spacing.md },
  capacityBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.cardBorder,
  },
  capacityLabel: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm },
  capacityValue: { fontSize: FontSizes.md, fontWeight: FontWeights.bold },
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
