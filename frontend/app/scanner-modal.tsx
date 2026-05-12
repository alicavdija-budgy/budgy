/**
 * GUARDIAN MONEY CHF - Real Camera Scanner
 * Uses expo-camera to capture receipt photos and add them as transactions.
 *
 * Flow:
 *  1. Ask camera permission
 *  2. Show live camera preview with framing corners
 *  3. Capture photo (base64)
 *  4. Open an "edit receipt" form to set amount/title/category
 *  5. Save transaction with receipt attached
 *
 * On web/Expo Go where camera isn't available, falls back to manual entry.
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import type { ThemePalette } from '../src/constants/palettes';
import { useStore } from '../src/stores/useStore';
import { Button } from '../src/components/ui';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../src/data/swiss-data';
import { CategoryIcon } from '../src/components/CategoryIcon';
import type { ReceiptType } from '../src/types';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

type Stage = 'permission' | 'camera' | 'ocr' | 'edit' | 'saving';

export default function ScannerModal() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addTransaction, addReceipt } = useStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('camera');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [photo, setPhoto] = useState<{ uri: string; base64?: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  // Form state for edit stage
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('courses');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [note, setNote] = useState('Ajouté via scan');
  const [receiptType, setReceiptType] = useState<ReceiptType>('ticket');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Decide initial stage once we know permission status
  useEffect(() => {
    if (!permission) return; // still loading
    if (Platform.OS === 'web') {
      // Web (Expo preview) doesn't have a native camera permission flow for our use-case
      // Go straight to manual edit mode with a note.
      setStage('edit');
      return;
    }
    if (permission.granted) {
      setStage('camera');
    } else {
      setStage('permission');
    }
  }, [permission]);

  const handleRequestPermission = async () => {
    const res = await requestPermission();
    if (res.granted) {
      setStage('camera');
    } else {
      Alert.alert(
        'Permission refusée',
        "Autorisez l'accès à la caméra dans les réglages pour scanner vos tickets.",
        [{ text: 'OK' }]
      );
    }
  };

  const handleClose = () => {
    router.back();
  };

  const runOcr = async (b64: string) => {
    setStage('ocr');
    setOcrError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/scanner/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, mime_type: 'image/jpeg' }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.merchant) setTitle(data.merchant);
        if (data.total_amount) setAmount(String(data.total_amount));
        if (data.category) setCategory(data.category);
        if (data.receipt_type) setReceiptType(data.receipt_type as ReceiptType);
        setOcrConfidence(data.confidence || null);
        if (data.items && data.items.length) {
          setNote(`Articles: ${data.items.slice(0, 3).join(', ')}`);
        }
      } else {
        setOcrError(data.error || 'OCR a échoué — saisie manuelle');
      }
    } catch (e: any) {
      setOcrError(e?.message || 'Erreur réseau OCR');
    } finally {
      setStage('edit');
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    try {
      setCapturing(true);
      const pic = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: false,
      });
      if (pic?.uri) {
        setPhoto({ uri: pic.uri, base64: pic.base64 });
        if (pic.base64) {
          await runOcr(pic.base64);
        } else {
          setStage('edit');
        }
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de capturer la photo');
    } finally {
      setCapturing(false);
    }
  };

  const handleRetake = () => {
    setPhoto(null);
    setStage('camera');
  };

  const handleSave = () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) {
      Alert.alert('Montant invalide', 'Saisissez un montant valide.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Titre manquant', 'Saisissez le nom du commerce.');
      return;
    }
    setStage('saving');
    const now = new Date();
    const txId = `tx_${Date.now()}`;
    const receiptData = photo?.base64
      ? `data:image/jpeg;base64,${photo.base64}`
      : undefined;

    addTransaction({
      id: txId,
      title: title.trim(),
      amount: amt,
      date: now.toLocaleDateString('fr-CH'),
      category,
      paymentMethod: paymentMethod as any,
      note: note.trim() || undefined,
      receipt: receiptData,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      synced: false,
    });

    // Save to receipt gallery if we have a photo
    if (receiptData) {
      addReceipt({
        id: `rec_${Date.now()}`,
        imageBase64: receiptData,
        merchant: title.trim(),
        amount: amt,
        currency: 'CHF',
        date: now.toISOString().split('T')[0],
        category,
        type: receiptType,
        note: note.trim() || undefined,
        transactionId: txId,
        createdAt: now.getTime(),
      });
    }

    setTimeout(() => {
      router.back();
    }, 300);
  };

  // ---------- PERMISSION STAGE ----------
  if (stage === 'permission') {
    return (
      <View style={[styles.permContainer, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.closeBtnTop} onPress={handleClose}>
          <Ionicons name="close" size={28} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.permContent}>
          <LinearGradient
            colors={theme.gradientPrimary as [string, string]}
            style={styles.permIcon}
          >
            <Ionicons name="camera" size={48} color={theme.text} />
          </LinearGradient>
          <Text style={styles.permTitle}>Accès à la caméra</Text>
          <Text style={styles.permDesc}>
            Pour scanner vos tickets et factures, Budgy a besoin d'utiliser votre appareil
            photo.
          </Text>
          <Button
            title="Autoriser la caméra"
            onPress={handleRequestPermission}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.xl }}
          />
          <TouchableOpacity style={{ marginTop: Spacing.lg }} onPress={() => setStage('edit')}>
            <Text style={styles.skipLink}>Saisir manuellement</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------- CAMERA STAGE ----------
  if (stage === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
        />

        {/* Top bar */}
        <View style={[styles.cameraTop, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.cameraIconBtn} onPress={handleClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Scanner un ticket</Text>
          <TouchableOpacity
            style={styles.cameraIconBtn}
            onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
          >
            <Ionicons
              name={flash === 'on' ? 'flash' : 'flash-off'}
              size={22}
              color={flash === 'on' ? theme.warning : theme.text}
            />
          </TouchableOpacity>
        </View>

        {/* Framing overlay */}
        <View style={styles.frameOverlay} pointerEvents="none">
          <View style={styles.frameBox}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.frameHint}>Placez le ticket dans le cadre</Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.cameraIconBtn}
            onPress={() => setStage('edit')}
          >
            <Ionicons name="create-outline" size={22} color={theme.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            disabled={capturing}
            activeOpacity={0.7}
          >
            <View style={styles.captureInner}>
              {capturing ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <Ionicons name="camera" size={32} color={theme.background} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cameraIconBtn}
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
          >
            <Ionicons name="camera-reverse-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------- OCR LOADING STAGE ----------
  if (stage === 'ocr') {
    return (
      <View style={styles.ocrContainer}>
        {photo && (
          <Image source={{ uri: photo.uri }} style={styles.ocrBgImage} resizeMode="cover" blurRadius={6} />
        )}
        <View style={styles.ocrOverlay}>
          <View style={styles.ocrCard}>
            <ActivityIndicator size="large" color={theme.primaryLight} />
            <Text style={styles.ocrTitle}>Analyse du ticket par IA</Text>
            <Text style={styles.ocrSubtitle}>
              Extraction du commerçant, montant, date et catégorie...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ---------- EDIT STAGE ----------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.editContainer, { paddingTop: insets.top }]}
    >
      <View style={styles.editHeader}>
        <TouchableOpacity onPress={photo ? handleRetake : handleClose} style={styles.iconBtn}>
          <Ionicons name={photo ? 'arrow-back' : 'close'} size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.editTitle}>Détails du ticket</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.editContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* OCR result banner */}
        {ocrConfidence !== null && (
          <View style={styles.ocrBanner}>
            <Ionicons name="sparkles" size={16} color={theme.primaryLight} />
            <Text style={styles.ocrBannerText}>
              Données pré-remplies par IA · confiance {Math.round(ocrConfidence * 100)}%
            </Text>
          </View>
        )}
        {ocrError && (
          <View style={[styles.ocrBanner, { backgroundColor: `${theme.warning}15` }]}>
            <Ionicons name="alert-circle" size={16} color={theme.warning} />
            <Text style={[styles.ocrBannerText, { color: theme.warning }]}>{ocrError}</Text>
          </View>
        )}

        {/* Receipt type toggle */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Type de reçu</Text>
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[
                styles.typeOption,
                receiptType === 'ticket' && styles.typeOptionSelected,
              ]}
              onPress={() => setReceiptType('ticket')}
            >
              <Text style={styles.typeEmoji}>🛒</Text>
              <Text
                style={[
                  styles.typeLabel,
                  receiptType === 'ticket' && styles.typeLabelSelected,
                ]}
              >
                Ticket de caisse
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeOption,
                receiptType === 'remboursement' && styles.typeOptionSelected,
              ]}
              onPress={() => setReceiptType('remboursement')}
            >
              <Text style={styles.typeEmoji}>💼</Text>
              <Text
                style={[
                  styles.typeLabel,
                  receiptType === 'remboursement' && styles.typeLabelSelected,
                ]}
              >
                Remboursement
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Preview */}
        {photo ? (
          <View style={styles.previewCard}>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" />
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
              <Ionicons name="refresh" size={16} color={theme.text} />
              <Text style={styles.retakeText}>Reprendre</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noPhotoCard}>
            <Ionicons name="document-text-outline" size={40} color={theme.textTertiary} />
            <Text style={styles.noPhotoText}>Saisie manuelle</Text>
            {Platform.OS !== 'web' && permission?.granted && (
              <TouchableOpacity onPress={() => setStage('camera')}>
                <Text style={styles.openCameraText}>Ouvrir la caméra</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Commerce / Titre</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="storefront-outline" size={20} color={theme.textTertiary} />
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Migros, Coop, Pharmacie..."
              placeholderTextColor={theme.textTertiary}
            />
          </View>
        </View>

        {/* Amount */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Montant</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.currencyLabel}>CHF</Text>
            <TextInput
              style={[styles.input, { fontSize: FontSizes.xl, fontWeight: FontWeights.bold }]}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Category */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {EXPENSE_CATEGORIES.slice(0, 10).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, category === c.id && styles.chipSelected]}
                  onPress={() => setCategory(c.id)}
                >
                  <CategoryIcon category={c.id} size="sm" showBackground={false} />
                  <Text
                    style={[styles.chipText, category === c.id && styles.chipTextSelected]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Payment method */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Moyen de paiement</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.slice(0, 8).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, paymentMethod === p.id && styles.chipSelected]}
                  onPress={() => setPaymentMethod(p.id)}
                >
                  <Ionicons name={p.icon as any} size={14} color={theme.textSecondary} />
                  <Text
                    style={[
                      styles.chipText,
                      paymentMethod === p.id && styles.chipTextSelected,
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Note */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Note (optionnel)</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="document-text-outline" size={20} color={theme.textTertiary} />
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Détails supplémentaires"
              placeholderTextColor={theme.textTertiary}
            />
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={[styles.saveFooter, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={stage === 'saving' ? 'Enregistrement...' : 'Enregistrer la dépense'}
          onPress={handleSave}
          fullWidth
          size="lg"
          loading={stage === 'saving'}
          icon="checkmark-circle"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  // Permission
  permContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  closeBtnTop: {
    position: 'absolute',
    top: Spacing.lg + 20,
    right: Spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  permIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  permTitle: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  permDesc: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  skipLink: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    textDecorationLine: 'underline',
  },

  // Camera
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 5,
  },
  cameraTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  cameraIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: '80%',
    aspectRatio: 0.7,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: Colors.primaryLight,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  frameHint: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  cameraBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.text,
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Edit
  editContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  editContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  previewCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  retakeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  retakeText: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  noPhotoCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  noPhotoText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  openCameraText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    textDecorationLine: 'underline',
    marginTop: Spacing.xs,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  currencyLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  chipSelected: {
    backgroundColor: `${Colors.primary}25`,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  chipTextSelected: {
    color: Colors.primaryLight,
  },
  saveFooter: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },

  // OCR loading
  ocrContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  ocrBgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  ocrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  ocrCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 240,
  },
  ocrTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  ocrSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },

  // OCR banner in edit
  ocrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: `${Colors.primary}18`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  ocrBannerText: {
    flex: 1,
    color: Colors.primaryLight,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },

  // Type toggle
  typeToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeOption: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  typeOptionSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  typeEmoji: { fontSize: 22 },
  typeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  typeLabelSelected: {
    color: Colors.text,
  },
});
