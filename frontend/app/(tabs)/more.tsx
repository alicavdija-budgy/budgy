/**
 * GUARDIAN MONEY CHF - More Screen
 * Hub for additional features: Tax Optimizer, LAMal Comparator, Settings, etc.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
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
  const { user, isPro, preferences } = useStore();

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Modules Swiss',
      items: [
        {
          id: 'tax',
          title: 'Swiss Tax Optimizer',
          subtitle: 'Calculez vos impôts IFD+ICC',
          icon: 'calculator',
          color: Colors.primary,
          route: '/more/tax-optimizer',
        },
        {
          id: 'lamal',
          title: 'Comparateur LAMal',
          subtitle: '15 assureurs Priminfo · 26 cantons',
          icon: 'shield-checkmark',
          color: Colors.success,
          route: '/more/lamal-comparator',
        },
        {
          id: 'lamal-subsidy',
          title: 'Subsides LAMal',
          subtitle: 'Calcul personnalisé par revenu',
          icon: 'cash',
          color: Colors.successLight,
          route: '/more/lamal-subsidy',
        },
        {
          id: 'predict',
          title: 'Guardian Predict IA',
          subtitle: 'Prédictions & Coach IA GPT',
          icon: 'analytics',
          color: Colors.warning,
          route: '/more/predict',
          pro: true,
        },
        {
          id: 'family',
          title: 'Mode Famille',
          subtitle: 'Partagez avec code invitation',
          icon: 'people',
          color: Colors.pink,
          route: '/more/family',
        },
      ],
    },
    {
      title: 'Gestion financière',
      items: [
        {
          id: 'budgets',
          title: 'Budgets',
          subtitle: 'Gérez vos enveloppes',
          icon: 'wallet',
          color: Colors.warning,
          route: '/more/budgets',
        },
        {
          id: 'recurring',
          title: 'Récurrents',
          subtitle: 'Abonnements & charges fixes',
          icon: 'refresh',
          color: Colors.purple,
          route: '/more/recurring',
        },
        {
          id: 'investments',
          title: 'Investissements',
          subtitle: 'Portefeuille & performances',
          icon: 'trending-up',
          color: Colors.success,
          route: '/more/investments',
          pro: true,
        },
        {
          id: 'debts',
          title: 'Dettes',
          subtitle: 'Suivi des remboursements',
          icon: 'card',
          color: Colors.error,
          route: '/more/debts',
        },
        {
          id: 'export',
          title: 'Export PDF',
          subtitle: 'Notes de frais A4 · TVA 8.1%',
          icon: 'document-text',
          color: Colors.teal,
          route: '/more/export-pdf',
        },
        {
          id: 'invoices',
          title: 'Factures',
          subtitle: 'Import email · Rappels échéances',
          icon: 'receipt',
          color: Colors.orange,
          route: '/more/invoices',
        },
        {
          id: 'email-import',
          title: 'Import email IA',
          subtitle: 'Auto-extraction des factures',
          icon: 'mail-open',
          color: Colors.cyan,
          route: '/more/email-import',
        },
        {
          id: 'receipts',
          title: 'Tickets & Reçus',
          subtitle: 'Galerie des scans · caisse / pro',
          icon: 'images',
          color: Colors.purple,
          route: '/more/receipts',
        },
      ],
    },
    {
      title: 'Paramètres',
      items: [
        {
          id: 'subscription',
          title: 'Guardian Pro',
          subtitle: isPro ? 'Actif' : 'CHF 7.90/mois',
          icon: 'flash',
          color: Colors.primary,
          route: '/more/subscription',
          badge: isPro ? 'PRO' : undefined,
        },
        {
          id: 'settings',
          title: 'Paramètres',
          subtitle: 'Langue, devise, notifications',
          icon: 'settings',
          color: Colors.textSecondary,
          route: '/more/settings',
        },
      ],
    },
  ];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(user?.name || 'User')}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Utilisateur'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            </View>
            {isPro && <Badge text="PRO" color={Colors.primary} />}
          </View>
        </Card>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Card style={styles.menuCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.menuItem,
                    index < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => {
                    if (item.pro && !isPro) {
                      router.push('/more/subscription');
                    } else {
                      router.push(item.route as any);
                    }
                  }}
                >
                  <View style={[styles.menuIcon, { backgroundColor: `${item.color}15` }]}>
                    <Ionicons name={item.icon} size={22} color={item.color} />
                  </View>
                  <View style={styles.menuContent}>
                    <View style={styles.menuTitleRow}>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                      {item.badge && <Badge text={item.badge} color={item.color} size="sm" />}
                      {item.pro && !isPro && <Badge text="PRO" color={Colors.textTertiary} size="sm" />}
                    </View>
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </Card>
          </View>
        ))}

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Guardian Money CHF v3.0</Text>
          <Text style={styles.appCopyright}>Données stockées localement · 100% privé</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  profileCard: {
    marginBottom: Spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  profileEmail: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  menuCard: {
    padding: 0,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  menuTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  menuSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  appVersion: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  appCopyright: {
    color: Colors.textMuted,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
});
