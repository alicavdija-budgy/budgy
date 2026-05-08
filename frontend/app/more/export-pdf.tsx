/**
 * GUARDIAN MONEY CHF - Export PDF Screen
 * Generate and share A4 expense reports with TVA 8.1%
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildPdfHtml } from '../../src/utils/localPdf';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, Badge } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const periodLabel = (p: 'month' | 'quarter' | 'year' | 'all') => {
  const m = new Date().toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
  if (p === 'month') return m;
  if (p === 'quarter') return '3 derniers mois';
  if (p === 'year') return new Date().getFullYear().toString();
  return 'Tout l\'historique';
};

type Source = 'pro' | 'all' | 'tickets' | 'documents';
type Period = 'month' | 'quarter' | 'year' | 'all';

export default function ExportPDFScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, preferences, proExpenses, transactions, documents } = useStore();

  const [mode, setMode] = useState<'employee' | 'independent'>('employee');
  const [source, setSource] = useState<Source>('pro');
  const [period, setPeriod] = useState<Period>('month');
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  // Period filter
  const filterByPeriod = (date: string | number) => {
    const d = typeof date === 'string' ? new Date(date).getTime() : date;
    if (!d || isNaN(d)) return true;
    const now = Date.now();
    const day = 86400000;
    if (period === 'month') return now - d < 31 * day;
    if (period === 'quarter') return now - d < 92 * day;
    if (period === 'year') return now - d < 366 * day;
    return true;
  };

  const allTransactions = useMemo(() => transactions.filter(t => filterByPeriod(t.date)), [transactions, period]);
  const allProExpenses = useMemo(() => proExpenses.filter(e => filterByPeriod(e.date)), [proExpenses, period]);
  const allDocuments = useMemo(() => documents.filter(d => filterByPeriod(d.createdAt)), [documents, period]);
  const allTickets = useMemo(() => {
    // Tickets = transactions/proExpenses qui ont un receipt photo
    const txWithReceipt = allTransactions.filter((t: any) => t.receipt);
    const proWithReceipt = allProExpenses.filter((p: any) => p.receipt);
    return [...txWithReceipt, ...proWithReceipt];
  }, [allTransactions, allProExpenses]);

  const selectedExpenses = useMemo(() => {
    const list = source === 'pro' ? allProExpenses
              : source === 'all' ? allTransactions
              : source === 'tickets' ? allTickets
              : []; // documents handled separately
    return list.map((e: any) => ({
      date: e.date,
      title: e.title,
      amount: e.amount,
      category: e.category,
      justification: e.justification || '-',
      receipt: e.receipt || undefined,
    }));
  }, [source, allProExpenses, allTransactions, allTickets]);

  const selectedDocuments = source === 'documents' ? allDocuments : [];

  const totalHT = selectedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalTVA = Math.round(totalHT * 8.1) / 100;
  const totalTTC = totalHT + totalTVA;

  const handleExport = async () => {
    if (selectedExpenses.length === 0 && selectedDocuments.length === 0) {
      Alert.alert(
        'Aucune donnée à exporter',
        'Aucune donnée à exporter pour cette période. Modifiez la période ou ajoutez des dépenses.'
      );
      return;
    }

    setLoading(true);
    const TAG = '[export-pdf]';
    try {
      const titleOverride =
        source === 'tickets' ? `Tickets & reçus — ${periodLabel(period)}` :
        source === 'documents' ? `Documents scannés — ${periodLabel(period)}` :
        source === 'all' ? `Toutes les dépenses — ${periodLabel(period)}` :
        `Note de frais — ${periodLabel(period)}`;

      const payload = {
        user_name: user?.name || 'Utilisateur',
        company: mode === 'employee' ? 'Mon Entreprise SA' : user?.name || 'Indépendant',
        expenses: selectedExpenses,
        mode,
        canton: preferences.canton,
        period: periodLabel(period),
        include_receipts: includeReceipts,
        documents: selectedDocuments.map((d: any) => ({
          title: d.title,
          category: d.category,
          imageBase64: d.imageBase64,
          pages: d.pages || [d.imageBase64],
        })),
        title_override: titleOverride,
      };

      // ── 1. Generate HTML LOCALLY (works offline, fastest path) ──
      let html: string;
      try {
        html = buildPdfHtml(payload as any);
        console.log(`${TAG} local HTML generated (${html.length} chars)`);
      } catch (genErr: any) {
        console.error(`${TAG} local generation failed:`, genErr);
        throw new Error('Erreur lors de la création du PDF.');
      }

      // ── 2. Try to enrich via backend if available (better template) ──
      // Non-blocking: if backend fails or is slow, we keep the local HTML.
      if (BACKEND_URL) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 6000); // 6s budget
          const resp = await fetch(`${BACKEND_URL}/api/export/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.html && data.html.length > 200) {
              html = data.html;
              console.log(`${TAG} backend HTML used (${html.length} chars)`);
            }
          }
        } catch (netErr: any) {
          console.warn(`${TAG} backend unreachable, keeping local HTML:`, netErr?.message);
        }
      }

      // ── 3. HTML → PDF (always local, no internet needed) ──
      console.log(`${TAG} printing to PDF...`);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      console.log(`${TAG} PDF generated at`, uri);

      // ── 4. Native share ──
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: titleOverride,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF généré', `Fichier sauvegardé : ${uri}`);
      }

      setPdfReady(true);
    } catch (error: any) {
      console.error('[export-pdf] FATAL:', error);
      Alert.alert(
        'Export impossible',
        error?.message || 'Une erreur est survenue lors de la génération du PDF. Réessayez.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="export-pdf-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Export PDF</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Preview */}
        <Card style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="flash" size={24} color={Colors.primary} />
            <Text style={styles.previewTitle}>BUDGY</Text>
          </View>
          <Text style={styles.previewSubtitle}>Note de frais — {new Date().toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })}</Text>
          <View style={styles.previewMeta}>
            <Text style={styles.previewMetaTxt}>{user?.name || 'Utilisateur'}</Text>
            <Text style={styles.previewMetaTxt}>Canton {preferences.canton}</Text>
          </View>
        </Card>

        {/* Mode Selection */}
        <Text style={styles.sectionTitle}>Mode</Text>
        <View style={styles.modeRow}>
          {[
            { value: 'employee' as const, label: 'Employé', icon: 'briefcase', desc: 'Remboursement frais pro' },
            { value: 'independent' as const, label: 'Indépendant', icon: 'person', desc: 'Déduction fiscale' },
          ].map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.modeCard, mode === m.value && styles.modeCardOn]}
              onPress={() => setMode(m.value)}
              testID={`mode-${m.value}`}
            >
              <Ionicons name={m.icon as any} size={24} color={mode === m.value ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.modeLabel, mode === m.value && { color: Colors.primary }]}>{m.label}</Text>
              <Text style={styles.modeDesc}>{m.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Source Selection */}
        <Text style={styles.sectionTitle}>Que souhaitez-vous exporter ?</Text>
        <View style={styles.sourceGrid}>
          {[
            { id: 'pro', label: 'Frais pro', icon: 'briefcase', count: allProExpenses.length, desc: 'Note de frais' },
            { id: 'all', label: 'Toutes dépenses', icon: 'list', count: allTransactions.length, desc: 'Toutes transactions' },
            { id: 'tickets', label: 'Tickets / reçus', icon: 'receipt', count: allTickets.length, desc: 'Avec photos' },
            { id: 'documents', label: 'Documents', icon: 'folder', count: allDocuments.length, desc: 'Classeur scanné' },
          ].map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sourceCard, source === s.id && styles.sourceCardOn]}
              onPress={() => setSource(s.id as Source)}
            >
              <Ionicons name={s.icon as any} size={20} color={source === s.id ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.sourceCardLabel, source === s.id && { color: Colors.primary }]}>{s.label}</Text>
              <Text style={styles.sourceCardCount}>{s.count} {s.count === 1 ? 'élément' : 'éléments'}</Text>
              <Text style={styles.sourceCardDesc}>{s.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period filter */}
        <Text style={styles.sectionTitle}>Période</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.periodRow}>
            {([
              { id: 'month', label: 'Ce mois' },
              { id: 'quarter', label: '3 mois' },
              { id: 'year', label: 'Année' },
              { id: 'all', label: 'Tout' },
            ] as const).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.periodChip, period === p.id && styles.periodChipOn]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[styles.periodTxt, period === p.id && { color: Colors.primary }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Include receipts toggle (only relevant for expense sources) */}
        {(source === 'pro' || source === 'all' || source === 'tickets') && (
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>📎 Joindre les photos / scans</Text>
              <Text style={styles.toggleDesc}>Annexe avec tous les tickets en pleine page</Text>
            </View>
            <Switch
              value={includeReceipts}
              onValueChange={setIncludeReceipts}
              trackColor={{ false: '#374151', true: Colors.primary }}
              thumbColor="#FFF"
            />
          </View>
        )}

        {/* Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Récapitulatif</Text>
          {source === 'documents' ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Documents scannés</Text>
                <Text style={styles.summaryValue}>{selectedDocuments.length} fichier(s)</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Pages totales</Text>
                <Text style={styles.summaryValue}>
                  {selectedDocuments.reduce((acc: number, d: any) => acc + (d.pages?.length || 1), 0)}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Dépenses</Text>
                <Text style={styles.summaryValue}>{selectedExpenses.length} lignes</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total HT</Text>
                <Text style={styles.summaryValue}>CHF {formatNumber(totalHT, 2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>TVA 8.1%</Text>
                <Text style={styles.summaryValue}>CHF {formatNumber(totalTVA, 2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Total TTC</Text>
                <Text style={styles.totalValue}>CHF {formatNumber(totalTTC, 2)}</Text>
              </View>
            </>
          )}
        </Card>

        {/* Export Actions */}
        <Button
          title={loading ? 'Génération...' : 'Générer et partager le PDF'}
          onPress={handleExport}
          fullWidth
          size="lg"
          loading={loading}
          icon="document-text"
          style={{ marginBottom: Spacing.md }}
        />

        {pdfReady && (
          <Card style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <Text style={styles.successTxt}>PDF généré avec succès!</Text>
          </Card>
        )}

        {/* Info */}
        <Card style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color={Colors.info} />
          <Text style={styles.infoTxt}>
            Le PDF est au format A4 avec en-tête Budgy, TVA suisse 8.1%, et espace pour signature. Compatible avec toutes les imprimantes et logiciels comptables.
          </Text>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  previewCard: { marginBottom: Spacing.lg, borderColor: `${Colors.primary}40` },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  previewTitle: { color: Colors.primary, fontSize: FontSizes.xl, fontWeight: FontWeights.black, letterSpacing: 2 },
  previewSubtitle: { color: Colors.textSecondary, fontSize: FontSizes.md },
  previewMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  previewMetaTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm },
  sectionTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  modeRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  modeCard: { flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center' },
  modeCardOn: { backgroundColor: `${Colors.primary}12`, borderColor: Colors.primary },
  modeLabel: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold, marginTop: Spacing.sm },
  modeDesc: { color: Colors.textTertiary, fontSize: FontSizes.xs, textAlign: 'center', marginTop: 4 },
  sourceRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  sourceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  sourceCard: { width: '48%', padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.cardBorder, gap: 4 },
  sourceCardOn: { borderColor: Colors.primary, backgroundColor: 'rgba(52,211,153,0.08)' },
  sourceCardLabel: { color: Colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  sourceCardCount: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  sourceCardDesc: { color: Colors.textTertiary, fontSize: 10 },
  periodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  periodChip: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  periodChipOn: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: Colors.primary },
  periodTxt: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: Spacing.md },
  toggleLabel: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  toggleDesc: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  sourceBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sourceTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  summaryCard: { marginBottom: Spacing.lg },
  summaryTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  summaryValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  summaryTotal: { borderTopWidth: 2, borderTopColor: Colors.primary, marginTop: Spacing.sm, paddingTop: Spacing.md },
  totalLabel: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  totalValue: { color: Colors.primary, fontSize: FontSizes.xl, fontWeight: FontWeights.black },
  successCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: `${Colors.success}15`, borderColor: `${Colors.success}40` },
  successTxt: { color: Colors.success, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.md },
  infoTxt: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
});
