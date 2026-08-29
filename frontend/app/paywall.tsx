/**
 * BUDGY — Premium Paywall
 *
 * App Review 2.1(b) — v3.9.0 / Build 73
 * ────────────────────────────────────────────────────────────────────
 * The paywall MUST route the primary CTA through Apple StoreKit
 * (`iap.purchase()`), never through a local "startTrial" bypass.
 * The free trial, if any, comes from the Introductory Offer configured
 * on the subscription product in App Store Connect and is presented
 * only when Apple StoreKit reports it in `introOffer.isFreeTrial`
 * (v15 normalised field — see src/services/iap.ts `extractIntroOffer`).
 *
 * Pricing, currency and trial period ALL come from StoreKit — no
 * fallback hardcoded numbers. When StoreKit fails, the CTA is disabled
 * and a "Retry" button is shown. Pro is NEVER activated locally.
 *
 * iPad-safe: the content is centred with `maxWidth: 560` so that on
 * iPad Air 11" (M3) the paywall never spans the full width.
 *
 * Legal: Terms & Privacy links (https://budgy.ch/{terms,privacy}) are
 * exposed in the footer, and a visible "Restore purchases" link goes
 * through StoreKit `getAvailablePurchases` (see useIAP.restore()).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
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
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { usePremiumStore, type Plan } from '../src/stores/usePremiumStore';
import { useTranslation } from '../src/hooks/useTranslation';
import { useIAP } from '../src/hooks/useIAP';
import type { IapProduct } from '../src/services/iap';

// Static, brand-independent benefits (no price, no currency)
const BENEFIT_KEYS = [
  { icon: 'sparkles', color: '#34D399', titleKey: 'softPaywall.benefit1', descKey: 'softPaywall.voiceSubtitle' },
  { icon: 'analytics', color: '#22D3EE', titleKey: 'softPaywall.benefit2', descKey: 'softPaywall.timelineSubtitle' },
  { icon: 'flash', color: '#F59E0B', titleKey: 'softPaywall.benefit3', descKey: 'softPaywall.benefit3' },
  { icon: 'cloud-done', color: '#8B5CF6', titleKey: 'softPaywall.benefit5', descKey: 'softPaywall.benefit5' },
  { icon: 'trophy', color: '#EC4899', titleKey: 'softPaywall.benefit4', descKey: 'softPaywall.benefit4' },
] as const;

const TERMS_URL = 'https://budgy.ch/terms';
const PRIVACY_URL = 'https://budgy.ch/privacy';

// ── Helpers ──────────────────────────────────────────────────────────────
function getTriggerCopy(trigger: string | undefined, t: (k: string, p?: any) => string) {
  switch (trigger) {
    case 'feature_ai':
      return { title: t('paywallTriggers.aiTitle'), subtitle: t('paywallTriggers.aiSubtitle') };
    case 'feature_tax':
      return { title: t('paywallTriggers.taxTitle'), subtitle: t('paywallTriggers.taxSubtitle') };
    case 'feature_analytics':
      return { title: t('paywallTriggers.analyticsTitle'), subtitle: t('paywallTriggers.analyticsSubtitle') };
    case 'feature_export':
      return { title: t('paywallTriggers.exportTitle'), subtitle: t('paywallTriggers.exportSubtitle') };
    case 'feature_cloud':
      return { title: t('paywallTriggers.cloudTitle'), subtitle: t('paywallTriggers.cloudSubtitle') };
    case 'organic_transactions':
      return { title: t('paywallTriggers.organicTitle'), subtitle: t('paywallTriggers.organicSubtitle') };
    default:
      return { title: t('paywallTriggers.defaultTitle'), subtitle: t('paywallTriggers.defaultSubtitle') };
  }
}

/** Does this StoreKit product ship with an Introductory Offer that is a
 * free trial? v15 exposes a normalised `introOffer` field on IapProduct. */
