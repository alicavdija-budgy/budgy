/**
 * GUARDIAN MONEY CHF - Cloud Sync Screen
 * Manual sync UI + status. Auto-sync happens on login via auth.tsx.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button } from '../../src/components/ui';
import {
  pushAllToCloud, pullAllFromCloud, syncRoundTrip, isSignedInToSupabase,
} from '../../src/services/cloudSync';
import { isSupabaseConfigured } from '../../src/lib/supabase';
import { useTranslation } from '../../src/hooks/useTranslation';
import { DATE_LOCALES } from '../../src/i18n/translations';

export default function CloudSyncScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const store = useStore();
  const { t, lang } = useTranslation();
  const locale = DATE_LOCALES[lang];
  const [signedIn, setSignedIn] = useState(false);
  const [working, setWorking] = useState<'push' | 'pull' | 'both' | null>(null);
  const [lastSync, setLastSync] = useState<{ at: Date; pushed: number; pulled: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isSignedInToSupabase().then(setSignedIn);
  }, []);

  const supabaseConfigured = isSupabaseConfigured();

  // Three-state UX:
  //  • cloudReady       → user is signed in & ready to sync ("Cloud synchronisé")
  //  • signInRequired   → config OK but no session yet ("Connectez-vous au cloud")
  //  • configMissing    → env vars not set ("Configuration cloud requise")
  const cloudReady = signedIn && supabaseConfigured;
  const signInRequired = supabaseConfigured && !signedIn;

  const heroGradient: [string, string] = cloudReady
    ? (theme.gradientSuccess as [string, string])
    : signInRequired
      ? ['#1E40AF', '#2563EB']
      : ['#7C2D12', '#9A3412'];
  const heroIcon = cloudReady ? 'cloud-done' : signInRequired ? 'cloud-outline' : 'cloud-offline';
  const heroTitleTxt = cloudReady
    ? t('cloudSyncUi.heroReadyTitle')
    : signInRequired
      ? t('cloudSyncUi.heroSignInTitle')
      : t('cloudSyncUi.heroConfigTitle');
  const heroSubTxt = cloudReady
    ? t('cloudSyncUi.heroReadySub')
    : signInRequired
      ? t('cloudSyncUi.heroSignInSub')
      : t('cloudSyncUi.heroConfigSub');

  const localCount =
    store.transactions.length + store.incomes.length + store.savingsGoals.length +
    store.budgets.length + store.recurringExpenses.length + store.contracts.length +
    store.debts.length + store.investments.length + store.receipts.length +
    store.invoices.length + store.documents.length + store.groups.length + store.groupExpenses.length;

  const doPush = async () => {
    setWorking('push'); setError(null);
    const r = await pushAllToCloud();
    setWorking(null);
    if (r.ok) {
      setLastSync({ at: new Date(), pushed: r.pushed, pulled: 0 });
      Alert.alert(t('cloudSyncUi.pushOkTitle'), t('cloudSyncUi.pushOkBody', { n: r.pushed }));
    } else { setError(r.error || t('cloudSyncUi.errorGeneric')); }
  };

  const doPull = async () => {
    setWorking('pull'); setError(null);
    const r = await pullAllFromCloud();
    setWorking(null);
    if (r.ok) {
      setLastSync({ at: new Date(), pushed: 0, pulled: r.pulled });
      Alert.alert(t('cloudSyncUi.pullOkTitle'), t('cloudSyncUi.pullOkBody', { n: r.pulled }));
    } else { setError(r.error || t('cloudSyncUi.errorGeneric')); }
  };

  const doBoth = async () => {
    setWorking('both'); setError(null);
    const r = await syncRoundTrip();
    setWorking(null);
    if (!r.error) {
      setLastSync({ at: new Date(), pushed: r.pushed, pulled: r.pulled });
      Alert.alert(t('cloudSyncUi.syncOkTitle'), t('cloudSyncUi.syncOkBody', { pushed: r.pushed, pulled: r.pulled }));
    } else { setError(r.error); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('cloudSyncUi.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <LinearGradient
          colors={heroGradient}
          style={styles.hero}
        >
          <Ionicons name={heroIcon as any} size={36} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{heroTitleTxt}</Text>
            <Text style={styles.heroSub}>{heroSubTxt}</Text>
          </View>
        </LinearGradient>

        <Card style={styles.statCard}>
          <Text style={styles.statTitle}>{t('cloudSyncUi.localState')}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('cloudSyncUi.localItems')}</Text>
            <Text style={styles.statValue}>{localCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('cloudSyncUi.configLabel')}</Text>
            <Text style={[styles.statValue, { color: isSupabaseConfigured() ? theme.success : theme.error }]}>
              {isSupabaseConfigured() ? t('cloudSyncUi.configOk') : t('cloudSyncUi.configMissing')}
            </Text>
          </View>
          {lastSync && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>{t('cloudSyncUi.lastSync')}</Text>
              <Text style={styles.statValue}>
                {t('cloudSyncUi.lastSyncFmt', { time: lastSync.at.toLocaleTimeString(locale), pushed: lastSync.pushed, pulled: lastSync.pulled })}
              </Text>
            </View>
          )}
        </Card>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={theme.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {cloudReady ? (
          <>
            <Text style={styles.sectionTitle}>{t('cloudSyncUi.actionsTitle')}</Text>
            <Button
              title={working === 'both' ? t('cloudSyncUi.syncing') : t('cloudSyncUi.syncFull')}
              onPress={doBoth}
              loading={working === 'both'}
              disabled={!!working}
              fullWidth size="lg" icon="sync"
              style={{ marginBottom: Spacing.md }}
            />
            <Button
              title={working === 'push' ? t('cloudSyncUi.sending') : t('cloudSyncUi.sendCta')}
              variant="secondary"
              onPress={doPush}
              loading={working === 'push'}
              disabled={!!working}
              fullWidth icon="cloud-upload"
              style={{ marginBottom: Spacing.md }}
            />
            <Button
              title={working === 'pull' ? t('cloudSyncUi.pulling') : t('cloudSyncUi.pullCta')}
              variant="secondary"
              onPress={doPull}
              loading={working === 'pull'}
              disabled={!!working}
              fullWidth icon="cloud-download"
            />
          </>
        ) : signInRequired ? (
          <Button
            title={t('cloudSyncUi.signInCta')}
            onPress={() => router.push('/auth')}
            fullWidth size="lg" icon="log-in"
            style={{ marginTop: Spacing.lg }}
          />
        ) : (
          <View style={[styles.helpCard, { backgroundColor: `${theme.warning}10`, borderColor: theme.warning, borderWidth: 1, padding: Spacing.lg, marginTop: Spacing.lg, borderRadius: BorderRadius.lg }]}>
            <Text style={[styles.helpTitle, { color: theme.warning }]}>{t('cloudSyncUi.cloudDisabledTitle')}</Text>
            <Text style={styles.helpText}>{t('cloudSyncUi.cloudDisabledBody')}</Text>
          </View>
        )}

        {working && <ActivityIndicator color={theme.primaryLight} style={{ marginTop: Spacing.lg }} />}

        <Card style={[styles.helpCard, { marginTop: Spacing.xl }]}>
          <Text style={styles.helpTitle}>{t('cloudSyncUi.helpAutoTitle')}</Text>
          <Text style={styles.helpText}>{t('cloudSyncUi.helpAutoBody')}</Text>
        </Card>

        <Card style={[styles.helpCard, { marginTop: Spacing.md }]}>
          <Text style={styles.helpTitle}>{t('cloudSyncUi.helpManualTitle')}</Text>
          <Text style={styles.helpText}>{t('cloudSyncUi.helpManualBody')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  heroTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSizes.xs, marginTop: 2 },
  statCard: { padding: Spacing.lg, marginBottom: Spacing.lg },
  statTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  statLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  statValue: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: `${Colors.error}15`, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { flex: 1, color: Colors.error, fontSize: FontSizes.sm },
  sectionTitle: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  helpCard: { padding: Spacing.lg },
  helpTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
  helpText: { color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 22 },
  bold: { color: Colors.text, fontWeight: FontWeights.bold },
});
