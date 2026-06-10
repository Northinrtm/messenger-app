// i18n primitives for the Android client. Mirrors the web client's lightweight
// approach (no extra deps) but persists the locale via AsyncStorage.

export type Locale = 'ru' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['ru', 'en'];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'app_pref_locale';

/**
 * Plural forms keyed by Intl.PluralRules categories. `other` is always
 * required; the rest are optional and fall back to `other`.
 */
export type PluralForms = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

export type TranslationValue = string | PluralForms;

export type InterpolationVars = Record<string, string | number>;
