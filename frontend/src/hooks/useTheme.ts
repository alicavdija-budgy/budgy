/**
 * GUARDIAN MONEY CHF - Theme Hook
 * Supports 'dark' | 'light' | 'system' modes with reactive updates.
 * Drop-in replacement for `Colors` static import.
 */

import { useColorScheme } from 'react-native';
import { useStore } from '../stores/useStore';
import { darkColors, lightColors, type ThemePalette } from '../constants/palettes';

export type ThemeMode = 'dark' | 'light' | 'system';

export function useTheme(): ThemePalette {
  const system = useColorScheme();
  const mode = useStore((s) => (s.preferences as any).themeMode as ThemeMode | undefined) || 'dark';
  const resolved: 'dark' | 'light' =
    mode === 'system' ? (system === 'light' ? 'light' : 'dark') : (mode as 'dark' | 'light');
  return resolved === 'light' ? lightColors : darkColors;
}

/** Returns 'dark' | 'light' based on preference + system */
export function useThemeMode(): 'dark' | 'light' {
  const system = useColorScheme();
  const mode = useStore((s) => (s.preferences as any).themeMode as ThemeMode | undefined) || 'dark';
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode as 'dark' | 'light';
}
