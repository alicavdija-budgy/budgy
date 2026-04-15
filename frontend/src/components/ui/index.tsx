/**
 * GUARDIAN MONEY CHF - Reusable UI Components
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../constants/theme';

// Button Component
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: ViewStyle;
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
  const getColors = () => {
    switch (variant) {
      case 'success':
        return Colors.gradientSuccess;
      case 'danger':
        return Colors.gradientError;
      case 'secondary':
        return ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)'];
      case 'ghost':
        return ['transparent', 'transparent'];
      default:
        return Colors.gradientPrimary;
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[fullWidth && { width: '100%' }, style]}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={getColors() as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.button,
          getPadding(),
          variant === 'ghost' && styles.buttonGhost,
          variant === 'secondary' && styles.buttonSecondary,
          disabled && styles.buttonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.text} size="small" />
        ) : (
          <View style={styles.buttonContent}>
            {icon && (
              <Ionicons
                name={icon}
                size={size === 'sm' ? 16 : 20}
                color={variant === 'ghost' ? Colors.textSecondary : Colors.text}
                style={{ marginRight: Spacing.sm }}
              />
            )}
            <Text
              style={[
                styles.buttonText,
                { fontSize: getFontSize() },
                variant === 'ghost' && { color: Colors.textSecondary },
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

// Card Component
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  borderColor?: string;
}

export function Card({ children, style, onPress, borderColor }: CardProps) {
  const cardContent = (
    <View
      style={[
        styles.card,
        borderColor && { borderColor, borderWidth: 1 },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {cardContent}
      </TouchableOpacity>
    );
  }

  return cardContent;
}

// Progress Bar Component
interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  color = Colors.primary,
  height = 6,
  showLabel = false,
}: ProgressBarProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <View style={styles.progressContainer}>
      <View style={[styles.progressTrack, { height }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${clampedValue}%`,
              backgroundColor: color,
              height,
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={styles.progressLabel}>{Math.round(clampedValue)}%</Text>
      )}
    </View>
  );
}

// Badge Component
interface BadgeProps {
  text: string;
  color?: string;
  size?: 'sm' | 'md';
}

export function Badge({ text, color = Colors.primary, size = 'sm' }: BadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}20`,
          borderColor: `${color}40`,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 8 : 12,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color, fontSize: size === 'sm' ? 10 : 12 }]}>
        {text}
      </Text>
    </View>
  );
}

// Icon Button Component
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
  color = Colors.text,
  backgroundColor,
}: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.iconButton,
        backgroundColor && {
          backgroundColor,
          padding: Spacing.sm,
          borderRadius: BorderRadius.full,
        },
      ]}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={size} color={color} />
    </TouchableOpacity>
  );
}

// Amount Display Component
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
  const getSizeStyles = (): TextStyle => {
    switch (size) {
      case 'sm':
        return { fontSize: FontSizes.sm };
      case 'lg':
        return { fontSize: FontSizes.xl };
      case 'xl':
        return { fontSize: FontSizes.xxxl };
      default:
        return { fontSize: FontSizes.lg };
    }
  };

  const displayColor = color || (amount >= 0 ? Colors.text : Colors.error);
  const sign = showSign ? (amount >= 0 ? '+' : '') : '';
  const formattedAmount = Math.abs(amount).toLocaleString('fr-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <Text style={[styles.amountText, getSizeStyles(), { color: displayColor }]}>
      {sign}{currency} {formattedAmount}
    </Text>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={48} color={Colors.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {action && (
        <Button
          title={action.label}
          onPress={action.onPress}
          variant="primary"
          size="sm"
          style={{ marginTop: Spacing.lg }}
        />
      )}
    </View>
  );
}

// Section Header Component
interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress}>
          <Text style={styles.sectionAction}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Button styles
  button: {
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.text,
    fontWeight: FontWeights.bold,
  },

  // Card styles
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },

  // Progress bar styles
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressTrack: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: BorderRadius.full,
  },
  progressLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    minWidth: 35,
    textAlign: 'right',
  },

  // Badge styles
  badge: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: FontWeights.bold,
  },

  // Icon button styles
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Amount styles
  amountText: {
    fontWeight: FontWeights.black,
    fontVariant: ['tabular-nums'],
  },

  // Empty state styles
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // Section header styles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
