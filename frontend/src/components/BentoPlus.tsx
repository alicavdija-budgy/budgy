/**
 * BUDGY SMART 4.0 — Tableau de bord bento premium de l'écran Plus.
 *
 * Données 100 % réelles via les stores/sélecteurs existants (aucune valeur
 * fictive, aucun deuxième moteur de calcul) ; états vides élégants sinon.
 * Respecte le masquage des montants (budgy.hideAmounts), les droits
 * Gratuit/Pro et les thèmes clair/sombre.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../stores/useStore';
import { usePremiumStore } from '../stores/usePremiumStore';
import { useTranslation } from '../hooks/useTranslation';
import { useMoney } from '../hooks/useMoney';
import { getMonthlyFinancialSnapshot } from '../stores/selectors';
import { parseFlexibleDate, calendarDaysUntil } from '../services/alertsEngine';
import { FEATURE_BY_ID } from '../config/features';
import PressScale from './PressScale';
import FinancialHealthScore from './FinancialHealthScore';

const TOOL_IDS = ['debts', 'receipts', 'documents', 'twin', 'calendar', 'export-pdf'];

export default function BentoPlus() {
  const C = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const m = useMoney();
  const { incomes, transactions, recurringExpenses, invoices, savingsGoals, budgets } = useStore();
  const isPro = usePremiumStore(
    (s) => s.isPro || (s.trialEndsAt !== null && s.trialEndsAt > Date.now())
  );
  const styles = useMemo(() => makeStyles(C), [C]);

  // Masquage des montants — même préférence que l'accueil
  const [hide, setHide] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('budgy.hideAmounts')
      .then((v) => setHide(v === '1'))
      .catch(() => {});
  }, []);
  const mask = (v: string) => (hide ? '•••••' : v);

  const snapshot = useMemo(
    () => getMonthlyFinancialSnapshot({ incomes, transactions, recurringExpenses, invoices }),
    [incomes, transactions, recurringExpenses, invoices],
  );

  // Épargne (réelle)
  const totalSaved = useMemo(() => savingsGoals.reduce((s, g) => s + (g.saved || 0), 0), [savingsGoals]);
  const totalTarget = useMemo(() => savingsGoals.reduce((s, g) => s + (g.target || 0), 0), [savingsGoals]);
  const savingsPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  // Budgets (réels) : restant = limites − dépenses du mois dans ces catégories
  const budgetStats = useMemo(() => {
    if (!budgets.length) return null;
    const now = new Date();
    const cats = new Set(budgets.map((b) => b.category));
    const spent = transactions.reduce((s, tx) => {
      if (!cats.has(tx.category)) return s;
      const d = parseFlexibleDate(tx.date);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() ? s + tx.amount : s;
    }, 0);
    const limit = budgets.reduce((s, b) => s + b.limit, 0);
    return { remaining: limit - spent, pct: limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0 };
  }, [budgets, transactions]);

  // Charges fixes : total mensuel (moteur snapshot) + prochaine échéance réelle
  const nextCharge = useMemo(() => {
    const today = new Date().getDate();
    const actives = recurringExpenses.filter((r) => r.active && r.frequency === 'monthly');
    if (!actives.length) return null;
    let best: { title: string; inDays: number } | null = null;
    for (const r of actives) {
      const d = r.dayOfMonth >= today ? r.dayOfMonth - today : null;
      if (d !== null && (best === null || d < best.inDays)) best = { title: r.title, inDays: d };
    }
    return best;
  }, [recurringExpenses]);

  // Factures en attente (réelles)
  const pendingInvoices = useMemo(() => invoices.filter((i) => i.status !== 'paid'), [invoices]);
  const nextInvoiceDays = useMemo(() => {
    const now = new Date();
    let best: number | null = null;
    for (const inv of pendingInvoices) {
      const d = parseFlexibleDate(inv.dueDate);
      if (!d) continue;
      const days = calendarDaysUntil(d, now);
      if (days >= 0 && (best === null || days < best)) best = days;
    }
    return best;
  }, [pendingInvoices]);

  const tools = TOOL_IDS.map((id) => FEATURE_BY_ID[id]).filter(Boolean);

  const go = (route: string, tier?: string) => {
    if (tier === 'pro' && !isPro) router.push('/pro' as any);
    else router.push(route as any);
  };

  return (
    <View>
      {/* ── B. Santé financière (moteur + anneau animé existants) ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(60)}>
        <FinancialHealthScore />
      </Animated.View>

      {/* ── C. Épargne — pleine largeur ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(110)}>
        <PressScale haptic="light" onPress={() => router.push('/(tabs)/savings' as any)} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>{t('plusV2.savings')}</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
          </View>
          {savingsGoals.length ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.bigNumber}>{mask(m.format(totalSaved))}</Text>
                <Text style={[styles.pctChip, { color: C.success, backgroundColor: `${C.success}16` }]}>{savingsPct}%</Text>
              </View>
              <Text style={styles.subtle}>{t('plusV2.goalOf', { n: mask(m.format(totalTarget)) })}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${savingsPct}%`, backgroundColor: C.success }]} />
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>{t('plusV2.savingsEmpty')}</Text>
          )}
        </PressScale>
      </Animated.View>

      {/* ── D. Budgets + Charges fixes ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(160)} style={styles.row}>
        <PressScale haptic="light" onPress={() => router.push('/more/budgets' as any)} style={[styles.card, styles.half]}>
          <View style={styles.tileIcon}><Ionicons name="pie-chart" size={15} color={C.primary} /></View>
          <Text style={styles.cardLabel}>{t('plusV2.budgets')}</Text>
          {budgetStats ? (
            <>
              <Text style={[styles.midNumber, budgetStats.remaining < 0 && { color: C.error }]} numberOfLines={1}>
                {mask(m.format(Math.round(budgetStats.remaining)))}
              </Text>
              <Text style={styles.subtle}>{t('plusV2.remaining')}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${budgetStats.pct}%`, backgroundColor: budgetStats.pct >= 100 ? C.error : C.primary }]} />
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>{t('plusV2.budgetsEmpty')}</Text>
          )}
        </PressScale>
        <PressScale haptic="light" onPress={() => router.push('/more/recurring' as any)} style={[styles.card, styles.half]}>
          <View style={styles.tileIcon}><Ionicons name="repeat" size={15} color={C.warning} /></View>
          <Text style={styles.cardLabel}>{t('plusV2.charges')}</Text>
          <Text style={styles.midNumber} numberOfLines={1}>{mask(m.format(Math.round(snapshot.recurringExpenses)))}</Text>
          <Text style={styles.subtle} numberOfLines={1}>
            {nextCharge
              ? (nextCharge.inDays === 0 ? t('plusV2.dueToday', { name: nextCharge.title }) : t('plusV2.dueIn', { name: nextCharge.title, d: nextCharge.inDays }))
              : t('plusV2.perMonth')}
          </Text>
        </PressScale>
      </Animated.View>

      {/* ── E. LAMal & subsides — violet premium ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(210)}>
        <PressScale haptic="light" onPress={() => router.push('/more/lamal-comparator' as any)}>
          <LinearGradient colors={['#312E81', '#4C1D95', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lamalCard}>
            <View style={{ flex: 1 }}>
              <View style={styles.lamalBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#DDD6FE" />
                <Text style={styles.lamalBadgeText}>{t('plusV2.swiss')}</Text>
              </View>
              <Text style={styles.lamalTitle}>{t('plusV2.lamalTitle')}</Text>
              <Text style={styles.lamalSub}>{t('plusV2.lamalText')}</Text>
            </View>
            <View style={styles.lamalCta}><Text style={styles.lamalCtaText}>{t('plusV2.compare')}</Text></View>
          </LinearGradient>
        </PressScale>
      </Animated.View>

      {/* ── F. Revenus + Factures ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(260)} style={styles.row}>
        <PressScale haptic="light" onPress={() => router.push('/more/incomes' as any)} style={[styles.card, styles.half]}>
          <View style={styles.tileIcon}><Ionicons name="trending-up" size={15} color={C.success} /></View>
          <Text style={styles.cardLabel}>{t('plusV2.incomes')}</Text>
          <Text style={styles.midNumber} numberOfLines={1}>{mask(m.format(Math.round(snapshot.monthlyIncome)))}</Text>
          <Text style={styles.subtle}>{t('plusV2.perMonth')}</Text>
        </PressScale>
        <PressScale haptic="light" onPress={() => router.push('/more/invoices' as any)} style={[styles.card, styles.half]}>
          <View style={styles.tileIcon}><Ionicons name="receipt" size={15} color={C.warning} /></View>
          <Text style={styles.cardLabel}>{t('plusV2.invoices')}</Text>
          <Text style={styles.midNumber}>{pendingInvoices.length}</Text>
          <Text style={[styles.subtle, nextInvoiceDays !== null && nextInvoiceDays <= 3 && { color: C.warning }]} numberOfLines={1}>
            {pendingInvoices.length === 0
              ? t('plusV2.allPaid')
              : nextInvoiceDays !== null
                ? t('plusV2.nextDueIn', { d: nextInvoiceDays })
                : t('plusV2.pending')}
          </Text>
        </PressScale>
      </Animated.View>

      {/* ── G. Outils — pastilles horizontales ── */}
      <Text style={styles.sectionLabel}>{t('plusV2.tools')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolsScroll} contentContainerStyle={styles.toolsRow}>
        {tools.map((f) => {
          const locked = f.tier === 'pro' && !isPro;
          return (
            <PressScale key={f.id} haptic="selection" onPress={() => go(f.route, f.tier)} style={styles.toolChip}>
              <Ionicons name={f.icon as any} size={15} color={locked ? C.textTertiary : C.textSecondary} />
              <Text style={[styles.toolText, locked && { color: C.textTertiary }]}>{t(f.titleKey)}</Text>
              {locked && <Ionicons name="lock-closed" size={11} color={C.textTertiary} />}
            </PressScale>
          );
        })}
      </ScrollView>

      {/* ── H. Budgy Pro — carte discrète ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(310)}>
        <PressScale haptic="light" onPress={() => router.push('/pro' as any)} style={[styles.card, styles.proRow]}>
          <View style={[styles.tileIcon, { backgroundColor: isPro ? `${C.success}16` : `${C.secondary}16`, marginBottom: 0 }]}>
            <Ionicons name="diamond" size={15} color={isPro ? C.success : C.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitle}>Budgy Pro</Text>
            <Text style={styles.subtle} numberOfLines={1}>{isPro ? t('plusV2.proActive') : t('plusV2.proDiscover')}</Text>
          </View>
          {isPro && <View style={[styles.activeDot, { backgroundColor: C.success }]} />}
          <Ionicons name="chevron-forward" size={15} color={C.textTertiary} />
        </PressScale>
      </Animated.View>

      {/* ── I. Réglages — rangée discrète ── */}
      <View style={styles.settingsRow}>
        {([
          { icon: 'lock-closed', label: t('plusV2.security'), route: '/more/security' },
          { icon: 'options', label: t('plusV2.prefs'), route: '/more/settings' },
          { icon: 'notifications', label: 'Budgy Alerts', route: '/more/notifications' },
        ] as const).map((s) => (
          <PressScale key={s.route} haptic="selection" onPress={() => router.push(s.route as any)} style={styles.settingTile}>
            <Ionicons name={s.icon as any} size={16} color={C.textSecondary} />
            <Text style={styles.settingText} numberOfLines={1}>{s.label}</Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: 20,
      padding: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    row: { flexDirection: 'row', gap: Spacing.sm },
    half: { flex: 1 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
    cardLabel: {
      color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.bold,
      letterSpacing: 0.8, textTransform: 'uppercase',
    },
    bigNumber: {
      color: C.text, fontSize: 30, fontWeight: FontWeights.black,
      letterSpacing: -1, fontVariant: ['tabular-nums'], marginTop: 2,
    },
    midNumber: {
      color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black,
      letterSpacing: -0.5, fontVariant: ['tabular-nums'], marginTop: Spacing.xs,
    },
    pctChip: {
      fontSize: FontSizes.sm, fontWeight: FontWeights.bold, overflow: 'hidden',
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    subtle: { color: C.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
    emptyText: { color: C.textTertiary, fontSize: FontSizes.sm, marginTop: Spacing.xs, lineHeight: 19 },
    track: {
      height: 7, borderRadius: 4, backgroundColor: C.cardBorder,
      marginTop: Spacing.md, overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 4 },
    tileIcon: {
      width: 30, height: 30, borderRadius: 15, backgroundColor: C.background,
      alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
    },
    lamalCard: {
      borderRadius: 20, padding: Spacing.lg, marginBottom: Spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md, overflow: 'hidden',
    },
    lamalBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 3, marginBottom: Spacing.sm,
    },
    lamalBadgeText: { color: '#DDD6FE', fontSize: 9.5, fontWeight: FontWeights.black, letterSpacing: 0.8 },
    lamalTitle: { color: '#FFF', fontSize: FontSizes.lg, fontWeight: FontWeights.bold, letterSpacing: -0.3 },
    lamalSub: { color: 'rgba(255,255,255,0.78)', fontSize: FontSizes.xs, marginTop: 3, lineHeight: 17 },
    lamalCta: {
      backgroundColor: '#FFF', borderRadius: 999,
      paddingHorizontal: Spacing.lg, paddingVertical: 9,
    },
    lamalCtaText: { color: '#4C1D95', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
    sectionLabel: {
      color: C.textSecondary, fontSize: 11, fontWeight: FontWeights.black,
      letterSpacing: 1, textTransform: 'uppercase',
      marginTop: Spacing.md, marginBottom: Spacing.sm, marginLeft: 2,
    },
    toolsScroll: { marginHorizontal: -Spacing.lg, marginBottom: Spacing.sm },
    toolsRow: { paddingHorizontal: Spacing.lg, gap: Spacing.xs, flexDirection: 'row' },
    toolChip: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: 999, paddingHorizontal: Spacing.md, paddingVertical: 10,
    },
    toolText: { color: C.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
    proRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    proTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
    activeDot: { width: 8, height: 8, borderRadius: 4 },
    settingsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
    settingTile: {
      flex: 1, alignItems: 'center', gap: 5,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: 16, paddingVertical: Spacing.md,
    },
    settingText: { color: C.textSecondary, fontSize: 11.5, fontWeight: FontWeights.semibold },
  });
