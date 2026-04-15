/**
 * GUARDIAN MONEY CHF - Settings Screen
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
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card } from '../../src/components/ui';
import { LANGUAGES, CURRENCIES } from '../../src/data/swiss-data';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, setPreferences, logout, clearAllData } = useStore();

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnecter', onPress: logout },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Supprimer les données',
      'Cette action est irréversible. Toutes vos données seront supprimées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: clearAllData,
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Language */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Langue</Text>
          <View style={styles.optionsGrid}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.optionItem,
                  preferences.language === lang.code && styles.optionItemSelected,
                ]}
                onPress={() => setPreferences({ language: lang.code as any })}
              >
                <Text style={styles.optionFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.optionLabel,
                  preferences.language === lang.code && styles.optionLabelSelected,
                ]}>
                  {lang.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Currency */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Devise</Text>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map((cur) => (
              <TouchableOpacity
                key={cur.code}
                style={[
                  styles.currencyItem,
                  preferences.currency === cur.code && styles.currencyItemSelected,
                ]}
                onPress={() => setPreferences({ currency: cur.code as any })}
              >
                <Text style={styles.currencyFlag}>{cur.flag}</Text>
                <Text style={[
                  styles.currencyCode,
                  preferences.currency === cur.code && styles.currencyCodeSelected,
                ]}>
                  {cur.code}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Data Info */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Données</Text>
          {[
            { label: 'Sauvegarde', value: 'Temps réel · local' },
            { label: 'Serveurs', value: 'Aucun · 100% privé' },
            { label: 'Version', value: '3.0.0 · App Store Ready' },
          ].map((item, idx) => (
            <View key={idx} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </Card>

        {/* Actions */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.warning} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>

        <Card style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>⚠️ Zone dangereuse</Text>
          <Text style={styles.dangerText}>
            Supprime toutes vos données localement. Irréversible.
          </Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleClearData}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <Text style={styles.deleteText}>Supprimer mes données</Text>
          </TouchableOpacity>
        </Card>

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
  card: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  optionItemSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  optionFlag: {
    fontSize: 18,
  },
  optionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  currencyItem: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  currencyItemSelected: {
    backgroundColor: `${Colors.success}20`,
    borderColor: Colors.success,
  },
  currencyFlag: {
    fontSize: 20,
    marginBottom: 2,
  },
  currencyCode: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  currencyCodeSelected: {
    color: Colors.success,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  infoValue: {
    color: Colors.text,
    fontSize: FontSizes.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: `${Colors.warning}15`,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  logoutText: {
    color: Colors.warning,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  dangerCard: {
    backgroundColor: `${Colors.error}08`,
    borderColor: `${Colors.error}30`,
  },
  dangerTitle: {
    color: Colors.error,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.sm,
  },
  dangerText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: `${Colors.error}15`,
    borderRadius: BorderRadius.md,
  },
  deleteText: {
    color: Colors.error,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
