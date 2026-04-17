/**
 * GUARDIAN MONEY CHF - Guardian Predict IA (with real LLM Coach)
 * AI predictions, alerts, cash flow, insights, and GPT-powered coach
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Badge, ProgressBar } from '../../src/components/ui';
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { DonutChart, MiniBarChart } from '../../src/components/Charts';
import { formatNumber, pct, predictMonthlyExpenses } from '../../src/utils/calculations';

type Tab = 'predictions' | 'alerts' | 'cashflow' | 'insights' | 'coach';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
    if (totalPredicted > monthlyIncome * 0.8) {
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

  // Send message to real AI coach
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
          session_id: `guardian_${user?.id || 'anon'}`,
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
      // Fallback to local response if API fails
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
    'Comment réduire mes impôts?',
    'Quelle franchise LAMal choisir?',
    'Comment épargner plus?',
    'Analyse mes dépenses',
  ];

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'predictions', label: 'Prédictions', icon: 'analytics' },
    { key: 'alerts', label: `Alertes${alerts.length ? ` (${alerts.length})` : ''}`, icon: 'warning' },
    { key: 'cashflow', label: 'Cash Flow', icon: 'swap-vertical' },
    { key: 'insights', label: 'Insights', icon: 'bulb' },
    { key: 'coach', label: 'Coach IA', icon: 'sparkles' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="predict-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Guardian Predict IA</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setActiveTab(t.key)}>
              <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? Colors.text : Colors.textTertiary} />
              <Text style={[styles.tabTxt, activeTab === t.key && styles.tabTxtOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Coach IA Tab */}
      {activeTab === 'coach' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
            {/* AI Intro */}
            {chatHistory.length === 0 && (
              <View style={styles.aiIntro}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="sparkles" size={36} color={Colors.warning} />
                </View>
                <Text style={styles.aiTitle}>Coach IA Guardian</Text>
                <Text style={styles.aiSub}>Posez vos questions financières. Je connais vos données et le système suisse.</Text>
                <View style={styles.quickRow}>
                  {quickQuestions.map((q, i) => (
                    <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => { setMessage(q); }}>
                      <Text style={styles.quickTxt}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Messages */}
            {chatHistory.map(msg => (
              <View key={msg.id} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                {msg.role === 'assistant' && (
                  <Ionicons name="sparkles" size={14} color={Colors.warning} style={{ marginBottom: 4 }} />
                )}
                <Text style={[styles.bubbleTxt, msg.role === 'user' && { color: '#fff' }]}>{msg.content}</Text>
              </View>
            ))}

            {isLoading && (
              <View style={[styles.bubble, styles.aiBubble]}>
                <ActivityIndicator size="small" color={Colors.warning} />
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
              <Ionicons name="send" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Predictions */}
          {activeTab === 'predictions' && (
            <>
              <Card style={styles.heroCard}>
                <Text style={styles.heroLabel}>Prévision fin de mois</Text>
                <Text style={styles.heroAmt}>{CUR} {formatNumber(totalPredicted)}</Text>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaTxt}>Jour {dayOfMonth}/30</Text>
                  <Badge text={`Confiance ${Math.round((categoryPredictions[0]?.confidence || 0.5) * 100)}%`} color={Colors.primary} />
                </View>
              </Card>
              {categoryPredictions.map(p => (
                <Card key={p.category} style={styles.predCard}>
                  <View style={styles.predRow}>
                    <CategoryIcon category={p.category} size="sm" />
                    <Text style={styles.predName}>{getCategoryName(p.category)}</Text>
                    <Text style={styles.predCurrent}>{formatNumber(p.currentSpent)}</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.textTertiary} />
                    <Text style={styles.predPredicted}>{formatNumber(p.predicted)}</Text>
                  </View>
                  {p.budget > 0 && <ProgressBar value={pct(p.predicted, p.budget)} color={p.predicted > p.budget ? Colors.error : Colors.success} height={5} />}
                </Card>
              ))}
            </>
          )}

          {/* Alerts */}
          {activeTab === 'alerts' && (
            <>
              {alerts.length === 0 ? (
                <Card style={styles.noAlerts}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                  <Text style={styles.noAlertsTxt}>Tout va bien!</Text>
                  <Text style={styles.noAlertsSub}>Aucune alerte budget</Text>
                </Card>
              ) : (
                alerts.map(a => (
                  <Card key={a.id} style={styles.alertCard} borderColor={a.severity === 'high' ? Colors.error : Colors.warning}>
                    <View style={styles.alertRow}>
                      <Ionicons name={a.icon as any} size={24} color={a.severity === 'high' ? Colors.error : Colors.warning} />
                      <View style={styles.alertContent}><Text style={styles.alertTitle}>{a.title}</Text><Text style={styles.alertMsg}>{a.message}</Text></View>
                    </View>
                  </Card>
                ))
              )}
            </>
          )}

          {/* Cash Flow */}
          {activeTab === 'cashflow' && (
            <Card style={styles.cfCard}>
              <Text style={styles.cfTitle}>Cash Flow Mensuel</Text>
              <View style={styles.cfGrid}>
                <View style={styles.cfItem}><Ionicons name="arrow-up-circle" size={28} color={Colors.success} /><Text style={styles.cfLabel}>Revenus</Text><Text style={[styles.cfAmt, { color: Colors.success }]}>+{formatNumber(monthlyIncome)}</Text></View>
                <View style={styles.cfItem}><Ionicons name="arrow-down-circle" size={28} color={Colors.error} /><Text style={styles.cfLabel}>Dépenses</Text><Text style={[styles.cfAmt, { color: Colors.error }]}>-{formatNumber(totalPredicted)}</Text></View>
                <View style={styles.cfItem}><Ionicons name="wallet" size={28} color={Colors.primary} /><Text style={styles.cfLabel}>Solde net</Text><Text style={[styles.cfAmt, { color: monthlyIncome - totalPredicted >= 0 ? Colors.success : Colors.error }]}>{monthlyIncome - totalPredicted >= 0 ? '+' : ''}{formatNumber(monthlyIncome - totalPredicted)}</Text></View>
              </View>
              <View style={styles.cfSavings}>
                <Text style={styles.cfSavingsLabel}>Taux d'épargne</Text>
                <Text style={[styles.cfSavingsVal, { color: savingsRate > 20 ? Colors.success : savingsRate > 10 ? Colors.warning : Colors.error }]}>{savingsRate.toFixed(0)}%</Text>
              </View>
            </Card>
          )}

          {/* Insights */}
          {activeTab === 'insights' && (
            <>
              {[
                { icon: '📊', title: `Taux d'épargne: ${savingsRate.toFixed(0)}%`, desc: savingsRate > 20 ? 'Excellent! Vous êtes sur la bonne voie.' : 'Visez 20-30% pour l\'indépendance financière.', color: savingsRate > 20 ? Colors.success : Colors.warning },
                { icon: '🎯', title: `${alerts.length} alertes budget`, desc: alerts.length === 0 ? 'Vos budgets sont sous contrôle!' : `Attention à vos dépenses ${alerts[0]?.title?.split(' ').pop() || ''}`, color: alerts.length === 0 ? Colors.success : Colors.error },
                { icon: '💡', title: '3ème pilier', desc: 'Cotisez CHF 7\'258 max pour économiser jusqu\'à 30% d\'impôts', color: Colors.primary },
                { icon: '🏥', title: 'LAMal', desc: 'Changez avant le 30 novembre. Consultez priminfo.admin.ch', color: Colors.info },
              ].map((insight, idx) => (
                <Card key={idx} style={styles.insightCard}>
                  <Text style={styles.insightIcon}>{insight.icon}</Text>
                  <View style={styles.insightContent}>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={[styles.insightDesc, { color: insight.color }]}>{insight.desc}</Text>
                  </View>
                </Card>
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  tabsScroll: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  tabOn: { backgroundColor: Colors.warning },
  tabTxt: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabTxtOn: { color: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  // Hero
  heroCard: { marginBottom: Spacing.lg, alignItems: 'center' },
  heroLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  heroAmt: { color: Colors.text, fontSize: FontSizes.hero, fontWeight: FontWeights.black },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  heroMetaTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  // Predictions
  predCard: { marginBottom: Spacing.sm },
  predRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  predName: { flex: 1, color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  predCurrent: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  predPredicted: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  // Alerts
  noAlerts: { alignItems: 'center', padding: Spacing.xxl },
  noAlertsTxt: { color: Colors.success, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.md },
  noAlertsSub: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  alertCard: { marginBottom: Spacing.md },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  alertContent: { flex: 1 },
  alertTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  alertMsg: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  // Cash Flow
  cfCard: { marginBottom: Spacing.lg },
  cfTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, textAlign: 'center', marginBottom: Spacing.lg },
  cfGrid: { flexDirection: 'row' },
  cfItem: { flex: 1, alignItems: 'center' },
  cfLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.xs },
  cfAmt: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  cfSavings: { alignItems: 'center', marginTop: Spacing.lg, backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.md },
  cfSavingsLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  cfSavingsVal: { fontSize: FontSizes.xxxl, fontWeight: FontWeights.black },
  // Insights
  insightCard: { marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center' },
  insightIcon: { fontSize: 32, marginRight: Spacing.md },
  insightContent: { flex: 1 },
  insightTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  insightDesc: { fontSize: FontSizes.sm },
  // Coach Chat
  chatScroll: { flex: 1 },
  chatContent: { padding: Spacing.lg, paddingBottom: 20 },
  aiIntro: { alignItems: 'center', marginBottom: Spacing.xl },
  aiAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: `${Colors.warning}15`, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  aiTitle: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  aiSub: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', marginTop: Spacing.sm, maxWidth: 300 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  quickBtn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  quickTxt: { color: Colors.primary, fontSize: FontSizes.sm },
  bubble: { maxWidth: '82%', padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  bubbleTxt: { color: Colors.text, fontSize: FontSizes.md, lineHeight: 22 },
  typingTxt: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginLeft: Spacing.sm },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.cardBorder, backgroundColor: Colors.backgroundSecondary },
  chatInput: { flex: 1, backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: Spacing.md, paddingRight: 50, color: Colors.text, fontSize: FontSizes.md, maxHeight: 100, borderWidth: 1, borderColor: Colors.cardBorder },
  sendBtn: { position: 'absolute', right: Spacing.lg + 8, bottom: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center' },
});
