import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  isLocale,
  setActiveLocale,
  translate,
  translatePlural,
  type Locale,
  type TranslationKey,
} from './index';
import {DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type InterpolationVars} from './types';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: InterpolationVars) => string;
  tp: (key: TranslationKey, count: number, vars?: InterpolationVars) => string;
};

const defaultValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  tp: (key, count, vars) => translatePlural(DEFAULT_LOCALE, key, count, vars),
};

const I18nContext = createContext<I18nContextValue>(defaultValue);

export function I18nProvider({children}: {children: ReactNode}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then(stored => {
        if (cancelled) {
          return;
        }
        const next = isLocale(stored) ? stored : DEFAULT_LOCALE;
        setActiveLocale(next);
        setLocaleState(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      tp: (key, count, vars) => translatePlural(locale, key, count, vars),
    }),
    [locale, setLocale],
  );

  if (!ready) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
