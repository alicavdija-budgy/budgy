/**
 * BUDGY - More Screen (Premium simplified)
 * 6 clean sections with generous spacing + animations.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { usePremiumStore } from '../../src/stores/usePremiumStore';
import { usePaywall } from '../../src/hooks/usePaywall';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useMoney } from '../../src/hooks/useMoney';
import PressScale from '../../src/components/PressScale';

interface MenuItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  badge?: string;
  pro?: boolean;
  feature?: import('../../src/stores/usePremiumStore').ProFeature;
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { user } = useStore();
  const isPro = usePremiumStore((s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now()));
  const isTrial = usePremiumStore((s) => s.trialEndsAt !== null && s.trialEndsAt > Date.now() && !s.plan);
  const trialEndsAt = usePremiumStore((s) => s.trialEndsAt);
  const paywall = usePaywall();
  const { t } = useTranslation();

  const sections: { title: string; emoji: string; items: MenuItem[] }[] = [
    {
      title: 'IA',
      emoji: '🧠',
      items: [
        { id: 'ai-optimizer', title: 'Économiseur IA', subtitle: 'Trouve des économies concrètes', icon: 'sparkles', color: C.pink, route: '/more/ai-optimizer', badge: 'NEW', pro: true, feature: 'ai' },
        { id: 'predict', title: 'Coach Predict', subtitle: 'Prédictions & conseils GPT', icon: 'analytics', color: C.secondary, route: '/more/predict', pro: true, feature: 'predict' },
        { id: 'tax', title: 'Optimiseur d\'impôts', subtitle: 'IFD + ICC', icon: 'calculator', color: C.primaryLight, route: '/more/tax-optimizer', pro: true, feature: 'tax' },
      ],
    },
    {
      title: t('more.sectionFinance'),
      emoji: '💰',
      items: [
        { id: 'incomes', title: t('more.incomes'), subtitle: t('more.incomesSub'), icon: 'cash', color: C.success, route: '/more/incomes' },
        { id: 'budgets', title: t('more.budgets'), subtitle: t('more.budgetsSub'), icon: 'wallet', color: C.warning, route: '/more/budgets' },
        { id: 'recurring', title: t('more.recurring'), subtitle: t('more.recurringSub'), icon: 'refresh', color: C.purple, route: '/more/recurring', pro: true, feature: 'recurring' },
        { id: 'investments', title: t('more.investments'), icon: 'trending-up', color: C.success, route: '/more/investments', pro: true, feature: 'investments' },
        { id: 'debts', title: t('more.debts'), icon: 'card', color: C.error, route: '/more/debts' },
        { id: 'invoices', title: t('more.invoices'), subtitle: t('more.invoicesSub'), icon: 'receipt', color: C.orange, route: '/more/invoices', pro: true, feature: 'invoices' },
        { id: 'lamal', title: t('more.lamal'), subtitle: t('more.lamalSub'), icon: 'shield-checkmark', color: C.cyan, route: '/more/lamal-comparator' },
      ],
    },
    {
      title: 'Documents',
      emoji: '📎',
      items: [
        { id: 'receipts', title: 'Tickets & reçus', icon: 'images', color: C.purple, route: '/more/receipts' },
        { id: 'documents', title: 'Mon classeur', icon: 'folder-open', color: C.primaryLight, route: '/more/documents' },
        { id: 'email-import', title: 'Import email IA', icon: 'mail-open', color: C.cyan, route: '/more/email-import' },
        { id: 'export', title: 'Export PDF', icon: 'document-text', color: C.teal, route: '/more/export-pdf', pro: true, feature: 'export' },
      ],
    },
    {
      title: 'Partage',
      emoji: '👥',
      items: [
        { id: 'groups', title: 'Groupes & amis', subtitle: 'Dépenses partagées', icon: 'people', color: C.cyan, route: '/more/groups' },
        { id: 'family', title: 'Mode famille', icon: 'home', color: C.pink, route: '/more/family' },
      ],
    },
    {
      title: 'Sécurité',
      emoji: '🛡️',
      items: [
        { id: 'security', title: 'Verrou & biométrie', subtitle: 'PIN · Face ID · panique', icon: 'shield-checkmark', color: C.success, route: '/more/security' },
        { id: 'cloud-sync', title: 'Sync Cloud', subtitle: 'Supabase · auto multi-appareils', icon: 'cloud-done', color: C.info, route: '/more/cloud-sync' },
      ],
    },
    {
      title: 'Paramètres',
      emoji: '⚙️',
      items: [
        { id: 'subscription', title: 'Budgy Pro', subtitle: isPro ? (isTrial ? `Essai · fin ${new Date(trialEndsAt!).toLocaleDateString('fr-CH')}` : 'Actif · merci !') : 'CHF 4.90/mois · 7j d\'essai gratuit', icon: 'flash', color: C.secondary, route: '/paywall', badge: isPro ? 'PRO' : undefined },
        { id: 'settings', title: 'Préférences', subtitle: 'Langue · devise · thème', icon: 'settings', color: C.textSecondary, route: '/more/settings' },
        { id: 'legal', title: 'Informations légales', subtitle: 'Confidentialité · CGU · Sources', icon: 'shield-half', color: C.info, route: '/more/legal' },
      ],
    },
  ];

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const styles = makeStyles(C);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.profileCard}>
            <LinearGradient colors={C.gradientPrimary as [string, string]} style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(user?.name || 'User')}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Utilisateur'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            </View>
            {isPro && (
              <View style={styles.proBadge}>
                <Ionicons name="flash" size={12} color="#1C1917" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Upgrade banner (non-pro users only) */}
        {!isPro && (
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => paywall.open('manual')}
              style={{ marginBottom: Spacing.xl }}
            >
              <LinearGradient
                colors={['#34D399', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.upgradeBanner}
              >
                <View style={styles.upgradeIconWrap}>
                  <Ionicons name="sparkles" size={22} color="#0E1530" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.upgradeTitle}>{t('more.upgrade')}</Text>
                  <Text style={styles.upgradeSub}>
                    {t('more.upgradeSub')}
                  </Text>
                </View>
                <View style={styles.upgradeArrow}>
                  <Ionicons name="arrow-forward" size={18} color="#0E1530" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Trial banner (user in trial) */}
        {isTrial && trialEndsAt && (
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <View style={styles.trialBanner}>
              <Ionicons name="time" size={18} color="#34D399" />
              <Text style={styles.trialText}>
                {t('more.trialActive', { n: Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 3600 * 1000))) })}
              </Text>
              <TouchableOpacity onPress={() => paywall.open('manual')}>
                <Text style={styles.trialCta}>{t('more.subscribe')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {sections.map((section, idx) => (
          <Animated.View
            key={section.title}
            entering={FadeInDown.duration(400).delay(100 + idx * 60)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>{section.emoji}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <PressScale
                  key={item.id}
                  haptic="selection"
                  onPress={() => {
                    // Pro-gated items: use gateFeature for preview quota logic
                    if (item.pro && item.feature) {
                      paywall.gateFeature(item.feature, () => router.push(item.route as any));
                      return;
                    }
                    // Non-feature Pro items: open paywall directly
                    if (item.pro && !isPro) {
                      paywall.open('manual');
                      return;
                    }
                    router.push(item.route as any);
                  }}
                  style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]}
                >
                  <View style={styles.menuItemInner}>
                    <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                      <Ionicons name={item.icon} size={20} color={item.color} />
                    </View>
                    <View style={styles.menuContent}>
                      <View style={styles.menuTitleRow}>
                        <Text style={styles.menuTitle}>{item.title}</Text>
                        {item.badge && (
                          <View style={[styles.smallBadge, { backgroundColor: `${item.color}25` }]}>
                            <Text style={[styles.smallBadgeText, { color: item.color }]}>{item.badge}</Text>
                          </View>
                        )}
                        {item.pro && !isPro && (
                          <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed" size={10} color={C.textTertiary} />
                          </View>
                        )}
                      </View>
                      {item.subtitle && <Text style={styles.menuSubtitle}>{item.subtitle}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                  </View>
                </PressScale>
              ))}
            </View>
          </Animated.View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Budgy v3.7</Text>
          <Text style={styles.footerSub}>Données chiffrées · Sync privée 🇨🇭</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: Spacing.lg },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: BorderRadius.xl, padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { color: '#FFF', fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  profileInfo: { flex: 1 },
  profileName: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, letterSpacing: -0.3 },
  profileEmail: { color: C.textSecondary, fontSize: FontSizes.sm, marginTop: 2 },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.secondary, paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 999,
  },
  proBadgeText: { color: '#1C1917', fontSize: 10, fontWeight: FontWeights.black, letterSpacing: 0.5 },

  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  upgradeIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(14,21,48,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  upgradeTitle: {
    color: '#0E1530', fontSize: 16, fontWeight: '900', letterSpacing: -0.3,
  },
  upgradeSub: {
    color: 'rgba(14,21,48,0.75)', fontSize: 12, marginTop: 2, fontWeight: '600',
  },
  upgradeArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(14,21,48,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)',
  },
  trialText: { flex: 1, color: C.text, fontSize: 13, fontWeight: '600' },
  trialCta: { color: '#34D399', fontSize: 13, fontWeight: '800' },

  section: { marginBottom: Spacing.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.sm, marginLeft: Spacing.xs,
  },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: {
    color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.black,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  menuCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    borderRadius: BorderRadius.xl, overflow: 'hidden',
  },
  menuItem: {},
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  menuItemInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  menuIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  menuContent: { flex: 1 },
  menuTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  menuTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold, letterSpacing: -0.2 },
  menuSubtitle: { color: C.textSecondary, fontSize: 12, marginTop: 2 },

  smallBadge: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 },
  smallBadgeText: { fontSize: 9, fontWeight: FontWeights.black, letterSpacing: 0.5 },
  lockBadge: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: C.cardHover,
    alignItems: 'center', justifyContent: 'center',
  },

  footer: { alignItems: 'center', paddingVertical: Spacing.lg },
  footerText: { color: C.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  footerSub: { color: C.textMuted, fontSize: FontSizes.xs, marginTop: Spacing.xs },
});
