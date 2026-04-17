/**
 * GUARDIAN MONEY CHF - Comparateur LAMal Priminfo 2026
 * Données officielles OFSP - Aucune publicité d'assureurs
 * Source: Priminfo.admin.ch
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
  PRIMINFO_PREMIUMS_2026,
  SWISS_AVG_PREMIUM_2026,
  calculatePriminfoPremium,
  getTop10Cheapest,
  getCantonRanking,
  FRANCHISE_DISCOUNTS,
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

  // Calculate premiums from Priminfo data
  const premiums = useMemo(() => {
    return calculatePriminfoPremium(canton, franchise, model, age);
  }, [canton, franchise, model, age]);

  // Get top 10 cheapest offers
  const top10 = useMemo(() => {
    return getTop10Cheapest(canton, franchise, model, age);
  }, [canton, franchise, model, age]);

  // Canton ranking
  const cantonRanking = useMemo(() => {
    return getCantonRanking(franchise, model, age);
  }, [franchise, model, age]);

  // Subsidy calculation
  const subsidy = useMemo(() => {
    const cantonData = CANTONS[canton];
    if (!cantonData) return 0;
    const threshold = cantonData.subsidyThreshold * (married ? 1.6 : 1) + children * 8000;
    if (income > threshold * 1.3) return 0;
    const refPremium = premiums.avg;
    const maxContribution = income * (income < threshold * 0.7 ? 0.08 : 0.10);
    const sub = Math.max(0, refPremium * 12 - maxContribution);
    if (income > threshold) {
      return Math.round(sub * (1 - (income - threshold) / (threshold * 0.3)) / 12);
    }
    return Math.round(sub / 12);
  }, [canton, income, married, children, premiums]);

  // Annual savings with optimal franchise
  const savingsWithHighFranchise = useMemo(() => {
    const low = calculatePriminfoPremium(canton, 300, model, age);
    const high = calculatePriminfoPremium(canton, 2500, model, age);
    return (low.avg - high.avg) * 12;
  }, [canton, model, age]);

  const cantonChange = PRIMINFO_PREMIUMS_2026[canton]?.change || 0;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: 'Top 10', icon: 'podium' },
    { key: 'optimize', label: 'Optimiser', icon: 'flash' },
    { key: 'subsidy', label: 'Subsides', icon: 'heart' },
    { key: 'ranking', label: '26 cantons', icon: 'map' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="lamal-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Comparateur LAMal</Text>
          <Text style={styles.subtitle}>Données Priminfo 2026 · OFSP</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Configuration */}
        <Card style={styles.configCard}>
          {/* Canton */}
          <Text style={styles.sectionLabel}>Canton</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {MAIN_CANTONS.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.chip, canton === code && styles.chipSelected]}
                  onPress={() => setCanton(code)}
                  testID={`canton-chip-${code}`}
                >
                  <Text style={[styles.chipText, canton === code && styles.chipTextSelected]}>{code}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Age */}
          <View style={styles.sliderRow}>
            <Text style={styles.inputLabel}>Âge</Text>
            <Text style={styles.sliderValue}>
              {age < 19 ? 'Enfant (0-18)' : age < 26 ? `Jeune adulte (${age})` : `${age} ans`}
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0} maximumValue={70} step={1}
            value={age} onValueChange={setAge}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.cardBorder}
            thumbTintColor={Colors.primary}
          />

          {/* Franchise */}
          <Text style={styles.inputLabel}>Franchise annuelle</Text>
          <View style={styles.franchiseRow}>
            {FRANCHISES.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[styles.franchiseChip, franchise === f.value && styles.franchiseSelected]}
                onPress={() => setFranchise(f.value)}
                testID={`franchise-${f.value}`}
              >
                <Text style={[styles.franchiseText, franchise === f.value && styles.franchiseTextSelected]}>
                  {formatNumber(f.value)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Model */}
          <Text style={styles.inputLabel}>Modèle d'assurance</Text>
          {INSURANCE_MODELS.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.modelChip, model === m.value && styles.modelSelected]}
              onPress={() => setModel(m.value as any)}
            >
              <Text style={[styles.modelText, model === m.value && styles.modelTextSelected]}>
                {m.label}
                {m.discount > 0 && ` (-${Math.round(m.discount * 100)}%)`}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* Hero Result */}
        <Card style={styles.heroCard}>
          <View style={styles.heroSourceRow}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.heroSource}>Données Priminfo OFSP 2026</Text>
          </View>
          <Text style={styles.heroLabel}>Prime mensuelle · {CANTONS[canton]?.name}</Text>
          <View style={styles.heroAmountRow}>
            <Text style={styles.heroMin}>dès</Text>
            <Text style={styles.heroAmount}>{formatNumber(premiums.min)}</Text>
            <Text style={styles.heroUnit}>CHF/mois</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Moins cher</Text>
              <Text style={[styles.heroStatValue, { color: Colors.success }]}>{formatNumber(premiums.min)}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Moyenne</Text>
              <Text style={styles.heroStatValue}>{formatNumber(premiums.avg)}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Plus cher</Text>
              <Text style={[styles.heroStatValue, { color: Colors.error }]}>{formatNumber(premiums.max)}</Text>
            </View>
          </View>
          <View style={styles.changeRow}>
            <Ionicons
              name={cantonChange > 0 ? 'trending-up' : 'trending-down'}
              size={16}
              color={cantonChange > 0 ? Colors.error : Colors.success}
            />
            <Text style={[styles.changeText, { color: cantonChange > 0 ? Colors.error : Colors.success }]}>
              {cantonChange > 0 ? '+' : ''}{cantonChange}% vs 2025
            </Text>
            <Text style={styles.changeAvg}>
              Moyenne CH: {formatNumber(Math.round(SWISS_AVG_PREMIUM_2026))} CHF
            </Text>
          </View>
          {subsidy > 0 && (
            <View style={styles.subsidyBadge}>
              <Ionicons name="heart" size={14} color={Colors.success} />
              <Text style={styles.subsidyBadgeText}>Subside estimé: -{formatNumber(subsidy)} CHF/mois</Text>
            </View>
          )}
        </Card>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabs}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                testID={`tab-${tab.key}`}
              >
                <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? Colors.text : Colors.textTertiary} />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Compare Tab - Top 10 */}
        {activeTab === 'compare' && (
          <>
            <Text style={styles.tabTitle}>Top 10 primes · {CANTONS[canton]?.name}</Text>
            <Text style={styles.tabSubtitle}>
              Franchise CHF {formatNumber(franchise)} · {INSURANCE_MODELS.find(m => m.value === model)?.label}
            </Text>

            {top10.map((offer) => {
              const isFirst = offer.rank === 1;
              const diff = offer.premium - premiums.min;
              return (
                <Card key={offer.rank} style={[styles.offerCard, isFirst && styles.offerCardBest]}>
                  <View style={styles.offerRow}>
                    <View style={[styles.rankBadge, isFirst && styles.rankBadgeBest]}>
                      <Text style={[styles.rankText, isFirst && styles.rankTextBest]}>#{offer.rank}</Text>
                    </View>
                    <View style={styles.offerInfo}>
                      <Text style={styles.offerLabel}>{offer.label}</Text>
                      {diff > 0 && (
                        <Text style={styles.offerDiff}>+{formatNumber(diff)} CHF vs meilleur</Text>
                      )}
                    </View>
                    <View style={styles.offerPrice}>
                      <Text style={[styles.offerAmount, isFirst && { color: Colors.success }]}>
                        {formatNumber(offer.premium)}
                      </Text>
                      <Text style={styles.offerUnit}>CHF/mois</Text>
                    </View>
                  </View>
                  <ProgressBar
                    value={100 - ((offer.premium - premiums.min) / (premiums.max - premiums.min) * 100)}
                    color={isFirst ? Colors.success : Colors.primary}
                    height={4}
                  />
                </Card>
              );
            })}

            <Card style={styles.tipCard}>
              <Ionicons name="information-circle" size={20} color={Colors.info} />
              <Text style={styles.tipText}>
                Consultez priminfo.admin.ch pour la liste complète des assureurs et obtenir des offres personnalisées. Les primes indiquées sont des estimations basées sur les données OFSP 2026.
              </Text>
            </Card>
          </>
        )}

        {/* Optimize Tab */}
        {activeTab === 'optimize' && (
          <>
            <Text style={styles.tabTitle}>Optimisation de franchise</Text>
            <Card style={styles.optimizeCard}>
              <View style={styles.optimizeGrid}>
                <View style={[styles.optimizeBox, { borderColor: Colors.success }]}>
                  <Ionicons name="fitness" size={28} color={Colors.success} />
                  <Text style={styles.optimizeLabel}>Bonne santé</Text>
                  <Text style={[styles.optimizeValue, { color: Colors.success }]}>CHF 2'500</Text>
                  <Text style={styles.optimizeHint}>Franchise maximale</Text>
                  <Text style={styles.optimizeDetail}>
                    Économie: ~{formatNumber(savingsWithHighFranchise)} CHF/an
                  </Text>
                </View>
                <View style={[styles.optimizeBox, { borderColor: Colors.error }]}>
                  <Ionicons name="medkit" size={28} color={Colors.error} />
                  <Text style={styles.optimizeLabel}>Maladie chronique</Text>
                  <Text style={[styles.optimizeValue, { color: Colors.error }]}>CHF 300</Text>
                  <Text style={styles.optimizeHint}>Franchise minimale</Text>
                  <Text style={styles.optimizeDetail}>
                    Coûts médicaux couverts dès CHF 300
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={styles.rulesCard}>
              <Text style={styles.rulesTitle}>Guide de choix</Text>
              {[
                { franchise: "CHF 2'500", who: 'Jeune en bonne santé, peu de frais médicaux', icon: 'happy' as const, color: Colors.success },
                { franchise: "CHF 1'500", who: 'Adulte avec quelques consultations/an', icon: 'person' as const, color: Colors.primary },
                { franchise: 'CHF 300', who: 'Famille, grossesse prévue, traitement suivi', icon: 'heart' as const, color: Colors.error },
              ].map((item, idx) => (
                <View key={idx} style={styles.ruleItem}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                  <View style={styles.ruleContent}>
                    <Text style={[styles.ruleTitle2, { color: item.color }]}>{item.franchise}</Text>
                    <Text style={styles.ruleWhen}>{item.who}</Text>
                  </View>
                </View>
              ))}
            </Card>

            <Card style={styles.tipCard}>
              <Ionicons name="bulb" size={20} color={Colors.warning} />
              <Text style={styles.tipText}>
                Changez d'assureur avant le 30 novembre pour l'année suivante. Résiliez par lettre recommandée au plus tard le 30 novembre.
              </Text>
            </Card>
          </>
        )}

        {/* Subsidy Tab */}
        {activeTab === 'subsidy' && (
          <>
            <Text style={styles.tabTitle}>Réduction de primes (subsides)</Text>
            <Card style={styles.subsidyCard}>
              <View style={styles.sliderRow}>
                <Text style={styles.inputLabel}>Revenu annuel</Text>
                <Text style={styles.sliderValue}>CHF {formatNumber(income)}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={20000} maximumValue={150000} step={1000}
                value={income} onValueChange={setIncome}
                minimumTrackTintColor={Colors.success}
                maximumTrackTintColor={Colors.cardBorder}
                thumbTintColor={Colors.success}
              />

              <View style={styles.statusButtons}>
                {[{ v: false, l: 'Célibataire' }, { v: true, l: 'Marié(e)' }].map((o) => (
                  <TouchableOpacity
                    key={o.l}
                    style={[styles.statusBtn, married === o.v && styles.statusBtnActive]}
                    onPress={() => setMarried(o.v)}
                  >
                    <Text style={[styles.statusBtnText, married === o.v && styles.statusBtnTextActive]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Enfants</Text>
              <View style={styles.childrenRow}>
                {[0, 1, 2, 3].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.childChip, children === n && styles.childChipActive]}
                    onPress={() => setChildren(n)}
                  >
                    <Text style={[styles.childText, children === n && styles.childTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            <Card style={[styles.subsidyResultCard, { borderColor: subsidy > 0 ? Colors.success : Colors.cardBorder }]}>
              <Ionicons
                name={subsidy > 0 ? 'checkmark-circle' : 'close-circle'}
                size={28}
                color={subsidy > 0 ? Colors.success : Colors.error}
              />
              <Text style={[styles.subsidyStatus, { color: subsidy > 0 ? Colors.success : Colors.error }]}>
                {subsidy > 0 ? 'Éligible aux subsides' : 'Non éligible'}
              </Text>
              <Text style={styles.subsidyThreshold}>
                Seuil {CANTONS[canton]?.name}: CHF {formatNumber(CANTONS[canton]?.subsidyThreshold || 0)}/an
              </Text>
              {subsidy > 0 && (
                <>
                  <Text style={styles.subsidyAmount}>-CHF {formatNumber(subsidy)}/mois</Text>
                  <Text style={styles.subsidyAnnual}>Économie annuelle: CHF {formatNumber(subsidy * 12)}</Text>
                </>
              )}
            </Card>
          </>
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          <>
            <Text style={styles.tabTitle}>Classement 26 cantons · 2026</Text>
            <Text style={styles.tabSubtitle}>Prime moyenne · {INSURANCE_MODELS.find(m => m.value === model)?.label}</Text>

            {cantonRanking.map((c, idx) => (
              <TouchableOpacity
                key={c.code}
                style={[styles.rankingItem, canton === c.code && styles.rankingItemActive]}
                onPress={() => setCanton(c.code)}
              >
                <Text style={[
                  styles.rankingPos,
                  idx < 3 && { color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' }
                ]}>
                  #{idx + 1}
                </Text>
                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingName}>{c.name} ({c.code})</Text>
                  <View style={styles.rankingChangeRow}>
                    <Ionicons
                      name={c.change > 4.4 ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={c.change > 4.4 ? Colors.error : Colors.success}
                    />
                    <Text style={[styles.rankingChange, { color: c.change > 4.4 ? Colors.error : Colors.success }]}>
                      {c.change > 0 ? '+' : ''}{c.change}%
                    </Text>
                  </View>
                </View>
                <Text style={styles.rankingPremium}>CHF {formatNumber(c.premium)}</Text>
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  subtitle: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  configCard: { marginBottom: Spacing.md },
  sectionLabel: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.sm },
  inputLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipSelected: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  chipTextSelected: { color: Colors.primary },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderValue: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  slider: { width: '100%', height: 40 },
  franchiseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  franchiseChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  franchiseSelected: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  franchiseText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  franchiseTextSelected: { color: Colors.primary },
  modelChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: Spacing.xs },
  modelSelected: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  modelText: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  modelTextSelected: { color: Colors.primary, fontWeight: FontWeights.semibold },
  heroCard: { marginBottom: Spacing.md, backgroundColor: `${Colors.success}05`, borderColor: `${Colors.success}25` },
  heroSourceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  heroSource: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  heroLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginVertical: Spacing.sm },
  heroMin: { color: Colors.textSecondary, fontSize: FontSizes.md },
  heroAmount: { color: Colors.text, fontSize: FontSizes.hero, fontWeight: FontWeights.black },
  heroUnit: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  heroStats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  heroStat: { flex: 1, backgroundColor: Colors.card, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  heroStatLabel: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  heroStatValue: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  changeText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  changeAvg: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginLeft: 'auto' },
  subsidyBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md, backgroundColor: `${Colors.success}15`, padding: Spacing.sm, borderRadius: BorderRadius.sm },
  subsidyBadgeText: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabsScroll: { marginBottom: Spacing.md },
  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  tabActive: { backgroundColor: Colors.success },
  tabText: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabTextActive: { color: Colors.text },
  tabTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.xs },
  tabSubtitle: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.md },
  offerCard: { marginBottom: Spacing.sm },
  offerCardBest: { borderColor: `${Colors.success}40` },
  offerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  rankBadgeBest: { backgroundColor: `${Colors.success}20` },
  rankText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  rankTextBest: { color: Colors.success },
  offerInfo: { flex: 1 },
  offerLabel: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  offerDiff: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  offerPrice: { alignItems: 'flex-end' },
  offerAmount: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.black },
  offerUnit: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.md },
  tipText: { flex: 1, color: Colors.textSecondary, fontSize: FontSizes.sm, lineHeight: 20 },
  optimizeCard: { marginBottom: Spacing.md },
  optimizeGrid: { flexDirection: 'row', gap: Spacing.md },
  optimizeBox: { flex: 1, alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 2, backgroundColor: Colors.card },
  optimizeLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.sm },
  optimizeValue: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.xs },
  optimizeHint: { color: Colors.textTertiary, fontSize: FontSizes.xs },
  optimizeDetail: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: Spacing.sm, textAlign: 'center' },
  rulesCard: { marginBottom: Spacing.md },
  rulesTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold, marginBottom: Spacing.md },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  ruleContent: { flex: 1 },
  ruleTitle2: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  ruleWhen: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  subsidyCard: { marginBottom: Spacing.md },
  statusButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  statusBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center' },
  statusBtnActive: { backgroundColor: `${Colors.success}20`, borderColor: Colors.success },
  statusBtnText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  statusBtnTextActive: { color: Colors.success },
  childrenRow: { flexDirection: 'row', gap: Spacing.sm },
  childChip: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center' },
  childChipActive: { backgroundColor: `${Colors.success}20`, borderColor: Colors.success },
  childText: { color: Colors.textSecondary, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  childTextActive: { color: Colors.success },
  subsidyResultCard: { marginBottom: Spacing.md, borderWidth: 2, alignItems: 'center', padding: Spacing.xl },
  subsidyStatus: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.sm },
  subsidyThreshold: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.xs },
  subsidyAmount: { color: Colors.success, fontSize: FontSizes.xxxl, fontWeight: FontWeights.black, marginTop: Spacing.md },
  subsidyAnnual: { color: Colors.success, fontSize: FontSizes.sm },
  rankingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  rankingItemActive: { backgroundColor: `${Colors.primary}10`, marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
  rankingPos: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: FontWeights.bold, width: 40 },
  rankingInfo: { flex: 1 },
  rankingName: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  rankingChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankingChange: { fontSize: FontSizes.xs },
  rankingPremium: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.bold },
});
