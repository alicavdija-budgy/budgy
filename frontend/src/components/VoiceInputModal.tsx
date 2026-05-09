/**
 * BUDGY — Voice Input Modal (Premium edition)
 *
 * UX inspired by Apple Intelligence / ChatGPT Voice / Siri Wave:
 *   1. Tap the big mic button → start listening (haptic + start beep)
 *      • orb pulses
 *      • 5-bar waveform animates
 *      • iOS keyboard auto-opens on the textarea (native dictation hint)
 *   2. Tap again → stop (haptic + stop beep)
 *      • if text is present → auto-call /api/voice/parse
 *      • else stays idle
 *   3. Result preview card (Type / Amount / Merchant) → Modify / Confirm
 *
 * Until on-device live transcription is wired (expo-speech-recognition),
 * the listening state is a guided container around iOS native dictation.
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
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore } from '../stores/useStore';
import { playBeep, primeBeeps } from '../utils/beeps';

const ACCENT = '#16E0C6';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type Phase = 'idle' | 'listening' | 'parsing' | 'preview' | 'saving';

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

function lightHaptic() {
  if (Platform.OS === 'web') return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
}
function mediumHaptic() {
  if (Platform.OS === 'web') return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
}
function successHaptic() {
  if (Platform.OS === 'web') return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}

export default function VoiceInputModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [parsed, setParsed] = useState<ParsedTxn | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Animations
  const breath = useRef(new Animated.Value(0)).current; // idle breathing
  const pulse = useRef(new Animated.Value(0)).current;  // listening pulse
  const ringA = useRef(new Animated.Value(0)).current;  // listening rings
  const ringB = useRef(new Animated.Value(0)).current;
  const wave = useRef([0, 0, 0, 0, 0].map(() => new Animated.Value(0.25))).current;

  const addTransaction = useStore((s) => s.addTransaction);
  const addIncome = useStore((s) => s.addIncome);
  const addRecurringExpense = useStore((s) => s.addRecurringExpense);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setText('');
      setParsed(null);
      setPhase('idle');
      // Pre-warm web AudioContext so the very first beep is instant
      void primeBeeps();
    }
  }, [visible]);

  // Idle gentle breathing
  useEffect(() => {
    if (!visible || phase !== 'idle') {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, phase]);

  // Listening — pulse + concentric rings + waveform bars
  useEffect(() => {
    if (phase !== 'listening') {
      pulse.stopAnimation(); pulse.setValue(0);
      ringA.stopAnimation(); ringA.setValue(0);
      ringB.stopAnimation(); ringB.setValue(0);
      wave.forEach((w) => { w.stopAnimation(); w.setValue(0.25); });
      return;
    }
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const ringALoop = Animated.loop(
      Animated.timing(ringA, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    const ringBLoop = Animated.loop(
      Animated.timing(ringB, { toValue: 1, duration: 1600, delay: 800, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );

    // Random-ish waveform bars
    const waveLoops = wave.map((w, idx) => {
      const animateOnce = () => {
        const target = 0.35 + Math.random() * 0.65;
        Animated.timing(w, {
          toValue: target,
          duration: 220 + Math.random() * 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished) animateOnce();
        });
      };
      // Stagger initial start so bars don't move in sync
      setTimeout(animateOnce, idx * 90);
      return null;
    });

    pulseLoop.start();
    ringALoop.start();
    ringBLoop.start();
    return () => {
      pulseLoop.stop();
      ringALoop.stop();
      ringBLoop.stop();
      wave.forEach((w) => w.stopAnimation());
    };
  }, [phase]);

  // ── Animation interpolations ────────────────────────────
  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const ringAScale = ringA.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const ringAOpac = ringA.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const ringBScale = ringB.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const ringBOpac = ringB.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  // ── Voice control ────────────────────────────────────────
  const startListening = () => {
    lightHaptic();
    playBeep('start');
    setPhase('listening');
    // Focus the textarea so iOS keyboard / mic key is immediately available
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const stopListening = () => {
    lightHaptic();
    playBeep('stop');
    const captured = text.trim();
    if (captured.length >= 2) {
      // auto-analyze
      setTimeout(() => tryParse(captured), 120);
    } else {
      setPhase('idle');
    }
  };

  const onMicPress = () => {
    if (phase === 'idle') startListening();
    else if (phase === 'listening') stopListening();
    else if (phase === 'preview') {
      // tapping the orb in preview = restart
      setParsed(null);
      setText('');
      startListening();
    }
  };

  const tryParse = async (input: string) => {
    if (!input.trim()) return;
    setPhase('parsing');
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, locale: 'fr-CH' }),
      });
      const data: ParsedTxn = await res.json();
      setParsed(data);
      if (data.success) {
        mediumHaptic();
        setPhase('preview');
      } else {
        setPhase('idle');
        Alert.alert(
          'Je n\'ai pas compris',
          data.error || 'Réessayez avec une phrase comme « 25 francs chez Migros »',
        );
      }
    } catch (e: any) {
      console.error('[voice] error:', e);
      setPhase('idle');
      Alert.alert('Connexion impossible', 'Vérifiez votre connexion Internet et réessayez.');
    }
  };

  const handleConfirm = () => {
    if (!parsed || !parsed.success) return;
    successHaptic();
    setPhase('saving');
    try {
      const t = parsed.type;
      const amount = parsed.amount || 0;
      let dateStr = parsed.date || '';
      const todayStr = new Date().toISOString().slice(0, 10);
      const dt = dateStr ? new Date(dateStr) : null;
      if (!dt || isNaN(dt.getTime()) || dt.getFullYear() < new Date().getFullYear() - 1) {
        dateStr = todayStr;
      }
      const now = Date.now();

      if (t === 'income') {
        addIncome({
          id: `inc_${now}`,
          title: parsed.merchant || parsed.category || 'Revenu',
          amount,
          type: 'occasional',
          frequency: 'monthly',
          category: parsed.category || 'autre',
          color: '#16E0C6',
          icon: 'cash',
          createdAt: now,
        } as any);
      } else if (t === 'subscription' || parsed.recurring) {
        addRecurringExpense({
          id: `rec_${now}`,
          title: parsed.merchant || parsed.category || 'Abonnement',
          amount,
          frequency: 'monthly',
          category: parsed.category || 'abonnement',
          dayOfMonth: new Date().getDate(),
          color: '#BE99FF',
          active: true,
          createdAt: now,
        } as any);
      } else {
        addTransaction({
          id: `txn_${now}`,
          title: parsed.merchant || parsed.category || 'Dépense',
          amount,
          category: parsed.category || 'autre',
          date: dateStr,
          createdAt: now,
          updatedAt: now,
          synced: false,
        } as any);
      }
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

  // ── State labels ────────────────────────────────────────
  const stateLabel =
    phase === 'listening' ? 'Je vous écoute…' :
    phase === 'parsing' ? 'Analyse en cours…' :
    phase === 'saving' ? 'Enregistrement…' :
    phase === 'preview' ? 'Voici ce que j\'ai entendu' :
    'Appuyer pour parler';

  const subLabel =
    phase === 'listening'
      ? Platform.OS === 'ios'
        ? 'Appuyez sur 🎙️ du clavier puis dictez'
        : 'Dictez votre dépense, revenu ou abonnement'
      : phase === 'idle'
        ? 'L\'IA ajoute votre dépense, revenu ou abonnement'
        : '';

  const orbScale = phase === 'listening' ? pulseScale : breathScale;
  const orbOpacity = phase === 'listening' ? pulseGlow : 1;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <BlurView intensity={Platform.OS === 'ios' ? 50 : 0} tint="dark" style={StyleSheet.absoluteFill as any}>
        <Pressable style={styles.dim} onPress={onClose} />
      </BlurView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.center}
        pointerEvents="box-none"
      >
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.eyebrow}>BUDGY · VOICE</Text>
              <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            {/* ── BIG MIC BUTTON / ORB ────────────────────────── */}
            <View style={styles.orbStage}>
              {/* listening rings */}
              {phase === 'listening' && (
                <>
                  <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ringAOpac, transform: [{ scale: ringAScale }] }]} />
                  <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ringBOpac, transform: [{ scale: ringBScale }] }]} />
                </>
              )}
              <Pressable
                onPress={onMicPress}
                accessibilityRole="button"
                accessibilityLabel={
                  phase === 'listening' ? 'Arrêter la dictée' : 'Démarrer la dictée'
                }
                disabled={phase === 'parsing' || phase === 'saving'}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <Animated.View
                  style={[
                    styles.orbWrap,
                    phase === 'listening' && styles.orbWrapListening,
                    { transform: [{ scale: orbScale }], opacity: orbOpacity },
                  ]}
                >
                  <LinearGradient
                    colors={
                      phase === 'listening'
                        ? ['#A6FFEA', ACCENT, '#08B5A0']
                        : ['#7BFCE3', ACCENT, '#0E8C7B']
                    }
                    start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }}
                    style={styles.orb}
                  />
                  <View style={styles.orbHighlight} pointerEvents="none" />
                  <View style={styles.orbCenter}>
                    {phase === 'parsing' || phase === 'saving' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : phase === 'listening' ? (
                      <Ionicons name="stop" size={28} color="#fff" />
                    ) : (
                      <Ionicons name="mic" size={32} color="#fff" />
                    )}
                  </View>
                </Animated.View>
              </Pressable>
            </View>

            {/* State text */}
            <Text
              style={[
                styles.stateLabel,
                phase === 'listening' && { color: ACCENT },
              ]}
            >
              {stateLabel}
            </Text>
            {!!subLabel && <Text style={styles.subState}>{subLabel}</Text>}

            {/* Waveform bars when listening */}
            {phase === 'listening' && (
              <View style={styles.waveform}>
                {wave.map((w, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        transform: [{
                          scaleY: w as any,
                        }],
                      },
                    ]}
                  />
                ))}
              </View>
            )}

            {/* ── Content ─────────────────────────────────── */}
            {phase !== 'preview' ? (
              <>
                <View style={styles.inputBox}>
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={setText}
                    placeholder={
                      phase === 'listening'
                        ? 'La dictée apparaîtra ici…'
                        : 'Tapez ou dictez ici…'
                    }
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    returnKeyType="send"
                    onSubmitEditing={() => tryParse(text)}
                    editable={phase !== 'parsing' && phase !== 'saving'}
                  />
                </View>

                {/* Manual analyze (visible when text but not listening) */}
                {phase !== 'listening' && (
                  <Pressable
                    onPress={() => tryParse(text)}
                    disabled={!text.trim() || phase === 'parsing'}
                    style={({ pressed }) => [
                      styles.cta,
                      (!text.trim() || phase === 'parsing') && { opacity: 0.45 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="sparkles" size={16} color="#0F1115" />
                    <Text style={styles.ctaTxt}>
                      {phase === 'parsing' ? 'Analyse en cours…' : 'Analyser'}
                    </Text>
                  </Pressable>
                )}

                {/* Suggestion chips (only in idle) */}
                {phase === 'idle' && (
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
                )}
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
                  <Text style={styles.confidence}>
                    Confiance : {Math.round((parsed.confidence || 0) * 100)}%
                  </Text>
                )}

                <View style={styles.previewActions}>
                  <Pressable
                    onPress={() => { setParsed(null); setPhase('idle'); }}
                    style={[styles.actionBtn, styles.actionBtnGhost]}
                  >
                    <Text style={styles.actionBtnGhostTxt}>Modifier</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirm}
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                  >
                    <Ionicons name="checkmark" size={16} color="#0F1115" />
                    <Text style={styles.actionBtnPrimaryTxt}>Confirmer</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
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
    minHeight: 560,
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

  // Orb / Mic button
  orbStage: { alignItems: 'center', justifyContent: 'center', marginVertical: 18, height: 150 },
  ring: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    borderWidth: 1.4, borderColor: ACCENT,
  },
  orbWrap: {
    width: 96, height: 96, borderRadius: 48,
    overflow: 'hidden',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  orbWrapListening: {
    shadowOpacity: 1, shadowRadius: 32,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  orb: { flex: 1 },
  orbHighlight: {
    position: 'absolute', top: 10, left: 16,
    width: 30, height: 18, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.28)',
    transform: [{ rotate: '-25deg' }],
  },
  orbCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  // State labels
  stateLabel: {
    color: '#fff', fontSize: 19, fontWeight: '700',
    textAlign: 'center', letterSpacing: -0.3,
    marginTop: 6,
  },
  subState: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12.5,
    textAlign: 'center', marginTop: 4, marginBottom: 14,
  },

  // Waveform
  waveform: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 36, marginTop: 4, marginBottom: 14,
  },
  waveBar: {
    width: 5, height: 28,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },

  // Input
  inputBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 76,
    marginBottom: 12,
  },
  input: { color: '#fff', fontSize: 15, lineHeight: 21, minHeight: 56 },

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
