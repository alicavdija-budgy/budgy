/**
 * Budgy — Guide utilisateur intégré.
 * Localisé FR/EN/DE/IT ; navigation vers les routes réelles, garde Pro
 * appliquée par /more/_layout. Pas de prétention infondée au n°1 en Suisse.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../src/hooks/useTranslation';
import { BUDGY_GUIDES } from '../../src/content/userGuide';
import { FEATURE_BY_ID } from '../../src/config/features';

const C = {
  bg: '#0A0F1C', card: '#131C2D', border: '#26334A',
  title: '#F3F6FA', muted: '#A3AEC0', green: '#34D399', gold: '#F5C46B',
};
const PICTOS = ['clock-outline', 'analytics-outline', 'wallet-outline'] as const;

export default function BudgyUserGuide() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useTranslation();
  const guide = BUDGY_GUIDES[(lang in BUDGY_GUIDES ? lang : 'fr') as keyof typeof BUDGY_GUIDES];
  const [expanded, setExpanded] = useState<string | null>('revenus');
  const savings = useMemo(() => guide.wins, [guide]);
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity testID="guide-back" accessibilityRole="button" onPress={() => router.back()} style={st.back}>
          <Ionicons name="chevron-back" color={C.title} size={25} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{guide.title}</Text>
        <View style={st.back} />
      </View>
      <ScrollView testID="budgy-user-guide" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={st.hero}>
          <Text style={st.eyebrow}>{guide.eyebrow}</Text>
          <Text style={st.heroTitle}>Budgy</Text>
          <Text style={st.heroLead}>{guide.lead}</Text>
          <View style={st.heroRule} />
        </View>
        <View style={st.body}>
          <Text style={st.h2}>{guide.why}</Text>
          <Text style={st.paragraph}>{guide.whyBody}</Text>
          <Text style={[st.h2, { marginTop: 22 }]}>{guide.winsTitle}</Text>
          {savings.map(([title, copy], i) => (
            <View key={i} style={st.win}>
              <Ionicons name={PICTOS[i]} size={21} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={st.winTitle}>{title}</Text>
                <Text style={st.winCopy}>{copy}</Text>
              </View>
            </View>
          ))}
          <Text style={[st.paragraph, { marginTop: 22, marginBottom: 20 }]}>{guide.intro}</Text>

          {guide.sections.map((section) => {
            const active = section.id === expanded;
            const feature = section.featureId ? FEATURE_BY_ID[section.featureId] : undefined;
            return (
              <View key={section.id} style={st.card}>
                <TouchableOpacity testID={`guide-section-${section.id}`} onPress={() => setExpanded(active ? null : section.id)} accessibilityRole="button"
                  style={st.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.sectionTitle}>{section.title}</Text>
                    <Text style={st.sectionSummary}>{section.summary}</Text>
                  </View>
                  <Ionicons name={active ? 'chevron-up' : 'chevron-down'} color={C.green} size={19} />
                </TouchableOpacity>
                {active && (
                  <View style={st.expanded}>
                    <Text style={st.miniHeading}>{guide.stepsLabel}</Text>
                    <Text style={st.paragraph}>{section.steps}</Text>
                    <Text style={[st.miniHeading, { marginTop: 14 }]}>{guide.benefitLabel}</Text>
                    <Text style={st.paragraph}>{section.benefit}</Text>
                    {feature && (
                      <TouchableOpacity
                        testID={`guide-open-${section.id}`}
                        accessibilityRole="button"
                        onPress={() => router.push(feature.route as any)}
                        style={st.cta}>
                        <Text style={st.ctaText}>{guide.openLabel}</Text>
                        <Text style={st.tier}>{feature.tier === 'pro' ? guide.proLabel : guide.freeLabel}</Text>
                        <Ionicons name="arrow-forward" color="#09241C" size={17} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <View style={st.foot}>
            <Ionicons name="information-circle-outline" color={C.gold} size={21} />
            <View style={{ flex: 1 }}>
              <Text style={[st.winTitle, { color: C.gold }]}>{guide.footTitle}</Text>
              <Text style={st.paragraph}>{guide.foot}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 8 },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: C.title, fontSize: 17, fontWeight: '700' },
  hero: { paddingHorizontal: 26, paddingTop: 26, paddingBottom: 25, backgroundColor: '#0D1825' },
  eyebrow: { color: C.green, fontSize: 10, letterSpacing: 1.8, fontWeight: '800' },
  heroTitle: { color: C.title, fontSize: 46, fontWeight: '800', marginTop: 9, letterSpacing: -1.5 },
  heroLead: { color: C.title, fontSize: 18, lineHeight: 27, marginTop: 10, maxWidth: 440 },
  heroRule: { height: 3, width: '100%', backgroundColor: C.green, marginTop: 24, borderRadius: 3 },
  body: { padding: 20 },
  h2: { fontSize: 21, fontWeight: '800', color: C.title, marginBottom: 12 },
  paragraph: { color: C.muted, fontSize: 14, lineHeight: 21 },
  win: { flexDirection: 'row', gap: 14, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14, alignItems: 'flex-start' },
  winTitle: { color: C.title, fontSize: 15, fontWeight: '750', marginBottom: 4 },
  winCopy: { color: C.muted, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 11, overflow: 'hidden' },
  cardHeader: { padding: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { color: C.title, fontWeight: '750', fontSize: 15, marginBottom: 7 },
  sectionSummary: { color: C.muted, fontSize: 13, lineHeight: 19 },
  expanded: { paddingHorizontal: 17, paddingBottom: 17, borderTopWidth: 1, borderColor: C.border, paddingTop: 13 },
  miniHeading: { fontSize: 12, fontWeight: '800', color: C.green, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  cta: { backgroundColor: C.green, marginTop: 17, paddingHorizontal: 14, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  ctaText: { color: '#09241C', fontSize: 13, fontWeight: '800', flex: 1 },
  tier: { color: '#09241C', fontSize: 11, fontWeight: '600', opacity: 0.7 },
  foot: { marginTop: 15, padding: 16, borderRadius: 14, backgroundColor: '#201D17', flexDirection: 'row', gap: 12 },
});
