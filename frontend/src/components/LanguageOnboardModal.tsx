/**
 * BUDGY — Language Onboarding Modal
 *
 * Shown ONCE at first launch (before any auth/onboarding) so the user can
 * pick the app language explicitly. Auto-detects the device locale and
 * pre-selects FR/EN/DE/IT accordingly. Decision is persisted in the
 * Zustand store (persist middleware → AsyncStorage).
 *
 * Triggers on: !preferences.languagePicked
 * Sets:        preferences.language, preferences.languagePicked = true
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  NativeModules,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../stores/useStore';
import { useTheme } from '../hooks/useTheme';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '../constants/theme';
import { Button } from './ui';

type Language = 'fr' | 'en' | 'de' | 'it';

const LANGUAGES: Array<{
  code: Language;
  flag: string;
  nativeName: string;
  englishName: string;
}> = [
  { code: 'fr', flag: '🇫🇷', nativeName: 'Français', englishName: 'French' },
  { code: 'en', flag: '🇬🇧', nativeName: 'English', englishName: 'English' },
  { code: 'de', flag: '🇩🇪', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'it', flag: '🇮🇹', nativeName: 'Italiano', englishName: 'Italian' },
];

const WELCOME: Record<Language, { title: string; subtitle: string; cta: string }> = {
  fr: { title: 'Bienvenue sur Budgy', subtitle: 'Choisissez votre langue', cta: 'Continuer' },
  en: { title: 'Welcome to Budgy', subtitle: 'Choose your language', cta: 'Continue' },
  de: { title: 'Willkommen bei Budgy', subtitle: 'Wählen Sie Ihre Sprache', cta: 'Weiter' },
  it: { title: 'Benvenuto su Budgy', subtitle: 'Scegli la tua lingua', cta: 'Continua' },
};

/** Detect device locale without any extra dependency. */
function detectDeviceLanguage(): Language {
  try {
    let locale = '';
    if (Platform.OS === 'ios') {
      const settings: any = NativeModules.SettingsManager?.settings;
      locale =
        settings?.AppleLocale ||
        (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : '') ||
        '';
    } else if (Platform.OS === 'android') {
      const im: any = NativeModules.I18nManager;
      locale = im?.localeIdentifier || '';
    }
    if (!locale && typeof (globalThis as any).Intl !== 'undefined') {
      locale = (globalThis as any).Intl.DateTimeFormat().resolvedOptions().locale || '';
    }
    locale = (locale || '').toLowerCase();
    if (locale.startsWith('fr')) return 'fr';
    if (locale.startsWith('en')) return 'en';
    if (locale.startsWith('de')) return 'de';
    if (locale.startsWith('it')) return 'it';
  } catch {}
  return 'fr';
}

export function LanguageOnboardModal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const preferences = useStore((s) => s.preferences);
  const setPreferences = useStore((s) => s.setPreferences);

  const visible = !preferences?.languagePicked;
  const [selected, setSelected] = useState<Language>((preferences?.language as Language) || 'fr');

  // On first mount only, auto-pick the device language as preview
  useEffect(() => {
    if (!preferences?.languagePicked) {
      const detected = detectDeviceLanguage();
      setSelected(detected);
      // Immediately reflect detected language so the modal renders in it
      if (detected !== preferences?.language) {
        setPreferences({ language: detected });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const labels = WELCOME[selected] || WELCOME.fr;

  const confirm = () => {
    setPreferences({ language: selected, languagePicked: true });
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={[
          styles.scrim,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.headerWrap}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.primary}1A` }]}>
            <Ionicons name="language" size={36} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{labels.title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {labels.subtitle}
          </Text>
        </View>

        <View style={styles.list}>
          {LANGUAGES.map((lang) => {
            const isActive = selected === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => {
                  setSelected(lang.code);
                  setPreferences({ language: lang.code });
                }}
                activeOpacity={0.85}
                style={[
                  styles.row,
                  {
                    backgroundColor: isActive ? `${theme.primary}14` : theme.card,
                    borderColor: isActive ? theme.primary : theme.cardBorder,
                  },
                ]}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {lang.nativeName}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.textTertiary }]}>
                    {lang.englishName}
                  </Text>
                </View>
                {isActive ? (
                  <Ionicons name="checkmark-circle" size={28} color={theme.primary} />
                ) : (
                  <View
                    style={[
                      styles.radio,
                      { borderColor: theme.cardBorder },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.ctaWrap}>
          <Button title={labels.cta} onPress={confirm} fullWidth size="lg" icon="arrow-forward" />
        </View>
      </View>
    </Modal>
  );
}

export default LanguageOnboardModal;

const makeStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
      justifyContent: 'space-between',
    },
    headerWrap: {
      alignItems: 'center',
      marginTop: Spacing.xl,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: FontSizes.xxl,
      fontWeight: FontWeights.black,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    subtitle: {
      fontSize: FontSizes.md,
      textAlign: 'center',
    },
    list: {
      gap: Spacing.sm,
      marginTop: Spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.lg,
      borderRadius: BorderRadius.xl,
      borderWidth: 1.5,
      gap: Spacing.md,
    },
    flag: {
      fontSize: 32,
    },
    rowTitle: {
      fontSize: FontSizes.lg,
      fontWeight: FontWeights.bold,
    },
    rowSub: {
      fontSize: FontSizes.xs,
      marginTop: 2,
    },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
    },
    ctaWrap: {
      marginTop: Spacing.xl,
    },
  });
