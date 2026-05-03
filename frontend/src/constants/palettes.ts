/**
 * BUDGY - Premium Light & Dark Palettes
 * Brand identity: Navy + Emerald green + Teal cyan
 * Primary: Emerald green (#34D399)
 * Secondary: Teal cyan (#22D3EE) — accents / PRO / CTA
 * Background: Navy (#0A0F20 / #0E1530)
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
  secondary: string;
  secondaryLight: string;
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
  gradientPrimary: readonly [string, string, ...string[]];
  gradientSuccess: readonly [string, string];
  gradientWarning: readonly [string, string];
  gradientError: readonly [string, string];
  gradientHero: readonly [string, string, string];
  gradientGlow: string;
}

// ─── DARK — signature Budgy (Navy + Emerald) ─────────
export const darkColors: ThemePalette = {
  background: '#0A0F20',
  backgroundSecondary: '#0E1530',
  backgroundTertiary: '#161E40',
  card: 'rgba(255, 255, 255, 0.045)',
  cardHover: 'rgba(255, 255, 255, 0.09)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',

  primary: '#34D399',                 // Emerald green (Budgy signature)
  primaryLight: '#6EE7B7',
  primaryDark: '#10B981',

  secondary: '#22D3EE',               // Teal cyan accent
  secondaryLight: '#67E8F9',

  success: '#10B981',
  successLight: '#34D399',
  successDark: '#059669',

  error: '#F43F5E',
  errorLight: '#FB7185',
  errorDark: '#E11D48',

  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#22D3EE',
  infoLight: '#67E8F9',

  text: '#FFFFFF',
  textSecondary: '#B7C0D6',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',

  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#FB923C',
  teal: '#2DD4BF',
  cyan: '#22D3EE',

  gradientPrimary: ['#34D399', '#22D3EE'],
  gradientSuccess: ['#10B981', '#34D399'],
  gradientWarning: ['#FBBF24', '#F59E0B'],
  gradientError: ['#F43F5E', '#E11D48'],
  gradientHero: ['#0E1530', '#143A2E', '#34D399'],
  gradientGlow: 'rgba(52, 211, 153, 0.35)',
};

// ─── LIGHT — soft premium ───────────────────────────
export const lightColors: ThemePalette = {
  background: '#F7FAF9',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#ECFDF5',
  card: '#FFFFFF',
  cardHover: 'rgba(52, 211, 153, 0.06)',
  cardBorder: 'rgba(15, 23, 42, 0.08)',

  primary: '#059669',
  primaryLight: '#10B981',
  primaryDark: '#047857',

  secondary: '#0891B2',
  secondaryLight: '#06B6D4',

  success: '#059669',
  successLight: '#10B981',
  successDark: '#047857',

  error: '#DC2626',
  errorLight: '#EF4444',
  errorDark: '#B91C1C',

  warning: '#D97706',
  warningLight: '#F59E0B',
  info: '#0891B2',
  infoLight: '#06B6D4',

  text: '#0A0F20',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textMuted: '#94A3B8',

  purple: '#8B5CF6',
  pink: '#DB2777',
  orange: '#EA580C',
  teal: '#0D9488',
  cyan: '#0891B2',

  gradientPrimary: ['#34D399', '#22D3EE'],
  gradientSuccess: ['#10B981', '#34D399'],
  gradientWarning: ['#D97706', '#B45309'],
  gradientError: ['#DC2626', '#B91C1C'],
  gradientHero: ['#ECFDF5', '#A7F3D0', '#34D399'],
  gradientGlow: 'rgba(52, 211, 153, 0.18)',
};
