/**
 * BUDGY — Soft Paywall (premium upgrade prompt)
 *
 * Elegant, non-aggressive bottom sheet shown when a user hits a Pro-only
 * feature. Stays consistent with the rest of the app:
 *   - glassmorphism (BlurView)
 *   - turquoise accent and gradient
 *   - subtle entrance, no jumpscare animation
 *
 * Routes the user to the existing /paywall screen on confirmation.
 * Closes silently on dismiss.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const ACCENT = '#16E0C6';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Short pitch shown as the main title. */
  title?: string;
  /** Sub-pitch — explains the value, not the limitation. */
  subtitle?: string;
  /** Bullet list of premium benefits highlighted in this paywall. */
  benefits?: string[];
  /** Override the icon shown in the header orb. */
  icon?: keyof typeof Ionicons.glyphMap;
}

const DEFAULT_BENEFITS = [
  'Voice IA illimité',
  'Timeline IA complète',
  'OCR illimité & PDF complets',
  'Suivi du portefeuille',
  'Sync multi-appareils',
];

export default function SoftPaywall({
  visible,
  onClose,
  title = 'Passez à Budgy Pro',
  subtitle = 'Débloquez tous les outils intelligents pour reprendre le contrôle.',
  benefits = DEFAULT_BENEFITS,
  icon = 'sparkles',
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goPaywall = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
    onClose();
    setTimeout(() => {
      try { router.push('/paywall' as any); } catch (e) { console.warn('[paywall] nav failed:', e); }
    }, 150);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <BlurView intensity={Platform.OS === 'ios' ? 50 : 0} tint="dark" style={StyleSheet.absoluteFill as any}>
        <Pressable style={styles.dim} onPress={onClose} />
      </BlurView>

      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 14 }]}
        >
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 0} tint="dark" style={StyleSheet.absoluteFill as any} />
          <LinearGradient
            colors={['rgba(22, 26, 33, 0.96)', 'rgba(11, 14, 18, 1)']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill as any}
          />
          <View style={styles.topSheen} pointerEvents="none" />

          {/* Drag handle */}
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.eyebrow}>BUDGY · PREMIUM</Text>
            <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          {/* Hero icon orb */}
          <View style={styles.orbWrap}>
            <LinearGradient
              colors={['#A6FFEA', ACCENT, '#08B5A0']}
              start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }}
              style={styles.orb}
            />
            <View style={styles.orbHighlight} pointerEvents="none" />
            <View style={styles.orbCenter} pointerEvents="none">
              <Ionicons name={icon} size={26} color="#fff" />
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Benefits list */}
          <View style={styles.benefits}>
            {benefits.slice(0, 6).map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.checkOrb}>
                  <Ionicons name="checkmark" size={11} color={ACCENT} />
                </View>
                <Text style={styles.benefitTxt}>{b}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable onPress={goPaywall} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <LinearGradient
              colors={['#7BFCE3', ACCENT]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill as any}
            />
            <Ionicons name="sparkles" size={15} color="#0F1115" />
            <Text style={styles.ctaTxt}>Voir les offres Pro</Text>
          </Pressable>

          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.later}>Plus tard</Text>
          </Pressable>
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
  },
  topSheen: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  orbWrap: {
    alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36,
    overflow: 'hidden',
    marginVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 18,
  },
  orb: { flex: 1 },
  orbHighlight: {
    position: 'absolute', top: 8, left: 12,
    width: 22, height: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.30)',
    transform: [{ rotate: '-25deg' }],
  },
  orbCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    color: '#fff', fontSize: 22, fontWeight: '800',
    letterSpacing: -0.5, textAlign: 'center', marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 19,
    textAlign: 'center', marginHorizontal: 8, marginBottom: 16,
  },
  benefits: { gap: 10, marginBottom: 16, paddingHorizontal: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkOrb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(22,224,198,0.14)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,224,198,0.32)',
  },
  benefitTxt: { color: '#fff', fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
  cta: {
    height: 50, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    overflow: 'hidden',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 14,
    marginBottom: 10,
  },
  ctaTxt: { color: '#0F1115', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  later: {
    color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center',
    paddingVertical: 8,
  },
});
