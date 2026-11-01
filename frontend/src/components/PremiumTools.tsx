/**
 * BUDGY — Écran Plus : carte Budgy Pro compacte (en premier) + grille
 * d'outils premium 3D en 3 colonnes × 2 rangées.
 * Illustrations statiques embarquées (assets/images/premium-tools, Metro) —
 * médaillons circulaires à fond transparent (halo carré nettoyé).
 * Titres = i18n (4 langues), routes/droits = catalogue FEATURE_BY_ID existant.
 * Aucune animation permanente ; pression subtile + haptique via PressScale
 * (layout passé au Pressable via `contentStyle` pour un alignement correct
 * sur iOS et Web).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions, Platform, PixelRatio } from 'react-native';
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

// Palette fidèle aux références (identique clair/sombre : cartes bleu nuit)
const INK = '#0B1120';
const INK_EDGE = '#1E2A44';
const MINT = '#34D399';

export default function PremiumTools({ isPro }: { isPro: boolean }) {
  const C: any = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 360; // petit iPhone : libellés courts, visuels réduits
  // Très grands caractères d'accessibilité : 2 colonnes pour rester utilisable
  const cols = PixelRatio.getFontScale() >= 1.4 ? 2 : 3;
  const styles = useMemo(() => makeStyles(C, narrow, cols), [C, narrow, cols]);

  const tools = Object.keys(ART)
    .map((id) => FEATURE_BY_ID[id])
    .filter(Boolean);

  const open = (route: string, tier: string) => {
    if (tier === 'pro' && !isPro) router.push('/pro' as any);
    else router.push(route as any);
  };

  // Libellé affiché (court sur petit écran) — VoiceOver garde le titre complet
  const label = (f: any) =>
    narrow && f.id === 'calendar' ? t('plusV2.shortCalendar') : t(f.titleKey);

  return (
    <View>
      {/* A. Budgy Pro — carte horizontale compacte, premier élément de Plus */}
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
            colors={['rgba(52,211,153,0.16)', 'rgba(16,185,129,0.03)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Image source={PRO_ART} style={styles.proArt} resizeMode="contain" />
          <View style={styles.proBody}>
            <View style={styles.proTitleRow}>
              <Text style={styles.proTitle}>Budgy Pro</Text>
              {isPro && <View style={styles.activeDot} />}
            </View>
            <Text style={styles.proSub} numberOfLines={2}>
              {isPro ? t('plusV2.proActive') : t('plusV2.proDiscover')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
        </PressScale>
      </Animated.View>

      {/* B. Mes outils — 6 cartes compactes, 3 colonnes × 2 rangées */}
      <Text style={styles.sectionLabel}>{t('plusV2.tools')}</Text>
      <View style={styles.grid}>
        {tools.map((f: any, i: number) => {
          const locked = f.tier === 'pro' && !isPro;
          return (
            <Animated.View key={f.id} entering={FadeInDown.duration(360).delay(100 + i * 40)} style={styles.cell}>
              <PressScale
                haptic="light"
                onPress={() => open(f.route, f.tier)}
                style={styles.toolCard}
                contentStyle={styles.toolContent}
                accessibilityRole="button"
                accessibilityLabel={`${t(f.titleKey)}${locked ? ` — ${t('plusV2.proDiscover')}` : ''}`}
              >
                <LinearGradient
                  colors={['rgba(52,211,153,0.12)', 'rgba(52,211,153,0.02)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 0.9 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.badges}>
                  {!!f.badge && <Text style={styles.beta}>{f.badge}</Text>}
                  {locked && <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.5)" />}
                </View>
                <Image source={ART[f.id as keyof typeof ART]} style={styles.art} resizeMode="contain" />
                <Text
                  style={styles.toolTitle}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {label(f)}
                </Text>
              </PressScale>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (C: any, narrow: boolean, cols: number) =>
  StyleSheet.create({
    sectionLabel: {
      color: C.textSecondary, fontSize: 12.5, fontWeight: '800',
      textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 8,
    },
    // ── Budgy Pro : surface (Animated.View) + layout (Pressable) séparés ──
    proCard: {
      backgroundColor: INK, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(52,211,153,0.32)',
      overflow: 'hidden',
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, default: {} }),
    },
    proContent: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, paddingHorizontal: 14, minHeight: 100,
    },
    proArt: { width: 62, height: 62 },
    proBody: { flex: 1 },
    proTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proTitle: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '900' },
    proSub: { color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 3, lineHeight: 16 },
    activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MINT },
    // ── Grille d'outils compacte ──
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    cell: { width: cols === 2 ? '48.6%' : '31.9%', marginBottom: 9 },
    toolCard: {
      backgroundColor: INK, borderRadius: 17, borderWidth: 1, borderColor: INK_EDGE,
      overflow: 'hidden',
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, default: {} }),
    },
    toolContent: {
      alignItems: 'center', justifyContent: 'flex-start',
      paddingTop: 12, paddingBottom: 10, paddingHorizontal: 6,
      minHeight: narrow ? 112 : 122,
    },
    badges: { position: 'absolute', top: 7, right: 7, flexDirection: 'row', alignItems: 'center', gap: 5, zIndex: 2 },
    beta: {
      color: MINT, fontSize: 8, fontWeight: '800', letterSpacing: 0.4,
      backgroundColor: 'rgba(52,211,153,0.14)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1.5, overflow: 'hidden',
    },
    art: { width: narrow ? 50 : 58, height: narrow ? 50 : 58 },
    toolTitle: {
      color: '#FFFFFF', fontSize: narrow ? 10.5 : 11.5, fontWeight: '700', textAlign: 'center',
      marginTop: 7, lineHeight: 14,
    },
  });
