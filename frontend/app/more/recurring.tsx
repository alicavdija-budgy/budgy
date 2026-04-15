/**
 * GUARDIAN MONEY CHF - Recurring Expenses Screen
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, EmptyState } from '../../src/components/ui';
import { CategoryIcon, getCategoryName, getCategoryColor } from '../../src/components/CategoryIcon';
import { formatNumber } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';

export default function RecurringScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, recurringExpenses, addRecurringExpense, toggleRecurringExpense, deleteRecurringExpense } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRec, setNewRec] = useState({ title: '', amount: '', category: 'abonnements', dayOfMonth: '1' });

  const CUR = preferences.currency;

  const totalMonthly = useMemo(() => {
    return recurringExpenses.filter(r => r.active).reduce((sum, r) => sum + r.amount, 0);
  }, [recurringExpenses]);

  const totalYearly = totalMonthly * 12;

  const handleAdd = () => {
    if (!newRec.title || !newRec.amount) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
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
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Récurrents</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Mensuel</Text>
              <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalMonthly)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Annuel</Text>
              <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalYearly)}</Text>
            </View>
          </View>
          <Text style={styles.summaryCount}>{recurringExpenses.filter(r => r.active).length} abonnements actifs</Text>
        </Card>

        {recurringExpenses.length === 0 ? (
          <EmptyState
            icon="refresh-outline"
            title="Aucun récurrent"
            subtitle="Ajoutez vos abonnements et charges fixes"
            action={{ label: 'Ajouter', onPress: () => setShowAddModal(true) }}
          />
        ) : (
          recurringExpenses.map((rec) => (
            <Card key={rec.id} style={[styles.recCard, !rec.active && styles.recCardInactive]}>
              <View style={styles.recRow}>
                <CategoryIcon category={rec.category} size="md" />
                <View style={styles.recInfo}>
                  <Text style={styles.recTitle}>{rec.title}</Text>
                  <Text style={styles.recDate}>Le {rec.dayOfMonth} de chaque mois</Text>
                </View>
                <View style={styles.recRight}>
                  <Text style={styles.recAmount}>{CUR} {formatNumber(rec.amount)}</Text>
                  <Switch
                    value={rec.active}
                    onValueChange={() => toggleRecurringExpense(rec.id)}
                    trackColor={{ false: Colors.cardBorder, true: `${Colors.success}50` }}
                    thumbColor={rec.active ? Colors.success : Colors.textTertiary}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => Alert.alert('Supprimer', 'Confirmer ?', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => deleteRecurringExpense(rec.id) },
                ])}
              >
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
              <Text style={styles.modalTitle}>Nouvel abonnement</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Titre</Text>
            <TextInput
              style={styles.input}
              value={newRec.title}
              onChangeText={(t) => setNewRec((p) => ({ ...p, title: t }))}
              placeholder="Netflix"
              placeholderTextColor={Colors.textTertiary}
            />

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Montant ({CUR})</Text>
                <TextInput
                  style={styles.input}
                  value={newRec.amount}
                  onChangeText={(t) => setNewRec((p) => ({ ...p, amount: t }))}
                  placeholder="17.90"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Jour du mois</Text>
                <TextInput
                  style={styles.input}
                  value={newRec.dayOfMonth}
                  onChangeText={(t) => setNewRec((p) => ({ ...p, dayOfMonth: t }))}
                  placeholder="8"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Button title="Ajouter" onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
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
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryAmount: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.black },
  summaryCount: { color: Colors.textTertiary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.sm },
  recCard: { marginBottom: Spacing.md, position: 'relative' },
  recCardInactive: { opacity: 0.5 },
  recRow: { flexDirection: 'row', alignItems: 'center' },
  recInfo: { flex: 1, marginLeft: Spacing.md },
  recTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  recDate: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  recRight: { alignItems: 'flex-end' },
  recAmount: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },
  deleteBtn: { position: 'absolute', top: Spacing.sm, right: Spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  inputRow: { flexDirection: 'row', gap: Spacing.md },
});
