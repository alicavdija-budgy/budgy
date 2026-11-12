/**
 * BUDGY 4.0 — Écran Plus (refonte éditoriale suisse premium).
 *
 * Présentation UNIQUEMENT : routes, droits FREE/PRO, statut StoreKit et
 * données de session inchangés. 5 sections, lignes texte + chevron (sans
 * icônes ni sous-titres), carte Budgy Pro en relief, titres extrudés avec
 * trait vert. Navigation globale (barre flottante) conservée.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useStore } from '../../src/stores/useStore';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { useTranslation } from '../../src/hooks/useTranslation';
import PressScale from '../../src/components/PressScale';
import { FEATURE_BY_ID } from '../../src/config/features';

// Palette éditoriale (design de référence — identique clair/sombre)
const P = {
  bg: '#0A0F1C',
  text: '#F3F5F9',
  sub: '#8B95A7',
  chevron: '#5E6A80',
  green: '#34D399',
  gold: '#F5C46B',
  goldBorder: '#8A6A2B',
  sepDark: '#05080F',
  sepLight: '#1C2740',
};

// 5 sections — ordre EXACT exigé. Chaque id existe dans FEATURE_BY_ID
// (routes réelles + tier FREE/PRO respectés).
const SECTIONS: { key: string; rows: { id: string; label: string; badge?: string }[] }[] = [
  { key: 'finances', rows: [
    { id: 'budgets', label: 'budgets' },
    { id: 'incomes', label: 'incomes' },
    { id: 'recurring', label: 'recurring' },
    { id: 'invoices', label: 'invoices' },
    { id: 'debts', label: 'debts' },
    { id: 'calendar', label: 'calendar' },
  ]},
  { key: 'documents', rows: [
    { id: 'receipts', label: 'receipts' },
    { id: 'documents', label: 'binder' },
    { id: 'export-pdf', label: 'exportPdf' },
  ]},
  { key: 'intelligence', rows: [
    { id: 'twin', label: 'twin', badge: 'BETA' },
    { id: 'budgy-score', label: 'score' },
  ]},
  { key: 'suisse', rows: [
    { id: 'lamal', label: 'lamal' },
    { id: 'tax', label: 'tax' },
  ]},
  { key: 'account', rows: [
    { id: 'subscription', label: 'subscription' },
    { id: 'security', label: 'security' },
    { id: 'settings', label: 'prefs' },
    { id: 'notifications', label: 'alerts' },
  ]},
];

/** Titre de section extrudé (3 couches d'ombre) + trait vert lumineux. */
function SectionTitle({ children }: { children: string }) {
  return (
    <View style={st.secHead}>
      <View>
        <Text style={[st.secTitle, st.depth3]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>{children}</Text>
        <Text style={[st.secTitle, st.depth2]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>{children}</Text>
        <Text style={[st.secTitle, st.depth1]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>{children}</Text>
        <Text style={st.secTitle}>{children}</Text>
      </View>
      <View style={st.greenBarWrap}>
        <View style={st.greenBar} />
        <View style={st.greenBarShadow} />
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const user = useStore((s) => s.user);
  // Statut Pro : source canonique StoreKit/backend — JAMAIS codé en dur.
  const isPro = usePremiumStore((s) => s.hasPremiumAccess());
  const isTrial = usePremiumStore(
    (s) => s.trialEndsAt !== null && s.trialEndsAt > Date.now() && !s.plan
  );
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const trialDays = isTrial && trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 3600 * 1000)))
    : 0;

  const firstName = (user?.name || '').split(' ')[0] || '';
  const initials = (user?.name || 'B')
    .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const open = (id: string) => {
    const f = FEATURE_BY_ID[id];
    if (!f) return;
    if (f.id === 'subscription') return router.push('/pro' as any);
    // Garde FREE/PRO existante : fonctionnalité Pro verrouillée → /pro.
    if (f.tier === 'pro' && !isPro) return router.push('/pro' as any);
    router.push(f.route as any);
  };

  const proSub = isPro
    ? (isTrial ? t('plusV3.proTrial', { n: trialDays }) : t('plusV3.proSub'))
    : t('plusV3.proDiscoverSub');

  return useMemo(() => (
    <View style={[st.container, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête éditorial */}
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.greeting} numberOfLines={1}>
              {t('plusV2.greeting', { name: firstName || t('more.title') })}
            </Text>
            <Text style={st.title}>{t('more.title')}</Text>
          </View>
          <PressScale
            haptic="selection"
            onPress={() => router.push('/more/settings' as any)}
            accessibilityLabel={t('plusV3.prefs')}
          >
            <View style={st.avatar}>
              <Text style={st.avatarTxt}>{initials}</Text>
            </View>
          </PressScale>
        </View>

        {/* Carte Budgy Pro — relief 3D, statut réel StoreKit */}
        <PressScale haptic="light" onPress={() => router.push('/pro' as any)} style={st.proShadow}>
          <LinearGradient
            colors={['#2B2214', '#161A24']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.proCard}
          >
            <View style={st.proHighlight} />
            <View style={{ flex: 1 }}>
              <View style={st.proTitleRow}>
                <Text style={st.proTitle}>
                  {isPro ? t('plusV3.proTitle') : t('plusV3.proDiscover')}
                </Text>
                {isPro && (
                  <View style={st.proBadge}>
                    <Text style={st.proBadgeTxt}>{t('plusV3.proActive')}</Text>
                  </View>
                )}
              </View>
              <Text style={st.proSub}>{proSub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={P.gold} />
          </LinearGradient>
        </PressScale>

        {/* 5 sections — lignes texte + chevron, gravure fine */}
        {SECTIONS.map((sec) => (
          <View key={sec.key} style={st.section}>
            <SectionTitle>{t(`plusV3.${sec.key}`)}</SectionTitle>
            {sec.rows.map((row, i) => (
              <View key={row.id}>
                <PressScale
                  haptic="selection"
                  onPress={() => open(row.id)}
                  contentStyle={st.row}
                  accessibilityRole="button"
                  accessibilityLabel={t(`plusV3.${row.label}`)}
                  testID={`plus-row-${row.id}`}
                >
                  <Text style={st.rowTxt}>{t(`plusV3.${row.label}`)}</Text>
                  <View style={st.rowRight}>
                    {row.badge ? (
                      <View style={st.beta}><Text style={st.betaTxt}>{row.badge}</Text></View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={17} color={P.chevron} />
                  </View>
                </PressScale>
                {i < sec.rows.length - 1 && (
                  <View>
                    <View style={st.sepDark} />
                    <View style={st.sepLight} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [insets.top, insets.bottom, isPro, isTrial, trialDays, firstName, initials, t]);
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  // En-tête
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, gap: 12,
  },
  greeting: { color: P.sub, fontSize: 13, fontWeight: '500', marginBottom: 2 },
  title: { color: P.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: P.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: '#07111F', fontSize: 16, fontWeight: '800' },
  // Carte Budgy Pro
  proShadow: {
    marginHorizontal: 20, borderRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.75, shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
    backgroundColor: '#0E0B05',
  },
  proCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 18, borderWidth: 1, borderColor: P.goldBorder,
    paddingVertical: 22, paddingHorizontal: 20, overflow: 'hidden',
  },
  proHighlight: {
    position: 'absolute', top: 0, left: 14, right: 14, height: 1,
    backgroundColor: 'rgba(245,196,107,0.18)',
  },
  proTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proTitle: { color: P.gold, fontSize: 20, fontWeight: '700' },
  proBadge: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: P.gold,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(245,196,107,0.10)',
  },
  proBadgeTxt: { color: P.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  proSub: { color: P.sub, fontSize: 13, fontWeight: '500', marginTop: 5 },
  // Sections
  section: { marginTop: 28, paddingHorizontal: 20 },
  secHead: { marginBottom: 10 },
  secTitle: { color: '#EDF1F7', fontSize: 22, fontWeight: '600', letterSpacing: 0.2 },
  depth1: { position: 'absolute', top: 1, left: 0, color: '#1B2A45' },
  depth2: { position: 'absolute', top: 2, left: 0, color: '#15213A' },
  depth3: {
    position: 'absolute', top: 3, left: 0, color: '#0F182C',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 2 },
  },
  greenBarWrap: { marginTop: 7 },
  greenBar: {
    width: 44, height: 2, borderRadius: 1, backgroundColor: P.green,
    shadowColor: P.green, shadowOpacity: 0.55, shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 }, elevation: 2,
  },
  greenBarShadow: { width: 44, height: 1, backgroundColor: 'rgba(0,0,0,0.5)', marginTop: 1, borderRadius: 1 },
  // Lignes
  row: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 2,
  },
  rowTxt: { color: P.text, fontSize: 16, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sepDark: { height: 1, backgroundColor: P.sepDark },
  sepLight: { height: 1, backgroundColor: P.sepLight, opacity: 0.45 },
  beta: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: P.green,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
    backgroundColor: 'rgba(52,211,153,0.08)',
  },
  betaTxt: { color: P.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
