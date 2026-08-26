/**
 * BUDGY — Ajouter / Vérifier un contrat
 *
 * Page d'ajout dédiée appelée :
 *   - manuellement depuis Mon Classeur ou Expenses > Contrats
 *   - automatiquement après scan/import OCR d'un contrat (params extraits)
 *
 * Garantit qu'AUCUN flow contrat ne se termine sans un bouton "Ajouter le contrat".
 * Notifications J-90/J-30/J-7/J-1 schedulées automatiquement si une date d'échéance
 * est détectée et valide.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, Image, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Button } from '../../src/components/ui';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';
import { scheduleDeadlineRemindersForEntity } from '../../src/services/notifications';
import type { DocumentCategory } from '../../src/types';
import { useTranslation } from '../../src/hooks/useTranslation';

const CONTRACT_TYPE_KEYS = [
  { id: 'abonnements', tKey: 'typePhone', emoji: '📱' },
  { id: 'assurances', tKey: 'typeInsurance', emoji: '🛡️' },
  { id: 'logement', tKey: 'typeHousing', emoji: '🏠' },
  { id: 'transports', tKey: 'typeTransport', emoji: '🚗' },
  { id: 'sante', tKey: 'typeHealth', emoji: '💊' },
  { id: 'energie', tKey: 'typeEnergy', emoji: '⚡' },
  { id: 'autre', tKey: 'typeOther', emoji: '📄' },
] as const;

function toISODate(s: string): string | null {
  if (!s) return null;
  const a = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (a) return s;
  const b = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (b) return `${b[3]}-${b[2].padStart(2, '0')}-${b[1].padStart(2, '0')}`;
  return null;
}

export default function AddContractScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const CONTRACT_TYPES = useMemo(
    () => CONTRACT_TYPE_KEYS.map((c) => ({ id: c.id, label: t(`addContract.${c.tKey}`), emoji: c.emoji })),
    [t]
  );
  const params = useLocalSearchParams<{
    title?: string;
    issuer?: string;
    amount?: string;
    dueDate?: string;
    startDate?: string;
    category?: string;
    notes?: string;
    photoUri?: string;
    source?: string; // 'scan' | 'pdf' | 'manual' | 'email'
  }>();

  const { addContract, addDocument } = useStore();
  const source = params.source || 'manual';
  const hasExtractedData = source !== 'manual' && (
    !!params.title || !!params.issuer || !!params.amount || !!params.dueDate
  );

  // Form state — pre-filled from OCR params if provided
  const [title, setTitle] = useState(params.title || '');
  const [issuer, setIssuer] = useState(params.issuer || '');
  const [amount, setAmount] = useState(params.amount || '');
  const [category, setCategory] = useState(params.category || 'abonnements');
  const [startDate, setStartDate] = useState(params.startDate || '');
  const [dueDate, setDueDate] = useState(params.dueDate || '');
  const [autoRenew, setAutoRenew] = useState(true);
  const [noticePeriod, setNoticePeriod] = useState('3');
  const [notes, setNotes] = useState(params.notes || '');
  const [editing, setEditing] = useState(!hasExtractedData); // start in edit mode if manual
  const [saving, setSaving] = useState(false);

  const handleAdd = () => {
    const tt = title.trim();
    const amt = parseFloat(amount.replace(',', '.'));
    if (!tt) {
      Alert.alert(t('addContract.missingNameTitle'), t('addContract.missingNameBody'));
      return;
    }
    if (!amt || isNaN(amt) || amt <= 0) {
      Alert.alert(t('addContract.invalidAmountTitle'), t('addContract.invalidAmountBody'));
      return;
    }
    setSaving(true);
    try {
      const id = `ct_${Date.now()}`;
      const expirationDate = dueDate.trim() || '—';
      const noticeP = parseInt(noticePeriod) || 0;

      // Save linked document into Mon Classeur if we have a photo
      let documentId: string | undefined;
      if (params.photoUri) {
        documentId = `doc_${Date.now()}`;
        const docCategory: DocumentCategory =
          category === 'sante' ? 'health'
          : category === 'assurances' ? 'insurance'
          : category === 'logement' ? 'other'
          : 'contracts';
        addDocument({
          id: documentId,
          title: tt,
          category: docCategory,
          imageBase64: params.photoUri,
          pages: [params.photoUri],
          tags: [issuer.trim(), category, 'contrat'].filter(Boolean),
          note: notes.trim() || undefined,
          expiresAt: toISODate(expirationDate) || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      addContract({
        id,
        title: tt,
        amount: amt,
        expirationDate,
        urgent: false,
        category,
        createdAt: Date.now(),
        issuer: issuer.trim() || undefined,
        startDate: startDate.trim() || undefined,
        autoRenew,
        noticePeriod: noticeP > 0 ? noticeP : undefined,
        notes: notes.trim() || undefined,
        photoUri: params.photoUri,
        documentId,
      });

      // Schedule J-90/J-30/J-7/J-1 reminders if a valid due date is detected
      const iso = toISODate(expirationDate);
      if (iso) {
        scheduleDeadlineRemindersForEntity(id, {
          type: 'contract',
          name: tt,
          dueDate: iso,
          amount: amt,
        }).catch(() => {});
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const msg = documentId
        ? (iso ? t('addContract.msgDocReminders') : t('addContract.msgDocOnly'))
        : (iso ? t('addContract.msgRemindersOnly') : t('addContract.msgContractOnly'));
      Alert.alert(
        t('addContract.successTitle'),
        msg,
        [{
          text: t('addContract.viewInBinder'),
          onPress: () => router.replace('/more/documents' as any),
        }]
      );
    } catch (e: any) {
      Alert.alert(t('addContract.errorTitle'), e?.message || t('addContract.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ─────────────── Verification Screen (post-scan) ────────────────
  if (!editing && hasExtractedData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.titleHeader}>{t('addContract.headerVerify')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}>
          {/* IA Banner */}
          <LinearGradient colors={[`${theme.primary}25`, `${theme.primary}08`]} style={styles.iaCard}>
            <View style={styles.iaIcon}>
              <Ionicons name="sparkles" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.iaTitle}>{t('addContract.iaTitle')}</Text>
              <Text style={styles.iaSub}>{t('addContract.iaSub')}</Text>
            </View>
          </LinearGradient>

          {/* Attached photo preview */}
          {params.photoUri && (
            <View style={styles.photoCard}>
              <Image source={{ uri: params.photoUri }} style={styles.photoImg} resizeMode="cover" />
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeTxt}>{t('addContract.badgeScanned')}</Text>
              </View>
            </View>
          )}

          {/* Extracted fields display */}
          <View style={styles.fieldsCard}>
            {[
              { label: t('addContract.fieldContractName'), value: title || t('addContract.dashValue'), icon: 'document-text-outline' },
              { label: t('addContract.fieldProvider'), value: issuer || t('addContract.dashValue'), icon: 'business-outline' },
              { label: t('addContract.fieldType'), value: CONTRACT_TYPES.find(c => c.id === category)?.label || t('addContract.dashValue'), icon: 'pricetag-outline' },
              { label: t('addContract.fieldAmount'), value: amount ? `CHF ${amount}` : t('addContract.dashValue'), icon: 'cash-outline', highlight: true },
              { label: t('addContract.fieldDueDate'), value: dueDate || t('addContract.dashValue'), icon: 'calendar-outline', highlight: !!dueDate },
              { label: t('addContract.fieldRenewal'), value: autoRenew ? t('addContract.renewalAuto') : t('addContract.renewalManual'), icon: 'refresh-outline' },
            ].map((f, i) => (
              <View key={i} style={[styles.fieldRow, i === 0 && { borderTopWidth: 0 }]}>
                <Ionicons name={f.icon as any} size={18} color={theme.textTertiary} />
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <Text style={[styles.fieldValue, f.highlight && { color: theme.primary, fontWeight: '800' }]}>
                  {f.value}
                </Text>
              </View>
            ))}
          </View>

          {dueDate && toISODate(dueDate) && (
            <View style={styles.notifTip}>
              <Ionicons name="notifications" size={18} color={theme.success} />
              <Text style={styles.notifTipTxt}>
                {t('addContract.reminderTip')}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky CTAs */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            title={t('addContract.ctaEditBeforeAdd')}
            variant="secondary"
            onPress={() => setEditing(true)}
            fullWidth
            icon="create-outline"
            style={{ marginBottom: Spacing.sm }}
          />
          <Button
            title={t('addContract.ctaAddContract')}
            onPress={handleAdd}
            loading={saving}
            fullWidth
            size="lg"
            icon="checkmark-circle"
          />
        </View>
      </View>
    );
  }

  // ─────────────── Edit / Manual Form ────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.titleHeader}>
          {hasExtractedData ? t('addContract.headerEdit') : t('addContract.headerNew')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>{t('addContract.labelContractName')}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="document-text-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('addContract.placeholderContractName')}
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelProvider')}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="business-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={issuer}
            onChangeText={setIssuer}
            placeholder={t('addContract.placeholderProvider')}
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelAmount', { currency: 'CHF' })}</Text>
        <View style={styles.inputWrap}>
          <Text style={styles.currencyTag}>CHF</Text>
          <TextInput
            style={[styles.input, { fontSize: FontSizes.xl, fontWeight: FontWeights.bold }]}
            value={amount}
            onChangeText={(txt) => setAmount(txt.replace(/[^0-9.,]/g, ''))}
            placeholder={t('addContract.placeholderAmount')}
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelType')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {CONTRACT_TYPES.map((typ) => {
              const selected = category === typ.id;
              const cat = EXPENSE_CATEGORIES.find(c => c.id === typ.id);
              const c = cat?.color || theme.primary;
              return (
                <TouchableOpacity
                  key={typ.id}
                  style={[styles.chip, selected && { backgroundColor: `${c}25`, borderColor: c }]}
                  onPress={() => setCategory(typ.id)}
                >
                  <Text style={{ fontSize: 14 }}>{typ.emoji}</Text>
                  <Text style={[styles.chipText, selected && { color: c }]}>{typ.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={styles.label}>{t('addContract.labelStartDate')}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="calendar-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('addContract.placeholderDate')}
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelDueDate')}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="alarm-outline" size={20} color={theme.warning} />
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder={t('addContract.placeholderDate')}
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <Text style={styles.hint}>
          {t('addContract.hintDueDate')}
        </Text>

        <View style={styles.switchCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>{t('addContract.labelAutoRenew')}</Text>
            <Text style={styles.switchHint}>{t('addContract.hintAutoRenew')}</Text>
          </View>
          <Switch
            value={autoRenew}
            onValueChange={setAutoRenew}
            trackColor={{ false: theme.cardBorder, true: theme.primary }}
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelNoticePeriod')}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="time-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={noticePeriod}
            onChangeText={(txt) => setNoticePeriod(txt.replace(/[^0-9]/g, ''))}
            placeholder="3"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
          />
        </View>

        <Text style={styles.label}>{t('addContract.labelNotes')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('addContract.placeholderNotes')}
          placeholderTextColor={theme.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={saving ? t('addContract.ctaAdding') : t('addContract.ctaAddContract')}
          onPress={handleAdd}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleHeader: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },

  iaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: `${Colors.primary}30`,
    marginBottom: Spacing.md,
  },
  iaIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: `${Colors.primary}25`,
    alignItems: 'center', justifyContent: 'center',
  },
  iaTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  iaSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },

  photoCard: {
    aspectRatio: 4 / 3, borderRadius: BorderRadius.lg, overflow: 'hidden',
    backgroundColor: Colors.card, marginBottom: Spacing.md, position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  photoBadge: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  photoBadgeTxt: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  fieldsCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.cardBorder,
    marginBottom: Spacing.md, paddingHorizontal: Spacing.md,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.cardBorder,
  },
  fieldLabel: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm },
  fieldValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: '700' },

  notifTip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${Colors.success}15`,
    borderWidth: 1, borderColor: `${Colors.success}30`,
    padding: Spacing.md, borderRadius: BorderRadius.md,
  },
  notifTipTxt: { flex: 1, color: Colors.success, fontSize: 12, lineHeight: 17 },

  label: {
    color: Colors.textSecondary, fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.md, marginBottom: 6,
  },
  hint: { color: Colors.textTertiary, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, gap: 8,
  },
  input: {
    flex: 1, color: Colors.text, fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
  },
  multiline: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md, minHeight: 80,
  },
  currencyTag: {
    color: Colors.textSecondary, fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card,
  },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },

  switchCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.cardBorder,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  switchLabel: { color: Colors.text, fontSize: FontSizes.md, fontWeight: '700' },
  switchHint: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.cardBorder,
  },
});
