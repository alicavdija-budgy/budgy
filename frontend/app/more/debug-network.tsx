/**
 * BUDGY — DebugNetwork Screen
 *
 * Outil de diagnostic visible dans l'app (TestFlight inclus).
 *
 *
 * ⚠ Developer diagnostic screen. UI text is FR-CH only by design (used by
 * engineering / QA in TestFlight builds, not part of the released user flow).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import type { ThemePalette } from '../../src/constants/palettes';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { Button, Card } from '../../src/components/ui';
import { getApiBaseUrl, apiFetchJson, getNetworkState } from '../../src/lib/network';

type Probe = {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body?: any;
  status: 'idle' | 'loading' | 'ok' | 'fail';
  httpStatus?: number;
  ms?: number;
  err?: string;
  preview?: string;
};

const PROBES_INITIAL: Probe[] = [
  { label: 'Health', method: 'GET', path: '/api/health', status: 'idle' }, // i18n-technical (dev probe)
  { label: 'IAP Health', method: 'GET', path: '/api/iap/health', status: 'idle' }, // i18n-technical (dev probe)
  {
    label: 'Email Parse', // i18n-technical (dev probe)
    method: 'POST',
    path: '/api/email/parse',
    body: { content: 'Swisscom facture CHF 50 du 30.04.2026' }, // i18n-technical (backend test payload)
    status: 'idle',
  },
  {
    label: 'Optimizer', // i18n-technical (dev probe)
    method: 'POST',
    path: '/api/optimizer/analyze',
    body: {
      monthly_income: 6000, yearly_income: 72000, currency: 'CHF',
      transactions: [], recurring_expenses: [], contracts: [], debts: [], goals: [],
    },
    status: 'idle',
  },
];

export default function DebugNetworkScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [probes, setProbes] = useState<Probe[]>(PROBES_INITIAL);
  const [running, setRunning] = useState(false);
  const netState = getNetworkState();
  const baseUrl = getApiBaseUrl();
  const isOnline = netState.isConnected;
  const isReachable = netState.isInternetReachable;
  const releaseChannel = (Constants?.expoConfig as any)?.releaseChannel || (Constants as any)?.manifest?.releaseChannel || 'dev/preview';
  const sdkVersion = Constants?.expoConfig?.sdkVersion || (Constants as any)?.manifest?.sdkVersion || '?';
  const appVersion = Constants?.expoConfig?.version || (Constants as any)?.manifest?.version || '?';

  const runAll = async () => {
    setRunning(true);
    setProbes(PROBES_INITIAL.map((p) => ({ ...p, status: 'loading' as const })));
    for (let i = 0; i < PROBES_INITIAL.length; i++) {
      const p = PROBES_INITIAL[i];
      const t0 = Date.now();
      try {
        const r = await apiFetchJson<any>(p.path, {
          method: p.method,
          headers: p.body ? { 'Content-Type': 'application/json' } : undefined,
          body: p.body ? JSON.stringify(p.body) : undefined,
        }, { timeoutMs: 25000, retries: 0, silent: true });
        const ms = Date.now() - t0;
        const ok = r.ok && !!r.data;
        const preview = r.data
          ? JSON.stringify(r.data).slice(0, 120)
          : r.error
            ? String(r.error).slice(0, 120)
            : '';
        setProbes((cur) => {
          const next = [...cur];
          next[i] = {
            ...p,
            status: ok ? 'ok' : 'fail',
            httpStatus: r.status,
            ms,
            err: r.ok ? undefined : (r.error || `HTTP ${r.status}`),
            preview,
          };
          return next;
        });
      } catch (e: any) {
        setProbes((cur) => {
          const next = [...cur];
          next[i] = { ...p, status: 'fail', ms: Date.now() - t0, err: e?.message || 'error' };
          return next;
        });
      }
    }
    setRunning(false);
  };

  useEffect(() => { runAll(); }, []);

  const copyToClipboard = async () => {
    const report = [
      `Budgy DebugNetwork report`,
      `App: ${appVersion}  SDK: ${sdkVersion}  Channel: ${releaseChannel}`,
      `Backend URL: ${baseUrl || '(NOT CONFIGURED)'}`, // i18n-technical (clipboard report)
      `Network: type=${netState.type}, online=${isOnline}, reachable=${isReachable}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `---`,
      ...probes.map((p) => `${p.status === 'ok' ? '✅' : p.status === 'fail' ? '❌' : '⏳'} ${p.label} ${p.method} ${p.path} → ${p.httpStatus ?? '?'} (${p.ms ?? '?'}ms) ${p.err || ''}`),
    ].join('\n');
    await Clipboard.setStringAsync(report);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Debug réseau</Text>
        <TouchableOpacity onPress={copyToClipboard} style={styles.iconBtn}>
          <Ionicons name="copy-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 100 }}>
        <Card style={styles.infoCard}>
          <Text style={styles.h2}>Configuration runtime</Text>
          <Row label="App version" value={String(appVersion)} /> {/* i18n-technical (dev diagnostic) */}
          <Row label="Expo SDK" value={String(sdkVersion)} /> {/* i18n-technical */}
          <Row label="Channel" value={String(releaseChannel)} /> {/* i18n-technical */}
          <Row label="Platform" value={`${Platform.OS} ${String(Platform.Version)}`} /> {/* i18n-technical */}
          <Row label="Backend URL" value={baseUrl || t('smallUi.debugNotConfigured')} mono /> {/* i18n-technical */}
          <Row label="Network type" value={netState.type || '?'} /> {/* i18n-technical */}
          <Row label="Online" value={isOnline ? 'oui' : 'non'} highlight={!isOnline} /> {/* i18n-technical */}
          <Row label="Reachable" value={isReachable === false ? 'non' : isReachable ? 'oui' : '?'} highlight={isReachable === false} /> {/* i18n-technical */}
        </Card>

        <Card style={styles.infoCard}>
          <View style={styles.probeHeader}>
            <Text style={styles.h2}>Tests endpoints ({probes.length})</Text>
            <TouchableOpacity onPress={runAll} disabled={running} style={[styles.refreshBtn, running && { opacity: 0.5 }]}>
              <Ionicons name="refresh" size={16} color={theme.primary} />
              <Text style={styles.refreshTxt}>{running ? t('smallUi.debugInProgress') : 'Re-tester'}</Text>
            </TouchableOpacity>
          </View>
          {probes.map((p, i) => (
            <View key={i} style={styles.probeRow}>
              <View style={[styles.probeBadge, {
                backgroundColor: p.status === 'ok' ? `${theme.success}25` : p.status === 'fail' ? `${theme.error}25` : `${theme.warning}25`,
              }]}>
                <Ionicons
                  name={p.status === 'ok' ? 'checkmark-circle' : p.status === 'fail' ? 'close-circle' : 'time'}
                  size={18}
                  color={p.status === 'ok' ? theme.success : p.status === 'fail' ? theme.error : theme.warning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.probeLabel}>{p.label}</Text>
                <Text style={styles.probePath}>{p.method} {p.path}</Text>
                {(p.httpStatus !== undefined || p.ms !== undefined) && (
                  <Text style={styles.probeMeta}>HTTP {p.httpStatus ?? '?'} · {p.ms ?? '?'}ms</Text>
                )}
                {p.err && <Text style={styles.probeErr} numberOfLines={3}>{p.err}</Text>}
                {p.preview && p.status === 'ok' && (
                  <Text style={styles.probePreview} numberOfLines={2}>{p.preview}</Text>
                )}
              </View>
            </View>
          ))}
        </Card>

        <Button
          title={t('debugNetwork.copyReport')}
          variant="secondary"
          onPress={copyToClipboard}
          fullWidth
          icon="copy-outline"
        />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, alignItems: 'flex-start' }}>
      <Text style={{ width: 120, color: theme.textTertiary, fontSize: 12 }}>{label}</Text>
      <Text style={{ flex: 1, color: highlight ? theme.error : theme.text, fontSize: 12, fontFamily: mono ? (Platform.OS === 'ios' ? 'Menlo' : 'monospace') : undefined, fontWeight: '600' }}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  h2: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: 6 },
  infoCard: { marginBottom: Spacing.md, padding: Spacing.md },
  probeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: `${Colors.primary}15` },
  refreshTxt: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  probeRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.cardBorder, alignItems: 'flex-start' },
  probeBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  probeLabel: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  probePath: { color: Colors.textTertiary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
  probeMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  probeErr: { color: Colors.error, fontSize: 11, marginTop: 4, lineHeight: 15 },
  probePreview: { color: Colors.success, fontSize: 10, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
