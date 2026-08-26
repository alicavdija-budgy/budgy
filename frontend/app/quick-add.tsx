/**
 * BUDGY — Quick-Add deep-link handler
 *
 * Universal endpoint for Siri Shortcuts / Google App Actions / any external
 * source that wants to add an operation in Budgy.
 *
 * Deep-link patterns:
 *
 *   budgy://quick-add?text=Ajoute%2025%20CHF%20chez%20Migros&source=siri
 *   budgy://quick-add?text=Salaire%203200%20CHF&source=google_assistant
 *   https://budgy.ch/quick-add?text=...&source=share
 *
 * The route receives free-text, runs it through `smartInput()` (local-first
 * regex parser → backend fallback), shows a confirmation preview, then
 * commits the operation to the local Zustand store and routes back home.
 *
 * Siri setup (iOS, post-prebuild — documented in DEPLOYMENT.md):
 *   1. The user creates a Siri Shortcut from the Shortcuts app:
 *      Action = "Open URLs" → URL = budgy://quick-add?text={input}&source=siri
 *      Trigger phrase = "Ajoute une dépense Budgy"
 *   2. Saying "Dis Siri, ajoute une dépense Budgy" → Siri prompts for the
 *      sentence → opens Budgy on /quick-add with the dictated text.
 *
 * Android setup:
 *   App Actions / Assistant deep-link to `intent://quick-add?text=...&source=google_assistant#Intent;scheme=budgy;...`
 *   (Configuration in AndroidManifest after EAS prebuild.)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import { useTranslation } from '../src/hooks/useTranslation';
import type { ThemePalette } from '../src/constants/palettes';
import { smartInput, type SmartInputSource, type SmartInputResult } from '../src/lib/smartInput';
import { useStore } from '../src/stores/useStore';
import { Button } from '../src/components/ui';
import { humanizeError } from '../src/lib/errorSanitizer';

const SOURCE_LABELS: Record<SmartInputSource, string> = {
  text: 'Saisie manuelle',
  keyboard_voice: 'Dictée clavier',
  siri: 'Siri Shortcut',
  google_assistant: 'Google Assistant',
};

const SOURCE_ICONS: Record<SmartInputSource, keyof typeof Ionicons.glyphMap> = {
  text: 'create',
  keyboard_voice: 'mic',
  siri: 'logo-apple',
  google_assistant: 'logo-google',
};

export default function QuickAddScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{ text?: string; source?: string }>();
  const incomingText = (params.text || '').toString();
  const source: SmartInputSource = (() => {
    const s = (params.source || '').toString().toLowerCase();
    if (s === 'siri' || s === 'google_assistant' || s === 'keyboard_voice') return s;
    return 'text';
  })();

  const [text, setText] = useState(incomingText);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<SmartInputResult | null>(null);

  const { addTransaction, addIncome, addRecurringExpense } = useStore();

  const parse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const r = await smartInput(text, source);
      setResult(r);
      if (r.ok) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    } catch (e: any) {
      Alert.alert('Analyse impossible', humanizeError(e).message);
    } finally {
      setParsing(false);
    }
  };

  // Auto-parse on mount if text was passed via deep link
  useEffect(() => {
    if (incomingText.trim()) {
      parse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (!result || !result.ok) return;
    const t = result.type || 'expense';
    const id = `qa_${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);

    try {
      if (t === 'income') {
        addIncome({
          id,
          title: result.merchant || 'Revenu',
          amount: result.amount || 0,
          type: 'occasional',
          category: result.category || 'other',
          color: '#34D399',
          icon: 'cash',
          createdAt: Date.now(),
        });
      } else if (t === 'subscription') {
        addRecurringExpense({
          id,
          title: result.merchant || 'Abonnement',
          amount: result.amount || 0,
          category: result.category || 'subscription',
          frequency: 'monthly',
          dayOfMonth: new Date().getDate(),
          color: '#F87171',
          active: true,
          createdAt: Date.now(),
        });
      } else {
        addTransaction({
          id,
          title: result.merchant || 'Dépense',
          amount: -(result.amount || 0),
          date: now,
          category: result.category || 'other',
          type: 'expense',
          source: source === 'siri' ? 'voice' : source === 'google_assistant' ? 'voice' : 'manual',
        } as any);
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Sauvegarde impossible', humanizeError(e).message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
      testID="quick-add-screen"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Ajout Intelligent</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Source badge */}
        <View style={[styles.sourceBadge, { borderColor: `${theme.primary}55`, backgroundColor: `${theme.primary}15` }]}>
          <Ionicons name={SOURCE_ICONS[source]} size={14} color={theme.primary} />
          <Text style={[styles.sourceBadgeTxt, { color: theme.primary }]}>{SOURCE_LABELS[source]}</Text>
        </View>

        <Text style={styles.label}>Décrivez votre opération</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="ex: Ajoute 25 CHF chez Migros"
          placeholderTextColor={theme.textTertiary}
          multiline
          autoFocus={!incomingText}
          onSubmitEditing={parse}
        />

        {!result && (
          <Button
            title="Analyser"
            icon="sparkles"
            onPress={parse}
            disabled={!text.trim() || parsing}
            loading={parsing}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.md }}
          />
        )}

        {parsing && !result && (
          <View style={styles.parsingBox}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.parsingTxt}>Analyse en cours…</Text>
          </View>
        )}

        {/* Preview */}
        {result && result.ok && (
          <>
            <LinearGradient
              colors={[`${theme.primary}25`, `${theme.gold}15`]}
              style={styles.previewCard}
            >
              <View style={styles.previewBadge}>
                <Ionicons
                  name={result.type === 'income' ? 'arrow-down' : result.type === 'subscription' ? 'refresh-circle' : 'arrow-up'}
                  size={14}
                  color={theme.primary}
                />
                <Text style={styles.previewBadgeTxt}>
                  {result.type === 'income' ? 'REVENU' : result.type === 'subscription' ? 'ABONNEMENT' : 'DÉPENSE'}
                </Text>
              </View>
              <Text style={styles.previewMerchant} numberOfLines={1}>
                {result.merchant || '—'}
              </Text>
              <Text style={[styles.previewAmount, { color: result.type === 'income' ? theme.success : theme.text }]}>
                {result.type === 'income' ? '+' : '−'}{result.amount?.toLocaleString('fr-CH').replace(/,/g, "'")} {result.currency || 'CHF'}
              </Text>
              <View style={styles.previewMetaRow}>
                {result.category && (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaTxt}>{result.category}</Text>
                  </View>
                )}
                <View style={[styles.metaChip, { backgroundColor: `${theme.primary}15` }]}>
                  <Ionicons name="analytics" size={11} color={theme.primary} />
                  <Text style={[styles.metaTxt, { color: theme.primary }]}>
                    {result.resolvedBy === 'local' ? 'Hors-ligne' : 'IA serveur'}
                    {result.confidence ? ` · ${Math.round(result.confidence * 100)}%` : ''}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
              <Button
                title="Réessayer"
                variant="secondary"
                icon="refresh"
                onPress={() => { setResult(null); parse(); }}
                style={{ flex: 1 }}
              />
              <Button
                title="Ajouter"
                icon="checkmark"
                onPress={commit}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {result && !result.ok && (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={20} color={theme.error} />
            <Text style={styles.errTxt}>
              {result.error || t('quickAdd.parseError')}
            </Text>
          </View>
        )}

        {/* Examples */}
        {!result && !parsing && (
          <>
            <Text style={[styles.label, { marginTop: Spacing.xl }]}>Exemples</Text>
            {[
              t('quickAdd.example1'),
              t('quickAdd.example2'),
              'Netflix 18 CHF',
              'Facture Swisscom 89 CHF',
              'Assurance voiture 95 CHF',
            ].map((ex) => (
              <TouchableOpacity
                key={ex}
                style={styles.exampleRow}
                onPress={() => { setText(ex); setTimeout(parse, 100); }}
                activeOpacity={0.7}
              >
                <Ionicons name="bulb" size={14} color={theme.gold} />
                <Text style={styles.exampleTxt}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────── Styles ───────────
const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },

    sourceBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, borderWidth: 1,
      marginBottom: Spacing.md,
    },
    sourceBadgeTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

    label: {
      color: C.textSecondary, fontSize: FontSizes.sm,
      fontWeight: '700', marginBottom: 8,
    },
    input: {
      backgroundColor: C.card,
      borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      color: C.text,
      fontSize: FontSizes.md,
      minHeight: 80,
      textAlignVertical: 'top',
    },

    parsingBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: Spacing.md, marginTop: Spacing.md,
      backgroundColor: `${C.primary}10`,
      borderRadius: BorderRadius.lg,
    },
    parsingTxt: { color: C.textSecondary, fontSize: 13 },

    previewCard: {
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: `${C.primary}40`,
      marginTop: Spacing.lg,
    },
    previewBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: `${C.primary}25`,
      marginBottom: Spacing.sm,
    },
    previewBadgeTxt: { color: C.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
    previewMerchant: { color: C.text, fontSize: FontSizes.lg, fontWeight: '800' },
    previewAmount: { fontSize: 30, fontWeight: '900', marginTop: 4 },
    previewMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
    metaChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999, backgroundColor: `${C.textTertiary}20`,
    },
    metaTxt: { color: C.textSecondary, fontSize: 11, fontWeight: '700' },

    errBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: Spacing.md, marginTop: Spacing.md,
      backgroundColor: `${C.error}15`,
      borderWidth: 1, borderColor: `${C.error}40`,
      borderRadius: BorderRadius.lg,
    },
    errTxt: { color: C.error, fontSize: 13, flex: 1 },

    exampleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: Spacing.md,
      backgroundColor: C.card,
      borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.lg,
      marginBottom: 6,
    },
    exampleTxt: { color: C.text, fontSize: 14, flex: 1 },
  });
