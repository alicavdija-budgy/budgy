/**
 * GUARDIAN MONEY CHF - Design System
 * Colors, Typography, Spacing
 */

export const Colors = {
  // Primary backgrounds
  background: '#07070F',
  backgroundSecondary: '#0F0F1A',
  backgroundTertiary: '#1A1A2E',
  
  // Cards and surfaces
  card: 'rgba(255, 255, 255, 0.04)',
  cardHover: 'rgba(255, 255, 255, 0.08)',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  
  // Brand colors
  primary: '#6366F1', // Violet
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  
  // Semantic colors
  success: '#10B981', // Green for income/positive
  successLight: '#34D399',
  successDark: '#059669',
  
  error: '#EF4444', // Red for expenses/negative
  errorLight: '#F87171',
  errorDark: '#DC2626',
  
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  
  info: '#0EA5E9',
  infoLight: '#38BDF8',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',
  
  // Accent colors for categories
  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#F97316',
  teal: '#14B8A6',
  cyan: '#0EA5E9',
  
  // Gradients
  gradientPrimary: ['#6366F1', '#8B5CF6'],
  gradientSuccess: ['#10B981', '#059669'],
  gradientWarning: ['#F59E0B', '#D97706'],
  gradientError: ['#EF4444', '#DC2626'],
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 22,
  full: 999,
} as const;

export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
  hero: 42,
} as const;

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;
