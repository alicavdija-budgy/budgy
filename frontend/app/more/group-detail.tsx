/**
 * GUARDIAN MONEY CHF - Group Detail (Splitwise-style)
 * Add expenses, see members, view balances and settlements.
 *
 * @i18n-technical-file
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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, EmptyState, Button } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';
import type { GroupExpense, SplitMode } from '../../src/types';

/**
 * Compute member balances and minimal settlements (who pays whom).
 * balances[memberId] > 0 means group OWES them (creditor).
 * balances[memberId] < 0 means they OWE the group (debtor).
 */
function computeBalances(
  members: { id: string }[],
  expenses: GroupExpense[],
): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const m of members) bal[m.id] = 0;
  for (const e of expenses) {
    bal[e.paidBy] = (bal[e.paidBy] || 0) + e.amount;
    const totalShares = Object.values(e.shares).reduce((a, b) => a + b, 0);
    for (const [mid, share] of Object.entries(e.shares)) {
      let owe = 0;
      if (e.splitMode === 'equal') {
        const involved = Object.keys(e.shares).length;
        owe = e.amount / involved;
      } else if (e.splitMode === 'shares') {
        owe = totalShares > 0 ? (share / totalShares) * e.amount : 0;
      } else if (e.splitMode === 'percentages') {
        owe = (share / 100) * e.amount;
      } else {
        owe = share;
      }
      bal[mid] = (bal[mid] || 0) - owe;
    }
  }
  // Round to 2 decimals
  for (const k of Object.keys(bal)) bal[k] = Math.round(bal[k] * 100) / 100;
  return bal;
}

function simplifySettlements(
  balances: Record<string, number>,
): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(balances)
    .filter(([_, v]) => v < -0.01)
    .map(([k, v]) => ({ id: k, amount: -v }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balances)
    .filter(([_, v]) => v > 0.01)
    .map(([k, v]) => ({ id: k, amount: v }))
    .sort((a, b) => b.amount - a.amount);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.amount, c.amount);
    out.push({ from: d.id, to: c.id, amount: Math.round(amt * 100) / 100 });
    d.amount -= amt;
    c.amount -= amt;
    if (d.amount < 0.01) i++;
    if (c.amount < 0.01) j++;
  }
  return out;
}

