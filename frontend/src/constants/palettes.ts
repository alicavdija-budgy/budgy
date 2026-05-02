/**
 * BUDGY - Premium Light & Dark Palettes (Revolut/N26-inspired)
 * Primary: Violet (signature)
 * Secondary: Gold (PRO/CTA accent)
 * Success: Cyan-Emerald (financial positive)
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
  secondary: string;       // NEW - gold accent
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
  // Signature gradients
  gradientPrimary: readonly [string, string, ...string[]];
  gradientSuccess: readonly [string, string];
  gradientWarning: readonly [string, string];
  gradientError: readonly [string, string];
  gradientHero: readonly [string, string, string];   // 3-stop for hero card
  gradientGlow: string;                               // glow under hero
}

// ─── DARK — signature Budgy ─────────────────────────
export const darkColors: ThemePalette = {
  background: '#0A0A14',            // deep near-black with hint of violet
  backgroundSecondary: '#12121F',
  backgroundTertiary: '#1C1C2E',
  card: 'rgba(255, 255, 255, 0.045)',
  cardHover: 'rgba(255, 255, 255, 0.09)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',

  primary: '#7C3AED',                // bolder violet
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',

  secondary: '#FBBF24',              // gold accent (PRO / CTA)
  secondaryLight: '#FCD34D',

  success: '#06D6A0',                // mint/cyan-emerald
  successLight: '#34E5B2',
  successDark: '#04A97D',

  error: '#F43F5E',                  // rose-red premium
  errorLight: '#FB7185',
  errorDark: '#E11D48',

  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#22D3EE',                   // cyan
  infoLight: '#67E8F9',

  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',

  purple: '#A78BFA',
  pink: '#F472B6',
  orange: '#FB923C',
  teal: '#2DD4BF',
  cyan: '#22D3EE',

  gradientPrimary: ['#7C3AED', '#6366F1'],
  gradientSuccess: ['#06D6A0', '#0891B2'],
  gradientWarning: ['#FBBF24', '#F59E0B'],
  gradientError: ['#F43F5E', '#E11D48'],
  gradientHero: ['#7C3AED', '#6366F1', '#22D3EE'],   // violet→indigo→cyan magic
  gradientGlow: 'rgba(124, 58, 237, 0.35)',
};

// ─── LIGHT — soft premium ───────────────────────────
export const lightColors: ThemePalette = {
  background: '#F7F7FB',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#EFEFF4',
  card: '#FFFFFF',
  cardHover: 'rgba(124, 58, 237, 0.04)',
  cardBorder: 'rgba(15, 23, 42, 0.08)',

  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',

  secondary: '#D97706',
  secondaryLight: '#F59E0B',

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

  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textMuted: '#94A3B8',

  purple: '#7C3AED',
  pink: '#DB2777',
  orange: '#EA580C',
  teal: '#0D9488',
  cyan: '#0891B2',

  gradientPrimary: ['#7C3AED', '#6366F1'],
  gradientSuccess: ['#059669', '#0891B2'],
  gradientWarning: ['#D97706', '#B45309'],
  gradientError: ['#DC2626', '#B91C1C'],
  gradientHero: ['#7C3AED', '#6366F1', '#22D3EE'],
  gradientGlow: 'rgba(124, 58, 237, 0.20)',
};
