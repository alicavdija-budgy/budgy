/**
 * BUDGY - Recurring Expenses (with revenue impact %)
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
  Switch,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, EmptyState } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import BrandLogo from '../../src/components/BrandLogo';
import { formatNumber } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { deleteEntityWithCloud } from '../../src/services/cloudDelete';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

export default function RecurringScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, recurringExpenses, incomes, addRecurringExpense, updateRecurringExpense, toggleRecurringExpense, deleteRecurringExpense } = useStore();

  // Build 82 hotfix — cloud-first deletion: the Supabase row is removed and
  // confirmed BEFORE the local Zustand deletion, so pullAllFromCloud() can no
  // longer resurrect a deleted recurring expense.
  const handleCloudDeleteRec = async (id: string) => {
    const res = await deleteEntityWithCloud('recurring_expenses', id, () => deleteRecurringExpense(id));
    if (!res.ok && res.error !== 'delete_in_progress') {
      Alert.alert(t('cloudDelete.failedTitle'), t('cloudDelete.failedBody'));
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRec, setNewRec] = useState({ title: '', amount: '', category: 'abonnements', dayOfMonth: '1' });

  // CRUD: actions sheet & edit modal
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const editingRec = useMemo(
    () => recurringExpenses.find((r) => r.id === editingRecId) || null,
    [editingRecId, recurringExpenses]
  );
  const REC_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'title', label: t('recurringScreen.titleField'), type: 'text', icon: 'document-text-outline', placeholder: 'Netflix', required: true },
    { key: 'amount', label: t('recurringScreen.amountCHF', { currency: 'CHF' }), type: 'number', icon: 'cash-outline', placeholder: '17.90', required: true },
    { key: 'category', label: t('recurringUi.category'), type: 'select', options: EXPENSE_CATEGORIES.slice(0, 12).map((c) => ({ value: c.id, label: c.name, color: c.color })) },
    { key: 'dayOfMonth', label: t('recurringUi.dayOfMonth'), type: 'number', icon: 'calendar-outline', placeholder: '8' },
    { key: 'active', label: t('recurringScreen.active'), type: 'switch' },
  ], [t]);
  const handleEditRecSubmit = (values: Record<string, any>) => {
    if (!editingRec) return;
    const amt = parseFloat(String(values.amount).replace(',', '.')) || editingRec.amount;
    const day = Math.max(1, Math.min(31, parseInt(String(values.dayOfMonth)) || editingRec.dayOfMonth));
    updateRecurringExpense(editingRec.id, {
      title: String(values.title || '').trim() || editingRec.title,
      amount: amt,
      category: values.category || editingRec.category,
      dayOfMonth: day,
      color: getCategoryColor(values.category || editingRec.category),
      active: typeof values.active === 'boolean' ? values.active : editingRec.active,
    });
    setEditingRecId(null);
  };

  const CUR = preferences.currency;

  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
  }, [incomes]);

  const totalMonthly = useMemo(() => {
    return recurringExpenses.filter(r => r.active).reduce((sum, r) => sum + r.amount, 0);
  }, [recurringExpenses]);

  const totalYearly = totalMonthly * 12;
  const totalPctIncome = monthlyIncome > 0 ? (totalMonthly / monthlyIncome) * 100 : 0;

  // Sort by amount desc to surface biggest impact first
  const sorted = useMemo(
    () => [...recurringExpenses].sort((a, b) => b.amount - a.amount),
    [recurringExpenses]
  );

  const getPriority = (amount: number): { label: string; emoji: string; color: string } => {
    if (monthlyIncome <= 0) return { label: t('recurringScreen.unknownImpact'), emoji: 'ℹ️', color: theme.textTertiary };
    const pct = (amount / monthlyIncome) * 100;
    if (pct >= 20) return { label: t('recurringUi.highImpact'), emoji: '🔥', color: theme.error };
    if (pct >= 10) return { label: t('recurringScreen.mediumImpact'), emoji: '⚠️', color: theme.warning };
    if (pct >= 5)  return { label: t('recurringUi.modImpact'), emoji: '🟡', color: '#EAB308' };
    return { label: t('recurringScreen.lowImpact'), emoji: '✅', color: theme.success };
  };

  const handleAdd = () => {
    if (!newRec.title || !newRec.amount) {
      Alert.alert(t('recurringScreen.errTitle'), t('recurringUi.errAllFields'));
      return;
    }
    addRecurringExpense({
      id: `rec_${Date.now()}`,
      title: newRec.title,
      amount: parseFloat(newRec.amount),
      category: newRec.category,
      frequency: 'monthly',
      dayOfMonth: parseInt(newRec.dayOfMonth) || 1,
      color: getCategoryColor(newRec.category),
      active: true,
      createdAt: Date.now(),
    });
    setNewRec({ title: '', amount: '', category: 'abonnements', dayOfMonth: '1' });
    setShowAddModal(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('recurringScreen.title')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Hero summary with revenue-share gauge */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient
            colors={totalPctIncome >= 50 ? [theme.error, theme.errorDark] as any : theme.gradientPrimary as any}
            style={styles.heroSummary}
          >
            <Text style={styles.heroLabel}>{t('recurringScreen.heroLabel')}</Text>
            <Text style={styles.heroAmount}>{CUR} {formatNumber(totalMonthly)}</Text>
            <Text style={styles.heroYearly}>{t('recurringScreen.heroYearly', { currency: CUR, amount: formatNumber(totalYearly) })}</Text>

            {monthlyIncome > 0 && (
              <>
                <View style={styles.heroBarBg}>
                  <View style={[styles.heroBarFill, { width: `${Math.min(100, totalPctIncome)}%` }]} />
                </View>
                <View style={styles.heroBarRow}>
                  <Text style={styles.heroBarText}>
                    {t('recurringScreen.pctOfIncome', { n: totalPctIncome.toFixed(1) })}
                  </Text>
                  <Text style={styles.heroBarStatus}>
                    {totalPctIncome >= 50 ? t('recurringUi.tooHigh') : totalPctIncome >= 30 ? t('recurringUi.high') : t('recurringScreen.healthy')}
                  </Text>
                </View>
              </>
            )}

            <Text style={styles.heroCount}>{t('recurringScreen.activeSubs', { n: recurringExpenses.filter(r => r.active).length })}</Text>
          </LinearGradient>
        </Animated.View>

        {recurringExpenses.length === 0 ? (
          <EmptyState
            icon="refresh-outline"
            title={t("recurringUi.emptyTitle")}
            subtitle={t("recurringUi.emptySub")}
            action={{ label: t('recurringScreen.addBtn'), onPress: () => setShowAddModal(true) }}
          />
        ) : (
          sorted.map((rec, idx) => {
            const pctOfIncome = monthlyIncome > 0 ? (rec.amount / monthlyIncome) * 100 : 0;
            const priority = getPriority(rec.amount);
            const barColor = priority.color;
            return (
              <Animated.View key={rec.id} entering={FadeInDown.duration(300).delay(idx * 40)}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={() => setActionsCtx({
                    id: rec.id,
                    title: rec.title,
                    subtitle: `${CUR} ${formatNumber(rec.amount)}/mois · Jour ${rec.dayOfMonth}`,
                    accent: getCategoryColor(rec.category),
                  })}
                >
                <Card style={[styles.recCard, !rec.active && styles.recCardInactive]}>
                  <View style={styles.recTopRow}>
                    <BrandLogo merchant={rec.title} size="md" fallbackColor={getCategoryColor(rec.category)} />
                    <View style={styles.recInfo}>
                      <View style={styles.recTitleRow}>
                        <Text style={styles.recTitle}>{rec.title}</Text>
                        <Text style={styles.recPriorityEmoji}>{priority.emoji}</Text>
                      </View>
                      <Text style={styles.recDate}>{t('recurringScreen.dayOfMonthLine', { day: rec.dayOfMonth })}</Text>
                    </View>
                    <View style={styles.recRight}>
                      <Text style={styles.recAmount}>{CUR} {formatNumber(rec.amount)}</Text>
                      <Switch
                        value={rec.active}
                        onValueChange={() => toggleRecurringExpense(rec.id)}
                        trackColor={{ false: theme.cardBorder, true: `${theme.success}50` }}
                        thumbColor={rec.active ? theme.success : theme.textTertiary}
                      />
                    </View>
                  </View>

                  {/* Revenue-share bar */}
                  {monthlyIncome > 0 && rec.active && (
                    <View style={styles.recImpactWrap}>
                      <View style={styles.recBarBg}>
                        <View style={[styles.recBarFill, { width: `${Math.min(100, pctOfIncome * 3)}%`, backgroundColor: barColor }]} />
                      </View>
                      <View style={styles.recImpactRow}>
                        <Text style={[styles.recImpactText, { color: barColor }]}>
                          {t('recurringScreen.pctRevenuePriority', { n: pctOfIncome.toFixed(1), priority: priority.label })}
                        </Text>
                        <Text style={styles.recYearly}>{t('recurringScreen.yearlyPerAmount', { currency: CUR, amount: formatNumber(rec.amount * 12) })}</Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => setActionsCtx({
                      id: rec.id,
                      title: rec.title,
                      subtitle: `${CUR} ${formatNumber(rec.amount)}/mois`,
                      accent: getCategoryColor(rec.category),
                    })}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color={theme.textTertiary} />
                  </TouchableOpacity>
                </Card>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('recurringScreen.newSubscription')}</Text>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowAddModal(false); }}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: Spacing.xl }}
              >

            <Text style={styles.inputLabel}>{t('recurringScreen.titleField')}</Text>
            <TextInput
              style={styles.input}
              value={newRec.title}
              onChangeText={(t) => setNewRec((p) => ({ ...p, title: t }))}
              placeholder="Netflix"
              placeholderTextColor={theme.textTertiary}
            />

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{t('recurringScreen.amountCHF', { currency: CUR })}</Text>
                <TextInput
                  style={styles.input}
                  value={newRec.amount}
                  onChangeText={(t) => setNewRec((p) => ({ ...p, amount: t }))}
                  placeholder="17.90"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{t('recurringScreen.dayOfMonthLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={newRec.dayOfMonth}
                  onChangeText={(t) => setNewRec((p) => ({ ...p, dayOfMonth: t }))}
                  placeholder="8"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Button title={t('recurringScreen.addBtn')} onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* CRUD: actions sheet + edit modal */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingRecId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) void handleCloudDeleteRec(id);
        }}
        deleteConfirmTitle={t("recurringUi.deleteConfirmTitle")}
      />
      <EntityEditModal
        visible={!!editingRec}
        onClose={() => setEditingRecId(null)}
        title={t('recurringUi.editSubTitle')}
        fields={REC_EDIT_FIELDS}
        initialValues={{
          title: editingRec?.title || '',
          amount: editingRec?.amount?.toString() || '',
          category: editingRec?.category || 'abonnements',
          dayOfMonth: editingRec?.dayOfMonth?.toString() || '1',
          active: editingRec?.active ?? true,
        }}
        onSubmit={handleEditRecSubmit}
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

  heroSummary: {
    borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  heroAmount: { color: '#FFF', fontSize: 40, fontWeight: FontWeights.black, letterSpacing: -1.5, marginTop: 4 },
  heroYearly: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  heroBarBg: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999,
    marginTop: Spacing.md, overflow: 'hidden',
  },
  heroBarFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999 },
  heroBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  heroBarText: { color: 'rgba(255,255,255,0.95)', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  heroBarStatus: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.black },
  heroCount: { color: 'rgba(255,255,255,0.8)', fontSize: FontSizes.xs, marginTop: Spacing.sm },

  recCard: { marginBottom: Spacing.md, position: 'relative' },
  recCardInactive: { opacity: 0.5 },
  recTopRow: { flexDirection: 'row', alignItems: 'center' },
  recInfo: { flex: 1, marginLeft: Spacing.md },
  recTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  recPriorityEmoji: { fontSize: 14 },
  recDate: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  recRight: { alignItems: 'flex-end' },
  recAmount: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },

  recImpactWrap: { marginTop: Spacing.md },
  recBarBg: { height: 5, backgroundColor: Colors.cardHover, borderRadius: 999, overflow: 'hidden' },
  recBarFill: { height: '100%', borderRadius: 999 },
  recImpactRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  recImpactText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  recYearly: { color: Colors.textTertiary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },

  deleteBtn: { position: 'absolute', top: Spacing.sm, right: Spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  inputRow: { flexDirection: 'row', gap: Spacing.md },
});
