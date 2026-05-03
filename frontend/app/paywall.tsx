/**
 * BUDGY - Premium Paywall Screen
 * Highly optimized for conversion (dark fintech style, gradient hero,
 * benefits over features, annual plan emphasized, 7-day trial CTA).
 *
 * MOCKED subscription: plug RevenueCat later via usePremiumStore.purchase().
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { usePremiumStore, type Plan } from '../src/stores/usePremiumStore';

const PRICE_MONTHLY = 4.90;
const PRICE_ANNUAL = 39.90;
const DISCOUNT = Math.round((1 - PRICE_ANNUAL / (PRICE_MONTHLY * 12)) * 100);

const BENEFITS = [
  {
    icon: 'sparkles',
    color: '#34D399',
    title: 'IA intelligente',
    desc: 'Coach financier qui analyse vos dépenses et recommande des économies concrètes chaque semaine.',
  },
  {
    icon: 'analytics',
    color: '#22D3EE',
    title: 'Statistiques avancées',
    desc: 'Graphiques mensuels, tendances 12 mois, prévisions et comparaisons par catégorie.',
  },
  {
    icon: 'flash',
    color: '#F59E0B',
    title: 'Automatisation',
    desc: 'Factures récurrentes, OCR tickets, import email. Gagnez 2 h par mois.',
  },
  {
    icon: 'cloud-done',
    color: '#8B5CF6',
    title: 'Cloud sécurisé',
    desc: 'Sync multi-appareils chiffrée, hébergée en Suisse/UE. Vos données vous suivent.',
  },
  {
    icon: 'trophy',
    color: '#EC4899',
    title: 'Objectifs avancés',
    desc: 'Plans d’épargne intelligents, projections IA et simulateur d’impôts illimité.',
  },
] as const;

type TriggerCopy = {
  title: string;
  subtitle: string;
};

function getTriggerCopy(trigger?: string): TriggerCopy {
  switch (trigger) {
    case 'feature_ai':
      return {
        title: 'Débloquez votre coach IA',
        subtitle: 'Des conseils personnalisés pour économiser dès ce mois-ci.',
      };
    case 'feature_tax':
      return {
        title: 'Optimisez vos impôts',
        subtitle: 'Simulateur illimité — IFD, ICC et LAMal pour les 26 cantons.',
      };
    case 'feature_analytics':
      return {
        title: 'Statistiques avancées',
        subtitle: 'Tendances, prévisions, comparaisons — votre budget décodé.',
      };
    case 'feature_export':
      return {
        title: 'Exports illimités',
        subtitle: 'PDF professionnels sans limite, prêts pour votre comptable.',
      };
    case 'feature_cloud':
      return {
        title: 'Synchronisation Pro',
        subtitle: 'Vos données sur tous vos appareils, chiffrées et sécurisées.',
      };
    case 'organic_transactions':
      return {
        title: 'Vous progressez vite 💪',
        subtitle: 'Passez à la vitesse supérieure avec Budgy Pro.',
      };
    default:
      return {
        title: 'Prenez le contrôle total de votre argent',
        subtitle: 'Budgy vous aide à économiser, prévoir et optimiser vos finances.',
      };
  }
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const [selected, setSelected] = useState<Plan>('annual');
  const [processing, setProcessing] = useState(false);

  const startTrial = usePremiumStore((s) => s.startTrial);
  const purchase = usePremiumStore((s) => s.purchase);
  const markDismissed = usePremiumStore((s) => s.markPaywallDismissed);

  const copy = getTriggerCopy(params.trigger);

  // Pulsing glow behind hero icon
  const glow = useSharedValue(0.4);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(0.9, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const handleTrial = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
    // MOCKED: in real flow, call RevenueCat.purchasePackage(trial_package)
    startTrial();
    setTimeout(() => {
      setProcessing(false);
      Alert.alert(
        '🎉 Essai activé',
        'Vous avez 7 jours pour profiter de toutes les fonctionnalités Pro. Sans engagement.',
        [{ text: 'Super !', onPress: () => router.back() }]
      );
    }, 400);
  };

  const handlePurchase = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}
    // MOCKED purchase
    purchase(selected);
    setTimeout(() => {
      setProcessing(false);
      Alert.alert(
        '✨ Bienvenue sur Budgy Pro',
        selected === 'annual'
          ? 'Votre abonnement annuel est actif. Merci pour votre confiance !'
          : 'Votre abonnement mensuel est actif. Merci !',
        [{ text: 'Commencer', onPress: () => router.back() }]
      );
    }, 500);
  };

  const handleClose = () => {
    markDismissed();
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar with close */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={14}>
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            usePremiumStore.getState().restore();
            Alert.alert('Restauration', 'Aucun achat à restaurer pour le moment.');
          }}
          hitSlop={14}
        >
          <Text style={styles.restoreLink}>Restaurer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Animated.View style={[styles.glow, glowStyle]} />
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.icon}
              resizeMode="contain"
            />
          </View>
          <LinearGradient
            colors={['rgba(52,211,153,0.15)', 'rgba(34,211,238,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proBadge}
          >
            <Ionicons name="sparkles" size={14} color="#34D399" />
            <Text style={styles.proBadgeText}>BUDGY PRO</Text>
          </LinearGradient>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View
              key={b.title}
              
              style={styles.benefitRow}
            >
              <View style={[styles.benefitIcon, { backgroundColor: `${b.color}22` }]}>
                <Ionicons name={b.icon as any} size={20} color={b.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
            </View>
          ))}
        </View>

        {/* Social proof pill */}
        <View style={styles.socialProof}>
          <View style={styles.avatars}>
            {['#34D399', '#22D3EE', '#8B5CF6'].map((c, idx) => (
              <View
                key={idx}
                style={[
                  styles.avatar,
                  { backgroundColor: c, marginLeft: idx === 0 ? 0 : -10, zIndex: 3 - idx },
                ]}
              />
            ))}
          </View>
          <Text style={styles.socialText}>
            Rejoignez les Suissesses et Suisses qui reprennent le contrôle 🇨🇭
          </Text>
        </View>

        {/* Plans */}
        <View style={styles.plans}>
          {/* Annual */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelected('annual')}
            style={[
              styles.plan,
              selected === 'annual' && styles.planActive,
            ]}
          >
            {selected === 'annual' && (
              <LinearGradient
                colors={['#34D399', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.recommendBadge}
              >
                <Text style={styles.recommendText}>⭐ MEILLEURE OFFRE · -{DISCOUNT}%</Text>
              </LinearGradient>
            )}
            <View style={styles.planRow}>
              <View style={styles.planRadio}>
                {selected === 'annual' && <View style={styles.planRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>Annuel</Text>
                <Text style={styles.planSub}>
                  CHF {(PRICE_ANNUAL / 12).toFixed(2)}/mois · facturé CHF {PRICE_ANNUAL.toFixed(2)}/an
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.planPrice}>CHF {PRICE_ANNUAL.toFixed(2)}</Text>
                <Text style={styles.planPriceUnit}>par an</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelected('monthly')}
            style={[
              styles.plan,
              selected === 'monthly' && styles.planActive,
            ]}
          >
            <View style={styles.planRow}>
              <View style={styles.planRadio}>
                {selected === 'monthly' && <View style={styles.planRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>Mensuel</Text>
                <Text style={styles.planSub}>Flexibilité totale, annulable chaque mois.</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.planPrice}>CHF {PRICE_MONTHLY.toFixed(2)}</Text>
                <Text style={styles.planPriceUnit}>par mois</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reassurance */}
        <View style={styles.reassureRow}>
          <View style={styles.reassureItem}>
            <Ionicons name="shield-checkmark" size={16} color="#34D399" />
            <Text style={styles.reassureText}>Sans engagement</Text>
          </View>
          <View style={styles.reassureItem}>
            <Ionicons name="refresh-circle" size={16} color="#22D3EE" />
            <Text style={styles.reassureText}>Annulation à tout moment</Text>
          </View>
          <View style={styles.reassureItem}>
            <Ionicons name="lock-closed" size={16} color="#8B5CF6" />
            <Text style={styles.reassureText}>Paiement sécurisé</Text>
          </View>
        </View>

        <Text style={styles.fineprint}>
          L’essai gratuit de 7 jours se convertit automatiquement en abonnement {selected === 'annual' ? 'annuel' : 'mensuel'} sauf annulation 24 h avant la fin. Géré par l’App Store.
        </Text>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient
          colors={['rgba(14,21,48,0)', 'rgba(14,21,48,0.95)', '#0E1530']}
          style={styles.ctaGradient}
          pointerEvents="none"
        />
        <TouchableOpacity
          onPress={handleTrial}
          disabled={processing}
          activeOpacity={0.85}
          style={styles.ctaWrap}
        >
          <LinearGradient
            colors={['#34D399', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaBtn}
          >
            <Ionicons name="rocket" size={18} color="#0E1530" />
            <Text style={styles.ctaText}>
              {processing ? 'Activation…' : 'Essayer gratuitement 7 jours'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePurchase} disabled={processing}>
          <Text style={styles.buyNowLink}>
            ou s’abonner directement — CHF {(selected === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY).toFixed(2)}
            {selected === 'annual' ? ' / an' : ' / mois'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E1530' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  restoreLink: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },

  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  iconWrap: {
    width: 100, height: 100,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  glow: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(52,211,153,0.35)',
  },
  icon: { width: 92, height: 92, borderRadius: 22 },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
    marginBottom: 18,
  },
  proBadgeText: { color: '#34D399', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },

  benefits: {
    paddingHorizontal: 20,
    marginTop: 8,
    gap: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  benefitIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitTitle: {
    color: '#FFF', fontSize: 15, fontWeight: '800',
    marginBottom: 2,
  },
  benefitDesc: {
    color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 17,
  },

  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(52,211,153,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.15)',
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#0E1530',
  },
  socialText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, flex: 1, fontWeight: '500' },

  plans: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 10,
  },
  plan: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
  },
  planActive: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52,211,153,0.08)',
  },
  recommendBadge: {
    position: 'absolute',
    top: -10, right: 16,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  recommendText: { color: '#0E1530', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  planRadioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34D399',
  },
  planTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  planSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  planPrice: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  planPriceUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  reassureRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  reassureItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reassureText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },

  fineprint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 18,
  },

  ctaBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 24,
  },
  ctaGradient: {
    position: 'absolute',
    top: -40, left: 0, right: 0, bottom: 0,
    height: '100%',
  },
  ctaWrap: { borderRadius: 18, overflow: 'hidden' },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
  },
  ctaText: {
    color: '#0E1530',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  buyNowLink: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    textDecorationLine: 'underline',
  },
});
