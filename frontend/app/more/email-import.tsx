/**
 * BUDGY - Importer un document (4 méthodes, AUCUNE dépendance Gmail/Mail/Share)
 *
 * 1) Scanner document       (caméra OCR — pour facture papier / ticket)
 * 2) Choisir PDF            (DocumentPicker filtré PDF)
 * 3) Importer depuis Fichiers (DocumentPicker — image/PDF/texte)
 * 4) Prendre une photo      (galerie photo + OCR)
 *
 * Tous les chemins convergent vers /api/email/parse (texte) ou /api/scanner/ocr (image/PDF).
 * AUCUN partage depuis Gmail, AUCUNE intent Mail, AUCUNE adresse email à configurer.
 *
 * i18n complet (fr/en/de/it) — v3.9.0 build 73.
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { safeFetchJson } from '../../src/lib/network';
import { normalizeImageForUpload } from '../../src/lib/imageUpload';
import * as ImagePicker from 'expo-image-picker';
import { readAsBase64, readAsText } from '../../src/utils/fsCompat';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import type { Contract } from '../../src/types';
import { Card, Button } from '../../src/components/ui';
import { humanizeError } from '../../src/lib/errorSanitizer';
import { useTranslation } from '../../src/hooks/useTranslation';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.budgy.ch';

type ImportMethod = 'scan' | 'pdf' | 'file' | 'photo';

export default function ImportInvoiceScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { addInvoice, addContract } = useStore();
  const { t } = useTranslation();

  const initialMode: 'invoice' | 'contract' | null = useMemo(() => {
    const m = String(params.mode || '').toLowerCase();
    return m === 'invoice' || m === 'contract' ? m : null;
  }, [params.mode]);
  const [mode, setMode] = useState<'invoice' | 'contract' | null>(initialMode);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(t('emailImport.busyAnalyzing'));
  const [result, setResult] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<{ uri: string; mime: string } | null>(null);

  // ── Backend calls ──
  const parseEmailText = async (content: string, subject = '') => {
    if (content.trim().length < 20) {
      Alert.alert(t('emailImport.contentTooShortTitle'), t('emailImport.contentTooShortBody'));
      return;
    }
    setBusy(true);
    setBusyLabel(t('emailImport.busyAiInvoice'));
    setResult(null);
    try {
      const r = await safeFetchJson<any>(`${BACKEND_URL}/api/email/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, subject }),
      }, { timeoutMs: 20000, retries: 1, silent: true });
      const data = r.data || { success: false, error: r.error };
      if (data.success) setResult({ ...data, _source: 'email' });
      else Alert.alert(
        t('emailImport.importFailedTitle'),
        data.error || t('emailImport.importFailedFallback')
      );
    } catch (e: any) {
      Alert.alert(t('emailImport.noConnectionTitle'), t('emailImport.noConnectionBody'));
    } finally {
      setBusy(false);
    }
  };

  const parseImageFile = async (uriOrPath: string) => {
    setBusy(true);
    setBusyLabel(t('emailImport.busyOcrAi'));
    setResult(null);
    try {
      let base64 = '';
      let mime = 'image/jpeg';
      if (uriOrPath.startsWith('data:')) {
        base64 = uriOrPath.split(',')[1] || '';
        const m = /^data:([^;]+);/.exec(uriOrPath);
        if (m) mime = m[1];
      } else if (uriOrPath.toLowerCase().endsWith('.pdf') || uriOrPath.includes('application/pdf')) {
        base64 = await readAsBase64(uriOrPath);
        mime = 'application/pdf';
        console.log('[email-import] PDF detected, sending raw bytes for OCR');
      } else {
        console.log('[email-import] normalizing image', uriOrPath);
        try {
          const norm = await normalizeImageForUpload(uriOrPath, {
            includeBase64: true,
            quality: 0.85,
          });
          base64 = norm.base64 || '';
        } catch (normErr) {
          console.warn('[email-import] normalize failed, using raw:', normErr);
          base64 = await readAsBase64(uriOrPath);
        }
      }
      if (!base64) {
        Alert.alert(t('emailImport.emptyFileTitle'), t('emailImport.emptyFileBody'));
        return;
      }
      console.log('[email-import] OCR call, b64 length:', base64.length, 'mime:', mime);
      const r = await safeFetchJson<any>(`${BACKEND_URL}/api/scanner/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: `data:${mime};base64,${base64}` }),
      }, { timeoutMs: 25000, retries: 1, silent: true });
      const data = r.data || { success: false, error: r.error };
      if (data.success) {
        setResult({ ...data, _source: 'photo', _originalUri: uriOrPath, _mime: mime });
      } else {
        setPendingFile({ uri: uriOrPath, mime });
        setResult({
          success: false,
          _source: 'photo',
          _originalUri: uriOrPath,
          _mime: mime,
          _failedOcr: true,
          _errorMessage: data.error || 'OCR unavailable',
        });
      }
    } catch (e: any) {
      console.error('[email-import] parseImageFile error:', e);
      const h = humanizeError(e, {
        title: t('emailImport.importImpossibleTitle'),
        message: t('emailImport.importImpossibleBody'),
      });
      Alert.alert(h.title, h.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Action handlers ──
  const handleScanner = () => {
    router.push('/scanner-modal');
  };

  const handlePdfPicker = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const file = res.assets[0];
      await parseImageFile(file.uri);
    } catch (e: any) {
      const h = humanizeError(e, { title: t('emailImport.pdfImpossibleTitle') });
      Alert.alert(h.title, h.message);
    }
  };

  const handleFilePicker = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const file = res.assets[0];
      if (file.mimeType?.startsWith('text/')) {
        const text = await readAsText(file.uri);
        await parseEmailText(text, file.name);
      } else {
        await parseImageFile(file.uri);
      }
    } catch (e: any) {
      const h = humanizeError(e, { title: t('emailImport.importImpossibleTitle') });
      Alert.alert(h.title, h.message);
    }
  };

  const handlePhotoPicker = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('emailImport.permissionRequiredTitle'), t('emailImport.permissionRequiredBody'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      await parseImageFile(a.uri);
    } catch (e: any) {
      const h = humanizeError(e, { title: t('emailImport.importImpossibleTitle') });
      Alert.alert(h.title, h.message);
    }
  };

  /** Save as Invoice (Factures section) */
  const persistAsInvoice = () => {
    if (!result) return;
    const isPhoto = result._source === 'photo';
    addInvoice({
      id: `inv_${Date.now()}`,
      title: result.title || result.merchant || t('emailImport.defaultInvoiceTitle'),
      issuer: result.issuer || result.merchant || t('emailImport.defaultUnknownIssuer'),
      amount: Number(result.amount) || Number(result.total) || Number(result.total_amount) || 0,
      currency: result.currency || 'CHF',
      dueDate: result.due_date || undefined,
      invoiceDate: result.invoice_date || result.date || undefined,
      iban: result.iban || undefined,
      reference: result.reference || undefined,
      category: result.category || 'autre',
      status: 'pending',
      source: isPhoto ? 'scan' : 'email',
      createdAt: Date.now(),
    });
    Alert.alert(t('emailImport.invoiceSavedTitle'), t('emailImport.invoiceSavedBody'));
    setResult(null);
  };

  /** Save as Contract (Mon Classeur) */
  const persistAsContract = () => {
    if (!result) return;
    const today = new Date();
    const oneYearLater = new Date(today.getTime());
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const contract: Contract = {
      id: `ct_${Date.now()}`,
      title: result.title || result.merchant || result.issuer || t('emailImport.defaultContractTitle'),
      issuer: result.issuer || result.merchant || undefined,
      amount: Number(result.amount) || Number(result.total_amount) || 0,
      expirationDate: oneYearLater.toISOString().split('T')[0],
      startDate: result.invoice_date || result.date || today.toISOString().split('T')[0],
      urgent: false,
      autoRenew: true,
      category: result.category || 'assurance',
      createdAt: Date.now(),
      notes: t('emailImport.importedByAiNote'),
    };
    addContract(contract);
    Alert.alert(
      t('emailImport.contractSavedTitle'),
      t('emailImport.contractSavedBody'),
      [
        { text: t('emailImport.okBtn'), style: 'cancel' },
        { text: t('emailImport.openBinderCta'), onPress: () => router.push('/more/contracts' as any) },
      ],
    );
    setResult(null);
  };

  const saveInvoice = () => {
    if (!result) return;
    if (mode === 'contract') return persistAsContract();
    if (mode === 'invoice') return persistAsInvoice();

    const docType: string = (result.document_type || '').toLowerCase();
    if (docType === 'contract') return persistAsContract();
    if (docType === 'invoice' || docType === 'receipt') return persistAsInvoice();

    Alert.alert(
      t('emailImport.docTypeConfirmTitle'),
      t('emailImport.docTypeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('emailImport.pickContractOption'), onPress: persistAsContract },
        { text: t('emailImport.pickInvoiceOption'), onPress: persistAsInvoice },
      ],
    );
  };

  const dismissResult = () => setResult(null);

  // Method cards
  const methods: { key: ImportMethod; icon: string; gradient: [string, string]; title: string; subtitle: string; onPress: () => void; tip: string }[] = [
    {
      key: 'scan',
      icon: 'scan',
      gradient: ['#34D399', '#22D3EE'],
      title: t('emailImport.scanTitle'),
      subtitle: t('emailImport.scanSub'),
      onPress: handleScanner,
      tip: t('emailImport.scanTip'),
    },
    {
      key: 'pdf',
      icon: 'document',
      gradient: ['#A78BFA', '#7C3AED'],
      title: t('emailImport.pdfTitle'),
      subtitle: t('emailImport.pdfSub'),
      onPress: handlePdfPicker,
      tip: t('emailImport.pdfTip'),
    },
    {
      key: 'file',
      icon: 'folder-open',
      gradient: ['#60A5FA', '#3B82F6'],
      title: t('emailImport.fileTitle'),
      subtitle: t('emailImport.fileSub'),
      onPress: handleFilePicker,
      tip: t('emailImport.fileTip'),
    },
    {
      key: 'photo',
      icon: 'images',
      gradient: ['#FBBF24', '#F59E0B'],
      title: t('emailImport.photoTitle'),
      subtitle: t('emailImport.photoSub'),
      onPress: handlePhotoPicker,
      tip: t('emailImport.photoTip'),
    },
  ];

  const headerTitle =
    mode === 'invoice' ? t('emailImport.titleInvoice')
      : mode === 'contract' ? t('emailImport.titleContract')
      : t('emailImport.titleGeneric');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{headerTitle}</Text>
        <View style={{ width: 36 }} />
      </View>

      {mode === null && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{t('emailImport.chooseTypeTitle')}</Text>
            <Text style={styles.heroSub}>{t('emailImport.chooseTypeSub')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.methodCard, { marginBottom: Spacing.md }]}
            onPress={() => setMode('invoice')}
          >
            <LinearGradient
              colors={['#FBBF24', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.methodIcon}
            >
              <Ionicons name="receipt" size={26} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>{t('emailImport.pickInvoiceTitle')}</Text>
              <Text style={styles.methodSubtitle}>{t('emailImport.pickInvoiceSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.methodCard}
            onPress={() => setMode('contract')}
          >
            <LinearGradient
              colors={['#A78BFA', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.methodIcon}
            >
              <Ionicons name="document-text" size={26} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>{t('emailImport.pickContractTitle')}</Text>
              <Text style={styles.methodSubtitle}>{t('emailImport.pickContractSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {mode !== null && (<>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <LinearGradient
          colors={['rgba(52,211,153,0.18)', 'rgba(34,211,238,0.06)']}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={26} color="#FBBF24" />
          </View>
          <Text style={styles.heroTitle}>{t('emailImport.heroTitle')}</Text>
          <Text style={styles.heroSub}>{t('emailImport.heroSub')}</Text>
        </LinearGradient>

        {/* 4 méthodes */}
        {methods.map((m, idx) => (
          <TouchableOpacity key={m.key} onPress={m.onPress} activeOpacity={0.85} disabled={busy} style={styles.methodWrap}>
            <View style={styles.methodCard}>
              <LinearGradient colors={m.gradient} style={styles.methodIcon}>
                <Ionicons name={m.icon as any} size={22} color="#0E1530" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <View style={styles.methodTitleRow}>
                  <Text style={styles.methodNum}>{idx + 1}</Text>
                  <Text style={styles.methodTitle}>{m.title}</Text>
                </View>
                <Text style={styles.methodSubtitle}>{m.subtitle}</Text>
                <Text style={styles.methodTip}>💡 {m.tip}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
            </View>
          </TouchableOpacity>
        ))}

        {/* Result preview */}
        {result && (() => {
          const dt: string = (result.document_type || '').toLowerCase();
          const isContract = dt === 'contract';
          const needsConfirm = !!result.needs_user_confirmation;
          const detectedLabel =
            needsConfirm ? t('emailImport.badgeUncertain')
            : isContract ? t('emailImport.badgeContract')
            : dt === 'receipt' ? t('emailImport.badgeReceipt')
            : t('emailImport.badgeInvoice');
          const detectedColor =
            needsConfirm ? '#FBBF24'
            : isContract ? '#A78BFA'
            : '#34D399';
          const ctaLabel =
            needsConfirm ? t('emailImport.ctaConfirmSave')
            : isContract ? t('emailImport.ctaAddToBinder')
            : t('emailImport.ctaSaveInvoice');
          return (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                <Text style={styles.resultTitle}>{t('emailImport.resultTitle')}</Text>
                <TouchableOpacity onPress={dismissResult} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close" size={20} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.docTypeBadge, { borderColor: detectedColor + '55', backgroundColor: detectedColor + '15' }]}>
                <Text style={[styles.docTypeBadgeText, { color: detectedColor }]}>{detectedLabel}</Text>
                {typeof result.confidence === 'number' ? (
                  <Text style={styles.docTypeConfidence}>{t('emailImport.confidenceLabel', { n: Math.round((result.confidence || 0) * 100) })}</Text>
                ) : null}
              </View>
              {result.merchant || result.issuer ? <Row label={t('emailImport.rowIssuer')} value={result.merchant || result.issuer} /> : null}
              {result.title ? <Row label={t('emailImport.rowSubject')} value={result.title} /> : null}
              {result.amount || result.total || result.total_amount ? <Row label={t('emailImport.rowAmount')} value={`${result.currency || 'CHF'} ${result.amount || result.total || result.total_amount}`} highlight /> : null}
              {result.due_date ? <Row label={t('emailImport.rowDueDate')} value={result.due_date} /> : null}
              {result.invoice_date || result.date ? <Row label={t('emailImport.rowDate')} value={result.invoice_date || result.date} /> : null}
              {result.iban ? <Row label={t('emailImport.rowIban')} value={result.iban} /> : null}
              {result.reference ? <Row label={t('emailImport.rowReference')} value={result.reference} /> : null}
              <Button title={ctaLabel} onPress={saveInvoice} fullWidth size="lg" style={{ marginTop: Spacing.md }} />
            </View>
          );
        })()}

        {/* Tips card */}
        <Card style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>{t('emailImport.tipsTitle')}</Text>
          <Text style={styles.tipsText}>{t('emailImport.tipsBody')}</Text>
        </Card>
      </ScrollView>

      {/* Busy overlay */}
      {busy && (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <View style={styles.busyBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.busyText}>{busyLabel}</Text>
          </View>
        </View>
      )}
      </>)}
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: theme.primary, fontWeight: FontWeights.bold as any }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },

  hero: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)' },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(251,191,36,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  heroTitle: { color: Colors.text, fontSize: 20, fontWeight: FontWeights.black },
  heroSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },

  methodWrap: { marginBottom: Spacing.md },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.xl, padding: Spacing.md },
  methodIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.08)', color: Colors.textSecondary, fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 22 },
  methodTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  methodSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  methodTip: { color: Colors.textTertiary, fontSize: 11, marginTop: 6, fontStyle: 'italic' },

  advancedToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  advancedToggleTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

  pasteCard: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  input: { backgroundColor: Colors.backgroundSecondary, borderRadius: BorderRadius.md, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md, borderWidth: 1, borderColor: Colors.cardBorder },

  resultCard: { backgroundColor: 'rgba(52,211,153,0.08)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)', padding: Spacing.lg, marginTop: Spacing.lg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  resultTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  docTypeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, marginBottom: Spacing.sm },
  docTypeBadgeText: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold as any },
  docTypeConfidence: { color: Colors.textSecondary, fontSize: 11, fontWeight: FontWeights.semibold as any },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  rowLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  rowValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, flex: 1, textAlign: 'right' },

  tipsCard: { marginTop: Spacing.lg, padding: Spacing.md },
  tipsTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: 8 },
  tipsText: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 22 },

  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  busyBox: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, minWidth: 220, borderWidth: 1, borderColor: Colors.cardBorder },
  busyText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});
