/**
 * BUDGY - Income Management Screen
 * Full CRUD for user income sources (salary, freelance, bonus, rental, etc.)
 * Supports monthly, quarterly, and yearly frequencies.
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, EmptyState } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

const INCOME_TYPES = [
  { key: 'salary',     label: 'Salaire',         icon: 'briefcase',     color: '#06D6A0', emoji: '💼' },
  { key: 'freelance',  label: 'Freelance',       icon: 'laptop',        color: '#7C3AED', emoji: '🧑‍💻' },
  { key: 'rental',     label: 'Location',        icon: 'home',          color: '#F59E0B', emoji: '🏠' },
  { key: 'investment', label: 'Investissements', icon: 'trending-up',   color: '#22D3EE', emoji: '📈' },
  { key: 'bonus',      label: '13ème / Bonus',   icon: 'gift',          color: '#FBBF24', emoji: '🎁' },
  { key: 'side',       label: 'Revenu annexe',   icon: 'sparkles',      color: '#EC4899', emoji: '✨' },
  { key: 'other',      label: 'Autre',           icon: 'cash',          color: '#6B7280', emoji: '💰' },
];

const FREQUENCIES = [
  { key: 'monthly',   label: 'Mensuel',    mult: 12 },
  { key: 'quarterly', label: 'Trimestriel', mult: 4 },
  { key: 'yearly',    label: 'Annuel',      mult: 1 },
] as const;

export default function IncomesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, incomes, addIncome, deleteIncome } = useStore();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    category: 'salary',
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    type: 'recurring' as 'recurring' | 'occasional',
  });

  const CUR = preferences.currency;

  // Monthly aggregation
  const monthlyTotal = useMemo(() => {
    return incomes.reduce((sum, i) => {
      if (i.type !== 'recurring') return sum;
      const amt = Number(i.amount) || 0;
      if (i.frequency === 'yearly') return sum + amt / 12;
      if (i.frequency === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);
  }, [incomes]);

  const yearlyTotal = monthlyTotal * 12;

  const selectedType = INCOME_TYPES.find((t) => t.key === form.category) || INCOME_TYPES[0];

  const handleAdd = () => {
    if (!form.title.trim() || !form.amount) {
      Alert.alert('Champs manquants', 'Veuillez remplir le titre et le montant');
      return;
    }
    const amt = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Montant invalide', 'Saisissez un montant valide');
      return;
    }
    addIncome({
      id: `inc_${Date.now()}`,
      title: form.title.trim(),
      amount: amt,
      type: form.type,
      frequency: form.type === 'recurring' ? form.frequency : undefined,
      category: form.category,
      color: selectedType.color,
      icon: selectedType.icon,
      createdAt: Date.now(),
    });
    setForm({ title: '', amount: '', category: 'salary', frequency: 'monthly', type: 'recurring' });
    setShowModal(false);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Supprimer', `Supprimer "${title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteIncome(id) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes revenus</Text>
        <TouchableOpacity onPress={() => setShowModal(true)} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color={Colors.primaryLight} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero totals */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient
            colors={['#06D6A0', '#0891B2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>REVENU TOTAL</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroBlock}>
                <Text style={styles.heroSub}>Mensuel net</Text>
                <Text style={styles.heroBig}>{CUR} {formatNumber(monthlyTotal)}</Text>
              </View>
              <View style={styles.heroSep} />
              <View style={styles.heroBlock}>
                <Text style={styles.heroSub}>Annuel net</Text>
                <Text style={styles.heroBig}>{CUR} {formatNumber(yearlyTotal)}</Text>
              </View>
            </View>
            <Text style={styles.heroCount}>
              {incomes.length} source{incomes.length > 1 ? 's' : ''} de revenu
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Quick-add suggestions when empty */}
        {incomes.length === 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <Text style={styles.sectionTitle}>Ajout rapide</Text>
            <View style={styles.quickGrid}>
              {INCOME_TYPES.slice(0, 4).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={styles.quickCard}
                  onPress={() => {
                    setForm({ ...form, category: t.key, title: t.label });
                    setShowModal(true);
                  }}
                >
                  <View style={[styles.quickIcon, { backgroundColor: `${t.color}25` }]}>
                    <Text style={styles.quickEmoji}>{t.emoji}</Text>
                  </View>
                  <Text style={styles.quickLabel}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <EmptyState
              icon="wallet-outline"
              title="Aucun revenu ajouté"
              subtitle="Ajoutez votre salaire pour débloquer le budget en temps réel"
              action={{ label: '+ Ajouter mon salaire', onPress: () => setShowModal(true) }}
            />
          </Animated.View>
        )}

        {/* Income list */}
        {incomes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Sources de revenu ({incomes.length})</Text>
            {incomes.map((inc, idx) => {
              const t = INCOME_TYPES.find((it) => it.key === inc.category) || INCOME_TYPES[6];
              const freqLabel = inc.frequency === 'yearly' ? '/an'
                : inc.frequency === 'quarterly' ? '/trim'
                : inc.type === 'occasional' ? ' ponctuel'
                : '/mois';
              const monthlyEq = inc.frequency === 'yearly' ? inc.amount / 12
                : inc.frequency === 'quarterly' ? inc.amount / 3
                : inc.amount;
              return (
                <Animated.View key={inc.id} entering={FadeInDown.duration(300).delay(idx * 50)}>
                  <Card style={styles.incCard}>
                    <View style={styles.incRow}>
                      <View style={[styles.incIcon, { backgroundColor: `${t.color}25` }]}>
                        <Text style={styles.incEmoji}>{t.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.incTitle}>{inc.title}</Text>
                        <Text style={styles.incMeta}>
                          {t.label} · {inc.type === 'occasional' ? 'Ponctuel' : FREQUENCIES.find(f => f.key === inc.frequency)?.label}
                        </Text>
                      </View>
                      <View style={styles.incAmountBox}>
                        <Text style={[styles.incAmount, { color: t.color }]}>
                          +{CUR} {formatNumber(inc.amount)}
                        </Text>
                        <Text style={styles.incFreq}>{freqLabel}</Text>
                        {inc.type === 'recurring' && inc.frequency !== 'monthly' && (
                          <Text style={styles.incEquiv}>≈ {CUR} {formatNumber(monthlyEq)}/mois</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(inc.id, inc.title)}
                        style={styles.delBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  </Card>
                </Animated.View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add income modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau revenu</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={26} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Type selector */}
              <Text style={styles.label}>Type de revenu</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                {INCOME_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.typeChip,
                      form.category === t.key && { backgroundColor: `${t.color}30`, borderColor: t.color },
                    ]}
                    onPress={() => setForm((p) => ({ ...p, category: t.key }))}
                  >
                    <Text style={styles.typeEmoji}>{t.emoji}</Text>
                    <Text style={[
                      styles.typeLabel,
                      form.category === t.key && { color: t.color, fontWeight: FontWeights.bold },
                    ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Title */}
              <Text style={styles.label}>Nom (ex : Salaire Employeur SA)</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(t) => setForm((p) => ({ ...p, title: t }))}
                placeholder="Salaire net"
                placeholderTextColor={Colors.textTertiary}
              />

              {/* Amount */}
              <Text style={styles.label}>Montant ({CUR})</Text>
              <TextInput
                style={styles.inputBig}
                value={form.amount}
                onChangeText={(t) => setForm((p) => ({ ...p, amount: t }))}
                placeholder="6500"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* Type: recurring / occasional */}
              <Text style={styles.label}>Nature</Text>
              <View style={styles.segmentRow}>
                {[
                  { k: 'recurring', lbl: '🔁 Récurrent' },
                  { k: 'occasional', lbl: '⚡ Ponctuel' },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.k}
                    style={[styles.segment, form.type === s.k && styles.segmentActive]}
                    onPress={() => setForm((p) => ({ ...p, type: s.k as any }))}
                  >
                    <Text style={[
                      styles.segmentLabel,
                      form.type === s.k && styles.segmentLabelActive,
                    ]}>
                      {s.lbl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Frequency (only for recurring) */}
              {form.type === 'recurring' && (
                <>
                  <Text style={styles.label}>Fréquence</Text>
                  <View style={styles.segmentRow}>
                    {FREQUENCIES.map((f) => (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.segment, form.frequency === f.key && styles.segmentActive]}
                        onPress={() => setForm((p) => ({ ...p, frequency: f.key }))}
                      >
                        <Text style={[
                          styles.segmentLabel,
                          form.frequency === f.key && styles.segmentLabelActive,
                        ]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Button
                title="Ajouter le revenu"
                onPress={handleAdd}
                fullWidth size="lg"
                style={{ marginTop: Spacing.xl }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg },

  hero: {
    borderRadius: BorderRadius.xxl, padding: Spacing.xl, marginBottom: Spacing.lg,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: FontWeights.bold,
    letterSpacing: 1.3, textTransform: 'uppercase',
  },
  heroRow: { flexDirection: 'row', marginTop: Spacing.md, alignItems: 'center' },
  heroBlock: { flex: 1 },
  heroSep: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.sm },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  heroBig: { color: '#FFF', fontSize: FontSizes.xxl, fontWeight: FontWeights.black, letterSpacing: -0.8, marginTop: 2 },
  heroCount: { color: 'rgba(255,255,255,0.75)', fontSize: FontSizes.xs, marginTop: Spacing.md },

  sectionTitle: {
    color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: Spacing.md, marginBottom: Spacing.sm,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  quickCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs,
  },
  quickIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickEmoji: { fontSize: 22 },
  quickLabel: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

  incCard: { marginBottom: Spacing.sm },
  incRow: { flexDirection: 'row', alignItems: 'center' },
  incIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  incEmoji: { fontSize: 22 },
  incTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  incMeta: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  incAmountBox: { alignItems: 'flex-end', marginRight: Spacing.sm },
  incAmount: { fontSize: FontSizes.md, fontWeight: FontWeights.black },
  incFreq: { color: Colors.textTertiary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  incEquiv: { color: Colors.textTertiary, fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  delBtn: { padding: Spacing.sm },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl, paddingBottom: 40, maxHeight: '92%',
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: Colors.cardBorder, borderRadius: 2,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  label: {
    color: Colors.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: Spacing.md, marginBottom: Spacing.xs,
  },
  typeScroll: { flexDirection: 'row' },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 999, marginRight: Spacing.sm,
  },
  typeEmoji: { fontSize: 16 },
  typeLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    color: Colors.text, fontSize: FontSizes.md,
  },
  inputBig: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, padding: Spacing.lg,
    color: Colors.text, fontSize: 28, fontWeight: FontWeights.black, textAlign: 'center',
  },
  segmentRow: { flexDirection: 'row', gap: 6, backgroundColor: Colors.card, padding: 4, borderRadius: BorderRadius.lg },
  segment: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.primary },
  segmentLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  segmentLabelActive: { color: '#FFF' },
});
