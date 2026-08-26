/**
 * GUARDIAN MONEY CHF - Receipts Gallery
 * Browse all scanned tickets, filter by type (caisse / remboursement)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, EmptyState, Button } from '../../src/components/ui';
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { formatNumber } from '../../src/utils/calculations';
import ZoomableImage from '../../src/components/ZoomableImage';
import type { ReceiptType } from '../../src/types';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';
import { useTranslation } from '../../src/hooks/useTranslation';

type Filter = 'all' | ReceiptType;

export default function ReceiptsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { receipts, deleteReceipt, updateReceipt, updateTransaction, deleteTransaction } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // CRUD: actions sheet + edit modal
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const editingReceipt = useMemo(
    () => receipts.find((r) => r.id === editingReceiptId) || null,
    [editingReceiptId, receipts]
  );
  const RECEIPT_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'merchant', label: t('receipts.fieldMerchant'), type: 'text', icon: 'storefront-outline', placeholder: t('receipts.merchantPh'), required: true },
    { key: 'amount', label: t('receipts.fieldAmount'), type: 'number', icon: 'cash-outline', placeholder: t('receipts.amountPh'), required: true },
    { key: 'date', label: t('receipts.fieldDate'), type: 'text', icon: 'calendar-outline', placeholder: t('receipts.datePh') },
    { key: 'category', label: t('receipts.fieldCategory'), type: 'select', options: EXPENSE_CATEGORIES.slice(0, 12).map((c) => ({ value: c.id, label: c.name, color: c.color })) },
    { key: 'type', label: t('receipts.fieldType'), type: 'select', options: [
      { value: 'ticket', label: t('receipts.typeTicket') },
      { value: 'remboursement', label: t('receipts.typeReimb') },
    ] },
    { key: 'note', label: t('receipts.fieldNote'), type: 'multiline', placeholder: t('receipts.notePh') },
  ], [t]);
  const handleEditReceiptSubmit = (values: Record<string, any>) => {
    if (!editingReceipt) return;
    const amt = parseFloat(String(values.amount).replace(',', '.')) || editingReceipt.amount;
    const merchant = String(values.merchant || '').trim() || editingReceipt.merchant;
    const cat = values.category || editingReceipt.category;
    const newType = (values.type === 'remboursement' ? 'remboursement' : 'ticket') as ReceiptType;
    updateReceipt(editingReceipt.id, {
      merchant,
      amount: amt,
      date: values.date || editingReceipt.date,
      category: cat,
      type: newType,
      note: values.note || undefined,
    });
    // If receipt linked to a transaction (ticket), keep it in sync
    if (editingReceipt.transactionId && newType === 'ticket') {
      updateTransaction(editingReceipt.transactionId, {
        title: merchant,
        amount: amt,
        category: cat,
        note: values.note || undefined,
      });
    }
    setEditingReceiptId(null);
  };

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      if (filter !== 'all' && r.type !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !r.merchant.toLowerCase().includes(q) &&
          !(r.note || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [receipts, filter, search]);

  const totals = useMemo(() => {
    const ticket = receipts
      .filter((r) => r.type === 'ticket')
      .reduce((s, r) => s + r.amount, 0);
    const remb = receipts
      .filter((r) => r.type === 'remboursement')
      .reduce((s, r) => s + r.amount, 0);
    return { ticket, remb, total: ticket + remb };
  }, [receipts]);

  const sel = receipts.find((r) => r.id === selected) || null;

  const handleDelete = (id: string) => {
    const r = receipts.find((x) => x.id === id);
    const hasLinkedTx = !!(r?.transactionId && r.type === 'ticket');
    const message = hasLinkedTx
      ? t('receipts.irreversibleWithTx')
      : t('receipts.irreversible');
    if (hasLinkedTx) {
      Alert.alert(t('receipts.deleteTitle'), message, [
        { text: t('receipts.cancel'), style: 'cancel' },
        {
          text: t('receipts.receiptOnly'),
          onPress: () => {
            deleteReceipt(id);
            setSelected(null);
          },
        },
        {
          text: t('receipts.receiptAndTx'),
          style: 'destructive',
          onPress: () => {
            if (r?.transactionId) deleteTransaction(r.transactionId);
            deleteReceipt(id);
            setSelected(null);
          },
        },
      ]);
    } else {
      Alert.alert(t('receipts.deleteTitle'), message, [
        { text: t('receipts.cancel'), style: 'cancel' },
        {
          text: t('receipts.delete'),
          style: 'destructive',
          onPress: () => {
            deleteReceipt(id);
            setSelected(null);
          },
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('receipts.title')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/scanner-modal')}
          style={styles.iconBtn}
        >
          <Ionicons name="add" size={26} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        {/* Quick actions: Scan + Manual Add */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickBtn, styles.quickBtnPrimary]}
            onPress={() => router.push({ pathname: '/scanner-modal', params: { forceType: 'ticket' } })}
          >
            <Ionicons name="scan" size={20} color="#FFF" />
            <Text style={styles.quickBtnTxtPrimary}>{t('receipts.scanCta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/more/add-receipt-manual' as any)}
          >
            <Ionicons name="create-outline" size={20} color={theme.primary} />
            <Text style={styles.quickBtnTxt}>{t('receipts.manualAdd')}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statEmoji}>🛒</Text>
            <Text style={styles.statLabel}>{t('receipts.statTicket')}</Text>
            <Text style={styles.statValue}>CHF {formatNumber(totals.ticket)}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statEmoji}>💼</Text>
            <Text style={styles.statLabel}>{t('receipts.statReimb')}</Text>
            <Text style={[styles.statValue, { color: theme.warning }]}>
              CHF {formatNumber(totals.remb)}
            </Text>
          </Card>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('receipts.searchPh')}
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        {/* Filter chips */}
        <View style={styles.chips}>
          {([
            { id: 'all', label: t('receipts.filterAll'), emoji: '📑' },
            { id: 'ticket', label: t('receipts.filterTicket'), emoji: '🛒' },
            { id: 'remboursement', label: t('receipts.filterReimb'), emoji: '💼' },
          ] as const).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, filter === f.id && styles.chipActive]}
              onPress={() => setFilter(f.id as Filter)}
            >
              <Text style={styles.chipEmoji}>{f.emoji}</Text>
              <Text
                style={[styles.chipText, filter === f.id && styles.chipTextActive]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Receipts grid */}
        {filtered.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={t('receipts.emptyTitle')}
            subtitle={t('receipts.emptySub')}
          />
        ) : (
          <View style={styles.grid}>
            {filtered.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.gridItem}
                onPress={() => setSelected(r.id)}
                onLongPress={() => setActionsCtx({
                  id: r.id,
                  title: r.merchant,
                  subtitle: `CHF ${formatNumber(r.amount)} · ${r.type === 'ticket' ? 'Ticket' : 'Remboursement'}`,
                  accent: r.type === 'ticket' ? theme.primary : '#7C3AED',
                })}
                activeOpacity={0.7}
              >
                <Image source={{ uri: r.imageBase64 }} style={styles.gridImage} />
                <View style={styles.gridOverlay}>
                  <View style={styles.gridTypePill}>
                    <Text style={styles.gridTypeText}>
                      {r.type === 'ticket' ? '🛒' : '💼'}
                    </Text>
                  </View>
                  <Text style={styles.gridMerchant} numberOfLines={1}>
                    {r.merchant}
                  </Text>
                  <Text style={styles.gridAmount}>
                    CHF {formatNumber(r.amount)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal
        visible={!!sel}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {sel && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{sel.merchant}</Text>
                  <TouchableOpacity onPress={() => setSelected(null)}>
                    <Ionicons name="close" size={26} color={theme.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 500 }}>
                  <ZoomableImage source={{ uri: sel.imageBase64 }} style={styles.modalImage} resizeMode="contain" />
                  <View style={styles.zoomHintBar}>
                    <Ionicons name="resize" size={11} color={theme.textTertiary} />
                    <Text style={styles.zoomHintTxt}>{t('receipts.zoomHint')}</Text>
                  </View>
                  <View style={styles.detailGrid}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('receipts.detailAmount')}</Text>
                      <Text style={styles.detailValue}>
                        CHF {formatNumber(sel.amount)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('receipts.detailCategory')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CategoryIcon category={sel.category} size="sm" showBackground={false} />
                        <Text style={styles.detailValue}>{getCategoryName(sel.category, t)}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('receipts.detailType')}</Text>
                      <Text style={styles.detailValue}>
                        {sel.type === 'ticket' ? t('receipts.typeTicket') : t('receipts.typeReimb')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('receipts.detailDate')}</Text>
                      <Text style={styles.detailValue}>{sel.date}</Text>
                    </View>
                    {sel.note && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{t('receipts.detailNote')}</Text>
                        <Text style={styles.detailValue}>{sel.note}</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
                  <Button
                    title={t('receipts.editBtn')}
                    variant="secondary"
                    onPress={() => {
                      const id = sel.id;
                      setSelected(null);
                      setEditingReceiptId(id);
                    }}
                    icon="create-outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={t('receipts.deleteBtn')}
                    variant="danger"
                    onPress={() => handleDelete(sel.id)}
                    icon="trash-outline"
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Floating Scan FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/scanner-modal')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('receipts.a11yScanTicket')}
        testID="receipts-scan-fab"
      >
        <View style={styles.fabInner}>
          <Ionicons name="scan" size={26} color="#0F1115" />
        </View>
      </TouchableOpacity>

      {/* CRUD: actions sheet + edit modal */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingReceiptId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) handleDelete(id);
        }}
        deleteConfirmTitle={t('receipts.deleteTitle')}
      />
      <EntityEditModal
        visible={!!editingReceipt}
        onClose={() => setEditingReceiptId(null)}
        title={t('receipts.editModalTitle')}
        fields={RECEIPT_EDIT_FIELDS}
        initialValues={{
          merchant: editingReceipt?.merchant || '',
          amount: editingReceipt?.amount?.toString() || '',
          date: editingReceipt?.date || '',
          category: editingReceipt?.category || 'autre',
          type: editingReceipt?.type || 'ticket',
          note: editingReceipt?.note || '',
        }}
        onSubmit={handleEditReceiptSubmit}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  statEmoji: { fontSize: 28, marginBottom: Spacing.xs },
  statLabel: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginBottom: 4 },
  statValue: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },

  importBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}10`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  importBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  importBannerContent: { flex: 1 },
  importBannerTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  importBannerSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },

  // Quick actions (scanner + manual add)
  quickActions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  quickBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickBtnTxt: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  quickBtnTxtPrimary: { color: '#FFF', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },

  // Floating Scan FAB (Tickets & reçus)
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSizes.md, paddingVertical: Spacing.md },
  chips: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  chipActive: { backgroundColor: `${Colors.primary}25`, borderColor: Colors.primary },
  chipEmoji: { fontSize: 14 },
  chipText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  chipTextActive: { color: Colors.primaryLight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  gridItem: {
    width: '47%',
    aspectRatio: 0.7,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  gridTypePill: {
    position: 'absolute',
    top: -200,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTypeText: { fontSize: 16 },
  gridMerchant: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  gridAmount: { color: Colors.primaryLight, fontSize: FontSizes.xs, fontWeight: FontWeights.bold, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, flex: 1 },
  modalImage: { width: '100%', height: 280, backgroundColor: Colors.background, borderRadius: BorderRadius.lg },
  zoomHintBar: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 6 },
  zoomHintTxt: { color: Colors.textTertiary, fontSize: 11, fontStyle: 'italic' },
  detailGrid: { paddingTop: Spacing.lg, gap: Spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  detailLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  detailValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
