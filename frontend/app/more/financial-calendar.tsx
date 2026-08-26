/**
 * BUDGY — Calendrier Financier
 *
 * Affiche tous les flux financiers futurs (revenus, contrats, abonnements,
 * factures, dépenses récurrentes) sur 3 horizons : semaine, mois, année.
 *
 * Sources (lues depuis le store Zustand, 100% offline) :
 *   • Income           — revenus récurrents (monthly/quarterly/yearly) projetés
 *   • RecurringExpense — abonnements & charges mensuelles (`dayOfMonth`)
 *   • Contract         — échéance via `expirationDate`
 *   • Invoice          — factures en attente (`dueDate`, status='pending')
 *
 * Calcule "Argent restant prévu" = somme(revenus futurs) - somme(dépenses futures)
 * sur l'horizon sélectionné.
 *
 * Les rappels J-7/J-1 sont activables via le bouton "Activer rappels" sur
 * chaque événement (utilise expo-notifications).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { DATE_LOCALES } from '../../src/i18n/translations';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import type { Income, RecurringExpense, Contract, Invoice } from '../../src/types';
import { scheduleDeadlineRemindersForEntity } from '../../src/services/notifications';

// ─────────── Types ───────────
type Horizon = 'week' | 'month' | 'year';
type FilterMode = 'all' | 'income' | 'expense';

interface CalendarEvent {
  id: string;
  source: 'income' | 'recurring' | 'contract' | 'invoice';
  date: Date;
  title: string;
  subtitle?: string;
  amount: number;
  type: 'income' | 'expense';
  category?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Original entity id — used for reminders */
  refId: string;
}

// ─────────── Helpers ───────────
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-CH').replace(/,/g, "'")} CHF`;
const fmtSigned = (n: number) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`;

// FR fallback month/day abbreviations used by the internal fmtDay helper.
// The primary date rendering uses toLocaleDateString(DATE_LOCALES[lang], …).
// eslint-disable-next-line -- i18n-technical
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']; // i18n-technical
// eslint-disable-next-line -- i18n-technical
const WEEKDAY_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']; // i18n-technical

function fmtDay(d: Date, locale: string): string {
  try {
    const wk = d.toLocaleDateString(locale, { weekday: 'short' });
    const day = d.getDate();
    const mo = d.toLocaleDateString(locale, { month: 'short' });
    return `${wk} ${day} ${mo}`;
  } catch {
    return `${WEEKDAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
  }
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // dd.mm.yyyy
  const m2 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

function horizonEnd(start: Date, h: Horizon): Date {
  const e = new Date(start);
  if (h === 'week') e.setDate(e.getDate() + 7);
  else if (h === 'month') e.setMonth(e.getMonth() + 1);
  else e.setFullYear(e.getFullYear() + 1);
  return e;
}

// ─────────── Projection logic ───────────
type TFn = (k: string, p?: Record<string, any>) => string;

function projectIncomes(items: Income[], from: Date, to: Date, t: TFn): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const i of items) {
    if (i.type !== 'recurring') continue;
    const freq = i.frequency || 'monthly';
    // Income doesn't store a day-of-month; assume 1st of the month
    const startD = 1;
    const cursor = new Date(from.getFullYear(), from.getMonth(), startD);
    while (cursor <= to) {
      if (cursor >= from) {
        events.push({
          id: `inc_${i.id}_${cursor.getTime()}`,
          source: 'income',
          date: new Date(cursor),
          title: i.title,
          subtitle: t('calendarUi.recurringIncome'),
          amount: i.amount,
          type: 'income',
          category: i.category,
          icon: 'cash',
          color: '#34D399',
          refId: i.id,
        });
      }
      if (freq === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else if (freq === 'quarterly') cursor.setMonth(cursor.getMonth() + 3);
      else cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }
  return events;
}

function projectRecurring(items: RecurringExpense[], from: Date, to: Date, t: TFn): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const r of items) {
    if (!r.active) continue;
    const day = Math.max(1, Math.min(28, r.dayOfMonth || 1));
    const cursor = new Date(from.getFullYear(), from.getMonth(), day);
    if (cursor < from) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= to) {
      events.push({
        id: `rec_${r.id}_${cursor.getTime()}`,
        source: 'recurring',
        date: new Date(cursor),
        title: r.title,
        subtitle: r.frequency === 'yearly' ? t('calendarScreen.annualSubscription') : t('calendarScreen.monthlyCharge'),
        amount: r.amount,
        type: 'expense',
        category: r.category,
        icon: 'refresh-circle',
        color: r.color || '#F87171',
        refId: r.id,
      });
      if (r.frequency === 'yearly') cursor.setFullYear(cursor.getFullYear() + 1);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return events;
}

