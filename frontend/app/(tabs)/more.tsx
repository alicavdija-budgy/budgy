/**
 * GUARDIAN MONEY CHF - More Screen (reorganized by usage)
 * Groups: IA & Optimisation, Finances, Santé & Assurances,
 *         Documents & Scans, Partage, Sécurité & Cloud, Paramètres
 */

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { Card, Badge } from '../../src/components/ui';

interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
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
      title: 'IA & Optimisation',
      emoji: '🧠',
      items: [
        {
          id: 'ai-optimizer',
          title: 'Économiseur IA',
          subtitle: 'Analyse vos dépenses & propose des économies',
          icon: 'sparkles',
          color: '#EC4899',
          route: '/more/ai-optimizer',
          badge: 'NEW',
        },
        {
          id: 'predict',
          title: 'Guardian Predict IA',
          subtitle: 'Prédictions & Coach IA GPT',
          icon: 'analytics',
          color: C.warning,
          route: '/more/predict',
          pro: true,
        },
        {
          id: 'tax',
          title: 'Swiss Tax Optimizer',
          subtitle: 'Calcul impôts IFD + ICC',
          icon: 'calculator',
          color: C.primary,
          route: '/more/tax-optimizer',
        },
      ],
    },
    {
      title: 'Finances',
      emoji: '💰',
      items: [
        {
          id: 'budgets',
          title: 'Budgets',
          subtitle: 'Enveloppes mensuelles · revenu mensuel/annuel',
          icon: 'wallet',
          color: C.warning,
          route: '/more/budgets',
        },
        {
          id: 'recurring',
          title: 'Charges récurrentes',
          subtitle: 'Abonnements & charges fixes',
          icon: 'refresh',
          color: C.purple,
          route: '/more/recurring',
        },
        {
          id: 'investments',
          title: 'Investissements',
          subtitle: 'Portefeuille & performances',
          icon: 'trending-up',
          color: C.success,
          route: '/more/investments',
          pro: true,
        },
        {
          id: 'debts',
          title: 'Dettes',
          subtitle: 'Suivi des remboursements',
          icon: 'card',
          color: C.error,
          route: '/more/debts',
        },
        {
          id: 'invoices',
          title: 'Factures',
          subtitle: 'Suivi échéances & rappels',
          icon: 'receipt',
          color: C.orange,
          route: '/more/invoices',
        },
      ],
    },
    {
      title: 'Santé & Assurances',
      emoji: '🏥',
      items: [
        {
          id: 'lamal',
          title: 'LAMal (comparateur + subsides)',
          subtitle: '26 cantons · 15 assureurs · subsides inclus',
          icon: 'shield-checkmark',
          color: C.success,
          route: '/more/lamal-comparator',
        },
      ],
    },
    {
      title: 'Documents & Scans',
      emoji: '🧾',
      items: [
        {
          id: 'receipts',
          title: 'Tickets & Reçus',
          subtitle: 'Galerie scans · caisse / pro',
          icon: 'images',
          color: C.purple,
          route: '/more/receipts',
        },
        {
          id: 'documents',
          title: 'Mon Classeur',
          subtitle: 'Contrats, assurances, identité',
          icon: 'folder-open',
          color: '#A78BFA',
          route: '/more/documents',
        },
        {
          id: 'email-import',
          title: 'Import email IA',
          subtitle: 'Auto-extraction des factures',
          icon: 'mail-open',
          color: C.cyan,
          route: '/more/email-import',
        },
        {
          id: 'export',
          title: 'Export PDF',
          subtitle: 'Notes de frais A4 · TVA 8.1%',
          icon: 'document-text',
          color: C.teal,
          route: '/more/export-pdf',
        },
      ],
    },
    {
      title: 'Partage',
      emoji: '👥',
      items: [
        {
          id: 'groups',
          title: 'Groupes & Amis',
          subtitle: 'Dépenses partagées · Splitwise',
          icon: 'people',
          color: '#22D3EE',
          route: '/more/groups',
        },
        {
          id: 'family',
          title: 'Mode Famille',
          subtitle: 'Partage par code invitation',
          icon: 'home',
          color: C.pink,
          route: '/more/family',
        },
      ],
    },
    {
      title: 'Sécurité & Cloud',
      emoji: '🛡️',
      items: [
        {
          id: 'security',
          title: 'Sécurité',
          subtitle: 'PIN · Face ID · Mode panique',
          icon: 'shield-checkmark',
          color: '#10B981',
          route: '/more/security',
        },
        {
          id: 'cloud-sync',
          title: 'Sync Cloud',
          subtitle: 'Supabase · multi-appareils auto',
          icon: 'cloud-done',
          color: '#0EA5E9',
          route: '/more/cloud-sync',
        },
      ],
    },
    {
      title: 'Paramètres',
      emoji: '⚙️',
      items: [
        {
          id: 'subscription',
          title: 'Guardian Pro',
          subtitle: isPro ? 'Actif · merci !' : 'CHF 7.90/mois',
          icon: 'flash',
          color: C.primary,
          route: '/more/subscription',
          badge: isPro ? 'PRO' : undefined,
        },
        {
          id: 'settings',
          title: 'Paramètres',
          subtitle: 'Langue, devise, thème, notifications',
          icon: 'settings',
          color: C.textSecondary,
          route: '/more/settings',
        },
        {
          id: 'legal',
          title: 'Informations légales',
          subtitle: 'Confidentialité · CGU · Sources · Licences',
          icon: 'shield-half',
          color: C.info,
          route: '/more/legal',
        },
      ],
    },
  ];

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { padding: Spacing.lg },
    profileCard: { marginBottom: Spacing.lg },
    profileRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
    },
    avatarText: { color: '#FFFFFF', fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
    profileInfo: { flex: 1 },
    profileName: { color: C.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
    profileEmail: { color: C.textSecondary, fontSize: FontSizes.sm },
    section: { marginBottom: Spacing.lg },
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      marginBottom: Spacing.sm, marginLeft: Spacing.xs,
    },
    sectionEmoji: { fontSize: 16 },
    sectionTitle: {
      color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.bold,
      textTransform: 'uppercase', letterSpacing: 1,
    },
    menuCard: { padding: 0, overflow: 'hidden' },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    menuItemBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    menuIcon: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
    },
    menuContent: { flex: 1 },
    menuTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    menuTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
    menuSubtitle: { color: C.textSecondary, fontSize: FontSizes.sm, marginTop: 2 },
    appInfo: { alignItems: 'center', paddingVertical: Spacing.xl },
    appVersion: { color: C.textTertiary, fontSize: FontSizes.sm },
    appCopyright: { color: C.textMuted, fontSize: FontSizes.xs, marginTop: Spacing.xs },
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(user?.name || 'User')}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Utilisateur'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            </View>
            {isPro && <Badge text="PRO" color={C.primary} />}
          </View>
        </Card>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>{section.emoji}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Card style={styles.menuCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.menuItem, index < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={() => {
                    if (item.pro && !isPro) {
                      router.push('/more/subscription');
                    } else {
                      router.push(item.route as any);
                    }
                  }}
                >
                  <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                    <Ionicons name={item.icon} size={22} color={item.color} />
                  </View>
                  <View style={styles.menuContent}>
                    <View style={styles.menuTitleRow}>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                      {item.badge && <Badge text={item.badge} color={item.color} size="sm" />}
                      {item.pro && !isPro && <Badge text="PRO" color={C.textTertiary} size="sm" />}
                    </View>
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.textTertiary} />
                </TouchableOpacity>
              ))}
            </Card>
          </View>
        ))}

        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Guardian Money CHF v3.6</Text>
          <Text style={styles.appCopyright}>Données chiffrées · Sync Supabase · 100% privé</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
