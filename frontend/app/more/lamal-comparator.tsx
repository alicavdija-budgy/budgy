/**
 * BUDGY - Comparateur LAMal 2026 — NEUTRE (aucun nom commercial visible)
 * Données primes : OFSP Priminfo 2026 · Aucune publicité, aucun partenaire.
 *
 * App Store Compliance : les noms commerciaux des assureurs sont anonymisés
 * en "Assureur A", "Assureur B"... à l'affichage. Les données restent réelles
 * pour le calcul des écarts de prix et des subsides — Budgy reste neutre.
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { Card, Badge, ProgressBar } from '../../src/components/ui';
import { CANTONS, FRANCHISES, INSURANCE_MODELS, type CantonCode } from '../../src/data/swiss-data';
import { formatNumber } from '../../src/utils/calculations';
import { useTranslation } from '../../src/hooks/useTranslation';
import {
  PRIMINFO_PREMIUMS_2026, SWISS_AVG_PREMIUM_2026,
  calculatePriminfoPremium, getTopInsurers, getCantonRanking,
} from '../../src/data/priminfo-2026';

const TOP_N = 10;

type Tab = 'compare' | 'optimize' | 'subsidy' | 'ranking';

// ALL 26 cantons
const ALL_CANTONS: CantonCode[] = [
  'ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR',
  'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG',
  'TI', 'VD', 'VS', 'NE', 'GE', 'JU',
];

export default function LamalComparatorScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [canton, setCanton] = useState<CantonCode>('VD');
  const [model, setModel] = useState<'std' | 'hmo' | 'div'>('std');
  const [franchise, setFranchise] = useState(300);
  const [age, setAge] = useState(35);
  const [income, setIncome] = useState(65000);
  const [married, setMarried] = useState(false);
  const [children, setChildren] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('compare');

  const premiums = useMemo(() => calculatePriminfoPremium(canton, franchise, model, age), [canton, franchise, model, age]);
  const insurerList = useMemo(() => getTopInsurers(canton, franchise, model, age, TOP_N), [canton, franchise, model, age]);
  const cantonRanking = useMemo(() => getCantonRanking(franchise, model, age), [franchise, model, age]);
  const { t } = useTranslation();

  const subsidy = useMemo(() => {
    const cd = CANTONS[canton];
    if (!cd) return 0;
    const threshold = cd.subsidyThreshold * (married ? 1.6 : 1) + children * 8000;
    if (income > threshold * 1.3) return 0;
    const maxContrib = income * (income < threshold * 0.7 ? 0.08 : 0.10);
    const sub = Math.max(0, premiums.avg * 12 - maxContrib);
    return income > threshold ? Math.round(sub * (1 - (income - threshold) / (threshold * 0.3)) / 12) : Math.round(sub / 12);
  }, [canton, income, married, children, premiums]);

  const savingsHighFranchise = useMemo(() => {
    const low = calculatePriminfoPremium(canton, 300, model, age);
    const high = calculatePriminfoPremium(canton, 2500, model, age);
    return (low.avg - high.avg) * 12;
  }, [canton, model, age]);

  const cantonChange = PRIMINFO_PREMIUMS_2026[canton]?.change || 0;
  const cheapest = insurerList[0];

  /**
   * Anonymisation des noms d'assureurs (App Store compliance / neutralité Budgy).
   * Les données réelles servent uniquement aux calculs internes ;
   * l'utilisateur ne voit jamais de nom commercial.
   */
  const anonInsurer = (idx: number) => `Assureur ${String.fromCharCode(65 + (idx % 26))}`;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: t('lamalUi.comparePremiums'), icon: 'list' },
    { key: 'subsidy', label: t('lamalUi.checkSubsidies'), icon: 'heart' },
    { key: 'optimize', label: t('lamalUi.optimizeDeductible'), icon: 'flash' },
    { key: 'ranking', label: t('lamalUi.potentialSavings'), icon: 'trending-down' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="lamal-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{t('lamal.title')}</Text>
          <Text style={styles.subtitle}>{t('lamal.subtitle')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Config */}
        <Card style={styles.configCard}>
          <Text style={styles.label}>Canton</Text>
          <View style={styles.cantonGrid}>
            {ALL_CANTONS.map(c => (
              <TouchableOpacity key={c} style={[styles.chip, canton === c && styles.chipOn]} onPress={() => setCanton(c)}>
                <Text style={[styles.chipTxt, canton === c && styles.chipTxtOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.label}>{t('lamal.age')}</Text>
            <Text style={styles.sliderVal}>{age < 19 ? t('lamal.child') : age < 26 ? t('lamal.young', { n: age }) : t('lamal.adultYears', { n: age })}</Text>
          </View>
          <Slider style={styles.slider} minimumValue={0} maximumValue={70} step={1} value={age} onValueChange={setAge}
            minimumTrackTintColor={theme.primary} maximumTrackTintColor={theme.cardBorder} thumbTintColor={theme.primary} />

          <Text style={styles.label}>{t('lamal.franchise')}</Text>
          <View style={styles.franchiseRow}>
            {FRANCHISES.map(f => (
              <TouchableOpacity key={f.value} style={[styles.fChip, franchise === f.value && styles.fChipOn]} onPress={() => setFranchise(f.value)}>
                <Text style={[styles.fTxt, franchise === f.value && styles.fTxtOn]}>{formatNumber(f.value)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('lamal.model')}</Text>
          {INSURANCE_MODELS.map(m => (
            <TouchableOpacity key={m.value} style={[styles.modelChip, model === m.value && styles.modelOn]} onPress={() => setModel(m.value as any)}>
              <Text style={[styles.modelTxt, model === m.value && styles.modelTxtOn]}>
                {m.label}{m.discount > 0 ? ` (-${Math.round(m.discount * 100)}%)` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* Hero */}
        <Card style={styles.heroCard}>
          <View style={styles.srcRow}>
            <Ionicons name="shield-checkmark" size={14} color={theme.success} />
            <Text style={styles.srcTxt}>{t('lamal.dataSource')}</Text>
          </View>
          <Text style={styles.heroLabel}>{t('lamal.bestOffer', { c: CANTONS[canton]?.name })}</Text>
          <View style={styles.heroAmtRow}>
            <Text style={styles.heroAmt}>{cheapest ? formatNumber(cheapest.premium) : '—'}</Text>
            <View>
              <Text style={styles.heroInsurer}>{cheapest ? anonInsurer(0) : '—'}</Text>
              <Text style={styles.heroUnit}>{t('lamal.perMonth')}</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.hsl}>{t('lamal.min')}</Text><Text style={[styles.hsv, { color: theme.success }]}>{formatNumber(premiums.min)}</Text></View>
            <View style={styles.heroStat}><Text style={styles.hsl}>{t('lamal.avg')}</Text><Text style={styles.hsv}>{formatNumber(premiums.avg)}</Text></View>
            <View style={styles.heroStat}><Text style={styles.hsl}>{t('lamal.max')}</Text><Text style={[styles.hsv, { color: theme.error }]}>{formatNumber(premiums.max)}</Text></View>
          </View>
          <View style={styles.changeRow}>
            <Ionicons name={cantonChange > 0 ? 'trending-up' : 'trending-down'} size={14} color={cantonChange > 4.4 ? theme.error : theme.warning} />
            <Text style={[styles.changeTxt, { color: cantonChange > 4.4 ? theme.error : theme.warning }]}>
              {cantonChange > 0 ? '+' : ''}{t('lamal.vsLast', { p: cantonChange })}
            </Text>
            <Text style={styles.changeAvg}>{t('lamal.avgCh', { n: formatNumber(Math.round(SWISS_AVG_PREMIUM_2026)) })}</Text>
          </View>
          {subsidy > 0 && (
            <View style={styles.subsidyBadge}>
              <Ionicons name="heart" size={14} color={theme.success} />
              <Text style={styles.subsidyBadgeTxt}>{t('lamal.subsidyBadge', { n: formatNumber(subsidy) })}</Text>
            </View>
          )}
        </Card>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
          <View style={styles.tabs}>
            {tabs.map(t => (
              <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setActiveTab(t.key)}>
                <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? theme.text : theme.textTertiary} />
                <Text style={[styles.tabTxt, activeTab === t.key && styles.tabTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Assureurs Tab */}
        {activeTab === 'compare' && (
          <>
            <Text style={styles.secTitle}>{t('lamal.topInsurers', { n: TOP_N, c: CANTONS[canton]?.name })}</Text>
            <Text style={styles.secSub}>{t('lamal.franchiseLabel', { n: formatNumber(franchise), m: INSURANCE_MODELS.find(m => m.value === model)?.label })}</Text>

            {insurerList.map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <Card key={item.insurer.id} style={[styles.insurerCard, isFirst && { borderColor: `${theme.success}40` }]}>
                  <View style={styles.insurerRow}>
                    <View style={[styles.rankCircle, isFirst && { backgroundColor: `${theme.success}20` }]}>
                      <Text style={[styles.rankNum, isFirst && { color: theme.success }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.insurerInfo}>
                      <Text style={styles.insurerName}>{anonInsurer(idx)}</Text>
                      {item.savingsVsAvg > 0 && (
                        <Text style={styles.savingsTxt}>
                          {t('lamal.savingsVs', { n: formatNumber(item.savingsVsAvg) })}
                        </Text>
                      )}
                    </View>
                    <View style={styles.insurerPrice}>
                      <Text style={[styles.insurerAmt, isFirst && { color: theme.success }]}>{formatNumber(item.premium)}</Text>
                      <Text style={styles.insurerUnit}>{t('lamal.perMonth')}</Text>
                      <Text style={styles.insurerAnnual}>{t('lamal.annualPerYear', { n: formatNumber(item.annual) })}</Text>
                    </View>
                  </View>
                  <ProgressBar value={100 - ((item.premium - premiums.min) / Math.max(premiums.max - premiums.min, 1) * 100)}
                    color={isFirst ? theme.success : theme.primary} height={4} />
                </Card>
              );
            })}

            <Card style={styles.noteCard}>
              <Ionicons name="information-circle" size={18} color={theme.info} />
              <Text style={styles.noteTxt}>{t('lamal.noteText')}</Text>
            </Card>
          </>
        )}

        {/* Optimize Tab */}
        {activeTab === 'optimize' && (
          <>
            <Text style={styles.secTitle}>{t('lamal.optimizeFranchise')}</Text>
            <Card style={styles.optCard}>
              <View style={styles.optRow}>
                <View style={[styles.optBox, { borderColor: theme.success }]}>
                  <Ionicons name="fitness" size={28} color={theme.success} />
                  <Text style={styles.optLabel}>{t('lamal.goodHealth')}</Text>
                  <Text style={[styles.optVal, { color: theme.success }]}>CHF 2'500</Text>
                  <Text style={styles.optHint}>{t('lamal.savingPerYear', { n: formatNumber(savingsHighFranchise) })}</Text>
                </View>
                <View style={[styles.optBox, { borderColor: theme.error }]}>
                  <Ionicons name="medkit" size={28} color={theme.error} />
                  <Text style={styles.optLabel}>{t('lamal.chronic')}</Text>
                  <Text style={[styles.optVal, { color: theme.error }]}>CHF 300</Text>
                  <Text style={styles.optHint}>{t('lamal.maxCoverage')}</Text>
                </View>
              </View>
            </Card>
            <Card style={styles.tipCard}>
              <Text style={styles.tipTitle}>{t('lamal.importantDates')}</Text>
              <View style={styles.tipItem}><Ionicons name="calendar" size={16} color={theme.warning} /><Text style={styles.tipItemTxt}>{t('lamal.date1')}</Text></View>
              <View style={styles.tipItem}><Ionicons name="mail" size={16} color={theme.warning} /><Text style={styles.tipItemTxt}>{t('lamal.date2')}</Text></View>
              <View style={styles.tipItem}><Ionicons name="swap-horizontal" size={16} color={theme.info} /><Text style={styles.tipItemTxt}>{t('lamal.date3')}</Text></View>
              <View style={styles.tipItem}><Ionicons name="shield-checkmark" size={16} color={theme.success} /><Text style={styles.tipItemTxt}>{t('lamal.date4')}</Text></View>
            </Card>
          </>
        )}

        {/* Subsidy Tab */}
        {activeTab === 'subsidy' && (
          <>
            <Text style={styles.secTitle}>{t('lamal.subsidyTitle')}</Text>
            <Card style={styles.subsidyInput}>
              <View style={styles.sliderRow}>
                <Text style={styles.label}>{t('lamal.annualIncome')}</Text>
                <Text style={styles.sliderVal}>CHF {formatNumber(income)}</Text>
              </View>
              <Slider style={styles.slider} minimumValue={20000} maximumValue={150000} step={1000} value={income} onValueChange={setIncome}
                minimumTrackTintColor={theme.success} maximumTrackTintColor={theme.cardBorder} thumbTintColor={theme.success} />
              <View style={styles.statusRow}>
                {[{ v: false, l: t('lamal.single') }, { v: true, l: t('lamal.married') }].map(o => (
                  <TouchableOpacity key={o.l} style={[styles.statusBtn, married === o.v && styles.statusBtnOn]} onPress={() => setMarried(o.v)}>
                    <Text style={[styles.statusTxt, married === o.v && styles.statusTxtOn]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>{t('lamal.childrenLabel')}</Text>
              <View style={styles.childRow}>
                {[0, 1, 2, 3].map(n => (
                  <TouchableOpacity key={n} style={[styles.childChip, children === n && styles.childOn]} onPress={() => setChildren(n)}>
                    <Text style={[styles.childTxt, children === n && styles.childTxtOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
            <Card style={[styles.subsidyResult, { borderColor: subsidy > 0 ? theme.success : theme.cardBorder }]}>
              <Ionicons name={subsidy > 0 ? 'checkmark-circle' : 'close-circle'} size={32} color={subsidy > 0 ? theme.success : theme.error} />
              <Text style={[styles.subsidySt, { color: subsidy > 0 ? theme.success : theme.error }]}>
                {subsidy > 0 ? t('lamal.eligible') : t('lamal.notEligible')}
              </Text>
              {subsidy > 0 && (
                <>
                  <Text style={styles.subsidyAmt}>{t('lamal.subsidyMonth', { n: formatNumber(subsidy) })}</Text>
                  <Text style={styles.subsidyAnn}>{t('lamal.subsidyYear', { n: formatNumber(subsidy * 12) })}</Text>
                </>
              )}
            </Card>
          </>
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          <>
            <Text style={styles.secTitle}>{t('lamal.cantonsTitle')}</Text>
            {cantonRanking.map((c, idx) => (
              <TouchableOpacity key={c.code} style={[styles.rkItem, canton === c.code && styles.rkItemOn]} onPress={() => setCanton(c.code)}>
                <Text style={[styles.rkPos, idx < 3 && { color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' }]}>#{idx + 1}</Text>
                <View style={styles.rkInfo}>
                  <Text style={styles.rkName}>{c.name} ({c.code})</Text>
                  <View style={styles.rkChgRow}>
                    <Ionicons name={c.change > 4.4 ? 'arrow-up' : 'arrow-down'} size={11} color={c.change > 4.4 ? theme.error : theme.success} />
                    <Text style={[styles.rkChg, { color: c.change > 4.4 ? theme.error : theme.success }]}>{c.change > 0 ? '+' : ''}{c.change}%</Text>
                  </View>
                </View>
                <Text style={styles.rkPrem}>CHF {formatNumber(c.premium)}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  subtitle: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  configCard: { marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  cantonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipOn: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  chipTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  chipTxtOn: { color: Colors.primary },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderVal: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  slider: { width: '100%', height: 40 },
  franchiseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  fChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  fChipOn: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  fTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  fTxtOn: { color: Colors.primary },
  modelChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: Spacing.xs },
  modelOn: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  modelTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  modelTxtOn: { color: Colors.primary, fontWeight: FontWeights.semibold },
  heroCard: { marginBottom: Spacing.md, backgroundColor: `${Colors.success}05`, borderColor: `${Colors.success}25` },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  srcTxt: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  heroLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  heroAmtRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.md, marginVertical: Spacing.sm },
  heroAmt: { color: Colors.text, fontSize: FontSizes.hero, fontWeight: FontWeights.black },
  heroInsurer: { color: Colors.success, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  heroUnit: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  heroStats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  heroStat: { flex: 1, backgroundColor: Colors.card, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  hsl: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  hsv: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  changeTxt: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  changeAvg: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginLeft: 'auto' },
  subsidyBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md, backgroundColor: `${Colors.success}15`, padding: Spacing.sm, borderRadius: BorderRadius.sm },
  subsidyBadgeTxt: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  tabOn: { backgroundColor: Colors.success },
  tabTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabTxtOn: { color: Colors.text },
  secTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },
  secSub: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.md },
  insurerCard: { marginBottom: Spacing.sm },
  insurerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  rankCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  rankNum: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  insurerInfo: { flex: 1 },
  insurerName: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  savingsTxt: { color: Colors.success, fontSize: FontSizes.xs },
  insurerPrice: { alignItems: 'flex-end' },
  insurerAmt: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black },
  insurerUnit: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  insurerAnnual: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.md },
  noteTxt: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
  priminfoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderWidth: 1, borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  priminfoBtnTxt: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, flex: 1, textAlign: 'center' },
  optCard: { marginBottom: Spacing.md },
  optRow: { flexDirection: 'row', gap: Spacing.md },
  optBox: { flex: 1, alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 2, backgroundColor: Colors.card },
  optLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.sm },
  optVal: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.xs },
  optHint: { color: Colors.textTertiary, fontSize: FontSizes.xs, textAlign: 'center', marginTop: Spacing.xs },
  tipCard: { marginBottom: Spacing.md },
  tipTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  tipItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  tipItemTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  subsidyInput: { marginBottom: Spacing.md },
  statusRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  statusBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center' },
  statusBtnOn: { backgroundColor: `${Colors.success}20`, borderColor: Colors.success },
  statusTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  statusTxtOn: { color: Colors.success },
  childRow: { flexDirection: 'row', gap: Spacing.sm },
  childChip: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center' },
  childOn: { backgroundColor: `${Colors.success}20`, borderColor: Colors.success },
  childTxt: { color: Colors.textSecondary, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  childTxtOn: { color: Colors.success },
  subsidyResult: { marginBottom: Spacing.md, borderWidth: 2, alignItems: 'center', padding: Spacing.xl },
  subsidySt: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.sm },
  subsidyAmt: { color: Colors.success, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black, marginTop: Spacing.md },
  subsidyAnn: { color: Colors.success, fontSize: FontSizes.sm },
  rkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  rkItemOn: { backgroundColor: `${Colors.primary}10`, marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
  rkPos: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, width: 40 },
  rkInfo: { flex: 1 },
  rkName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  rkChgRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rkChg: { fontSize: FontSizes.xs },
  rkPrem: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
});
