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
  Alert, Platform, KeyboardAvoidingView, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { apiFetchJson } from '../../src/lib/network';
import { normalizeImageForUpload } from '../../src/lib/imageUpload';
import { parseSwissQrBill } from '../../src/services/qrBill';
import { normalizeChfAmount } from '../../src/utils/amount';
import { findInvoiceDuplicate } from '../../src/lib/invoiceDocs';
import * as ImagePicker from 'expo-image-picker';
import { readAsBase64, readAsText } from '../../src/utils/fsCompat';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import type { Contract } from '../../src/types';
import { Card, Button } from '../../src/components/ui';
import { humanizeError } from '../../src/lib/errorSanitizer';
import { saveToVault, assertFileAcceptable, vaultFileExists, VaultError } from '../../src/lib/fileVault';
import { useTranslation } from '../../src/hooks/useTranslation';
import { getApiLocale } from '../../src/utils/apiLocale';

type ImportMethod = 'scan' | 'pdf' | 'file' | 'photo';


// Catégories métier des contrats (identiques à add-contract.tsx)
const CT_CATS: { id: string; tKey: string }[] = [
  { id: 'abonnements', tKey: 'typePhone' },
  { id: 'assurances', tKey: 'typeInsurance' },
  { id: 'logement', tKey: 'typeHousing' },
  { id: 'transports', tKey: 'typeTransport' },
  { id: 'sante', tKey: 'typeHealth' },
  { id: 'energie', tKey: 'typeEnergy' },
  { id: 'autre', tKey: 'typeOther' },
];

