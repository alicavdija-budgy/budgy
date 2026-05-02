/**
 * BUDGY - AnimatedProgressBar
 * Smooth animated progress bar with dynamic gradient color.
 *  - Green:    <= 80%
 *  - Orange:   80-100%
 *  - Red:      > 100%
 * Uses Reanimated 3 for native 60fps animation.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface Props {
  value: number;                   // percentage 0-200+
  height?: number;
  radius?: number;
  duration?: number;
  trackColor?: string;
  forceColor?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
}

const GRADIENTS = {
  safe: ['#06D6A0', '#0891B2'] as const,       // green→cyan
  warn: ['#FBBF24', '#F59E0B'] as const,       // yellow→orange
  danger: ['#F43F5E', '#DC2626'] as const,     // rose→red
};

export const AnimatedProgressBar: React.FC<Props> = ({
  value,
  height = 10,
  radius = 999,
  duration = 900,
  trackColor = 'rgba(255, 255, 255, 0.08)',
  forceColor,
  style,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    const capped = Math.max(0, Math.min(100, value));
    progress.value = withTiming(capped, { duration, easing: Easing.out(Easing.cubic) });
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const gradient = forceColor
    ? forceColor
    : value > 100
    ? GRADIENTS.danger
    : value > 80
    ? GRADIENTS.warn
    : GRADIENTS.safe;

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: radius, backgroundColor: trackColor },
        style,
      ]}
    >
      <Animated.View style={[styles.fillWrap, animStyle, { borderRadius: radius }]}>
        <LinearGradient
          colors={gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fillWrap: { height: '100%', overflow: 'hidden' },
});

export default AnimatedProgressBar;
