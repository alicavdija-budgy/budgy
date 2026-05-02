/**
 * GUARDIAN MONEY CHF - Data sources attribution (Priminfo, OFSP, AFC, BNS, etc.)
 * This screen protects the publisher by properly citing public data sources.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';

const SOURCES = [
  {
    name: 'OFSP – Office fédéral de la santé publique',
    purpose: 'Barèmes officiels LAMal, primes de référence 2026, régions de primes, subsides cantonaux.',
    url: 'https://www.bag.admin.ch',
    license: 'Données publiques de la Confédération suisse (Open Government Data).',
  },
  {
    name: 'Priminfo (OFSP)',
    purpose: 'Primes d’assurance-maladie obligatoire (LAMal) par canton, assureur, franchise, modèle et tranche d’âge, millsimé 2026.',
    url: 'https://www.priminfo.admin.ch',
    license: 'Données publiques. Marques assureurs : propriété de leurs titulaires respectifs.',
  },
  {
    name: 'AFC – Administration fédérale des contributions',
    purpose: 'Barèmes de l’impôt fédéral direct (IFD), déductions standard, piliers 3a / 3b.',
    url: 'https://www.estv.admin.ch',
    license: 'Données publiques de la Confédération suisse.',
  },
  {
    name: 'Administrations fiscales cantonales',
    purpose: 'Barèmes ICC (impôts communaux et cantonaux) — 26 cantons.',
    url: 'https://www.ch.ch/fr/imposition',
    license: 'Données publiées par chaque canton.',
  },
  {
    name: 'BNS – Banque nationale suisse',
    purpose: 'Taux de référence, inflation, CPI — affichés à titre indicatif.',
    url: 'https://www.snb.ch',
    license: 'Données publiques SNB/BNS.',
  },
  {
    name: 'OFS – Office fédéral de la statistique',
    purpose: 'Indices des prix à la consommation, statistiques de ménages, données socio-économiques.',
    url: 'https://www.bfs.admin.ch',
    license: 'Données publiques de la Confédération suisse.',
  },
  {
    name: 'Comparis / Moneyland / Bonus.ch',
    purpose: 'Être cité uniquement à titre informatif si une donnée de référence croisée est pertinente — aucune donnée propriétaire n’est réutilisée.',
    url: 'https://www.comparis.ch',
    license: 'Contenus rédactionnels — non reproduits.',
  },
];

export default function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Sources des données</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Budgy exploite exclusivement des données publiques officielles. Toutes les sources sont
          citées ci-dessous. L’application n’est affiliée à aucun des organismes mentionnés.
        </Text>

        {SOURCES.map((src, idx) => (
          <View key={idx} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <Ionicons name="library" size={20} color={C.primary} />
              <Text style={styles.sourceName}>{src.name}</Text>
            </View>
            <Text style={styles.sourceLabel}>Usage dans l’application :</Text>
            <Text style={styles.sourceText}>{src.purpose}</Text>
            <Text style={styles.sourceLabel}>Licence / Origine :</Text>
            <Text style={styles.sourceText}>{src.license}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(src.url).catch(() => {})}>
              <Text style={styles.sourceLink}>🔗 {src.url}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle" size={22} color={C.info} />
          <Text style={styles.noteText}>
            Les données publiques suisses sont librement réutilisables dans le respect de leur origine et d’une citation
            appropriée (principe Open Government Data de la Confédération). Les noms et logos d’assureurs, banques ou
            autres entités privées mentionnées restent la propriété de leurs titulaires respectifs et sont utilisés ici
            uniquement à des fins de comparaison factuelle, sans endossement ni partenariat.
          </Text>
        </View>

        <Text style={styles.h2}>Signaler une source manquante</Text>
        <Text style={styles.p}>
          Si vous pensez qu’une donnée utilisée dans l’application n’est pas correctement attribuée, écrivez-nous à{'\n'}
          <Text style={styles.b}>support@budgy.ch</Text> — nous corrigeons sous 72 heures.
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
