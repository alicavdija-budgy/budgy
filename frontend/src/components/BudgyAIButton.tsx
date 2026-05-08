/**
 * BUDGY — Central AI Button
 *
 * Premium central tab-bar button per Session 2 design spec:
 *   - 64×64px black circle with cyan border (#16E0C6)
 *   - "B" Budgy logo in turquoise center
 *   - Subtle pulse animation (2.5s loop)
 *   - Glow / drop-shadow turquoise (radius 20-30px, opacity ~20%)
 *   - Light haptic on press
 *   - Loading & pressed states
 *
 * On press → opens the AI Menu modal (5 actions).
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const ACCENT = '#16E0C6';
const ACCENT_GLOW = 'rgba(22, 224, 198, 0.35)';
const ACCENT_BG = 'rgba(22, 224, 198, 0.08)';
const BG = '#0F1115';

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function BudgyAIButton({ onPress, loading, disabled }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Continuous pulse (subtle ring expansion + fade)
  useEffect(() => {
    if (disabled || loading) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, loading]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 200,
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

  // Pulse ring transforms
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.18, 0] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Pulse ring (decorative) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          {
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel="Assistant IA Budgy"
        testID="budgy-ai-button"
        style={({ pressed }) => [styles.hitbox, pressed && { opacity: 0.95 }]}
      >
        <Animated.View style={[styles.button, { transform: [{ scale }] }]}>
          {loading ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Text style={styles.logoB}>B</Text>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const SIZE = 56;
const HITBOX = 76;

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
  pulseRing: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: ACCENT,
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
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: ACCENT,
    // Glow shadow (iOS) — radius/opacity tuned per spec
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    // Android elevation as a soft proxy
    elevation: 8,
  },
  logoB: {
    color: ACCENT,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: -1,
    marginTop: -2,
    textShadowColor: ACCENT_GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
