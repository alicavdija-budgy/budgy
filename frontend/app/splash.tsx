/**
 * BUDGY - Animated Splash Screen
 * Displays the official Budgy icon on the brand-navy background.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

export default function Splash({ onDone }: { onDone?: () => void }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0.25);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) });
    opacity.value = withTiming(1, { duration: 600 });
    glow.value = withRepeat(
      withTiming(0.55, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
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
    <View style={styles.container}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={styles.name}>Budgy</Text>
        <Text style={styles.tag}>Vos finances, en toute sérénité 🇨🇭</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1530',
  },
  glow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
  },
  logoWrap: {
    alignItems: 'center',
  },
  icon: {
    width: 140,
    height: 140,
    borderRadius: 32,
    marginBottom: 22,
  },
  name: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  tag: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.3,
  },
});
