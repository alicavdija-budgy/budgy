/**
 * BUDGY — Subscription Screen (More → Settings → Subscription)
 *
 * Shows current Pro state + Restore Purchases (real, backend-validated).
 * Subscribe redirects to the dedicated /paywall screen.
 */

import React, { useState, useMemo } from 'react';
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
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { useIAP } from '../../src/hooks/useIAP';
import { useTranslation } from '../../src/hooks/useTranslation';
import { Card } from '../../src/components/ui';

const PRO_FEATURE_KEYS = [
  'softPaywall.benefit1',
  'softPaywall.benefit2',
  'softPaywall.benefit3',
  'softPaywall.benefit4',
  'softPaywall.benefit5',
  'softPaywall.benefit6',
  'softPaywall.benefit7',
  'softPaywall.benefit8',
];

export default function SubscriptionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
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
      Alert.alert(t('iap.restoreTitle'), t('iap.restoreOnlyNative'), [{ text: t('iap.ctaOK') }]);
      return;
    }
    setLocalBusy(true);
    try {
      try { if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const res = await iap.restore();
      if (res.notConfigured) {
        Alert.alert(t('iap.restoreBackendNotConfiguredTitle'), t('iap.restoreBackendNotConfiguredBody'), [
          { text: t('iap.ctaOK') },
        ]);
        return;
      }
      if (res.success) {
        try { if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        const n = res.restored || 0;
        Alert.alert(
          t('iap.restoreDoneTitle'),
          t(n > 1 ? 'iap.restoreDoneBodyPlural' : 'iap.restoreDoneBody', { n })
        );
      } else if (res.state === 'EXPIRED' || res.state === 'REFUNDED') {
        Alert.alert(t('iap.restoreExpiredTitle'), t('iap.restoreExpiredBody'));
      } else {
        Alert.alert(t('iap.restoreNoneTitle'), t('iap.restoreNoneBody'));
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
            <Ionicons name="lock-closed" size={22} color={theme.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{t('more.freePlan') || t('subscriptionScreen.freePlan')}</Text>
              <Text style={styles.statusSub}>{t('more.tryProSub') || t('subscriptionUi.tryPro')}</Text>
            </View>
          </View>
        </Card>
      );
    }
    const isTrial = trialEndsAt && trialEndsAt > Date.now() && !plan;
    return (
      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={22} color={theme.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: theme.success }]}>
              {isTrial
                ? (t('more.trialActive') || t('subscriptionUi.trialActive'))
                : `Budgy Pro ${plan === 'annual' ? '· ' + (t('more.yearly') || t('subscriptionScreen.yearly')) : plan === 'monthly' ? '· ' + (t('more.monthly') || t('subscriptionScreen.monthly')) : ''}`}
            </Text>
            <Text style={styles.statusSub}>
              {isTrial && trialEndsAt
                ? `${t('more.trialEnds') || t('subscriptionUi.endsOn')} ${new Date(trialEndsAt).toLocaleDateString()}`
                : subscriptionStartedAt
                ? `${t('more.activeSince') || t('subscriptionScreen.activeSince')} ${new Date(subscriptionStartedAt).toLocaleDateString()}`
                : (t('more.thanks') || t('subscriptionUi.thanks'))}
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
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('subscriptionScreen.title')}</Text>
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
          <Text style={styles.heroSubtitle}>{t('more.heroSub') || t('subscriptionUi.unlockAll')}</Text>
        </View>

        {renderStatus()}

        <Card style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>{t('more.featuresTitle') || t('subscriptionUi.whatsIncluded')}</Text>
          {PRO_FEATURE_KEYS.map((k, idx) => (
            <View key={idx} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.success} />
              <Text style={styles.featureText}>{t(k)}</Text>
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
              <Text style={styles.subscribeText}>{t('more.discoverPlans') || t('subscriptionUi.discoverOffers')}</Text>
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
              <ActivityIndicator size="small" color={theme.text} />
              <Text style={styles.restoreText}>
                {iap.phase === 'restoring' ? t('iap.btnRestoreInProgress') : t('iap.btnValidating')}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="refresh" size={16} color={theme.text} />
              <Text style={styles.restoreText}>{t('iap.btnRestore')}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.legalText}>{t('iap.legal')}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
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
