/**
 * BUDGY — Ajout manuel d'un Ticket / Reçu
 *
 * Fallback complet pour quand l'OCR échoue ou que l'utilisateur préfère saisir
 * manuellement (cas Suisse fréquent: tickets froissés, encre pâle, photos floues).
 *
 * @i18n-technical-file
 *
 * ⚠ FR-CH inlined default alerts (galerie/caméra permission text) + merchant
 * placeholder listing Swiss brands as examples. Full multi-locale copy via
 * i18n keys `receiptManual.*` — v3.9.1 backlog.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import type { ThemePalette } from '../../src/constants/palettes';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Button } from '../../src/components/ui';
import { CategoryIcon } from '../../src/components/CategoryIcon';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../../src/data/swiss-data';
import { normalizeImageForUpload } from '../../src/lib/imageUpload';
import type { ReceiptType } from '../../src/types';

export default function AddReceiptManualScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addReceipt, addTransaction } = useStore();

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('fr-CH'));
  const [category, setCategory] = useState('courses');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [type, setType] = useState<ReceiptType>('ticket');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos', 'Autorisez l\'accès à la galerie pour joindre une photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const norm = await normalizeImageForUpload(result.assets[0].uri, { includeBase64: true, quality: 0.8 });
        if (norm.base64) setPhotoDataUrl(`data:image/jpeg;base64,${norm.base64}`);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || t('receiptManual.photoFail'));
    }
  };

  const pickFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Caméra', 'Autorisez l\'accès à la caméra pour prendre une photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const norm = await normalizeImageForUpload(result.assets[0].uri, { includeBase64: true, quality: 0.8 });
        if (norm.base64) setPhotoDataUrl(`data:image/jpeg;base64,${norm.base64}`);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Capture impossible.');
    }
  };

  const handleSave = () => {
    const merchantTrim = merchant.trim();
    const amt = parseFloat(amount.replace(',', '.'));
    if (!merchantTrim) {
      Alert.alert('Commerce manquant', t('receiptManual.errMerchant'));
      return;
    }
    if (!amt || isNaN(amt) || amt <= 0) {
      Alert.alert('Montant invalide', t('receiptManual.errAmount'));
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const id = `rec_${now}`;
      const txId = `tx_${now}`;
      const isoDate = new Date().toISOString().split('T')[0];
      addReceipt({
        id,
        imageBase64: photoDataUrl || '',
        merchant: merchantTrim,
        amount: amt,
        currency: 'CHF',
        date: isoDate,
        category,
        type,
        note: note.trim() || undefined,
        transactionId: type === 'ticket' ? txId : undefined,
        createdAt: now,
      });
      // For tickets, also create the linked transaction in expenses
      if (type === 'ticket') {
        addTransaction({
          id: txId,
          title: merchantTrim,
          amount: amt,
          date,
          category,
          paymentMethod: paymentMethod as any,
          note: note.trim() || undefined,
          receipt: photoDataUrl || undefined,
          createdAt: now,
          updatedAt: now,
          synced: false,
        });
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      router.back();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Ajout manuel</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type toggle */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'ticket' && styles.typeBtnOn]}
            onPress={() => setType('ticket')}
          >
            <Text style={styles.typeEmoji}>🛒</Text>
            <Text style={[styles.typeLabel, type === 'ticket' && styles.typeLabelOn]}>
              Ticket de caisse
            </Text>
            <Text style={[styles.typeHint, type === 'ticket' && { color: theme.primary }]}>
              Crée aussi une dépense
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'remboursement' && styles.typeBtnOn]}
            onPress={() => setType('remboursement')}
          >
            <Text style={styles.typeEmoji}>💼</Text>
            <Text style={[styles.typeLabel, type === 'remboursement' && styles.typeLabelOn]}>
              Remboursement
            </Text>
            <Text style={[styles.typeHint, type === 'remboursement' && { color: theme.primary }]}>
              À refacturer
            </Text>
          </TouchableOpacity>
        </View>

        {/* Merchant */}
        <Text style={styles.label}>Commerce *</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="storefront-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Migros, Coop, Pharmacie..."
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        {/* Amount */}
        <Text style={styles.label}>Montant *</Text>
        <View style={styles.inputWrap}>
          <Text style={styles.currencyTag}>CHF</Text>
          <TextInput
            style={[styles.input, { fontSize: FontSizes.xl, fontWeight: FontWeights.bold }]}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
            placeholder="0.00"
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="calendar-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="JJ.MM.AAAA"
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        {/* Category */}
        <Text style={styles.label}>Catégorie</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {EXPENSE_CATEGORIES.slice(0, 10).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, category === c.id && { backgroundColor: `${c.color}25`, borderColor: c.color }]}
                onPress={() => setCategory(c.id)}
              >
                <CategoryIcon category={c.id} size="sm" showBackground={false} />
                <Text style={[styles.chipText, category === c.id && { color: c.color }]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Payment method (only for tickets) */}
        {type === 'ticket' && (
          <>
            <Text style={styles.label}>Moyen de paiement</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {PAYMENT_METHODS.slice(0, 8).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, paymentMethod === p.id && { backgroundColor: `${p.color}25`, borderColor: p.color }]}
                    onPress={() => setPaymentMethod(p.id)}
                  >
                    <Ionicons name={p.icon as any} size={14} color={p.color} />
                    <Text style={[styles.chipText, paymentMethod === p.id && { color: p.color }]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* Note */}
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

        {/* Photo attachment (optional) */}
        <Text style={styles.label}>Pièce jointe (optionnel)</Text>
        {photoDataUrl ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: photoDataUrl }} style={styles.photoImg} resizeMode="cover" />
            <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoDataUrl(null)}>
              <Ionicons name="close-circle" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.photoBtn} onPress={pickFromCamera}>
              <Ionicons name="camera-outline" size={20} color={theme.primary} />
              <Text style={styles.photoBtnTxt}>Caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery}>
              <Ionicons name="images-outline" size={20} color={theme.primary} />
              <Text style={styles.photoBtnTxt}>Galerie</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={saving ? 'Enregistrement...' : type === 'ticket' ? t('receiptManual.saveTicket') : t('receiptManual.saveReimb')}
          onPress={handleSave}
          loading={saving}
          fullWidth
          size="lg"
          icon="checkmark-circle"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
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

  label: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.md,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
  },
  currencyTag: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  typeBtnOn: {
    backgroundColor: `${Colors.primary}15`,
    borderColor: Colors.primary,
  },
  typeEmoji: { fontSize: 28, marginBottom: 4 },
  typeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  typeLabelOn: { color: Colors.text },
  typeHint: { color: Colors.textTertiary, fontSize: 10, marginTop: 2 },

  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },

  photoActions: { flexDirection: 'row', gap: Spacing.md },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  photoBtnTxt: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  photoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
  },
});
