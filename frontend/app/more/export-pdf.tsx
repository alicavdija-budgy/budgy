/**
 * GUARDIAN MONEY CHF - Export PDF Screen
 * Generate and share A4 expense reports with TVA 8.1%
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, Badge } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ExportPDFScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, preferences, proExpenses, transactions } = useStore();

  const [mode, setMode] = useState<'employee' | 'independent'>('employee');
  const [source, setSource] = useState<'pro' | 'all'>('pro');
  const [loading, setLoading] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  const selectedExpenses = useMemo(() => {
    if (source === 'pro') {
      return proExpenses.map(e => ({
        date: e.date,
        title: e.title,
        amount: e.amount,
        category: e.category,
        justification: e.justification || '-',
      }));
    }
    return transactions.map(t => ({
      date: t.date,
      title: t.title,
      amount: t.amount,
      category: t.category,
      justification: '-',
    }));
  }, [source, proExpenses, transactions]);

  const totalHT = selectedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalTVA = Math.round(totalHT * 8.1) / 100;
  const totalTTC = totalHT + totalTVA;

  const handleExport = async () => {
    if (selectedExpenses.length === 0) {
      Alert.alert('Aucune dépense', 'Ajoutez des dépenses avant d\'exporter.');
      return;
    }

    setLoading(true);
    try {
      // Call backend to generate HTML
      const response = await fetch(`${BACKEND_URL}/api/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: user?.name || 'Utilisateur',
          company: mode === 'employee' ? 'Mon Entreprise SA' : user?.name || 'Indépendant',
          expenses: selectedExpenses,
          mode,
          canton: preferences.canton,
          period: new Date().toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' }),
        }),
      });

      if (!response.ok) throw new Error('Erreur serveur');
      const data = await response.json();

      // Generate PDF from HTML
      const { uri } = await Print.printToFileAsync({
        html: data.html,
        base64: false,
      });

      // Share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Note de frais Budgy',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF généré!', `Fichier sauvegardé: ${uri}`);
      }

      setPdfReady(true);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de générer le PDF');
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
        <Text style={styles.sectionTitle}>Dépenses à inclure</Text>
        <View style={styles.sourceRow}>
          <TouchableOpacity
            style={[styles.sourceBtn, source === 'pro' && styles.sourceBtnOn]}
            onPress={() => setSource('pro')}
          >
            <Ionicons name="briefcase" size={18} color={source === 'pro' ? Colors.text : Colors.textTertiary} />
            <Text style={[styles.sourceTxt, source === 'pro' && { color: Colors.text }]}>
              Frais pro ({proExpenses.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceBtn, source === 'all' && styles.sourceBtnOn]}
            onPress={() => setSource('all')}
          >
            <Ionicons name="list" size={18} color={source === 'all' ? Colors.text : Colors.textTertiary} />
            <Text style={[styles.sourceTxt, source === 'all' && { color: Colors.text }]}>
              Toutes ({transactions.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Récapitulatif</Text>
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