function projectContracts(items: Contract[], from: Date, to: Date, t: TFn): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const c of items) {
    const d = parseISO(c.expirationDate);
    if (!d || d < from || d > to) continue;
    out.push({
      id: `ct_${c.id}_${d.getTime()}`,
      source: 'contract',
      date: d,
      title: c.title,
      subtitle: c.issuer ? t('calendarScreen.deadlineWith', { issuer: c.issuer }) : t('calendarUi.contractDeadline'),
      amount: c.amount,
      type: 'expense',
      category: c.category,
      icon: 'document-text',
      color: '#A78BFA',
      refId: c.id,
    });
  }
  return out;
}

function projectInvoices(items: Invoice[], from: Date, to: Date, t: TFn): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const inv of items) {
    if (inv.status !== 'pending') continue;
    const d = parseISO(inv.dueDate);
    if (!d || d < from || d > to) continue;
    out.push({
      id: `inv_${inv.id}_${d.getTime()}`,
      source: 'invoice',
      date: d,
      title: inv.title,
      subtitle: inv.issuer ? t('calendarScreen.invoiceWith', { issuer: inv.issuer }) : t('calendarUi.pendingInvoice'),
      amount: inv.amount,
      type: 'expense',
      category: inv.category,
      icon: 'receipt',
      color: '#FB923C',
      refId: inv.id,
    });
  }
  return out;
}

