/**
 * BUDGY — Budgets : tableau de bord visuel mensuel.
 *
 * Moteur corrigé : les dépenses sont filtrées par MOIS/ANNÉE réellement
 * sélectionnés (même convention que l'Accueil / getMonthlyFinancialSnapshot :
 * somme des montants des transactions du mois, remboursements négatifs
 * déduits) — plus jamais de cumul « depuis toujours ». Navigation entre les
 * mois, anneaux de progression par catégorie, dépassements explicites
 * (jamais un 2e tour d'anneau trompeur), Budgy Pulse basé sur des calculs
 * vérifiables uniquement. Budget restant ≠ solde bancaire : libellés clairs.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Spacing, FontSizes, FontWeights, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card } from '../../src/components/ui';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useStore } from '../../src/stores/useStore';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';
import { getCategoryColor } from '../../src/components/CategoryIcon';
import EntityEditModal, { type EditField } from '../../src/components/EntityEditModal';
import PressScale from '../../src/components/PressScale';

const RING = 74;
const STROKE = 7;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function Ring({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  const clamped = Math.max(0, Math.min(1, pct)); // jamais de 2e tour trompeur
  return (
    <Svg width={RING} height={RING}>
      <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={trackColor} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={RING / 2} cy={RING / 2} r={R}
        stroke={color} strokeWidth={STROKE} fill="none"
        strokeDasharray={`${CIRC * clamped} ${CIRC}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

export default function BudgetsScreen() {
  const { t, lang } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, budgets, transactions, addBudget, updateBudget, deleteBudget } = useStore();
  const CUR = preferences.currency;

  // ── Mois sélectionné (navigation passé/présent) ──
  const now = new Date();
  const [offset, setOffset] = useState(0); // 0 = mois courant, -1 = précédent…
  const period = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const py = period.getFullYear();
  const pm = period.getMonth();
  const isCurrent = offset === 0;
  const monthLabel = period.toLocaleDateString(lang === 'en' ? 'en-GB' : `${lang}-CH`, { month: 'long', year: 'numeric' });

  const [detailCat, setDetailCat] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState('courses');
  const [newLimit, setNewLimit] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Moteur : dépenses du MOIS sélectionné uniquement (convention Accueil :
  // somme des montants ; un remboursement négatif réduit le dépensé). ──
  const monthTx = useMemo(() => transactions.filter((tx) => {
    const d = new Date(tx.date);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === py && d.getMonth() === pm;
  }), [transactions, py, pm]);

  const data = useMemo(() => budgets.map((b) => {
    const catTx = monthTx.filter((tx) => tx.category === b.category);
    const spent = catTx.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const limit = Number(b.limit) || 0;
    const pctUsed = limit > 0 ? spent / limit : 0;
    return { ...b, spent, limit, pctUsed, over: Math.max(0, spent - limit), count: catTx.length };
  }).sort((a, b) => b.pctUsed - a.pctUsed), [budgets, monthTx]);

  const totalLimit = data.reduce((s, b) => s + b.limit, 0);
  const totalSpent = data.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const available = Math.max(0, totalLimit - totalSpent);
  const totalOver = data.reduce((s, b) => s + b.over, 0);

  // ── Budgy Pulse : rythme vérifiable (part du budget vs part du mois) ──
  const pulse = useMemo(() => {
    if (totalLimit <= 0) return null;
    const overCat = data.find((b) => b.over > 0);
    if (overCat) {
      return { icon: 'alert-circle' as const, color: theme.error, text: t('budgetsV2.pulseOver', { cat: t(`categoryLabels.${overCat.category}`) || overCat.category }) };
    }
    if (!isCurrent) {
      return { icon: 'time' as const, color: theme.textSecondary, text: t('budgetsV2.pulsePast', { pct: Math.round(totalPct * 100) }) };
    }
    const daysIn = new Date(py, pm + 1, 0).getDate();
    const monthProgress = now.getDate() / daysIn;
    if (totalPct <= monthProgress + 0.05) {
      return { icon: 'checkmark-circle' as const, color: theme.success, text: t('budgetsV2.pulseGood') };
    }
    return { icon: 'speedometer' as const, color: theme.warning, text: t('budgetsV2.pulseFast', { pct: Math.round(totalPct * 100), month: Math.round(monthProgress * 100) }) };
  }, [data, totalLimit, totalPct, isCurrent, py, pm, now, t, theme]);

  const fmt = (n: number) => `${CUR} ${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

  const EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'category', label: t('budgetsUi.category'), type: 'select', options: EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: t(`categoryLabels.${c.id}`) || c.name, color: c.color })) },
    { key: 'limit', label: t('budgetsUi.monthLimit'), type: 'number', icon: 'cash-outline', placeholder: '500', required: true },
  ], [t]);
  const editing = budgets.find((b) => b.id === editingId) || null;

  const detail = detailCat ? data.find((b) => b.category === detailCat) || null : null;
  const detailTx = detail ? monthTx.filter((tx) => tx.category === detail.category) : [];
  const catMeta = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id);

  const handleAdd = () => {
    const limit = parseFloat(newLimit.replace(/['’\u00A0 ]/g, '').replace(',', '.'));
    if (!limit || limit <= 0) return;
    addBudget({ id: `b_${Date.now()}`, category: newCat, limit, color: getCategoryColor(newCat) } as any);
    setShowAdd(false); setNewLimit('');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="budgets-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('budgetsV2.title')}</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.backBtn} testID="add-budget">
          <Ionicons name="add" size={26} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Navigation mensuelle ── */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setOffset(offset - 1)} hitSlop={10} testID="month-prev">
            <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => offset < 0 && setOffset(offset + 1)} hitSlop={10} disabled={offset >= 0} testID="month-next">
            <Ionicons name="chevron-forward" size={20} color={offset < 0 ? theme.textSecondary : theme.cardBorder} />
          </TouchableOpacity>
        </View>

        {/* ── Récapitulatif ── */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>{t('budgetsV2.consumed')}</Text>
              <Text style={styles.summaryPct}>{Math.round(totalPct * 100)}%</Text>
              <Text style={styles.summarySub}>
                {fmt(totalSpent)} / {fmt(totalLimit)}
              </Text>
            </View>
            <View style={styles.availableBox}>
              <Text style={styles.availLabel}>{t('budgetsV2.available')}</Text>
              <Text style={[styles.availAmt, totalOver > 0 && { color: theme.error }]}>
                {totalOver > 0 ? `−${fmt(totalOver)}` : fmt(available)}
              </Text>
              <Text style={styles.availNote}>{totalOver > 0 ? t('budgetsV2.overspent') : t('budgetsV2.availableNote')}</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, {
                width: `${Math.min(100, totalPct * 100)}%`,
                backgroundColor: totalPct > 1 ? theme.error : totalPct > 0.85 ? theme.warning : theme.success,
              }]}
            />
          </View>
          {pulse && (
            <View style={styles.pulseRow}>
              <Ionicons name={pulse.icon} size={15} color={pulse.color} />
              <Text style={[styles.pulseText, { color: pulse.color }]}>{pulse.text}</Text>
            </View>
          )}
        </Card>

        {/* ── Grille d'anneaux par catégorie ── */}
        {data.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="pie-chart-outline" size={30} color={theme.textTertiary} />
            <Text style={styles.emptyText}>{t('budgetsV2.empty')}</Text>
          </Card>
        ) : (
          <View style={styles.grid}>
            {data.map((b, i) => {
              const meta = catMeta(b.category);
              const color = b.over > 0 ? theme.error : (meta?.color || theme.primary);
              return (
                <Animated.View key={b.id} entering={FadeInDown.duration(320).delay(60 + i * 35)} style={styles.cell}>
                  <PressScale
                    haptic="light"
                    onPress={() => setDetailCat(b.category)}
                    onLongPress={() => {
                      Alert.alert(t(`categoryLabels.${b.category}`) || b.category, undefined, [
                        { text: t('common.edit'), onPress: () => setEditingId(b.id) },
                        { text: t('common.delete'), style: 'destructive', onPress: () => deleteBudget(b.id) },
                        { text: t('common.cancel'), style: 'cancel' },
                      ]);
                    }}
                    style={styles.catCard}
                    contentStyle={styles.catContent}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`categoryLabels.${b.category}`) || b.category} — ${fmt(b.spent)} / ${fmt(b.limit)}`}
                  >
                    <View style={styles.ringWrap}>
                      <Ring pct={b.pctUsed} color={color} trackColor={theme.cardBorder} />
                      <View style={styles.ringCenter}>
                        <Ionicons name={(meta?.icon || 'pricetag') as any} size={18} color={color} />
                        <Text style={[styles.ringPct, { color }]}>{Math.round(b.pctUsed * 100)}%</Text>
                      </View>
                    </View>
                    <Text style={styles.catName} numberOfLines={1}>
                      {(t(`categoryLabels.${b.category}`) || meta?.name || b.category).toUpperCase()}
                    </Text>
                    <Text style={styles.catAmts}>
                      {fmt(b.spent)} / {fmt(b.limit)}
                    </Text>
                    {b.over > 0 && (
                      <Text style={styles.overTag}>{t('budgetsV2.overBy', { amt: fmt(b.over) })}</Text>
                    )}
                  </PressScale>
                </Animated.View>
              );
            })}
          </View>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Détail d'une catégorie : transactions du mois ── */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetailCat(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {detail && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{t(`categoryLabels.${detail.category}`) || detail.category}</Text>
                  <TouchableOpacity onPress={() => setDetailCat(null)} hitSlop={10}>
                    <Ionicons name="close" size={22} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.sheetSub}>
                  {monthLabel} · {fmt(detail.spent)} / {fmt(detail.limit)}
                  {detail.over > 0 ? ` · ${t('budgetsV2.overBy', { amt: fmt(detail.over) })}` : ''}
                </Text>
                <ScrollView style={{ maxHeight: 320 }}>
                  {detailTx.length === 0 ? (
                    <Text style={styles.emptyText}>{t('budgetsV2.noTx')}</Text>
                  ) : detailTx.map((tx) => (
                    <View key={tx.id} style={styles.txRow}>
                      <Text style={styles.txTitle} numberOfLines={1}>{tx.title}</Text>
                      <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString()}</Text>
                      <Text style={styles.txAmt}>{fmt(Number(tx.amount) || 0)}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={styles.sheetBtn}
                    onPress={() => { setEditingId(detail.id); setDetailCat(null); }}
                  >
                    <Ionicons name="create-outline" size={16} color={theme.primary} />
                    <Text style={styles.sheetBtnTxt}>{t('budgetsV2.editLimit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                    onPress={() => { setDetailCat(null); router.push('/quick-add' as any); }}
                  >
                    <Ionicons name="add" size={17} color="#07111F" />
                    <Text style={[styles.sheetBtnTxt, { color: '#07111F' }]}>{t('budgetsV2.quickAdd')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Ajouter un budget ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('budgetsV2.addTitle')}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {EXPENSE_CATEGORIES.filter((c) => !budgets.some((b) => b.category === c.id)).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catChip, newCat === c.id && { borderColor: c.color, backgroundColor: `${c.color}18` }]}
                  onPress={() => setNewCat(c.id)}
                >
                  <Ionicons name={c.icon as any} size={14} color={c.color} />
                  <Text style={styles.catChipTxt}>{t(`categoryLabels.${c.id}`) || c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder={t('budgetsUi.monthLimit')}
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              value={newLimit}
              onChangeText={setNewLimit}
            />
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnPrimary, { marginTop: 12 }]} onPress={handleAdd}>
              <Text style={[styles.sheetBtnTxt, { color: '#07111F' }]}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <EntityEditModal
        visible={!!editing}
        title={t('budgetsV2.editLimit')}
        fields={EDIT_FIELDS}
        initialValues={editing ? { category: editing.category, limit: String(editing.limit) } : {}}
        onSubmit={(values) => {
          if (!editing) return;
          const limit = Number(values.limit) || editing.limit;
          updateBudget(editing.id, { category: values.category || editing.category, limit, color: getCategoryColor(values.category || editing.category) });
          setEditingId(null);
        }}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}

const makeStyles = (C: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg, paddingTop: 0 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md, paddingHorizontal: 4 },
  monthLabel: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, textTransform: 'capitalize' },
  summaryCard: { marginBottom: Spacing.md },
  summaryTop: { flexDirection: 'row', gap: Spacing.md },
  summaryLabel: { color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryPct: { color: C.text, fontSize: 34, fontWeight: FontWeights.black, fontVariant: ['tabular-nums'], marginTop: 2 },
  summarySub: { color: C.textSecondary, fontSize: FontSizes.sm, marginTop: 2, fontVariant: ['tabular-nums'] },
  availableBox: { alignItems: 'flex-end', justifyContent: 'center' },
  availLabel: { color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  availAmt: { color: C.success, fontSize: FontSizes.xl, fontWeight: FontWeights.black, fontVariant: ['tabular-nums'], marginTop: 2 },
  availNote: { color: C.textTertiary, fontSize: 10.5, marginTop: 1 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.cardBorder, marginTop: Spacing.md, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: Spacing.md },
  pulseText: { fontSize: 12.5, fontWeight: FontWeights.semibold, flex: 1, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48.4%', marginBottom: 10 },
  catCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  catContent: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPct: { fontSize: 11, fontWeight: FontWeights.black, marginTop: 1, fontVariant: ['tabular-nums'] },
  catName: { color: C.textSecondary, fontSize: 10.5, fontWeight: FontWeights.black, letterSpacing: 0.6, marginTop: 8 },
  catAmts: { color: C.text, fontSize: 12.5, fontWeight: FontWeights.bold, marginTop: 3, fontVariant: ['tabular-nums'] },
  overTag: { color: C.error, fontSize: 10.5, fontWeight: FontWeights.bold, marginTop: 3 },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: Spacing.xl },
  emptyText: { color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', paddingVertical: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, borderWidth: 1, borderColor: C.cardBorder },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  sheetSub: { color: C.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.md, fontVariant: ['tabular-nums'] },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  txTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, flex: 1 },
  txDate: { color: C.textTertiary, fontSize: FontSizes.xs },
  txAmt: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, fontVariant: ['tabular-nums'] },
  sheetActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  sheetBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: `${C.primary}50`, borderRadius: BorderRadius.md, paddingVertical: 12,
  },
  sheetBtnPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  sheetBtnTxt: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8,
    borderWidth: 1, borderColor: C.cardBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  catChipTxt: { color: C.text, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, color: C.text, fontSize: FontSizes.md,
  },
});
