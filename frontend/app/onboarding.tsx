/**
 * BUDGY - Onboarding Screen (i18n)
 * Multi-step questionnaire to personalize the experience
 */

import React, { useState, useRef, useMemo } from 'react';
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
import { CANTONS, CURRENCIES, getCantonName, type CantonCode } from '../src/data/swiss-data';
import { Button } from '../src/components/ui';
import { useTranslation } from '../src/hooks/useTranslation';
import type { HouseholdType } from '../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const { t, lang } = useTranslation();

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

  // Localized data
  const SLIDES = useMemo(() => [
    { emoji: '⚡', title: t('onboarding.slide1Title'), description: t('onboarding.slide1Desc'), color: Colors.primary },
    { emoji: '🇨🇭', title: t('onboarding.slide2Title'), description: t('onboarding.slide2Desc'), color: Colors.success },
    { emoji: '🤖', title: t('onboarding.slide3Title'), description: t('onboarding.slide3Desc'), color: Colors.warning },
    { emoji: '🚀', title: t('onboarding.slide4Title'), description: t('onboarding.slide4Desc'), color: Colors.purple },
  ], [t]);

  const GOALS = useMemo(() => [
    { id: 'house', emoji: '🏠', label: t('onboarding.goalHouse') },
    { id: 'fire', emoji: '🔥', label: t('onboarding.goalFire') },
    { id: 'travel', emoji: '✈️', label: t('onboarding.goalTravel') },
    { id: 'debt', emoji: '💳', label: t('onboarding.goalDebt') },
    { id: 'invest', emoji: '📈', label: t('onboarding.goalInvest') },
    { id: 'save', emoji: '💰', label: t('onboarding.goalSave') },
    { id: 'taxes', emoji: '📑', label: t('onboarding.goalTaxes') },
    { id: 'lamal', emoji: '🏥', label: t('onboarding.goalLamal') },
  ], [t]);

  const HOUSEHOLDS: { id: HouseholdType; emoji: string; label: string; description: string }[] = useMemo(() => [
    { id: 'single', emoji: '👤', label: t('onboarding.hSingle'), description: t('onboarding.hSingleDesc') },
    { id: 'couple', emoji: '👫', label: t('onboarding.hCouple'), description: t('onboarding.hCoupleDesc') },
    { id: 'family', emoji: '👨‍👩‍👧', label: t('onboarding.hFamily'), description: t('onboarding.hFamilyDesc') },
    { id: 'single_parent', emoji: '👩‍👦', label: t('onboarding.hSingleParent'), description: t('onboarding.hSingleParentDesc') },
  ], [t]);

  const EMPLOYMENT_TYPES = useMemo(() => [
    { id: 'employee' as const, emoji: '💼', label: t('onboarding.empSalaried') },
    { id: 'self_employed' as const, emoji: '🛠️', label: t('onboarding.empSelf') },
    { id: 'student' as const, emoji: '🎓', label: t('onboarding.empStudent') },
    { id: 'retired' as const, emoji: '🏖️', label: t('onboarding.empRetired') },
    { id: 'other' as const, emoji: '✨', label: t('onboarding.empOther') },
  ], [t]);

  const toggleGoal = (id: string) => {
    setGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const currentIndex = STEP_ORDER.indexOf(step);
  const totalConfigSteps = STEP_ORDER.length - 1;

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

    if (incomeNum > 0) {
      addIncome({
        id: `income_${Date.now()}`,
        title: employmentType === 'self_employed' ? t('onboarding.incomeFreelance') : t('onboarding.incomeRecurring'),
        amount: incomeNum,
        type: 'recurring',
        frequency: 'monthly',
        category: employmentType === 'self_employed' ? 'freelance' : 'salaire',
        color: '#10B981',
        icon: employmentType === 'self_employed' ? 'color-palette' : 'briefcase',
        createdAt: Date.now(),
      });
    }

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
            colors={['#34D399', '#22D3EE']}
            style={styles.smallLogo}
          >
            <Ionicons name="trending-up" size={16} color="#0E1530" />
          </LinearGradient>
          <Text style={styles.smallLogoText}>Budgy</Text>
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
            title={currentSlide < SLIDES.length - 1 ? `${t('common.next')} →` : `${t('common.start')} →`}
            onPress={handleNext}
            fullWidth
            size="lg"
          />
          {currentSlide < SLIDES.length - 1 && (
            <TouchableOpacity style={styles.skipButton} onPress={handleSkipSlides}>
              <Text style={styles.skipText}>{t('onboarding.skipIntro')}</Text>
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
            <Text style={styles.stepTitle}>{t('onboarding.cantonTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.cantonSub')}</Text>
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
                    {getCantonName(code as CantonCode, lang)}
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
            <Text style={styles.stepTitle}>{t('onboarding.currencyTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.currencySub')}</Text>
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
            <Text style={styles.stepTitle}>{t('onboarding.employmentTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.employmentSub')}</Text>
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
            <Text style={styles.stepTitle}>{t('onboarding.incomeTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.incomeSub', { c: currency })}</Text>
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
              <Text style={styles.incomeSuffix}>{t('onboarding.incomeMonth')}</Text>
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
              <Text style={styles.infoCardText}>{t('onboarding.privacy')}</Text>
            </View>
          </>
        )}

        {/* HOUSEHOLD */}
        {step === 'household' && (
          <>
            <Text style={styles.stepEmoji}>🏠</Text>
            <Text style={styles.stepTitle}>{t('onboarding.householdTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.householdSub')}</Text>
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
                <Text style={styles.childrenLabel}>{t('onboarding.childrenLabel')}</Text>
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
            <Text style={styles.stepTitle}>{t('onboarding.goalsTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.goalsSub')}</Text>
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
          title={step === 'goals' ? `${t('common.finish')} ✓` : `${t('common.continue')} →`}
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

  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
});
