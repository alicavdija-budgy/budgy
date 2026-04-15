/**
 * GUARDIAN MONEY CHF - Guardian Predict IA
 * AI-powered predictions, alerts, and coach
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Badge, ProgressBar } from '../../src/components/ui';
import { CategoryIcon, getCategoryName } from '../../src/components/CategoryIcon';
import { formatNumber, pct, predictMonthlyExpenses, detectAnomaly } from '../../src/utils/calculations';
import { EXPENSE_CATEGORIES } from '../../src/data/swiss-data';

type Tab = 'predictions' | 'alerts' | 'cashflow' | 'insights' | 'coach';

export default function PredictScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, transactions, incomes, budgets, chatHistory, addChatMessage } = useStore();

  const [activeTab, setActiveTab] = useState<Tab>('predictions');
  const [message, setMessage] = useState('');

  const CUR = preferences.currency;
  const dayOfMonth = new Date().getDate();

  // Calculate predictions by category
  const categoryPredictions = useMemo(() => {
    const categories = ['courses', 'restaurant', 'loisirs', 'shopping', 'transport'];
    return categories.map(cat => {
      const catTx = transactions.filter(t => t.category === cat);
      const currentSpent = catTx.reduce((sum, t) => sum + t.amount, 0);
      const historicalData = [{ month: 'prev', amount: currentSpent * 0.9, category: cat }];
      const prediction = predictMonthlyExpenses(historicalData, currentSpent, dayOfMonth);
      const budget = budgets.find(b => b.category === cat);
      return { category: cat, currentSpent, ...prediction, budget: budget?.limit || 0 };
    });
  }, [transactions, budgets, dayOfMonth]);

  const totalPredicted = categoryPredictions.reduce((sum, p) => sum + p.predicted, 0);
  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
  const monthlyIncome = incomes.filter(i => i.type === 'recurring').reduce((sum, i) => sum + i.amount, 0);

  // Generate alerts
  const alerts = useMemo(() => {
    const result: { id: string; type: string; title: string; message: string; severity: 'low' | 'medium' | 'high' }[] = [];
    
    categoryPredictions.forEach(p => {
      if (p.budget > 0 && p.predicted > p.budget) {
        result.push({
          id: `alert_${p.category}`,
          type: 'budget_exceeded',
          title: `Budget ${getCategoryName(p.category)} dépassé`,
          message: `Prévision: ${formatNumber(p.predicted)} / Budget: ${formatNumber(p.budget)}`,
          severity: p.predicted > p.budget * 1.3 ? 'high' : 'medium',
        });
      }
    });

    if (totalPredicted > monthlyIncome * 0.8) {
      result.push({
        id: 'alert_income',
        type: 'income_warning',
        title: 'Dépenses élevées',
        message: `Vos dépenses prévues représentent ${pct(totalPredicted, monthlyIncome)}% de vos revenus`,
        severity: totalPredicted > monthlyIncome ? 'high' : 'medium',
      });
    }

    return result;
  }, [categoryPredictions, totalPredicted, monthlyIncome]);

  // Insights
  const insights = useMemo(() => {
    const result: { icon: string; title: string; description: string; color: string }[] = [];
    
    const topCategory = categoryPredictions.sort((a, b) => b.currentSpent - a.currentSpent)[0];
    if (topCategory) {
      result.push({
        icon: '📊',
        title: 'Catégorie principale',
        description: `${getCategoryName(topCategory.category)} représente ${pct(topCategory.currentSpent, transactions.reduce((s, t) => s + t.amount, 0))}% de vos dépenses`,
        color: Colors.primary,
      });
    }

    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - totalPredicted) / monthlyIncome) * 100 : 0;
    result.push({
      icon: savingsRate > 20 ? '🎉' : savingsRate > 10 ? '👍' : '⚠️',
      title: "Taux d'épargne",
      description: `${savingsRate.toFixed(0)}% de vos revenus ${savingsRate > 20 ? '- Excellent!' : savingsRate > 10 ? '- Bien' : '- Améliorable'}`,
      color: savingsRate > 20 ? Colors.success : savingsRate > 10 ? Colors.warning : Colors.error,
    });

    return result;
  }, [categoryPredictions, transactions, monthlyIncome, totalPredicted]);

  const handleSendMessage = () => {
    if (!message.trim()) return;

    addChatMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    // Generate AI response based on user data
    const responses = [
      `Basé sur vos dépenses, je prévois ${formatNumber(totalPredicted)} CHF ce mois. Conseil: Réduisez les dépenses restaurant de 20% pour économiser ~${formatNumber(categoryPredictions.find(p => p.category === 'restaurant')?.currentSpent || 0 * 0.2)}.`,
      `Votre taux d'épargne actuel est de ${pct(monthlyIncome - totalPredicted, monthlyIncome)}%. Pour atteindre l'indépendance financière, visez 30-50%.`,
      `Vous avez ${alerts.length} alertes actives. La plus urgente concerne vos dépenses ${alerts[0]?.title || 'courses'}.`,
      `Conseil: Augmentez votre 3ème pilier au maximum (CHF 7'258) pour économiser jusqu'à 30% d'impôts.`,
    ];

    setTimeout(() => {
      addChatMessage({
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: Date.now(),
      });
    }, 500);

    setMessage('');
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'predictions', label: 'Prédictions', icon: 'analytics' },
    { key: 'alerts', label: 'Alertes', icon: 'warning' },
    { key: 'cashflow', label: 'Cash Flow', icon: 'trending-up' },
    { key: 'insights', label: 'Insights', icon: 'bulb' },
    { key: 'coach', label: 'Coach IA', icon: 'chatbubbles' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Guardian Predict IA</Text>
        <View style={{ width: 40 }} />
      </View>

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
              {tab.key === 'alerts' && alerts.length > 0 && (
                <View style={styles.alertBadge}>
                  <Text style={styles.alertBadgeText}>{alerts.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {activeTab === 'coach' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
            <View style={styles.aiIntro}>
              <Ionicons name="sparkles" size={32} color={Colors.warning} />
              <Text style={styles.aiIntroText}>Guardian Coach IA</Text>
              <Text style={styles.aiIntroSub}>Posez vos questions financières</Text>
            </View>

            {chatHistory.map((msg) => (
              <View
                key={msg.id}
                style={[styles.chatBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}
              >
                <Text style={styles.chatText}>{msg.content}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              style={styles.chatInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Posez votre question..."
              placeholderTextColor={Colors.textTertiary}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Ionicons name="send" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {activeTab === 'predictions' && (
            <>
              <Card style={styles.heroCard}>
                <Text style={styles.heroLabel}>Prévision fin de mois</Text>
                <Text style={styles.heroAmount}>{CUR} {formatNumber(totalPredicted)}</Text>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaText}>Jour {dayOfMonth}/30</Text>
                  <Badge text={`Confiance ${Math.round(categoryPredictions[0]?.confidence * 100 || 50)}%`} color={Colors.primary} />
                </View>
              </Card>

              {categoryPredictions.map((p) => (
                <Card key={p.category} style={styles.predictionCard}>
                  <View style={styles.predictionHeader}>
                    <CategoryIcon category={p.category} size="sm" />
                    <Text style={styles.predictionName}>{getCategoryName(p.category)}</Text>
                    <View style={styles.predictionAmounts}>
                      <Text style={styles.predictionCurrent}>{formatNumber(p.currentSpent)}</Text>
                      <Text style={styles.predictionArrow}>→</Text>
                      <Text style={styles.predictionPredicted}>{formatNumber(p.predicted)}</Text>
                    </View>
                  </View>
                  {p.budget > 0 && (
                    <ProgressBar
                      value={pct(p.predicted, p.budget)}
                      color={p.predicted > p.budget ? Colors.error : Colors.success}
                      height={6}
                    />
                  )}
                </Card>
              ))}
            </>
          )}

          {activeTab === 'alerts' && (
            <>
              {alerts.length === 0 ? (
                <Card style={styles.noAlertsCard}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                  <Text style={styles.noAlertsText}>Aucune alerte</Text>
                  <Text style={styles.noAlertsSub}>Vos finances sont sous contrôle!</Text>
                </Card>
              ) : (
                alerts.map((alert) => (
                  <Card
                    key={alert.id}
                    style={styles.alertCard}
                    borderColor={alert.severity === 'high' ? Colors.error : alert.severity === 'medium' ? Colors.warning : Colors.info}
                  >
                    <View style={styles.alertHeader}>
                      <Ionicons
                        name="warning"
                        size={24}
                        color={alert.severity === 'high' ? Colors.error : Colors.warning}
                      />
                      <View style={styles.alertContent}>
                        <Text style={styles.alertTitle}>{alert.title}</Text>
                        <Text style={styles.alertMessage}>{alert.message}</Text>
                      </View>
                    </View>
                  </Card>
                ))
              )}
            </>
          )}

          {activeTab === 'cashflow' && (
            <Card style={styles.cashflowCard}>
              <Text style={styles.cashflowTitle}>💰 Cash Flow Mensuel</Text>
              <View style={styles.cashflowRow}>
                <View style={styles.cashflowItem}>
                  <Ionicons name="arrow-up" size={20} color={Colors.success} />
                  <Text style={styles.cashflowLabel}>Revenus</Text>
                  <Text style={[styles.cashflowAmount, { color: Colors.success }]}>
                    +{formatNumber(monthlyIncome)}
                  </Text>
                </View>
                <View style={styles.cashflowItem}>
                  <Ionicons name="arrow-down" size={20} color={Colors.error} />
                  <Text style={styles.cashflowLabel}>Dépenses</Text>
                  <Text style={[styles.cashflowAmount, { color: Colors.error }]}>
                    -{formatNumber(totalPredicted)}
                  </Text>
                </View>
                <View style={styles.cashflowItem}>
                  <Ionicons name="wallet" size={20} color={Colors.primary} />
                  <Text style={styles.cashflowLabel}>Net</Text>
                  <Text style={[styles.cashflowAmount, { color: monthlyIncome - totalPredicted >= 0 ? Colors.success : Colors.error }]}>
                    {monthlyIncome - totalPredicted >= 0 ? '+' : ''}{formatNumber(monthlyIncome - totalPredicted)}
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {activeTab === 'insights' && (
            <>
              {insights.map((insight, idx) => (
                <Card key={idx} style={styles.insightCard}>
                  <Text style={styles.insightIcon}>{insight.icon}</Text>
                  <View style={styles.insightContent}>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={[styles.insightDesc, { color: insight.color }]}>{insight.description}</Text>
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  tabsScroll: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.card },
  tabActive: { backgroundColor: Colors.warning },
  tabText: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  tabTextActive: { color: Colors.background },
  alertBadge: { backgroundColor: Colors.error, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.xs },
  alertBadgeText: { color: Colors.text, fontSize: 10, fontWeight: FontWeights.bold },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg },
  heroCard: { marginBottom: Spacing.lg, alignItems: 'center' },
  heroLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  heroAmount: { color: Colors.text, fontSize: FontSizes.hero, fontWeight: FontWeights.black },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  heroMetaText: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  predictionCard: { marginBottom: Spacing.md },
  predictionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  predictionName: { flex: 1, marginLeft: Spacing.sm, color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  predictionAmounts: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  predictionCurrent: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  predictionArrow: { color: Colors.textTertiary, fontSize: FontSizes.sm },
  predictionPredicted: { color: Colors.text, fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  noAlertsCard: { alignItems: 'center', padding: Spacing.xxl },
  noAlertsText: { color: Colors.success, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginTop: Spacing.md },
  noAlertsSub: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  alertCard: { marginBottom: Spacing.md },
  alertHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  alertContent: { flex: 1 },
  alertTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  alertMessage: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  cashflowCard: { marginBottom: Spacing.lg },
  cashflowTitle: { color: Colors.text, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, marginBottom: Spacing.lg, textAlign: 'center' },
  cashflowRow: { flexDirection: 'row' },
  cashflowItem: { flex: 1, alignItems: 'center' },
  cashflowLabel: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginTop: Spacing.xs },
  cashflowAmount: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  insightCard: { marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center' },
  insightIcon: { fontSize: 32, marginRight: Spacing.md },
  insightContent: { flex: 1 },
  insightTitle: { color: Colors.text, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  insightDesc: { fontSize: FontSizes.sm },
  chatScroll: { flex: 1 },
  chatContent: { padding: Spacing.lg },
  aiIntro: { alignItems: 'center', marginBottom: Spacing.xl },
  aiIntroText: { color: Colors.text, fontSize: FontSizes.xl, fontWeight: FontWeights.bold, marginTop: Spacing.sm },
  aiIntroSub: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  chatBubble: { maxWidth: '80%', padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card },
  chatText: { color: Colors.text, fontSize: FontSizes.md },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.cardBorder, backgroundColor: Colors.backgroundSecondary },
  chatInput: { flex: 1, backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, color: Colors.text, fontSize: FontSizes.md, maxHeight: 100 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm },
});
