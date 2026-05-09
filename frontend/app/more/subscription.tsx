/**
 * BUDGY — Subscription Screen (More → Settings → Subscription)
 *
 * Shows current Pro state + Restore Purchases (real, backend-validated).
 * Subscribe redirects to the dedicated /paywall screen.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { useIAP } from '../../src/hooks/useIAP';
import { Card } from '../../src/components/ui';

const PRO_FEATURES = [
  'Coach IA illimité',
  'Statistiques avancées & prévisions',
  'Export PDF illimité',
  'Cloud sync multi-appareils',
  'Optimiseur d\'impôts',
  'Factures & abonnements illimités',
  'Investissements & FIRE tracker',
  'Toutes les langues + thèmes',
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isPro = usePremiumStore((s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now()));
  const plan = usePremiumStore((s) => s.plan);
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const subscriptionStartedAt = usePremiumStore((s) => s.subscriptionStartedAt);
  const iap = useIAP();
  const [localBusy, setLocalBusy] = useState(false);
  const busy = localBusy || iap.phase === 'restoring' || iap.phase === 'validating';

  const handleSubscribe = () => {
    router.push('/paywall' as any);
  };

  const handleRestore = async () => {
    if (busy) return;
    if (!iap.available) {
      Alert.alert(
        'Restauration',
        'Disponible uniquement dans l\'app iOS native (TestFlight ou App Store).',
        [{ text: 'OK' }]
      );
      return;
    }
    setLocalBusy(true);
    try {
      try { if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const res = await iap.restore();
      if (res.notConfigured) {
        Alert.alert(
          'Serveur non configuré',
          'La validation des achats Apple n\'est pas encore activée côté serveur. Réessayez bientôt.',
          [{ text: 'OK' }]
        );
        return;
      }
      if (res.success) {
        try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        Alert.alert(
          '✓ Abonnement restauré',
          `${res.restored} abonnement${(res.restored || 0) > 1 ? 's' : ''} actif${(res.restored || 0) > 1 ? 's' : ''} sur votre compte Apple.`
        );
      } else if (res.state === 'EXPIRED' || res.state === 'REFUNDED') {
        Alert.alert(
          'Abonnement expiré',
          'Votre dernier abonnement n\'est plus actif. Vous pouvez vous réabonner depuis cet écran.'
        );
      } else {
        Alert.alert('Restauration', 'Aucun abonnement actif trouvé sur ce compte Apple.');
      }
    } finally {
      setLocalBusy(false);
    }
  };

  const renderStatus = () => {
    if (!isPro) {
      return (
        <Card style={styles.statusCardFree}>
          <View style={styles.statusRow}>
            <Ionicons name="lock-closed" size={22} color={Colors.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Plan gratuit</Text>
              <Text style={styles.statusSub}>Essayez Budgy Pro 7 jours, sans engagement.</Text>
            </View>
          </View>
        </Card>
      );
    }
    const isTrial = trialEndsAt && trialEndsAt > Date.now() && !plan;
    return (
      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: Colors.success }]}>
              {isTrial ? 'Essai gratuit actif' : `Budgy Pro ${plan === 'annual' ? '· Annuel' : plan === 'monthly' ? '· Mensuel' : ''}`}
            </Text>
            <Text style={styles.statusSub}>
              {isTrial && trialEndsAt
                ? `Se termine le ${new Date(trialEndsAt).toLocaleDateString('fr-CH')}`
                : subscriptionStartedAt
                ? `Depuis le ${new Date(subscriptionStartedAt).toLocaleDateString('fr-CH')}`
                : 'Merci pour votre confiance !'}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Abonnement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={['#34D399', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Ionicons name="sparkles" size={44} color="#0E1530" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Budgy Pro</Text>
          <Text style={styles.heroSubtitle}>Tout débloquer · 4.90 CHF/mois ou 39.90/an</Text>
        </View>

        {renderStatus()}

        <Card style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Ce que Pro inclut</Text>
          {PRO_FEATURES.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </Card>

        {!isPro && (
          <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.9} style={styles.subscribeWrap}>
            <LinearGradient
              colors={['#34D399', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subscribeBtn}
            >
              <Ionicons name="rocket" size={18} color="#0E1530" />
              <Text style={styles.subscribeText}>Découvrir les offres</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Restore Purchases — backend-validated */}
        <TouchableOpacity
          style={[styles.restoreButton, busy && { opacity: 0.6 }]}
          onPress={handleRestore}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={Colors.text} />
              <Text style={styles.restoreText}>
                {iap.phase === 'restoring' ? 'Restauration en cours…' : 'Validation…'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="refresh" size={16} color={Colors.text} />
              <Text style={styles.restoreText}>Restaurer mes achats</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.legalText}>
          L'abonnement se renouvelle automatiquement sauf annulation 24h avant la fin de la période.
          Géré par votre compte Apple. Restaurez vos achats si vous changez d'appareil.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  heroContainer: { alignItems: 'center', marginBottom: Spacing.xl },
  heroGradient: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: { color: Colors.text, fontSize: FontSizes.xxl, fontWeight: FontWeights.bold },
  heroSubtitle: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: 4, textAlign: 'center' },
  statusCard: {
    backgroundColor: `${Colors.success}15`,
    borderColor: `${Colors.success}30`,
    marginBottom: Spacing.lg,
  },
  statusCardFree: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: Spacing.lg,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  statusSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  featuresCard: { marginBottom: Spacing.lg },
  featuresTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  featureText: { color: Colors.textSecondary, fontSize: FontSizes.sm, flex: 1 },
  subscribeWrap: { borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: Spacing.md },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  subscribeText: {
    color: '#0E1530',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.black,
    letterSpacing: 0.3,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  restoreText: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  legalText: {
    color: Colors.textMuted,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
});
