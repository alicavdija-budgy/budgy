/**
 * BUDGY - Expenses Screen (v3.7.26)
 * 2 tabs uniquement : Quotidien · Pro
 * (Les contrats vivent dans /more/contracts — alias /more/classeur)
 *
 * Pro gating : source canonique = usePremiumStore.hasPremiumAccess()
 * (couvre isPro + trial actif + provisional après achat).
 *
 * All user-visible strings routed through useTranslation() including EditField
 * labels, delete/edit modal titles, categories and payment methods (localised
 * via categoryLabels.* and paymentMethods.*). Date formatting is locale-aware.
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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { Card, Button, EmptyState, Badge } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import BrandLogo from '../../src/components/BrandLogo';
import { formatNumber } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../../src/data/swiss-data';
import { useTranslation } from '../../src/hooks/useTranslation';
import { DATE_LOCALES } from '../../src/i18n/translations';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { deleteEntityWithCloud } from '../../src/services/cloudDelete';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

type Tab = 'daily' | 'pro';

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    preferences,
    transactions,
    proExpenses,
    addTransaction,
    deleteTransaction,
    addProExpense,
    deleteProExpense,
    updateTransaction,
  } = useStore();
  // ✅ Pro gating canonique (couvre isPro + trial + provisional Pro)
  const isPro = usePremiumStore((s) => s.hasPremiumAccess());

  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  // ── Navigation par période + filtre catégorie (affichage uniquement) ──
  const [monthOffset, setMonthOffset] = useState(0);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const { t, lang } = useTranslation();
  const locale = DATE_LOCALES[lang];
  const CUR = preferences.currency;
  const paymentLabelFor = (id?: string) => id ? t(`paymentMethods.${id}`) : '';
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'courses',
    justification: '',
    paymentMethod: 'card',
  });

  // CRUD for transactions (daily expenses)
  const [txActionsCtx, setTxActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const editingTx = useMemo(
    () => transactions.find((tx) => tx.id === editingTxId) || null,
    [editingTxId, transactions]
  );
  const TX_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'title', label: t('common.title'), type: 'text', icon: 'document-text-outline', placeholder: 'Migros', required: true },
    { key: 'amount', label: `${t('common.amount')} (${CUR})`, type: 'number', icon: 'cash-outline', placeholder: '0.00', required: true },
    { key: 'date', label: t('common.date'), type: 'text', icon: 'calendar-outline', placeholder: '15.04.2026' },
    { key: 'category', label: t('expensesScreen.editCategoryLabel'), type: 'select', options: EXPENSE_CATEGORIES.slice(0, 12).map((c) => ({ value: c.id, label: t(`categoryLabels.${c.id}`) || c.name, color: c.color })) },
    { key: 'paymentMethod', label: t('expensesScreen.editPaymentLabel'), type: 'select', options: PAYMENT_METHODS.map((p) => ({ value: p.id, label: t(`paymentMethods.${p.id}`) || p.name, color: p.color, icon: p.icon })) },
    { key: 'note', label: t('expensesScreen.editNotesLabel'), type: 'multiline', placeholder: '' },
  ], [t, CUR]);
  const handleEditTxSubmit = (values: Record<string, any>) => {
    if (!editingTx) return;
    const amt = parseFloat(String(values.amount).replace(',', '.')) || editingTx.amount;
    updateTransaction(editingTx.id, {
      title: String(values.title || '').trim() || editingTx.title,
      amount: amt,
      date: values.date || editingTx.date,
      category: values.category || editingTx.category,
      paymentMethod: (values.paymentMethod || editingTx.paymentMethod) as any,
      note: values.note || undefined,
      updatedAt: Date.now(),
      synced: false,
    });
    setEditingTxId(null);
  };

  // ── Période affichée (mois) — lecture seule, ne modifie aucune donnée ──
  const periodDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const parseTxDate = (s: string): Date | null => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
    const eu = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (eu) return new Date(parseInt(eu[3]), parseInt(eu[2]) - 1, parseInt(eu[1]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  const monthTx = useMemo(
    () => transactions.filter((tx) => {
      const d = parseTxDate(tx.date);
      return d && d.getFullYear() === periodDate.getFullYear() && d.getMonth() === periodDate.getMonth();
    }),
    [transactions, periodDate],
  );
  const monthCats = useMemo(
    () => Array.from(new Set(monthTx.map((tx) => tx.category))),
    [monthTx],
  );
  const visibleTx = useMemo(() => {
    const list = catFilter ? monthTx.filter((tx) => tx.category === catFilter) : monthTx;
    return [...list].sort(
      (a, b) => (parseTxDate(b.date)?.getTime() || 0) - (parseTxDate(a.date)?.getTime() || 0),
    );
  }, [monthTx, catFilter]);
  // Groupes par jour — présentation type relevé bancaire
  const dayGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: typeof visibleTx; total: number }>();
    const todayKey = new Date().toDateString();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    for (const tx of visibleTx) {
      const d = parseTxDate(tx.date) || new Date(0);
      const key = d.toDateString();
      if (!map.has(key)) {
        const label =
          key === todayKey
            ? t('expensesV2.today')
            : key === yest.toDateString()
              ? t('expensesV2.yesterday')
              : d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
        map.set(key, { label, items: [], total: 0 });
      }
      const g = map.get(key)!;
      g.items.push(tx);
      g.total += tx.amount;
    }
    return Array.from(map.values());
  }, [visibleTx, t, locale]);
  const monthTotal = useMemo(() => monthTx.reduce((s, tx) => s + tx.amount, 0), [monthTx]);

  const totalPro = useMemo(() => {
    return proExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [proExpenses]);

  const handleAddExpense = () => {
    if (!newExpense.title || !newExpense.amount) {
      Alert.alert(t('common.error'), t('common.requiredFields'));
      return;
    }

    const now = new Date();
    const expense = {
      id: `tx_${Date.now()}`,
      title: newExpense.title,
      amount: parseFloat(newExpense.amount),
      date: now.toLocaleDateString(locale),
      category: newExpense.category,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      synced: false,
    };

    if (activeTab === 'pro') {
      addProExpense({
        ...expense,
        justification: newExpense.justification,
        tva: 8.1,
        note: '',
      });
    } else {
      addTransaction({ ...expense, note: '', paymentMethod: newExpense.paymentMethod as any });
    }

    setNewExpense({ title: '', amount: '', category: 'courses', justification: '', paymentMethod: 'card' });
    setShowAddModal(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      t('expenses.deleteTitle'),
      t('expenses.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            if (activeTab === 'pro') {
              // proExpenses are not cloud-synced: plain local deletion.
              deleteProExpense(id);
            } else {
              void handleCloudDeleteTx(id);
            }
          },
        },
      ]
    );
  };

  // Build 82 hotfix — cloud-first deletion: the Supabase row is removed and
  // confirmed BEFORE the local Zustand deletion, so pullAllFromCloud() can no
  // longer resurrect a deleted transaction. Local-only users (no session)
  // keep the plain local deletion.
  const handleCloudDeleteTx = async (id: string) => {
    const res = await deleteEntityWithCloud('transactions', id, () => deleteTransaction(id));
    if (!res.ok && res.error !== 'delete_in_progress') {
      Alert.alert(t('cloudDelete.failedTitle'), t('cloudDelete.failedBody'));
    }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'daily', label: t('expenses.daily'), icon: 'cart' },
    { key: 'pro', label: t('expenses.pro'), icon: 'briefcase' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('expenses.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          testID="add-expense-fab"
          accessibilityLabel={t('common.add')}
        >
          <Ionicons name="add" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.key ? theme.text : theme.textTertiary}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Import facture banner — direct route vers le flow facture forcé */}
        {activeTab === 'daily' && (
          <TouchableOpacity
            style={styles.importBanner}
            onPress={() => router.push('/more/email-import?mode=invoice' as any)}
          >
            <View style={[styles.importBannerIcon, { backgroundColor: `${theme.primary}25` }]}>
              <Ionicons name="scan" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.importBannerTitle}>{t('expensesScreen.importTitle')}</Text>
              <Text style={styles.importBannerSub}>{t('expensesScreen.importSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Sélecteur de période (mois) — onglet quotidien uniquement */}
        {activeTab === 'daily' && (
          <View style={styles.periodRow}>
            <TouchableOpacity
              style={styles.periodArrow}
              onPress={() => setMonthOffset((o) => o - 1)}
              accessibilityLabel={t('expensesV2.prevMonth')}
            >
              <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.periodLabel}>
              {periodDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              style={[styles.periodArrow, monthOffset >= 0 && { opacity: 0.35 }]}
              disabled={monthOffset >= 0}
              onPress={() => setMonthOffset((o) => Math.min(0, o + 1))}
              accessibilityLabel={t('expensesV2.nextMonth')}
            >
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            {activeTab === 'daily' ? t('expenses.summaryDaily') : t('expenses.summaryPro')}
          </Text>
          <Text style={styles.summaryAmount}>
            {CUR} {formatNumber(activeTab === 'daily' ? monthTotal : totalPro)}
          </Text>
          <Text style={styles.summaryCount}>
            {activeTab === 'daily' ? monthTx.length : proExpenses.length} {t('common.items')}
          </Text>
        </Card>

        {/* Filtres par catégorie (chips) */}
        {activeTab === 'daily' && monthCats.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            <TouchableOpacity
              style={[styles.chip, !catFilter && styles.chipActive]}
              onPress={() => setCatFilter(null)}
            >
              <Text style={[styles.chipText, !catFilter && styles.chipTextActive]}>
                {t('expensesV2.allCats')}
              </Text>
            </TouchableOpacity>
            {monthCats.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, catFilter === cat && styles.chipActive]}
                onPress={() => setCatFilter((c) => (c === cat ? null : cat))}
              >
                <View style={[styles.chipDot, { backgroundColor: getCategoryColor(cat) }]} />
                <Text style={[styles.chipText, catFilter === cat && styles.chipTextActive]}>
                  {t(`categoryLabels.${cat}`) || cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Daily Expenses */}
        {activeTab === 'daily' && (
          <>
            {transactions.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title={t('expenses.noTx')}
                subtitle={t('expenses.addDailySub')}
                action={{ label: t('common.add'), onPress: () => setShowAddModal(true) }}
              />
            ) : visibleTx.length === 0 ? (
              <View style={styles.emptyMonth}>
                <Ionicons name="calendar-outline" size={28} color={theme.textTertiary} />
                <Text style={styles.emptyMonthText}>{t('expensesV2.noMonthTx')}</Text>
              </View>
            ) : (
              dayGroups.map((group) => (
                <View key={group.label}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayHeaderLabel}>{group.label}</Text>
                    <Text style={styles.dayHeaderTotal}>−{formatNumber(group.total, 2)}</Text>
                  </View>
                  {group.items.map((tx) => (
                <TouchableOpacity
                  key={tx.id}
                  activeOpacity={0.85}
                  onLongPress={() => setTxActionsCtx({
                    id: tx.id,
                    title: tx.title,
                    subtitle: `${CUR} ${formatNumber(tx.amount, 2)} · ${tx.date}`,
                    accent: getCategoryColor(tx.category),
                  })}
                >
                <Card style={styles.expenseCard}>
                  <View style={styles.expenseRow}>
                    <BrandLogo merchant={tx.title} size="md" fallbackColor={getCategoryColor(tx.category)} />
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseTitle}>{tx.title}</Text>
                      <Text style={styles.expenseDate}>{tx.date}</Text>
                    </View>
                    <View style={styles.expenseRight}>
                      <Text style={styles.expenseAmount}>-{formatNumber(tx.amount, 2)}</Text>
                      {tx.paymentMethod && (
                        <View style={styles.paymentBadge}>
                          <Ionicons
                            name={(PAYMENT_METHODS.find(p => p.id === tx.paymentMethod)?.icon || 'card') as any}
                            size={12}
                            color={PAYMENT_METHODS.find(p => p.id === tx.paymentMethod)?.color || theme.textTertiary}
                          />
                          <Text style={styles.paymentBadgeText}>
                            {paymentLabelFor(tx.paymentMethod) || tx.paymentMethod}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity onPress={() => setTxActionsCtx({
                        id: tx.id,
                        title: tx.title,
                        subtitle: `${CUR} ${formatNumber(tx.amount, 2)} · ${tx.date}`,
                        accent: getCategoryColor(tx.category),
                      })}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
                </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        {/* Pro Expenses */}
        {activeTab === 'pro' && (
          <>
            {!isPro && (
              <Card style={styles.proLockedCard}>
                <Ionicons name="lock-closed" size={32} color={theme.primary} />
                <Text style={styles.proLockedTitle}>{t('expenses.proLockedTitle')}</Text>
                <Text style={styles.proLockedText}>
                  {t('expenses.proLockedText')}
                </Text>
              </Card>
            )}
            {isPro && proExpenses.length === 0 ? (
              <EmptyState
                icon="briefcase-outline"
                title={t('expenses.noPro')}
                subtitle={t('expenses.addProSub')}
                action={{ label: t('common.add'), onPress: () => setShowAddModal(true) }}
              />
            ) : (
              isPro && proExpenses.map((exp) => (
                <Card key={exp.id} style={styles.expenseCard}>
                  <View style={styles.expenseRow}>
                    <BrandLogo merchant={exp.title} size="md" fallbackColor={getCategoryColor(exp.category)} />
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseTitle}>{exp.title}</Text>
                      <Text style={styles.expenseJustif}>{exp.justification}</Text>
                      <Text style={styles.expenseDate}>{exp.date}</Text>
                    </View>
                    <View style={styles.expenseRight}>
                      <Text style={styles.expenseAmount}>-{formatNumber(exp.amount, 2)}</Text>
                      <Badge text={`TVA ${exp.tva}%`} color={theme.info} size="sm" />
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === 'pro' ? t('expenses.newProExpense') : t('expenses.newExpense')}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.title')}</Text>
              <TextInput
                style={styles.input}
                value={newExpense.title}
                onChangeText={(t) => setNewExpense((p) => ({ ...p, title: t }))}
                placeholder={t('expenses.exTitle')}
                placeholderTextColor={theme.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.amount')} ({CUR})</Text>
              <TextInput
                style={styles.input}
                value={newExpense.amount}
                onChangeText={(t) => setNewExpense((p) => ({ ...p, amount: t }))}
                placeholder="0.00"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryGrid}>
                  {EXPENSE_CATEGORIES.slice(0, 8).map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryItem,
                        newExpense.category === cat.id && styles.categoryItemSelected,
                      ]}
                      onPress={() => setNewExpense((p) => ({ ...p, category: cat.id }))}
                    >
                      <CategoryIcon category={cat.id} size="sm" />
                      <Text style={styles.categoryLabel}>{t(`categoryLabels.${cat.id}`) || cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {activeTab === 'pro' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('expenses.justification')}</Text>
                <TextInput
                  style={styles.input}
                  value={newExpense.justification}
                  onChangeText={(t) => setNewExpense((p) => ({ ...p, justification: t }))}
                  placeholder={t('expenses.exJustif')}
                  placeholderTextColor={theme.textTertiary}
                />
              </View>
            )}

            {/* Payment Method Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.payment')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryGrid}>
                  {PAYMENT_METHODS.map((pm) => (
                    <TouchableOpacity
                      key={pm.id}
                      testID={`payment-${pm.id}`}
                      style={[
                        styles.categoryItem,
                        newExpense.paymentMethod === pm.id && { backgroundColor: `${pm.color}30`, borderWidth: 1, borderColor: pm.color },
                      ]}
                      onPress={() => setNewExpense((p) => ({ ...p, paymentMethod: pm.id }))}
                    >
                      <Ionicons name={pm.icon as any} size={18} color={pm.color} />
                      <Text style={styles.categoryLabel}>{paymentLabelFor(pm.id) || pm.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <Button
              title={t('common.add')}
              onPress={handleAddExpense}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CRUD for daily transactions */}
      <EntityActionsSheet
        ctx={txActionsCtx}
        onClose={() => setTxActionsCtx(null)}
        onEdit={() => {
          const id = txActionsCtx?.id;
          setTxActionsCtx(null);
          if (id) setEditingTxId(id);
        }}
        onDelete={() => {
          const id = txActionsCtx?.id;
          setTxActionsCtx(null);
          if (id) void handleCloudDeleteTx(id);
        }}
        deleteConfirmTitle={t('expensesScreen.deleteConfirmTitle')}
      />
      <EntityEditModal
        visible={!!editingTx}
        onClose={() => setEditingTxId(null)}
        title={t('expensesScreen.editEntityTitle')}
        fields={TX_EDIT_FIELDS}
        initialValues={{
          title: editingTx?.title || '',
          amount: editingTx?.amount?.toString() || '',
          date: editingTx?.date || '',
          category: editingTx?.category || 'autre',
          paymentMethod: editingTx?.paymentMethod || 'card',
          note: editingTx?.note || '',
        }}
        onSubmit={handleEditTxSubmit}
      />
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    color: theme.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: theme.card,
  },
  tabActive: {
    backgroundColor: theme.primary,
  },
  tabText: {
    color: theme.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tabTextActive: {
    color: theme.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  importBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  importBannerIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  importBannerTitle: { color: theme.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  importBannerSub: { color: theme.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  summaryCard: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
  },
  summaryAmount: {
    color: theme.text,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
    marginVertical: Spacing.xs,
  },
  summaryCount: {
    color: theme.textTertiary,
    fontSize: FontSizes.sm,
  },
  expenseCard: {
    marginBottom: Spacing.md,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTitle: {
    color: theme.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  expenseJustif: {
    color: theme.textSecondary,
    fontSize: FontSizes.xs,
  },
  expenseDate: {
    color: theme.textTertiary,
    fontSize: FontSizes.xs,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  expenseAmount: {
    color: theme.error,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  // ── Budgy Smart 4.0 — période, filtres, groupes jour ──
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  periodArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  periodLabel: {
    color: theme.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  chipsScroll: { marginBottom: Spacing.md, marginHorizontal: -Spacing.lg },
  chipsRow: { paddingHorizontal: Spacing.lg, gap: Spacing.xs, flexDirection: 'row' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: theme.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  chipTextActive: { color: '#FFF' },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  dayHeaderLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  dayHeaderTotal: {
    color: theme.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
  emptyMonth: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyMonthText: { color: theme.textTertiary, fontSize: FontSizes.sm },
  proLockedCard: {
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  proLockedTitle: {
    color: theme.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.md,
  },
  proLockedText: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    color: theme.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: theme.text,
    fontSize: FontSizes.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  categoryItem: {
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: theme.card,
    minWidth: 70,
  },
  categoryItemSelected: {
    backgroundColor: `${theme.primary}30`,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  categoryLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.card,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  paymentBadgeText: {
    color: theme.textSecondary,
    fontSize: 10,
  },
});
