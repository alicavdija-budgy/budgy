/**
 * BUDGY - PressScale (universal press feedback)
 * Wraps any touchable to give premium press-scale + haptic feedback.
 */

import React from 'react';
import { Pressable, PressableProps, Platform, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'selection' | 'none';
  style?: StyleProp<ViewStyle>;
}

export const PressScale: React.FC<Props> = ({
  children,
  scaleTo = 0.96,
  haptic = 'light',
  onPressIn,
  onPressOut,
  onPress,
  style,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const triggerHaptic = () => {
    if (haptic === 'none' || Platform.OS === 'web') return;
    try {
      if (haptic === 'selection') Haptics.selectionAsync();
      else Haptics.impactAsync(
        haptic === 'light'
          ? Haptics.ImpactFeedbackStyle.Light
          : haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Heavy
      );
    } catch {}
  };

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          scale.value = withSpring(scaleTo, { damping: 15, stiffness: 200 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
          onPressOut?.(e);
        }}
        onPress={(e) => {
          triggerHaptic();
          onPress?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

export default PressScale;
