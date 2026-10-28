/**
 * BUDGY ALERTS — centre d'alertes premium (Budgy Smart 4.0, Phase 3).
 *
 * - Flux d'alertes généré par des règles déterministes (alertsEngine) sur les
 *   données locales : rien n'est inventé, aucun appel réseau ni IA.
 * - Préférences par catégorie, heures silencieuses, fréquence, confidentialité
 *   écran verrouillé (montants masqués par défaut).
 * - Carburant & Actualités : préparés, désactivés tant que des sources
 *   officielles réutilisables ne sont pas validées (EXTERNAL_ALERTS_ENABLED).
 * - Conserve l'historique existant (useStore.notifications) et les rappels
 *   OS livrés en phase 1 (identifiants fixes, J-90/30/7/1, LAMal).
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { useAlertsStore } from '../../src/stores/useAlertsStore';
import { evaluateAlerts, type AlertCategory } from '../../src/services/alertsEngine';
import { getMonthlyFinancialSnapshot } from '../../src/stores/selectors';
import { EXTERNAL_ALERTS_ENABLED } from '../../src/config/features';

const CATEGORY_META: Record<AlertCategory, { icon: any; labelKey: string; subKey: string }> = {
  contracts: { icon: 'document-text', labelKey: 'alerts.catContracts', subKey: 'alerts.catContractsSub' },
  budget: { icon: 'pie-chart', labelKey: 'alerts.catBudget', subKey: 'alerts.catBudgetSub' },
  invoices: { icon: 'receipt', labelKey: 'alerts.catInvoices', subKey: 'alerts.catInvoicesSub' },
  fuel: { icon: 'speedometer', labelKey: 'alerts.catFuel', subKey: 'alerts.catFuelSub' },
  news: { icon: 'newspaper', labelKey: 'alerts.catNews', subKey: 'alerts.catNewsSub' },
};

const QUIET_PRESETS: { start: number; end: number }[] = [
  { start: 21, end: 7 },
  { start: 22, end: 7 },
  { start: 23, end: 8 },
];

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { notifications, markNotificationRead, incomes, transactions, recurringExpenses, invoices } = useStore();
  const {
    prefs, alerts, setCategoryEnabled, setQuietHours, setFrequency, setShowAmounts,
    upsertAlerts, markRead, markAllRead,
  } = useAlertsStore();

  // ── Génération déterministe des alertes à l'ouverture ──
  useEffect(() => {
    const snapshot = getMonthlyFinancialSnapshot({ incomes, transactions, recurringExpenses, invoices });
    const d = new Date();
    const prev = getMonthlyFinancialSnapshot({
      incomes, transactions, recurringExpenses, invoices,
      now: new Date(d.getFullYear(), d.getMonth(), 0),
    });
    const fresh = evaluateAlerts({
      monthlyIncome: snapshot.monthlyIncome,
      paidExpenses: snapshot.paidExpenses,
      prevPaidExpenses: prev.paidExpenses,
      totalCommitted: snapshot.totalCommitted,
      txCountThisMonth: snapshot.txCountThisMonth,
      prevTxCount: prev.txCountThisMonth,
      invoices: invoices.map((i) => ({ id: i.id, title: i.title, amount: i.amount, dueDate: i.dueDate, status: i.status })),
      enabled: prefs.categories,
    });
    if (fresh.length) upsertAlerts(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length + notifications.filter((n) => !n.read).length;

  const quietLabel = prefs.quietEnabled
    ? `${String(prefs.quietStart).padStart(2, '0')}:00 – ${String(prefs.quietEnd).padStart(2, '0')}:00`
    : t('alerts.quietOff');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('alerts.title')}</Text>
          {unreadCount > 0 && (
            <Text style={styles.subtitle}>{unreadCount} {t('alerts.unread')}</Text>
          )}
        </View>
        {(alerts.length > 0 || notifications.length > 0) && (
          <TouchableOpacity onPress={markAllRead} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.markAllBtn}>{t('alerts.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Flux d'alertes ── */}
        {alerts.length === 0 && notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="shield-checkmark" size={26} color={theme.success} />
            </View>
            <Text style={styles.emptyTitle}>{t('alerts.empty')}</Text>
            <Text style={styles.emptySub}>{t('alerts.emptySub')}</Text>
          </View>
        ) : (
          <View style={styles.feedCard}>
            {alerts.map((a, i) => (
              <TouchableOpacity
                key={a.id}
                activeOpacity={0.75}
                style={[styles.alertRow, (i < alerts.length - 1 || notifications.length > 0) && styles.alertRowBorder]}
                onPress={() => {
                  markRead(a.id);
                  if (a.route) router.push(a.route as any);
                }}
              >
                <View style={[styles.alertIcon, { backgroundColor: `${theme.primary}16` }]}>
                  <Ionicons name={CATEGORY_META[a.category].icon} size={16} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, !a.read && { fontWeight: FontWeights.bold }]} numberOfLines={1}>
                    {t(a.titleKey, a.params as any)}
                  </Text>
                  <Text style={styles.alertBody} numberOfLines={2}>{t(a.bodyKey, a.params as any)}</Text>
                  <Text style={styles.alertMeta}>
                    {t(CATEGORY_META[a.category].labelKey)} · {new Date(a.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                {!a.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            ))}
            {/* Historique existant (notifications in-app héritées) */}
            {notifications.map((n, i) => (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.75}
                style={[styles.alertRow, i < notifications.length - 1 && styles.alertRowBorder]}
                onPress={() => markNotificationRead(n.id)}
              >
                <View style={[styles.alertIcon, { backgroundColor: `${theme.secondary}16` }]}>
                  <Text style={{ fontSize: 15 }}>{n.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, !n.read && { fontWeight: FontWeights.bold }]} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.alertBody} numberOfLines={2}>{n.subtitle}</Text>
                </View>
                {!n.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Préférences par catégorie ── */}
        <Text style={styles.sectionTitle}>{t('alerts.prefs')}</Text>
        <View style={styles.feedCard}>
          {(Object.keys(CATEGORY_META) as AlertCategory[]).map((cat, i) => {
            const external = cat === 'fuel' || cat === 'news';
            const locked = external && !EXTERNAL_ALERTS_ENABLED;
            return (
              <View key={cat} style={[styles.prefRow, i < 4 && styles.alertRowBorder]}>
                <View style={[styles.alertIcon, { backgroundColor: `${theme.primary}12` }]}>
                  <Ionicons name={CATEGORY_META[cat].icon} size={16} color={locked ? theme.textTertiary : theme.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.prefTitle, locked && { color: theme.textTertiary }]}>{t(CATEGORY_META[cat].labelKey)}</Text>
                    {locked && (
                      <View style={styles.soonChip}><Text style={styles.soonChipText}>{t('alerts.soon')}</Text></View>
                    )}
                  </View>
                  <Text style={styles.prefSub} numberOfLines={2}>
                    {locked ? t('alerts.soonExplain') : t(CATEGORY_META[cat].subKey)}
                  </Text>
                </View>
                <Switch
                  value={!locked && prefs.categories[cat]}
                  disabled={locked}
                  onValueChange={(v) => setCategoryEnabled(cat, v)}
                  trackColor={{ true: theme.primary, false: theme.cardBorder }}
                  thumbColor="#FFF"
                />
              </View>
            );
          })}
        </View>

        {/* ── Heures silencieuses ── */}
        <Text style={styles.sectionTitle}>{t('alerts.quietHours')}</Text>
        <View style={[styles.feedCard, { padding: Spacing.lg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.prefTitle}>{quietLabel}</Text>
            <Switch
              value={prefs.quietEnabled}
              onValueChange={(v) => setQuietHours(v)}
              trackColor={{ true: theme.primary, false: theme.cardBorder }}
              thumbColor="#FFF"
            />
          </View>
          {prefs.quietEnabled && (
            <View style={styles.chipsRow}>
              {QUIET_PRESETS.map((p) => {
                const active = prefs.quietStart === p.start && prefs.quietEnd === p.end;
                return (
                  <TouchableOpacity
                    key={`${p.start}-${p.end}`}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setQuietHours(true, p.start, p.end)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {p.start}h – {p.end}h
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Fréquence ── */}
        <Text style={styles.sectionTitle}>{t('alerts.frequency')}</Text>
        <View style={[styles.feedCard, { flexDirection: 'row', padding: 6 }]}>
          {(['normal', 'reduced'] as const).map((f) => {
            const active = prefs.frequency === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {f === 'normal' ? t('alerts.freqNormal') : t('alerts.freqReduced')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Confidentialité écran verrouillé ── */}
        <Text style={styles.sectionTitle}>{t('alerts.privacy')}</Text>
        <View style={[styles.feedCard, styles.prefRow]}>
          <View style={[styles.alertIcon, { backgroundColor: `${theme.success}14` }]}>
            <Ionicons name="lock-closed" size={15} color={theme.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefTitle}>{t('alerts.lockPrivacy')}</Text>
            <Text style={styles.prefSub}>{t('alerts.lockPrivacySub')}</Text>
          </View>
          <Switch
            value={prefs.showAmountsOnLockScreen}
            onValueChange={setShowAmounts}
            trackColor={{ true: theme.primary, false: theme.cardBorder }}
            thumbColor="#FFF"
          />
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    backButton: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, letterSpacing: -0.4 },
    subtitle: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: 1 },
    markAllBtn: { color: C.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    content: { padding: Spacing.lg, paddingTop: Spacing.xs },

    emptyCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    emptyIcon: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: `${C.success}14`,
      alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    },
    emptyTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    emptySub: { color: C.textTertiary, fontSize: FontSizes.sm, marginTop: 4, textAlign: 'center' },

    feedCard: {
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: BorderRadius.xl, paddingHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
    },
    alertRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    alertRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
    alertIcon: {
      width: 34, height: 34, borderRadius: 17,
      alignItems: 'center', justifyContent: 'center',
    },
    alertTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    alertBody: { color: C.textSecondary, fontSize: FontSizes.xs, marginTop: 1, lineHeight: 16 },
    alertMeta: { color: C.textTertiary, fontSize: 10.5, marginTop: 3 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },

    sectionTitle: {
      color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 1.1, textTransform: 'uppercase',
      marginTop: Spacing.md, marginBottom: Spacing.sm, marginLeft: 2,
    },
    prefRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    prefTitle: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    prefSub: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: 2, lineHeight: 15 },
    soonChip: {
      backgroundColor: `${C.secondary}20`, borderRadius: 5,
      paddingHorizontal: 5, paddingVertical: 2,
    },
    soonChipText: { color: C.secondary, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 },

    chipsRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
    chip: {
      paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: 999,
      backgroundColor: C.background, borderWidth: 1, borderColor: C.cardBorder,
    },
    chipActive: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { color: C.textSecondary, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
    chipTextActive: { color: '#FFF' },

    segment: {
      flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg,
      alignItems: 'center',
    },
    segmentActive: { backgroundColor: C.primary },
    segmentText: { color: C.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    segmentTextActive: { color: '#FFF' },
  });
