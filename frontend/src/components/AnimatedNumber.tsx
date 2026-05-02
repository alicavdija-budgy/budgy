/**
 * BUDGY - AnimatedNumber (count-up effect)
 * Smooth count-up animation for hero balance.
 * Uses react-native-reanimated for 60fps native driver.
 */

import React, { useEffect } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

interface Props {
  value: number;
  duration?: number;           // ms
  decimals?: number;           // number of decimals
  prefix?: string;             // e.g. 'CHF '
  style?: StyleProp<TextStyle>;
  useSwissFormat?: boolean;    // 1'234.56 style
}

function formatCH(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return dec ? `${formatted}.${dec}` : formatted;
}

export const AnimatedNumber: React.FC<Props> = ({
  value,
  duration = 1200,
  decimals = 0,
  prefix = '',
  style,
  useSwissFormat = true,
}) => {
  const [display, setDisplay] = React.useState<string>(
    useSwissFormat ? formatCH(value, decimals) : value.toFixed(decimals)
  );
  const progress = useSharedValue(0);
  const startRef = React.useRef(0);
  const endRef = React.useRef(value);

  useEffect(() => {
    startRef.current = parseFloat(display.replace(/[^0-9.-]/g, '')) || 0;
    endRef.current = value;
    progress.value = 0;
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [value]);

  useDerivedValue(() => {
    const cur = startRef.current + (endRef.current - startRef.current) * progress.value;
    const formatted = useSwissFormat ? formatCH(cur, decimals) : cur.toFixed(decimals);
    runOnJS(setDisplay)(formatted);
  });

  return <Text style={style}>{prefix}{display}</Text>;
};

export default AnimatedNumber;
