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

export default function CloudSyncScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const store = useStore();
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
    ? 'Cloud synchronisé ✨'
    : signInRequired
      ? 'Connectez-vous au cloud'
      : 'Configuration cloud requise';
  const heroSubTxt = cloudReady
    ? 'Vos données sont protégées et synchronisées sur tous vos appareils'
    : signInRequired
      ? 'Activez la sync multi-appareil avec votre compte gratuit'
      : 'Le cloud est désactivé — utilisez l\'app normalement, vos données restent en local';

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
      Alert.alert('Envoi réussi', `${r.pushed} éléments envoyés vers Supabase.`);
    } else { setError(r.error || 'Erreur'); }
  };

  const doPull = async () => {
    setWorking('pull'); setError(null);
    const r = await pullAllFromCloud();
    setWorking(null);
    if (r.ok) {
      setLastSync({ at: new Date(), pushed: 0, pulled: r.pulled });
      Alert.alert('Récupération réussie', `${r.pulled} éléments récupérés depuis Supabase.`);
    } else { setError(r.error || 'Erreur'); }
  };

  const doBoth = async () => {
    setWorking('both'); setError(null);
    const r = await syncRoundTrip();
    setWorking(null);
    if (!r.error) {
      setLastSync({ at: new Date(), pushed: r.pushed, pulled: r.pulled });
      Alert.alert('Sync complète', `↑ ${r.pushed} envoyés · ↓ ${r.pulled} récupérés`);
    } else { setError(r.error); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Sync Cloud</Text>
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
          <Text style={styles.statTitle}>État local</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Éléments stockés</Text>
            <Text style={styles.statValue}>{localCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Configuration Supabase</Text>
            <Text style={[styles.statValue, { color: isSupabaseConfigured() ? theme.success : theme.error }]}>
              {isSupabaseConfigured() ? 'OK' : 'Manquante'}
            </Text>
          </View>
          {lastSync && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Dernière sync</Text>
              <Text style={styles.statValue}>
                {lastSync.at.toLocaleTimeString('fr-CH')}  ↑{lastSync.pushed} ↓{lastSync.pulled}
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
            <Text style={styles.sectionTitle}>Actions de sync</Text>
            <Button
              title={working === 'both' ? 'Sync en cours...' : 'Sync complète (recommandé)'}
              onPress={doBoth}
              loading={working === 'both'}
              disabled={!!working}
              fullWidth size="lg" icon="sync"
              style={{ marginBottom: Spacing.md }}
            />
            <Button
              title={working === 'push' ? 'Envoi...' : 'Envoyer mes données vers le cloud ↑'}
              variant="secondary"
              onPress={doPush}
              loading={working === 'push'}
              disabled={!!working}
              fullWidth icon="cloud-upload"
              style={{ marginBottom: Spacing.md }}
            />
            <Button
              title={working === 'pull' ? 'Récupération...' : 'Récupérer depuis le cloud ↓'}
              variant="secondary"
              onPress={doPull}
              loading={working === 'pull'}
              disabled={!!working}
              fullWidth icon="cloud-download"
            />
          </>
        ) : signInRequired ? (
          <Button
            title="Se connecter au cloud"
            onPress={() => router.push('/auth')}
            fullWidth size="lg" icon="log-in"
            style={{ marginTop: Spacing.lg }}
          />
        ) : (
          <View style={[styles.helpCard, { backgroundColor: `${theme.warning}10`, borderColor: theme.warning, borderWidth: 1, padding: Spacing.lg, marginTop: Spacing.lg, borderRadius: BorderRadius.lg }]}>
            <Text style={[styles.helpTitle, { color: theme.warning }]}>Cloud désactivé sur cet appareil</Text>
            <Text style={styles.helpText}>
              La sync cloud n'est pas configurée. Vos données restent stockées localement sur votre iPhone — l'app fonctionne normalement sans cloud.
            </Text>
          </View>
        )}

        {working && <ActivityIndicator color={theme.primaryLight} style={{ marginTop: Spacing.lg }} />}

        <Card style={[styles.helpCard, { marginTop: Spacing.xl }]}>
          <Text style={styles.helpTitle}>Sync automatique activée ✨</Text>
          <Text style={styles.helpText}>
            • 🔐 <Text style={styles.bold}>À la connexion</Text> : récupération automatique des données cloud{'\n'}
            • 📲 <Text style={styles.bold}>Retour dans l'app</Text> : pull automatique (toutes les 30 s max){'\n'}
            • 💾 <Text style={styles.bold}>Mise en arrière-plan</Text> : push automatique de vos changements{'\n'}
            • 🔄 <Text style={styles.bold}>Sync manuelle</Text> : utilisez les boutons ci-dessus pour forcer
          </Text>
        </Card>

        <Card style={[styles.helpCard, { marginTop: Spacing.md }]}>
          <Text style={styles.helpTitle}>Actions manuelles</Text>
          <Text style={styles.helpText}>
            • La <Text style={styles.bold}>sync complète</Text> envoie vos données puis récupère le cloud{'\n'}
            • <Text style={styles.bold}>Envoyer ↑</Text> : vos données locales écrasent le cloud{'\n'}
            • <Text style={styles.bold}>Récupérer ↓</Text> : le cloud écrase vos données locales
          </Text>
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
