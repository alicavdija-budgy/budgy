/**
 * BUDGY - Email Invoice Auto-Import
 * Paste an email content -> AI parses it -> saved as Invoice
 * Also shows the dedicated forwarding address (mocked).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/calculations';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function EmailImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, addInvoice } = useStore();
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [content, setContent] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Personal forwarding address (deterministic per user)
  const fwdSlug = (user?.email || 'guest')
    .replace(/[@.+]/g, '-')
    .toLowerCase()
    .slice(0, 24);
  const forwardingAddress = `${fwdSlug}@invoice.budgy.ch`;

  const copyAddress = async () => {
    try {
      await Clipboard.setStringAsync(forwardingAddress);
      Alert.alert('Copié', 'Adresse copiée dans le presse-papiers.');
    } catch {
      Alert.alert('Adresse', forwardingAddress);
    }
  };

  const parseEmail = async () => {
    if (!content.trim() || content.trim().length < 20) {
      Alert.alert('Contenu trop court', 'Collez le contenu complet de l’email.');
      return;
    }
    setParsing(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/email/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, subject, from_addr: from }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        Alert.alert('Échec', data.error || 'Impossible de parser l’email.');
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Réseau');
    } finally {
      setParsing(false);
    }
  };

  const saveInvoice = () => {
    if (!result) return;
    addInvoice({
      id: `inv_${Date.now()}`,
      title: result.title || subject || 'Facture',
      issuer: result.issuer || from || 'Inconnu',
      amount: Number(result.amount) || 0,
      currency: result.currency || 'CHF',
      dueDate: result.due_date || undefined,
      invoiceDate: result.invoice_date || undefined,
      iban: result.iban || undefined,
      reference: result.reference || undefined,
      category: result.category || 'autre',
      status: 'pending',
      source: 'email',
      createdAt: Date.now(),
    });
    Alert.alert('Facture importée', 'Retrouvez-la dans Plus → Factures.');
    setSubject('');
    setFrom('');
    setContent('');
    setResult(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Import email</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Forwarding address card */}
        <LinearGradient
          colors={Colors.gradientPrimary as [string, string]}
          style={styles.fwdCard}
        >
          <Ionicons name="mail-open" size={28} color={Colors.text} />
          <Text style={styles.fwdTitle}>Votre adresse de transfert</Text>
          <Text style={styles.fwdAddress}>{forwardingAddress}</Text>
          <Text style={styles.fwdDesc}>
            Transférez vos factures à cette adresse. Elles apparaîtront automatiquement dans vos Factures (mode simulé en bêta — copiez/collez ci-dessous en attendant).
          </Text>
          <TouchableOpacity style={styles.fwdButton} onPress={copyAddress}>
            <Ionicons name="copy-outline" size={16} color={Colors.text} />
            <Text style={styles.fwdButtonText}>Copier</Text>
          </TouchableOpacity>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Coller le contenu d’un email</Text>
        <Text style={styles.sectionSub}>L’IA extrait montant, émetteur, IBAN, échéance et référence.</Text>

        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Sujet (optionnel)"
          placeholderTextColor={Colors.textTertiary}
        />
        <TextInput
          style={styles.input}
          value={from}
          onChangeText={setFrom}
          placeholder="De (optionnel) ex: facture@swisscom.ch"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          value={content}
          onChangeText={setContent}
          placeholder="Coller ici le contenu complet de l’email (texte ou HTML)..."
          placeholderTextColor={Colors.textTertiary}
          multiline
        />

        <Button
          title={parsing ? 'Analyse...' : 'Analyser avec l’IA'}
          onPress={parseEmail}
          loading={parsing}
          fullWidth
          icon="sparkles"
          size="lg"
          style={{ marginTop: Spacing.md }}
        />

        {parsing && (
          <View style={styles.loaderRow}>
            <ActivityIndicator color={Colors.primaryLight} />
            <Text style={styles.loaderText}>Extraction en cours...</Text>
          </View>
        )}

        {result && (
          <Card style={styles.resultCard}>
            <Text style={styles.resultTitle}>Résultat</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Émetteur</Text>
              <Text style={styles.resultValue}>{result.issuer || '-'}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Objet</Text>
              <Text style={styles.resultValue}>{result.title || '-'}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Montant</Text>
              <Text style={[styles.resultValue, { color: Colors.error }]}>
                {result.currency || 'CHF'} {result.amount ? formatNumber(result.amount) : '-'}
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Échéance</Text>
              <Text style={styles.resultValue}>{result.due_date || '-'}</Text>
            </View>
            {result.iban && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>IBAN</Text>
                <Text style={[styles.resultValue, { fontSize: FontSizes.xs }]}>{result.iban}</Text>
              </View>
            )}
            {result.reference && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Référence</Text>
                <Text style={[styles.resultValue, { fontSize: FontSizes.xs }]}>{result.reference}</Text>
              </View>
            )}
            <Button
              title="Enregistrer la facture"
              onPress={saveInvoice}
              variant="success"
              fullWidth
              icon="checkmark-circle"
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  fwdCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  fwdTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  fwdAddress: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  fwdDesc: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, lineHeight: 18 },
  fwdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  fwdButtonText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  sectionTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.md, marginBottom: 4 },
  sectionSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginBottom: Spacing.md },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: FontSizes.md,
    marginBottom: Spacing.md,
  },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
  loaderText: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  resultCard: { marginTop: Spacing.lg, padding: Spacing.lg },
  resultTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  resultLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  resultValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
