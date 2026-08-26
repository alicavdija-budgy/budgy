/**
 * BUDGY — Siri & Google Assistant Setup Screen (v3.8.0)
 *
 * i18n complet (FR/DE/EN/IT) via useTranslation('siriAssistant').
 * Wording strict : « Compatible avec Siri via Raccourcis iOS » — jamais « Siri natif ».
 *
 * @i18n-technical-file
 *
 * ⚠ Contains only:
 *   • Two deeplink URL templates (`SIRI_LINK`, `GOOGLE_LINK`) — data, not UI.
 *   • Five FR example voice phrases the user would speak to Siri / Google.
 *     These are FR-CH samples because the app is voice-parsed in FR-CH; the
 *     surrounding screen chrome is fully translated via `siriAssistant.*`.
 * Full multi-locale voice examples will land when the voice parser is
 * upgraded to accept EN/DE/IT utterances (v3.9.1 backlog).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  BorderRadius,
  Spacing,
  FontSizes,
  FontWeights,
} from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import type { ThemePalette } from '../../src/constants/palettes';

const SIRI_LINK = 'budgy://quick-add?text=[Texte%20dicté]&source=siri';
const GOOGLE_LINK =
  'budgy://quick-add?text=[Texte%20dicté]&source=google_assistant';

const EXAMPLES: string[] = [
  'Ajoute 25 CHF chez Migros',
  'Salaire 3200 CHF',
  'Netflix 18 CHF chaque mois',
  'Facture Swisscom 89 CHF',
  'Contrat assurance voiture 95 CHF',
];

export default function SiriAssistantScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(C), [C]);

  const copy = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(t('siriAssistant.copiedTitle'), t('siriAssistant.copiedBody', { label }));
    } catch {
      Alert.alert(t('common.error'), t('siriAssistant.copyError'));
    }
  };

  const openQuickAdd = (testPhrase?: string) => {
    if (testPhrase) {
      router.push({
        pathname: '/quick-add',
        params: { text: testPhrase, source: 'text' },
      });
    } else {
      router.push('/quick-add');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('siriAssistant.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[C.primary, C.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <Ionicons name="mic" size={32} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{t('siriAssistant.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('siriAssistant.heroSub')}</Text>
        </LinearGradient>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            onPress={() => openQuickAdd()}
          >
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{t('siriAssistant.openQuickAdd')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.secondary }]}
            onPress={() => openQuickAdd('Ajoute 25 CHF chez Migros')}
          >
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{t('siriAssistant.testExample')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="logo-apple" size={22} color={C.text} />
            <Text style={styles.sectionTitle}>{t('siriAssistant.sectionIphone')}</Text>
          </View>
          <View style={styles.card}>
            <Step n={1} text={t('siriAssistant.iphoneStep1')} />
            <Step n={2} text={t('siriAssistant.iphoneStep2')} />
            <Step n={3} text={t('siriAssistant.iphoneStep3')} />
            <Step n={4} text={t('siriAssistant.iphoneStep4')} />
            <Step n={5} text={t('siriAssistant.iphoneStep5')} />
            <Step n={6} text={t('siriAssistant.iphoneStep6')} />
            <View style={styles.linkBox}>
              <Text style={styles.linkLabel}>{t('siriAssistant.linkSiri')}</Text>
              <Text style={styles.linkValue} numberOfLines={2}>{SIRI_LINK}</Text>
              <TouchableOpacity
                style={[styles.copyBtn, { backgroundColor: C.primary }]}
                onPress={() => copy(t('siriAssistant.linkSiri'), SIRI_LINK)}
              >
                <Ionicons name="copy-outline" size={16} color="#fff" />
                <Text style={styles.copyBtnText}>{t('siriAssistant.copySiri')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="logo-google" size={22} color={C.text} />
            <Text style={styles.sectionTitle}>{t('siriAssistant.sectionAndroid')}</Text>
          </View>
          <View style={styles.card}>
            <Step n={1} text={t('siriAssistant.androidStep1')} />
            <Step n={2} text={t('siriAssistant.androidStep2')} />
            <View style={styles.linkBox}>
              <Text style={styles.linkLabel}>{t('siriAssistant.linkGoogle')}</Text>
              <Text style={styles.linkValue} numberOfLines={2}>{GOOGLE_LINK}</Text>
              <TouchableOpacity
                style={[styles.copyBtn, { backgroundColor: C.secondary }]}
                onPress={() => copy(t('siriAssistant.linkGoogle'), GOOGLE_LINK)}
              >
                <Ionicons name="copy-outline" size={16} color="#fff" />
                <Text style={styles.copyBtnText}>{t('siriAssistant.copyGoogle')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb-outline" size={22} color={C.text} />
            <Text style={styles.sectionTitle}>{t('siriAssistant.sectionExamples')}</Text>
          </View>
          <View style={styles.card}>
            {EXAMPLES.map((phrase, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.exampleRow, i === EXAMPLES.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => openQuickAdd(phrase)}
                activeOpacity={0.7}
              >
                <View style={styles.exampleQuoteWrap}>
                  <Ionicons name="chatbubble-outline" size={14} color={C.primary} />
                </View>
                <Text style={styles.exampleText}>« {phrase} »</Text>
                <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helpText}>{t('siriAssistant.helpText')}</Text>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={C.textSecondary} />
          <Text style={styles.noteText}>{t('siriAssistant.note')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const C = useTheme();
  return (
    <View style={stepStyles.row}>
      <View style={[stepStyles.bullet, { backgroundColor: C.primary }]}>
        <Text style={stepStyles.bulletText}>{n}</Text>
      </View>
      <Text style={[stepStyles.text, { color: C.text }]}>{text}</Text>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm, gap: Spacing.sm },
  bullet: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bulletText: { color: '#fff', fontSize: 12, fontWeight: FontWeights.bold },
  text: { flex: 1, fontSize: FontSizes.sm, lineHeight: 20 },
});

const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
    scroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
    hero: { padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg, alignItems: 'center' },
    heroIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    heroTitle: { color: '#fff', fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.xs, textAlign: 'center' },
    heroSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 19 },
    actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
    actionBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    section: { marginBottom: Spacing.lg },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
    sectionTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    card: { backgroundColor: C.card, borderRadius: BorderRadius.lg, padding: Spacing.md },
    linkBox: { marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: C.background, borderWidth: 1, borderColor: C.cardBorder },
    linkLabel: { color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, marginBottom: 4 },
    linkValue: { color: C.text, fontSize: FontSizes.xs, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), marginBottom: Spacing.sm },
    copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: BorderRadius.sm },
    copyBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    exampleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
    exampleQuoteWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
    exampleText: { flex: 1, color: C.text, fontSize: FontSizes.sm },
    helpText: { color: C.textSecondary, fontSize: FontSizes.xs, textAlign: 'center', marginTop: Spacing.xs, fontStyle: 'italic' },
    noteCard: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    noteText: { flex: 1, color: C.textSecondary, fontSize: FontSizes.xs, lineHeight: 18 },
  });
