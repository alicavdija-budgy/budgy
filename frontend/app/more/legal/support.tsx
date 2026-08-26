/**
 * BUDGY — Support screen (contact info + FAQ pointer)
 * v3.8.0 — Ajouté pour satisfaire l'audit iter_12 (route /more/legal/support
 * était référencée dans l'index Legal mais l'écran n'existait pas → 404).
 * Apple Review exige un point de contact clair.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';
import { useTranslation } from '../../../src/hooks/useTranslation';
import type { ThemePalette } from '../../../src/constants/palettes';

const SUPPORT_EMAIL = 'support@budgy.ch';
const SUPPORT_URL = 'https://budgy.ch/support';
const PRIVACY_URL = 'https://budgy.ch/privacy';

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(C), [C]);

  const openMail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=Budgy%20Support`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert(t('common.error'), SUPPORT_EMAIL);
    } catch {
      Alert.alert(t('common.error'), SUPPORT_EMAIL);
    }
  };

  const openWeb = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert(t('common.error'), url);
    } catch {
      Alert.alert(t('common.error'), url);
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
        <Text style={styles.headerTitle}>Support</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Ionicons name="chatbubbles" size={40} color={C.primary} />
          <Text style={styles.heroTitle}>Nous sommes là pour vous aider</Text>
          <Text style={styles.heroSubtitle}>
            Une question sur votre abonnement, un bug, une suggestion ? Notre équipe suisse répond en français, allemand, anglais et italien sous 48 heures ouvrées.
          </Text>
        </View>

        <TouchableOpacity style={[styles.card, styles.cardPrimary]} onPress={openMail} activeOpacity={0.85}>
          <View style={styles.cardIcon}>
            <Ionicons name="mail" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Envoyez-nous un e-mail</Text>
            <Text style={styles.cardValue}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => openWeb(SUPPORT_URL)} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: C.info }]}>
            <Ionicons name="help-circle" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Centre d'aide en ligne</Text>
            <Text style={styles.cardValue}>{SUPPORT_URL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => openWeb(PRIVACY_URL)} activeOpacity={0.85}>
          <View style={[styles.cardIcon, { backgroundColor: C.textSecondary }]}>
            <Ionicons name="shield-checkmark" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Politique de confidentialité</Text>
            <Text style={styles.cardValue}>{PRIVACY_URL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
        </TouchableOpacity>

        <View style={styles.faq}>
          <Text style={styles.faqTitle}>{t('legalSupport.title') || 'Questions fréquentes'}</Text>
          <FAQ q={t('legalSupport.q1')} a={t('legalSupport.a1')} />
          <FAQ q={t('legalSupport.q2')} a={t('legalSupport.a2')} />
          <FAQ q={t('legalSupport.q3')} a={t('legalSupport.a3')} />
          <FAQ q={t('legalSupport.q4')} a={t('legalSupport.a4')} />
        </View>
      </ScrollView>
    </View>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  const C = useTheme();
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={{ color: C.text, fontWeight: FontWeights.bold, fontSize: FontSizes.sm, marginBottom: 4 }}>{q}</Text>
      <Text style={{ color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 }}>{a}</Text>
    </View>
  );
}

const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
    scroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
    hero: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
    heroTitle: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, textAlign: 'center' },
    heroSubtitle: { color: C.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.md },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: C.card, borderRadius: BorderRadius.lg,
      padding: Spacing.md, marginBottom: Spacing.sm,
    },
    cardPrimary: { borderWidth: 1, borderColor: C.primary },
    cardIcon: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.primary,
    },
    cardTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    cardValue: { color: C.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
    faq: { marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: C.card, borderRadius: BorderRadius.lg },
    faqTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  });
