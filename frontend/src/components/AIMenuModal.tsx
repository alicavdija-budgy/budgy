/**
 * BUDGY — AI Menu Modal (Premium edition)
 *
 * Inspiration: Apple Intelligence sheet · ChatGPT iOS · Revolut Ultra · Arc.
 *
 * Visuals:
 *   - Backdrop dimmed + blurred (BlurView)
 *   - Bottom sheet with frosted-glass background + soft top stroke
 *   - Refined header: aurora orb (gradient circle) + title + caption
 *   - Cards with subtle gradient, no harsh dividers
 *   - Staggered fade-up entrance per card (200-400ms cascade)
 *   - Light haptics on press
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const ACCENT = '#16E0C6';
const ACCENT_SOFT = 'rgba(22, 224, 198, 0.18)';

interface ActionItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  /** Soft tint for the icon orb */
  tint?: string;
}

const ACTIONS: ActionItem[] = [
  {
    id: 'analyse-finances',
    icon: 'analytics-outline',
    title: 'Analyse finances',
    subtitle: 'Vue complète de vos finances',
    route: '/more/ai-optimizer',
    tint: 'rgba(22, 224, 198, 0.14)',
  },
  {
    id: 'scanner',
    icon: 'scan-outline',
    title: 'Scanner intelligent',
    subtitle: 'Scan IA de factures & reçus',
    route: '/scanner-modal',
    tint: 'rgba(116, 178, 255, 0.14)',
  },
  {
    id: 'abonnements',
    icon: 'sync-outline',
    title: 'Analyse abonnements',
    subtitle: 'Détecte vos abonnements récurrents',
    route: '/more/recurring',
    tint: 'rgba(190, 153, 255, 0.14)',
  },
  {
    id: 'conseils',
    icon: 'sparkles-outline',
    title: 'Conseils économies',
    subtitle: 'Recommandations IA personnalisées',
    route: '/more/predict',
    tint: 'rgba(255, 200, 122, 0.14)',
  },
  {
    id: 'factures',
    icon: 'document-text-outline',
    title: 'Analyse factures',
    subtitle: 'Extraction & insights IA',
    route: '/more/email-import',
    tint: 'rgba(255, 130, 184, 0.14)',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AIMenuModal({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // One Animated.Value per row for staggered entrance
  const anims = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      headerAnim.setValue(0);
      anims.forEach((a) => a.setValue(0));
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      Animated.stagger(
        55,
        anims.map((a) =>
          Animated.timing(a, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start();
    }
  }, [visible]);

  const handleAction = (item: ActionItem) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
    onClose();
    setTimeout(() => {
      try {
        router.push(item.route as any);
      } catch (e) {
        console.warn('[AIMenuModal] navigation failed:', e);
      }
    }, 120);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop with iOS blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 30 : 0}
        tint="dark"
        style={StyleSheet.absoluteFill as any}
      >
        <Pressable style={styles.dim} onPress={onClose} />
      </BlurView>

      <Pressable style={styles.bottomAnchor} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
        >
          {/* Glass body */}
          <BlurView
            intensity={Platform.OS === 'ios' ? 60 : 0}
            tint="dark"
            style={StyleSheet.absoluteFill as any}
          />
          <LinearGradient
            colors={['rgba(22, 26, 33, 0.94)', 'rgba(11, 14, 18, 0.98)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill as any}
          />
          {/* Top hairline stroke (very subtle) */}
          <View style={styles.topStroke} />

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [
                  {
                    translateY: headerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.orbWrap}>
              <LinearGradient
                colors={['#7BFCE3', ACCENT, '#0E8C7B']}
                start={{ x: 0.1, y: 0.1 }}
                end={{ x: 0.9, y: 0.9 }}
                style={styles.orbInner}
              />
              <View style={styles.orbHighlight} pointerEvents="none" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>BUDGY · AI</Text>
              <Text style={styles.title}>Que souhaitez-vous analyser ?</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </Animated.View>

          {/* Action cards */}
          <View style={styles.list}>
            {ACTIONS.map((item, idx) => (
              <Animated.View
                key={item.id}
                style={{
                  opacity: anims[idx],
                  transform: [
                    {
                      translateY: anims[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                  ],
                }}
              >
                <Pressable
                  onPress={() => handleAction(item)}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.045)', 'rgba(255,255,255,0.015)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill as any}
                  />
                  <View style={[styles.iconOrb, { backgroundColor: item.tint || ACCENT_SOFT }]}>
                    <Ionicons name={item.icon} size={20} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                </Pressable>
              </Animated.View>
            ))}
          </View>

          {/* Footnote */}
          <Animated.Text
            style={[
              styles.foot,
              {
                opacity: headerAnim,
              },
            ]}
          >
            Propulsé par Budgy AI · vos données restent privées
          </Animated.Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  bottomAnchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  topStroke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(22, 224, 198, 0.20)',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 22,
  },
  // Aurora orb — gradient sphere with a glassy highlight
  orbWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  orbInner: {
    flex: 1,
  },
  orbHighlight: {
    position: 'absolute',
    top: 4,
    left: 6,
    width: 18,
    height: 12,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.22)',
    transform: [{ rotate: '-25deg' }],
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: 'rgba(22, 224, 198, 0.35)',
  },
  iconOrb: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 224, 198, 0.22)',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12.5,
    marginTop: 2,
    letterSpacing: 0,
  },
  foot: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
    letterSpacing: 0.2,
  },
});
