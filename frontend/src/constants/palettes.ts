/**
 * BUDGY - Premium Light & Dark Palettes
 *
 * Brand identity: Navy + Emerald green + Teal cyan
 * Primary: Emerald green (#34D399)
 * Secondary: Teal cyan (#22D3EE)
 *
 * Light mode is engineered for App Store quality:
 *   - True white cards on cool grey page background
 *   - High-contrast text (AA+)
 *   - Soft iOS shadows (rgba black) instead of dark overlays
 *   - Distinct tokens for cards, inputs, modals, tab bar, glass surfaces
 */

export interface ThemePalette {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  pageBackground: string;     // Alias for main page bg
  // Cards
  card: string;
  cardHover: string;
  cardBorder: string;
  elevatedCard: string;
  premiumBorder: string;
  premiumShadow: string;      // rgba shadow color
  premiumShadowOpacity: number;
  glassSurface: string;
  // Tab bar / nav
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  // Inputs / modals
  inputBackground: string;
  inputBorder: string;
  inputFocusBorder: string;
  modalBackground: string;
  modalScrim: string;         // overlay behind modals
  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  // Semantic
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
  // Text
  text: string;               // primary
  textPrimary: string;        // alias of text
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  placeholder: string;
  // Accents
  purple: string;
  pink: string;
  orange: string;
  teal: string;
  cyan: string;
  // Premium gold tokens — used ONLY on Pro / Premium / paid surfaces
  gold: string;
  goldSoft: string;
  goldDark: string;
  goldGlow: string;
  // Gradients
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
  pageBackground: '#0A0F20',

  card: 'rgba(255, 255, 255, 0.045)',
  cardHover: 'rgba(255, 255, 255, 0.09)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  elevatedCard: 'rgba(255, 255, 255, 0.08)',
  premiumBorder: 'rgba(255, 255, 255, 0.10)',
  premiumShadow: '#000000',
  premiumShadowOpacity: 0.45,
  glassSurface: 'rgba(255, 255, 255, 0.06)',

  tabBarBackground: '#0E1530',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  tabBarActive: '#34D399',
  tabBarInactive: '#6B7280',

  inputBackground: 'rgba(255, 255, 255, 0.05)',
  inputBorder: 'rgba(255, 255, 255, 0.10)',
  inputFocusBorder: '#34D399',
  modalBackground: '#0E1530',
  modalScrim: 'rgba(0, 0, 0, 0.65)',

  primary: '#34D399',
  primaryLight: '#6EE7B7',
  primaryDark: '#10B981',
  secondary: '#22D3EE',
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
  textPrimary: '#FFFFFF',
  textSecondary: '#B7C0D6',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',
  placeholder: '#6B7280',

  // Premium gold — used ONLY on Pro / paid surfaces (badges, prices, borders)
  gold: '#D4AF37',
  goldSoft: '#F2D16B',
  goldDark: '#8C6A1F',
  goldGlow: 'rgba(212, 175, 55, 0.22)',

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

// ─── LIGHT — Premium iOS / Fintech App Store quality ─
export const lightColors: ThemePalette = {
  // Backgrounds — cool grey page, true white cards
  background: '#F6F8FB',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#EEF2F7',
  pageBackground: '#F6F8FB',

  // Cards — true white + subtle border + soft iOS shadow
  card: '#FFFFFF',
  cardHover: '#F1F5F9',
  cardBorder: '#E2E8F0',
  elevatedCard: '#FFFFFF',
  premiumBorder: '#E2E8F0',
  premiumShadow: '#0F172A',
  premiumShadowOpacity: 0.06,
  glassSurface: 'rgba(255, 255, 255, 0.78)',

  // Tab bar — clear, blur-friendly
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabBarActive: '#059669',
  tabBarInactive: '#64748B',

  // Inputs / modals — premium iOS feel
  inputBackground: '#F1F5F9',
  inputBorder: '#E2E8F0',
  inputFocusBorder: '#059669',
  modalBackground: '#FFFFFF',
  modalScrim: 'rgba(15, 23, 42, 0.40)',

  // Brand — darker emerald for AA contrast on light bg
  primary: '#059669',
  primaryLight: '#10B981',
  primaryDark: '#047857',
  secondary: '#0891B2',
  secondaryLight: '#06B6D4',

  // Semantic — App Store-grade hues
  success: '#10B981',
  successLight: '#34D399',
  successDark: '#047857',
  error: '#DC2626',
  errorLight: '#EF4444',
  errorDark: '#B91C1C',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  info: '#0891B2',
  infoLight: '#06B6D4',

  // Text — user-specified hex for AA contrast
  text: '#0F172A',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textTertiary: '#64748B',
  textMuted: '#94A3B8',
  placeholder: '#94A3B8',

  // Accents
  purple: '#7C3AED',
  pink: '#DB2777',
  orange: '#EA580C',
  teal: '#0D9488',
  cyan: '#0891B2',

  // Premium gold — used ONLY on Pro / paid surfaces
  gold: '#B8860B',         // slightly darker for AA contrast on light
  goldSoft: '#D4AF37',
  goldDark: '#8C6A1F',
  goldGlow: 'rgba(184, 134, 11, 0.18)',

  // Gradients — preserve Budgy identity, tuned for light bg
  gradientPrimary: ['#10B981', '#06B6D4'],
  gradientSuccess: ['#10B981', '#34D399'],
  gradientWarning: ['#F59E0B', '#D97706'],
  gradientError: ['#EF4444', '#DC2626'],
  // Hero card kept SATURATED green even in light mode so white text stays readable.
  // App Store fintech apps (Revolut, Curve…) do the same.
  gradientHero: ['#10B981', '#22D3EE', '#0891B2'],
  gradientGlow: 'rgba(16, 185, 129, 0.18)',
};
