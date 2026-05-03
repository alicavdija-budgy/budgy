/**
 * BUDGY - AnimatedNumber (robust count-up, no infinite loop)
 * Uses JS setInterval with requestAnimationFrame for 60fps count-up.
 * Safe for all platforms including iOS Expo Go.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  style?: StyleProp<TextStyle>;
  useSwissFormat?: boolean;
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
  const [display, setDisplay] = useState<number>(value);
  const rafRef = useRef<number | null>(null);
  const startValue = useRef<number>(value);
  const startTime = useRef<number>(0);
  const targetValue = useRef<number>(value);

  useEffect(() => {
    // Cancel any ongoing animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    startValue.current = display;
    targetValue.current = value;
    startTime.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (targetValue.current - startValue.current) * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(targetValue.current);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  const formatted = useSwissFormat ? formatCH(display, decimals) : display.toFixed(decimals);

  return <Text style={style}>{prefix}{formatted}</Text>;
};

export default AnimatedNumber;