export default function GroupDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const {
    groups,
    groupExpenses,
    addGroupExpense,
    deleteGroupExpense,
    deleteGroup,
  } = useStore();

  const group = groups.find((g) => g.id === groupId);
  const expenses = groupExpenses.filter((e) => e.groupId === groupId);

  const [modalOpen, setModalOpen] = useState(false);
  // Form
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<string>(group?.members[0]?.id || '');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [involved, setInvolved] = useState<string[]>(group?.members.map((m) => m.id) || []);

  const balances = useMemo(() => {
    if (!group) return {};
    return computeBalances(group.members, expenses);
  }, [group, expenses]);

  const settlements = useMemo(() => simplifySettlements(balances), [balances]);

  if (!group) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 80 }]}>
        <Text style={styles.title}>Groupe introuvable</Text>
        <Button title="Retour" onPress={() => router.back()} variant="secondary" style={{ marginTop: 16 }} />
      </View>
    );
  }

  const memberById = (id: string) => group.members.find((m) => m.id === id);

  const openAdd = () => {
    setTitle('');
    setAmount('');
    setPaidBy(group.members.find((m) => m.isMe)?.id || group.members[0].id);
    setSplitMode('equal');
    setInvolved(group.members.map((m) => m.id));
    setModalOpen(true);
  };

  const toggleInvolved = (id: string) => {
    setInvolved((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  };

  const handleAddExpense = () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!title.trim() || !amt || amt <= 0) {
      Alert.alert('Erreur', t('groupDetail.errValidTitleAmount'));
      return;
    }
    if (involved.length === 0) {
      Alert.alert('Erreur', t('groupDetail.errPickMember'));
      return;
    }
    const shares: Record<string, number> = {};
    for (const id of involved) shares[id] = 1; // for equal mode all = 1
    addGroupExpense({
      id: `gexp_${Date.now()}`,
      groupId: group.id,
      title: title.trim(),
      amount: amt,
      currency: group.currency,
      paidBy,
      splitMode,
      shares,
      date: new Date().toLocaleDateString('fr-CH'),
      createdAt: Date.now(),
    });
    setModalOpen(false);
  };

  const onDeleteGroup = () => {
    Alert.alert(t('groupDetail.deleteConfirmTitle'), t('groupDetail.deleteConfirmBody'), [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => {
          deleteGroup(group.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{group.emoji} {group.name}</Text>
        <TouchableOpacity onPress={onDeleteGroup} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={22} color={theme.error} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 100 }}>
        {/* Members */}
        <Text style={styles.sectionTitle}>Membres</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {group.members.map((m) => {
              const bal = balances[m.id] || 0;
              return (
                <View key={m.id} style={[styles.memberCard, { borderColor: m.color }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: m.color }]}>
                    <Text style={styles.memberAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{m.isMe ? 'Moi' : m.name}</Text>
                  <Text style={[
                    styles.memberBal,
                    { color: bal >= 0 ? theme.success : theme.error }
                  ]}>
                    {bal >= 0 ? '+' : ''}{formatNumber(bal)}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Settlements */}
        {settlements.length > 0 && (
          <Card style={{ padding: Spacing.lg, marginBottom: Spacing.lg }}>
            <Text style={styles.sectionTitle}>Pour solder le groupe</Text>
            {settlements.map((s, i) => {
              const from = memberById(s.from);
              const to = memberById(s.to);
              return (
                <View key={i} style={styles.settleRow}>
                  <View style={[styles.smallAvatar, { backgroundColor: from?.color }]}>
                    <Text style={styles.smallAvatarText}>{from?.name[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.settleText}>{from?.isMe ? 'Moi' : from?.name}</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
                  <View style={[styles.smallAvatar, { backgroundColor: to?.color }]}>
                    <Text style={styles.smallAvatarText}>{to?.name[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.settleText}>{to?.isMe ? 'Moi' : to?.name}</Text>
                  <Text style={styles.settleAmt}>CHF {formatNumber(s.amount)}</Text>
                </View>
              );
            })}
          </Card>
        )}

        {/* Expenses */}
        <View style={styles.expHeader}>
          <Text style={styles.sectionTitle}>Dépenses</Text>
          <TouchableOpacity style={styles.addExpBtn} onPress={openAdd}>
            <Ionicons name="add" size={18} color={theme.text} />
            <Text style={styles.addExpTxt}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {expenses.length === 0 ? (
          <EmptyState
            icon="cash-outline"
            title="Aucune dépense"
            subtitle="Ajoutez la première dépense partagée du groupe."
            actionLabel="+ Ajouter une dépense"
            onAction={openAdd}
          />
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {expenses.map((e) => {
              const payer = memberById(e.paidBy);
              return (
                <View key={e.id} style={styles.expCard}>
                  <View style={[styles.smallAvatar, { backgroundColor: payer?.color }]}>
                    <Text style={styles.smallAvatarText}>{payer?.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expTitle}>{e.title}</Text>
                    <Text style={styles.expSub}>
                      {payer?.isMe ? 'Moi' : payer?.name} a payé • {e.date}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.expAmount}>CHF {formatNumber(e.amount)}</Text>
                    <TouchableOpacity onPress={() => deleteGroupExpense(e.id)}>
                      <Ionicons name="trash-outline" size={16} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={openAdd}
      >
        <LinearGradient colors={theme.gradientPrimary as [string, string]} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color={theme.text} />
        </LinearGradient>
      </TouchableOpacity>

      {/* Add expense modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle dépense</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Titre</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ex: Pizza, Essence, Internet..."
                placeholderTextColor={theme.textTertiary}
              />

              <Text style={styles.label}>Montant (CHF)</Text>
              <TextInput
                style={[styles.input, { fontSize: FontSizes.xl, fontWeight: FontWeights.bold }]}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Payé par</Text>
              <View style={styles.memberRow}>
                {group.members.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.payerChip,
                      paidBy === m.id && { backgroundColor: `${m.color}40`, borderColor: m.color },
                    ]}
                    onPress={() => setPaidBy(m.id)}
                  >
                    <View style={[styles.smallAvatar, { backgroundColor: m.color }]}>
                      <Text style={styles.smallAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.payerName}>{m.isMe ? 'Moi' : m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Partagé entre ({involved.length})</Text>
              <View style={styles.memberRow}>
                {group.members.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.payerChip,
                      involved.includes(m.id) && styles.payerChipActive,
                    ]}
                    onPress={() => toggleInvolved(m.id)}
                  >
                    <View style={[styles.smallAvatar, { backgroundColor: m.color }]}>
                      <Text style={styles.smallAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.payerName}>{m.isMe ? 'Moi' : m.name}</Text>
                    {involved.includes(m.id) && (
                      <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={16} color={theme.primaryLight} />
                <Text style={styles.infoText}>Partagé également entre {involved.length} personnes</Text>
              </View>
            </ScrollView>
            <Button
              title="Ajouter la dépense"
              onPress={handleAddExpense}
              fullWidth
              size="lg"
              icon="checkmark"
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },
  sectionTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },

  memberCard: {
    backgroundColor: Colors.card, borderWidth: 1, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', minWidth: 100, gap: 4,
  },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  memberName: { color: Colors.text, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  memberBal: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

  settleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: Colors.text, fontSize: 11, fontWeight: FontWeights.bold },
  settleText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  settleAmt: { marginLeft: 'auto', color: Colors.warning, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

  expHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  addExpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  addExpTxt: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  expCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },
  expTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  expSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  expAmount: { color: Colors.error, fontSize: FontSizes.md, fontWeight: FontWeights.bold },

  fab: { position: 'absolute', right: 20 },
  fabGrad: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg, maxHeight: '92%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginTop: Spacing.md, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: FontSizes.md,
  },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  payerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.full, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm,
  },
  payerChipActive: { backgroundColor: `${Colors.success}25`, borderColor: Colors.success },
  payerName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.primary}15`, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.md,
  },
  infoText: { color: Colors.primaryLight, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
});
