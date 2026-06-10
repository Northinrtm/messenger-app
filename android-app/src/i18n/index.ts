import {en} from './en';
import {ru, type TranslationKey} from './ru';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type InterpolationVars,
  type Locale,
  type PluralForms,
  type TranslationValue,
} from './types';

export type {TranslationKey} from './ru';
export type {Locale} from './types';
export {DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES} from './types';

const DICTIONARIES: Record<Locale, Record<TranslationKey, TranslationValue>> = {
  ru,
  en,
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export function interpolate(template: string, vars?: InterpolationVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

function lookup(locale: Locale, key: TranslationKey): TranslationValue {
  const value = DICTIONARIES[locale][key];
  if (value !== undefined) {
    return value;
  }
  // Fall back to the default locale, then to the key itself.
  return DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: InterpolationVars,
): string {
  const value = lookup(locale, key);
  const template = typeof value === 'string' ? value : value.other;
  return interpolate(template, vars);
}

export function translatePlural(
  locale: Locale,
  key: TranslationKey,
  count: number,
  vars?: InterpolationVars,
): string {
  const value = lookup(locale, key);
  const mergedVars = {count, ...vars};
  if (typeof value === 'string') {
    return interpolate(value, mergedVars);
  }

  const category = new Intl.PluralRules(locale).select(count);
  const form: keyof PluralForms = category;
  const template = value[form] ?? value.other;
  return interpolate(template, mergedVars);
}

// --- Active-locale mirror -------------------------------------------------
// For non-React code (pure helpers, imperative handlers) that cannot read the
// React context. The provider keeps this in sync with the rendered locale.

let activeLocale: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function tActive(key: TranslationKey, vars?: InterpolationVars): string {
  return translate(activeLocale, key, vars);
}

export function tpActive(
  key: TranslationKey,
  count: number,
  vars?: InterpolationVars,
): string {
  return translatePlural(activeLocale, key, count, vars);
}
