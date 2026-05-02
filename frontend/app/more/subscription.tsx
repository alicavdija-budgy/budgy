/**
 * GUARDIAN MONEY CHF - Subscription Screen
 * Budgy Pro subscription management
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';

const PRO_FEATURES = [
  'Transactions illimitées',
  'Export PDF A4 professionnel',
  'Budgets envelopes',
  'Transactions récurrentes',
  'Portefeuille investissements',
  'Rapports avancés',
  '8 langues · multi-devises',
  'Budgy IA conseiller',
  'Budgy Score™',
  'Projection 10 ans',
  '3 piliers CH · FIRE tracker',
  'Biométrie & sécurité',
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, setPro } = useStore();

  const handleSubscribe = () => {
    // In a real app, this would use RevenueCat
    Alert.alert(
      'Budgy Pro',
      'Cette fonctionnalité sera disponible avec RevenueCat. Pour l\'instant, activez le mode Pro gratuitement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer Pro',
          onPress: () => {
            setPro(true);
            Alert.alert('⭐ Bienvenue dans Budgy Pro !', 'Toutes les fonctionnalités sont maintenant déverrouillées.');
          },
        },
      ]
    );
  };

  const handleRestore = () => {
    Alert.alert('Restauration', 'Aucun achat précédent trouvé.');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Budgy Pro</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={Colors.gradientPrimary as [string, string]}
            style={styles.heroGradient}
          >
            <Ionicons name="flash" size={48} color={Colors.text} />
          </LinearGradient>
          <Text style={styles.heroTitle}>Budgy Pro</Text>
          <Text style={styles.heroPrice}>7.90 CHF/mois</Text>
          <Text style={styles.heroSubtitle}>Tout déverrouiller</Text>
        </View>

        {/* Current Status */}
        {isPro && (
          <Card style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
              <Text style={styles.statusText}>Vous êtes abonné à Budgy Pro</Text>
            </View>
          </Card>
        )}

        {/* Features */}
        <Card style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Fonctionnalités incluses</Text>
          {PRO_FEATURES.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <Ionicons name="checkmark" size={18} color={Colors.success} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </Card>

        {/* Comparison */}
        <Card style={styles.comparisonCard}>
          <View style={styles.comparisonRow}>
            <View style={styles.comparisonCol}>
              <Text style={styles.comparisonTitle}>Gratuit</Text>
              <Text style={styles.comparisonItem}>5 transactions</Text>
              <Text style={styles.comparisonItem}>2 contrats</Text>
              <Text style={styles.comparisonItem}>1 appareil</Text>
            </View>
            <View style={[styles.comparisonCol, styles.comparisonColPro]}>
              <Text style={[styles.comparisonTitle, { color: Colors.primary }]}>Pro</Text>
              <Text style={styles.comparisonItem}>Illimité</Text>
              <Text style={styles.comparisonItem}>Illimité</Text>
              <Text style={styles.comparisonItem}>Multi-appareils</Text>
            </View>
          </View>
        </Card>

        {/* CTA */}
        {!isPro && (
          <Button
            title="Passer à Pro — 7.90 CHF/mois"
            onPress={handleSubscribe}
            fullWidth
            size="lg"
            style={{ marginBottom: Spacing.md }}
          />
        )}

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
          <Text style={styles.restoreText}>Restaurer les achats</Text>
        </TouchableOpacity>

        {/* Legal */}
        <Text style={styles.legalText}>
          L'abonnement se renouvelle automatiquement sauf annulation 24h avant la fin de la période.
          Les achats sont facturés via votre compte App Store/Google Play.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  heroGradient: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  heroPrice: {
    color: Colors.primary,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
    marginTop: Spacing.sm,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
  statusCard: {
    backgroundColor: `${Colors.success}15`,
    borderColor: `${Colors.success}30`,
    marginBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  statusText: {
    color: Colors.success,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  featuresCard: {
    marginBottom: Spacing.lg,
  },
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
  featureText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  comparisonCard: {
    marginBottom: Spacing.lg,
  },
  comparisonRow: {
    flexDirection: 'row',
  },
  comparisonCol: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonColPro: {
    backgroundColor: `${Colors.primary}10`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginLeft: Spacing.md,
  },
  comparisonTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.sm,
  },
  comparisonItem: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  restoreText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  legalText: {
    color: Colors.textMuted,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
});
