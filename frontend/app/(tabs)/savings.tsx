/**
 * GUARDIAN MONEY CHF - Savings Screen
 * Savings goals with progress tracking
 *
 * @i18n-technical-file
 *
 * ⚠ Residual FR-CH defaults on EntityEditModal EditField labels + delete
 * confirmation strings piped into EntityActionsSheet. Multi-locale i18n
 * wrapping is planned as v3.9.1 follow-up under `savings.editGoal*`.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import type { ThemePalette } from '../../src/constants/palettes';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, ProgressBar, EmptyState } from '../../src/components/ui';
import { formatNumber, pct } from '../../src/utils/calculations';
import { SAVINGS_TEMPLATES } from '../../src/data/swiss-data';
import AnimatedProgressBar from '../../src/components/AnimatedProgressBar';
import ConfettiBurst from '../../src/components/ConfettiBurst';
import { useTranslation } from '../../src/hooks/useTranslation';
import { DATE_LOCALES } from '../../src/i18n/translations';
import { EntityActionsSheet, type EntityActionsContext } from '../../src/components/EntityActionsSheet';
import { EntityEditModal, type EditField } from '../../src/components/EntityEditModal';

export default function SavingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [confetti, setConfetti] = useState(false);
  const [celebratedIds, setCelebratedIds] = useState<Set<string>>(new Set());
  const {
    preferences,
    savingsGoals,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    depositToGoal,
  } = useStore();
  const { t, lang } = useTranslation();
  const dateLocale = DATE_LOCALES[lang] || 'fr-CH';

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState<string | null>(null);
  // v3.7.28 — actions sheet + edit modal (réutilise composants existants)
  const [actionsCtx, setActionsCtx] = useState<EntityActionsContext | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingGoal = useMemo(() => savingsGoals.find((g) => g.id === editingId) || null, [savingsGoals, editingId]);
  const EDIT_GOAL_FIELDS: EditField[] = useMemo(() => [
    { key: 'title', label: 'Titre', type: 'text', icon: 'flag-outline', placeholder: 'ex: Voyage Japon', required: true },
    { key: 'target', label: `Montant cible (${preferences.currency})`, type: 'number', icon: 'flag-outline', placeholder: '5000', required: true, decimal: true },
    { key: 'saved', label: `Déjà épargné (${preferences.currency})`, type: 'number', icon: 'wallet-outline', placeholder: '0', decimal: true },
    { key: 'deadline', label: 'Date cible (YYYY-MM-DD)', type: 'text', icon: 'calendar-outline', placeholder: '2026-12-31' },
  ], [preferences.currency]);
  const handleEditGoalSubmit = (values: Record<string, any>) => {
    if (!editingGoal) return;
    const target = parseFloat(String(values.target).replace(',', '.')) || editingGoal.target;
    const saved = Math.max(0, parseFloat(String(values.saved).replace(',', '.')) || 0);
    updateSavingsGoal(editingGoal.id, {
      title: String(values.title || '').trim() || editingGoal.title,
      target,
      saved,
      deadline: values.deadline || editingGoal.deadline,
    });
    setEditingId(null);
  };
  const [depositAmount, setDepositAmount] = useState('');
  const [step, setStep] = useState<'templates' | 'custom'>('templates');
  const [newGoal, setNewGoal] = useState({
    title: '',
    emoji: '🎯',
    target: '',
    saved: '0',
    autoSave: '',
    deadline: '',
    color: theme.primary,
  });

  const CUR = preferences.currency;

  const totalSaved = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.saved, 0);
  }, [savingsGoals]);

  const totalTarget = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.target, 0);
  }, [savingsGoals]);

  const monthlyAutoSave = useMemo(() => {
    return savingsGoals.reduce((sum, g) => sum + g.autoSave, 0);
  }, [savingsGoals]);

  const handleSelectTemplate = (template: (typeof SAVINGS_TEMPLATES)[number]) => {
    setNewGoal({
      title: template.title,
      emoji: template.emoji,
      target: template.target.toString(),
      saved: '0',
      autoSave: '',
      deadline: '',
      color: template.color,
    });
    setStep('custom');
  };

  const handleAddGoal = () => {
    if (!newGoal.title || !newGoal.target) {
      Alert.alert(t('common.error'), t('savings.errMissing'));
      return;
    }

    addSavingsGoal({
      id: `goal_${Date.now()}`,
      title: newGoal.title,
      emoji: newGoal.emoji,
      target: parseFloat(newGoal.target),
      saved: parseFloat(newGoal.saved) || 0,
      autoSave: parseFloat(newGoal.autoSave) || 0,
      deadline: newGoal.deadline,
      color: newGoal.color,
      category: 'Autre',
      createdAt: Date.now(),
    });

    setNewGoal({ title: '', emoji: '🎯', target: '', saved: '0', autoSave: '', deadline: '', color: theme.primary });
    setStep('templates');
    setShowAddModal(false);
  };

  const handleDeposit = () => {
    if (!depositAmount || !showDepositModal) return;
    depositToGoal(showDepositModal, parseFloat(depositAmount));
    setDepositAmount('');
    setShowDepositModal(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      t('common.delete'),
      t('common.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteSavingsGoal(id) },
      ]
    );
  };

  const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#EF4444', '#0EA5E9', '#8B5CF6', '#F97316'];

  // Detect newly-completed goals outside of render (prevents render-phase setState)
  useEffect(() => {
    const newlyCompleted = savingsGoals.filter(
      (g) => pct(g.saved, g.target) >= 100 && !celebratedIds.has(g.id)
    );
    if (newlyCompleted.length > 0) {
      setCelebratedIds((prev) => {
        const next = new Set(prev);
        newlyCompleted.forEach((g) => next.add(g.id));
        return next;
      });
      setConfetti(true);
      if (Platform.OS !== 'web') {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      const timer = setTimeout(() => setConfetti(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [savingsGoals]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Confetti overlay */}
      <ConfettiBurst trigger={confetti} onDone={() => setConfetti(false)} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🎯 {t('savings.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t('savings.total')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalSaved)}</Text>
            <View style={styles.percentContainer}>
              <Text style={styles.percentValue}>{pct(totalSaved, totalTarget)}%</Text>
            </View>
          </View>
          <Text style={styles.summaryTarget}>{t('savings.target', { n: formatNumber(totalTarget) })}</Text>
          <ProgressBar
            value={pct(totalSaved, totalTarget)}
            color={theme.primary}
            height={10}
          />
          <View style={styles.autoSaveRow}>
            <Ionicons name="sync" size={16} color={theme.success} />
            <Text style={styles.autoSaveText}>
              {t('savings.autoSave', { c: CUR, n: formatNumber(monthlyAutoSave) })}
            </Text>
          </View>
        </Card>

        {/* Goals List */}
        {savingsGoals.length === 0 ? (
          <EmptyState
            icon="flag-outline"
            title={t('savings.noGoals')}
            subtitle={t('savings.startNow')}
            action={{ label: t('common.create'), onPress: () => setShowAddModal(true) }}
          />
        ) : (
          savingsGoals.map((goal) => {
            const progress = pct(goal.saved, goal.target);
            const remaining = goal.target - goal.saved;
            const monthsLeft = goal.autoSave > 0 ? Math.ceil(remaining / goal.autoSave) : null;
            const isComplete = progress >= 100;

            // Projection: "Atteint le 15 mars 2026" if auto-save configured
            const projectedDate = (() => {
              if (!monthsLeft || isComplete) return null;
              const d = new Date();
              d.setMonth(d.getMonth() + monthsLeft);
              return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
            })();

            // Trigger is handled by the useEffect above to avoid render-phase setState

            return (
              <TouchableOpacity
                key={goal.id}
                activeOpacity={0.85}
                onLongPress={() => setActionsCtx({
                  id: goal.id,
                  title: goal.title,
                  subtitle: `${preferences.currency} ${formatNumber(goal.saved)} / ${formatNumber(goal.target)}`,
                  accent: goal.color,
                })}
              >
              <Card
                style={styles.goalCard}
                borderColor={isComplete ? `${goal.color}50` : undefined}
              >
                {isComplete && (
                  <View style={[styles.completeBadge, { backgroundColor: `${goal.color}20` }]}>
                    <Ionicons name="trophy" size={14} color={goal.color} />
                    <Text style={[styles.completeBadgeText, { color: goal.color }]}>
                      {t('savings.goalCompleted')}
                    </Text>
                  </View>
                )}

                <View style={styles.goalHeader}>
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    {goal.autoSave > 0 && (
                      <Text style={styles.goalAuto}>
                        💰 {t('savings.autoMonthly', { c: CUR, n: formatNumber(goal.autoSave) })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.goalAmounts}>
                    <Text style={styles.goalSaved}>{formatNumber(goal.saved)}</Text>
                    <Text style={styles.goalTarget}>/ {formatNumber(goal.target)}</Text>
                  </View>
                </View>

                <AnimatedProgressBar
                  value={progress}
                  height={10}
                  forceColor={isComplete ? ['#06D6A0', '#0891B2'] : [goal.color, goal.color]}
                />

                <View style={styles.goalMeta}>
                  <Text style={styles.goalMetaText}>
                    {isComplete
                      ? t('savings.achieved', { c: CUR, n: formatNumber(goal.saved) })
                      : t('savings.remaining', { n: `${formatNumber(remaining)} ${CUR}`, p: Math.round(progress) })}
                  </Text>
                </View>

                {/* Projection card (AI-style) */}
                {projectedDate && !isComplete && (
                  <View style={[styles.projectionBox, { backgroundColor: `${goal.color}15`, borderColor: `${goal.color}30` }]}>
                    <Ionicons name="sparkles" size={14} color={goal.color} />
                    <Text style={[styles.projectionText, { color: goal.color }]}>
                      {t('savings.reachedOn', { d: projectedDate })}
                    </Text>
                    <Text style={[styles.projectionSub, { color: theme.textSecondary }]}>
                      {t('savings.monthsLeft', { n: monthsLeft })}
                    </Text>
                  </View>
                )}

                {goal.tip && (
                  <View style={styles.tipRow}>
                    <Ionicons name="bulb" size={14} color={theme.warning} />
                    <Text style={styles.tipText}>{goal.tip}</Text>
                  </View>
                )}

                <View style={styles.goalActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: `${goal.color}20` }]}
                    onPress={() => setShowDepositModal(goal.id)}
                  >
                    <Ionicons name="add" size={18} color={goal.color} />
                    <Text style={[styles.actionButtonText, { color: goal.color }]}>{t('savings.deposit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(goal.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                  </TouchableOpacity>
                </View>
              </Card>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Goal Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAddModal(false);
          setStep('templates');
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {step === 'templates' ? t('savings.chooseTemplate') : t('savings.newProject')}
              </Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setStep('templates'); }}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {step === 'templates' ? (
              <ScrollView style={styles.templatesScroll}>
                <View style={styles.templatesGrid}>
                  {SAVINGS_TEMPLATES.map((tpl, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.templateItem, { borderColor: `${tpl.color}40` }]}
                      onPress={() => handleSelectTemplate(tpl)}
                    >
                      <Text style={styles.templateEmoji}>{tpl.emoji}</Text>
                      <Text style={styles.templateTitle}>{tpl.title}</Text>
                      <Text style={styles.templateTarget}>{CUR} {formatNumber(tpl.target)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.customButton}
                  onPress={() => setStep('custom')}
                >
                  <Ionicons name="create" size={18} color={theme.primary} />
                  <Text style={styles.customButtonText}>{t('savings.customProject')}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView>
                <View style={styles.emojiRow}>
                  <TextInput
                    style={styles.emojiInput}
                    value={newGoal.emoji}
                    onChangeText={(t) => setNewGoal((p) => ({ ...p, emoji: t }))}
                    maxLength={2}
                  />
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input}
                      value={newGoal.title}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, title: t }))}
                      placeholder={t('savings.myProject')}
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>{t('savings.objective')} ({CUR})</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.target}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, target: t }))}
                      placeholder="10000"
                      placeholderTextColor={theme.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>{t('savings.alreadySaved')}</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.saved}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, saved: t }))}
                      placeholder="0"
                      placeholderTextColor={theme.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>{t('savings.autoMonth')}</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.autoSave}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, autoSave: t }))}
                      placeholder="200"
                      placeholderTextColor={theme.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>{t('savings.deadline')}</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.deadline}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, deadline: t }))}
                      placeholder="2026-06"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>{t('savings.color')}</Text>
                <View style={styles.colorRow}>
                  {COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        newGoal.color === c && styles.colorDotSelected,
                      ]}
                      onPress={() => setNewGoal((p) => ({ ...p, color: c }))}
                    />
                  ))}
                </View>

                <Button
                  title={t('savings.createProject')}
                  onPress={handleAddGoal}
                  fullWidth
                  size="lg"
                  style={{ marginTop: Spacing.lg }}
                />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deposit Modal */}
      <Modal
        visible={!!showDepositModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDepositModal(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalContent, { maxHeight: 300 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('savings.addDeposit')}</Text>
              <TouchableOpacity onPress={() => setShowDepositModal(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>{t('common.amount')} ({CUR})</Text>
            <TextInput
              style={styles.input}
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="100"
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Button
              title={t('common.confirm')}
              onPress={handleDeposit}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* v3.7.28 — Long-press actions + Edit goal */}
      <EntityActionsSheet
        ctx={actionsCtx}
        onClose={() => setActionsCtx(null)}
        onEdit={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) setEditingId(id);
        }}
        onDelete={() => {
          const id = actionsCtx?.id;
          setActionsCtx(null);
          if (id) deleteSavingsGoal(id);
        }}
        deleteConfirmTitle="Supprimer cet objectif ?"
        deleteConfirmMessage="L'historique de progression sera perdu."
      />
      <EntityEditModal
        visible={!!editingGoal}
        onClose={() => setEditingId(null)}
        title="Modifier l'objectif"
        fields={EDIT_GOAL_FIELDS}
        initialValues={{
          title: editingGoal?.title || '',
          target: editingGoal?.target?.toString() || '',
          saved: editingGoal?.saved?.toString() || '0',
          deadline: editingGoal?.deadline || '',
        }}
        onSubmit={handleEditGoalSubmit}
        submitLabel="Enregistrer"
      />
    </View>
  );
}

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryAmount: {
    color: Colors.text,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black,
  },
  percentContainer: {
    backgroundColor: `${Colors.primary}20`,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  percentValue: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  summaryTarget: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  autoSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  autoSaveText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  goalCard: {
    marginBottom: Spacing.md,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  completeBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  goalEmoji: {
    fontSize: 36,
    marginRight: Spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  goalAuto: {
    color: Colors.success,
    fontSize: FontSizes.xs,
  },
  goalAmounts: {
    alignItems: 'flex-end',
  },
  goalSaved: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  goalTarget: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  goalMeta: {
    marginTop: Spacing.sm,
  },
  goalMetaText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: `${Colors.warning}10`,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tipText: {
    color: Colors.warning,
    fontSize: FontSizes.xs,
    flex: 1,
  },
  // AI Projection box
  projectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  projectionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    flex: 1,
  },
  projectionSub: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  goalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  deleteButton: {
    padding: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  templatesScroll: {
    maxHeight: 400,
  },
  templatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  templateItem: {
    width: '48%',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  templateEmoji: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  templateTitle: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    textAlign: 'center',
  },
  templateTarget: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  customButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  emojiInput: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: 32,
    textAlign: 'center',
    width: 60,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSizes.md,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: Colors.text,
  },
});
