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

const CONTRACT_TYPES = [
  { id: 'abonnements', label: 'Téléphone / Internet', emoji: '📱' },
  { id: 'assurances', label: 'Assurance', emoji: '🛡️' },
  { id: 'logement', label: 'Logement / Loyer', emoji: '🏠' },
  { id: 'transports', label: 'Transport / Auto', emoji: '🚗' },
  { id: 'sante', label: 'Santé / Mutuelle', emoji: '💊' },
  { id: 'energie', label: 'Énergie', emoji: '⚡' },
  { id: 'autre', label: 'Autre', emoji: '📄' },
];

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

  const { addContract } = useStore();
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
    const t = title.trim();
    const amt = parseFloat(amount.replace(',', '.'));
    if (!t) {
      Alert.alert('Nom manquant', 'Saisissez le nom du contrat.');
      return;
    }
    if (!amt || isNaN(amt) || amt <= 0) {
      Alert.alert('Montant invalide', 'Saisissez un montant valide.');
      return;
    }
    setSaving(true);
    try {
      const id = `ct_${Date.now()}`;
      const expirationDate = dueDate.trim() || '—';
      addContract({
        id,
        title: t,
        amount: amt,
        expirationDate,
        urgent: false,
        category,
        createdAt: Date.now(),
      });
      // Schedule J-90/J-30/J-7/J-1 reminders if a valid due date is detected
      const iso = toISODate(expirationDate);
      if (iso) {
        scheduleDeadlineRemindersForEntity(id, {
          type: 'contract',
          name: t,
          dueDate: iso,
          amount: amt,
        }).catch(() => {});
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert(
        'Contrat ajouté ✓',
        iso
          ? 'Rappels d\'échéance programmés (J-90, J-30, J-7 et J-1).'
          : 'Contrat ajouté à votre classeur.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sauvegarde impossible.');
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
          <Text style={styles.titleHeader}>Vérification</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}>
          {/* IA Banner */}
          <LinearGradient colors={[`${theme.primary}25`, `${theme.primary}08`]} style={styles.iaCard}>
            <View style={styles.iaIcon}>
              <Ionicons name="sparkles" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.iaTitle}>Champs détectés par l'IA</Text>
              <Text style={styles.iaSub}>Vérifiez les informations avant ajout</Text>
            </View>
          </LinearGradient>

          {/* Attached photo preview */}
          {params.photoUri && (
            <View style={styles.photoCard}>
              <Image source={{ uri: params.photoUri }} style={styles.photoImg} resizeMode="cover" />
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeTxt}>📄 Document scanné</Text>
              </View>
            </View>
          )}

          {/* Extracted fields display */}
          <View style={styles.fieldsCard}>
            {[
              { label: 'Nom du contrat', value: title || '—', icon: 'document-text-outline' },
              { label: 'Fournisseur', value: issuer || '—', icon: 'business-outline' },
              { label: 'Type', value: CONTRACT_TYPES.find(c => c.id === category)?.label || '—', icon: 'pricetag-outline' },
              { label: 'Montant', value: amount ? `CHF ${amount}` : '—', icon: 'cash-outline', highlight: true },
              { label: 'Date d\'échéance', value: dueDate || '—', icon: 'calendar-outline', highlight: !!dueDate },
              { label: 'Renouvellement', value: autoRenew ? 'Automatique' : 'Manuel', icon: 'refresh-outline' },
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
                Vous recevrez des rappels à J-90, J-30, J-7 et J-1 avant l'échéance.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky CTAs */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            title="Modifier avant ajout"
            variant="secondary"
            onPress={() => setEditing(true)}
            fullWidth
            icon="create-outline"
            style={{ marginBottom: Spacing.sm }}
          />
          <Button
            title="Ajouter le contrat"
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
          {hasExtractedData ? 'Modifier le contrat' : 'Nouveau contrat'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Nom du contrat *</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="document-text-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Sunrise mobile, Bail logement..."
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>Fournisseur</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="business-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={issuer}
            onChangeText={setIssuer}
            placeholder="Sunrise, Swisscom, AXA..."
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>Montant mensuel (CHF) *</Text>
        <View style={styles.inputWrap}>
          <Text style={styles.currencyTag}>CHF</Text>
          <TextInput
            style={[styles.input, { fontSize: FontSizes.xl, fontWeight: FontWeights.bold }]}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
            placeholder="49.90"
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>Type / Catégorie</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {CONTRACT_TYPES.map((t) => {
              const selected = category === t.id;
              const cat = EXPENSE_CATEGORIES.find(c => c.id === t.id);
              const c = cat?.color || theme.primary;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chip, selected && { backgroundColor: `${c}25`, borderColor: c }]}
                  onPress={() => setCategory(t.id)}
                >
                  <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
                  <Text style={[styles.chipText, selected && { color: c }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={styles.label}>Date de début</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="calendar-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="JJ.MM.AAAA"
            placeholderTextColor={theme.textTertiary}
          />
        </View>

        <Text style={styles.label}>Date d'échéance (recommandé)</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="alarm-outline" size={20} color={theme.warning} />
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="JJ.MM.AAAA"
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <Text style={styles.hint}>
          Si renseignée → rappels automatiques J-90 / J-30 / J-7 / J-1
        </Text>

        <View style={styles.switchCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Renouvellement automatique</Text>
            <Text style={styles.switchHint}>Le contrat se prolonge tacitement</Text>
          </View>
          <Switch
            value={autoRenew}
            onValueChange={setAutoRenew}
            trackColor={{ false: theme.cardBorder, true: theme.primary }}
          />
        </View>

        <Text style={styles.label}>Délai de résiliation (mois)</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="time-outline" size={20} color={theme.textTertiary} />
          <TextInput
            style={styles.input}
            value={noticePeriod}
            onChangeText={(t) => setNoticePeriod(t.replace(/[^0-9]/g, ''))}
            placeholder="3"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
          />
        </View>

        <Text style={styles.label}>Notes (optionnel)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Numéro de client, détails de résiliation..."
          placeholderTextColor={theme.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={saving ? 'Ajout en cours...' : 'Ajouter le contrat'}
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
