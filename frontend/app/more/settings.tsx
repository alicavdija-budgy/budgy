/**
 * GUARDIAN MONEY CHF - Settings Screen
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
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore } from '../../src/stores/useStore';
import { Card } from '../../src/components/ui';
import { LANGUAGES } from '../../src/i18n/translations';
import { SUPPORTED_CURRENCIES } from '../../src/utils/currency';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useMoney } from '../../src/hooks/useMoney';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase, isSupabaseConfigured } from '../../src/lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { preferences, setPreferences, logout, clearAllData } = useStore();
  const { t } = useTranslation();
  const m = useMoney();
  const appVersion = '3.7.0';

  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('settings.logoutConfirmTitle'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            if (loggingOut) return;
            setLoggingOut(true);
            try {
              // 1. Sign out from Supabase to invalidate the access token server-side
              if (isSupabaseConfigured()) {
                try {
                  const sb = getSupabase();
                  if (sb) await sb.auth.signOut();
                } catch (e) {
                  console.warn('[logout] supabase signOut failed (continuing):', e);
                }
              }

              // 2. Wipe local Zustand state (user, transactions, prefs, sync queue, etc.)
              clearAllData();
              logout();

              // 3. Purge Supabase auth tokens cached in AsyncStorage
              try {
                const allKeys = await AsyncStorage.getAllKeys();
                const supabaseKeys = allKeys.filter(
                  (k) => k.startsWith('sb-') || k.includes('supabase') || k === 'supabase.auth.token'
                );
                if (supabaseKeys.length) {
                  await AsyncStorage.multiRemove(supabaseKeys);
                }
              } catch (e) {
                console.warn('[logout] async storage cleanup failed (non-fatal):', e);
              }

              // 4. Visual confirmation + redirect to login
              Alert.alert('✓ Déconnexion réussie', '', [
                { text: 'OK', onPress: () => router.replace('/auth' as any) },
              ]);
            } catch (e: any) {
              Alert.alert('Erreur', e?.message || 'Impossible de se déconnecter. Réessayez.');
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      t('settings.clearConfirmTitle'),
      t('settings.clearConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Language */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
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
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Currency */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.currency')}</Text>
          <View style={styles.currencyGrid}>
            {SUPPORTED_CURRENCIES.map((cur) => (
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
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
            {t('settings.currencyConverted', { c: m.code })} · {t('settings.example')} : {m.format(1000)}
          </Text>
        </Card>

        {/* Theme mode */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
          <View style={styles.themeRow}>
            {([
              { key: 'dark', label: t('settings.dark'), icon: 'moon' },
              { key: 'light', label: t('settings.light'), icon: 'sunny' },
              { key: 'system', label: t('settings.auto'), icon: 'phone-portrait' },
            ] as const).map((opt) => {
              const current = (preferences as any).themeMode || 'dark';
              const active = current === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeBtn, active && styles.themeBtnActive]}
                  onPress={() => setPreferences({ themeMode: opt.key } as any)}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={active ? theme.text : theme.textSecondary}
                  />
                  <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.themeHint}>
            {t('settings.themeHint')}
          </Text>
        </Card>

        {/* Data Info */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.dataSection')}</Text>
          {[
            { label: t('settings.backup'), value: t('settings.backupValue') },
            { label: t('settings.servers'), value: t('settings.serversValue') },
            { label: t('settings.version'), value: `${appVersion} · ${t('settings.appStoreReady')}` },
          ].map((item, idx) => (
            <View key={idx} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </Card>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.logoutButton, loggingOut && { opacity: 0.6 }]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.7}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={theme.warning} />
          ) : (
            <Ionicons name="log-out-outline" size={20} color={theme.warning} />
          )}
          <Text style={styles.logoutText}>
            {loggingOut ? 'Déconnexion...' : t('settings.logout')}
          </Text>
        </TouchableOpacity>

        <Card style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>{t('settings.dangerZone')}</Text>
          <Text style={styles.dangerText}>
            {t('settings.dangerText')}
          </Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleClearData}>
            <Ionicons name="trash-outline" size={18} color={theme.error} />
            <Text style={styles.deleteText}>{t('settings.clearData')}</Text>
          </TouchableOpacity>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
    color: theme.text,
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
    color: theme.text,
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
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  optionItemSelected: {
    backgroundColor: `${theme.primary}20`,
    borderColor: theme.primary,
  },
  optionFlag: {
    fontSize: 18,
  },
  optionLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
  },
  optionLabelSelected: {
    color: theme.primary,
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
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  currencyItemSelected: {
    backgroundColor: `${theme.success}20`,
    borderColor: theme.success,
  },
  currencyFlag: {
    fontSize: 20,
    marginBottom: 2,
  },
  currencyCode: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  currencyCodeSelected: {
    color: theme.success,
  },
  themeRow: { flexDirection: 'row', gap: Spacing.sm },
  themeBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', gap: 4,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder,
  },
  themeBtnActive: {
    backgroundColor: `${theme.primary}20`,
    borderColor: theme.primary,
  },
  themeLabel: { color: theme.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  themeLabelActive: { color: theme.text },
  themeHint: { color: theme.textTertiary, fontSize: FontSizes.xs, marginTop: Spacing.sm, fontStyle: 'italic' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.cardBorder,
  },
  infoLabel: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
  },
  infoValue: {
    color: theme.text,
    fontSize: FontSizes.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: `${theme.warning}15`,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  logoutText: {
    color: theme.warning,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  dangerCard: {
    backgroundColor: `${theme.error}08`,
    borderColor: `${theme.error}30`,
  },
  dangerTitle: {
    color: theme.error,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.sm,
  },
  dangerText: {
    color: theme.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: `${theme.error}15`,
    borderRadius: BorderRadius.md,
  },
  deleteText: {
    color: theme.error,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
