/**
 * BUDGY — Grille d'outils premium 3D (écran Plus) + carte Budgy Pro.
 * Illustrations statiques embarquées (assets/images/premium-tools, Metro),
 * style des références « Budgy_Premium_7_Boutons » : bleu nuit profond,
 * lueur menthe subtile, fines bordures lumineuses. Titres = i18n (4 langues),
 * routes/droits = catalogue FEATURE_BY_ID existant. Aucune animation permanente.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions, Platform } from 'react-native';
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
  const singleColumn = width < 340; // petits écrans : une colonne, textes jamais coupés
  const styles = useMemo(() => makeStyles(C, singleColumn), [C, singleColumn]);

  const tools = Object.keys(ART)
    .map((id) => FEATURE_BY_ID[id])
    .filter(Boolean);

  const open = (route: string, tier: string) => {
    if (tier === 'pro' && !isPro) router.push('/pro' as any);
    else router.push(route as any);
  };

  return (
    <View>
      {/* B. Mes outils — 6 cartes premium illustrées */}
      <Text style={styles.sectionLabel}>{t('plusV2.tools')}</Text>
      <View style={styles.grid}>
        {tools.map((f: any, i: number) => {
          const locked = f.tier === 'pro' && !isPro;
          return (
            <Animated.View key={f.id} entering={FadeInDown.duration(380).delay(60 + i * 45)} style={styles.cell}>
              <PressScale
                haptic="light"
                onPress={() => open(f.route, f.tier)}
                style={styles.toolCard}
                accessibilityRole="button"
                accessibilityLabel={`${t(f.titleKey)}${locked ? ` — ${t('plusV2.proDiscover')}` : ''}`}
              >
                <LinearGradient
                  colors={['rgba(52,211,153,0.16)', 'rgba(52,211,153,0.02)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 0.9 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.badges}>
                  {!!f.badge && <Text style={styles.beta}>{f.badge}</Text>}
                  {locked && <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.55)" />}
                </View>
                <Image source={ART[f.id as keyof typeof ART]} style={styles.art} resizeMode="contain" />
                <Text style={styles.toolTitle} numberOfLines={2}>{t(f.titleKey)}</Text>
              </PressScale>
            </Animated.View>
          );
        })}
      </View>

      {/* C. Budgy Pro — carte exclusive pleine largeur */}
      <Animated.View entering={FadeInDown.duration(380).delay(340)}>
        <PressScale
          haptic="medium"
          onPress={() => router.push('/pro' as any)}
          style={styles.proCard}
          accessibilityRole="button"
          accessibilityLabel={`Budgy Pro — ${isPro ? t('plusV2.proActive') : t('plusV2.proDiscover')}`}
        >
          <LinearGradient
            colors={['rgba(52,211,153,0.20)', 'rgba(16,185,129,0.04)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Image source={PRO_ART} style={styles.proArt} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.proTitle}>Budgy Pro</Text>
              {isPro && <View style={styles.activeDot} />}
            </View>
            <Text style={styles.proSub} numberOfLines={2}>
              {isPro ? t('plusV2.proActive') : t('plusV2.proDiscover')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
        </PressScale>
      </Animated.View>
    </View>
  );
}

const makeStyles = (C: any, single: boolean) =>
  StyleSheet.create({
    sectionLabel: {
      color: C.textSecondary, fontSize: 12.5, fontWeight: '800',
      textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 10,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    cell: { width: single ? '100%' : '48.4%', marginBottom: 10 },
    toolCard: {
      backgroundColor: INK, borderRadius: 20, borderWidth: 1, borderColor: INK_EDGE,
      paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', overflow: 'hidden',
      minHeight: single ? 150 : 158,
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, default: {} }),
    },
    badges: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 2 },
    beta: {
      color: MINT, fontSize: 9, fontWeight: '800', letterSpacing: 0.5,
      backgroundColor: 'rgba(52,211,153,0.14)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
    },
    art: { width: single ? 104 : 96, height: single ? 104 : 96 },
    toolTitle: {
      color: '#FFFFFF', fontSize: 13.5, fontWeight: '800', textAlign: 'center',
      marginTop: 8, lineHeight: 17,
    },
    proCard: {
      backgroundColor: INK, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)',
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 4, overflow: 'hidden',
      ...Platform.select({ ios: { shadowColor: MINT, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, default: {} }),
    },
    proArt: { width: 72, height: 72 },
    proTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
    proSub: { color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 3, lineHeight: 16 },
    activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MINT },
  });
