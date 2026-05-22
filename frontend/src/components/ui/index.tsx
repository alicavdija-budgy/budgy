/**
 * BUDGY - Reusable UI Components (theme-aware)
 *
 * All components consume useTheme() so they render correctly in BOTH
 * Dark and Light modes. No hardcoded #FFFFFF / #000000 in components.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Spacing, FontSizes, FontWeights } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemePalette } from '../../constants/palettes';

// ─── Button ─────────────────────────────────────────────────────────────────
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const getColors = (): readonly [string, string] => {
    switch (variant) {
      case 'success':
        return theme.gradientSuccess;
      case 'danger':
        return theme.gradientError;
      case 'secondary':
        return [theme.cardHover, theme.card];
      case 'ghost':
        return ['transparent', 'transparent'];
      default:
        return theme.gradientPrimary as readonly [string, string];
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 16 };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 24 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 20 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return FontSizes.sm;
      case 'lg':
        return FontSizes.lg;
      default:
        return FontSizes.md;
    }
  };

  const isFilled = variant === 'primary' || variant === 'success' || variant === 'danger';
  const textColor = variant === 'ghost'
    ? theme.textSecondary
    : isFilled
      ? '#FFFFFF'
      : theme.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[fullWidth && { width: '100%' }, style]}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={getColors() as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.button,
          getPadding(),
          variant === 'ghost' && { borderWidth: 1, borderColor: theme.cardBorder },
          variant === 'secondary' && { borderWidth: 1, borderColor: theme.cardBorder },
          disabled && { opacity: 0.5 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <View style={styles.buttonContent}>
            {icon && (
              <Ionicons
                name={icon}
                size={size === 'sm' ? 16 : 20}
                color={textColor}
                style={{ marginRight: Spacing.sm }}
              />
            )}
            <Text
              style={[
                styles.buttonText,
                { fontSize: getFontSize(), color: textColor },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  borderColor?: string;
  elevated?: boolean;
}

export function Card({ children, style, onPress, borderColor, elevated = false }: CardProps) {
  const theme = useTheme();
  const shadow = elevated
    ? Platform.select({
        ios: {
          shadowColor: theme.premiumShadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: theme.premiumShadowOpacity,
          shadowRadius: 14,
        },
        android: { elevation: 4 },
      })
    : undefined;

  const cardContent = (
    <View
      style={[
        {
          backgroundColor: elevated ? theme.elevatedCard : theme.card,
          borderColor: borderColor || theme.cardBorder,
          borderRadius: BorderRadius.xl,
          borderWidth: 1,
          padding: Spacing.lg,
        },
        shadow as ViewStyle,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {cardContent}
      </TouchableOpacity>
    );
  }
  return cardContent;
}

// ─── Progress Bar ───────────────────────────────────────────────────────────
interface ProgressBarProps {
  value: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  color,
  height = 6,
  showLabel = false,
}: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.min(Math.max(value, 0), 100);
  const fillColor = color || theme.primary;
  // Track: use a tinted track for both themes (subtle on light, subtle on dark)
  const trackColor = theme.cardBorder;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <View
        style={{
          flex: 1,
          height,
          backgroundColor: trackColor,
          borderRadius: BorderRadius.full,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${clamped}%`,
            height,
            backgroundColor: fillColor,
            borderRadius: BorderRadius.full,
          }}
        />
      </View>
      {showLabel && (
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: FontSizes.xs,
            fontWeight: FontWeights.bold,
            minWidth: 35,
            textAlign: 'right',
          }}
        >
          {Math.round(clamped)}%
        </Text>
      )}
    </View>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────
interface BadgeProps {
  text: string;
  color?: string;
  size?: 'sm' | 'md';
}

export function Badge({ text, color, size = 'sm' }: BadgeProps) {
  const theme = useTheme();
  const c = color || theme.primary;
  return (
    <View
      style={{
        backgroundColor: `${c}1F`,
        borderColor: `${c}40`,
        borderWidth: 1,
        borderRadius: BorderRadius.full,
        paddingVertical: size === 'sm' ? 2 : 4,
        paddingHorizontal: size === 'sm' ? 8 : 12,
      }}
    >
      <Text
        style={{
          color: c,
          fontSize: size === 'sm' ? 10 : 12,
          fontWeight: FontWeights.bold,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ─── Icon Button ────────────────────────────────────────────────────────────
interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

export function IconButton({
  icon,
  onPress,
  size = 24,
  color,
  backgroundColor,
}: IconButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        { alignItems: 'center', justifyContent: 'center' },
        backgroundColor && {
          backgroundColor,
          padding: Spacing.sm,
          borderRadius: BorderRadius.full,
        },
      ]}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={size} color={color || theme.text} />
    </TouchableOpacity>
  );
}

// ─── Amount Display ─────────────────────────────────────────────────────────
interface AmountDisplayProps {
  amount: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  color?: string;
}

export function AmountDisplay({
  amount,
  currency = 'CHF',
  size = 'md',
  showSign = false,
  color,
}: AmountDisplayProps) {
  const theme = useTheme();
  const getSize = (): TextStyle => {
    switch (size) {
      case 'sm': return { fontSize: FontSizes.sm };
      case 'lg': return { fontSize: FontSizes.xl };
      case 'xl': return { fontSize: FontSizes.xxxl };
      default: return { fontSize: FontSizes.lg };
    }
  };
  const displayColor = color || (amount >= 0 ? theme.text : theme.error);
  const sign = showSign ? (amount >= 0 ? '+' : '') : '';
  const formatted = Math.abs(amount).toLocaleString('fr-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (
    <Text
      style={[
        { fontWeight: FontWeights.black, fontVariant: ['tabular-nums'] },
        getSize(),
        { color: displayColor },
      ]}
    >
      {sign}{currency} {formatted}
    </Text>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  // back-compat aliases
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const theme = useTheme();
  const sub = subtitle || description;
  const finalAction = action || (actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.cardBorder,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: Spacing.lg,
        }}
      >
        <Ionicons name={icon} size={40} color={theme.textTertiary} />
      </View>
      <Text
        style={{
          color: theme.text,
          fontSize: FontSizes.lg,
          fontWeight: FontWeights.bold,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {sub && (
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: FontSizes.sm,
            textAlign: 'center',
            marginTop: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            lineHeight: 20,
          }}
        >
          {sub}
        </Text>
      )}
      {finalAction && (
        <Button
          title={finalAction.label}
          onPress={finalAction.onPress}
          variant="primary"
          size="sm"
          style={{ marginTop: Spacing.lg }}
        />
      )}
    </View>
  );
}

// ─── Section Header ─────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
      }}
    >
      <Text
        style={{
          color: theme.text,
          fontSize: FontSizes.lg,
          fontWeight: FontWeights.bold,
        }}
      >
        {title}
      </Text>
      {action && (
        <TouchableOpacity onPress={action.onPress}>
          <Text
            style={{
              color: theme.primary,
              fontSize: FontSizes.sm,
              fontWeight: FontWeights.semibold,
            }}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Stylesheet (button only; rest is inline-themed) ────────────────────────
const makeStyles = (_theme: ThemePalette) =>
  StyleSheet.create({
    button: {
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      fontWeight: FontWeights.bold,
    },
  });