function hasIntroductoryFreeTrial(product: IapProduct | null): boolean {
  if (!product) return false;
  return !!product.introOffer?.isFreeTrial;
}

/** Format the trial in days using the normalised StoreKit period info. */
function formatIntroductoryPeriodDays(product: IapProduct | null): number | null {
  if (!product) return null;
  const offer = product.introOffer;
  if (!offer || !offer.isFreeTrial) return null;
  return offer.periodDays;
}

// ── Screen ───────────────────────────────────────────────────────────────
export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Plan>('annual');
  const [processing, setProcessing] = useState(false);

  const markDismissed = usePremiumStore((s) => s.markPaywallDismissed);
  const iap = useIAP();

  const copy = getTriggerCopy(params.trigger, t);

  // Pulsing glow
  const glow = useSharedValue(0.4);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(0.9, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  // v3.9.0 Build 76 — Auto-retry once if StoreKit returns 0 products on
  // first attempt (Apple review can hit us before StoreKit finishes
  // propagating products). We wait 2s, then request `reload()` a single
  // time. NEVER activates Pro locally — this is just a re-fetch.
  const [autoRetried, setAutoRetried] = useState(false);
  useEffect(() => {
    if (autoRetried) return;
    if (!iap.available) return;
    if (!iap.ready) return; // still loading first attempt
    if (iap.annual || iap.monthly) return; // we have products
    const timer = setTimeout(() => {
      try { iap.reload(); } catch {}
      setAutoRetried(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [autoRetried, iap.available, iap.ready, iap.annual, iap.monthly, iap]);

  // StoreKit-backed product state
  const productsLoading = iap.phase === 'loading' || (!iap.ready && iap.available);
  const productsAvailable = iap.available && (!!iap.annual || !!iap.monthly);
  const productsError = iap.available && iap.ready && !productsAvailable;

  const selectedProduct: IapProduct | null = useMemo(
    () => (selected === 'annual' ? iap.annual : iap.monthly),
    [selected, iap.annual, iap.monthly]
  );

  const showTrial = hasIntroductoryFreeTrial(selectedProduct);
  const trialDays = formatIntroductoryPeriodDays(selectedProduct);

  const buyDisabled =
    processing ||
    iap.phase !== 'idle' ||
    (iap.available && !selectedProduct); // must have real product on native

  // ── Actions ─────────────────────────────────────────────────────────────

  const handlePurchase = async () => {
    if (buyDisabled) return;

    setProcessing(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}

    // Real StoreKit purchase (with backend receipt validation).
    // Web / Expo Go path: gently redirect the user to the TestFlight/App
    // Store build (never activate Pro locally).
    if (!iap.available) {
      setProcessing(false);
      Alert.alert(t('iap.restoreTitle'), t('iap.restoreOnlyNative'), [{ text: t('iap.ctaOK') }]);
      return;
    }

    const res = await iap.purchase(selected);
    setProcessing(false);

    if (res.cancelled) return; // silent on user cancel
    if (res.notConfigured) {
      Alert.alert(t('iap.pendingTitle'), t('iap.pendingBody'), [{ text: t('iap.ctaOK') }]);
      return;
    }
    if (res.success) {
      try {
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {}
      Alert.alert(
        t('iap.welcomeTitle'),
        selected === 'annual' ? t('iap.welcomeYearly') : t('iap.welcomeMonthly'),
        [{ text: t('iap.ctaStart'), onPress: () => router.back() }]
      );
    } else {
      Alert.alert(t('iap.buyFailedTitle'), res.error || t('iap.buyFailedBody'));
    }
  };

  const handleRestore = async () => {
    if (processing) return;
    if (!iap.available) {
      Alert.alert(t('iap.restoreTitle'), t('iap.restoreOnlyNative'), [{ text: t('iap.ctaOK') }]);
      return;
    }
    setProcessing(true);
    const res = await iap.restore();
    setProcessing(false);

    if (res.notConfigured) {
      Alert.alert(
        t('iap.restoreBackendNotConfiguredTitle'),
        t('iap.restoreBackendNotConfiguredBody'),
        [{ text: t('iap.ctaOK') }]
      );
      return;
    }
    if (res.success) {
      try {
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {}
      const n = res.restored || 0;
      Alert.alert(
        t('iap.restoreDoneTitle'),
        t(n > 1 ? 'iap.restoreDoneBodyPlural' : 'iap.restoreDoneBody', { n }),
        [{ text: t('iap.ctaSuper'), onPress: () => router.back() }]
      );
    } else if (res.state === 'EXPIRED' || res.state === 'REFUNDED') {
      Alert.alert(t('iap.restoreExpiredTitle'), t('iap.restoreExpiredBody'), [
        { text: t('iap.ctaOK') },
      ]);
    } else {
      Alert.alert(t('iap.restoreNoneTitle'), t('iap.restoreNoneBody'), [{ text: t('iap.ctaOK') }]);
    }
  };

  const handleRetryLoad = () => {
    iap.reload();
  };

  const handleClose = () => {
    markDismissed();
    router.back();
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {}
  };

  // ── Derived UI text ────────────────────────────────────────────────────

  const annualPriceLabel = iap.annual?.localizedPrice || null;
  const monthlyPriceLabel = iap.monthly?.localizedPrice || null;
  const monthlyEquivalent = (() => {
    if (!iap.annual) return null;
    const raw = Number(iap.annual.price);
    if (!raw || Number.isNaN(raw)) return null;
    const per = raw / 12;
    const cur = iap.annual.currency || '';
    return `${cur} ${per.toFixed(2)}`.trim();
  })();

  const ctaLabel = (() => {
    if (iap.phase === 'restoring') return t('iap.btnRestoreInProgress');
    if (iap.phase === 'validating') return t('iap.btnValidating');
    if (iap.phase === 'purchasing') return t('iap.btnValidating');
    if (processing) return '…';
    if (showTrial && trialDays) {
      return t('paywallTriggers.trialCta');
    }
    return t('paywallTriggers.subscribeCta');
  })();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={14}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRestore}
            hitSlop={14}
            disabled={processing || iap.phase === 'restoring'}
          >
            <Text style={styles.restoreLink}>{t('iap.btnRestore')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 220 }}
      >
        <View style={styles.contentWrap}>
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
            {BENEFIT_KEYS.map((b) => (
              <View key={b.titleKey} style={styles.benefitRow}>
                <View style={[styles.benefitIcon, { backgroundColor: `${b.color}22` }]}>
                  <Ionicons name={b.icon as any} size={20} color={b.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{t(b.titleKey)}</Text>
                  <Text style={styles.benefitDesc}>{t(b.descKey)}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              </View>
            ))}
          </View>

          {/* Social proof */}
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
            <Text style={styles.socialText}>{t('paywallTriggers.socialProof')}</Text>
          </View>

          {/* ── Products loading OR pending (informational, NOT an error) ── */}
          {(productsLoading ||
            (productsError && iap.diagnosticCode === 'PRODUCTS_NOT_FOUND')) && (
            <View style={styles.pendingBox}>
              <ActivityIndicator color="#22D3EE" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTitle}>
                  {productsLoading
                    ? t('paywallTriggers.loadingProducts')
                    : t('paywallTriggers.productsNotFoundTitle')}
                </Text>
                <Text style={styles.pendingBody}>
                  {productsLoading
                    ? t('paywallTriggers.loadingProductsSub')
                    : t('paywallTriggers.productsNotFoundBody')}
                </Text>
              </View>
              {!productsLoading && (
                <TouchableOpacity onPress={handleRetryLoad} style={styles.retryBtnSoft}>
                  <Ionicons name="refresh" size={14} color="#0E1530" />
                  <Text style={styles.retryTxt}>{t('paywallTriggers.retry')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── True error state (network / StoreKit unavailable) ────── */}
          {productsError && iap.diagnosticCode !== 'PRODUCTS_NOT_FOUND' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#F87171" />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>
                  {iap.diagnosticCode === 'STOREKIT_UNAVAILABLE'
                    ? t('paywallTriggers.storekitUnavailableTitle')
                    : iap.diagnosticCode === 'NETWORK_ERROR'
                      ? t('paywallTriggers.networkErrorTitle')
                      : t('paywallTriggers.productsErrorTitle')}
                </Text>
                <Text style={styles.errorBody}>
                  {iap.diagnosticCode === 'STOREKIT_UNAVAILABLE'
                    ? t('paywallTriggers.storekitUnavailableBody')
                    : iap.diagnosticCode === 'NETWORK_ERROR'
                      ? t('paywallTriggers.networkErrorBody')
                      : t('paywallTriggers.productsErrorBody')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleRetryLoad} style={styles.retryBtn}>
                <Ionicons name="refresh" size={14} color="#0E1530" />
                <Text style={styles.retryTxt}>{t('paywallTriggers.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Plans (only when StoreKit responded successfully) ─────── */}
          {productsAvailable && (
            <View style={styles.plans}>
              {/* Annual */}
              {iap.annual && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setSelected('annual')}
                  style={[styles.plan, selected === 'annual' && styles.planActive]}
                >
                  {selected === 'annual' && (
                    <LinearGradient
                      colors={['#34D399', '#22D3EE']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.recommendBadge}
                    >
                      <Text style={styles.recommendText}>
                        ⭐ {t('paywall.bestOffer')}
                      </Text>
                    </LinearGradient>
                  )}
                  <View style={styles.planRow}>
                    <View style={styles.planRadio}>
                      {selected === 'annual' && <View style={styles.planRadioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle}>{t('paywall.annual')}</Text>
                      {monthlyEquivalent ? (
                        <Text style={styles.planSub}>
                          {t('paywallTriggers.annualPerMonth', {
                            price: monthlyEquivalent,
                            yearly: annualPriceLabel,
                          })}
                        </Text>
                      ) : (
                        <Text style={styles.planSub}>{annualPriceLabel}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.planPrice}>{annualPriceLabel}</Text>
                      <Text style={styles.planPriceUnit}>{t('paywallTriggers.periodYear')}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Monthly */}
              {iap.monthly && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setSelected('monthly')}
                  style={[styles.plan, selected === 'monthly' && styles.planActive]}
                >
                  <View style={styles.planRow}>
                    <View style={styles.planRadio}>
                      {selected === 'monthly' && <View style={styles.planRadioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle}>{t('paywall.monthly')}</Text>
                      <Text style={styles.planSub}>{t('paywallTriggers.monthlyFlex')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.planPrice}>{monthlyPriceLabel}</Text>
                      <Text style={styles.planPriceUnit}>{t('paywallTriggers.periodMonth')}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Reassurance */}
          <View style={styles.reassureRow}>
            <View style={styles.reassureItem}>
              <Ionicons name="shield-checkmark" size={16} color="#34D399" />
              <Text style={styles.reassureText}>{t('paywall.noCommit')}</Text>
            </View>
            <View style={styles.reassureItem}>
              <Ionicons name="refresh-circle" size={16} color="#22D3EE" />
              <Text style={styles.reassureText}>{t('paywall.cancelAny')}</Text>
            </View>
            <View style={styles.reassureItem}>
              <Ionicons name="lock-closed" size={16} color="#8B5CF6" />
              <Text style={styles.reassureText}>{t('paywall.securePay')}</Text>
            </View>
          </View>

          {/* Trial fine-print (only if StoreKit exposes an Intro Offer) */}
          {productsAvailable && showTrial && trialDays && annualPriceLabel && (
            <Text style={styles.trialLine}>
              {t('paywallTriggers.introHasTrial', {
                days: trialDays,
                price:
                  selected === 'annual'
                    ? `${annualPriceLabel} ${t('paywallTriggers.annualLabel')}`
                    : `${monthlyPriceLabel} ${t('paywallTriggers.monthlyLabel')}`,
              })}
            </Text>
          )}

          {/* Legal + Terms/Privacy links */}
          <Text style={styles.fineprint}>{t('paywallTriggers.legalIntro')}</Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => openLink(TERMS_URL)} hitSlop={10}>
              <Text style={styles.legalLink}>{t('paywallTriggers.terms')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}> · </Text>
            <TouchableOpacity onPress={() => openLink(PRIVACY_URL)} hitSlop={10}>
              <Text style={styles.legalLink}>{t('paywallTriggers.privacy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient
          colors={['rgba(14,21,48,0)', 'rgba(14,21,48,0.95)', '#0E1530']}
          style={styles.ctaGradient}
          pointerEvents="none"
        />
        <View style={styles.ctaWrapCentered}>
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={buyDisabled}
            activeOpacity={0.85}
            style={[styles.ctaWrap, buyDisabled && styles.ctaDisabled]}
            testID="paywall-primary-cta"
          >
            <LinearGradient
              colors={buyDisabled ? ['#374151', '#374151'] : ['#34D399', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaBtn}
            >
              <Ionicons
                name={showTrial ? 'rocket' : 'lock-closed'}
                size={18}
                color="#0E1530"
              />
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary link with real price */}
          {productsAvailable && selectedProduct && (
            <Text style={styles.subLegal}>
              {selected === 'annual'
                ? `${annualPriceLabel} / ${t('paywallTriggers.periodYear')}`
                : `${monthlyPriceLabel} / ${t('paywallTriggers.periodMonth')}`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E1530' },

  // iPad-safe centred content (max width 560 for legibility)
  contentWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  topBarInner: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  restoreLink: {
    color: '#22D3EE',
    fontSize: 14,
    fontWeight: '600',
  },

  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#34D399',
    opacity: 0.35,
  },
  icon: { width: 84, height: 84, borderRadius: 20 },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    marginBottom: 12,
  },
  proBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
    paddingHorizontal: 12,
  },

  benefits: { gap: 10, marginBottom: 16 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  benefitDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2, lineHeight: 16 },

  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.15)',
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#0E1530',
  },
  socialText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, flex: 1 },

  // ── Loading / error states ─────────────────────────────────
  stateBox: {
    marginVertical: 16,
    padding: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  errorBox: {
    marginVertical: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // v3.9.0 Build 76 — informational (blue) state for the very expected
  // case where StoreKit needs a beat to return products (fresh reviewer
  // account on iPad, first paywall open, etc.). NOT red, NOT alarming.
  pendingBox: {
    marginVertical: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingTitle: { color: '#67E8F9', fontSize: 13, fontWeight: '700' },
  pendingBody: { color: 'rgba(191,219,254,0.9)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  retryBtnSoft: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#67E8F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: { color: '#FCA5A5', fontSize: 13, fontWeight: '700' },
  errorBody: { color: 'rgba(252,165,165,0.85)', fontSize: 12, marginTop: 2 },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FCA5A5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryTxt: { color: '#0E1530', fontSize: 12, fontWeight: '800' },

  plans: { gap: 10, marginTop: 6, marginBottom: 12 },
  plan: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  planActive: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52,211,153,0.08)',
  },
  recommendBadge: {
    position: 'absolute',
    top: -12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recommendText: { color: '#0E1530', fontSize: 10, fontWeight: '900' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399' },
  planTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  planSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  planPrice: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  planPriceUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  reassureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  reassureItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reassureText: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },

  trialLine: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  fineprint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  legalLink: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legalDot: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  // Sticky CTA
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  ctaGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -60,
    bottom: 0,
  },
  ctaWrapCentered: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  ctaWrap: { borderRadius: 18, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.5 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  ctaText: { color: '#0E1530', fontSize: 16, fontWeight: '900' },
  subLegal: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
});
