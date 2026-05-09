/**
 * BUDGY — Voice Input Modal (Apple Intelligence / ChatGPT Voice style)
 *
 * Flow:
 *   1. User taps "Ajouter par voix" in AI menu → this modal opens
 *   2. Live transcription (Web Speech API on Web; on native we fall back
 *      to a "Tap to type" textarea — iOS native dictation will fill it)
 *   3. POST /api/voice/parse → returns structured transaction
 *   4. Preview card with detected fields → user confirms
 *   5. addTransaction / addRecurring is called → modal closes
 *
 * Visual: aurora orb that breathes & reacts to "amplitude" (mocked envelope
 * during recording), waveform pulse rings, premium dark glass sheet.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore } from '../stores/useStore';

const ACCENT = '#16E0C6';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface ParsedTxn {
  success: boolean;
  type?: 'expense' | 'income' | 'subscription';
  amount?: number;
  currency?: string;
  merchant?: string;
  category?: string;
  recurring?: boolean;
  date?: string;
  confidence?: number;
  error?: string;
}

const SUGGESTIONS = [
  '« Ajoute une dépense de 25 francs chez Migros »',
  '« J\'ai reçu 3200 francs de salaire »',
  '« Abonnement Netflix 18 francs »',
  '« 120 francs d\'essence »',
];

export default function VoiceInputModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'saving'>('idle');
  const [parsed, setParsed] = useState<ParsedTxn | null>(null);

  // Animations
  const breath = useRef(new Animated.Value(0)).current;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  const addTransaction = useStore((s) => s.addTransaction);
  const addIncome = useStore((s) => s.addIncome);
  const addRecurringExpense = useStore((s) => s.addRecurringExpense);

  // Reset every time the modal opens
  useEffect(() => {
    if (visible) {
      setText('');
      setParsed(null);
      setPhase('idle');
    }
  }, [visible]);

  // Breathing & rings
  useEffect(() => {
    if (!visible) return;
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])
    );
    const ringALoop = Animated.loop(
      Animated.timing(ringA, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    const ringBLoop = Animated.loop(
      Animated.timing(ringB, { toValue: 1, duration: 2400, delay: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    breathLoop.start();
    ringALoop.start();
    ringBLoop.start();
    return () => {
      breathLoop.stop();
      ringALoop.stop();
      ringBLoop.stop();
    };
  }, [visible]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringAScale = ringA.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.6] });
  const ringAOpac = ringA.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const ringBScale = ringB.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.6] });
  const ringBOpac = ringB.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const tryParse = async (input: string) => {
    if (!input.trim()) return;
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
    setPhase('parsing');
    try {
      console.log('[voice] POST /api/voice/parse', input.slice(0, 80));
      const res = await fetch(`${BACKEND_URL}/api/voice/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, locale: 'fr-CH' }),
      });
      const data: ParsedTxn = await res.json();
      console.log('[voice] parsed:', data);
      setParsed(data);
      setPhase(data.success ? 'preview' : 'idle');
      if (!data.success) {
        Alert.alert(
          'Je n\'ai pas compris',
          data.error || 'Réessayez avec une phrase comme « 25 francs chez Migros »'
        );
      }
    } catch (e: any) {
      console.error('[voice] error:', e);
      setPhase('idle');
      Alert.alert(
        'Connexion impossible',
        'Vérifiez votre connexion Internet et réessayez.'
      );
    }
  };

  const handleConfirm = () => {
    if (!parsed || !parsed.success) return;
    if (Platform.OS !== 'web') {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
    setPhase('saving');
    try {
      const t = parsed.type;
      const amount = parsed.amount || 0;
      if (t === 'income') {
        addIncome({
          id: `inc_${Date.now()}`,
          source: parsed.merchant || 'Revenu',
          amount,
          frequency: 'monthly',
          date: parsed.date || new Date().toISOString().slice(0, 10),
          createdAt: Date.now(),
        } as any);
      } else if (t === 'subscription' || parsed.recurring) {
        addRecurringExpense({
          id: `rec_${Date.now()}`,
          name: parsed.merchant || parsed.category || 'Abonnement',
          amount,
          frequency: 'monthly',
          category: parsed.category || 'abonnement',
          dayOfMonth: 1,
          active: true,
          createdAt: Date.now(),
        } as any);
      } else {
        addTransaction({
          id: `txn_${Date.now()}`,
          title: parsed.merchant || parsed.category || 'Dépense',
          amount,
          category: parsed.category || 'autre',
          date: parsed.date || new Date().toISOString().slice(0, 10),
          createdAt: Date.now(),
        } as any);
      }
      // Done
      setTimeout(() => {
        setPhase('idle');
        onClose();
      }, 250);
    } catch (e) {
      console.error('[voice] save error:', e);
      setPhase('preview');
      Alert.alert('Erreur', 'Impossible d\'enregistrer cette transaction.');
    }
  };

  const submitText = () => tryParse(text);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <BlurView intensity={Platform.OS === 'ios' ? 50 : 0} tint="dark" style={StyleSheet.absoluteFill as any}>
        <Pressable style={styles.dim} onPress={onClose} />
      </BlurView>

      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
        >
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 0} tint="dark" style={StyleSheet.absoluteFill as any} />
          <LinearGradient
            colors={['rgba(22, 26, 33, 0.96)', 'rgba(11, 14, 18, 1)']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill as any}
          />

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.eyebrow}>BUDGY · VOICE</Text>
            <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          <Text style={styles.title}>Parlez naturellement</Text>
          <Text style={styles.subtitle}>L'IA ajoute votre dépense, revenu ou abonnement</Text>

          {/* Aurora orb */}
          <View style={styles.orbStage}>
            <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ringAOpac, transform: [{ scale: ringAScale }] }]} />
            <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ringBOpac, transform: [{ scale: ringBScale }] }]} />
            <Animated.View style={[styles.orbWrap, { transform: [{ scale: breathScale }] }]}>
              <LinearGradient
                colors={['#7BFCE3', ACCENT, '#0E8C7B']}
                start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }}
                style={styles.orb}
              />
              <View style={styles.orbHighlight} pointerEvents="none" />
              <View style={styles.orbCenter}>
                {phase === 'parsing' || phase === 'saving' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="mic" size={32} color="#fff" />
                )}
              </View>
            </Animated.View>
          </View>

          {/* Content phase */}
          {phase !== 'preview' ? (
            <>
              <View style={styles.inputBox}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Tapez ou dictez ici..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={styles.input}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={submitText}
                />
              </View>

              <Pressable
                onPress={submitText}
                disabled={!text.trim() || phase === 'parsing'}
                style={({ pressed }) => [
                  styles.cta,
                  (!text.trim() || phase === 'parsing') && { opacity: 0.45 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="sparkles" size={16} color="#0F1115" />
                <Text style={styles.ctaTxt}>{phase === 'parsing' ? 'Analyse en cours...' : 'Analyser'}</Text>
              </Pressable>

              {/* Suggestion chips */}
              <View style={styles.chipsWrap}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setText(s.replace(/[«»\s]+/g, ' ').trim())}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  >
                    <Text style={styles.chipTxt} numberOfLines={1}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : parsed ? (
            <View style={styles.previewCard}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Type</Text>
                <Text style={styles.previewValue}>
                  {parsed.type === 'income' ? '💼 Revenu' : parsed.type === 'subscription' ? '🔁 Abonnement' : '💸 Dépense'}
                </Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Montant</Text>
                <Text style={styles.previewValueBig}>CHF {(parsed.amount || 0).toFixed(2)}</Text>
              </View>
              {parsed.merchant && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Marchand</Text>
                  <Text style={styles.previewValue}>{parsed.merchant}</Text>
                </View>
              )}
              {parsed.category && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Catégorie</Text>
                  <Text style={styles.previewValue}>{parsed.category}</Text>
                </View>
              )}
              {parsed.confidence !== undefined && (
                <Text style={styles.confidence}>Confiance : {Math.round((parsed.confidence || 0) * 100)}%</Text>
              )}

              <View style={styles.previewActions}>
                <Pressable onPress={() => setPhase('idle')} style={[styles.actionBtn, styles.actionBtnGhost]}>
                  <Text style={styles.actionBtnGhostTxt}>Modifier</Text>
                </Pressable>
                <Pressable onPress={handleConfirm} style={[styles.actionBtn, styles.actionBtnPrimary]}>
                  <Ionicons name="checkmark" size={16} color="#0F1115" />
                  <Text style={styles.actionBtnPrimaryTxt}>Confirmer</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    minHeight: 540,
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, marginBottom: 4,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11, fontWeight: '600', letterSpacing: 1.4,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4, marginBottom: 8 },

  // Orb
  orbStage: { alignItems: 'center', justifyContent: 'center', marginVertical: 18, height: 140 },
  ring: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    borderWidth: 1.2, borderColor: ACCENT,
  },
  orbWrap: {
    width: 90, height: 90, borderRadius: 45,
    overflow: 'hidden',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 24,
  },
  orb: { flex: 1 },
  orbHighlight: {
    position: 'absolute', top: 8, left: 14,
    width: 28, height: 18, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.28)',
    transform: [{ rotate: '-25deg' }],
  },
  orbCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  // Input
  inputBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 80,
    marginBottom: 12,
  },
  input: { color: '#fff', fontSize: 15, lineHeight: 21, minHeight: 60 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 14,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45, shadowRadius: 14,
  },
  ctaTxt: { color: '#0F1115', fontSize: 15, fontWeight: '700' },

  chipsWrap: { marginTop: 14, gap: 6 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipPressed: { backgroundColor: 'rgba(22,224,198,0.08)', borderColor: 'rgba(22,224,198,0.35)' },
  chipTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5 },

  // Preview
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(22,224,198,0.22)',
    marginTop: 6,
  },
  previewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  previewLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  previewValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  previewValueBig: { color: ACCENT, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  confidence: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'right', marginTop: 6 },
  previewActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 14, gap: 6,
  },
  actionBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnGhostTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtnPrimary: { backgroundColor: ACCENT },
  actionBtnPrimaryTxt: { color: '#0F1115', fontWeight: '700', fontSize: 14 },
});
