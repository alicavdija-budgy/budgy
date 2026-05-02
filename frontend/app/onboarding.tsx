/**
 * GUARDIAN MONEY CHF - Onboarding Screen
 * Multi-step questionnaire to personalize the experience
 * Steps: Intro slides -> Canton -> Currency -> Employment -> Income -> Household -> Goals -> Done
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
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../src/constants/theme';
import { useStore } from '../src/stores/useStore';
import { CANTONS, CURRENCIES, type CantonCode } from '../src/data/swiss-data';
import { Button } from '../src/components/ui';
import type { HouseholdType } from '../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '⚡',
    title: 'Votre argent, enfin maîtrisé',
    description: 'Budgy centralise revenus, dépenses, épargne et patrimoine en un seul endroit.',
    color: Colors.primary,
  },
  {
    emoji: '🇨🇭',
    title: 'Pensé pour la Suisse',
    description: 'LAMal, impôts cantonaux, 3ème pilier : tout est calibré pour les 26 cantons.',
    color: Colors.success,
  },
  {
    emoji: '🤖',
    title: 'IA & prévisions',
    description: 'Conseils personnalisés, prévisions de dépenses et optimisations fiscales intelligentes.',
    color: Colors.warning,
  },
  {
    emoji: '🚀',
    title: 'Prêt à commencer !',
    description: 'Répondez à quelques questions pour une expérience sur mesure.',
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
  { id: 'taxes', emoji: '📑', label: 'Optimiser mes impôts' },
  { id: 'lamal', emoji: '🏥', label: 'Réduire ma prime LAMal' },
];

const HOUSEHOLDS: { id: HouseholdType; emoji: string; label: string; description: string }[] = [
  { id: 'single', emoji: '👤', label: 'Célibataire', description: 'Je vis seul(e)' },
  { id: 'couple', emoji: '👫', label: 'En couple', description: 'Sans enfants' },
  { id: 'family', emoji: '👨‍👩‍👧', label: 'Famille', description: 'Couple avec enfants' },
  { id: 'single_parent', emoji: '👩‍👦', label: 'Parent solo', description: 'Seul(e) avec enfants' },
];

const EMPLOYMENT_TYPES = [
  { id: 'employee' as const, emoji: '💼', label: 'Salarié(e)' },
  { id: 'self_employed' as const, emoji: '🛠️', label: 'Indépendant(e)' },
  { id: 'student' as const, emoji: '🎓', label: 'Étudiant(e)' },
  { id: 'retired' as const, emoji: '🏖️', label: 'Retraité(e)' },
  { id: 'other' as const, emoji: '✨', label: 'Autre' },
];

// All 26 cantons sorted alphabetically
const ALL_CANTONS: CantonCode[] = Object.keys(CANTONS).sort() as CantonCode[];

type Step =
  | 'slides'
  | 'canton'
  | 'currency'
  | 'employment'
  | 'income'
  | 'household'
  | 'goals';

const STEP_ORDER: Step[] = [
  'slides',
  'canton',
  'currency',
  'employment',
  'income',
  'household',
  'goals',
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setPreferences, addIncome } = useStore();

  const [step, setStep] = useState<Step>('slides');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [canton, setCanton] = useState<CantonCode>('VD');
  const [currency, setCurrency] = useState<'CHF' | 'EUR' | 'USD'>('CHF');
  const [employmentType, setEmploymentType] = useState<
    'employee' | 'self_employed' | 'student' | 'retired' | 'other'
  >('employee');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [household, setHousehold] = useState<HouseholdType>('single');
  const [children, setChildren] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);

  const flatListRef = useRef<FlatList>(null);

  const toggleGoal = (id: string) => {
    setGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const currentIndex = STEP_ORDER.indexOf(step);
  const totalConfigSteps = STEP_ORDER.length - 1; // exclude slides from progress

  const handleNext = () => {
    if (step === 'slides') {
      if (currentSlide < SLIDES.length - 1) {
        const nextSlide = currentSlide + 1;
        setCurrentSlide(nextSlide);
        flatListRef.current?.scrollToIndex({ index: nextSlide, animated: true });
      } else {
        setStep('canton');
      }
      return;
    }

    const nextStepIndex = currentIndex + 1;
    if (nextStepIndex < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextStepIndex]);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (step === 'slides') {
      if (currentSlide > 0) {
        const prev = currentSlide - 1;
        setCurrentSlide(prev);
        flatListRef.current?.scrollToIndex({ index: prev, animated: true });
      }
      return;
    }
    if (currentIndex > 0) {
      setStep(STEP_ORDER[currentIndex - 1]);
    }
  };

  const handleSkipSlides = () => {
    setStep('canton');
  };

  const handleFinish = () => {
    const incomeNum = parseFloat(monthlyIncome.replace(',', '.')) || 0;

    // Save preferences
    setPreferences({
      onboarded: true,
      canton,
      currency,
      monthlyIncome: incomeNum,
      household,
      children,
      goals,
      employmentType,
    });

    // Create an initial income entry so dashboard looks right immediately
    if (incomeNum > 0) {
      addIncome({
        id: `income_${Date.now()}`,
        title: employmentType === 'self_employed' ? 'Revenu indépendant' : 'Salaire',
        amount: incomeNum,
        type: 'recurring',
        frequency: 'monthly',
        category: employmentType === 'self_employed' ? 'freelance' : 'salaire',
        color: '#10B981',
        icon: employmentType === 'self_employed' ? 'color-palette' : 'briefcase',
        createdAt: Date.now(),
      });
    }

    // Navigate to main app
    setTimeout(() => {
      try {
        router.replace('/(tabs)');
      } catch {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            window.location.assign('/');
          } catch {}
        }
      }
    }, 150);
  };

  const renderSlide = ({ item }: { item: (typeof SLIDES)[0] }) => (
    <View style={styles.slide}>
      <View style={[styles.emojiContainer, { backgroundColor: `${item.color}20` }]}>
        <Text style={styles.emoji}>{item.emoji}</Text>
      </View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  );

  const renderProgressBar = () => {
    if (step === 'slides') return null;
    const progress = ((currentIndex) / totalConfigSteps) * 100;
    return (
      <View style={styles.progressContainer}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.progressBar}>
          <LinearGradient
            colors={Colors.gradientPrimary as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${progress}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex}/{totalConfigSteps - 1}
        </Text>
      </View>
    );
  };

  // --------- SLIDES STEP ---------
  if (step === 'slides') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <View style={styles.topLogo}>
          <LinearGradient
            colors={Colors.gradientPrimary as [string, string]}
            style={styles.smallLogo}
          >
            <Ionicons name="flash" size={16} color={Colors.text} />
          </LinearGradient>
          <Text style={styles.smallLogoText}>GUARDIAN</Text>
        </View>

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
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        />

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

        <View style={[styles.buttons, { paddingBottom: insets.bottom + 20 }]}>
          <Button
            title={currentSlide < SLIDES.length - 1 ? 'Suivant →' : 'Commencer →'}
            onPress={handleNext}
            fullWidth
            size="lg"
          />
          {currentSlide < SLIDES.length - 1 && (
            <TouchableOpacity style={styles.skipButton} onPress={handleSkipSlides}>
              <Text style={styles.skipText}>Passer l'intro</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // --------- CONFIGURATION STEPS ---------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + 10 }]}
    >
      {renderProgressBar()}

      <ScrollView
        style={styles.configScroll}
        contentContainerStyle={styles.configContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* CANTON */}
        {step === 'canton' && (
          <>
            <Text style={styles.stepEmoji}>📍</Text>
            <Text style={styles.stepTitle}>Votre canton de résidence</Text>
            <Text style={styles.stepSubtitle}>
              Pour calculer correctement vos impôts, primes LAMal et subsides.
            </Text>
            <View style={styles.cantonGrid}>
              {ALL_CANTONS.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.cantonItem, canton === code && styles.cantonItemSelected]}
                  onPress={() => setCanton(code)}
                >
                  <Text
                    style={[styles.cantonCode, canton === code && styles.cantonCodeSelected]}
                  >
                    {code}
                  </Text>
                  <Text
                    style={[styles.cantonName, canton === code && styles.cantonNameSelected]}
                    numberOfLines={1}
                  >
                    {CANTONS[code].name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* CURRENCY */}
        {step === 'currency' && (
          <>
            <Text style={styles.stepEmoji}>💱</Text>
            <Text style={styles.stepTitle}>Devise principale</Text>
            <Text style={styles.stepSubtitle}>
              La devise utilisée dans toute l'application. Vous pourrez en changer plus tard.
            </Text>
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
                  <Text
                    style={[
                      styles.currencyCode,
                      currency === cur.code && styles.currencyCodeSelected,
                    ]}
                  >
                    {cur.code}
                  </Text>
                  <Text style={styles.currencyName}>{cur.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* EMPLOYMENT */}
        {step === 'employment' && (
          <>
            <Text style={styles.stepEmoji}>💼</Text>
            <Text style={styles.stepTitle}>Votre situation professionnelle</Text>
            <Text style={styles.stepSubtitle}>
              Pour adapter les suggestions fiscales (3ème pilier, TVA, etc.).
            </Text>
            <View style={styles.goalsGrid}>
              {EMPLOYMENT_TYPES.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[
                    styles.goalItem,
                    employmentType === emp.id && styles.goalItemSelected,
                  ]}
                  onPress={() => setEmploymentType(emp.id)}
                >
                  <Text style={styles.goalEmoji}>{emp.emoji}</Text>
                  <Text
                    style={[
                      styles.goalLabel,
                      employmentType === emp.id && styles.goalLabelSelected,
                    ]}
                  >
                    {emp.label}
                  </Text>
                  {employmentType === emp.id && (
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
          </>
        )}

        {/* INCOME */}
        {step === 'income' && (
          <>
            <Text style={styles.stepEmoji}>💰</Text>
            <Text style={styles.stepTitle}>Revenu mensuel net</Text>
            <Text style={styles.stepSubtitle}>
              En {currency}, approximatif. Utilisé pour calculer vos subsides LAMal, budgets et
              capacité d'épargne. Vous pouvez passer cette étape.
            </Text>
            <View style={styles.incomeBox}>
              <Text style={styles.incomeCurrency}>{currency}</Text>
              <TextInput
                style={styles.incomeInput}
                value={monthlyIncome}
                onChangeText={(t) => setMonthlyIncome(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="decimal-pad"
                maxLength={8}
              />
              <Text style={styles.incomeSuffix}>/ mois</Text>
            </View>

            <View style={styles.quickAmounts}>
              {[4000, 5500, 7000, 9000, 12000].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.quickChip,
                    monthlyIncome === String(amt) && styles.quickChipSelected,
                  ]}
                  onPress={() => setMonthlyIncome(String(amt))}
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      monthlyIncome === String(amt) && styles.quickChipTextSelected,
                    ]}
                  >
                    {amt.toLocaleString('fr-CH')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
              <Text style={styles.infoCardText}>
                Vos données restent privées. Aucun partage avec des tiers.
              </Text>
            </View>
          </>
        )}

        {/* HOUSEHOLD */}
        {step === 'household' && (
          <>
            <Text style={styles.stepEmoji}>🏠</Text>
            <Text style={styles.stepTitle}>Votre situation familiale</Text>
            <Text style={styles.stepSubtitle}>
              Détermine le modèle fiscal applicable et l'éligibilité aux subsides.
            </Text>
            <View style={styles.goalsGrid}>
              {HOUSEHOLDS.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.goalItem, household === h.id && styles.goalItemSelected]}
                  onPress={() => setHousehold(h.id)}
                >
                  <Text style={styles.goalEmoji}>{h.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.goalLabel,
                        household === h.id && styles.goalLabelSelected,
                      ]}
                    >
                      {h.label}
                    </Text>
                    <Text style={styles.householdDesc}>{h.description}</Text>
                  </View>
                  {household === h.id && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {(household === 'family' || household === 'single_parent') && (
              <View style={styles.childrenBox}>
                <Text style={styles.childrenLabel}>Nombre d'enfants à charge</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setChildren(Math.max(0, children - 1))}
                  >
                    <Ionicons name="remove" size={24} color={Colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{children}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => setChildren(Math.min(10, children + 1))}
                  >
                    <Ionicons name="add" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* GOALS */}
        {step === 'goals' && (
          <>
            <Text style={styles.stepEmoji}>🎯</Text>
            <Text style={styles.stepTitle}>Vos objectifs principaux</Text>
            <Text style={styles.stepSubtitle}>
              Sélectionnez ce qui compte pour vous. L'app s'adaptera à vos priorités.
            </Text>
            <View style={styles.goalsGrid}>
              {GOALS.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={[styles.goalItem, goals.includes(goal.id) && styles.goalItemSelected]}
                  onPress={() => toggleGoal(goal.id)}
                >
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <Text
                    style={[
                      styles.goalLabel,
                      goals.includes(goal.id) && styles.goalLabelSelected,
                    ]}
                  >
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
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={step === 'goals' ? 'Terminer ✓' : 'Continuer →'}
          onPress={handleNext}
          fullWidth
          size="lg"
        />
      </View>
    </KeyboardAvoidingView>
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

  // Progress bar
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.card,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    minWidth: 30,
    textAlign: 'right',
  },

  // Configuration layout
  configScroll: {
    flex: 1,
  },
  configContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  stepEmoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },

  // Canton grid
  cantonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  cantonItem: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minWidth: 80,
    alignItems: 'center',
  },
  cantonItemSelected: {
    backgroundColor: `${Colors.primary}25`,
    borderColor: Colors.primary,
  },
  cantonCode: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  cantonCodeSelected: {
    color: Colors.primaryLight,
  },
  cantonName: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  cantonNameSelected: {
    color: Colors.primaryLight,
  },

  // Currency
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  currencyItem: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  currencyItemSelected: {
    backgroundColor: `${Colors.success}15`,
    borderColor: Colors.success,
  },
  currencyFlag: {
    fontSize: 32,
    marginBottom: Spacing.xs,
  },
  currencyCode: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  currencyCodeSelected: {
    color: Colors.success,
  },
  currencyName: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },

  // Income
  incomeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  incomeCurrency: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
  },
  incomeInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    paddingVertical: Spacing.sm,
  },
  incomeSuffix: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  quickChip: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  quickChipSelected: {
    backgroundColor: `${Colors.primary}25`,
    borderColor: Colors.primary,
  },
  quickChipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  quickChipTextSelected: {
    color: Colors.primaryLight,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: `${Colors.success}10`,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  infoCardText: {
    flex: 1,
    color: Colors.successLight,
    fontSize: FontSizes.xs,
  },

  // Goals / Household
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
    borderColor: Colors.primary,
  },
  goalEmoji: {
    fontSize: 28,
  },
  goalLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  goalLabelSelected: {
    color: Colors.text,
  },
  goalCheck: {
    marginLeft: 'auto',
  },
  householdDesc: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },

  // Children counter
  childrenBox: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  childrenLabel: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    minWidth: 40,
    textAlign: 'center',
  },

  // Footer button
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
});
