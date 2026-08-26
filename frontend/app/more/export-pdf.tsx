/**
 * GUARDIAN MONEY CHF - Export PDF Screen
 * Generate and share A4 expense reports with TVA 8.1%
 * i18n complet (fr/en/de/it) — v3.9.0 build 73
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import { buildPdfHtml } from '../../src/utils/localPdf';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';
import { apiFetchJson, hasApiBaseUrl } from '../../src/lib/network';
import { useTranslation } from '../../src/hooks/useTranslation';
import { DATE_LOCALES } from '../../src/i18n/translations';

type Source = 'pro' | 'all' | 'tickets' | 'documents';
type Period = 'month' | 'quarter' | 'year' | 'all';

export default function ExportPDFScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, preferences, proExpenses, transactions, documents } = useStore();
  const { t, lang } = useTranslation();
  const locale = DATE_LOCALES[lang];

  const periodLabel = (p: Period) => {
    const m = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    if (p === 'month') return m;
    if (p === 'quarter') return t('exportPdf.periodQuarter');
    if (p === 'year') return new Date().getFullYear().toString();
    return t('exportPdf.periodAll');
  };

  const [mode, setMode] = useState<'employee' | 'independent'>('employee');
  const [source, setSource] = useState<Source>('pro');
  const [period, setPeriod] = useState<Period>('month');
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

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

  const allTransactions = useMemo(() => transactions.filter(tx => filterByPeriod(tx.date)), [transactions, period]);
  const allProExpenses = useMemo(() => proExpenses.filter(e => filterByPeriod(e.date)), [proExpenses, period]);
  const allDocuments = useMemo(() => documents.filter(d => filterByPeriod(d.createdAt)), [documents, period]);
  const allTickets = useMemo(() => {
    const txWithReceipt = allTransactions.filter((x: any) => x.receipt);
    const proWithReceipt = allProExpenses.filter((p: any) => p.receipt);
    return [...txWithReceipt, ...proWithReceipt];
  }, [allTransactions, allProExpenses]);

  const selectedExpenses = useMemo(() => {
    const list = source === 'pro' ? allProExpenses
              : source === 'all' ? allTransactions
              : source === 'tickets' ? allTickets
              : [];
    return list.map((e: any) => ({
      date: e.date, title: e.title, amount: e.amount, category: e.category,
      justification: e.justification || '-', receipt: e.receipt || undefined,
    }));
  }, [source, allProExpenses, allTransactions, allTickets]);

  const selectedDocuments = source === 'documents' ? allDocuments : [];
  const totalHT = selectedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalTVA = Math.round(totalHT * 8.1) / 100;
  const totalTTC = totalHT + totalTVA;

  const handleExport = async () => {
    if (selectedExpenses.length === 0 && selectedDocuments.length === 0) {
      Alert.alert(t('exportPdf.noDataTitle'), t('exportPdf.noDataBody'));
      return;
    }
    setLoading(true);
    try {
      const p = periodLabel(period);
      const titleOverride =
        source === 'tickets' ? t('exportPdf.ticketsTitle', { period: p }) :
        source === 'documents' ? t('exportPdf.docsTitle', { period: p }) :
        source === 'all' ? t('exportPdf.allTitle', { period: p }) :
        t('exportPdf.expenseReport', { period: p });

      const payload = {
        user_name: user?.name || t('exportPdf.userDefault'),
        company: mode === 'employee' ? t('exportPdf.companyDefault') : user?.name || t('exportPdf.modeIndependent'),
        expenses: selectedExpenses,
        mode, canton: preferences.canton, period: p,
        include_receipts: includeReceipts,
        documents: selectedDocuments.map((d: any) => ({
          title: d.title, category: d.category, imageBase64: d.imageBase64,
          pages: d.pages || [d.imageBase64],
        })),
        title_override: titleOverride,
      };

      let html: string;
      try {
        html = buildPdfHtml(payload as any);
      } catch {
        throw new Error(t('exportPdf.pdfCreateErr'));
      }

      if (hasApiBaseUrl()) {
        try {
          const r = await apiFetchJson<{ html?: string }>('/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }, { timeoutMs: 8000, retries: 0, silent: true });
          if (r.ok && r.data?.html && r.data.html.length > 200) html = r.data.html;
        } catch {}
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const { safeShareFile } = await import('../../src/lib/safeShare');
      const r = await safeShareFile(uri, {
        mime: 'application/pdf', dialogTitle: titleOverride, name: titleOverride,
      });
      if (!r.ok && r.error) Alert.alert(t('exportPdf.shareFail'), r.error);
      setPdfReady(true);
    } catch (error: any) {
      Alert.alert(t('exportPdf.exportImpossible'), error?.message || t('exportPdf.unknownExportErr'));
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
        <Text style={styles.title}>{t('exportPdf.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="flash" size={24} color={Colors.primary} />
            <Text style={styles.previewTitle}>BUDGY</Text>
          </View>
          <Text style={styles.previewSubtitle}>{t('exportPdf.reportSubtitle', { period: new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' }) })}</Text>
          <View style={styles.previewMeta}>
            <Text style={styles.previewMetaTxt}>{user?.name || t('exportPdf.userDefault')}</Text>
            <Text style={styles.previewMetaTxt}>{t('exportPdf.cantonLabel', { code: preferences.canton })}</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>{t('exportPdf.mode')}</Text>
        <View style={styles.modeRow}>
          {[
            { value: 'employee' as const, label: t('exportPdf.modeEmployee'), icon: 'briefcase', desc: t('exportPdf.modeEmployeeDesc') },
            { value: 'independent' as const, label: t('exportPdf.modeIndependent'), icon: 'person', desc: t('exportPdf.modeIndependentDesc') },
          ].map((m) => (
            <TouchableOpacity key={m.value} style={[styles.modeCard, mode === m.value && styles.modeCardOn]} onPress={() => setMode(m.value)} testID={`mode-${m.value}`}>
              <Ionicons name={m.icon as any} size={24} color={mode === m.value ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.modeLabel, mode === m.value && { color: Colors.primary }]}>{m.label}</Text>
              <Text style={styles.modeDesc}>{m.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('exportPdf.whatToExport')}</Text>
        <View style={styles.sourceGrid}>
          {[
            { id: 'pro', label: t('exportPdf.srcPro'), icon: 'briefcase', count: allProExpenses.length, desc: t('exportPdf.srcProDesc') },
            { id: 'all', label: t('exportPdf.srcAll'), icon: 'list', count: allTransactions.length, desc: t('exportPdf.srcAllDesc') },
            { id: 'tickets', label: t('exportPdf.srcTickets'), icon: 'receipt', count: allTickets.length, desc: t('exportPdf.srcTicketsDesc') },
            { id: 'documents', label: t('exportPdf.srcDocs'), icon: 'folder', count: allDocuments.length, desc: t('exportPdf.srcDocsDesc') },
          ].map((s) => (
            <TouchableOpacity key={s.id} style={[styles.sourceCard, source === s.id && styles.sourceCardOn]} onPress={() => setSource(s.id as Source)}>
              <Ionicons name={s.icon as any} size={20} color={source === s.id ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.sourceCardLabel, source === s.id && { color: Colors.primary }]}>{s.label}</Text>
              <Text style={styles.sourceCardCount}>{s.count} {s.count === 1 ? t('exportPdf.itemOne') : t('exportPdf.itemMany')}</Text>
              <Text style={styles.sourceCardDesc}>{s.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('exportPdf.period')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.periodRow}>
            {([
              { id: 'month', label: t('exportPdf.pMonth') },
              { id: 'quarter', label: t('exportPdf.pQuarter') },
              { id: 'year', label: t('exportPdf.pYear') },
              { id: 'all', label: t('exportPdf.pAll') },
            ] as const).map((p) => (
              <TouchableOpacity key={p.id} style={[styles.periodChip, period === p.id && styles.periodChipOn]} onPress={() => setPeriod(p.id)}>
                <Text style={[styles.periodTxt, period === p.id && { color: Colors.primary }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {(source === 'pro' || source === 'all' || source === 'tickets') && (
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('exportPdf.attachToggle')}</Text>
              <Text style={styles.toggleDesc}>{t('exportPdf.attachToggleSub')}</Text>
            </View>
            <Switch value={includeReceipts} onValueChange={setIncludeReceipts} trackColor={{ false: '#374151', true: Colors.primary }} thumbColor="#FFF" />
          </View>
        )}

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('exportPdf.summary')}</Text>
          {source === 'documents' ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('exportPdf.docsScanned')}</Text>
                <Text style={styles.summaryValue}>{t('exportPdf.filesCount', { n: selectedDocuments.length })}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('exportPdf.pagesTotal')}</Text>
                <Text style={styles.summaryValue}>{selectedDocuments.reduce((acc: number, d: any) => acc + (d.pages?.length || 1), 0)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('exportPdf.expenses')}</Text>
                <Text style={styles.summaryValue}>{t('exportPdf.lines', { n: selectedExpenses.length })}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('exportPdf.totalHT')}</Text>
                <Text style={styles.summaryValue}>CHF {formatNumber(totalHT, 2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('exportPdf.tva')}</Text>
                <Text style={styles.summaryValue}>CHF {formatNumber(totalTVA, 2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>{t('exportPdf.totalTTC')}</Text>
                <Text style={styles.totalValue}>CHF {formatNumber(totalTTC, 2)}</Text>
              </View>
            </>
          )}
        </Card>

        <Button
          title={loading ? t('exportPdf.generating') : t('exportPdf.generateCta')}
          onPress={handleExport} fullWidth size="lg" loading={loading} icon="document-text"
          style={{ marginBottom: Spacing.md }}
        />

        {pdfReady && (
          <Card style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <Text style={styles.successTxt}>{t('exportPdf.pdfReady')}</Text>
          </Card>
        )}

        <Card style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color={Colors.info} />
          <Text style={styles.infoTxt}>{t('exportPdf.infoTxt')}</Text>
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
