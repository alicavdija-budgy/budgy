/**
 * GUARDIAN MONEY CHF - Factures & Bills Manager
 * Centralized invoice tracking - never miss a payment
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { Card, Button, Badge, EmptyState, ProgressBar } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

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

// Sample invoices for demo
const DEMO_INVOICES: Invoice[] = [
  { id: 'inv1', title: 'Loyer avril 2026', sender: 'Régie du Lac SA', amount: 1450, dueDate: '30.04.2026', status: 'pending', category: 'loyer', recurring: true, createdAt: Date.now() },
  { id: 'inv2', title: 'Facture Swisscom', sender: 'Swisscom SA', amount: 89.90, dueDate: '15.04.2026', status: 'overdue', category: 'telephone', recurring: true, createdAt: Date.now() - 86400000 * 5 },
  { id: 'inv3', title: 'Prime CSS avril', sender: 'CSS Assurance', amount: 389.50, dueDate: '25.04.2026', status: 'paid', category: 'assurance', recurring: true, createdAt: Date.now() - 86400000 * 3 },
  { id: 'inv4', title: 'Électricité Q1 2026', sender: 'SIL Lausanne', amount: 245.80, dueDate: '20.04.2026', status: 'pending', category: 'electricite', recurring: false, createdAt: Date.now() - 86400000 * 2 },
  { id: 'inv5', title: 'Serafe redevance', sender: 'Serafe AG', amount: 335.00, dueDate: '01.05.2026', status: 'pending', category: 'serafe', recurring: false, note: 'Facture annuelle', createdAt: Date.now() - 86400000 },
];

type Tab = 'all' | 'pending' | 'overdue' | 'paid';

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>(DEMO_INVOICES);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showEmailSetup, setShowEmailSetup] = useState(false);
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
    setInvoices(prev => [{
      id: `inv_${Date.now()}`,
      title: newInvoice.title,
      sender: newInvoice.sender || 'Inconnu',
      amount: parseFloat(newInvoice.amount),
      dueDate: newInvoice.dueDate || new Date().toLocaleDateString('fr-CH'),
      status: 'pending',
      category: newInvoice.category,
      recurring: newInvoice.recurring,
      createdAt: Date.now(),
    }, ...prev]);
    setNewInvoice({ title: '', sender: '', amount: '', dueDate: '', category: 'autre', recurring: false });
    setShowAdd(false);
  };

  const toggleStatus = (id: string) => {
    setInvoices(prev => prev.map(i =>
      i.id === id ? { ...i, status: i.status === 'paid' ? 'pending' : 'paid' } : i
    ));
  };

  const deleteInvoice = (id: string) => {
    Alert.alert('Supprimer', 'Confirmer la suppression?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setInvoices(prev => prev.filter(i => i.id !== id)) },
    ]);
  };

  const getStatusColor = (s: string) => s === 'paid' ? Colors.success : s === 'overdue' ? Colors.error : Colors.warning;
  const getStatusLabel = (s: string) => s === 'paid' ? 'Payée' : s === 'overdue' ? 'En retard' : 'À payer';
  const getCat = (id: string) => INVOICE_CATEGORIES.find(c => c.id === id) || INVOICE_CATEGORIES[9];

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'Toutes', count: invoices.length, color: Colors.text },
    { key: 'pending', label: 'À payer', count: pendingCount, color: Colors.warning },
    { key: 'overdue', label: 'En retard', count: overdueCount, color: Colors.error },
    { key: 'paid', label: 'Payées', count: invoices.filter(i => i.status === 'paid').length, color: Colors.success },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="invoices-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Factures</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Ionicons name="time" size={20} color={Colors.warning} />
              <Text style={styles.summaryLabel}>À payer</Text>
              <Text style={[styles.summaryAmt, { color: Colors.warning }]}>{formatNumber(totalPending)}</Text>
              <Text style={styles.summaryCount}>{pendingCount} facture{pendingCount > 1 ? 's' : ''}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
              <Text style={styles.summaryLabel}>En retard</Text>
              <Text style={[styles.summaryAmt, { color: Colors.error }]}>{formatNumber(totalOverdue)}</Text>
              <Text style={styles.summaryCount}>{overdueCount} facture{overdueCount > 1 ? 's' : ''}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.summaryLabel}>Payées</Text>
              <Text style={[styles.summaryAmt, { color: Colors.success }]}>{formatNumber(totalPaid)}</Text>
            </View>
          </View>
        </Card>

        {/* Email Sync Banner */}
        <TouchableOpacity style={styles.emailBanner} onPress={() => setShowEmailSetup(true)}>
          <View style={styles.emailBannerIcon}>
            <Ionicons name="mail" size={24} color={Colors.primary} />
          </View>
          <View style={styles.emailBannerContent}>
            <Text style={styles.emailBannerTitle}>Import depuis votre email</Text>
            <Text style={styles.emailBannerSub}>Retrouvez toutes vos factures au même endroit</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabs}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setActiveTab(t.key)}>
              <Text style={[styles.tabTxt, activeTab === t.key && { color: Colors.text }]}>{t.label}</Text>
              {t.count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: activeTab === t.key ? `${t.color}30` : Colors.card }]}>
                  <Text style={[styles.tabBadgeTxt, { color: activeTab === t.key ? t.color : Colors.textTertiary }]}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Invoice List */}
        {filtered.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Aucune facture" subtitle="Ajoutez vos factures pour ne rien oublier" action={{ label: 'Ajouter', onPress: () => setShowAdd(true) }} />
        ) : (
          filtered.map(inv => {
            const cat = getCat(inv.category);
            return (
              <Card key={inv.id} style={[styles.invCard, inv.status === 'overdue' && { borderColor: `${Colors.error}40` }]}>
                <View style={styles.invRow}>
                  <TouchableOpacity style={styles.checkBox} onPress={() => toggleStatus(inv.id)}>
                    <Ionicons
                      name={inv.status === 'paid' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={28}
                      color={getStatusColor(inv.status)}
                    />
                  </TouchableOpacity>
                  <View style={styles.invInfo}>
                    <View style={styles.invTitleRow}>
                      <Text style={[styles.invTitle, inv.status === 'paid' && styles.invTitlePaid]}>{inv.title}</Text>
                      {inv.recurring && <Ionicons name="repeat" size={14} color={Colors.textTertiary} />}
                    </View>
                    <Text style={styles.invSender}>{inv.sender}</Text>
                    <View style={styles.invMeta}>
                      <View style={[styles.catBadge, { backgroundColor: `${cat.color}15` }]}>
                        <Ionicons name={cat.icon as any} size={12} color={cat.color} />
                        <Text style={[styles.catTxt, { color: cat.color }]}>{cat.name}</Text>
                      </View>
                      <Text style={[styles.invDue, { color: inv.status === 'overdue' ? Colors.error : Colors.textTertiary }]}>
                        {inv.status === 'overdue' ? '⚠️ ' : '📅 '}{inv.dueDate}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.invRight}>
                    <Text style={[styles.invAmount, { color: getStatusColor(inv.status) }]}>
                      {formatNumber(inv.amount, 2)}
                    </Text>
                    <Badge text={getStatusLabel(inv.status)} color={getStatusColor(inv.status)} size="sm" />
                    <TouchableOpacity onPress={() => deleteInvoice(inv.id)} style={{ marginTop: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Invoice Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle facture</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Titre</Text>
            <TextInput style={styles.input} value={newInvoice.title} onChangeText={t => setNewInvoice(p => ({ ...p, title: t }))} placeholder="ex: Loyer mai 2026" placeholderTextColor={Colors.textTertiary} />

            <Text style={styles.inputLabel}>Émetteur</Text>
            <TextInput style={styles.input} value={newInvoice.sender} onChangeText={t => setNewInvoice(p => ({ ...p, sender: t }))} placeholder="ex: Régie du Lac SA" placeholderTextColor={Colors.textTertiary} />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Montant (CHF)</Text>
                <TextInput style={styles.input} value={newInvoice.amount} onChangeText={t => setNewInvoice(p => ({ ...p, amount: t }))} placeholder="0.00" placeholderTextColor={Colors.textTertiary} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Échéance</Text>
                <TextInput style={styles.input} value={newInvoice.dueDate} onChangeText={t => setNewInvoice(p => ({ ...p, dueDate: t }))} placeholder="30.04.2026" placeholderTextColor={Colors.textTertiary} />
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
              <Ionicons name={newInvoice.recurring ? 'checkbox' : 'square-outline'} size={22} color={Colors.primary} />
              <Text style={styles.recurringTxt}>Facture récurrente (mensuelle)</Text>
            </TouchableOpacity>

            <Button title="Ajouter la facture" onPress={handleAdd} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </View>
        </View>
      </Modal>

      {/* Email Setup Modal */}
      <Modal visible={showEmailSetup} animationType="slide" transparent onRequestClose={() => setShowEmailSetup(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import depuis email</Text>
              <TouchableOpacity onPress={() => setShowEmailSetup(false)}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
            </View>

            <View style={styles.emailSetup}>
              <View style={styles.emailIcon}><Ionicons name="mail" size={48} color={Colors.primary} /></View>
              <Text style={styles.emailTitle}>Centralisez vos factures</Text>
              <Text style={styles.emailDesc}>
                Transférez vos factures reçues par email à l'adresse ci-dessous. Elles seront automatiquement ajoutées à votre liste.
              </Text>

              <Card style={styles.emailAddressCard}>
                <Text style={styles.emailAddressLabel}>Votre adresse Guardian</Text>
                <Text style={styles.emailAddress}>factures@guardian-money.ch</Text>
                <Text style={styles.emailHint}>Transférez vos factures à cette adresse</Text>
              </Card>

              <Text style={styles.stepsTitle}>Comment ça marche</Text>
              {[
                { step: '1', title: 'Recevez une facture par email', icon: 'mail-open' },
                { step: '2', title: 'Transférez-la à factures@guardian-money.ch', icon: 'arrow-redo' },
                { step: '3', title: 'Guardian extrait le montant et l\'échéance', icon: 'scan' },
                { step: '4', title: 'Recevez un rappel avant la date limite', icon: 'notifications' },
              ].map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepCircle}><Text style={styles.stepNum}>{s.step}</Text></View>
                  <Ionicons name={s.icon as any} size={18} color={Colors.primary} style={{ marginHorizontal: Spacing.sm }} />
                  <Text style={styles.stepTxt}>{s.title}</Text>
                </View>
              ))}

              <Button title="Configurer maintenant" onPress={() => {
                setShowEmailSetup(false);
                Alert.alert('Bientôt disponible', 'La synchronisation email sera disponible dans la prochaine mise à jour. En attendant, ajoutez vos factures manuellement.');
              }} fullWidth size="lg" variant="primary" style={{ marginTop: Spacing.xl }} />

              <TouchableOpacity style={styles.manualBtn} onPress={() => { setShowEmailSetup(false); setShowAdd(true); }}>
                <Text style={styles.manualTxt}>Ajouter manuellement</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
