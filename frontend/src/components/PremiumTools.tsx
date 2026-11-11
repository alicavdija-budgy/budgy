/**
 * BUDGY — Écran Plus « Luminous Rows » : carte Budgy Pro premium (en premier)
 * + six outils en lignes horizontales indépendantes (plus de grille 2×3/3×2).
 * Verre teinté bleu nuit, reflets émeraude localisés, illustrations 3D
 * existantes, aucune animation permanente. Routes/droits = catalogue
 * FEATURE_BY_ID ; statut Pro = hasPremiumAccess canonique (via prop).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { FEATURE_BY_ID } from '../config/features';
import PressScale from './PressScale';

const ART = {
  'debts': require('../../assets/images/premium-tools/dettes_icon.png'),
  'receipts': require('../../assets/images/premium-tools/tickets_recus_icon.png'),
  'twin': require('../../assets/images/premium-tools/budgy_twin_icon.png'),
  'documents': require('../../assets/images/premium-tools/mon_classeur_icon.png'),
  'calendar': require('../../assets/images/premium-tools/calendrier_financier_icon.png'),
  'export-pdf': require('../../assets/images/premium-tools/export_pdf_icon.png'),
} as const;
const PRO_ART = require('../../assets/images/premium-tools/budgy_pro_icon.png');

// Courtes descriptions utiles (i18n ×4) — les features sans subtitleKey
const DESC: Record<string, string> = {
  'debts': 'plusV2.descDebts',
  'receipts': 'plusV2.descReceipts',
  'documents': 'plusV2.descDocuments',
  'calendar': 'plusV2.descCalendar',
  'export-pdf': 'plusV2.descExport',
};

// Identité Budgy (identique clair/sombre : verre bleu nuit, reflets émeraude)
const INK = '#0B1120';
const INK_2 = '#0E1530';
const MINT = '#34D399';

export default function PremiumTools({ isPro }: { isPro: boolean }) {
  const C: any = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(C), [C]);

  const tools = Object.keys(ART).map((id) => FEATURE_BY_ID[id]).filter(Boolean);

  const open = (route: string, tier: string) => {
    if (tier === 'pro' && !isPro) router.push('/pro' as any);
    else router.push(route as any);
  };

  return (
    <View>
      {/* ── Budgy Pro — élément principal, verre poli + dégradé émeraude ── */}
      <Animated.View entering={FadeInDown.duration(380).delay(40)}>
        <PressScale
          haptic="medium"
          onPress={() => router.push('/pro' as any)}
          style={styles.proCard}
          contentStyle={styles.proContent}
          accessibilityRole="button"
          accessibilityLabel={`Budgy Pro — ${isPro ? t('plusV2.proActive') : t('plusV2.proDiscover')}`}
        >
          <LinearGradient
            colors={['rgba(52,211,153,0.22)', 'rgba(16,185,129,0.06)', 'rgba(11,17,32,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Reflet diagonal façon verre poli */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
            style={styles.proSheen}
            pointerEvents="none"
          />
          <Image source={PRO_ART} style={styles.proArt} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <View style={styles.proTitleRow}>
              <Text style={styles.proTitle}>{isPro ? 'Budgy Pro' : t('plusV2.proDiscoverTitle')}</Text>
              {isPro && <View style={styles.activeDot} />}
            </View>
            <Text style={styles.proSub} numberOfLines={2}>
              {isPro ? t('plusV2.proActiveSub') : t('plusV2.proDiscoverSub')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color="rgba(255,255,255,0.6)" />
        </PressScale>
      </Animated.View>

      {/* ── Mes outils — six lignes lumineuses indépendantes ── */}
      <Text style={styles.sectionLabel}>{t('plusV2.tools')}</Text>
      {tools.map((f: any, i: number) => {
        const locked = f.tier === 'pro' && !isPro;
        return (
          <Animated.View key={f.id} entering={FadeInDown.duration(340).delay(90 + i * 40)}>
            <PressScale
              haptic="light"
              onPress={() => open(f.route, f.tier)}
              style={styles.row}
              contentStyle={styles.rowContent}
              accessibilityRole="button"
              accessibilityLabel={`${t(f.titleKey)}${locked ? ` — ${t('plusV2.proDiscover')}` : ''}`}
            >
              <LinearGradient
                colors={[INK_2, INK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* Reflet émeraude localisé dans l'angle supérieur gauche */}
              <LinearGradient
                colors={['rgba(52,211,153,0.16)', 'rgba(52,211,153,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 0.55, y: 0.9 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Image source={ART[f.id as keyof typeof ART]} style={styles.art} resizeMode="contain" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t(f.titleKey)}</Text>
                {!!(f.subtitleKey || DESC[f.id]) && (
                  <Text style={styles.rowDesc} numberOfLines={2}>{t(f.subtitleKey || DESC[f.id])}</Text>
                )}
              </View>
              <View style={styles.rowRight}>
                {!!f.badge && <Text style={styles.beta}>{f.badge}</Text>}
                {locked && <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.5)" />}
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
              </View>
            </PressScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    sectionLabel: {
      color: C.textSecondary, fontSize: 12.5, fontWeight: '800',
      textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 10,
    },
    proCard: {
      backgroundColor: INK, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(52,211,153,0.38)',
      overflow: 'hidden',
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } }, default: {} }),
    },
    proContent: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingVertical: 18, paddingHorizontal: 16, minHeight: 108,
    },
    proSheen: { position: 'absolute', top: -20, bottom: -20, left: '30%', width: 90, transform: [{ rotate: '18deg' }] },
    proArt: { width: 66, height: 66 },
    proTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proTitle: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '900', letterSpacing: 0.2 },
    proSub: { color: 'rgba(255,255,255,0.66)', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
    activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MINT },
    row: {
      borderRadius: 18, borderWidth: 1, borderColor: '#1E2A44', overflow: 'hidden',
      marginBottom: 10,
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, default: {} }),
    },
    rowContent: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13, paddingHorizontal: 13, minHeight: 80,
    },
    art: { width: 52, height: 52 },
    rowBody: { flex: 1 },
    rowTitle: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
    rowDesc: { color: 'rgba(255,255,255,0.56)', fontSize: 11.5, lineHeight: 15, marginTop: 2 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    beta: {
      color: MINT, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4,
      backgroundColor: 'rgba(52,211,153,0.14)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5, overflow: 'hidden',
    },
  });
