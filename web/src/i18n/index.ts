import { en } from "./en";
import { ru, type TranslationKey } from "./ru";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  type InterpolationVars,
  type Locale,
  type PluralForms,
  type TranslationValue,
} from "./types";

export type { Locale, TranslationKey };
export { LOCALES, DEFAULT_LOCALE, LOCALE_STORAGE_KEY };

const translations: Record<Locale, Record<TranslationKey, TranslationValue>> = {
  ru,
  en,
};

function interpolate(template: string, vars?: InterpolationVars): string {
  if (!vars) {
    return template;
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

function resolveValue(locale: Locale, key: TranslationKey): TranslationValue {
  // Fall back to the default locale (and finally to the key) so a missing
  // translation is visible but never crashes the UI.
  return translations[locale][key] ?? translations[DEFAULT_LOCALE][key] ?? key;
}

export function translate(locale: Locale, key: TranslationKey, vars?: InterpolationVars): string {
  const value = resolveValue(locale, key);
  if (typeof value !== "string") {
    // A plural entry was requested through the singular helper — use its `other`
    // form rather than rendering "[object Object]".
    return interpolate(value.other, vars);
  }
  return interpolate(value, vars);
}

export function translatePlural(
  locale: Locale,
  key: TranslationKey,
  count: number,
  vars?: InterpolationVars,
): string {
  const value = resolveValue(locale, key);
  const mergedVars: InterpolationVars = { count, ...vars };
  if (typeof value === "string") {
    return interpolate(value, mergedVars);
  }

  const category = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
  const form = value[category] ?? value.other;
  return interpolate(form, mergedVars);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// Active locale mirror for non-React code (pure helpers, cache layer) that cannot
// use the React hook. The provider keeps this in sync on every locale change.
let activeLocale: Locale = typeof window === "undefined" ? DEFAULT_LOCALE : readStoredLocale();

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

// Standalone translators bound to the active locale, for use outside React.
export function tActive(key: TranslationKey, vars?: InterpolationVars): string {
  return translate(activeLocale, key, vars);
}

export function tpActive(key: TranslationKey, count: number, vars?: InterpolationVars): string {
  return translatePlural(activeLocale, key, count, vars);
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (private mode, quota) — the in-memory locale still applies.
  }
}
