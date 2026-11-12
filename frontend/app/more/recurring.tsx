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
import { EXPENSE_CATEGORIES, RECURRING_CATEGORY_GROUPS } from '../../src/data/swiss-data';
import { CategoryGroupPicker } from '../../src/components/CategoryGroupPicker';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { deleteEntityWithCloud } from '../../src/services/cloudDelete';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

export default function RecurringScreen() {
  const { t, lang } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, recurringExpenses, incomes, addRecurringExpense, updateRecurringExpense, toggleRecurringExpense, deleteRecurringExpense, addTransaction, deleteTransaction, transactions } = useStore();

  // ── v4.0 — paiements & échéances ──────────────────────────────────────────
  const nowD = new Date();
  const dateLocale = lang === 'de' ? 'de-CH' : lang === 'it' ? 'it-CH' : lang === 'en' ? 'en-CH' : 'fr-CH';
  const monthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
  const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

  /** Prochaine échéance — ne modifie JAMAIS aucun montant. */
  const nextDueOf = (rec: any): Date => {
    const day = Math.max(1, Math.min(31, Number(rec.dayOfMonth) || 1));
    const freq = String(rec.frequency || 'monthly');
    if (freq === 'weekly') {
      const d = new Date(nowD); d.setDate(d.getDate() + ((7 - d.getDay() + 1) % 7 || 7));
      return d;
    }
    const step = FREQ_MONTHS[freq] ?? 1;
    const anchor = new Date(rec.createdAt || Date.now());
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    while (d < new Date(nowD.getFullYear(), nowD.getMonth(), 1) || (d.getMonth() === nowD.getMonth() && d.getFullYear() === nowD.getFullYear() && day < nowD.getDate() && rec.lastPaidMonth === monthKey)) {
      d.setMonth(d.getMonth() + step);
    }
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth(), Math.min(day, lastDay));
  };

  const isPaidThisMonth = (rec: any) => paidAmountOf(rec) >= dueAmountOf(rec) && dueAmountOf(rec) > 0;

  /** Montant exigible ce mois (occurrences réelles — même règle que le moteur). */
  const dueAmountOf = (rec: any): number => {
    const amt = Number(rec.amount) || 0;
    const freq = String(rec.frequency || 'monthly');
    if (freq === 'weekly') return amt * 4;
    if (freq === 'monthly') return amt;
    const step = FREQ_MONTHS[freq] ?? 1;
    const anchor = new Date(rec.createdAt || Date.now());
    const diff = (nowD.getFullYear() - anchor.getFullYear()) * 12 + (nowD.getMonth() - anchor.getMonth());
    return diff >= 0 && diff % step === 0 ? amt : 0;
  };

  /** Déjà payé ce mois (historique ; héritage lastPaidMonth = tout payé). */
  const paidAmountOf = (rec: any): number => {
    const hist = ((rec.paymentHistory as any[]) || [])
      .filter((h) => typeof h?.date === 'string' && h.date.startsWith(monthKey))
      .reduce((s, h) => s + Math.max(0, Number(h.amount) || 0), 0);
    if (hist > 0) return hist;
    return rec.lastPaidMonth === monthKey ? dueAmountOf(rec) : 0;
  };

  /** Payer UNE occurrence : hebdo = 4 paiements possibles dans le mois.
   *  Chaque paiement crée UNE transaction liée — remplacement, pas d'ajout. */
  const markPaid = (rec: any) => {
    const due = dueAmountOf(rec);
    const already = paidAmountOf(rec);
    if (due <= 0 || already >= due) return;
    const occAmount = Math.min(Number(rec.amount) || 0, due - already);
    const n = (((rec.paymentHistory as any[]) || []).filter((h) => String(h?.date || '').startsWith(monthKey)).length) + 1;
    const txId = `recpay_${rec.id}_${monthKey}_${n}`;
    const nowTs = Date.now();
    addTransaction({
      id: txId,
      title: rec.title,
      amount: occAmount,
      date: new Date().toISOString().slice(0, 10),
      category: rec.category,
      createdAt: nowTs,
      updatedAt: nowTs,
      synced: false,
      type: 'expense',
      source: 'recurring',
      recurringId: rec.id,
    } as any);
    const fullyPaid = already + occAmount >= due;
    updateRecurringExpense(rec.id, {
      lastPaidMonth: fullyPaid ? monthKey : undefined,
      paymentHistory: [
        ...((rec.paymentHistory as any[]) || []),
        { date: new Date().toISOString().slice(0, 10), amount: occAmount, transactionId: txId },
      ],
    } as any);
  };

  /** Annuler le DERNIER paiement du mois (occurrence par occurrence). */
  const undoPaid = (rec: any) => {
    const hist = ((rec.paymentHistory as any[]) || []);
    const monthIdx = hist.map((h, i) => ({ h, i })).filter((x) => String(x.h?.date || '').startsWith(monthKey));
    if (monthIdx.length === 0) {
      if (rec.lastPaidMonth === monthKey) updateRecurringExpense(rec.id, { lastPaidMonth: undefined } as any);
      return;
    }
    const last = monthIdx[monthIdx.length - 1];
    if (last.h?.transactionId && transactions.some((tx) => tx.id === last.h.transactionId)) {
      deleteTransaction(last.h.transactionId);
    }
    updateRecurringExpense(rec.id, {
      lastPaidMonth: undefined,
      paymentHistory: hist.filter((_, i) => i !== last.i),
    } as any);
  };

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
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [newRec, setNewRec] = useState({ title: '', amount: '', category: 'abonnements', dayOfMonth: '1', frequency: 'monthly' as string });

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
    { key: 'category', label: t('recurringUi.category'), type: 'select', options: EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: c.name, color: c.color })) },
    { key: 'dayOfMonth', label: t('recurringUi.dayOfMonth'), type: 'number', icon: 'calendar-outline', placeholder: '8' },
    { key: 'frequency', label: t('recurringUi.frequency'), type: 'select', options: [
      { value: 'weekly', label: t('recurringUi.freqWeekly') },
      { value: 'monthly', label: t('recurringUi.freqMonthly') },
      { value: 'quarterly', label: t('recurringUi.freqQuarterly') },
      { value: 'semiannual', label: t('recurringUi.freqSemiannual') },
      { value: 'yearly', label: t('recurringUi.freqYearly') },
    ] },
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
      frequency: (values.frequency || (editingRec as any).frequency || 'monthly') as any,
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

  // Équivalent mensuel RÉEL : chaque périodicité est mensualisée. Modifier une
  // échéance ne change JAMAIS un montant — seules fréquence/montant comptent.
  const totalMonthly = useMemo(() => {
    const perMonth: Record<string, number> = { weekly: 4.333, biweekly: 2.166, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, biannual: 1 / 6, yearly: 1 / 12 };
    return recurringExpenses
      .filter((r) => r.active)
      .reduce((sum, r) => sum + (Number(r.amount) || 0) * (perMonth[String((r as any).frequency || 'monthly').toLowerCase()] ?? 1), 0);
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
    const cleaned = newRec.amount.trim().replace(/['’\u00A0\u202F ]/g, '').replace(',', '.');
    const amt = /^\d+(\.\d{1,2})?$/.test(cleaned) ? parseFloat(cleaned) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert(t('recurringScreen.errTitle'), t('recurringUi.errAllFields'));
      return;
    }
    addRecurringExpense({
      id: `rec_${Date.now()}`,
      title: newRec.title,
      amount: amt,
      category: newRec.category,
      frequency: newRec.frequency as any,
      dayOfMonth: Math.max(1, Math.min(31, parseInt(newRec.dayOfMonth) || 1)),
      color: getCategoryColor(newRec.category),
      active: true,
      createdAt: Date.now(),
    });
    setNewRec({ title: '', amount: '', category: 'abonnements', dayOfMonth: '1', frequency: 'monthly' });
    setShowAddModal(false);
  };

  // Récap du mois : EXIGIBLE restant / déjà payé (occurrences réelles)
  const dueThisMonth = useMemo(() =>
    recurringExpenses
      .filter((r) => r.active)
      .reduce((s, r) => s + Math.max(0, dueAmountOf(r) - paidAmountOf(r)), 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [recurringExpenses, monthKey]);
  const paidThisMonth = useMemo(() =>
    recurringExpenses.reduce((s, r) => s + paidAmountOf(r), 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [recurringExpenses, monthKey]);

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

        {/* v4.0 — Récap du mois : dû / payé */}
        <View style={styles.monthRow}>
          <View style={styles.monthCell}>
            <Text style={styles.monthCellLabel}>{t('recurringV2.dueThisMonth')}</Text>
            <Text style={[styles.monthCellAmt, { color: theme.warning }]}>{CUR} {formatNumber(dueThisMonth)}</Text>
          </View>
          <View style={styles.monthCellDivider} />
          <View style={styles.monthCell}>
            <Text style={styles.monthCellLabel}>{t('recurringV2.paidThisMonth')}</Text>
            <Text style={[styles.monthCellAmt, { color: theme.success }]}>{CUR} {formatNumber(paidThisMonth)}</Text>
          </View>
        </View>

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
                      <Text style={styles.recDate}>
                        {t('recurringV2.nextDue', { date: nextDueOf(rec).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) })}
                        {String((rec as any).frequency || 'monthly') !== 'monthly' && rec.active
                          ? ` · ${t('recurringV2.monthlyEq', { currency: CUR, amount: formatNumber((Number(rec.amount) || 0) * (({ weekly: 4.333, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 } as any)[String((rec as any).frequency)] || 0)) })}`
                          : ''}
                      </Text>
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

                  {/* v4.0 — statut & paiement par OCCURRENCE (hebdo = 4 paiements) */}
                  {rec.active && dueAmountOf(rec) > 0 && (
                    <View style={styles.payRow}>
                      <View style={[styles.payChip, { backgroundColor: isPaidThisMonth(rec) ? `${theme.success}1C` : `${theme.warning}1C` }]}>
                        <Ionicons name={isPaidThisMonth(rec) ? 'checkmark-circle' : 'time'} size={13} color={isPaidThisMonth(rec) ? theme.success : theme.warning} />
                        <Text style={[styles.payChipTxt, { color: isPaidThisMonth(rec) ? theme.success : theme.warning }]}>
                          {isPaidThisMonth(rec)
                            ? t('recurringV2.statusPaid')
                            : paidAmountOf(rec) > 0
                              ? t('recurringV2.statusPartial', { paid: formatNumber(paidAmountOf(rec)), due: formatNumber(dueAmountOf(rec)) })
                              : t('recurringV2.statusDue')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.payBtn, isPaidThisMonth(rec) && styles.payBtnUndo]}
                        onPress={() => (isPaidThisMonth(rec) ? undoPaid(rec) : markPaid(rec))}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.payBtnTxt, isPaidThisMonth(rec) && { color: theme.textSecondary }]}>
                          {isPaidThisMonth(rec) ? t('recurringV2.undoPaid') : t('recurringV2.markPaid')}
                        </Text>
                      </TouchableOpacity>
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

            <Text style={styles.inputLabel}>{t('recurringUi.category')}</Text>
            <TouchableOpacity style={styles.catSelect} onPress={() => setShowCatPicker(true)}>
              <View style={[styles.catSelectIcon, { backgroundColor: `${getCategoryColor(newRec.category)}1C` }]}>
                <Ionicons name={(EXPENSE_CATEGORIES.find((c) => c.id === newRec.category)?.icon || 'pricetag') as any} size={16} color={getCategoryColor(newRec.category)} />
              </View>
              <Text style={styles.catSelectTxt}>{getCategoryName(newRec.category)}</Text>
              <Ionicons name="chevron-down" size={16} color={theme.textTertiary} />
            </TouchableOpacity>

            <Text style={styles.inputLabel}>{t('recurringUi.frequency')}</Text>
            <View style={styles.freqRow}>
              {(['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqChip, newRec.frequency === f && styles.freqChipOn]}
                  onPress={() => setNewRec((p) => ({ ...p, frequency: f }))}
                >
                  <Text style={[styles.freqChipTxt, newRec.frequency === f && { color: '#07111F' }]}>
                    {t(`recurringUi.freq${f.charAt(0).toUpperCase()}${f.slice(1)}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button title={t('recurringScreen.addBtn')} onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* CRUD: actions sheet + edit modal */}
      <CategoryGroupPicker
        visible={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        onSelect={(id) => { setNewRec((p) => ({ ...p, category: id })); setShowCatPicker(false); }}
        groups={RECURRING_CATEGORY_GROUPS}
      />
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
  // v4.0 — récap mensuel + paiement + sélecteurs
  monthRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md, marginBottom: Spacing.md,
  },
  monthCell: { flex: 1, alignItems: 'center' },
  monthCellDivider: { width: 1, height: 34, backgroundColor: Colors.cardBorder },
  monthCellLabel: { color: Colors.textTertiary, fontSize: 10, fontWeight: FontWeights.black, letterSpacing: 0.8, textTransform: 'uppercase' },
  monthCellAmt: { fontSize: FontSizes.lg, fontWeight: FontWeights.black, marginTop: 2 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  payChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  payChipTxt: { fontSize: 11, fontWeight: FontWeights.bold },
  payBtn: {
    borderRadius: 999, backgroundColor: Colors.primary, paddingHorizontal: 14,
    paddingVertical: 8, minHeight: 32, justifyContent: 'center',
  },
  payBtnUndo: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  payBtnTxt: { color: '#07111F', fontSize: 12, fontWeight: FontWeights.bold },
  catSelect: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: 11, minHeight: 48,
  },
  catSelectIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catSelectTxt: { flex: 1, color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqChip: {
    borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder,
    backgroundColor: Colors.card, paddingHorizontal: 12, paddingVertical: 8, minHeight: 34,
  },
  freqChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  freqChipTxt: { color: Colors.textSecondary, fontSize: 12, fontWeight: FontWeights.bold },
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
