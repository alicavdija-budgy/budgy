/**
 * GUARDIAN MONEY CHF - Factures & Bills Manager
 * Centralized invoice tracking - never miss a payment
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, Linking, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeInDown, SlideOutRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card, Button, Badge, EmptyState, ProgressBar } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';
import { useStore } from '../../src/stores/useStore';
import type { Invoice as StoreInvoice } from '../../src/types';
import {
  scheduleDeadlineReminders,
  cancelDeadlineReminders,
} from '../../src/services/notifications';

interface Invoice {
  id: string;
  title: string;
  sender: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  category: string;
  recurring: boolean;
  note?: string;
  createdAt: number;
}

const INVOICE_CATEGORIES = [
  { id: 'loyer', name: 'Loyer', icon: 'home', color: '#6366F1' },
  { id: 'electricite', name: 'Électricité', icon: 'flash', color: '#F59E0B' },
  { id: 'internet', name: 'Internet/TV', icon: 'wifi', color: '#0EA5E9' },
  { id: 'telephone', name: 'Téléphone', icon: 'call', color: '#10B981' },
  { id: 'assurance', name: 'Assurance', icon: 'shield', color: '#EF4444' },
  { id: 'impots', name: 'Impôts', icon: 'document-text', color: '#8B5CF6' },
  { id: 'sante', name: 'Santé/Médecin', icon: 'medkit', color: '#EC4899' },
  { id: 'serafe', name: 'Serafe (TV)', icon: 'tv', color: '#6B7280' },
  { id: 'parking', name: 'Parking', icon: 'car', color: '#F97316' },
  { id: 'autre', name: 'Autre', icon: 'receipt', color: '#6B7280' },
];

// Phase 1: invoices start empty — users add their own
const DEMO_INVOICES: Invoice[] = [];

type Tab = 'all' | 'pending' | 'overdue' | 'paid';

// Map store Invoice (issuer/dueDate?) into local rendering shape
function mapStoreInvoice(i: StoreInvoice): Invoice {
  return {
    id: i.id,
    title: i.title || i.issuer || 'Facture',
    sender: i.issuer || '',
    amount: i.amount || 0,
    dueDate: i.dueDate || i.invoiceDate || '',
    status: i.status || 'pending',
    category: i.category || 'autre',
    recurring: false,
    note: undefined,
    createdAt: i.createdAt || Date.now(),
  };
}

export default function InvoicesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Connect to store (FIX: was useState local, invoice imports never appeared) ──
  const storeInvoices = useStore((s) => s.invoices);
  const addInvoice = useStore((s) => s.addInvoice);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const deleteInvoiceAction = useStore((s) => s.deleteInvoice);

  const invoices = useMemo(() => storeInvoices.map(mapStoreInvoice), [storeInvoices]);

  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    title: '', sender: '', amount: '', dueDate: '', category: 'autre', recurring: false,
  });

  const filtered = useMemo(() => {
    if (activeTab === 'all') return invoices;
    return invoices.filter(i => i.status === activeTab);
  }, [invoices, activeTab]);

  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const pendingCount = invoices.filter(i => i.status === 'pending').length;
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;

  const handleAdd = () => {
    if (!newInvoice.title || !newInvoice.amount) {
      Alert.alert('Erreur', 'Titre et montant requis');
      return;
    }
    const id = `inv_${Date.now()}`;
    const amount = parseFloat(newInvoice.amount);
    addInvoice({
      id,
      title: newInvoice.title,
      issuer: newInvoice.sender || 'Inconnu',
      amount,
      currency: 'CHF',
      dueDate: newInvoice.dueDate || undefined,
      status: 'pending',
      category: newInvoice.category,
      source: 'manual',
      createdAt: Date.now(),
    });
    // Schedule deadline reminders (J-30 + J-1) if dueDate present
    if (newInvoice.dueDate) {
      scheduleDeadlineReminders({
        type: 'invoice',
        name: newInvoice.title,
        dueDate: newInvoice.dueDate,
        amount,
      }).catch(() => {});
    }
    setNewInvoice({ title: '', sender: '', amount: '', dueDate: '', category: 'autre', recurring: false });
    setShowAdd(false);
  };

  const toggleStatus = (id: string) => {
    const inv = storeInvoices.find((i) => i.id === id);
    if (!inv) return;
    updateInvoice(id, {
      status: inv.status === 'paid' ? 'pending' : 'paid',
      paidAt: inv.status === 'paid' ? undefined : Date.now(),
    });
  };

  const deleteInvoice = (id: string) => {
    Alert.alert('Supprimer', 'Confirmer la suppression?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteInvoiceAction(id) },
    ]);
  };

  const getStatusColor = (s: string) => s === 'paid' ? theme.success : s === 'overdue' ? theme.error : theme.warning;
  const getStatusLabel = (s: string) => s === 'paid' ? 'Payée' : s === 'overdue' ? 'En retard' : 'À payer';
  const getCat = (id: string) => INVOICE_CATEGORIES.find(c => c.id === id) || INVOICE_CATEGORIES[9];

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'Toutes', count: invoices.length, color: theme.text },
    { key: 'pending', label: 'À payer', count: pendingCount, color: theme.warning },
    { key: 'overdue', label: 'En retard', count: overdueCount, color: theme.error },
    { key: 'paid', label: 'Payées', count: invoices.filter(i => i.status === 'paid').length, color: theme.success },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="invoices-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Factures</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Ionicons name="time" size={20} color={theme.warning} />
              <Text style={styles.summaryLabel}>À payer</Text>
              <Text style={[styles.summaryAmt, { color: theme.warning }]}>{formatNumber(totalPending)}</Text>
              <Text style={styles.summaryCount}>{pendingCount} facture{pendingCount > 1 ? 's' : ''}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="alert-circle" size={20} color={theme.error} />
              <Text style={styles.summaryLabel}>En retard</Text>
              <Text style={[styles.summaryAmt, { color: theme.error }]}>{formatNumber(totalOverdue)}</Text>
              <Text style={styles.summaryCount}>{overdueCount} facture{overdueCount > 1 ? 's' : ''}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="checkmark-circle" size={20} color={theme.success} />
              <Text style={styles.summaryLabel}>Payées</Text>
              <Text style={[styles.summaryAmt, { color: theme.success }]}>{formatNumber(totalPaid)}</Text>
            </View>
          </View>
        </Card>

        {/* Email Sync Banner */}
        <TouchableOpacity style={styles.emailBanner} onPress={() => router.push('/more/email-import')}>
          <View style={styles.emailBannerIcon}>
            <Ionicons name="mail" size={24} color={theme.primary} />
          </View>
          <View style={styles.emailBannerContent}>
            <Text style={styles.emailBannerTitle}>Import email IA</Text>
            <Text style={styles.emailBannerSub}>Retrouvez toutes vos factures au même endroit</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabs}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setActiveTab(t.key)}>
              <Text style={[styles.tabTxt, activeTab === t.key && { color: theme.text }]}>{t.label}</Text>
              {t.count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: activeTab === t.key ? `${t.color}30` : theme.card }]}>
                  <Text style={[styles.tabBadgeTxt, { color: activeTab === t.key ? t.color : theme.textTertiary }]}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Invoice List with swipeable actions */}
        {filtered.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Aucune facture" subtitle="Ajoutez vos factures pour ne rien oublier" action={{ label: 'Ajouter', onPress: () => setShowAdd(true) }} />
        ) : (
          filtered.map((inv, idx) => {
            const cat = getCat(inv.category);
            const statusColor = getStatusColor(inv.status);
            const isOverdue = inv.status === 'overdue';
            const isPaid = inv.status === 'paid';

            const renderRightActions = () => (
              <View style={styles.swipeRightAction}>
                <LinearGradient
                  colors={isPaid ? ['#F43F5E', '#DC2626'] : ['#06D6A0', '#0891B2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.swipeGradient}
                >
                  <Ionicons
                    name={isPaid ? 'refresh-circle' : 'checkmark-circle'}
                    size={28} color="#FFF"
                  />
                  <Text style={styles.swipeTxt}>
                    {isPaid ? 'Annuler' : 'Marquer payé'}
                  </Text>
                </LinearGradient>
              </View>
            );

            return (
              <Animated.View
                key={inv.id}
                entering={FadeInDown.duration(300).delay(idx * 50)}
                exiting={SlideOutRight.duration(300)}
                style={{ marginBottom: Spacing.md }}
              >
                <Swipeable
                  renderRightActions={renderRightActions}
                  overshootRight={false}
                  rightThreshold={80}
                  onSwipeableOpen={() => {
                    if (Platform.OS !== 'web') {
                      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                    }
                    toggleStatus(inv.id);
                  }}
                >
                  <View style={[
                    styles.invCardPremium,
                    isOverdue && styles.invCardOverdue,
                    isPaid && styles.invCardPaid,
                  ]}>
                    {/* Status vertical stripe */}
                    <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />

                    <View style={styles.invBody}>
                      {/* Top row: big status badge + amount dominant */}
                      <View style={styles.invTopRow}>
                        <View style={[styles.statusBadgeBig, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}60` }]}>
                          <Ionicons
                            name={isPaid ? 'checkmark-circle' : isOverdue ? 'alert-circle' : 'time'}
                            size={14} color={statusColor}
                          />
                          <Text style={[styles.statusBadgeBigTxt, { color: statusColor }]}>
                            {getStatusLabel(inv.status)}
                          </Text>
                        </View>
                        <Text style={[
                          styles.invAmountBig,
                          isPaid && { textDecorationLine: 'line-through', opacity: 0.5 },
                        ]}>
                          CHF {formatNumber(inv.amount, 2)}
                        </Text>
                      </View>

                      {/* Title block */}
                      <Text style={[styles.invTitleBig, isPaid && { opacity: 0.6 }]}>
                        {inv.title}
                      </Text>

                      {/* Bottom row: sender + category + due date */}
                      <View style={styles.invMetaRow}>
                        <View style={[styles.catChip, { backgroundColor: `${cat.color}15` }]}>
                          <Ionicons name={cat.icon as any} size={12} color={cat.color} />
                          <Text style={[styles.catChipTxt, { color: cat.color }]}>{cat.name}</Text>
                        </View>
                        <View style={styles.invMetaRight}>
                          <Ionicons
                            name={isOverdue ? 'warning' : 'calendar-outline'}
                            size={12}
                            color={isOverdue ? theme.error : theme.textTertiary}
                          />
                          <Text style={[
                            styles.invDueTxt,
                            { color: isOverdue ? theme.error : theme.textSecondary },
                          ]}>
                            {inv.dueDate}
                          </Text>
                          {inv.recurring && (
                            <>
                              <View style={{ width: 6 }} />
                              <Ionicons name="repeat" size={12} color={theme.textTertiary} />
                            </>
                          )}
                        </View>
                      </View>

                      {/* Swipe hint (only on pending/overdue) */}
                      {!isPaid && (
                        <View style={styles.swipeHint}>
                          <Ionicons name="arrow-back" size={11} color={theme.textTertiary} />
                          <Text style={styles.swipeHintTxt}>Glisser pour marquer payé</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Swipeable>
              </Animated.View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Invoice Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle facture</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Titre</Text>
            <TextInput style={styles.input} value={newInvoice.title} onChangeText={t => setNewInvoice(p => ({ ...p, title: t }))} placeholder="ex: Loyer mai 2026" placeholderTextColor={theme.textTertiary} />

            <Text style={styles.inputLabel}>Émetteur</Text>
            <TextInput style={styles.input} value={newInvoice.sender} onChangeText={t => setNewInvoice(p => ({ ...p, sender: t }))} placeholder="ex: Régie du Lac SA" placeholderTextColor={theme.textTertiary} />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Montant (CHF)</Text>
                <TextInput style={styles.input} value={newInvoice.amount} onChangeText={t => setNewInvoice(p => ({ ...p, amount: t }))} placeholder="0.00" placeholderTextColor={theme.textTertiary} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Échéance</Text>
                <TextInput style={styles.input} value={newInvoice.dueDate} onChangeText={t => setNewInvoice(p => ({ ...p, dueDate: t }))} placeholder="30.04.2026" placeholderTextColor={theme.textTertiary} />
              </View>
            </View>

            <Text style={styles.inputLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.catGrid}>
                {INVOICE_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat.id} style={[styles.catItem, newInvoice.category === cat.id && { backgroundColor: `${cat.color}25`, borderColor: cat.color, borderWidth: 1 }]} onPress={() => setNewInvoice(p => ({ ...p, category: cat.id }))}>
                    <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                    <Text style={styles.catItemTxt}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.recurringToggle} onPress={() => setNewInvoice(p => ({ ...p, recurring: !p.recurring }))}>
              <Ionicons name={newInvoice.recurring ? 'checkbox' : 'square-outline'} size={22} color={theme.primary} />
              <Text style={styles.recurringTxt}>Facture récurrente (mensuelle)</Text>
            </TouchableOpacity>

            <Button title="Ajouter la facture" onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Email Setup Modal — REMOVED: replaced by /more/email-import (3-methods screen) */}
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  summaryCard: { marginBottom: Spacing.md },
  summaryGrid: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 50, backgroundColor: Colors.cardBorder },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 4 },
  summaryAmt: { fontSize: FontSizes.lg, fontWeight: FontWeights.black },
  summaryCount: { color: Colors.textTertiary, fontSize: 10 },
  emailBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${Colors.primary}10`, borderWidth: 1, borderColor: `${Colors.primary}30`, borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.md },
  emailBannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: `${Colors.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  emailBannerContent: { flex: 1 },
  emailBannerTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  emailBannerSub: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  tabs: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  tabOn: { backgroundColor: Colors.primary },
  tabTxt: { color: Colors.textTertiary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  tabBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt: { fontSize: 10, fontWeight: FontWeights.bold },
  invCard: { marginBottom: Spacing.sm },
  invRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkBox: { marginRight: Spacing.sm, paddingTop: 2 },
  invInfo: { flex: 1 },
  invTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  invTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  invTitlePaid: { textDecorationLine: 'line-through', color: Colors.textTertiary },
  invSender: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  invMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: BorderRadius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  catTxt: { fontSize: 10, fontWeight: FontWeights.bold },
  invDue: { fontSize: FontSizes.xs },
  invRight: { alignItems: 'flex-end', gap: 4 },
  invAmount: { fontSize: FontSizes.md, fontWeight: FontWeights.black },

  // Premium swipeable invoice card
  invCardPremium: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  invCardOverdue: { borderColor: `${Colors.error}50`, backgroundColor: `${Colors.error}08` },
  invCardPaid: { opacity: 0.7 },
  statusStripe: { width: 4, alignSelf: 'stretch' },
  invBody: { flex: 1, padding: Spacing.md, paddingLeft: Spacing.md },
  invTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statusBadgeBig: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
  },
  statusBadgeBigTxt: { fontSize: 11, fontWeight: FontWeights.black, letterSpacing: 0.3, textTransform: 'uppercase' },
  invAmountBig: {
    color: Colors.text, fontSize: 24, fontWeight: FontWeights.black,
    letterSpacing: -0.8,
  },
  invTitleBig: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold, marginBottom: Spacing.sm },
  invMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  catChipTxt: { fontSize: 10, fontWeight: FontWeights.bold },
  invMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  invDueTxt: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  swipeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
    marginTop: 8, opacity: 0.6,
  },
  swipeHintTxt: { color: Colors.textTertiary, fontSize: 10, fontStyle: 'italic' },

  // Swipe right action (Mark paid / Undo)
  swipeRightAction: {
    width: 120, marginBottom: 0, borderRadius: BorderRadius.xl, overflow: 'hidden',
  },
  swipeGradient: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  swipeTxt: { color: '#FFF', fontSize: 11, fontWeight: FontWeights.bold, letterSpacing: 0.3 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundSecondary, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xl, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  catGrid: { flexDirection: 'row', gap: Spacing.sm },
  catItem: { alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, minWidth: 70 },
  catItemTxt: { color: Colors.textSecondary, fontSize: 10, marginTop: 4 },
  recurringToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  recurringTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  emailSetup: { alignItems: 'center' },
  emailIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  emailTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  emailDesc: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22, maxWidth: 320 },
  emailAddressCard: { marginTop: Spacing.lg, alignItems: 'center', width: '100%', backgroundColor: `${Colors.primary}08`, borderColor: `${Colors.primary}30` },
  emailAddressLabel: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  emailAddress: { color: Colors.primary, fontSize: FontSizes.lg, fontWeight: FontWeights.black, marginTop: 4 },
  emailHint: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 4 },
  stepsTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: Spacing.xl, marginBottom: Spacing.md, alignSelf: 'flex-start' },
  stepRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: Spacing.md },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: `${Colors.primary}20`, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  stepTxt: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm },
  manualBtn: { marginTop: Spacing.md },
  manualTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm },
});
