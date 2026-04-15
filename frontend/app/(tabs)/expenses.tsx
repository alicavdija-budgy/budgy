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
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { formatNumber } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';

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
    isPro,
  } = useStore();

  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'courses',
    justification: '',
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
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
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
      addTransaction({ ...expense, note: '' });
    }

    setNewExpense({ title: '', amount: '', category: 'courses', justification: '' });
    setShowAddModal(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer',
      'Êtes-vous sûr de vouloir supprimer cette dépense ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
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
    { key: 'daily', label: 'Quotidien', icon: 'cart' },
    { key: 'pro', label: 'Pro', icon: 'briefcase' },
    { key: 'contracts', label: 'Contrats', icon: 'document-text' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Dépenses</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
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
            {activeTab === 'daily' ? 'Total dépenses' : activeTab === 'pro' ? 'Frais professionnels' : 'Contrats actifs'}
          </Text>
          <Text style={styles.summaryAmount}>
            {CUR} {formatNumber(activeTab === 'daily' ? totalDaily : activeTab === 'pro' ? totalPro : contracts.reduce((s, c) => s + c.amount, 0))}
          </Text>
          <Text style={styles.summaryCount}>
            {activeTab === 'daily' ? transactions.length : activeTab === 'pro' ? proExpenses.length : contracts.length} éléments
          </Text>
        </Card>

        {/* Daily Expenses */}
        {activeTab === 'daily' && (
          <>
            {transactions.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="Aucune dépense"
                subtitle="Commencez par ajouter vos dépenses quotidiennes"
                action={{ label: 'Ajouter', onPress: () => setShowAddModal(true) }}
              />
            ) : (
              transactions.map((tx) => (
                <Card key={tx.id} style={styles.expenseCard}>
                  <View style={styles.expenseRow}>
                    <CategoryIcon category={tx.category} size="md" />
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseTitle}>{tx.title}</Text>
                      <Text style={styles.expenseDate}>{tx.date}</Text>
                    </View>
                    <View style={styles.expenseRight}>
                      <Text style={styles.expenseAmount}>-{formatNumber(tx.amount, 2)}</Text>
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
                <Text style={styles.proLockedTitle}>Fonctionnalité Pro</Text>
                <Text style={styles.proLockedText}>
                  Passez à Guardian Pro pour gérer vos frais professionnels et exporter des notes de frais PDF.
                </Text>
              </Card>
            )}
            {isPro && proExpenses.length === 0 ? (
              <EmptyState
                icon="briefcase-outline"
                title="Aucun frais pro"
                subtitle="Ajoutez vos frais professionnels pour les exporter en PDF"
                action={{ label: 'Ajouter', onPress: () => setShowAddModal(true) }}
              />
            ) : (
              isPro && proExpenses.map((exp) => (
                <Card key={exp.id} style={styles.expenseCard}>
                  <View style={styles.expenseRow}>
                    <CategoryIcon category={exp.category} size="md" />
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
                title="Aucun contrat"
                subtitle="Ajoutez vos contrats pour suivre les renouvellements"
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
                {activeTab === 'pro' ? 'Nouveau frais pro' : 'Nouvelle dépense'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Titre</Text>
              <TextInput
                style={styles.input}
                value={newExpense.title}
                onChangeText={(t) => setNewExpense((p) => ({ ...p, title: t }))}
                placeholder="ex: Migros"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Montant ({CUR})</Text>
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
              <Text style={styles.inputLabel}>Catégorie</Text>
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
                <Text style={styles.inputLabel}>Justification</Text>
                <TextInput
                  style={styles.input}
                  value={newExpense.justification}
                  onChangeText={(t) => setNewExpense((p) => ({ ...p, justification: t }))}
                  placeholder="ex: Réunion client"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
            )}

            <Button
              title="Ajouter"
              onPress={handleAddExpense}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.lg }}
            />
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
});
