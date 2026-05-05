/**
 * BUDGY - ZoomableImage
 * Pinch-to-zoom and pan with smooth gesture handling.
 * Double-tap to reset / zoom in. Bounded scale [1, 5]. Pan only when zoomed.
 *
 * Usage:
 *   <ZoomableImage source={{ uri: ... }} style={{ width: '100%', height: 460 }} />
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  ImageSourcePropType,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'react-native';
import { Colors } from '../constants/theme';

interface Props {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  minScale?: number;
  maxScale?: number;
  /** Triggered when user double-taps. */
  onDoubleTap?: () => void;
}

const SPRING_CONFIG = { damping: 20, stiffness: 220 };

export default function ZoomableImage({
  source,
  style,
  resizeMode = 'contain',
  minScale = 1,
  maxScale = 5,
  onDoubleTap,
}: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [loading, setLoading] = useState(true);

  const reset = () => {
    'worklet';
    scale.value = withSpring(1, SPRING_CONFIG);
    savedScale.value = 1;
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, minScale), maxScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        reset();
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      // Only allow pan when zoomed in
      if (scale.value > 1.02) {
        translateX.value = savedX.value + e.translationX;
        translateY.value = savedY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (onDoubleTap) runOnJS(onDoubleTap)();
      // toggle zoom 1 ↔ 2.5
      if (scale.value > 1.5) {
        reset();
      } else {
        scale.value = withSpring(2.5, SPRING_CONFIG);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    doubleTap,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={[styles.root, style]}>
      <View style={styles.clip}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.fill, animatedStyle]}>
            <ExpoImage
              source={source}
              style={styles.fill}
              resizeMode={resizeMode}
              onLoadEnd={() => setLoading(false)}
            />
          </Animated.View>
        </GestureDetector>
        {loading && (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
