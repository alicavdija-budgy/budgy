/**
 * GUARDIAN MONEY CHF - Factures & Bills Manager
 * Centralized invoice tracking - never miss a payment
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, Linking, Platform, KeyboardAvoidingView, Image, ActivityIndicator,
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
  scheduleDeadlineRemindersForEntity,
  cancelDeadlineRemindersForEntity,
} from '../../src/services/notifications';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { findInvoiceDuplicate } from '../../src/lib/invoiceDocs';
import { deleteEntityWithCloud } from '../../src/services/cloudDelete';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';
// TÂCHE 5 — consultation des QR-factures : original, QR conservé, export
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import { ensureLocalCopy } from '../../src/services/documentStorage';
import { safeShareFile } from '../../src/lib/safeShare';
import { parseSwissQrBill } from '../../src/services/qrBill';
import { normalizeChfAmount } from '../../src/utils/amount';
import { useTranslation } from '../../src/hooks/useTranslation';

const INVOICE_CATEGORY_KEYS = [
  { id: 'loyer', tKey: 'catRent', icon: 'home', color: '#6366F1' },
  { id: 'electricite', tKey: 'catElectricity', icon: 'flash', color: '#F59E0B' },
  { id: 'internet', tKey: 'catInternet', icon: 'wifi', color: '#0EA5E9' },
  { id: 'telephone', tKey: 'catPhone', icon: 'call', color: '#10B981' },
  { id: 'assurance', tKey: 'catInsurance', icon: 'shield', color: '#EF4444' },
  { id: 'impots', tKey: 'catTaxes', icon: 'document-text', color: '#8B5CF6' },
  { id: 'sante', tKey: 'catHealth', icon: 'medkit', color: '#EC4899' },
  { id: 'serafe', tKey: 'catTv', icon: 'tv', color: '#6B7280' },
  { id: 'parking', tKey: 'catParking', icon: 'car', color: '#F97316' },
  { id: 'autre', tKey: 'catOther', icon: 'receipt', color: '#6B7280' },
] as const;

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

const INVOICE_CATEGORIES_STATIC = INVOICE_CATEGORY_KEYS.map((c) => ({ id: c.id, name: c.id, icon: c.icon, color: c.color }));

// Phase 1: invoices start empty — users add their own
const DEMO_INVOICES: Invoice[] = [];

type Tab = 'all' | 'pending' | 'overdue' | 'paid';

// Map store Invoice (issuer/dueDate?) into local rendering shape
function mapStoreInvoice(i: StoreInvoice): Invoice {
  return {
    id: i.id,
    title: i.title || i.issuer || 'Invoice',
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
  const { t } = useTranslation();
  const INVOICE_CATEGORIES = useMemo(
    () => INVOICE_CATEGORY_KEYS.map((c) => ({ id: c.id, name: t(`invoices.${c.tKey}`), icon: c.icon, color: c.color })),
    [t]
  );

  // ── Connect to store (FIX: was useState local, invoice imports never appeared) ──
  const storeInvoices = useStore((s) => s.invoices);
  const addInvoice = useStore((s) => s.addInvoice);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const deleteInvoiceAction = useStore((s) => s.deleteInvoice);
  const documents = useStore((s) => s.documents);
  const updateDocument = useStore((s) => s.updateDocument);
  const transactions = useStore((s) => s.transactions);
  const addTransaction = useStore((s) => s.addTransaction);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);

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
      Alert.alert(t('invoices.errorTitle'), t('invoices.errorTitleAmount'));
      return;
    }
    const id = `inv_${Date.now()}`;
    const amount = parseFloat(newInvoice.amount);
    addInvoice({
      id,
      title: newInvoice.title,
      issuer: newInvoice.sender || t('invoices.unknownIssuer'),
      amount,
      currency: 'CHF',
      dueDate: newInvoice.dueDate || undefined,
      status: 'pending',
      category: newInvoice.category,
      source: 'manual',
      createdAt: Date.now(),
    });
    // Schedule deadline reminders (J-90 / J-30 / J-7 / J-1) if dueDate present
    if (newInvoice.dueDate) {
      scheduleDeadlineRemindersForEntity(id, {
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
    const becomesPaid = inv.status !== 'paid';
    updateInvoice(id, {
      status: becomesPaid ? 'paid' : 'pending',
      paidAt: becomesPaid ? Date.now() : undefined,
    });
    // v4.0 — RAPPROCHEMENT : une facture payée EST un paiement réel.
    // Si une dépense NON LIÉE du même montant existe déjà ce mois, on PROPOSE
    // de la rapprocher (jamais automatique) au lieu de déduire deux fois.
    const linked = transactions.find((tx) => (tx as any).invoiceId === id);
    if (becomesPaid && !linked) {
      const nowD2 = new Date();
      const candidate = transactions.find((tx) => {
        if ((tx as any).invoiceId || (tx as any).type === 'income') return false;
        if ((tx as any).source && (tx as any).source !== 'manual') return false;
        if (Math.abs((Number(tx.amount) || 0) - (Number(inv.amount) || 0)) > 0.01) return false;
        const d = new Date(tx.date);
        return d.getFullYear() === nowD2.getFullYear() && d.getMonth() === nowD2.getMonth();
      });
      const createTx = () => {
        const nowTs = Date.now();
        addTransaction({
          id: `inv_${id}`,
          title: inv.title,
          amount: Math.abs(Number(inv.amount) || 0),
          date: new Date().toISOString().slice(0, 10),
          category: inv.category || 'autre',
          createdAt: nowTs,
          updatedAt: nowTs,
          synced: false,
          type: 'expense',
          source: 'invoice',
          invoiceId: id,
          // TÂCHE 4 — un paiement en devise étrangère reste dans SA devise :
          // jamais compté comme des CHF au taux 1:1.
          ...((inv.currency || 'CHF').toUpperCase() !== 'CHF' ? { currency: inv.currency } : {}),
        });
      };
      if (candidate) {
        Alert.alert(
          t('invoiceReconcile.title'),
          t('invoiceReconcile.body', { title: candidate.title, amount: String(inv.amount) }),
          [
            {
              text: t('invoiceReconcile.link'),
              onPress: () => updateTransaction(candidate.id, { invoiceId: id, source: 'invoice' } as any),
            },
            { text: t('invoiceReconcile.newTx'), onPress: createTx },
          ],
        );
      } else {
        createTx();
      }
    } else if (!becomesPaid && linked) {
      // Dissocier : si la transaction venait d'un rapprochement manuel, on la
      // délie ; si elle a été créée par la facture, on la retire.
      if (linked.id === `inv_${id}`) deleteTransaction(linked.id);
      else updateTransaction(linked.id, { invoiceId: undefined, source: 'manual' } as any);
    }
    // Phase 4 — hygiène des rappels OS : une facture payée ne doit plus
    // rappeler son échéance ; repasser en « à payer » reprogramme J-90/30/7/1.
    if (becomesPaid) {
      cancelDeadlineRemindersForEntity(id);
    } else if (inv.dueDate) {
      scheduleDeadlineRemindersForEntity(id, {
        type: 'invoice',
        name: inv.title,
        dueDate: inv.dueDate,
        amount: inv.amount,
      });
    }
  };

  const deleteInvoice = (id: string) => {
    Alert.alert(t('invoices.deleteTitle'), t('invoices.deleteBody'), [
      { text: t('invoices.cancel'), style: 'cancel' },
      { text: t('invoices.delete'), style: 'destructive', onPress: () => {
        void performInvoiceDelete(id);
      } },
    ]);
  };

  // Build 82 hotfix — cloud-first deletion (see src/services/cloudDelete.ts).
  // Reminders are cancelled ONLY after the deletion is fully confirmed
  // (cloud row gone + local removal done). On failure the invoice and its
  // reminders are both preserved.
  const performInvoiceDelete = async (id: string) => {
    const res = await deleteEntityWithCloud('invoices', id, () => deleteInvoiceAction(id));
    if (res.ok) {
      cancelDeadlineRemindersForEntity(id).catch(() => {});
    } else if (res.error !== 'delete_in_progress') {
      Alert.alert(t('cloudDelete.failedTitle'), t('cloudDelete.failedBody'));
    }
  };

  // ── CRUD: actions sheet + edit modal ──
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const editingInvoice = useMemo(
    () => storeInvoices.find((i) => i.id === editingInvoiceId) || null,
    [editingInvoiceId, storeInvoices]
  );

  const INVOICE_EDIT_FIELDS: EditField[] = useMemo(() => [
    { key: 'title', label: t('invoices.labelTitle'), type: 'text', icon: 'document-text-outline', placeholder: t('invoices.placeholderTitle'), required: true },
    { key: 'issuer', label: t('invoices.labelIssuer'), type: 'text', icon: 'business-outline', placeholder: t('invoices.placeholderIssuer') },
    { key: 'amount', label: t('invoices.labelAmount'), type: 'number', icon: 'cash-outline', placeholder: t('invoices.placeholderAmount'), required: true },
    { key: 'dueDate', label: t('invoices.labelDueDate'), type: 'text', icon: 'calendar-outline', placeholder: t('invoices.placeholderDueDate') },
    { key: 'category', label: t('invoices.labelCategory'), type: 'select', options: INVOICE_CATEGORIES.map((c) => ({ value: c.id, label: c.name, color: c.color, icon: c.icon })) },
  ], [t, INVOICE_CATEGORIES]);

  const handleEditInvoiceSubmit = (values: Record<string, any>) => {
    if (!editingInvoice) return;
    const amount = parseFloat(String(values.amount).replace(',', '.')) || 0;
    updateInvoice(editingInvoice.id, {
      title: String(values.title || '').trim() || editingInvoice.title,
      issuer: String(values.issuer || '').trim() || editingInvoice.issuer,
      amount,
      dueDate: values.dueDate || undefined,
      category: values.category || editingInvoice.category,
    });
    // Reschedule reminders cleanly
    if (values.dueDate) {
      scheduleDeadlineRemindersForEntity(editingInvoice.id, {
        type: 'invoice',
        name: String(values.title || editingInvoice.title),
        dueDate: values.dueDate,
        amount,
      }).catch(() => {});
    } else {
      cancelDeadlineRemindersForEntity(editingInvoice.id).catch(() => {});
    }
    setEditingInvoiceId(null);
  };

  // ── TÂCHE 5 — document original / QR conservé / montant à compléter ──
  const [docView, setDocView] = useState<{ uri: string; isPdf: boolean } | null>(null);
  const [qrView, setQrView] = useState<{ payload: string; hasOriginal: boolean } | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeAmt, setCompleteAmt] = useState('');
  const [recoveringDoc, setRecoveringDoc] = useState(false);
  const completingBusy = useRef(false);
  // P0 — devise RÉELLE du QR (CHF ou EUR) relue depuis le payload conservé et
  // AFFICHÉE avant confirmation — jamais de conversion implicite.
  const completingCurrency = useMemo(() => {
    const d = documents.find((x) => x.id === completingId);
    const p = (d as any)?.spcPayload as string | undefined;
    if (p) { try { return parseSwissQrBill(p).currency; } catch {} }
    return 'CHF';
  }, [documents, completingId]);

  const invDocOf = (inv: any) => documents.find((d) => d.id === inv.documentId);
  /** Ouvre l'ORIGINAL (jamais un QR reconstitué) : local → sinon récupération
   *  cloud VÉRIFIÉE (Tâche 3) → sinon erreur explicite. */
  const openOriginal = async (inv: any) => {
    const d = invDocOf(inv);
    if (!d || (!d.pdfUri && !d.fileUri && !(d as any).remotePath)) {
      Alert.alert(t('invoiceDocs.noDocTitle'), (d as any)?.spcPayload ? t('invoiceDocs.qrOnlyBody') : t('invoiceDocs.noDocBody'));
      return;
    }
    setRecoveringDoc(true);
    try {
      const res = await ensureLocalCopy(d.id);
      if (!res) { Alert.alert(t('invoiceDocs.noDocTitle'), t('docSpaces.recoverFailed')); return; }
      const isPdf = (d.mimeType || '').includes('pdf') || res.uri.toLowerCase().includes('.pdf');
      if (Platform.OS === 'web') { try { window.open(res.uri, '_blank'); } catch {} return; }
      setDocView({ uri: res.uri, isPdf });
    } finally { setRecoveringDoc(false); }
  };
  const shareOriginal = async (inv: any) => {
    const d = invDocOf(inv);
    if (!d || (!d.pdfUri && !d.fileUri && !(d as any).remotePath)) {
      Alert.alert(t('invoiceDocs.noDocTitle'), t('invoiceDocs.noDocBody'));
      return;
    }
    setRecoveringDoc(true);
    try {
      const res = await ensureLocalCopy(d.id);
      if (!res) { Alert.alert(t('invoiceDocs.noDocTitle'), t('docSpaces.recoverFailed')); return; }
      const isPdf = (d.mimeType || '').includes('pdf') || res.uri.toLowerCase().includes('.pdf');
      await safeShareFile(res.uri, { mimeType: d.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'), name: d.title || 'facture', dialogTitle: d.title } as any);
    } finally { setRecoveringDoc(false); }
  };
  const showQr = (inv: any) => {
    const d = invDocOf(inv);
    const payload = inv.qrPayload || (d as any)?.spcPayload;
    if (!payload) return;
    setQrView({ payload: String(payload), hasOriginal: !!(d && (d.pdfUri || d.fileUri || (d as any).remotePath)) });
  };

  // §6 — « Montant à compléter » : documents facture conservés SANS obligation
  const pendingAmountDocs = useMemo(
    () => documents.filter((d) =>
      (d as any).documentType === 'invoice' &&
      (d.tags || []).includes('toComplete') &&
      !storeInvoices.some((i: any) => i.documentId === d.id)),
    [documents, storeInvoices],
  );
  const completeInvoice = () => {
    if (completingBusy.current) return; // idempotence : double appui = UNE seule facture
    const d = documents.find((x) => x.id === completingId);
    if (!d) return;
    // Idempotence : une facture DÉJÀ liée à ce document → aucune re-création,
    // on retire simplement le statut « à compléter ».
    const linked = storeInvoices.find((i: any) => i.documentId === d.id);
    if (linked) {
      updateDocument(d.id, { tags: (d.tags || []).filter((x) => x !== 'toComplete') } as any);
      setCompletingId(null);
      setCompleteAmt('');
      Alert.alert(t('invoiceDocs.dupTitle'), t('invoiceDocs.alreadyLinked', { title: linked.title || '' }));
      return;
    }
    const amt = normalizeChfAmount(completeAmt);
    if (amt === null || amt <= 0) { Alert.alert(t('invoiceDocs.invalidAmount')); return; }
    // P0 — le payload SPC est RELU à la complétion : devise réelle (CHF ou
    // EUR) appliquée telle quelle — JAMAIS de conversion implicite EUR→CHF.
    let iban: string | undefined; let reference: string | undefined; let issuer = d.title;
    let currency: 'CHF' | 'EUR' = 'CHF';
    const payload = (d as any).spcPayload as string | undefined;
    if (payload) {
      try {
        const b = parseSwissQrBill(payload);
        iban = b.iban;
        reference = b.reference || undefined;
        issuer = b.creditor.name.slice(0, 80) || d.title;
        currency = b.currency;
      } catch {}
    }
    const create = () => {
      if (completingBusy.current) return;
      completingBusy.current = true;
      // L'obligation financière n'entre dans le moteur QUE maintenant,
      // montant confirmé par l'utilisateur (jamais de CHF 0 implicite).
      addInvoice({
        id: `inv_${Date.now()}`,
        title: d.title,
        issuer,
        amount: Math.round(amt * 100) / 100,
        currency,
        iban,
        reference,
        category: 'autre',
        status: 'pending',
        source: 'scan',
        createdAt: Date.now(),
        documentId: d.id,
        qrPayload: payload,
      } as any);
      // Le statut « à compléter » n'est retiré qu'APRÈS l'enregistrement.
      updateDocument(d.id, { tags: (d.tags || []).filter((x) => x !== 'toComplete') } as any);
      setCompletingId(null);
      setCompleteAmt('');
      Alert.alert(t('invoiceDocs.completedTitle'), t('invoiceDocs.completedBody'));
      setTimeout(() => { completingBusy.current = false; }, 600);
    };
    // P0 — recherche de doublon AVANT la création (référence QRR/SCOR, sinon
    // IBAN + créancier + montant — jamais le montant seul).
    const dup = findInvoiceDuplicate(storeInvoices as any, { reference, iban, issuer, amount: amt });
    if (dup) {
      Alert.alert(
        t('invoiceDocs.dupTitle'),
        t('invoiceDocs.dupBody', { title: (dup as any).title || (dup as any).issuer || '', amount: `${currency} ${amt.toFixed(2)}` }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('invoiceDocs.dupConfirm'), style: 'destructive', onPress: create },
        ],
      );
      return;
    }
    create();
  };

  const getStatusColor = (s: string) => s === 'paid' ? theme.success : s === 'overdue' ? theme.error : theme.warning;
  const getStatusLabel = (s: string) => s === 'paid' ? t('invoices.statusPaid') : s === 'overdue' ? t('invoices.statusOverdue') : t('invoices.statusPending');
  const getCat = (id: string) => INVOICE_CATEGORIES.find(c => c.id === id) || INVOICE_CATEGORIES[9];

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'all', label: t('invoices.tabAll'), count: invoices.length, color: theme.text },
    { key: 'pending', label: t('invoices.tabPending'), count: pendingCount, color: theme.warning },
    { key: 'overdue', label: t('invoices.tabOverdue'), count: overdueCount, color: theme.error },
    { key: 'paid', label: t('invoices.tabPaid'), count: invoices.filter(i => i.status === 'paid').length, color: theme.success },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="invoices-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('invoices.title')}</Text>
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
              <Text style={styles.summaryLabel}>{t('invoices.summaryPending')}</Text>
              <Text style={[styles.summaryAmt, { color: theme.warning }]}>{formatNumber(totalPending)}</Text>
              <Text style={styles.summaryCount}>{pendingCount} {pendingCount > 1 ? t('invoices.invoiceMany') : t('invoices.invoiceOne')}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="alert-circle" size={20} color={theme.error} />
              <Text style={styles.summaryLabel}>{t('invoices.summaryOverdue')}</Text>
              <Text style={[styles.summaryAmt, { color: theme.error }]}>{formatNumber(totalOverdue)}</Text>
              <Text style={styles.summaryCount}>{overdueCount} {overdueCount > 1 ? t('invoices.invoiceMany') : t('invoices.invoiceOne')}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="checkmark-circle" size={20} color={theme.success} />
              <Text style={styles.summaryLabel}>{t('invoices.summaryPaid')}</Text>
              <Text style={[styles.summaryAmt, { color: theme.success }]}>{formatNumber(totalPaid)}</Text>
            </View>
          </View>
        </Card>

        {/* Import banner — generic, no mail/Gmail reference */}
        <TouchableOpacity style={styles.emailBanner} onPress={() => router.push('/more/email-import?mode=invoice')}>
          <View style={styles.emailBannerIcon}>
            <Ionicons name="scan" size={24} color={theme.primary} />
          </View>
          <View style={styles.emailBannerContent}>
            <Text style={styles.emailBannerTitle}>{t('invoices.importInvoiceTitle')}</Text>
            <Text style={styles.emailBannerSub}>{t('invoices.importInvoiceSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabs}>
          {tabs.map(tab => (
            <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabOn]} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.tabTxt, activeTab === tab.key && { color: theme.text }]}>{tab.label}</Text>
              {tab.count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: activeTab === tab.key ? `${tab.color}30` : theme.card }]}>
                  <Text style={[styles.tabBadgeTxt, { color: activeTab === tab.key ? tab.color : theme.textTertiary }]}>{tab.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Invoice List with swipeable actions */}
        {pendingAmountDocs.length > 0 && (
          <View style={{ marginBottom: Spacing.md }}>
            {pendingAmountDocs.map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => { setCompletingId(d.id); setCompleteAmt(''); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.warning, backgroundColor: `${theme.warning}14`, marginBottom: 8 }}
                testID={`complete-invoice-${d.id}`}
              >
                <Ionicons name="qr-code-outline" size={20} color={theme.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>{d.title}</Text>
                  <Text style={{ color: theme.warning, fontSize: 12, fontWeight: '600' }}>{t('invoiceDocs.toCompleteLabel')}</Text>
                </View>
                <Ionicons name="create-outline" size={18} color={theme.warning} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon="receipt-outline" title={t('invoices.emptyTitle')} subtitle={t('invoices.emptySub')} action={{ label: t('invoices.emptyAdd'), onPress: () => setShowAdd(true) }} />
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
                    {isPaid ? t('invoices.swipeUndo') : t('invoices.swipeMarkPaid')}
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
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={() => setActionsCtx({
                      id: inv.id,
                      title: inv.title,
                      subtitle: `CHF ${formatNumber(inv.amount, 2)} · ${inv.dueDate || t('invoices.noDueDate')}`,
                      accent: statusColor,
                    })}
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

                      {/* TÂCHE 5 — original ≠ QR reconstitué, jamais confondus */}
                      {((inv as any).documentId || (inv as any).qrPayload) && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          {(() => {
                            const d = invDocOf(inv);
                            const hasFile = !!(d && (d.pdfUri || d.fileUri || (d as any).remotePath));
                            return (
                              <>
                                {hasFile && (
                                  <TouchableOpacity onPress={() => openOriginal(inv)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: `${theme.primary}15` }} testID={`inv-open-original-${inv.id}`}>
                                    {recoveringDoc ? <ActivityIndicator size={12} color={theme.primary} /> : <Ionicons name="document-attach-outline" size={13} color={theme.primary} />}
                                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>{t('invoiceDocs.originalDoc')}</Text>
                                  </TouchableOpacity>
                                )}
                                {hasFile && (
                                  <TouchableOpacity onPress={() => shareOriginal(inv)} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: `${theme.primary}15` }} testID={`inv-share-${inv.id}`}>
                                    <Ionicons name="share-outline" size={13} color={theme.primary} />
                                  </TouchableOpacity>
                                )}
                                {!!((inv as any).qrPayload || (d as any)?.spcPayload) && (
                                  <TouchableOpacity onPress={() => showQr(inv)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: `${theme.textTertiary}20` }} testID={`inv-show-qr-${inv.id}`}>
                                    <Ionicons name="qr-code-outline" size={13} color={theme.textSecondary} />
                                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>{hasFile ? t('invoiceDocs.showQr') : t('invoiceDocs.qrKept')}</Text>
                                  </TouchableOpacity>
                                )}
                              </>
                            );
                          })()}
                        </View>
                      )}

                      {/* Swipe hint (only on pending/overdue) */}
                      {!isPaid && (
                        <View style={styles.swipeHint}>
                          <Ionicons name="arrow-back" size={11} color={theme.textTertiary} />
                          <Text style={styles.swipeHintTxt}>{t('invoices.swipeHint')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  </TouchableOpacity>
                </Swipeable>
              </Animated.View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* TÂCHE 5 — visionneuse de l'ORIGINAL (PDF/photo) */}
      <Modal visible={!!docView} animationType="slide" onRequestClose={() => setDocView(null)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 54 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t('invoiceDocs.originalDoc')}</Text>
            <TouchableOpacity onPress={() => setDocView(null)} testID="inv-doc-close"><Ionicons name="close" size={26} color={theme.text} /></TouchableOpacity>
          </View>
          {docView?.isPdf ? (
            <WebView source={{ uri: docView.uri }} style={{ flex: 1 }} originWhitelist={['*']} allowFileAccess allowingReadAccessToURL={docView.uri} />
          ) : docView ? (
            <Image source={{ uri: docView.uri }} style={{ flex: 1 }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {/* TÂCHE 5 — QR reconstitué depuis le payload SPC (JAMAIS « original ») */}
      <Modal visible={!!qrView} transparent animationType="fade" onRequestClose={() => setQrView(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, alignItems: 'center', maxWidth: 340 }}>
            {!!qrView && <QRCode value={qrView.payload} size={250} ecl="M" />}
            <Text style={{ marginTop: 12, fontWeight: '800', color: '#111' }}>{t('invoiceDocs.qrKept')}</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: '#555', textAlign: 'center' }}>
              {qrView?.hasOriginal ? t('invoiceDocs.qrRebuiltNote') : t('invoiceDocs.qrOnlyBody')}
            </Text>
            <TouchableOpacity onPress={() => setQrView(null)} style={{ marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111' }} testID="inv-qr-close">
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TÂCHE 5 §6 — compléter le montant (l'obligation naît ICI seulement) */}
      <Modal visible={!!completingId} transparent animationType="fade" onRequestClose={() => setCompletingId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 20 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t('invoiceDocs.completeTitle')}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>{t('invoiceDocs.completeBody')}</Text>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '800', marginTop: 8 }} testID="complete-currency">
              {t('invoiceDocs.completeCurrency', { currency: completingCurrency })}
            </Text>
            <TextInput
              value={completeAmt}
              onChangeText={setCompleteAmt}
              placeholder={`${completingCurrency} 0.00`}
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              style={{ marginTop: 12, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: 12, padding: 12, color: theme.text, fontSize: 18, fontWeight: '700' }}
              testID="complete-amount-input"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setCompletingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.cardBorder, alignItems: 'center' }}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={completeInvoice} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' }} testID="complete-amount-save">
                <Text style={{ color: '#06281e', fontWeight: '800' }}>{t('invoiceDocs.completeSave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Invoice Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('invoices.newInvoice')}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>{t('invoices.labelTitle')}</Text>
            <TextInput style={styles.input} value={newInvoice.title} onChangeText={txt => setNewInvoice(p => ({ ...p, title: txt }))} placeholder={t('invoices.placeholderTitle')} placeholderTextColor={theme.textTertiary} />

            <Text style={styles.inputLabel}>{t('invoices.labelIssuer')}</Text>
            <TextInput style={styles.input} value={newInvoice.sender} onChangeText={txt => setNewInvoice(p => ({ ...p, sender: txt }))} placeholder={t('invoices.placeholderIssuer')} placeholderTextColor={theme.textTertiary} />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{t('invoices.labelAmount')}</Text>
                <TextInput style={styles.input} value={newInvoice.amount} onChangeText={txt => setNewInvoice(p => ({ ...p, amount: txt }))} placeholder={t('invoices.placeholderAmount')} placeholderTextColor={theme.textTertiary} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>{t('invoices.labelDueDate')}</Text>
                <TextInput style={styles.input} value={newInvoice.dueDate} onChangeText={txt => setNewInvoice(p => ({ ...p, dueDate: txt }))} placeholder={t('invoices.placeholderDueDate')} placeholderTextColor={theme.textTertiary} />
              </View>
            </View>

            <Text style={styles.inputLabel}>{t('invoices.labelCategory')}</Text>
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
              <Text style={styles.recurringTxt}>{t('invoices.recurringLabel')}</Text>
            </TouchableOpacity>

            <Button title={t('invoices.addInvoiceCta')} onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Email Setup Modal — REMOVED: replaced by /more/email-import (3-methods screen) */}

      {/* Generic CRUD modals */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingInvoiceId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) void performInvoiceDelete(id);
        }}
        deleteConfirmTitle={t('invoices.deleteConfirmTitle')}
        deleteConfirmMessage={t('invoices.deleteConfirmMsg')}
      />
      <EntityEditModal
        visible={!!editingInvoice}
        onClose={() => setEditingInvoiceId(null)}
        title={t('invoices.editInvoiceTitle')}
        fields={INVOICE_EDIT_FIELDS}
        initialValues={{
          title: editingInvoice?.title || '',
          issuer: editingInvoice?.issuer || '',
          amount: editingInvoice?.amount?.toString() || '',
          dueDate: editingInvoice?.dueDate || '',
          category: editingInvoice?.category || 'autre',
        }}
        onSubmit={handleEditInvoiceSubmit}
      />
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
