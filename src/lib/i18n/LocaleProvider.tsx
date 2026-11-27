'use client';

import * as React from 'react';
import {
  getAiOutputLanguage,
  setAiOutputLanguage,
  type AiOutputLanguage,
} from '@/lib/client/byokSession';

export type Locale = 'id' | 'en';

const LOCALE_STORAGE_KEY = 'rancang.locale.v1';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  outputLang: AiOutputLanguage;
  setOutputLang: (next: AiOutputLanguage) => void;
  /** Convenience inline bilingual picker: t('Teks Indonesia', 'English text'). */
  t: (idText: string, enText: string) => string;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>('id');
  const [outputLang, setOutputLangState] = React.useState<AiOutputLanguage>('id');

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'id') {
        setLocaleState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      /* ignore private mode */
    }
    setOutputLangState(getAiOutputLanguage());
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, []);

  const setOutputLang = React.useCallback((next: AiOutputLanguage) => {
    setOutputLangState(next);
    setAiOutputLanguage(next);
  }, []);

  const t = React.useCallback(
    (idText: string, enText: string) => (locale === 'en' ? enText : idText),
    [locale],
  );

  const value = React.useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, outputLang, setOutputLang, t }),
    [locale, setLocale, outputLang, setOutputLang, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: 'id',
      setLocale: () => {},
      outputLang: 'id',
      setOutputLang: () => {},
      t: (idText) => idText,
    };
  }
  return ctx;
}
