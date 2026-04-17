/**
 * GUARDIAN MONEY CHF - Beautiful Charts
 * Custom SVG charts: Donut, Bars, Ring Progress
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../constants/theme';

// ─── Donut Chart ────────────────────────────────────────
interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({
  data,
  size = 200,
  strokeWidth = 28,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  let currentAngle = -90; // Start from top

  const arcs = data.map((slice) => {
    const pct = total > 0 ? slice.value / total : 0;
    const angle = pct * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + angle) * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    if (pct === 0) return null;

    // For a full circle
    if (pct >= 0.999) {
      return (
        <Circle
          key={slice.label}
          cx={center}
          cy={center}
          r={radius}
          stroke={slice.color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    }

    return (
      <Path
        key={slice.label}
        d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
        stroke={slice.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    );
  });

  return (
    <View style={styles.donutContainer}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {arcs}
      </Svg>
      {(centerLabel || centerValue) && (
        <View style={[styles.donutCenter, { width: size, height: size }]}>
          {centerValue && (
            <Text style={styles.donutCenterValue}>{centerValue}</Text>
          )}
          {centerLabel && (
            <Text style={styles.donutCenterLabel}>{centerLabel}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Mini Bar Chart ─────────────────────────────────────
interface BarData {
  value: number;
  label: string;
  color?: string;
}

interface MiniBarChartProps {
  data: BarData[];
  height?: number;
  barWidth?: number;
  showLabels?: boolean;
  accentColor?: string;
}

export function MiniBarChart({
  data,
  height = 120,
  barWidth = 28,
  showLabels = true,
  accentColor = Colors.primary,
}: MiniBarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const chartWidth = data.length * (barWidth + 8);

  return (
    <View style={styles.barContainer}>
      <View style={[styles.barChart, { height }]}>
        {data.map((d, i) => {
          const barH = Math.max((d.value / maxVal) * (height - 24), 4);
          const isLast = i === data.length - 1;
          const barColor = d.color || (isLast ? accentColor : `${accentColor}60`);

          return (
            <View key={i} style={styles.barItem}>
              <Text style={styles.barValue}>
                {d.value > 999 ? `${Math.round(d.value / 1000)}k` : d.value}
              </Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barH,
                    width: barWidth,
                    backgroundColor: barColor,
                    borderRadius: barWidth / 4,
                  },
                ]}
              />
              {showLabels && (
                <Text style={styles.barLabel}>{d.label}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Ring Progress ───────────────────────────────────────
interface RingProgressProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

export function RingProgress({
  value,
  size = 80,
  strokeWidth = 8,
  color = Colors.primary,
  label,
  sublabel,
}: RingProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 100);
  const offset = circumference * (1 - progress / 100);
  const center = size / 2;

  return (
    <View style={styles.ringContainer}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={[styles.ringCenter, { width: size, height: size }]}>
        <Text style={[styles.ringValue, { color }]}>{Math.round(progress)}%</Text>
      </View>
      {label && <Text style={styles.ringLabel}>{label}</Text>}
      {sublabel && <Text style={styles.ringSublabel}>{sublabel}</Text>}
    </View>
  );
}

// ─── Sparkline ──────────────────────────────────────────
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  data,
  width = 100,
  height = 32,
  color = Colors.primary,
}: SparklineProps) {
  if (data.length < 2) return null;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - minVal) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Path
        d={`M ${points.split(' ').map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ')}`}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  donutContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterValue: {
    color: Colors.text,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black,
  },
  donutCenterLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  barContainer: {
    overflow: 'hidden',
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  barItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barValue: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    marginBottom: 4,
  },
  bar: {
    minHeight: 4,
  },
  barLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 4,
  },
  ringContainer: {
    alignItems: 'center',
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.black,
  },
  ringLabel: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: 4,
  },
  ringSublabel: {
    color: Colors.textTertiary,
    fontSize: 10,
  },
});
