/**
 * GUARDIAN MONEY CHF - Data sources attribution (Priminfo, OFSP, AFC, BNS, etc.)
 * Official source names (OFSP/AFC/BNS/OFS/Priminfo) remain in their official form.
 * i18n complet (fr/en/de/it) — v3.9.0 build 73.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';
import { useTranslation } from '../../../src/hooks/useTranslation';

// Source records: URLs and official identifiers are TECHNICAL and never translated.
// Only `purposeKey` and `licenseKey` are localised via i18n.
const SOURCES = [
  { id: 'ofsp',      url: 'https://www.bag.admin.ch' },
  { id: 'priminfo',  url: 'https://www.priminfo.admin.ch' },
  { id: 'afc',       url: 'https://www.estv.admin.ch' },
  { id: 'cantons',   url: 'https://www.ch.ch/fr/imposition' },
  { id: 'bns',       url: 'https://www.snb.ch' },
  { id: 'ofs',       url: 'https://www.bfs.admin.ch' },
  { id: 'comparis',  url: 'https://www.comparis.ch' },
] as const;

export default function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('legalSources.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('legalSources.intro')}</Text>

        {SOURCES.map((src) => (
          <View key={src.id} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <Ionicons name="library" size={20} color={C.primary} />
              <Text style={styles.sourceName}>{t(`legalSources.name_${src.id}` as any)}</Text>
            </View>
            <Text style={styles.sourceLabel}>{t('legalSources.usageLabel')}</Text>
            <Text style={styles.sourceText}>{t(`legalSources.purpose_${src.id}` as any)}</Text>
            <Text style={styles.sourceLabel}>{t('legalSources.licenseLabel')}</Text>
            <Text style={styles.sourceText}>{t(`legalSources.license_${src.id}` as any)}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(src.url).catch(() => {})}>
              <Text style={styles.sourceLink}>🔗 {src.url}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle" size={22} color={C.info} />
          <Text style={styles.noteText}>{t('legalSources.noteText')}</Text>
        </View>

        <Text style={styles.h2}>{t('legalSources.reportTitle')}</Text>
        <Text style={styles.p}>
          {t('legalSources.reportBodyBefore')}
          {'\n'}
          <Text style={styles.b}>support@budgy.ch</Text>
          {t('legalSources.reportBodyAfter')}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  content: { padding: Spacing.lg },
  intro: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22, marginBottom: Spacing.lg },
  sourceCard: {
    backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1,
    borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
  },
  sourceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sourceName: { flex: 1, color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  sourceLabel: { color: C.textTertiary, fontSize: FontSizes.xs, textTransform: 'uppercase', fontWeight: FontWeights.bold, marginTop: Spacing.sm, letterSpacing: 0.5 },
  sourceText: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 20, marginTop: 2 },
  sourceLink: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, marginTop: Spacing.sm },
  noteBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: `${C.info}15`, padding: Spacing.md, borderRadius: BorderRadius.md,
    marginTop: Spacing.md, marginBottom: Spacing.lg,
  },
  noteText: { flex: 1, color: C.textSecondary, fontSize: FontSizes.xs, lineHeight: 18 },
  h2: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginTop: Spacing.md, marginBottom: Spacing.sm },
  p: { color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22 },
  b: { color: C.text, fontWeight: FontWeights.bold },
});
