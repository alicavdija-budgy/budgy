/**
 * BUDGY - ConfettiBurst
 * Lightweight celebration animation using Reanimated.
 * No external dependencies.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const { width: W } = Dimensions.get('window');
const PARTICLE_COUNT = 28;
const COLORS = ['#7C3AED', '#06D6A0', '#FBBF24', '#F43F5E', '#22D3EE', '#EC4899', '#6366F1'];

interface Piece {
  key: number;
  color: string;
  startX: number;
  endX: number;
  endY: number;
  rotation: number;
  delay: number;
  size: number;
}

const generatePieces = (): Piece[] =>
  Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
    key: i,
    color: COLORS[i % COLORS.length],
    startX: W / 2 + (Math.random() - 0.5) * 60,
    endX: W / 2 + (Math.random() - 0.5) * W * 0.9,
    endY: 400 + Math.random() * 300,
    rotation: Math.random() * 720 - 360,
    delay: Math.random() * 200,
    size: 6 + Math.random() * 6,
  }));

interface Props {
  trigger?: boolean;
  onDone?: () => void;
}

const ConfettiPiece: React.FC<{ piece: Piece; onDone?: () => void; isLast: boolean }> = ({ piece, onDone, isLast }) => {
  const progress = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }, () => {
          if (isLast) runOnJS(onDone || (() => {}))();
        })
      )
    );
    rotation.value = withDelay(piece.delay, withTiming(piece.rotation, { duration: 1800 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: piece.startX + (piece.endX - piece.startX) * progress.value },
      { translateY: progress.value * piece.endY - 100 },
      { rotate: `${rotation.value}deg` },
      { scale: progress.value > 0.9 ? 1 - (progress.value - 0.9) * 8 : 1 },
    ],
    opacity: progress.value > 0.9 ? 1 - (progress.value - 0.9) * 8 : 1,
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        style,
        { width: piece.size, height: piece.size, backgroundColor: piece.color },
      ]}
    />
  );
};

export const ConfettiBurst: React.FC<Props> = ({ trigger = true, onDone }) => {
  const [pieces, setPieces] = React.useState<Piece[]>([]);

  useEffect(() => {
    if (trigger) {
      setPieces(generatePieces());
    } else {
      setPieces([]);
    }
  }, [trigger]);

  if (!trigger || pieces.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {pieces.map((p, idx) => (
        <ConfettiPiece key={p.key} piece={p} onDone={onDone} isLast={idx === pieces.length - 1} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
  },
  piece: {
    position: 'absolute',
    top: 0, left: 0,
    borderRadius: 2,
  },
});

export default ConfettiBurst;
