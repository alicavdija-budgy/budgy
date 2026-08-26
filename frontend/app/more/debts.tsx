/**
 * BUDGY - Debts Screen with full CRUD + payment tracking
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card, Button, ProgressBar, EmptyState } from '../../src/components/ui';
import { useStore } from '../../src/stores/useStore';
import { formatNumber, pct } from '../../src/utils/calculations';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';
import { useTranslation } from '../../src/hooks/useTranslation';

const DEBT_TYPES = [
  { id: 'card',     labelKey: 'debts.typeCard',     icon: 'card',     color: '#EF4444' },
  { id: 'loan',     labelKey: 'debts.typeLoan',     icon: 'cash',     color: '#F97316' },
  { id: 'mortgage', labelKey: 'debts.typeMortgage', icon: 'home',     color: '#A78BFA' },
  { id: 'leasing',  labelKey: 'debts.typeLeasing',  icon: 'car',      color: '#22D3EE' },
  { id: 'student',  labelKey: 'debts.typeStudent',  icon: 'school',   color: '#FBBF24' },
  { id: 'other',    labelKey: 'debts.typeOther',    icon: 'document', color: '#94A3B8' },
];

export default function DebtsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, debts, addDebt, deleteDebt, updateDebt } = useStore();
  const CUR = preferences.currency;

  const [showAdd, setShowAdd] = useState(false);
  const [showPay, setShowPay] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingDebt = useMemo(() => debts.find((d) => d.id === editingId) || null, [debts, editingId]);
  const EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'title', label: t('debts.editTitleLabel'), type: 'text', icon: 'document-text-outline', placeholder: t('debts.placeholderExample'), required: true },
    { key: 'total', label: t('debts.editTotal', { currency: CUR }), type: 'number', icon: 'cash-outline', placeholder: '10000', required: true, decimal: true },
    { key: 'paid', label: t('debts.editPaid', { currency: CUR }), type: 'number', icon: 'checkmark-circle-outline', placeholder: '0', decimal: true },
    { key: 'interestRate', label: t('debts.editRate'), type: 'number', icon: 'trending-up-outline', placeholder: '9.9', decimal: true },
    { key: 'monthlyPayment', label: t('debts.editMonthly', { currency: CUR }), type: 'number', icon: 'calendar-outline', placeholder: '250', decimal: true },
  ], [CUR, t]);
  const handleEditSubmit = (values: Record<string, any>) => {
    if (!editingDebt) return;
    const total = parseFloat(String(values.total).replace(',', '.')) || editingDebt.total;
    const paid = Math.max(0, Math.min(total, parseFloat(String(values.paid).replace(',', '.')) || 0));
    updateDebt(editingDebt.id, {
      title: String(values.title || '').trim() || editingDebt.title,
      total,
      paid,
      interestRate: parseFloat(String(values.interestRate).replace(',', '.')) || 0,
      monthlyPayment: parseFloat(String(values.monthlyPayment).replace(',', '.')) || 0,
    });
    setEditingId(null);
  };
  const [form, setForm] = useState({
    title: '', total: '', paid: '0', interestRate: '0',
    monthlyPayment: '', typeId: 'card',
  });

  const totalDebt = useMemo(() => debts.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0), [debts]);
  const totalMonthly = useMemo(() => debts.reduce((s, d) => s + (d.monthlyPayment || 0), 0), [debts]);
  const avgRate = useMemo(() => {
    if (debts.length === 0) return 0;
    return debts.reduce((s, d) => s + (d.interestRate || 0), 0) / debts.length;
  }, [debts]);

  // Estimate payoff months at current rate
  const estimatedMonths = totalMonthly > 0 ? Math.ceil(totalDebt / totalMonthly) : 0;

  const reset = () => {
    setForm({ title: '', total: '', paid: '0', interestRate: '0', monthlyPayment: '', typeId: 'card' });
  };

  const handleAdd = () => {
    if (!form.title.trim() || !form.total) {
      Alert.alert(t('debts.error'), t('debts.errFillTitleAmount'));
      return;
    }
    const total = parseFloat(form.total.replace(',', '.')) || 0;
    const paid = parseFloat(form.paid.replace(',', '.')) || 0;
    if (total <= 0) {
      Alert.alert(t('debts.error'), t('debts.errPositive'));
      return;
    }
    if (paid > total) {
      Alert.alert(t('debts.error'), t('debts.errPaidExceeds'));
      return;
    }
    const type = DEBT_TYPES.find(x => x.id === form.typeId) || DEBT_TYPES[0];
    addDebt({
      id: `debt_${Date.now()}`,
      title: form.title.trim(),
      total,
      paid,
      interestRate: parseFloat(form.interestRate.replace(',', '.')) || 0,
      monthlyPayment: parseFloat(form.monthlyPayment.replace(',', '.')) || 0,
      color: type.color,
      createdAt: Date.now(),
    });
    reset();
    setShowAdd(false);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      t('debts.deleteTitle'),
      t('debts.deleteConfirm', { title }),
      [
        { text: t('debts.cancel'), style: 'cancel' },
        { text: t('debts.delete'), style: 'destructive', onPress: () => deleteDebt(id) },
      ],
    );
  };

  const handleAddPayment = () => {
    if (!showPay) return;
    const amt = parseFloat(payAmount.replace(',', '.')) || 0;
    if (amt <= 0) {
      Alert.alert(t('debts.error'), t('debts.errInvalid'));
      return;
    }
    const debt = debts.find(d => d.id === showPay);
    if (!debt) return;
    const newPaid = Math.min(debt.total, debt.paid + amt);
    updateDebt(showPay, { paid: newPaid });
    setPayAmount('');
    setShowPay(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('debts.title')}</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* HERO */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={totalDebt > 0 ? ['#7F1D1D', '#991B1B'] as any : ['#065F46', '#047857'] as any}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>{t('debts.heroLabel')}</Text>
            <Text style={styles.heroAmount}>{CUR} {formatNumber(totalDebt)}</Text>
            {debts.length > 0 && (
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('debts.statMonthly')}</Text>
                  <Text style={styles.heroStatValue}>{CUR} {formatNumber(totalMonthly)}</Text>
                </View>
                <View style={styles.heroSep} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('debts.statAvgRate')}</Text>
                  <Text style={styles.heroStatValue}>{avgRate.toFixed(1)}%</Text>
                </View>
                <View style={styles.heroSep} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('debts.statRemaining')}</Text>
                  <Text style={styles.heroStatValue}>{estimatedMonths > 0 ? t('debts.monthsApprox', { n: estimatedMonths }) : '—'}</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {debts.length === 0 ? (
          <EmptyState
            icon="card-outline"
            title={t('debts.emptyTitle')}
            subtitle={t('debts.emptySubtitle')}
            action={{ label: t('debts.emptyAction'), onPress: () => setShowAdd(true) }}
          />
        ) : (
          debts.map((d, idx) => {
            const remaining = Math.max(0, d.total - d.paid);
            const progress = pct(d.paid, d.total);
            const months = d.monthlyPayment > 0 ? Math.ceil(remaining / d.monthlyPayment) : 0;
            const isComplete = remaining <= 0;
            return (
              <Animated.View key={d.id} entering={FadeInDown.duration(300).delay(idx * 50)}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={() => setActionsCtx({
                    id: d.id,
                    title: d.title,
                    subtitle: `Reste ${CUR} ${formatNumber(d.total - d.paid)} · ${pct(d.paid, d.total).toFixed(0)}%`,
                    accent: d.color,
                  })}
                >
                <Card style={styles.debtCard}>
                  <View style={styles.debtHeader}>
                    <View style={[styles.debtIcon, { backgroundColor: `${d.color}25` }]}>
                      <Ionicons name="card" size={22} color={d.color} />
                    </View>
                    <View style={styles.debtInfo}>
                      <Text style={styles.debtTitle}>{d.title}</Text>
                      <Text style={styles.debtMeta}>
                        {t('debts.cardMetaRate', { rate: d.interestRate })} · {months > 0 ? t('debts.cardMetaMonthsRemaining', { n: months }) : t('debts.cardMetaNoMonthly')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActionsCtx({
                      id: d.id,
                      title: d.title,
                      subtitle: `Reste ${CUR} ${formatNumber(d.total - d.paid)}`,
                      accent: d.color,
                    })} style={styles.delIcon}>
                      <Ionicons name="ellipsis-horizontal" size={18} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.debtAmtRow}>
                    <View>
                      <Text style={styles.debtAmtLabel}>{t('debts.remainingToPay')}</Text>
                      <Text style={[styles.debtAmt, isComplete && { color: theme.success }]}>
                        {CUR} {formatNumber(remaining)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.debtAmtLabel}>{t('debts.totalPaid')}</Text>
                      <Text style={styles.debtAmtSmall}>
                        {CUR} {formatNumber(d.total)} · {CUR} {formatNumber(d.paid)}
                      </Text>
                    </View>
                  </View>

                  <ProgressBar value={progress} color={isComplete ? theme.success : d.color} height={8} showLabel />

                  <View style={styles.debtBottomRow}>
                    <Text style={styles.debtMonthly}>
                      {t('debts.monthlyLabel', { amount: `${CUR} ${formatNumber(d.monthlyPayment)}` })}
                    </Text>
                    {!isComplete && (
                      <TouchableOpacity
                        style={[styles.payBtn, { borderColor: d.color }]}
                        onPress={() => { setShowPay(d.id); setPayAmount(''); }}
                      >
                        <Ionicons name="add" size={14} color={d.color} />
                        <Text style={[styles.payBtnTxt, { color: d.color }]}>{t('debts.payment')}</Text>
                      </TouchableOpacity>
                    )}
                    {isComplete && (
                      <View style={styles.completeBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                        <Text style={styles.completeTxt}>{t('debts.paidOff')}</Text>
                      </View>
                    )}
                  </View>
                </Card>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Add Debt Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('debts.newDebt')}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>{t('debts.debtType')}</Text>
              <View style={styles.typesGrid}>
                {DEBT_TYPES.map((dt) => (
                  <TouchableOpacity
                    key={dt.id}
                    onPress={() => setForm((p) => ({ ...p, typeId: dt.id }))}
                    style={[
                      styles.typeChip,
                      form.typeId === dt.id && { borderColor: dt.color, backgroundColor: `${dt.color}18` },
                    ]}
                  >
                    <Ionicons name={dt.icon as any} size={18} color={form.typeId === dt.id ? dt.color : theme.textSecondary} />
                    <Text style={[styles.typeChipTxt, form.typeId === dt.id && { color: dt.color }]}>{t(dt.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('debts.label')}</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(txt) => setForm((p) => ({ ...p, title: txt }))}
                placeholder={t('debts.placeholderExample')}
                placeholderTextColor={theme.textTertiary}
              />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('debts.totalAmount', { currency: CUR })}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.total}
                    onChangeText={(txt) => setForm((p) => ({ ...p, total: txt }))}
                    placeholder="10000"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('debts.alreadyPaid')}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.paid}
                    onChangeText={(txt) => setForm((p) => ({ ...p, paid: txt }))}
                    placeholder="0"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('debts.interestRate')}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.interestRate}
                    onChangeText={(txt) => setForm((p) => ({ ...p, interestRate: txt }))}
                    placeholder="9.9"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('debts.monthlyPayment', { currency: CUR })}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.monthlyPayment}
                    onChangeText={(txt) => setForm((p) => ({ ...p, monthlyPayment: txt }))}
                    placeholder="250"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Button title={t('debts.addBtn')} onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Payment Modal — v3.7.28 : KeyboardAvoidingView pour que le
          bouton "Confirmer" reste accessible quand le clavier est ouvert. */}
      <Modal visible={!!showPay} animationType="fade" transparent onRequestClose={() => setShowPay(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('debts.addPayment')}</Text>
                <TouchableOpacity onPress={() => setShowPay(null)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>{t('debts.amount', { currency: CUR })}</Text>
              <TextInput
                style={styles.input}
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="100"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleAddPayment}
              />
              <Button title={t('debts.confirm')} onPress={handleAddPayment} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit / Delete actions sheet (long-press sur une carte dette) */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) deleteDebt(id);
        }}
        deleteConfirmTitle={t('debts.actionsDeleteTitle')}
        deleteConfirmMessage={t('debts.actionsDeleteBody')}
      />

      <EntityEditModal
        visible={!!editingDebt}
        onClose={() => setEditingId(null)}
        title={t('debts.editTitle')}
        fields={EDIT_FIELDS}
        initialValues={{
          title: editingDebt?.title || '',
          total: editingDebt?.total?.toString() || '',
          paid: editingDebt?.paid?.toString() || '0',
          interestRate: editingDebt?.interestRate?.toString() || '0',
          monthlyPayment: editingDebt?.monthlyPayment?.toString() || '0',
        }}
        onSubmit={handleEditSubmit}
        submitLabel={t('debts.save')}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },

  hero: { borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold, letterSpacing: 1.2 },
  heroAmount: { color: '#FFF', fontSize: 36, fontWeight: FontWeights.black, letterSpacing: -1, marginTop: 4 },
  heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginBottom: 2 },
  heroStatValue: { color: '#FFF', fontSize: 14, fontWeight: FontWeights.bold },
  heroSep: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  debtCard: { marginBottom: Spacing.md, padding: Spacing.md },
  debtHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm },
  debtIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  debtInfo: { flex: 1 },
  debtTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  debtMeta: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
  delIcon: { padding: 6 },

  debtAmtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  debtAmtLabel: { color: Colors.textTertiary, fontSize: 10 },
  debtAmt: { color: Colors.error, fontSize: 22, fontWeight: FontWeights.black, marginTop: 2 },
  debtAmtSmall: { color: Colors.textSecondary, fontSize: 12, fontWeight: FontWeights.semibold, marginTop: 2 },

  debtBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  debtMonthly: { color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  payBtnTxt: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: `${Colors.success}25` },
  completeTxt: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  row2: { flexDirection: 'row', gap: Spacing.md },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  typeChipTxt: { color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
});