// ─────────── Screen ───────────
export default function FinancialCalendarScreen() {
  const { t, lang } = useTranslation();
  const locale = DATE_LOCALES[lang];
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const incomes = useStore((s) => s.incomes);
  const recurring = useStore((s) => s.recurringExpenses);
  const contracts = useStore((s) => s.contracts);
  const invoices = useStore((s) => s.invoices);

  const [horizon, setHorizon] = useState<Horizon>('month');
  const [filter, setFilter] = useState<FilterMode>('all');

  const { events, totalIn, totalOut, remaining, groupedByDay, daysSorted } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = horizonEnd(today, horizon);

    const all: CalendarEvent[] = [
      ...projectIncomes(incomes || [], today, end, t),
      ...projectRecurring(recurring || [], today, end, t),
      ...projectContracts(contracts || [], today, end, t),
      ...projectInvoices(invoices || [], today, end, t),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const filtered = filter === 'all' ? all : all.filter((e) => e.type === filter);
    const tIn = filtered.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const tOut = filtered.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    const grouped: Record<string, CalendarEvent[]> = {};
    for (const e of filtered) {
      const k = dayKey(e.date);
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(e);
    }
    return {
      events: filtered,
      totalIn: tIn,
      totalOut: tOut,
      remaining: tIn - tOut,
      groupedByDay: grouped,
      daysSorted: Object.keys(grouped).sort(),
    };
  }, [incomes, recurring, contracts, invoices, horizon, filter, t]);

  const horizonLabel = horizon === 'week' ? t('calendarScreen.horizonWeek') : horizon === 'month' ? t('calendarScreen.horizonMonth') : t('calendarScreen.horizonYear');

  const enableReminder = async (e: CalendarEvent) => {
    try {
      await scheduleDeadlineRemindersForEntity(e.refId, {
        type: e.source === 'contract' ? 'contract' : 'invoice',
        name: e.title,
        dueDate: dayKey(e.date),
        amount: e.amount,
      });
      Alert.alert(t('calendarUi.remindersOnTitle'), t('calendarUi.remindersOnBody'));
    } catch (err: any) {
      Alert.alert(t('calendarScreen.errorTitle'), err?.message || t('calendarUi.remindersError'));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="financial-calendar">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('calendarScreen.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
        {/* Hero KPI */}
        <LinearGradient
          colors={[`${theme.primary}25`, `${theme.gold}15`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="calendar" size={14} color={theme.primary} />
            <Text style={styles.heroBadgeTxt}>{horizonLabel.toUpperCase()}</Text>
          </View>
          <Text style={styles.heroLabel}>{t('calendarScreen.remainingLabel')}</Text>
          <Text
            style={[
              styles.heroAmount,
              { color: remaining >= 0 ? theme.success : theme.error },
            ]}
          >
            {fmtSigned(remaining)}
          </Text>
          <View style={styles.heroFlowsRow}>
            <View style={styles.heroFlow}>
              <Ionicons name="arrow-down-circle" size={16} color={theme.success} />
              <Text style={styles.heroFlowLabel}>{t('calendarScreen.inflows')}</Text>
              <Text style={[styles.heroFlowValue, { color: theme.success }]}>{fmt(totalIn)}</Text>
            </View>
            <View style={styles.heroDividerVert} />
            <View style={styles.heroFlow}>
              <Ionicons name="arrow-up-circle" size={16} color={theme.error} />
              <Text style={styles.heroFlowLabel}>{t('calendarScreen.outflows')}</Text>
              <Text style={[styles.heroFlowValue, { color: theme.error }]}>{fmt(totalOut)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Horizon switch */}
        <View style={styles.segmentRow}>
          {(['week', 'month', 'year'] as Horizon[]).map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.segmentBtn, horizon === h && styles.segmentBtnActive]}
              onPress={() => setHorizon(h)}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentTxt, horizon === h && styles.segmentTxtActive]}>
                {h === 'week' ? t('calendarScreen.segWeek') : h === 'month' ? t('calendarScreen.segMonth') : t('calendarUi.year')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filter */}
        <View style={styles.filterRow}>
          {(['all', 'income', 'expense'] as FilterMode[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={f === 'all' ? 'apps' : f === 'income' ? 'arrow-down' : 'arrow-up'}
                size={13}
                color={filter === f ? theme.primary : theme.textSecondary}
              />
              <Text style={[styles.filterTxt, filter === f && styles.filterTxtActive]}>
                {f === 'all' ? t('calendarScreen.filterAll') : f === 'income' ? t('calendarScreen.filterIncome') : t('calendarUi.expenses')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Events */}
        {events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📅</Text>
            <Text style={styles.emptyTitle}>{t('calendarScreen.emptyTitle')}</Text>
            <Text style={styles.emptySub}>
              {t('calendarScreen.emptySub')}
            </Text>
          </View>
        ) : (
          daysSorted.map((k) => {
            const dayEvents = groupedByDay[k];
            const ref = dayEvents[0].date;
            const isToday = new Date().toDateString() === ref.toDateString();
            return (
              <View key={k} style={styles.daySection}>
                <View style={styles.dayHeader}>
                  <View style={[styles.dayDot, { backgroundColor: isToday ? theme.primary : theme.cardBorder }]} />
                  <Text style={[styles.dayLabel, isToday && { color: theme.primary }]}>
                    {isToday ? `${t('calendarScreen.today')} · ` : ''}{fmtDay(ref, locale)}
                  </Text>
                </View>
                {dayEvents.map((e) => (
                  <View key={e.id} style={styles.eventRow}>
                    <View style={[styles.eventIcon, { backgroundColor: `${e.color}25`, borderColor: `${e.color}55` }]}>
                      <Ionicons name={e.icon} size={18} color={e.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle} numberOfLines={1}>{e.title}</Text>
                      {e.subtitle ? (
                        <Text style={styles.eventSub} numberOfLines={1}>{e.subtitle}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.eventAmount,
                          { color: e.type === 'income' ? theme.success : theme.text },
                        ]}
                      >
                        {e.type === 'income' ? '+' : '−'}{fmt(e.amount)}
                      </Text>
                      {(e.source === 'contract' || e.source === 'invoice') && (
                        <TouchableOpacity onPress={() => enableReminder(e)} style={styles.reminderBtn}>
                          <Ionicons name="notifications" size={11} color={theme.primary} />
                          <Text style={styles.reminderTxt}>{t('calendarScreen.remind')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─────────── Styles ───────────
const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },

    // Hero
    heroCard: {
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: `${C.primary}33`,
      marginBottom: Spacing.lg,
    },
    heroBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${C.primary}55`,
      backgroundColor: `${C.primary}15`,
      marginBottom: Spacing.sm,
    },
    heroBadgeTxt: { color: C.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
    heroLabel: { color: C.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },
    heroAmount: { fontSize: 30, fontWeight: '900', marginTop: 2, lineHeight: 36 },
    heroFlowsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: `${C.primary}25`,
    },
    heroFlow: { flex: 1, alignItems: 'center' },
    heroFlowLabel: { color: C.textTertiary, fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
    heroFlowValue: { fontSize: FontSizes.md, fontWeight: '800', marginTop: 2 },
    heroDividerVert: { width: 1, height: 40, backgroundColor: `${C.primary}25` },

    // Horizon switch (segmented)
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 4,
      marginBottom: Spacing.sm,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: BorderRadius.md,
    },
    segmentBtnActive: { backgroundColor: `${C.primary}25` },
    segmentTxt: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
    segmentTxtActive: { color: C.primary, fontWeight: '900' },

    // Filter
    filterRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.md },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card,
    },
    filterChipActive: { borderColor: C.primary, backgroundColor: `${C.primary}15` },
    filterTxt: { color: C.textSecondary, fontSize: 12 },
    filterTxtActive: { color: C.primary, fontWeight: '800' },

    // Day section
    daySection: { marginBottom: Spacing.md },
    dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 4 },
    dayDot: { width: 8, height: 8, borderRadius: 4 },
    dayLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

    // Event row
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: Spacing.sm,
      marginBottom: 6,
    },
    eventIcon: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1,
    },
    eventTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: '700' },
    eventSub: { color: C.textTertiary, fontSize: 11, marginTop: 1 },
    eventAmount: { fontSize: FontSizes.md, fontWeight: '800' },
    reminderBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      marginTop: 4, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: 999, backgroundColor: `${C.primary}15`,
    },
    reminderTxt: { color: C.primary, fontSize: 10, fontWeight: '800' },

    // Empty
    empty: { alignItems: 'center', padding: Spacing.xl, gap: 6 },
    emptyTitle: { color: C.text, fontSize: FontSizes.md, fontWeight: '700', marginTop: 8 },
    emptySub: { color: C.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  });
