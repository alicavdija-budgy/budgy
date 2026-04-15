/**
 * GUARDIAN MONEY CHF - Swiss Tax Optimizer
 * Calculate IFD + ICC for 15 main cantons with 3rd pillar optimization
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
import { Card, ProgressBar, Badge } from '../../src/components/ui';
import { CANTONS, PILLAR_3A_LIMITS, type CantonCode } from '../../src/data/swiss-data';
import {
  calculateIFD,
  calculateICC,
  calculateTaxableIncome,
  calculatePillar3aSavings,
  formatNumber,
} from '../../src/utils/calculations';

const MAIN_CANTONS: CantonCode[] = ['ZH', 'BE', 'VD', 'GE', 'ZG', 'LU', 'BS', 'AG', 'FR', 'TI', 'VS', 'NE', 'GR', 'SG', 'SZ'];

export default function TaxOptimizerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [grossIncome, setGrossIncome] = useState(85000);
  const [pillar3a, setPillar3a] = useState(0);
  const [canton, setCanton] = useState<CantonCode>('VD');
  const [married, setMarried] = useState(false);
  const [showCantonRanking, setShowCantonRanking] = useState(false);

  const maxPillar3a = PILLAR_3A_LIMITS.employee;

  // Calculate taxes
  const taxableIncome = useMemo(() => {
    return calculateTaxableIncome(grossIncome, pillar3a, married);
  }, [grossIncome, pillar3a, married]);

  const ifd = useMemo(() => {
    return calculateIFD(taxableIncome, married);
  }, [taxableIncome, married]);

  const icc = useMemo(() => {
    return calculateICC(taxableIncome, canton);
  }, [taxableIncome, canton]);

  const totalTax = ifd + icc;

  const pillar3aSavings = useMemo(() => {
    return calculatePillar3aSavings(grossIncome, pillar3a, canton, married);
  }, [grossIncome, pillar3a, canton, married]);

  // Canton ranking by tax rate
  const cantonRanking = useMemo(() => {
    return MAIN_CANTONS.map(code => {
      const taxable = calculateTaxableIncome(grossIncome, pillar3a, married);
      const tax = calculateIFD(taxable, married) + calculateICC(taxable, code);
      return {
        code,
        name: CANTONS[code].name,
        taxRate: CANTONS[code].taxRate,
        totalTax: tax,
        lamalPremium: CANTONS[code].lamalPremium,
      };
    }).sort((a, b) => a.totalTax - b.totalTax);
  }, [grossIncome, pillar3a, married]);

  const effectiveTaxRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Swiss Tax Optimizer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Canton Selection */}
        <Card style={styles.cantonCard}>
          <Text style={styles.sectionLabel}>Canton de résidence</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.cantonGrid}>
              {MAIN_CANTONS.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.cantonChip,
                    canton === code && styles.cantonChipSelected,
                  ]}
                  onPress={() => setCanton(code)}
                >
                  <Text style={[
                    styles.cantonChipText,
                    canton === code && styles.cantonChipTextSelected,
                  ]}>
                    {code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.cantonInfo}>
            <Text style={styles.cantonName}>{CANTONS[canton].name}</Text>
            <Text style={styles.cantonRate}>Taux ICC: {CANTONS[canton].taxRate}%</Text>
          </View>
        </Card>

        {/* Income Slider */}
        <Card style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Revenu brut annuel</Text>
            <Text style={styles.sliderValue}>CHF {formatNumber(grossIncome)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={30000}
            maximumValue={300000}
            step={1000}
            value={grossIncome}
            onValueChange={setGrossIncome}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.cardBorder}
            thumbTintColor={Colors.primary}
          />
          <View style={styles.sliderRange}>
            <Text style={styles.sliderRangeText}>CHF 30'000</Text>
            <Text style={styles.sliderRangeText}>CHF 300'000</Text>
          </View>
        </Card>

        {/* 3rd Pillar Slider */}
        <Card style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>3ème pilier (3a)</Text>
            <Text style={styles.sliderValue}>CHF {formatNumber(pillar3a)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={maxPillar3a}
            step={100}
            value={pillar3a}
            onValueChange={setPillar3a}
            minimumTrackTintColor={Colors.success}
            maximumTrackTintColor={Colors.cardBorder}
            thumbTintColor={Colors.success}
          />
          <View style={styles.sliderRange}>
            <Text style={styles.sliderRangeText}>CHF 0</Text>
            <Text style={styles.sliderRangeText}>Max CHF {formatNumber(maxPillar3a)}</Text>
          </View>
          {pillar3a > 0 && (
            <View style={styles.savingsHighlight}>
              <Ionicons name="trending-down" size={18} color={Colors.success} />
              <Text style={styles.savingsText}>
                Économie fiscale: CHF {formatNumber(pillar3aSavings)}/an
              </Text>
            </View>
          )}
        </Card>

        {/* Marital Status */}
        <Card style={styles.statusCard}>
          <Text style={styles.sectionLabel}>Situation familiale</Text>
          <View style={styles.statusButtons}>
            {[{ value: false, label: 'Célibataire' }, { value: true, label: 'Marié(e)' }].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[
                  styles.statusButton,
                  married === opt.value && styles.statusButtonSelected,
                ]}
                onPress={() => setMarried(opt.value)}
              >
                <Text style={[
                  styles.statusButtonText,
                  married === opt.value && styles.statusButtonTextSelected,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Results */}
        <Card style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>🇨🇭 Calcul impôts 2025</Text>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Revenu brut</Text>
            <Text style={styles.resultValue}>CHF {formatNumber(grossIncome)}</Text>
          </View>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Déductions (AVS, LPP, frais)</Text>
            <Text style={[styles.resultValue, { color: Colors.success }]}>
              -CHF {formatNumber(grossIncome - taxableIncome)}
            </Text>
          </View>
          
          <View style={[styles.resultRow, styles.resultRowHighlight]}>
            <Text style={styles.resultLabelBold}>Revenu imposable</Text>
            <Text style={styles.resultValueBold}>CHF {formatNumber(taxableIncome)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>IFD (Impôt fédéral direct)</Text>
            <Text style={[styles.resultValue, { color: Colors.error }]}>
              CHF {formatNumber(ifd)}
            </Text>
          </View>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>ICC ({CANTONS[canton].name})</Text>
            <Text style={[styles.resultValue, { color: Colors.error }]}>
              CHF {formatNumber(icc)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={[styles.resultRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total impôts</Text>
            <Text style={styles.totalValue}>CHF {formatNumber(totalTax)}</Text>
          </View>
          
          <View style={styles.effectiveRate}>
            <Text style={styles.effectiveRateLabel}>Taux effectif</Text>
            <Text style={styles.effectiveRateValue}>{effectiveTaxRate.toFixed(1)}%</Text>
          </View>
        </Card>

        {/* Canton Ranking Toggle */}
        <TouchableOpacity
          style={styles.rankingToggle}
          onPress={() => setShowCantonRanking(!showCantonRanking)}
        >
          <Ionicons name="podium" size={20} color={Colors.primary} />
          <Text style={styles.rankingToggleText}>
            {showCantonRanking ? 'Masquer' : 'Voir'} le classement des cantons
          </Text>
          <Ionicons
            name={showCantonRanking ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.primary}
          />
        </TouchableOpacity>

        {/* Canton Ranking */}
        {showCantonRanking && (
          <Card style={styles.rankingCard}>
            <Text style={styles.rankingTitle}>🏆 Classement par impôts (moins cher en haut)</Text>
            {cantonRanking.map((c, idx) => (
              <TouchableOpacity
                key={c.code}
                style={[
                  styles.rankingItem,
                  canton === c.code && styles.rankingItemSelected,
                ]}
                onPress={() => setCanton(c.code)}
              >
                <View style={styles.rankingPosition}>
                  <Text style={[
                    styles.rankingNumber,
                    idx < 3 && { color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32' },
                  ]}>
                    #{idx + 1}
                  </Text>
                </View>
                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingName}>{c.name} ({c.code})</Text>
                  <Text style={styles.rankingRate}>Taux: {c.taxRate}%</Text>
                </View>
                <View style={styles.rankingTax}>
                  <Text style={styles.rankingTaxValue}>CHF {formatNumber(c.totalTax)}</Text>
                  <Text style={styles.rankingLamal}>LAMal: {c.lamalPremium}/m</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Tips */}
        <Card style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Conseils d'optimisation</Text>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.tipText}>
              Cotisez au maximum au 3ème pilier (CHF {formatNumber(maxPillar3a)}) pour réduire vos impôts
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.tipText}>
              Comparez les primes LAMal - elles varient fortement entre cantons
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.tipText}>
              Zoug et Schwytz offrent les taux d'imposition les plus bas de Suisse
            </Text>
          </View>
        </Card>

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
  cantonCard: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.sm,
  },
  cantonGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cantonChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cantonChipSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  cantonChipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  cantonChipTextSelected: {
    color: Colors.primary,
  },
  cantonInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  cantonName: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  cantonRate: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  sliderCard: {
    marginBottom: Spacing.md,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sliderLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  sliderValue: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderRangeText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  savingsHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: `${Colors.success}15`,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  savingsText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  statusCard: {
    marginBottom: Spacing.md,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  statusButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  statusButtonTextSelected: {
    color: Colors.primary,
  },
  resultsCard: {
    marginBottom: Spacing.md,
  },
  resultsTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  resultRowHighlight: {
    backgroundColor: Colors.card,
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  resultLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  resultLabelBold: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  resultValue: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  resultValueBold: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: Spacing.sm,
  },
  totalRow: {
    paddingVertical: Spacing.md,
  },
  totalLabel: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  totalValue: {
    color: Colors.error,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
  },
  effectiveRate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}15`,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  effectiveRateLabel: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  effectiveRateValue: {
    color: Colors.primary,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
  },
  rankingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  rankingToggleText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  rankingCard: {
    marginBottom: Spacing.md,
  },
  rankingTitle: {
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
  rankingItemSelected: {
    backgroundColor: `${Colors.primary}10`,
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  rankingPosition: {
    width: 40,
  },
  rankingNumber: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  rankingInfo: {
    flex: 1,
  },
  rankingName: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  rankingRate: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  rankingTax: {
    alignItems: 'flex-end',
  },
  rankingTaxValue: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  rankingLamal: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  tipsCard: {
    marginBottom: Spacing.md,
  },
  tipsTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
});
