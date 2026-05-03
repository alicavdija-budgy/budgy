/**
 * BUDGY - Animated Splash Screen
 * Premium violet→cyan gradient with logo pulse
 * Optional: shows before home for 1.5s on cold start
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

export default function Splash({ onDone }: { onDone?: () => void }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) });
    opacity.value = withTiming(1, { duration: 600 });
    glow.value = withRepeat(
      withTiming(0.7, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    const t = setTimeout(() => onDone?.(), 1800);
    return () => clearTimeout(t);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <LinearGradient
      colors={['#7C3AED', '#6366F1', '#22D3EE']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoB}>B</Text>
        </View>
        <Text style={styles.name}>Budgy</Text>
        <Text style={styles.tag}>Vos finances, en toute sérénité 🇨🇭</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 400, height: 400, borderRadius: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  logoWrap: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  logoB: {
    color: '#FFF',
    fontSize: 62,
    fontWeight: '900',
    letterSpacing: -2,
  },
  name: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  tag: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