export default function ImportInvoiceScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { addInvoice, addContract, addDocument, updateDocument, addReceipt, addTransaction, updateReceipt, queueUpload, invoices } = useStore();
  // TÂCHE 2 — fichier transmis par le menu Partager iOS (ShareIntentRouter)
  const sharedParams = useLocalSearchParams<{ sharedUri?: string; sharedMime?: string; sharedName?: string; sharedText?: string }>();
  const sharedHandled = React.useRef(false);
  React.useEffect(() => {
    if (sharedHandled.current) return;
    const su = typeof sharedParams.sharedUri === 'string' ? sharedParams.sharedUri : undefined;
    const stx = typeof sharedParams.sharedText === 'string' ? sharedParams.sharedText : undefined;
    if (!su && !stx) return;
    sharedHandled.current = true;
    (async () => {
      try {
        if (su) {
          await assertFileAcceptable(su, sharedParams.sharedMime, sharedParams.sharedName);
          await parseImageFile(su, sharedParams.sharedMime);
        } else if (stx) {
          await parseEmailText(stx, sharedParams.sharedName || 'partage');
        }
      } catch (e: any) {
        if (e instanceof VaultError) { Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${e.code}`)); return; }
        const h = humanizeError(e, { title: t('emailImport.importImpossibleTitle') });
        Alert.alert(h.title, h.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedParams.sharedUri, sharedParams.sharedText]);
  const { t, lang } = useTranslation();

  const initialMode: 'invoice' | 'contract' | null = useMemo(() => {
    const m = String(params.mode || '').toLowerCase();
    return m === 'invoice' || m === 'contract' ? m : null;
  }, [params.mode]);
  const [mode, setMode] = useState<'invoice' | 'contract' | null>(initialMode);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(t('emailImport.busyAnalyzing'));
  const [result, setResult] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<{ uri: string; mime: string } | null>(null);
  // TÂCHE 1 — montant OBLIGATOIRE saisi/corrigé par l'utilisateur quand
  // l'extraction ne fournit pas un montant exploitable. Jamais 0 par défaut.
  const [manualAmount, setManualAmount] = useState('');
  // TÂCHE 2 (audit) — saisie MANUELLE d'un contrat quand l'OCR échoue
  const [showManualCt, setShowManualCt] = useState(false);
  // TÂCHE 3 (réserve B) — plus d'« assurance » imposée : catégories métier
  // réellement définies dans l'app (mêmes clés que l'assistant contrat).
  const [manualCt, setManualCt] = useState({ title: '', issuer: '', amount: '', expiry: '', category: 'autre' });

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
      const r = await apiFetchJson<any>(`/api/email/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': getApiLocale(lang) },
        body: JSON.stringify({ content, subject, locale: getApiLocale(lang) }),
      }, { timeoutMs: 20000, retries: 1, silent: true });
      if (r.status === 401 || r.status === 403) {
        Alert.alert(t('importErrors.authTitle'), t('importErrors.authBody'));
        return;
      }
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

  const parseImageFile = async (uriOrPath: string, mimeHint?: string) => {
    setBusy(true);
    setBusyLabel(t('emailImport.busyOcrAi'));
    setResult(null);
    let mime = mimeHint || 'image/jpeg';
    try {
      let base64 = '';
      if (uriOrPath.startsWith('data:')) {
        base64 = uriOrPath.split(',')[1] || '';
        const m = /^data:([^;]+);/.exec(uriOrPath);
        if (m) mime = m[1];
      } else if (mimeHint === 'application/pdf' || uriOrPath.toLowerCase().endsWith('.pdf') || uriOrPath.includes('application/pdf')) {
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
      const r = await apiFetchJson<any>(`/api/scanner/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': getApiLocale(lang) },
        body: JSON.stringify({ image_base64: `data:${mime};base64,${base64}`, locale: getApiLocale(lang) }),
      }, { timeoutMs: 25000, retries: 1, silent: true });
      if (r.status === 401 || r.status === 403) {
        Alert.alert(t('importErrors.authTitle'), t('importErrors.authBody'));
        return;
      }
      const data = r.data || { success: false, error: r.error };
      if (data.success && data.swiss_qr_content) {
        // VRAI Swiss QR décodé dans la photo/le PDF → parseur SPC éprouvé
        try {
          const bill = parseSwissQrBill(String(data.swiss_qr_content));
          setManualAmount('');
          setResult({
            success: true,
            _source: 'qr',
            _originalUri: uriOrPath,
            _mime: mime,
            _qrRaw: String(data.swiss_qr_content),
            document_type: 'invoice',
            title: bill.creditor?.name || undefined,
            issuer: bill.creditor?.name || undefined,
            amount: bill.amount ?? undefined, // undefined = saisie manuelle OBLIGATOIRE
            currency: bill.currency || 'CHF',
            iban: bill.iban || undefined,
            reference: bill.reference || undefined,
            confidence: 1,
          });
          return;
        } catch {
          Alert.alert(t('importErrors.qrInvalidTitle'), t('importErrors.qrInvalidBody'));
          return;
        }
      }
      if (data.success) {
        setManualAmount('');
        setResult({ ...data, _source: 'photo', _originalUri: uriOrPath, _mime: mime });
      } else {
        setPendingFile({ uri: uriOrPath, mime });
        setResult({
          success: false,
          _source: 'photo',
          _originalUri: uriOrPath,
          _mime: mime,
          _failedOcr: true,
          _errorMessage: data.error || 'OCR unavailable', // i18n-technical (internal, never shown)
        });
      }
    } catch (e: any) {
      console.error('[email-import] parseImageFile error:', e?.message || e);
      // TÂCHE 3 (réserve A) — exception/timeout/indisponibilité réseau :
      // le fichier ORIGINAL est conservé et la saisie manuelle proposée
      // (à ne pas confondre avec 401/403, traités plus haut = reconnexion).
      setPendingFile({ uri: uriOrPath, mime });
      setResult({
        success: false,
        _source: 'photo',
        _originalUri: uriOrPath,
        _mime: mime,
        _failedOcr: true,
        _errorMessage: e?.message || 'network', // i18n-technical (interne)
      });
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
      await assertFileAcceptable(file.uri, file.mimeType, file.name);
      await parseImageFile(file.uri, file.mimeType);
    } catch (e: any) {
      if (e instanceof VaultError) { Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${e.code}`)); return; }
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
        await assertFileAcceptable(file.uri, file.mimeType, file.name);
        await parseImageFile(file.uri, file.mimeType);
      }
    } catch (e: any) {
      if (e instanceof VaultError) { Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${e.code}`)); return; }
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
      await assertFileAcceptable(a.uri, a.mimeType ?? undefined, a.fileName ?? undefined);
      await parseImageFile(a.uri, a.mimeType ?? undefined);
    } catch (e: any) {
      if (e instanceof VaultError) { Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${e.code}`)); return; }
      const h = humanizeError(e, { title: t('emailImport.importImpossibleTitle') });
      Alert.alert(h.title, h.message);
    }
  };

  /** Montant retenu : extraction OU saisie manuelle — via la normalisation
   *  CHF unique. null = pas de montant exploitable (enregistrement bloqué). */
  const resolvedAmount = (): number | null => {
    const manual = normalizeChfAmount(manualAmount);
    if (manual !== null) return manual;
    return (
      normalizeChfAmount(result?.amount) ??
      normalizeChfAmount(result?.total) ??
      normalizeChfAmount(result?.total_amount)
    );
  };
  const extractionFailed = !!result && (result.success === false || result._failedOcr);

  /** Save as Invoice (Factures section) */
  /** TÂCHE 5 — conserve le document ORIGINAL (vault) + payload SPC brut,
   *  lié à la facture ; détecte les doublons par signaux fiables ; montant
   *  absent → « Montant à compléter » (JAMAIS de facture CHF 0). */
  const saveInvoiceDocument = async (opts: { toComplete: boolean; titleOverride?: string }): Promise<string | undefined> => {
    if (!result) return undefined;
    const now = Date.now();
    const qrRaw: string | undefined = result._qrRaw ? String(result._qrRaw) : undefined;
    const hasFile = !!result._originalUri;
    if (!hasFile && !qrRaw) return undefined; // rien de durable à conserver
    const docId = `doc_inv_${now}`;
    let vaultUri: string | undefined;
    if (hasFile) {
      vaultUri = await saveToVault(result._originalUri, docId, result._mime);
      if (!(await vaultFileExists(vaultUri))) throw new VaultError('SAVE_FAILED');
    }
    const isPdf = !!vaultUri && ((result._mime || '').includes('pdf') || vaultUri.toLowerCase().endsWith('.pdf'));
    addDocument({
      id: docId,
      title: opts.titleOverride || result.title || result.issuer || result.merchant || t('invoiceDocs.defaultTitle'),
      category: 'other',
      documentType: 'invoice',
      imageBase64: '',
      pdfUri: isPdf ? vaultUri : undefined,
      fileUri: !isPdf ? vaultUri : undefined,
      mimeType: hasFile ? result._mime : undefined,
      spcPayload: qrRaw, // payload SPC BRUT — jamais présenté comme l'original
      importedAt: now,
      tags: opts.toComplete ? ['invoice', 'import', 'toComplete'] : ['invoice', 'import'],
      note: t('emailImport.importedByAiNote'),
      createdAt: now,
      updatedAt: now,
    } as any);
    if (vaultUri) queueUpload(docId); // stockage privé (architecture Tâche 3)
    return docId;
  };

  const persistAsInvoice = async () => {
    if (!result) return;
    // TÂCHE 1 — JAMAIS d'enregistrement si l'extraction a échoué
    if (extractionFailed) {
      Alert.alert(t('importErrors.extractFailedTitle'), t('importErrors.extractFailedBody'));
      return;
    }
    const amount = resolvedAmount();
    // TÂCHE 5 §6 — montant absent (légal en Swiss QR) : le DOCUMENT est
    // conservé avec le statut « Montant à compléter » ; AUCUNE obligation
    // financière n'est créée tant que le montant n'est pas confirmé.
    if (amount === null) {
      if (result._originalUri || result._qrRaw) {
        Alert.alert(t('importErrors.amountMissingTitle'), t('invoiceDocs.noAmountBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('invoiceDocs.keepNoAmount'),
            onPress: async () => {
              try {
                await saveInvoiceDocument({ toComplete: true });
                Alert.alert(t('invoiceDocs.savedNoAmountTitle'), t('invoiceDocs.savedNoAmountBody'));
                setResult(null);
              } catch (e: any) {
                const code = e instanceof VaultError ? e.code : 'SAVE_FAILED';
                Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${code}`));
              }
            },
          },
        ]);
      } else {
        Alert.alert(t('importErrors.amountMissingTitle'), t('importErrors.amountMissingBody'));
      }
      return;
    }
    const doPersist = async () => {
      if (!result) return;
      let documentId: string | undefined;
      try {
        documentId = await saveInvoiceDocument({ toComplete: false });
      } catch (e: any) {
        const code = e instanceof VaultError ? e.code : 'SAVE_FAILED';
        Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${code}`));
        return; // l'original n'a pas pu être conservé → pas de faux succès
      }
      const isPhoto = result._source === 'photo' || result._source === 'qr';
      addInvoice({
        id: `inv_${Date.now()}`,
        title: result.title || result.merchant || t('emailImport.defaultInvoiceTitle'),
        issuer: result.issuer || result.merchant || t('emailImport.defaultUnknownIssuer'),
        amount,
        currency: result.currency || 'CHF',
        dueDate: result.due_date || undefined,
        invoiceDate: result.invoice_date || result.date || undefined,
        iban: result.iban || undefined,
        reference: result.reference || undefined,
        category: result.category || 'autre',
        status: 'pending',
        source: isPhoto ? 'scan' : 'email',
        createdAt: Date.now(),
        documentId,
        qrPayload: result._qrRaw ? String(result._qrRaw) : undefined,
      } as any);
      Alert.alert(t('emailImport.invoiceSavedTitle'), t('emailImport.invoiceSavedBody'));
      setResult(null);
      setManualAmount('');
    };
    // TÂCHE 5 §7 — doublon probable : montrer la facture connue, demander
    // confirmation — JAMAIS de 2e obligation financière silencieuse.
    const dup = findInvoiceDuplicate(invoices, {
      reference: result.reference,
      iban: result.iban,
      issuer: result.issuer || result.merchant,
      amount,
    });
    if (dup) {
      Alert.alert(
        t('invoiceDocs.dupTitle'),
        t('invoiceDocs.dupBody', { title: dup.title || '', amount: String(dup.amount ?? '') }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('invoiceDocs.dupConfirm'), onPress: doPersist },
        ],
      );
      return;
    }
    await doPersist();
  };

  /**
   * OCR failure fallback for invoices. Never saves an invoice with a fabricated
   * amount or converts a failed invoice scan into a contract.
   * A missing amount keeps only the original document (toComplete).
   */
  const persistManualInvoice = async () => {
    if (!result || !extractionFailed) return;
    const title = manualCt.title.trim();
    if (!title) { Alert.alert(t('contractsV2.manualNeedTitle')); return; }
    const issuer = manualCt.issuer.trim() || title;
    const rawAmount = manualCt.amount.trim();
    const amount = rawAmount ? normalizeChfAmount(rawAmount) : null;
    if (rawAmount && (amount === null || amount <= 0)) {
      Alert.alert(t('importErrors.amountInvalid'));
      return;
    }
    const commit = async () => {
      try {
        setBusy(true);
        const documentId = await saveInvoiceDocument({
          toComplete: amount === null,
          titleOverride: title,
        });
        if (!documentId) {
          Alert.alert(t('emailImport.importFailedTitle'), t('emailImport.importFailedFallback'));
          return;
        }
        if (amount !== null) {
          addInvoice({
            id: `inv_${Date.now()}`,
            title, issuer, amount, currency: 'CHF', category: 'autre',
            status: 'pending', source: 'manual', documentId,
            createdAt: Date.now(),
          } as any);
          Alert.alert(t('emailImport.invoiceSavedTitle'), t('emailImport.invoiceSavedBody'));
        } else {
          Alert.alert(t('invoiceDocs.savedNoAmountTitle'), t('invoiceDocs.savedNoAmountBody'));
        }
        setResult(null);
        setShowManualCt(false);
        setManualCt({ title: '', issuer: '', amount: '', expiry: '', category: 'autre' });
      } catch (e: any) {
        const code = e instanceof VaultError ? e.code : 'SAVE_FAILED';
        Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${code}`));
      } finally { setBusy(false); }
    };
    if (amount !== null) {
      const duplicate = findInvoiceDuplicate(invoices, { issuer, amount });
      if (duplicate) {
        Alert.alert(t('invoiceDocs.dupTitle'),
          t('invoiceDocs.dupBody', { title: duplicate.title || '', amount: String(duplicate.amount ?? '') }),
          [{ text: t('common.cancel'), style: 'cancel' },
           { text: t('invoiceDocs.dupConfirm'), onPress: () => { void commit(); } }]);
        return;
      }
    }
    await commit();
  };

  /** Save as Contract (Mon Classeur) */
  /** Noyau commun : enregistre fichier original (vault) + document lié +
   *  contrat. Utilisé par l'OCR ET par la saisie manuelle (OCR indisponible).
   *  JAMAIS de date/montant/renouvellement inventés. */
  const saveContractRecord = async (
    meta: { title: string; issuer?: string; category: string; amount: number | null; expirationDate?: string; startDate?: string },
    originalUri?: string,
    mime?: string,
  ) => {
    const now = Date.now();
    let documentId: string | undefined;
    if (originalUri) {
      try {
        const docId = `doc_${now}`;
        const vaultUri = await saveToVault(originalUri, docId, mime);
        if (!(await vaultFileExists(vaultUri))) throw new VaultError('SAVE_FAILED');
        const isPdf = (mime || '').includes('pdf') || vaultUri.toLowerCase().endsWith('.pdf');
        addDocument({
          id: docId,
          title: meta.title,
          category: 'contracts',
          imageBase64: isPdf ? '' : (originalUri.startsWith('data:') ? originalUri : ''),
          pdfUri: isPdf ? vaultUri : undefined,
          fileUri: isPdf ? undefined : vaultUri,
          mimeType: mime,
          documentType: 'contract', // TÂCHE 3 — espace Contrats
          importedAt: now,
          tags: ['contract', 'import'],
          note: t('emailImport.importedByAiNote'),
          createdAt: now,
          updatedAt: now,
        } as any);
        queueUpload(docId); // TÂCHE 3 — envoi différé vers le stockage privé
        documentId = docId;
      } catch (e: any) {
        const code = e instanceof VaultError ? e.code : 'SAVE_FAILED';
        Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${code}`));
        return false; // JAMAIS de succès si la pièce jointe n'a pas pu être conservée
      }
    }
    addContract({
      id: `ct_${now}`,
      title: meta.title,
      issuer: meta.issuer || undefined,
      amount: meta.amount ?? 0, // 0 = non renseigné (modifiable), jamais une obligation chiffrée
      expirationDate: meta.expirationDate || '',
      startDate: meta.startDate,
      urgent: false,
      autoRenew: undefined,
      category: meta.category,
      createdAt: now,
      notes: t('emailImport.importedByAiNote'),
      documentId,
    });
    Alert.alert(
      t('emailImport.contractSavedTitle'),
      documentId ? t('contractsV2.savedWithFile') : t('contractsV2.savedNoFile'),
      [
        { text: t('emailImport.okBtn'), style: 'cancel' },
        { text: t('contractsV2.openContracts'), onPress: () => router.push('/more/documents?filter=contracts' as any) },
      ],
    );
    setResult(null);
    setShowManualCt(false);
    setManualCt({ title: '', issuer: '', amount: '', expiry: '', category: 'autre' });
    return true;
  };

  const persistAsContract = async () => {
    if (!result) return;
    if (extractionFailed) {
      // OCR indisponible → parcours MANUEL (le fichier original est conservé)
      setShowManualCt(true);
      return;
    }
    await saveContractRecord(
      {
        title: result.title || result.merchant || result.issuer || t('emailImport.defaultContractTitle'),
        issuer: result.issuer || result.merchant || undefined,
        category: result.category || 'assurance',
        amount: normalizeChfAmount(result.amount) ?? normalizeChfAmount(result.total_amount),
        startDate: result.contract_start || undefined, // uniquement si réellement extrait
      },
      result._originalUri,
      result._mime,
    );
  };

  // TÂCHE 3 — TICKET DE DÉPENSE : enregistré dans le système de tickets
  // (receipts[]), JAMAIS dans invoices[]. Rattachement à une transaction
  // uniquement sur confirmation explicite de l'utilisateur.
  const persistAsReceipt = async () => {
    if (!result) return;
    const now = Date.now();
    const amount = normalizeChfAmount(result.amount) ?? normalizeChfAmount(result.total_amount);
    const title = result.merchant || result.title || result.issuer || t('docSpaces.defaultReceiptTitle');
    const rDate: string = result.date || new Date().toISOString().slice(0, 10);
    const rCat: string = result.category || 'autre';
    let documentId: string | undefined;
    if (result._originalUri) {
      try {
        const docId = `doc_${now}`;
        const vaultUri = await saveToVault(result._originalUri, docId, result._mime);
        if (!(await vaultFileExists(vaultUri))) throw new VaultError('SAVE_FAILED');
        const isPdf = (result._mime || '').includes('pdf') || vaultUri.toLowerCase().endsWith('.pdf');
        addDocument({
          id: docId,
          title,
          category: 'other',
          documentType: 'expense_receipt', // TÂCHE 3 — espace Tickets
          imageBase64: '',
          pdfUri: isPdf ? vaultUri : undefined,
          fileUri: isPdf ? undefined : vaultUri,
          mimeType: result._mime,
          importedAt: now,
          tags: ['receipt', 'import'],
          note: t('emailImport.importedByAiNote'),
          createdAt: now,
          updatedAt: now,
        } as any);
        queueUpload(docId);
        documentId = docId;
      } catch (e: any) {
        const code = e instanceof VaultError ? e.code : 'SAVE_FAILED';
        Alert.alert(t('contractsV2.fileErrorTitle'), t(`contractsV2.${code}`));
        return; // jamais de ticket sans sa pièce conservée
      }
    }
    const receiptId = `rcpt_${now}`;
    addReceipt({
      id: receiptId,
      imageBase64: '',
      merchant: title,
      amount: amount ?? 0, // 0 = montant non lu (jamais inventé)
      currency: result.currency || 'CHF',
      date: rDate,
      category: rCat,
      type: 'ticket',
      note: t('emailImport.importedByAiNote'),
      documentId,
      createdAt: now,
    } as any);
    setResult(null);
    if (amount != null && amount > 0) {
      Alert.alert(
        t('docSpaces.askLinkTxTitle'),
        t('docSpaces.askLinkTxBody', { amount: amount.toFixed(2) }),
        [
          {
            text: t('docSpaces.noExpense'),
            style: 'cancel',
            onPress: () => Alert.alert(t('docSpaces.receiptSavedTitle'), t('docSpaces.receiptSavedBody')),
          },
          {
            text: t('docSpaces.createExpense'),
            onPress: () => {
              const txId = `tx_${Date.now()}`;
              addTransaction({
                id: txId, title, amount, date: rDate, category: rCat,
                createdAt: Date.now(), updatedAt: Date.now(), synced: false,
                type: 'expense', source: 'manual',
              } as any);
              updateReceipt(receiptId, { transactionId: txId });
              Alert.alert(t('docSpaces.receiptSavedTitle'), t('docSpaces.receiptLinkedBody'));
            },
          },
        ],
      );
    } else {
      Alert.alert(t('docSpaces.receiptSavedTitle'), t('docSpaces.receiptSavedBody'));
    }
  };

  const saveInvoice = () => {
    if (!result) return;
    const docType: string = (result.document_type || '').toLowerCase();
    // The entry screen never silently overrides a different high-confidence
    // OCR classification. The user must confirm the destination explicitly.
    if (mode && !result.needs_user_confirmation &&
        ['invoice', 'contract', 'receipt'].includes(docType) && docType !== mode) {
      const saveDetected = docType === 'contract' ? persistAsContract
        : docType === 'receipt' ? persistAsReceipt : persistAsInvoice;
      const detectedLabel = docType === 'contract' ? t('emailImport.pickContractOption')
        : docType === 'receipt' ? t('docSpaces.pickTicketOption') : t('emailImport.pickInvoiceOption');
      const requestedLabel = mode === 'contract' ? t('emailImport.pickContractOption') : t('emailImport.pickInvoiceOption');
      Alert.alert(t('emailImport.docTypeConfirmTitle'), t('emailImport.docTypeConfirmBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: detectedLabel, onPress: () => { void saveDetected(); } },
        { text: requestedLabel, onPress: () => { void (mode === 'contract' ? persistAsContract() : persistAsInvoice()); } },
      ]);
      return;
    }
    if (mode === 'contract') return persistAsContract();
    if (mode === 'invoice') return persistAsInvoice();
    if (docType === 'contract') return persistAsContract();
    if (docType === 'invoice') return persistAsInvoice();
    if (docType === 'receipt') {
      // TÂCHE 3 — un ticket n'est JAMAIS transformé en facture
      // automatiquement : confirmation explicite demandée.
      Alert.alert(
        t('docSpaces.classifyTitle'),
        t('docSpaces.receiptConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('docSpaces.pickTicketOption'), onPress: persistAsReceipt },
          { text: t('emailImport.pickInvoiceOption'), onPress: persistAsInvoice },
        ],
      );
      return;
    }

    // Classification OCR incertaine → confirmation utilisateur (3 espaces)
    Alert.alert(
      t('emailImport.docTypeConfirmTitle'),
      t('emailImport.docTypeConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('emailImport.pickContractOption'), onPress: persistAsContract },
        { text: t('emailImport.pickInvoiceOption'), onPress: persistAsInvoice },
        { text: t('docSpaces.pickTicketOption'), onPress: persistAsReceipt },
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

        {/* Échec d'extraction : carte d'erreur — JAMAIS de badge succès */}
        {result && (result.success === false || result._failedOcr) && (
          <View style={[styles.resultCard, { borderColor: '#EF444455' }]}>
            <View style={styles.resultHeader}>
              <Ionicons name="alert-circle" size={22} color="#EF4444" />
              <Text style={styles.resultTitle}>{t('importErrors.extractFailedTitle')}</Text>
              <TouchableOpacity onPress={dismissResult} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.tipsText}>
              {mode === 'contract' ? t('emailImport.importFailedFallback') : t('importErrors.extractFailedBody')}
            </Text>
            {!showManualCt ? (
              <TouchableOpacity
                style={[styles.saveBtnAlt, { marginTop: 12 }]}
                onPress={() => setShowManualCt(true)}
                testID="contract-manual-entry"
              >
                <Ionicons name="create-outline" size={18} color={theme.text} />
                <Text style={styles.saveBtnAltTxt}>{t('contractsV2.manualEntry')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={styles.rowLabel}>{mode === 'contract' ? t('contractsV2.manualTitle') : t('invoices.labelTitle')}</Text>
                <TextInput style={styles.amountInput} value={manualCt.title} onChangeText={(v) => setManualCt((m) => ({ ...m, title: v }))} placeholder={t('contractsV2.manualName')} placeholderTextColor={theme.textTertiary} testID="manual-ct-title" />
                <TextInput style={styles.amountInput} value={manualCt.issuer} onChangeText={(v) => setManualCt((m) => ({ ...m, issuer: v }))} placeholder={t('contractsV2.manualIssuer')} placeholderTextColor={theme.textTertiary} />
                {mode === 'contract' && <>
                <Text style={styles.rowLabel}>{t('docSpaces.manualCategory')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CT_CATS.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setManualCt((m) => ({ ...m, category: c.id }))}
                      style={[styles.ctCatChip, manualCt.category === c.id && { borderColor: theme.primary }]}
                      testID={`manual-ct-cat-${c.id}`}
                    >
                      <Text style={{ color: manualCt.category === c.id ? theme.primary : theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t(`addContract.${c.tKey}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                </>}
                <TextInput style={styles.amountInput} value={manualCt.amount} onChangeText={(v) => setManualCt((m) => ({ ...m, amount: v }))} placeholder={t('contractsV2.manualAmount')} placeholderTextColor={theme.textTertiary} keyboardType="decimal-pad" />
                {manualCt.amount.length > 0 && normalizeChfAmount(manualCt.amount) === null && (
                  <Text style={{ color: '#EF4444', fontSize: 12 }}>{t('importErrors.amountInvalid')}</Text>
                )}
                {mode === 'contract' && <TextInput style={styles.amountInput} value={manualCt.expiry} onChangeText={(v) => setManualCt((m) => ({ ...m, expiry: v }))} placeholder={t('contractsV2.manualExpiry')} placeholderTextColor={theme.textTertiary} />}
                <TouchableOpacity
                  style={styles.saveBtnAlt}
                  testID="manual-ct-save"
                  onPress={async () => {
                    if (mode === 'invoice') { await persistManualInvoice(); return; }
                    if (!manualCt.title.trim()) { Alert.alert(t('contractsV2.manualNeedTitle')); return; }
                    if (manualCt.amount.trim() && normalizeChfAmount(manualCt.amount) === null) { Alert.alert(t('importErrors.amountInvalid')); return; }
                    if (manualCt.expiry.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(manualCt.expiry.trim())) { Alert.alert(t('contractsV2.manualExpiry')); return; }
                    await saveContractRecord(
                      {
                        title: manualCt.title.trim(),
                        issuer: manualCt.issuer.trim() || undefined,
                        category: manualCt.category,
                        amount: manualCt.amount.trim() ? normalizeChfAmount(manualCt.amount) : null,
                        expirationDate: manualCt.expiry.trim() || undefined,
                      },
                      result._originalUri,
                      result._mime,
                    );
                  }}
                >
                  <Ionicons name="save-outline" size={18} color={theme.text} />
                  <Text style={styles.saveBtnAltTxt}>{mode === 'contract' ? t('contractsV2.manualSave') : t('emailImport.ctaSaveInvoice')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Result preview */}
        {result && result.success !== false && !result._failedOcr && (() => {
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
              {resolvedAmount() !== null && !manualAmount ? (
                <Row label={t('emailImport.rowAmount')} value={`${result.currency || 'CHF'} ${resolvedAmount()!.toFixed(2)}`} highlight />
              ) : (
                <View style={styles.amountInputWrap}>
                  <Text style={styles.rowLabel}>{t('importErrors.amountInputLabel')} *</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={manualAmount}
                    onChangeText={setManualAmount}
                    placeholder={t('importErrors.amountPlaceholder')}
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    testID="import-amount-input"
                  />
                  {manualAmount.length > 0 && normalizeChfAmount(manualAmount) === null && (
                    <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{t('importErrors.amountInvalid')}</Text>
                  )}
                </View>
              )}
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
  ctCatChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card },
  saveBtnAlt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(52,211,153,0.16)', borderRadius: BorderRadius.md, paddingVertical: 12,
  },
  saveBtnAltTxt: { color: Colors.text, fontWeight: '700', fontSize: FontSizes.md },
  amountInputWrap: { marginTop: Spacing.sm },
  amountInput: {
    marginTop: 6, borderWidth: 1, borderColor: 'rgba(148,163,184,0.35)', borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 10, color: Colors.text, fontSize: FontSizes.lg,
    backgroundColor: Colors.card,
  },
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
