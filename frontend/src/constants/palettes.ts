/**
 * GUARDIAN MONEY CHF - Light & Dark Palettes
 * Used by useTheme() hook for reactive theme switching.
 */

export interface ThemePalette {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  card: string;
  cardHover: string;
  cardBorder: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  success: string;
  successLight: string;
  successDark: string;
  error: string;
  errorLight: string;
  errorDark: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  purple: string;
  pink: string;
  orange: string;
  teal: string;
  cyan: string;
  gradientPrimary: readonly [string, string];
  gradientSuccess: readonly [string, string];
  gradientWarning: readonly [string, string];
  gradientError: readonly [string, string];
}

export const darkColors: ThemePalette = {
  background: '#07070F',
  backgroundSecondary: '#0F0F1A',
  backgroundTertiary: '#1A1A2E',
  card: 'rgba(255, 255, 255, 0.04)',
  cardHover: 'rgba(255, 255, 255, 0.08)',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  success: '#10B981',
  successLight: '#34D399',
  successDark: '#059669',
  error: '#EF4444',
  errorLight: '#F87171',
  errorDark: '#DC2626',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#0EA5E9',
  infoLight: '#38BDF8',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',
  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#F97316',
  teal: '#14B8A6',
  cyan: '#0EA5E9',
  gradientPrimary: ['#6366F1', '#8B5CF6'],
  gradientSuccess: ['#10B981', '#059669'],
  gradientWarning: ['#F59E0B', '#D97706'],
  gradientError: ['#EF4444', '#DC2626'],
};

export const lightColors: ThemePalette = {
  background: '#F5F5F7',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#F0F0F5',
  card: 'rgba(0, 0, 0, 0.03)',
  cardHover: 'rgba(0, 0, 0, 0.06)',
  cardBorder: 'rgba(0, 0, 0, 0.08)',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  success: '#059669',
  successLight: '#10B981',
  successDark: '#047857',
  error: '#DC2626',
  errorLight: '#EF4444',
  errorDark: '#B91C1C',
  warning: '#D97706',
  warningLight: '#F59E0B',
  info: '#0284C7',
  infoLight: '#0EA5E9',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textMuted: '#94A3B8',
  purple: '#7C3AED',
  pink: '#DB2777',
  orange: '#EA580C',
  teal: '#0D9488',
  cyan: '#0891B2',
  gradientPrimary: ['#6366F1', '#8B5CF6'],
  gradientSuccess: ['#059669', '#047857'],
  gradientWarning: ['#D97706', '#B45309'],
  gradientError: ['#DC2626', '#B91C1C'],
};
