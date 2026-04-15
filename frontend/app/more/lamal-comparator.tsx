/**
 * GUARDIAN MONEY CHF - LAMal Comparator
 * Compare 8 insurers across 26 cantons with franchise optimization
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
import {
  CANTONS,
  INSURERS,
  FRANCHISES,
  INSURANCE_MODELS,
  type CantonCode,
} from '../../src/data/swiss-data';
import {
  calculateLamalPremium,
  calculateLamalSubsidy,
  calculateAnnualLamalCost,
  formatNumber,
} from '../../src/utils/calculations';

type Tab = 'compare' | 'optimize' | 'subsidy' | 'ranking';

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
  const [expectedCosts, setExpectedCosts] = useState(500);
  const [activeTab, setActiveTab] = useState<Tab>('compare');
  const [selectedInsurer, setSelectedInsurer] = useState('css');

  const subsidy = useMemo(() => {
    return calculateLamalSubsidy(canton, income, married, children);
  }, [canton, income, married, children]);

  const results = useMemo(() => {
    return INSURERS
      .filter(ins => ins.cantons === 'all' || ins.cantons.split('|').includes(canton))
      .map(ins => {
        const premium = calculateLamalPremium(canton, ins.id, model, franchise, age);
        const netPremium = Math.max(0, premium - subsidy);
        const annualData = calculateAnnualLamalCost(netPremium, franchise, expectedCosts, 0);
        return { ins, premium, netPremium, annualData };
      })
      .sort((a, b) => a.netPremium - b.netPremium);
  }, [canton, model, franchise, age, subsidy, expectedCosts]);

  const lowestPremium = results[0]?.netPremium || 0;
  const avgPremium = CANTONS[canton]?.lamalPremium || 0;
  const selectedResult = results.find(r => r.ins.id === selectedInsurer) || results[0];

  const cantonRanking = useMemo(() => {
    return Object.entries(CANTONS)
      .map(([code, data]) => ({
        code: code as CantonCode,
        name: data.name,
        premium: calculateLamalPremium(code as CantonCode, 'css', model, franchise, age),
        region: data.region,
      }))
      .sort((a, b) => a.premium - b.premium);
  }, [model, franchise, age]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'compare', label: 'Comparer', icon: 'git-compare' },
    { key: 'optimize', label: 'Optimiser', icon: 'flash' },
    { key: 'subsidy', label: 'Subsides', icon: 'heart' },
    { key: 'ranking', label: '26 cantons', icon: 'map' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Comparateur LAMal</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Input Section */}
        <Card style={styles.inputCard}>
          <Text style={styles.sectionLabel}>Votre situation</Text>

          {/* Canton */}
          <Text style={styles.inputLabel}>Canton de résidence</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {(['VD', 'GE', 'ZH', 'BE', 'ZG', 'LU', 'BS', 'FR', 'TI', 'VS'] as CantonCode[]).map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.chip, canton === code && styles.chipSelected]}
                  onPress={() => setCanton(code)}
                >
                  <Text style={[styles.chipText, canton === code && styles.chipTextSelected]}>
                    {code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Age Slider */}
          <View style={styles.sliderRow}>
            <Text style={styles.inputLabel}>Âge</Text>
            <Text style={styles.sliderValue}>
              {age < 19 ? 'Enfant' : age < 26 ? 'Jeune adulte' : `${age} ans`}
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={70}
            step={1}
            value={age}
            onValueChange={setAge}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.cardBorder}
            thumbTintColor={Colors.primary}
          />

          {/* Franchise */}
          <Text style={styles.inputLabel}>Franchise</Text>
          <View style={styles.franchiseRow}>
            {FRANCHISES.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.franchiseChip,
                  franchise === f.value && styles.franchiseChipSelected,
                ]}
                onPress={() => setFranchise(f.value)}
              >
                <Text style={[
                  styles.franchiseText,
                  franchise === f.value && styles.franchiseTextSelected,
                ]}>
                  {formatNumber(f.value)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Model */}
          <Text style={styles.inputLabel}>Modèle d'assurance</Text>
          <View style={styles.modelRow}>
            {INSURANCE_MODELS.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[
                  styles.modelChip,
                  model === m.value && styles.modelChipSelected,
                ]}
                onPress={() => setModel(m.value as any)}
              >
                <Text style={[
                  styles.modelText,
                  model === m.value && styles.modelTextSelected,
                ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Hero Result */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroLabel}>Prime la moins chère</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroAmount}>{formatNumber(lowestPremium)}</Text>
            <View style={styles.heroInfo}>
              <Text style={styles.heroInsurer}>{results[0]?.ins.name}</Text>
              <Text style={styles.heroUnit}>CHF/mois</Text>
            </View>
          </View>
          {subsidy > 0 && (
            <Badge text={`-${formatNumber(subsidy)} subside`} color={Colors.success} />
          )}
          
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Moyenne canton</Text>
              <Text style={styles.heroStatValue}>{formatNumber(Math.round(avgPremium * (age < 19 ? 0.32 : age < 26 ? 0.58 : 1)))}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Économie/an</Text>
              <Text style={[styles.heroStatValue, { color: Colors.success }]}>
                {formatNumber(Math.max(0, Math.round((avgPremium * (age < 19 ? 0.32 : age < 26 ? 0.58 : 1) - lowestPremium) * 12)))}
              </Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Assureurs</Text>
              <Text style={styles.heroStatValue}>{results.length}</Text>
            </View>
          </View>
        </Card>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabs}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={16}
                  color={activeTab === tab.key ? Colors.text : Colors.textTertiary}
                />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>
              📊 Comparaison {CANTONS[canton].name}
            </Text>
            <Text style={styles.tabSubtitle}>
              {results.length} assureurs · franchise CHF {formatNumber(franchise)}
            </Text>

            {results.map((r, idx) => (
              <Card
                key={r.ins.id}
                style={[
                  styles.insurerCard,
                  selectedInsurer === r.ins.id && styles.insurerCardSelected,
                ]}
                onPress={() => setSelectedInsurer(r.ins.id)}
              >
                <View style={styles.insurerHeader}>
                  <View style={[styles.insurerLogo, { backgroundColor: r.ins.color }]}>
                    <Text style={styles.insurerLogoText}>{r.ins.logo}</Text>
                  </View>
                  <View style={styles.insurerInfo}>
                    <View style={styles.insurerNameRow}>
                      <Text style={styles.insurerName}>{r.ins.name}</Text>
                      {idx === 0 && <Badge text="Moins cher" color={Colors.success} size="sm" />}
                    </View>
                    <View style={styles.ratingRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= Math.floor(r.ins.rating) ? 'star' : 'star-outline'}
                          size={12}
                          color={Colors.warning}
                        />
                      ))}
                      <Text style={styles.ratingText}>{r.ins.rating}</Text>
                    </View>
                  </View>
                  <View style={styles.insurerPrice}>
                    <Text style={styles.insurerPriceValue}>{formatNumber(r.netPremium)}</Text>
                    <Text style={styles.insurerPriceUnit}>CHF/mois</Text>
                  </View>
                </View>

                <View style={styles.annualBreakdown}>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Primes/an</Text>
                    <Text style={styles.breakdownValue}>{formatNumber(r.annualData.premiumYear)}</Text>
                  </View>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Franchise</Text>
                    <Text style={styles.breakdownValue}>{formatNumber(r.annualData.franchiseCost)}</Text>
                  </View>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Total/an</Text>
                    <Text style={[styles.breakdownValue, { color: idx === 0 ? Colors.success : Colors.text }]}>
                      {formatNumber(r.annualData.total)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Optimize Tab */}
        {activeTab === 'optimize' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>⚡ Optimisation franchise</Text>
            <Text style={styles.tabSubtitle}>
              Franchise optimale selon votre santé · {selectedResult?.ins.name}
            </Text>

            <Card style={styles.optimizeCard}>
              <View style={styles.optimizeRow}>
                <View style={[styles.optimizeBox, { borderColor: Colors.success }]}>
                  <Ionicons name="fitness" size={24} color={Colors.success} />
                  <Text style={styles.optimizeLabel}>Si bonne santé</Text>
                  <Text style={[styles.optimizeValue, { color: Colors.success }]}>CHF 2'500</Text>
                  <Text style={styles.optimizeHint}>Primes min.</Text>
                </View>
                <View style={[styles.optimizeBox, { borderColor: Colors.error }]}>
                  <Ionicons name="medkit" size={24} color={Colors.error} />
                  <Text style={styles.optimizeLabel}>Si malade</Text>
                  <Text style={[styles.optimizeValue, { color: Colors.error }]}>CHF 300</Text>
                  <Text style={styles.optimizeHint}>Coût total min.</Text>
                </View>
              </View>
            </Card>

            <Card style={styles.rulesCard}>
              <Text style={styles.rulesTitle}>💡 Règles générales</Text>
              {[
                { rule: "Franchise CHF 2'500", when: "Bonne santé, dépenses < CHF 2'500/an" },
                { rule: "Franchise CHF 300", when: "Maladies chroniques, grossesse prévue" },
                { rule: "Franchise CHF 1'000-1'500", when: "Situation intermédiaire" },
              ].map((item, idx) => (
                <View key={idx} style={styles.ruleItem}>
                  <Text style={styles.ruleTitle}>{item.rule}</Text>
                  <Text style={styles.ruleWhen}>{item.when}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Subsidy Tab */}
        {activeTab === 'subsidy' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>💚 Subsides LAMal</Text>
            <Text style={styles.tabSubtitle}>Réduction de primes selon votre revenu</Text>

            <Card style={styles.subsidyInputCard}>
              <View style={styles.sliderRow}>
                <Text style={styles.inputLabel}>Revenu annuel</Text>
                <Text style={styles.sliderValue}>CHF {formatNumber(income)}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={20000}
                maximumValue={150000}
                step={1000}
                value={income}
                onValueChange={setIncome}
                minimumTrackTintColor={Colors.success}
                maximumTrackTintColor={Colors.cardBorder}
                thumbTintColor={Colors.success}
              />

              <View style={styles.statusButtons}>
                {[{ value: false, label: 'Célibataire' }, { value: true, label: 'Marié(e)' }].map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.statusButton, married === opt.value && styles.statusButtonSelected]}
                    onPress={() => setMarried(opt.value)}
                  >
                    <Text style={[styles.statusButtonText, married === opt.value && styles.statusButtonTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Enfants</Text>
              <View style={styles.childrenRow}>
                {[0, 1, 2, 3].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.childrenChip, children === n && styles.childrenChipSelected]}
                    onPress={() => setChildren(n)}
                  >
                    <Text style={[styles.childrenText, children === n && styles.childrenTextSelected]}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            <Card style={[styles.subsidyResultCard, { borderColor: subsidy > 0 ? Colors.success : Colors.cardBorder }]}>
              <View style={styles.subsidyHeader}>
                <Ionicons
                  name={subsidy > 0 ? 'checkmark-circle' : 'close-circle'}
                  size={24}
                  color={subsidy > 0 ? Colors.success : Colors.error}
                />
                <Text style={[styles.subsidyStatus, { color: subsidy > 0 ? Colors.success : Colors.error }]}>
                  {subsidy > 0 ? 'Éligible aux subsides LAMal' : 'Non éligible aux subsides'}
                </Text>
              </View>

              <Text style={styles.subsidyThreshold}>
                Seuil canton {CANTONS[canton].name}: CHF {formatNumber(CANTONS[canton].subsidyThreshold)}/an
              </Text>

              {subsidy > 0 && (
                <View style={styles.subsidyAmount}>
                  <Text style={styles.subsidyAmountLabel}>Subside mensuel</Text>
                  <Text style={styles.subsidyAmountValue}>-CHF {formatNumber(subsidy)}</Text>
                  <Text style={styles.subsidyAnnual}>Économie annuelle: CHF {formatNumber(subsidy * 12)}</Text>
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>🗺️ Classement 26 cantons</Text>
            <Text style={styles.tabSubtitle}>Primes CSS · {INSURANCE_MODELS.find(m => m.value === model)?.label}</Text>

            <Card style={styles.rankingCard}>
              <Text style={styles.rankingSectionTitle}>💰 Cantons les moins chers</Text>
              {cantonRanking.slice(0, 5).map((c, idx) => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.rankingItem}
                  onPress={() => setCanton(c.code)}
                >
                  <Text style={[styles.rankingNumber, idx < 3 && { color: '#FFD700' }]}>#{idx + 1}</Text>
                  <View style={styles.rankingInfo}>
                    <Text style={styles.rankingName}>{c.name} ({c.code})</Text>
                    <Text style={styles.rankingRegion}>
                      {c.region === 'FR' ? 'Romand' : c.region === 'IT' ? 'Tessin' : 'Alémanique'}
                    </Text>
                  </View>
                  <Text style={styles.rankingPremium}>CHF {formatNumber(c.premium)}/mois</Text>
                </TouchableOpacity>
              ))}
            </Card>

            <Card style={styles.rankingCard}>
              <Text style={styles.rankingSectionTitle}>💸 Cantons les plus chers</Text>
              {cantonRanking.slice(-5).reverse().map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.rankingItem}
                  onPress={() => setCanton(c.code)}
                >
                  <View style={styles.rankingInfo}>
                    <Text style={styles.rankingName}>{c.name} ({c.code})</Text>
                  </View>
                  <Text style={[styles.rankingPremium, { color: Colors.error }]}>
                    CHF {formatNumber(c.premium)}/mois
                  </Text>
                </TouchableOpacity>
              ))}
            </Card>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  inputCard: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  chipSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  chipTextSelected: {
    color: Colors.primary,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderValue: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  franchiseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  franchiseChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  franchiseChipSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  franchiseText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  franchiseTextSelected: {
    color: Colors.primary,
  },
  modelRow: {
    gap: Spacing.sm,
  },
  modelChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.xs,
  },
  modelChipSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  modelText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  modelTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  heroCard: {
    marginBottom: Spacing.md,
    backgroundColor: `${Colors.success}08`,
    borderColor: `${Colors.success}30`,
  },
  heroLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  heroAmount: {
    color: Colors.text,
    fontSize: FontSizes.hero,
    fontWeight: FontWeights.black,
  },
  heroInfo: {},
  heroInsurer: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  heroUnit: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  heroStats: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  heroStat: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  heroStatLabel: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  heroStatValue: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  tabsScroll: {
    marginBottom: Spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
  },
  tabActive: {
    backgroundColor: Colors.success,
  },
  tabText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  tabTextActive: {
    color: Colors.text,
  },
  tabContent: {},
  tabTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.xs,
  },
  tabSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  insurerCard: {
    marginBottom: Spacing.md,
  },
  insurerCardSelected: {
    borderColor: Colors.primary,
  },
  insurerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  insurerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  insurerLogoText: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  insurerInfo: {
    flex: 1,
  },
  insurerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  insurerName: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  ratingText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginLeft: Spacing.xs,
  },
  insurerPrice: {
    alignItems: 'flex-end',
  },
  insurerPriceValue: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
  },
  insurerPriceUnit: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  annualBreakdown: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownLabel: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  breakdownValue: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  optimizeCard: {
    marginBottom: Spacing.md,
  },
  optimizeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  optimizeBox: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    backgroundColor: Colors.card,
  },
  optimizeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
  },
  optimizeValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginTop: Spacing.xs,
  },
  optimizeHint: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  rulesCard: {
    marginBottom: Spacing.md,
  },
  rulesTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  ruleItem: {
    marginBottom: Spacing.md,
  },
  ruleTitle: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  ruleWhen: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  subsidyInputCard: {
    marginBottom: Spacing.md,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  statusButtonSelected: {
    backgroundColor: `${Colors.success}20`,
    borderColor: Colors.success,
  },
  statusButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  statusButtonTextSelected: {
    color: Colors.success,
  },
  childrenRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  childrenChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  childrenChipSelected: {
    backgroundColor: `${Colors.success}20`,
    borderColor: Colors.success,
  },
  childrenText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  childrenTextSelected: {
    color: Colors.success,
  },
  subsidyResultCard: {
    marginBottom: Spacing.md,
    borderWidth: 2,
  },
  subsidyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  subsidyStatus: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  subsidyThreshold: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  subsidyAmount: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  subsidyAmountLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  subsidyAmountValue: {
    color: Colors.success,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
  },
  subsidyAnnual: {
    color: Colors.success,
    fontSize: FontSizes.sm,
  },
  rankingCard: {
    marginBottom: Spacing.md,
  },
  rankingSectionTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  rankingNumber: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    width: 32,
  },
  rankingInfo: {
    flex: 1,
  },
  rankingName: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  rankingRegion: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  rankingPremium: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
});
