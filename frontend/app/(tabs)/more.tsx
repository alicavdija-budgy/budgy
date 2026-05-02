/**
 * BUDGY - More Screen (Premium simplified)
 * 6 clean sections with generous spacing + animations.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
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
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();
  const { user, isPro } = useStore();

  const sections: { title: string; emoji: string; items: MenuItem[] }[] = [
    {
      title: 'IA',
      emoji: '🧠',
      items: [
        { id: 'ai-optimizer', title: 'Économiseur IA', subtitle: 'Trouve des économies concrètes', icon: 'sparkles', color: C.pink, route: '/more/ai-optimizer', badge: 'NEW' },
        { id: 'predict', title: 'Coach Predict', subtitle: 'Prédictions & conseils GPT', icon: 'analytics', color: C.secondary, route: '/more/predict', pro: true },
        { id: 'tax', title: 'Optimiseur d\'impôts', subtitle: 'IFD + ICC', icon: 'calculator', color: C.primaryLight, route: '/more/tax-optimizer' },
      ],
    },
    {
      title: 'Finances',
      emoji: '💰',
      items: [
        { id: 'budgets', title: 'Budgets', subtitle: 'Enveloppes mensuelles', icon: 'wallet', color: C.warning, route: '/more/budgets' },
        { id: 'recurring', title: 'Charges récurrentes', icon: 'refresh', color: C.purple, route: '/more/recurring' },
        { id: 'investments', title: 'Investissements', icon: 'trending-up', color: C.success, route: '/more/investments', pro: true },
        { id: 'debts', title: 'Dettes', icon: 'card', color: C.error, route: '/more/debts' },
        { id: 'invoices', title: 'Factures', icon: 'receipt', color: C.orange, route: '/more/invoices' },
        { id: 'lamal', title: 'LAMal & Subsides', subtitle: '26 cantons · 15 assureurs', icon: 'shield-checkmark', color: C.cyan, route: '/more/lamal-comparator' },
      ],
    },
    {
      title: 'Documents',
      emoji: '📎',
      items: [
        { id: 'receipts', title: 'Tickets & reçus', icon: 'images', color: C.purple, route: '/more/receipts' },
        { id: 'documents', title: 'Mon classeur', icon: 'folder-open', color: C.primaryLight, route: '/more/documents' },
        { id: 'email-import', title: 'Import email IA', icon: 'mail-open', color: C.cyan, route: '/more/email-import' },
        { id: 'export', title: 'Export PDF', icon: 'document-text', color: C.teal, route: '/more/export-pdf' },
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
        { id: 'subscription', title: 'Budgy Pro', subtitle: isPro ? 'Actif · merci !' : 'CHF 7.90/mois', icon: 'flash', color: C.secondary, route: '/more/subscription', badge: isPro ? 'PRO' : undefined },
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
                    if (item.pro && !isPro) router.push('/more/subscription');
                    else router.push(item.route as any);
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
