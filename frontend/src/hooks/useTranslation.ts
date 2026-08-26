/**
 * BUDGY - useTranslation hook
 * Reactive to preferences.language. Falls back to French if key missing.
 *
 * Usage:
 *   const { t, lang } = useTranslation();
 *   <Text>{t('home.balance')}</Text>
 *   <Text>{t('savings.target', { n: 1000 })}</Text>
 */

import { useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { TRANSLATIONS, interpolate, type LangCode } from '../i18n/translations';

export function useTranslation() {
  const language = useStore((s) => s.preferences.language) as LangCode;
  const lang: LangCode = ['fr', 'en', 'de', 'it'].includes(language) ? language : 'fr';

  const t = useCallback(
    (key: string, params?: Record<string, any>): string => {
      const parts = key.split('.');
      if (parts.length < 2) return key;
      const [section, ...rest] = parts;
      const sec = (TRANSLATIONS as any)[section];
      if (!sec) return key;
      const langPack = sec[lang] || sec.fr || {};
      // Support nested keys: e.g. proScreen.benefits.aiSaver
      const drill = (root: any): any => {
        let cur: any = root;
        for (const k of rest) {
          if (cur == null) return undefined;
          cur = cur[k];
        }
        return cur;
      };
      const value = drill(langPack);
      if (typeof value === 'string') return interpolate(value, params);
      const fallback = drill(sec.fr || {});
      if (typeof fallback === 'string') return interpolate(fallback, params);
      return key;
    },
    [lang]
  );

  return { t, lang };
}
