/**
 * BUDGY - Coach Predict IA
 * Premium redesign: glass-morphism cards, gradient hero, sparkles animations,
 * animated insights, floating CTA, pill-style tabs.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { formatNumber, pct, predictMonthlyExpenses } from '../../src/utils/calculations';

type Tab = 'predictions' | 'alerts' | 'cashflow' | 'insights' | 'coach';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: SCREEN_W } = Dimensions.get('window');

export default function PredictScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, transactions, incomes, budgets, chatHistory, addChatMessage, user } = useStore();
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<Tab>('predictions');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const CUR = preferences.currency;
  const dayOfMonth = new Date().getDate();

  // Pulse animation for the AI sparkle icon
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.12]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.6, 1]),
  }));

  const categoryPredictions = useMemo(() => {
    const categories = ['courses', 'restaurant', 'loisirs', 'shopping', 'transport'];
    return categories.map(cat => {
      const catTx = transactions.filter(t => t.category === cat);
      const currentSpent = catTx.reduce((sum, t) => sum + t.amount, 0);
      const prediction = predictMonthlyExpenses(
        [{ month: 'prev', amount: currentSpent * 0.9, category: cat }],
        currentSpent,
        dayOfMonth
      );
      const budget = budgets.find(b => b.category === cat);
      return { category: cat, currentSpent, ...prediction, budget: budget?.limit || 0 };
    });
  }, [transactions, budgets, dayOfMonth]);

  const totalPredicted = categoryPredictions.reduce((sum, p) => sum + p.predicted, 0);
  const monthlyIncome = incomes.filter(i => i.type === 'recurring').reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = transactions.reduce((sum, t) => sum + t.amount, 0);
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - totalPredicted) / monthlyIncome * 100) : 0;
  const netSavings = monthlyIncome - totalPredicted;

  // Trend health (-100 to 100)
  const trendScore = Math.max(-100, Math.min(100, savingsRate));
  const trendColor = trendScore > 25 ? '#10B981' : trendScore > 10 ? '#F59E0B' : trendScore > 0 ? '#FB923C' : '#EF4444';
  const trendLabel = trendScore > 25 ? 'Excellent' : trendScore > 10 ? 'Bien' : trendScore > 0 ? 'À surveiller' : 'Risque';

  // Alerts
  const alerts = useMemo(() => {
    const result: { id: string; title: string; message: string; severity: 'low' | 'medium' | 'high'; icon: string }[] = [];
    categoryPredictions.forEach(p => {
      if (p.budget > 0 && p.predicted > p.budget) {
        result.push({
          id: `a_${p.category}`, title: `Budget ${getCategoryName(p.category)} dépassé`,
          message: `Prévu: ${formatNumber(p.predicted)} / Budget: ${formatNumber(p.budget)}`,
          severity: p.predicted > p.budget * 1.3 ? 'high' : 'medium', icon: 'warning',
        });
      }
    });
    if (totalPredicted > monthlyIncome * 0.8 && monthlyIncome > 0) {
      result.push({
        id: 'a_income', title: 'Dépenses élevées',
        message: `${pct(totalPredicted, monthlyIncome)}% de vos revenus ce mois`,
        severity: totalPredicted > monthlyIncome ? 'high' : 'medium', icon: 'trending-up',
      });
    }
    return result;
  }, [categoryPredictions, totalPredicted, monthlyIncome]);

  // Build financial context for AI
  const financialContext = useMemo(() => {
    return `Revenu mensuel: CHF ${formatNumber(monthlyIncome)}
Dépenses ce mois: CHF ${formatNumber(totalExpenses)} (${transactions.length} transactions)
Prévision fin de mois: CHF ${formatNumber(totalPredicted)}
Taux d'épargne: ${savingsRate.toFixed(0)}%
Canton: ${preferences.canton}
Devise: ${preferences.currency}
Objectifs d'épargne: ${useStore.getState().savingsGoals.length}
Budgets: ${budgets.map(b => `${getCategoryName(b.category)}: ${formatNumber(b.limit)}`).join(', ')}
Alertes actives: ${alerts.length}`;
  }, [monthlyIncome, totalExpenses, totalPredicted, savingsRate, preferences, budgets, alerts]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    const userMsg = message.trim();
    setMessage('');
    addChatMessage({ id: `msg_${Date.now()}`, role: 'user', content: userMsg, timestamp: Date.now() });
    setIsLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const response = await fetch(`${BACKEND_URL}/api/coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `budgy_${user?.id || 'anon'}`,
          message: userMsg,
          financial_context: financialContext,
        }),
      });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      addChatMessage({
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      });
    } catch {
      const fallbacks = [
        `Basé sur vos données, votre taux d'épargne est de ${savingsRate.toFixed(0)}%. ${savingsRate > 20 ? 'Excellent!' : 'Visez 20-30% pour l\'indépendance financière.'}`,
        `Vous avez ${alerts.length} alertes budget. Revoyez vos dépenses ${categoryPredictions[0]?.category || 'courses'} en priorité.`,
        `Conseil: Cotisez CHF 7'258 au 3ème pilier pour économiser jusqu'à 30% d'impôts dans le canton ${preferences.canton}.`,
      ];
      addChatMessage({
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  const quickQuestions = [
    { text: 'Comment réduire mes impôts ?', icon: '📑' },
    { text: 'Quelle franchise LAMal ?', icon: '🏥' },
    { text: 'Comment épargner plus ?', icon: '💰' },
    { text: 'Analyse mes dépenses', icon: '📊' },
  ];

  const tabs: { key: Tab; label: string; icon: string; gradient: [string, string] }[] = [
    { key: 'predictions', label: 'Prédire', icon: 'analytics', gradient: ['#22D3EE', '#0891B2'] },
    { key: 'alerts',      label: `Alertes${alerts.length ? ` ${alerts.length}` : ''}`, icon: 'warning', gradient: ['#F59E0B', '#EA580C'] },
    { key: 'cashflow',    label: 'Cash Flow', icon: 'swap-vertical', gradient: ['#A78BFA', '#7C3AED'] },
    { key: 'insights',    label: 'Conseils', icon: 'bulb', gradient: ['#FBBF24', '#F59E0B'] },
    { key: 'coach',       label: 'Coach IA', icon: 'sparkles', gradient: ['#34D399', '#22D3EE'] },
  ];

  // ------ RENDER ------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="predict-screen">
      {/* Background gradient orbs */}
      <View style={styles.bgOrbs} pointerEvents="none">
        <LinearGradient
          colors={['rgba(52,211,153,0.18)', 'transparent']}
          style={[styles.orb, { top: 60, right: -80 }]}
        />
        <LinearGradient
          colors={['rgba(139,92,246,0.14)', 'transparent']}
          style={[styles.orb, { top: 240, left: -100 }]}
        />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.titleRow}>
            <Animated.View style={pulseStyle}>
              <Ionicons name="sparkles" size={18} color="#FBBF24" />
            </Animated.View>
            <Text style={styles.title}>Coach Predict</Text>
          </View>
          <Text style={styles.subtitle}>Votre assistant financier IA</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs - pill style with gradient on active */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {tabs.map(t => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} activeOpacity={0.85}>
              {isActive ? (
                <LinearGradient
                  colors={t.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tab, styles.tabActive]}
                >
                  <Ionicons name={t.icon as any} size={15} color="#0E1530" />
                  <Text style={styles.tabActiveTxt}>{t.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.tab}>
                  <Ionicons name={t.icon as any} size={15} color={Colors.textTertiary} />
                  <Text style={styles.tabTxt}>{t.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Coach IA Tab */}
      {activeTab === 'coach' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
            {chatHistory.length === 0 && (
              <Animated.View entering={FadeIn.duration(500)} style={styles.aiIntro}>
                <LinearGradient
                  colors={['rgba(52,211,153,0.2)', 'rgba(34,211,238,0.05)']}
                  style={styles.aiAvatarBig}
                >
                  <Animated.View style={pulseStyle}>
                    <Ionicons name="sparkles" size={42} color="#FBBF24" />
                  </Animated.View>
                </LinearGradient>
                <Text style={styles.aiTitle}>Coach IA Budgy</Text>
                <Text style={styles.aiSub}>
                  Posez vos questions sur vos finances suisses.{'\n'}Je connais vos données et le système 🇨🇭
                </Text>
                <View style={styles.quickGrid}>
                  {quickQuestions.map((q, i) => (
                    <Animated.View key={i} entering={FadeInDown.delay(i * 100)}>
                      <TouchableOpacity style={styles.quickCard} onPress={() => setMessage(q.text)}>
                        <Text style={styles.quickEmoji}>{q.icon}</Text>
                        <Text style={styles.quickTxt}>{q.text}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            )}

            {chatHistory.map(msg => (
              <Animated.View
                key={msg.id}
                entering={FadeInDown.duration(300)}
                style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.aiBadgeMini}>
                    <Ionicons name="sparkles" size={11} color="#FBBF24" />
                    <Text style={styles.aiBadgeMiniTxt}>Budgy IA</Text>
                  </View>
                )}
                <Text style={[styles.bubbleTxt, msg.role === 'user' && { color: '#0E1530' }]}>
                  {msg.content}
                </Text>
              </Animated.View>
            ))}

            {isLoading && (
              <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
                <ActivityIndicator size="small" color="#FBBF24" />
                <Text style={styles.typingTxt}>Analyse en cours...</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              style={styles.chatInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Posez votre question..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !message.trim() && { opacity: 0.4 }]}
              onPress={handleSendMessage}
              disabled={!message.trim() || isLoading}
            >
              <LinearGradient
                colors={['#34D399', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendInner}
              >
                <Ionicons name="send" size={18} color="#0E1530" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* HERO — gauge of financial health */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <LinearGradient
              colors={['rgba(15,23,42,0.7)', 'rgba(15,23,42,0.3)']}
              style={styles.hero}
            >
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroLabel}>Prévision fin de mois</Text>
                  <Text style={styles.heroAmount}>{CUR} {formatNumber(totalPredicted)}</Text>
                </View>
                <View style={[styles.healthBadge, { backgroundColor: `${trendColor}25`, borderColor: trendColor }]}>
                  <View style={[styles.healthDot, { backgroundColor: trendColor }]} />
                  <Text style={[styles.healthLabel, { color: trendColor }]}>{trendLabel}</Text>
                </View>
              </View>

              {/* Health bar (savings rate) */}
              <View style={styles.gaugeRow}>
                <Text style={styles.gaugeLabel}>Taux d'épargne</Text>
                <Text style={[styles.gaugeValue, { color: trendColor }]}>{savingsRate.toFixed(0)}%</Text>
              </View>
              <View style={styles.gaugeBar}>
                <LinearGradient
                  colors={[trendColor, `${trendColor}80`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.gaugeFill, { width: `${Math.max(0, Math.min(100, savingsRate))}%` }]}
                />
              </View>
              <Text style={styles.gaugeHint}>Cible recommandée: 20-30%</Text>

              <View style={styles.heroFooter}>
                <View style={styles.heroStat}>
                  <Ionicons name="arrow-up" size={14} color="#10B981" />
                  <Text style={styles.heroStatLabel}>Revenus</Text>
                  <Text style={styles.heroStatValue}>{CUR} {formatNumber(monthlyIncome)}</Text>
                </View>
                <View style={styles.heroSep} />
                <View style={styles.heroStat}>
                  <Ionicons name="arrow-down" size={14} color="#EF4444" />
                  <Text style={styles.heroStatLabel}>Dépenses</Text>
                  <Text style={styles.heroStatValue}>{CUR} {formatNumber(totalPredicted)}</Text>
                </View>
                <View style={styles.heroSep} />
                <View style={styles.heroStat}>
                  <Ionicons name="wallet" size={14} color={trendColor} />
                  <Text style={styles.heroStatLabel}>Net</Text>
                  <Text style={[styles.heroStatValue, { color: netSavings >= 0 ? '#10B981' : '#EF4444' }]}>
                    {netSavings >= 0 ? '+' : ''}{CUR} {formatNumber(Math.abs(netSavings))}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* CTA - Ask AI */}
          <Animated.View entering={FadeInDown.delay(150)}>
            <TouchableOpacity onPress={() => setActiveTab('coach')} activeOpacity={0.85}>
              <LinearGradient
                colors={['rgba(52,211,153,0.18)', 'rgba(34,211,238,0.08)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.askAiCard}
              >
                <Animated.View style={[styles.askAiIcon, pulseStyle]}>
                  <Ionicons name="sparkles" size={22} color="#FBBF24" />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.askAiTitle}>Demandez à l'IA</Text>
                  <Text style={styles.askAiSub}>"Comment optimiser mon budget ce mois ?"</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* PREDICTIONS Tab */}
          {activeTab === 'predictions' && (
            <>
              <Text style={styles.sectionTitle}>📊 Catégories</Text>
              <Text style={styles.sectionSub}>Prévision fin de mois par catégorie · Jour {dayOfMonth}/30</Text>
              {categoryPredictions.map((p, idx) => {
                const overBudget = p.budget > 0 && p.predicted > p.budget;
                const progress = p.budget > 0 ? Math.min(100, (p.predicted / p.budget) * 100) : 0;
                return (
                  <Animated.View key={p.category} entering={FadeInDown.delay(idx * 60)}>
                    <View style={[styles.predCard, overBudget && { borderColor: 'rgba(239,68,68,0.4)' }]}>
                      <View style={styles.predHead}>
                        <CategoryIcon category={p.category} size="sm" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.predName}>{getCategoryName(p.category)}</Text>
                          <Text style={styles.predConfidence}>Confiance {Math.round((p.confidence || 0.5) * 100)}%</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.predAmount}>{CUR} {formatNumber(p.predicted)}</Text>
                          <Text style={styles.predCurrent}>maintenant: {formatNumber(p.currentSpent)}</Text>
                        </View>
                      </View>
                      {p.budget > 0 && (
                        <>
                          <View style={styles.predBar}>
                            <LinearGradient
                              colors={overBudget ? ['#EF4444', '#FCA5A5'] : ['#34D399', '#22D3EE']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={[styles.predBarFill, { width: `${progress}%` }]}
                            />
                          </View>
                          <Text style={[styles.predBudget, overBudget && { color: '#EF4444' }]}>
                            {overBudget ? '⚠️ ' : ''}Budget {CUR} {formatNumber(p.budget)} · {Math.round(progress)}%
                          </Text>
                        </>
                      )}
                    </View>
                  </Animated.View>
                );
              })}
            </>
          )}

          {/* ALERTS Tab */}
          {activeTab === 'alerts' && (
            <>
              <Text style={styles.sectionTitle}>⚠️ Alertes</Text>
              <Text style={styles.sectionSub}>Anomalies détectées dans vos finances</Text>
              {alerts.length === 0 ? (
                <View style={styles.emptyOk}>
                  <LinearGradient
                    colors={['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.05)']}
                    style={styles.emptyOkIcon}
                  >
                    <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                  </LinearGradient>
                  <Text style={styles.emptyOkTitle}>Tout va bien ! 🎉</Text>
                  <Text style={styles.emptyOkSub}>Aucune alerte budget pour le moment</Text>
                </View>
              ) : (
                alerts.map((a, idx) => {
                  const isHigh = a.severity === 'high';
                  const color = isHigh ? '#EF4444' : '#F59E0B';
                  return (
                    <Animated.View key={a.id} entering={FadeInDown.delay(idx * 60)}>
                      <View style={[styles.alertCard, { borderColor: `${color}40` }]}>
                        <View style={[styles.alertIcon, { backgroundColor: `${color}20` }]}>
                          <Ionicons name={a.icon as any} size={22} color={color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.alertTitle}>{a.title}</Text>
                          <Text style={styles.alertMsg}>{a.message}</Text>
                        </View>
                        <View style={[styles.severityPill, { backgroundColor: `${color}20`, borderColor: color }]}>
                          <Text style={[styles.severityTxt, { color }]}>{isHigh ? '!' : '?'}</Text>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })
              )}
            </>
          )}

          {/* CASHFLOW Tab */}
          {activeTab === 'cashflow' && (
            <>
              <Text style={styles.sectionTitle}>💰 Cash Flow Mensuel</Text>
              <Text style={styles.sectionSub}>Flux entrants vs sortants</Text>
              <View style={styles.cfMain}>
                <Animated.View entering={FadeInDown.delay(60)}>
                  <LinearGradient
                    colors={['rgba(16,185,129,0.18)', 'rgba(16,185,129,0.04)']}
                    style={styles.cfBig}
                  >
                    <View style={styles.cfBigIcon}><Ionicons name="arrow-up" size={20} color="#10B981" /></View>
                    <Text style={styles.cfBigLabel}>Entrées</Text>
                    <Text style={[styles.cfBigAmount, { color: '#10B981' }]}>+{CUR} {formatNumber(monthlyIncome)}</Text>
                  </LinearGradient>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(120)}>
                  <LinearGradient
                    colors={['rgba(239,68,68,0.18)', 'rgba(239,68,68,0.04)']}
                    style={styles.cfBig}
                  >
                    <View style={styles.cfBigIcon}><Ionicons name="arrow-down" size={20} color="#EF4444" /></View>
                    <Text style={styles.cfBigLabel}>Sorties prévues</Text>
                    <Text style={[styles.cfBigAmount, { color: '#EF4444' }]}>-{CUR} {formatNumber(totalPredicted)}</Text>
                  </LinearGradient>
                </Animated.View>
              </View>

              <Animated.View entering={FadeInDown.delay(180)}>
                <LinearGradient
                  colors={netSavings >= 0 ? ['rgba(16,185,129,0.25)', 'rgba(34,211,238,0.1)'] : ['rgba(239,68,68,0.2)', 'rgba(252,165,165,0.05)']}
                  style={styles.cfNet}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cfNetLabel}>Solde net du mois</Text>
                    <Text style={[styles.cfNetAmount, { color: netSavings >= 0 ? '#10B981' : '#EF4444' }]}>
                      {netSavings >= 0 ? '+' : ''}{CUR} {formatNumber(Math.abs(netSavings))}
                    </Text>
                    <Text style={styles.cfNetSub}>
                      {netSavings >= 0
                        ? `→ Économies projetées · épargne ${savingsRate.toFixed(0)}%`
                        : `⚠️ Découvert prévu · ajustez vos dépenses`}
                    </Text>
                  </View>
                  <Ionicons
                    name={netSavings >= 0 ? 'trending-up' : 'trending-down'}
                    size={42}
                    color={netSavings >= 0 ? '#10B981' : '#EF4444'}
                  />
                </LinearGradient>
              </Animated.View>
            </>
          )}

          {/* INSIGHTS Tab */}
          {activeTab === 'insights' && (
            <>
              <Text style={styles.sectionTitle}>💡 Conseils personnalisés</Text>
              <Text style={styles.sectionSub}>Recommandations sur mesure pour vos finances</Text>
              {[
                {
                  icon: '📊',
                  title: `Taux d'épargne: ${savingsRate.toFixed(0)}%`,
                  desc: savingsRate > 20 ? 'Excellent ! Vous êtes sur la bonne voie pour atteindre vos objectifs.' : 'Visez 20-30% pour bâtir votre indépendance financière.',
                  color: savingsRate > 20 ? '#10B981' : '#F59E0B',
                  gradient: savingsRate > 20 ? ['rgba(16,185,129,0.18)', 'rgba(16,185,129,0.05)'] : ['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.05)'],
                },
                {
                  icon: '🎯',
                  title: alerts.length === 0 ? 'Budgets sous contrôle' : `${alerts.length} alerte${alerts.length > 1 ? 's' : ''} budget`,
                  desc: alerts.length === 0 ? 'Vos enveloppes sont respectées, continuez !' : `Attention à vos dépenses ${alerts[0]?.title?.split(' ').pop() || ''}`,
                  color: alerts.length === 0 ? '#10B981' : '#EF4444',
                  gradient: alerts.length === 0 ? ['rgba(16,185,129,0.15)', 'rgba(16,185,129,0.05)'] : ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)'],
                },
                {
                  icon: '💎',
                  title: '3ème pilier',
                  desc: 'Cotisez CHF 7\'258 max au pilier 3a pour économiser jusqu\'à 30% d\'impôts.',
                  color: '#A78BFA',
                  gradient: ['rgba(167,139,250,0.18)', 'rgba(167,139,250,0.05)'],
                },
                {
                  icon: '🏥',
                  title: 'LAMal · 30 novembre',
                  desc: 'Date limite de résiliation. Comparez les primes avec notre comparateur intégré.',
                  color: '#22D3EE',
                  gradient: ['rgba(34,211,238,0.18)', 'rgba(34,211,238,0.05)'],
                  cta: { label: 'Comparer', route: '/more/lamal-comparator' },
                },
              ].map((insight, idx) => (
                <Animated.View key={idx} entering={FadeInDown.delay(idx * 80)}>
                  <LinearGradient
                    colors={insight.gradient as [string, string]}
                    style={[styles.insightCard, { borderColor: `${insight.color}30` }]}
                  >
                    <Text style={styles.insightIcon}>{insight.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      <Text style={styles.insightDesc}>{insight.desc}</Text>
                      {insight.cta && (
                        <TouchableOpacity onPress={() => router.push(insight.cta!.route as any)} style={styles.insightCta}>
                          <Text style={[styles.insightCtaTxt, { color: insight.color }]}>{insight.cta.label}</Text>
                          <Ionicons name="chevron-forward" size={14} color={insight.color} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </LinearGradient>
                </Animated.View>
              ))}
            </>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Background gradient orbs
  bgOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '900' },
  subtitle: { color: Colors.textTertiary, fontSize: 11, marginTop: 2 },

  // Tabs
  tabsScroll: { paddingHorizontal: Spacing.md, marginBottom: Spacing.md, maxHeight: 50 },
  tabsContent: { gap: 8, paddingRight: Spacing.md },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  tabActive: { borderWidth: 0 },
  tabTxt: { color: Colors.textTertiary, fontSize: 13, fontWeight: '700' },
  tabActiveTxt: { color: '#0E1530', fontSize: 13, fontWeight: '900' },

  // Scroll content
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  // HERO
  hero: { borderRadius: 20, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.md },
  heroLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  heroAmount: { color: Colors.text, fontSize: 30, fontWeight: '900' },
  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  healthDot: { width: 7, height: 7, borderRadius: 4 },
  healthLabel: { fontSize: 11, fontWeight: '900' },
  gaugeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 },
  gaugeLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  gaugeValue: { fontSize: 22, fontWeight: '900' },
  gaugeBar: { height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 5, marginTop: 6, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 5 },
  gaugeHint: { color: Colors.textTertiary, fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatLabel: { color: Colors.textTertiary, fontSize: 10, marginTop: 2 },
  heroStatValue: { color: Colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  heroSep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.08)' },

  // CTA "Ask AI"
  askAiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: 16, marginBottom: Spacing.lg, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)' },
  askAiIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(251,191,36,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  askAiTitle: { color: Colors.text, fontSize: 14, fontWeight: '900' },
  askAiSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2, fontStyle: 'italic' },

  // Sections
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4, marginTop: Spacing.sm },
  sectionSub: { color: Colors.textTertiary, fontSize: 11, marginBottom: Spacing.md },

  // Predictions
  predCard: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 14, padding: Spacing.md, marginBottom: 10 },
  predHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  predName: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  predConfidence: { color: Colors.textTertiary, fontSize: 10, marginTop: 1 },
  predAmount: { color: Colors.text, fontSize: 15, fontWeight: '900' },
  predCurrent: { color: Colors.textTertiary, fontSize: 10, marginTop: 1 },
  predBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginVertical: 4 },
  predBarFill: { height: '100%', borderRadius: 3 },
  predBudget: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 4 },

  // Alerts
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderWidth: 1, borderRadius: 14, padding: Spacing.md, marginBottom: 10 },
  alertIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  alertMsg: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  severityPill: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  severityTxt: { fontSize: 14, fontWeight: '900' },
  emptyOk: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyOkIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  emptyOkTitle: { color: Colors.text, fontSize: 18, fontWeight: '900' },
  emptyOkSub: { color: Colors.textSecondary, fontSize: 13 },

  // Cashflow
  cfMain: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  cfBig: { flex: 1, padding: Spacing.md, borderRadius: 16, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cfBigIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  cfBigLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },
  cfBigAmount: { fontSize: 18, fontWeight: '900' },
  cfNet: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: Spacing.lg, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cfNetLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  cfNetAmount: { fontSize: 28, fontWeight: '900', marginTop: 2 },
  cfNetSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },

  // Insights
  insightCard: { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: 16, marginBottom: 10, borderWidth: 1 },
  insightIcon: { fontSize: 30 },
  insightTitle: { color: Colors.text, fontSize: 14, fontWeight: '900' },
  insightDesc: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  insightCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  insightCtaTxt: { fontSize: 12, fontWeight: '900' },

  // CHAT
  chatScroll: { flex: 1 },
  chatContent: { padding: Spacing.md, paddingBottom: 20 },
  aiIntro: { alignItems: 'center', marginBottom: Spacing.xl, marginTop: 20 },
  aiAvatarBig: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  aiTitle: { color: Colors.text, fontSize: 20, fontWeight: '900' },
  aiSub: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 24 },
  quickCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  quickEmoji: { fontSize: 16 },
  quickTxt: { color: Colors.text, fontSize: 12, fontWeight: '700' },

  bubble: { maxWidth: '85%', padding: Spacing.md, borderRadius: 18, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#34D399', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.cardBorder },
  aiBadgeMini: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(251,191,36,0.12)', alignSelf: 'flex-start' },
  aiBadgeMiniTxt: { color: '#FBBF24', fontSize: 10, fontWeight: '900' },
  bubbleTxt: { color: Colors.text, fontSize: 14, lineHeight: 21 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingTxt: { color: Colors.textSecondary, fontSize: 13 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Spacing.md, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder, backgroundColor: Colors.backgroundSecondary },
  chatInput: { flex: 1, backgroundColor: Colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: Colors.text, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: Colors.cardBorder },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  sendInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
