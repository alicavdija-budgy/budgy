/**
 * BUDGY - Importer une facture (3 méthodes)
 *
 * 1) Partager depuis votre messagerie (Share Extension iOS / Intent Android)
 * 2) Choisir un fichier (DocumentPicker → PDF / image / texte)
 * 3) Photographier (Camera ou Galerie photo)
 *
 * Tous les chemins convergent vers /api/email/parse (texte) ou /api/scanner/ocr (image).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { safeFetchJson } from '../../src/lib/network';
import { normalizeImageForUpload } from '../../src/lib/imageUpload';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { readAsBase64, readAsText } from '../../src/utils/fsCompat';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import { humanizeError } from '../../src/lib/errorSanitizer';

// expo-share-intent is a native module — guarded import for web/Expo Go
let useShareIntent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useShareIntent = require('expo-share-intent').useShareIntent;
} catch {}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.budgy.ch';

type ImportMethod = 'share' | 'file' | 'photo' | 'paste';

export default function ImportInvoiceScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addInvoice } = useStore();

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Analyse...');
  const [result, setResult] = useState<any>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState('');

  // ── Share intent listener (mobile only) ──
  const shareIntent = useShareIntent ? useShareIntent({
    debug: false,
    resetOnBackground: true,
  }) : { hasShareIntent: false, shareIntent: null, resetShareIntent: () => {} };

  useFocusEffect(useCallback(() => {
    if (shareIntent?.hasShareIntent && shareIntent.shareIntent) {
      processSharedContent(shareIntent.shareIntent);
    }
  }, [shareIntent?.hasShareIntent]));

  // ── Process whatever the user shared (text, file, image, web URL) ──
  const processSharedContent = async (intent: any) => {
    try {
      // Text shared (e.g., copy/paste from Mail body)
      if (intent.text && intent.text.length > 10) {
        await parseEmailText(intent.text, intent.meta?.title || '');
      }
      // Files / images shared
      else if (intent.files && intent.files.length > 0) {
        const f = intent.files[0];
        // CRITICAL: iOS Share Sheet hands us a tmp URI that may be revoked
        // any second. Copy to documentDirectory before doing anything else.
        const { persistIncomingFile } = await import('../../src/lib/safeShare');
        const localUri = await persistIncomingFile(f.path, {
          name: f.fileName || undefined,
          mime: f.mimeType || undefined,
        });
        if (f.mimeType?.startsWith('image/')) {
          await parseImageFile(localUri);
        } else if (f.mimeType === 'application/pdf') {
          Alert.alert(
            'Fichier PDF reçu',
            `${f.fileName || 'Document'} — Le PDF sera traité par OCR sur la première page.`,
            [{ text: 'Continuer', onPress: () => parseImageFile(localUri) }],
          );
        } else if (f.mimeType?.startsWith('text/')) {
          const text = await readAsText(localUri);
          await parseEmailText(text, f.fileName || '');
        } else {
          Alert.alert(
            'Format non reconnu',
            'Ce fichier n\'a pas pu être analysé. Essayez avec une photo ou un PDF.',
          );
        }
      }
      // URL shared
      else if (intent.webUrl) {
        Alert.alert(
          'Lien reçu',
          `${intent.webUrl}\n\nOuvrez la page de facture dans votre navigateur, faites Partager → Budgy avec le contenu/PDF.`,
        );
      }
    } catch (e: any) {
      const { humanErrorMessage } = await import('../../src/lib/errorSanitizer');
      Alert.alert(
        'Import partagé',
        humanErrorMessage(e, 'Impossible d\'accéder au fichier partagé. Réessayez depuis Fichiers ou Mail.'),
      );
    } finally {
      shareIntent?.resetShareIntent?.();
    }
  };

  // ── Backend calls ──
  const parseEmailText = async (content: string, subject = '') => {
    if (content.trim().length < 20) {
      Alert.alert('Contenu trop court', 'Pas assez de texte pour analyser.');
      return;
    }
    setBusy(true);
    setBusyLabel('IA analyse votre facture...');
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
        'Impossible d\'importer cette facture',
        data.error || 'Veuillez réessayer ou choisir un autre fichier.'
      );
    } catch (e: any) {
      Alert.alert(
        'Connexion impossible',
        'Vérifiez votre connexion Internet et réessayez.'
      );
    } finally {
      setBusy(false);
    }
  };

  const parseImageFile = async (uriOrPath: string) => {
    setBusy(true);
    setBusyLabel('OCR + IA en cours...');
    setResult(null);
    try {
      let base64 = '';
      let mime = 'image/jpeg';
      if (uriOrPath.startsWith('data:')) {
        base64 = uriOrPath.split(',')[1] || '';
        const m = /^data:([^;]+);/.exec(uriOrPath);
        if (m) mime = m[1];
      } else if (uriOrPath.toLowerCase().endsWith('.pdf') || uriOrPath.includes('application/pdf')) {
        // PDF — for now send the raw PDF bytes; backend can OCR first page.
        // Original PDF stays as attachment in the user's filesystem cache.
        base64 = await readAsBase64(uriOrPath);
        mime = 'application/pdf';
        console.log('[email-import] PDF detected, sending raw bytes for OCR');
      } else {
        // ALWAYS normalize images (HEIC/HEIF → JPEG, resize, quality)
        // This fixes the "unsupported image format" error from gpt-4o-mini
        // on HEIC photos taken on iPhone (default iOS format).
        console.log('[email-import] normalizing image', uriOrPath);
        try {
          const norm = await normalizeImageForUpload(uriOrPath, {
            includeBase64: true,
            quality: 0.85,
          });
          base64 = norm.base64 || '';
        } catch (normErr) {
          // Fallback to raw read if normalize fails
          console.warn('[email-import] normalize failed, using raw:', normErr);
          base64 = await readAsBase64(uriOrPath);
        }
      }
      if (!base64) {
        Alert.alert(
          'Fichier vide',
          'Impossible de lire ce fichier. Réessayez avec un autre.'
        );
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
        // Keep the original URI as attachment for later preview
        setResult({ ...data, _source: 'photo', _originalUri: uriOrPath, _mime: mime });
      } else {
        // Humanize the error message — never show "gpt-4o-mini" / "litellm" to user
        const h = humanizeError(data.error || 'unknown', {
          title: 'Échec de l\'analyse',
          message: 'Ce fichier n\'a pas pu être analysé. Vous pouvez l\'ajouter manuellement.',
        });
        Alert.alert(h.title, h.message, [
          { text: 'OK', style: 'cancel' },
          {
            text: h.fallback || 'Saisir manuellement',
            onPress: () => router.push('/more/invoices' as any),
          },
        ]);
      }
    } catch (e: any) {
      console.error('[email-import] parseImageFile error:', e);
      const h = humanizeError(e, {
        title: 'Import impossible',
        message: 'Vérifiez votre connexion Internet et réessayez.',
      });
      Alert.alert(h.title, h.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Action handlers ──
  const handleFilePicker = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const file = res.assets[0];
      console.log('[email-import] picked file:', file.name, file.mimeType, file.size);
      if (file.mimeType?.startsWith('text/')) {
        const text = await readAsText(file.uri);
        await parseEmailText(text, file.name);
      } else {
        // image or pdf → OCR (PDF: first page)
        await parseImageFile(file.uri);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sélection annulée');
    }
  };

  const handlePhotoPicker = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission requise', 'Autorisez l\'accès aux photos pour importer.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      // ALWAYS normalize through imageUpload — converts HEIC/HEIF → JPEG, resizes
      await parseImageFile(a.uri);
    } catch (e: any) {
      const h = humanizeError(e, { title: 'Import impossible' });
      Alert.alert(h.title, h.message);
    }
  };

  const handleCameraCapture = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission requise', 'Autorisez l\'accès à la caméra.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.85,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      // ALWAYS normalize (HEIC → JPEG) before sending to OCR
      await parseImageFile(a.uri);
    } catch (e: any) {
      const h = humanizeError(e, { title: 'Capture impossible' });
      Alert.alert(h.title, h.message);
    }
  };

  const saveInvoice = () => {
    if (!result) return;
    const isPhoto = result._source === 'photo';
    addInvoice({
      id: `inv_${Date.now()}`,
      title: result.title || result.merchant || 'Facture',
      issuer: result.issuer || result.merchant || 'Inconnu',
      amount: Number(result.amount) || Number(result.total) || 0,
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
    Alert.alert('Facture importée ✓', 'Retrouvez-la dans Plus → Factures.');
    setResult(null);
  };

  const dismissResult = () => setResult(null);

  // Method cards
  const methods: { key: ImportMethod; icon: string; gradient: [string, string]; title: string; subtitle: string; onPress: () => void; tip: string }[] = [
    {
      key: 'share',
      icon: 'share-social',
      gradient: ['#34D399', '#22D3EE'],
      title: 'Partager depuis votre mail',
      subtitle: 'Le plus rapide · 0 configuration',
      onPress: () => Alert.alert(
        'Comment ça marche ?',
        '1. Ouvrez votre email (Mail, Gmail, Outlook…)\n2. Appuyez sur l\'icône Partager\n3. Choisissez "Budgy"\n\nLa facture sera importée automatiquement ici.',
      ),
      tip: 'iOS et Android · Nécessite l\'app installée sur votre appareil',
    },
    {
      key: 'file',
      icon: 'document-attach',
      gradient: ['#A78BFA', '#7C3AED'],
      title: 'Choisir un fichier',
      subtitle: 'PDF · Image · Texte',
      onPress: handleFilePicker,
      tip: 'Compatible avec Files iOS, Drive, OneDrive, Dropbox',
    },
    {
      key: 'photo',
      icon: 'camera',
      gradient: ['#FBBF24', '#F59E0B'],
      title: 'Photographier l\'email',
      subtitle: 'Capture ou galerie · OCR IA',
      onPress: () => Alert.alert(
        'Importer une image',
        'Comment voulez-vous procéder ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: '📸 Caméra', onPress: handleCameraCapture },
          { text: '🖼️ Galerie', onPress: handlePhotoPicker },
        ],
      ),
      tip: 'Idéal pour un screenshot d\'email ou une facture papier',
    },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Importer une facture</Text>
        <View style={{ width: 36 }} />
      </View>

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
          <Text style={styles.heroTitle}>L'IA importe vos factures en 1 tap</Text>
          <Text style={styles.heroSub}>
            Aucune adresse email à configurer. Choisissez la méthode qui vous convient :
          </Text>
        </LinearGradient>

        {/* 3 méthodes */}
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

        {/* Mode avancé : coller du texte */}
        <TouchableOpacity onPress={() => setPasteOpen(o => !o)} style={styles.advancedToggle}>
          <Ionicons name={pasteOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
          <Text style={styles.advancedToggleTxt}>
            Mode avancé · Coller le contenu d'un email
          </Text>
        </TouchableOpacity>

        {pasteOpen && (
          <View style={styles.pasteCard}>
            <TextInput
              style={[styles.input, { height: 160 }]}
              value={pasteContent}
              onChangeText={setPasteContent}
              placeholder="Collez ici le contenu complet de l'email (montant, IBAN, échéance, référence...)"
              placeholderTextColor={theme.textTertiary}
              multiline
              textAlignVertical="top"
            />
            <Button
              title="🔍 Analyser le texte"
              onPress={() => parseEmailText(pasteContent)}
              fullWidth
              size="lg"
              disabled={busy || pasteContent.trim().length < 20}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        )}

        {/* Result preview */}
        {result && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="checkmark-circle" size={22} color={theme.success} />
              <Text style={styles.resultTitle}>Facture détectée</Text>
              <TouchableOpacity onPress={dismissResult} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            {result.merchant || result.issuer ? <Row label="Émetteur" value={result.merchant || result.issuer} /> : null}
            {result.title ? <Row label="Sujet" value={result.title} /> : null}
            {result.amount || result.total ? <Row label="Montant" value={`${result.currency || 'CHF'} ${result.amount || result.total}`} highlight /> : null}
            {result.due_date ? <Row label="Échéance" value={result.due_date} /> : null}
            {result.invoice_date || result.date ? <Row label="Date" value={result.invoice_date || result.date} /> : null}
            {result.iban ? <Row label="IBAN" value={result.iban} /> : null}
            {result.reference ? <Row label="Référence" value={result.reference} /> : null}
            <Button title="✓ Enregistrer la facture" onPress={saveInvoice} fullWidth size="lg" style={{ marginTop: Spacing.md }} />
          </View>
        )}

        {/* Tips card */}
        <Card style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Astuces</Text>
          <Text style={styles.tipsText}>
            • Sur iOS : depuis Mail, appuyez sur ⤴ Partager → Budgy{'\n'}
            • Pour un PDF : sauvegardez-le dans Files puis « Choisir un fichier »{'\n'}
            • Pour un email visuel : prenez un screenshot et utilisez « Photographier »{'\n'}
            • Tous les contenus sont analysés par notre IA suisse en 2 secondes
          </Text>
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
