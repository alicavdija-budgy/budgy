/**
 * GUARDIAN MONEY CHF - Legal Hub
 * Central screen with links to all legal pages (required by Apple & Google).
 */

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../../src/constants/theme';
import { useTheme } from '../../../src/hooks/useTheme';
import { useTranslation } from '../../../src/hooks/useTranslation';
import { Card } from '../../../src/components/ui';

export default function LegalScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useTheme();

  const items = [
    {
      id: 'privacy',
      title: t('legalIndex.privacyTitle'),
      subtitle: t('legalIndex.privacySub'),
      icon: 'shield-checkmark' as const,
      color: C.success,
      route: '/more/legal/privacy',
    },
    {
      id: 'terms',
      title: 'Conditions d’utilisation',
      subtitle: 'CGU de l’application Budgy',
      icon: 'document-text' as const,
      color: C.primary,
      route: '/more/legal/terms',
    },
    {
      id: 'disclaimer',
      title: t('legalIndex.disclaimerTitle'),
      subtitle: t('legalIndex.disclaimerSub'),
      icon: 'warning' as const,
      color: C.warning,
      route: '/more/legal/disclaimer',
    },
    {
      id: 'sources',
      title: t('legalIndex.sourcesTitle'),
      subtitle: t('legalIndex.sourcesSub'),
      icon: 'library' as const,
      color: C.cyan,
      route: '/more/legal/sources',
    },
    {
      id: 'licenses',
      title: t('legalIndex.licensesTitle'),
      subtitle: 'Bibliothèques utilisées dans l’application',
      icon: 'code-slash' as const,
      color: C.purple,
      route: '/more/legal/licenses',
    },
  ];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
    content: { padding: Spacing.lg },
    intro: {
      color: C.textSecondary, fontSize: FontSizes.sm, lineHeight: 22,
      marginBottom: Spacing.lg,
    },
    menuCard: { padding: 0, overflow: 'hidden', marginBottom: Spacing.lg },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    menuItemBorder: { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    iconCircle: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
    },
    itemContent: { flex: 1 },
    itemTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
    itemSubtitle: { color: C.textSecondary, fontSize: FontSizes.sm, marginTop: 2 },
    footer: {
      alignItems: 'center', paddingVertical: Spacing.xl,
    },
    footerText: { color: C.textTertiary, fontSize: FontSizes.xs, textAlign: 'center', lineHeight: 18 },
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Informations légales</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Budgy est une application d’assistance budgétaire personnelle destinée à un usage
          privé et éducatif. Elle n’est affiliée à aucune institution financière ni à aucun organisme officiel suisse.
        </Text>

        <Card style={styles.menuCard}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, index < items.length - 1 && styles.menuItemBorder]}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.textTertiary} />
            </TouchableOpacity>
          ))}
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Budgy{'\n'}
            Application éditée par un particulier — Suisse{'\n'}
            contact: support@budgy.ch
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
