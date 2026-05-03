/**
 * BUDGY - Design System
 * Colors, Typography, Spacing
 * Brand identity: Navy blue + Emerald green + Teal cyan
 */

export const Colors = {
  // Primary backgrounds (Budgy navy)
  background: '#0A0F20',
  backgroundSecondary: '#0E1530',
  backgroundTertiary: '#161E40',
  
  // Cards and surfaces
  card: 'rgba(255, 255, 255, 0.04)',
  cardHover: 'rgba(255, 255, 255, 0.08)',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  
  // Brand colors (Budgy green/teal)
  primary: '#34D399', // Emerald green
  primaryLight: '#6EE7B7',
  primaryDark: '#10B981',
  
  // Secondary (Teal cyan - accents)
  secondary: '#22D3EE',
  secondaryLight: '#67E8F9',
  secondaryDark: '#0891B2',
  
  // Semantic colors
  success: '#10B981',
  successLight: '#34D399',
  successDark: '#059669',
  
  error: '#EF4444',
  errorLight: '#F87171',
  errorDark: '#DC2626',
  
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  
  info: '#22D3EE',
  infoLight: '#67E8F9',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#B7C0D6',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',
  
  // Accent colors for categories
  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#F97316',
  teal: '#14B8A6',
  cyan: '#22D3EE',
  
  // Gradients (Budgy green/teal)
  gradientPrimary: ['#34D399', '#22D3EE'],
  gradientSuccess: ['#10B981', '#34D399'],
  gradientWarning: ['#F59E0B', '#D97706'],
  gradientError: ['#EF4444', '#DC2626'],
  gradientCool: ['#22D3EE', '#8B5CF6'],
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
