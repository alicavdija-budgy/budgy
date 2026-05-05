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
import { useStore } from '../../src/stores/useStore';
import { Card, EmptyState, Button } from '../../src/components/ui';
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { formatNumber } from '../../src/utils/calculations';
import ZoomableImage from '../../src/components/ZoomableImage';
import type { ReceiptType } from '../../src/types';

type Filter = 'all' | ReceiptType;

export default function ReceiptsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { receipts, deleteReceipt } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

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
    Alert.alert('Supprimer ce reçu ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          deleteReceipt(id);
          setSelected(null);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tickets & Reçus</Text>
        <TouchableOpacity
          onPress={() => router.push('/scanner-modal')}
          style={styles.iconBtn}
        >
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statEmoji}>🛒</Text>
            <Text style={styles.statLabel}>Caisse</Text>
            <Text style={styles.statValue}>CHF {formatNumber(totals.ticket)}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statEmoji}>💼</Text>
            <Text style={styles.statLabel}>Remboursements</Text>
            <Text style={[styles.statValue, { color: Colors.warning }]}>
              CHF {formatNumber(totals.remb)}
            </Text>
          </Card>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un commerce..."
            placeholderTextColor={Colors.textTertiary}
          />
        </View>

        {/* Filter chips */}
        <View style={styles.chips}>
          {([
            { id: 'all', label: 'Tous', emoji: '📑' },
            { id: 'ticket', label: 'Caisse', emoji: '🛒' },
            { id: 'remboursement', label: 'Remboursement', emoji: '💼' },
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
            title="Aucun reçu pour le moment"
            subtitle="Scannez un ticket via le bouton scan central pour le retrouver ici."
          />
        ) : (
          <View style={styles.grid}>
            {filtered.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.gridItem}
                onPress={() => setSelected(r.id)}
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
                    <Ionicons name="close" size={26} color={Colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 500 }}>
                  <ZoomableImage source={{ uri: sel.imageBase64 }} style={styles.modalImage} resizeMode="contain" />
                  <View style={styles.zoomHintBar}>
                    <Ionicons name="resize" size={11} color={Colors.textTertiary} />
                    <Text style={styles.zoomHintTxt}>Pincez pour zoomer · Double-tap pour réinitialiser</Text>
                  </View>
                  <View style={styles.detailGrid}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Montant</Text>
                      <Text style={styles.detailValue}>
                        CHF {formatNumber(sel.amount)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Catégorie</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CategoryIcon category={sel.category} size="sm" showBackground={false} />
                        <Text style={styles.detailValue}>{getCategoryName(sel.category)}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {sel.type === 'ticket' ? '🛒 Ticket de caisse' : '💼 Remboursement'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Date</Text>
                      <Text style={styles.detailValue}>{sel.date}</Text>
                    </View>
                    {sel.note && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Note</Text>
                        <Text style={styles.detailValue}>{sel.note}</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
                <Button
                  title="Supprimer le reçu"
                  variant="danger"
                  onPress={() => handleDelete(sel.id)}
                  fullWidth
                  icon="trash-outline"
                  style={{ marginTop: Spacing.lg }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
