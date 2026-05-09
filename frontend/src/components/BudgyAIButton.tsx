/**
 * BUDGY — Central AI Button (Premium edition)
 *
 * Inspiration: Apple Intelligence · ChatGPT iOS · Revolut Ultra · Arc · Nothing OS.
 *
 * Visuals:
 *   - Layered diffuse glow (3 rings, soft cyan, never neon)
 *   - Frosted-glass body (BlurView) over a near-black gradient
 *   - Inner top highlight + bottom shadow → subtle 3D depth
 *   - Refined "B" logotype with thin gradient outline
 *   - Slow breathing animation (4.5s ease-in-out) instead of pulse
 *   - Light haptic on press
 *
 * Spec mantras: discreet luxury, no gaming feel, no harsh neon.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

// ── Palette — never push above these intensities to keep the "luxe discret" feel
const ACCENT = '#16E0C6';
const ACCENT_SOFT = 'rgba(22, 224, 198, 0.28)';
const ACCENT_GLOW_OUTER = 'rgba(22, 224, 198, 0.10)';
const ACCENT_GLOW_MID = 'rgba(22, 224, 198, 0.18)';
const BG_TOP = '#1B2027';
const BG_BOTTOM = '#0B0E12';

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function BudgyAIButton({ onPress, loading, disabled }: Props) {
  // Press scale (spring)
  const pressScale = useRef(new Animated.Value(1)).current;
  // Slow breathing (organic)
  const breath = useRef(new Animated.Value(0)).current;
  // Outer glow rotation (very subtle, gives "alive" quality)
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled || loading) return;

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 4500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 4500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    breathLoop.start();
    orbitLoop.start();
    return () => {
      breathLoop.stop();
      orbitLoop.stop();
    };
  }, [disabled, loading]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const breathOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const ringRotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.94,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 220,
    }).start();
  };

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    onPress();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Layer 1 — diffuse outer glow (largest, softest) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowOuter,
          { opacity: breathOpacity, transform: [{ scale: breathScale }] },
        ]}
      />
      {/* Layer 2 — mid glow halo, slowly rotating to feel "alive" */}
      <Animated.View
        pointerEvents="none"
        style={[styles.glowMid, { transform: [{ rotate: ringRotate }] }]}
      />
      {/* Layer 3 — fine inner ring (the only visible border) */}
      <View pointerEvents="none" style={styles.innerRing} />

      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel="Assistant IA Budgy"
        testID="budgy-ai-button"
        style={styles.hitbox}
        hitSlop={8}
      >
        <Animated.View style={[styles.button, { transform: [{ scale: pressScale }] }]}>
          {/* Glass + dark gradient body */}
          <LinearGradient
            colors={[BG_TOP, BG_BOTTOM]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill as any}
          />
          <BlurView
            intensity={Platform.OS === 'ios' ? 22 : 0}
            tint="dark"
            style={StyleSheet.absoluteFill as any}
          />
          {/* Top inner highlight (subtle 3D) */}
          <LinearGradient
            colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.55 }}
            style={[StyleSheet.absoluteFill, styles.topHighlight] as any}
          />

          {/* Logo or loader */}
          {loading ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Svg width={28} height={32} viewBox="0 0 28 32">
              <Defs>
                <SvgGradient id="bGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#7BFCE3" stopOpacity="1" />
                  <Stop offset="1" stopColor={ACCENT} stopOpacity="1" />
                </SvgGradient>
              </Defs>
              <SvgText
                x="14"
                y="24"
                fontSize="22"
                fontFamily={Platform.OS === 'ios' ? 'Avenir-Heavy' : 'sans-serif-medium'}
                fontWeight="800"
                fill="url(#bGradient)"
                textAnchor="middle"
              >
                B
              </SvgText>
            </Svg>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const SIZE = 58;
const HITBOX = 84;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -22,
    left: '50%',
    marginLeft: -HITBOX / 2,
    width: HITBOX,
    height: HITBOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Diffuse, large, very soft outer glow — never harsh
  glowOuter: {
    position: 'absolute',
    width: SIZE + 36,
    height: SIZE + 36,
    borderRadius: (SIZE + 36) / 2,
    backgroundColor: ACCENT_GLOW_OUTER,
    // iOS softness via shadow
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
  },
  glowMid: {
    position: 'absolute',
    width: SIZE + 14,
    height: SIZE + 14,
    borderRadius: (SIZE + 14) / 2,
    borderWidth: 1,
    borderColor: ACCENT_GLOW_MID,
    // Make the rotation visible: a tiny break in the ring
    borderTopColor: 'transparent',
    borderRightColor: ACCENT_SOFT,
  },
  innerRing: {
    position: 'absolute',
    width: SIZE + 1,
    height: SIZE + 1,
    borderRadius: (SIZE + 1) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 224, 198, 0.55)',
  },
  hitbox: {
    width: HITBOX,
    height: HITBOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Bottom drop-shadow for depth (very subtle)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  topHighlight: {
    borderTopLeftRadius: SIZE / 2,
    borderTopRightRadius: SIZE / 2,
  },
});
