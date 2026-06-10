// Shared i18n types kept dependency-free so locale dictionaries can import them
// without creating an import cycle with the provider/index module.

export type Locale = "ru" | "en";

export const LOCALES: Locale[] = ["ru", "en"];

export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_STORAGE_KEY = "north-messenger-locale";

// Plural forms follow the Unicode CLDR categories. `other` is mandatory and used
// as the fallback; the rest are optional so English (one/other) and Russian
// (one/few/many/other) dictionaries can both be expressed naturally.
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
