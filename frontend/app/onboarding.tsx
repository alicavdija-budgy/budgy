/**
 * GUARDIAN MONEY CHF - Onboarding Screen
 * 4 slides + canton selection + currency choice
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useStore } from '../src/stores/useStore';
import { CANTONS, CURRENCIES, type CantonCode } from '../src/data/swiss-data';
import { Button } from '../src/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '⚡',
    title: 'Votre argent, enfin maîtrisé',
    description: 'Guardian centralise revenus, dépenses, épargne et patrimoine en un seul endroit.',
    color: Colors.primary,
  },
  {
    emoji: '🎯',
    title: 'Objectifs & budgets',
    description: 'Définissez vos projets d\'\u00e9pargne, gérez vos budgets par catégorie et suivez votre progression.',
    color: Colors.success,
  },
  {
    emoji: '📊',
    title: 'IA & rapports',
    description: 'Insights personnalisés, prévisions et conseils basés sur vos vraies données financières.',
    color: Colors.warning,
  },
  {
    emoji: '🚀',
    title: 'Prêt à commencer !',
    description: 'Personnalisez votre profil pour une expérience sur mesure.',
    color: Colors.purple,
  },
];

const GOALS = [
  { id: 'house', emoji: '🏠', label: 'Acheter un bien' },
  { id: 'fire', emoji: '🔥', label: 'Retraite anticipée' },
  { id: 'travel', emoji: '✈️', label: 'Voyager plus' },
  { id: 'debt', emoji: '💳', label: 'Liquider mes dettes' },
  { id: 'invest', emoji: '📈', label: 'Investir' },
  { id: 'save', emoji: '💰', label: 'Épargner plus' },
];

const MAIN_CANTONS: CantonCode[] = ['ZH', 'BE', 'VD', 'GE', 'ZG', 'LU', 'BS', 'AG', 'FR', 'TI', 'VS', 'NE', 'GR', 'SG', 'SZ'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { setPreferences } = useStore();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [canton, setCanton] = useState<CantonCode>('VD');
  const [currency, setCurrency] = useState<'CHF' | 'EUR' | 'USD'>('CHF');
  const [goals, setGoals] = useState<string[]>([]);

  const flatListRef = useRef<FlatList>(null);

  const toggleGoal = (id: string) => {
    setGoals(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      flatListRef.current?.scrollToIndex({ index: nextSlide, animated: true });
    } else {
      // Go to configuration
      setCurrentSlide(SLIDES.length);
    }
  };

  const handleSkip = () => {
    setCurrentSlide(SLIDES.length);
  };

  const handleFinish = () => {
    setPreferences({
      onboarded: true,
      canton,
      currency,
    });
  };

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => (
    <View style={styles.slide}>
      <View style={[styles.emojiContainer, { backgroundColor: `${item.color}20` }]}>
        <Text style={styles.emoji}>{item.emoji}</Text>
      </View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  );

  // Configuration screen
  if (currentSlide >= SLIDES.length) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <ScrollView
          style={styles.configScroll}
          contentContainerStyle={styles.configContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.configHeader}>
            <LinearGradient
              colors={Colors.gradientPrimary as [string, string]}
              style={styles.configLogo}
            >
              <Ionicons name="flash" size={24} color={Colors.text} />
            </LinearGradient>
            <Text style={styles.configTitle}>Bienvenue sur Guardian</Text>
            <Text style={styles.configSubtitle}>Personnalisez votre expérience</Text>
          </View>

          {/* Canton Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Canton de résidence</Text>
            <View style={styles.cantonGrid}>
              {MAIN_CANTONS.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.cantonItem,
                    canton === code && styles.cantonItemSelected,
                  ]}
                  onPress={() => setCanton(code)}
                >
                  <Text style={[
                    styles.cantonCode,
                    canton === code && styles.cantonCodeSelected,
                  ]}>
                    {code}
                  </Text>
                  <Text style={[
                    styles.cantonName,
                    canton === code && styles.cantonNameSelected,
                  ]}>
                    {CANTONS[code].name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Currency Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Devise principale</Text>
            <View style={styles.currencyGrid}>
              {CURRENCIES.slice(0, 4).map((cur) => (
                <TouchableOpacity
                  key={cur.code}
                  style={[
                    styles.currencyItem,
                    currency === cur.code && styles.currencyItemSelected,
                  ]}
                  onPress={() => setCurrency(cur.code as any)}
                >
                  <Text style={styles.currencyFlag}>{cur.flag}</Text>
                  <Text style={[
                    styles.currencyCode,
                    currency === cur.code && styles.currencyCodeSelected,
                  ]}>
                    {cur.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Goals Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vos objectifs</Text>
            <View style={styles.goalsGrid}>
              {GOALS.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.goalItem,
                    goals.includes(goal.id) && styles.goalItemSelected,
                  ]}
                  onPress={() => toggleGoal(goal.id)}
                >
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <Text style={[
                    styles.goalLabel,
                    goals.includes(goal.id) && styles.goalLabelSelected,
                  ]}>
                    {goal.label}
                  </Text>
                  {goals.includes(goal.id) && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={Colors.primary}
                      style={styles.goalCheck}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Button
            title="Commencer →"
            onPress={handleFinish}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.xl, marginBottom: insets.bottom + 20 }}
          />
        </ScrollView>
      </View>
    );
  }

  // Slides screen
  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* Logo */}
      <View style={styles.topLogo}>
        <LinearGradient
          colors={Colors.gradientPrimary as [string, string]}
          style={styles.smallLogo}
        >
          <Ionicons name="flash" size={16} color={Colors.text} />
        </LinearGradient>
        <Text style={styles.smallLogoText}>GUARDIAN</Text>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.slidesList}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((slide, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => {
              setCurrentSlide(i);
              flatListRef.current?.scrollToIndex({ index: i, animated: true });
            }}
          >
            <View
              style={[
                styles.dot,
                {
                  width: currentSlide === i ? 24 : 8,
                  backgroundColor: currentSlide === i ? slide.color : Colors.textTertiary,
                },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Buttons */}
      <View style={[styles.buttons, { paddingBottom: insets.bottom + 20 }]}>
        <Button
          title={currentSlide < SLIDES.length - 1 ? 'Suivant →' : 'Configurer →'}
          onPress={handleNext}
          fullWidth
          size="lg"
        />
        {currentSlide < SLIDES.length - 1 && (
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  smallLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallLogoText: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.black,
    letterSpacing: 1,
  },
  slidesList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  emojiContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  emoji: {
    fontSize: 56,
  },
  slideTitle: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  slideDescription: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.xl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    paddingHorizontal: Spacing.xl,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  skipText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  // Configuration styles
  configScroll: {
    flex: 1,
  },
  configContent: {
    padding: Spacing.xl,
  },
  configHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  configLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  configTitle: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  configSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.md,
  },
  cantonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  cantonItem: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  cantonItemSelected: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: `${Colors.primary}50`,
  },
  cantonCode: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  cantonCodeSelected: {
    color: Colors.primary,
  },
  cantonName: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  cantonNameSelected: {
    color: Colors.primaryLight,
  },
  currencyGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  currencyItem: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  currencyItemSelected: {
    backgroundColor: `${Colors.success}15`,
    borderColor: `${Colors.success}40`,
  },
  currencyFlag: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  currencyCode: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  currencyCodeSelected: {
    color: Colors.success,
  },
  goalsGrid: {
    gap: Spacing.sm,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  goalItemSelected: {
    backgroundColor: `${Colors.primary}15`,
    borderColor: `${Colors.primary}40`,
  },
  goalEmoji: {
    fontSize: 24,
  },
  goalLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
  goalLabelSelected: {
    color: Colors.text,
    fontWeight: FontWeights.semibold,
  },
  goalCheck: {
    marginLeft: 'auto',
  },
});
