/**
 * GUARDIAN MONEY CHF - Savings Screen
 * Savings goals with progress tracking
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../src/constants/theme';
import { useStore } from '../../src/stores/useStore';
import { Card, Button, ProgressBar, EmptyState } from '../../src/components/ui';
import { formatNumber, pct } from '../../src/utils/calculations';
import { SAVINGS_TEMPLATES } from '../../src/data/swiss-data';
import AnimatedProgressBar from '../../src/components/AnimatedProgressBar';
import ConfettiBurst from '../../src/components/ConfettiBurst';

export default function SavingsScreen() {
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [step, setStep] = useState<'templates' | 'custom'>('templates');
  const [newGoal, setNewGoal] = useState({
    title: '',
    emoji: '🎯',
    target: '',
    saved: '0',
    autoSave: '',
    deadline: '',
    color: Colors.primary,
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

  const handleSelectTemplate = (template: typeof SAVINGS_TEMPLATES[0]) => {
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
      Alert.alert('Erreur', 'Veuillez remplir le titre et l\'objectif');
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

    setNewGoal({ title: '', emoji: '🎯', target: '', saved: '0', autoSave: '', deadline: '', color: Colors.primary });
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
      'Supprimer',
      'Êtes-vous sûr de vouloir supprimer cet objectif ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteSavingsGoal(id) },
      ]
    );
  };

  const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#EF4444', '#0EA5E9', '#8B5CF6', '#F97316'];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Confetti overlay */}
      <ConfettiBurst trigger={confetti} onDone={() => setConfetti(false)} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Épargne</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Capital épargné</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryAmount}>{CUR} {formatNumber(totalSaved)}</Text>
            <View style={styles.percentContainer}>
              <Text style={styles.percentValue}>{pct(totalSaved, totalTarget)}%</Text>
            </View>
          </View>
          <Text style={styles.summaryTarget}>sur {formatNumber(totalTarget)} visés</Text>
          <ProgressBar
            value={pct(totalSaved, totalTarget)}
            color={Colors.primary}
            height={10}
          />
          <View style={styles.autoSaveRow}>
            <Ionicons name="sync" size={16} color={Colors.success} />
            <Text style={styles.autoSaveText}>
              Virements auto: {CUR} {formatNumber(monthlyAutoSave)}/mois
            </Text>
          </View>
        </Card>

        {/* Goals List */}
        {savingsGoals.length === 0 ? (
          <EmptyState
            icon="flag-outline"
            title="Aucun objectif"
            subtitle="Créez votre premier objectif d'épargne"
            action={{ label: 'Créer', onPress: () => setShowAddModal(true) }}
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
              return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
            })();

            // Trigger confetti on newly-completed goal
            if (isComplete && !celebratedIds.has(goal.id)) {
              setTimeout(() => {
                setCelebratedIds((prev) => new Set(prev).add(goal.id));
                setConfetti(true);
                if (Platform.OS !== 'web') {
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }
                setTimeout(() => setConfetti(false), 2500);
              }, 200);
            }

            return (
              <Card
                key={goal.id}
                style={styles.goalCard}
                borderColor={isComplete ? `${goal.color}50` : undefined}
              >
                {isComplete && (
                  <View style={[styles.completeBadge, { backgroundColor: `${goal.color}20` }]}>
                    <Ionicons name="trophy" size={14} color={goal.color} />
                    <Text style={[styles.completeBadgeText, { color: goal.color }]}>
                      🎉 Objectif atteint !
                    </Text>
                  </View>
                )}

                <View style={styles.goalHeader}>
                  <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    {goal.autoSave > 0 && (
                      <Text style={styles.goalAuto}>
                        💰 {CUR} {formatNumber(goal.autoSave)}/mois auto
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
                      ? `✨ Bravo ! Vous avez économisé ${CUR} ${formatNumber(goal.saved)}`
                      : `${formatNumber(remaining)} ${CUR} manque · ${Math.round(progress)}% atteint`}
                  </Text>
                </View>

                {/* Projection card (AI-style) */}
                {projectedDate && !isComplete && (
                  <View style={[styles.projectionBox, { backgroundColor: `${goal.color}15`, borderColor: `${goal.color}30` }]}>
                    <Ionicons name="sparkles" size={14} color={goal.color} />
                    <Text style={[styles.projectionText, { color: goal.color }]}>
                      Atteint le {projectedDate}
                    </Text>
                    <Text style={[styles.projectionSub, { color: Colors.textSecondary }]}>
                      dans {monthsLeft} mois
                    </Text>
                  </View>
                )}

                {goal.tip && (
                  <View style={styles.tipRow}>
                    <Ionicons name="bulb" size={14} color={Colors.warning} />
                    <Text style={styles.tipText}>{goal.tip}</Text>
                  </View>
                )}

                <View style={styles.goalActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: `${goal.color}20` }]}
                    onPress={() => setShowDepositModal(goal.id)}
                  >
                    <Ionicons name="add" size={18} color={goal.color} />
                    <Text style={[styles.actionButtonText, { color: goal.color }]}>Verser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(goal.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </Card>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {step === 'templates' ? 'Choisir un modèle' : 'Nouveau projet'}
              </Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setStep('templates'); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
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
                  <Ionicons name="create" size={18} color={Colors.primary} />
                  <Text style={styles.customButtonText}>Projet personnalisé</Text>
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
                      placeholder="Mon projet"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Objectif ({CUR})</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.target}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, target: t }))}
                      placeholder="10000"
                      placeholderTextColor={Colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Déjà épargné</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.saved}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, saved: t }))}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Virement auto/mois</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.autoSave}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, autoSave: t }))}
                      placeholder="200"
                      placeholderTextColor={Colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Échéance</Text>
                    <TextInput
                      style={styles.input}
                      value={newGoal.deadline}
                      onChangeText={(t) => setNewGoal((p) => ({ ...p, deadline: t }))}
                      placeholder="2026-06"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Couleur</Text>
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
                  title="Créer le projet"
                  onPress={handleAddGoal}
                  fullWidth
                  size="lg"
                  style={{ marginTop: Spacing.lg }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Deposit Modal */}
      <Modal
        visible={!!showDepositModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDepositModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 300 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un versement</Text>
              <TouchableOpacity onPress={() => setShowDepositModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Montant ({CUR})</Text>
            <TextInput
              style={styles.input}
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="100"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Button
              title="Confirmer"
              onPress={handleDeposit}
              fullWidth
              size="lg"
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </View>
      </Modal>
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
