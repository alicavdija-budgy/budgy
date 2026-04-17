/**
 * GUARDIAN MONEY CHF - Comparateur LAMal Priminfo 2026
 * Vrais noms d'assureurs · Données OFSP · Aucune publicité
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
import { Card, Badge, ProgressBar } from '../../src/components/ui';
import { CANTONS, FRANCHISES, INSURANCE_MODELS, type CantonCode } from '../../src/data/swiss-data';
import { formatNumber } from '../../src/utils/calculations';
import {
  PRIMINFO_PREMIUMS_2026, SWISS_AVG_PREMIUM_2026,
  calculatePriminfoPremium, getInsurerPremiums, getCantonRanking,
} from '../../src/data/priminfo-2026';

type Tab = 'compare' | 'optimize' | 'subsidy' | 'ranking';
const MAIN_CANTONS: CantonCode[] = ['VD', 'GE', 'ZH', 'BE', 'ZG', 'LU', 'BS', 'FR', 'TI', 'VS', 'AG', 'SG'];

export default function LamalComparatorScreen() {
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
  const insurerList = useMemo(() => getInsurerPremiums(canton, franchise, model, age), [canton, franchise, model, age]);
  const cantonRanking = useMemo(() => getCantonRanking(franchise, model, age), [franchise, model, age]);

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

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: 'Assureurs', icon: 'list' },
    { key: 'optimize', label: 'Optimiser', icon: 'flash' },
    { key: 'subsidy', label: 'Subsides', icon: 'heart' },
    { key: 'ranking', label: '26 cantons', icon: 'map' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="lamal-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Comparateur LAMal</Text>
          <Text style={styles.subtitle}>Priminfo 2026 · OFSP/BAG</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Config */}
        <Card style={styles.configCard}>
          <Text style={styles.label}>Canton</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {MAIN_CANTONS.map(c => (
                <TouchableOpacity key={c} style={[styles.chip, canton === c && styles.chipOn]} onPress={() => setCanton(c)}>
                  <Text style={[styles.chipTxt, canton === c && styles.chipTxtOn]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.sliderRow}>
            <Text style={styles.label}>Âge</Text>
            <Text style={styles.sliderVal}>{age < 19 ? 'Enfant' : age < 26 ? `Jeune (${age})` : `${age} ans`}</Text>
          </View>
          <Slider style={styles.slider} minimumValue={0} maximumValue={70} step={1} value={age} onValueChange={setAge}
            minimumTrackTintColor={Colors.primary} maximumTrackTintColor={Colors.cardBorder} thumbTintColor={Colors.primary} />

          <Text style={styles.label}>Franchise</Text>
          <View style={styles.franchiseRow}>
            {FRANCHISES.map(f => (
              <TouchableOpacity key={f.value} style={[styles.fChip, franchise === f.value && styles.fChipOn]} onPress={() => setFranchise(f.value)}>
                <Text style={[styles.fTxt, franchise === f.value && styles.fTxtOn]}>{formatNumber(f.value)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Modèle</Text>
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
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.srcTxt}>Données officielles Priminfo 2026</Text>
          </View>
          <Text style={styles.heroLabel}>Meilleure offre · {CANTONS[canton]?.name}</Text>
          <View style={styles.heroAmtRow}>
            <Text style={styles.heroAmt}>{cheapest ? formatNumber(cheapest.premium) : '—'}</Text>
            <View>
              <Text style={styles.heroInsurer}>{cheapest?.insurer.name}</Text>
              <Text style={styles.heroUnit}>CHF/mois</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.hsl}>Min</Text><Text style={[styles.hsv, { color: Colors.success }]}>{formatNumber(premiums.min)}</Text></View>
            <View style={styles.heroStat}><Text style={styles.hsl}>Moyenne</Text><Text style={styles.hsv}>{formatNumber(premiums.avg)}</Text></View>
            <View style={styles.heroStat}><Text style={styles.hsl}>Max</Text><Text style={[styles.hsv, { color: Colors.error }]}>{formatNumber(premiums.max)}</Text></View>
          </View>
          <View style={styles.changeRow}>
            <Ionicons name={cantonChange > 0 ? 'trending-up' : 'trending-down'} size={14} color={cantonChange > 4.4 ? Colors.error : Colors.warning} />
            <Text style={[styles.changeTxt, { color: cantonChange > 4.4 ? Colors.error : Colors.warning }]}>
              {cantonChange > 0 ? '+' : ''}{cantonChange}% vs 2025
            </Text>
            <Text style={styles.changeAvg}>CH: {formatNumber(Math.round(SWISS_AVG_PREMIUM_2026))}/mois</Text>
          </View>
          {subsidy > 0 && (
            <View style={styles.subsidyBadge}>
              <Ionicons name="heart" size={14} color={Colors.success} />
              <Text style={styles.subsidyBadgeTxt}>Subside: -{formatNumber(subsidy)} CHF/mois</Text>
            </View>
          )}
        </Card>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
          <View style={styles.tabs}>
            {tabs.map(t => (
              <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setActiveTab(t.key)}>
                <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? Colors.text : Colors.textTertiary} />
                <Text style={[styles.tabTxt, activeTab === t.key && styles.tabTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Assureurs Tab */}
        {activeTab === 'compare' && (
          <>
            <Text style={styles.secTitle}>{insurerList.length} assureurs · {CANTONS[canton]?.name}</Text>
            <Text style={styles.secSub}>Franchise CHF {formatNumber(franchise)} · {INSURANCE_MODELS.find(m => m.value === model)?.label}</Text>

            {insurerList.map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <Card key={item.insurer.id} style={[styles.insurerCard, isFirst && { borderColor: `${Colors.success}40` }]}>
                  <View style={styles.insurerRow}>
                    <View style={[styles.rankCircle, isFirst && { backgroundColor: `${Colors.success}20` }]}>
                      <Text style={[styles.rankNum, isFirst && { color: Colors.success }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.insurerInfo}>
                      <Text style={styles.insurerName}>{item.insurer.name}</Text>
                      {item.savingsVsAvg > 0 && (
                        <Text style={styles.savingsTxt}>
                          Économie: CHF {formatNumber(item.savingsVsAvg)}/an vs moyenne
                        </Text>
                      )}
                    </View>
                    <View style={styles.insurerPrice}>
                      <Text style={[styles.insurerAmt, isFirst && { color: Colors.success }]}>{formatNumber(item.premium)}</Text>
                      <Text style={styles.insurerUnit}>CHF/mois</Text>
                      <Text style={styles.insurerAnnual}>{formatNumber(item.annual)}/an</Text>
                    </View>
                  </View>
                  <ProgressBar value={100 - ((item.premium - premiums.min) / Math.max(premiums.max - premiums.min, 1) * 100)}
                    color={isFirst ? Colors.success : Colors.primary} height={4} />
                </Card>
              );
            })}

            <Card style={styles.noteCard}>
              <Ionicons name="information-circle" size={18} color={Colors.info} />
              <Text style={styles.noteTxt}>
                Primes indicatives basées sur les données Priminfo OFSP 2026. Pour des offres personnalisées, consultez priminfo.admin.ch ou contactez directement les assureurs.
              </Text>
            </Card>
          </>
        )}

        {/* Optimize Tab */}
        {activeTab === 'optimize' && (
          <>
            <Text style={styles.secTitle}>Optimisation franchise</Text>
            <Card style={styles.optCard}>
              <View style={styles.optRow}>
                <View style={[styles.optBox, { borderColor: Colors.success }]}>
                  <Ionicons name="fitness" size={28} color={Colors.success} />
                  <Text style={styles.optLabel}>Bonne santé</Text>
                  <Text style={[styles.optVal, { color: Colors.success }]}>CHF 2'500</Text>
                  <Text style={styles.optHint}>Économie: ~{formatNumber(savingsHighFranchise)}/an</Text>
                </View>
                <View style={[styles.optBox, { borderColor: Colors.error }]}>
                  <Ionicons name="medkit" size={28} color={Colors.error} />
                  <Text style={styles.optLabel}>Maladie chronique</Text>
                  <Text style={[styles.optVal, { color: Colors.error }]}>CHF 300</Text>
                  <Text style={styles.optHint}>Couverture maximale</Text>
                </View>
              </View>
            </Card>
            <Card style={styles.tipCard}>
              <Text style={styles.tipTitle}>Dates importantes</Text>
              <View style={styles.tipItem}><Ionicons name="calendar" size={16} color={Colors.warning} /><Text style={styles.tipItemTxt}>30 novembre: dernier délai de résiliation</Text></View>
              <View style={styles.tipItem}><Ionicons name="mail" size={16} color={Colors.warning} /><Text style={styles.tipItemTxt}>Résiliation par lettre recommandée</Text></View>
              <View style={styles.tipItem}><Ionicons name="swap-horizontal" size={16} color={Colors.info} /><Text style={styles.tipItemTxt}>Changement gratuit et sans justification</Text></View>
              <View style={styles.tipItem}><Ionicons name="shield-checkmark" size={16} color={Colors.success} /><Text style={styles.tipItemTxt}>Aucune différence de prestations (assurance de base)</Text></View>
            </Card>
          </>
        )}

        {/* Subsidy Tab */}
        {activeTab === 'subsidy' && (
          <>
            <Text style={styles.secTitle}>Réduction de primes</Text>
            <Card style={styles.subsidyInput}>
              <View style={styles.sliderRow}>
                <Text style={styles.label}>Revenu annuel</Text>
                <Text style={styles.sliderVal}>CHF {formatNumber(income)}</Text>
              </View>
              <Slider style={styles.slider} minimumValue={20000} maximumValue={150000} step={1000} value={income} onValueChange={setIncome}
                minimumTrackTintColor={Colors.success} maximumTrackTintColor={Colors.cardBorder} thumbTintColor={Colors.success} />
              <View style={styles.statusRow}>
                {[{ v: false, l: 'Célibataire' }, { v: true, l: 'Marié(e)' }].map(o => (
                  <TouchableOpacity key={o.l} style={[styles.statusBtn, married === o.v && styles.statusBtnOn]} onPress={() => setMarried(o.v)}>
                    <Text style={[styles.statusTxt, married === o.v && styles.statusTxtOn]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Enfants</Text>
              <View style={styles.childRow}>
                {[0, 1, 2, 3].map(n => (
                  <TouchableOpacity key={n} style={[styles.childChip, children === n && styles.childOn]} onPress={() => setChildren(n)}>
                    <Text style={[styles.childTxt, children === n && styles.childTxtOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
            <Card style={[styles.subsidyResult, { borderColor: subsidy > 0 ? Colors.success : Colors.cardBorder }]}>
              <Ionicons name={subsidy > 0 ? 'checkmark-circle' : 'close-circle'} size={32} color={subsidy > 0 ? Colors.success : Colors.error} />
              <Text style={[styles.subsidySt, { color: subsidy > 0 ? Colors.success : Colors.error }]}>
                {subsidy > 0 ? 'Éligible aux subsides' : 'Non éligible'}
              </Text>
              {subsidy > 0 && (
                <>
                  <Text style={styles.subsidyAmt}>-CHF {formatNumber(subsidy)}/mois</Text>
                  <Text style={styles.subsidyAnn}>Économie: CHF {formatNumber(subsidy * 12)}/an</Text>
                </>
              )}
            </Card>
          </>
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          <>
            <Text style={styles.secTitle}>26 cantons · Prime moyenne 2026</Text>
            {cantonRanking.map((c, idx) => (
              <TouchableOpacity key={c.code} style={[styles.rkItem, canton === c.code && styles.rkItemOn]} onPress={() => setCanton(c.code)}>
                <Text style={[styles.rkPos, idx < 3 && { color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' }]}>#{idx + 1}</Text>
                <View style={styles.rkInfo}>
                  <Text style={styles.rkName}>{c.name} ({c.code})</Text>
                  <View style={styles.rkChgRow}>
                    <Ionicons name={c.change > 4.4 ? 'arrow-up' : 'arrow-down'} size={11} color={c.change > 4.4 ? Colors.error : Colors.success} />
                    <Text style={[styles.rkChg, { color: c.change > 4.4 ? Colors.error : Colors.success }]}>{c.change > 0 ? '+' : ''}{c.change}%</Text>
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

const styles = StyleSheet.create({
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
