/**
 * GUARDIAN MONEY CHF - Expenses Screen
 * Daily expenses, Pro expenses, Contracts
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
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, EmptyState, Badge } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import BrandLogo from '../../src/components/BrandLogo';
import { formatNumber } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../../src/data/swiss-data';
import { useTranslation } from '../../src/hooks/useTranslation';

type Tab = 'daily' | 'pro' | 'contracts';

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const {
    preferences,
    transactions,
    proExpenses,
    contracts,
    addTransaction,
    deleteTransaction,
    addProExpense,
    deleteProExpense,
    addContract,
    deleteContract,
    isPro,
  } = useStore();

  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const { t } = useTranslation();
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'courses',
    justification: '',
    paymentMethod: 'card',
  });
  const [newContract, setNewContract] = useState({
    title: '',
    amount: '',
    expirationDate: '',
    category: 'abonnements',
    urgent: false,
  });

  const CUR = preferences.currency;

  const totalDaily = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

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
      date: now.toLocaleDateString('fr-CH'),
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

  const handleAddContract = () => {
    if (!newContract.title.trim() || !newContract.amount) {
      Alert.alert(t('common.error'), t('common.requiredFields'));
      return;
    }
    addContract({
      id: `ct_${Date.now()}`,
      title: newContract.title.trim(),
      amount: parseFloat(newContract.amount.replace(',', '.')) || 0,
      expirationDate: newContract.expirationDate || '—',
      urgent: newContract.urgent,
      category: newContract.category,
      createdAt: Date.now(),
    });
    setNewContract({ title: '', amount: '', expirationDate: '', category: 'abonnements', urgent: false });
    setShowContractModal(false);
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
              deleteProExpense(id);
            } else {
              deleteTransaction(id);
            }
          },
        },
      ]
    );
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'daily', label: t('expenses.daily'), icon: 'cart' },
    { key: 'pro', label: t('expenses.pro'), icon: 'briefcase' },
    { key: 'contracts', label: t('expenses.contracts'), icon: 'document-text' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('expenses.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => activeTab === 'contracts' ? setShowContractModal(true) : setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color={Colors.text} />
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
              color={activeTab === tab.key ? Colors.text : Colors.textTertiary}
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
        {/* Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            {activeTab === 'daily' ? t('expenses.summaryDaily') : activeTab === 'pro' ? t('expenses.summaryPro') : t('expenses.summaryContracts')}
          </Text>
          <Text style={styles.summaryAmount}>
            {CUR} {formatNumber(activeTab === 'daily' ? totalDaily : activeTab === 'pro' ? totalPro : contracts.reduce((s, c) => s + c.amount, 0))}
          </Text>
          <Text style={styles.summaryCount}>
            {activeTab === 'daily' ? transactions.length : activeTab === 'pro' ? proExpenses.length : contracts.length} {t('common.items')}
          </Text>
        </Card>

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
            ) : (
              transactions.map((tx) => (
                <Card key={tx.id} style={styles.expenseCard}>
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
                            color={PAYMENT_METHODS.find(p => p.id === tx.paymentMethod)?.color || Colors.textTertiary}
                          />
                          <Text style={styles.paymentBadgeText}>
                            {PAYMENT_METHODS.find(p => p.id === tx.paymentMethod)?.name || tx.paymentMethod}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity onPress={() => handleDelete(tx.id)}>
                        <Ionicons name="trash-outline" size={18} color={Colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* Pro Expenses */}
        {activeTab === 'pro' && (
          <>
            {!isPro && (
              <Card style={styles.proLockedCard}>
                <Ionicons name="lock-closed" size={32} color={Colors.primary} />
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
                      <Badge text={`TVA ${exp.tva}%`} color={Colors.info} size="sm" />
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* Contracts */}
        {activeTab === 'contracts' && (
          <>
            {contracts.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title={t('expenses.noContracts')}
                subtitle={t('expenses.addContractsSub')}
                action={{ label: t('common.add'), onPress: () => setShowContractModal(true) }}
              />
            ) : (
              contracts.map((contract) => (
                <Card
                  key={contract.id}
                  style={styles.contractCard}
                  borderColor={contract.urgent ? Colors.error : undefined}
                >
                  {contract.urgent && (
                    <Badge text="Urgent" color={Colors.error} />
                  )}
                  <View style={styles.contractRow}>
                    <Ionicons name="document-text" size={24} color={Colors.primary} />
                    <View style={styles.contractInfo}>
                      <Text style={styles.contractTitle}>{contract.title}</Text>
                      <Text style={styles.contractExpire}>
                        Expire le {contract.expirationDate}
                      </Text>
                    </View>
                    <Text style={styles.contractAmount}>
                      {CUR} {formatNumber(contract.amount)}/mois
                    </Text>
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        t('expenses.deleteTitle'),
                        t('expenses.deleteMsg'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => deleteContract(contract.id) },
                        ],
                      )}
                      style={styles.contractDelBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.textTertiary} />
                    </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === 'pro' ? t('expenses.newProExpense') : t('expenses.newExpense')}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.title')}</Text>
              <TextInput
                style={styles.input}
                value={newExpense.title}
                onChangeText={(t) => setNewExpense((p) => ({ ...p, title: t }))}
                placeholder={t('expenses.exTitle')}
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('common.amount')} ({CUR})</Text>
              <TextInput
                style={styles.input}
                value={newExpense.amount}
                onChangeText={(t) => setNewExpense((p) => ({ ...p, amount: t }))}
                placeholder="0.00"
                placeholderTextColor={Colors.textTertiary}
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
                      <Text style={styles.categoryLabel}>{cat.name}</Text>
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
                  placeholderTextColor={Colors.textTertiary}
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
                      <Text style={styles.categoryLabel}>{pm.name}</Text>
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
        </View>
      </Modal>

      {/* Add Contract Modal */}
      <Modal
        visible={showContractModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowContractModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau contrat</Text>
              <TouchableOpacity onPress={() => setShowContractModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('common.title')}</Text>
                <TextInput
                  style={styles.input}
                  value={newContract.title}
                  onChangeText={(t) => setNewContract((p) => ({ ...p, title: t }))}
                  placeholder="ex: Sunrise mobile, Salt Internet, Helsana..."
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Montant mensuel ({CUR})</Text>
                <TextInput
                  style={styles.input}
                  value={newContract.amount}
                  onChangeText={(t) => setNewContract((p) => ({ ...p, amount: t }))}
                  placeholder="49.90"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date d'expiration</Text>
                <TextInput
                  style={styles.input}
                  value={newContract.expirationDate}
                  onChangeText={(t) => setNewContract((p) => ({ ...p, expirationDate: t }))}
                  placeholder="31.12.2026"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('common.category')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={styles.categoryGrid}>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryItem,
                          newContract.category === cat.id && styles.categoryItemSelected,
                        ]}
                        onPress={() => setNewContract((p) => ({ ...p, category: cat.id }))}
                      >
                        <CategoryIcon category={cat.id} size="sm" />
                        <Text style={styles.categoryLabel}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <TouchableOpacity
                style={[styles.urgentToggle, newContract.urgent && styles.urgentToggleActive]}
                onPress={() => setNewContract((p) => ({ ...p, urgent: !p.urgent }))}
              >
                <Ionicons
                  name={newContract.urgent ? 'alert-circle' : 'alert-circle-outline'}
                  size={20}
                  color={newContract.urgent ? Colors.error : Colors.textTertiary}
                />
                <Text style={[styles.urgentToggleTxt, newContract.urgent && { color: Colors.error }]}>
                  {newContract.urgent ? '⚠️ Marqué comme urgent' : 'Marquer comme urgent'}
                </Text>
              </TouchableOpacity>

              <Button
                title="Ajouter le contrat"
                onPress={handleAddContract}
                fullWidth
                size="lg"
                style={{ marginTop: Spacing.lg }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.card,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tabTextActive: {
    color: Colors.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  summaryCard: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  summaryAmount: {
    color: Colors.text,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
    marginVertical: Spacing.xs,
  },
  summaryCount: {
    color: Colors.textTertiary,
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
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  expenseJustif: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  expenseDate: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  expenseAmount: {
    color: Colors.error,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  proLockedCard: {
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  proLockedTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.md,
  },
  proLockedText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  contractCard: {
    marginBottom: Spacing.md,
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  contractInfo: {
    flex: 1,
  },
  contractTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  contractExpire: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  contractAmount: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
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
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.text,
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
    backgroundColor: Colors.card,
    minWidth: 70,
  },
  categoryItemSelected: {
    backgroundColor: `${Colors.primary}30`,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  categoryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  paymentBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  contractDelBtn: {
    padding: 8,
    marginLeft: 4,
  },
  urgentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  urgentToggleActive: {
    borderColor: Colors.error,
    backgroundColor: `${Colors.error}10`,
  },
  urgentToggleTxt: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
