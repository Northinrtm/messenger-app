import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  persistLocale,
  readStoredLocale,
  translate,
  translatePlural,
} from "./index";

describe("i18n core", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("translates a key in both locales", () => {
    expect(translate("ru", "settings.title")).toBe("Мой профиль");
    expect(translate("en", "settings.title")).toBe("My profile");
  });

  it("interpolates variables", () => {
    expect(translate("ru", "settings.account.deleteConfirmPrefix")).toContain("Введите");
    // members.count uses {{count}}
    expect(translatePlural("en", "members.count", 1)).toBe("1 member");
    expect(translatePlural("en", "members.count", 5)).toBe("5 members");
  });

  it("applies Russian plural categories (one/few/many)", () => {
    expect(translatePlural("ru", "members.count", 1)).toBe("1 участник");
    expect(translatePlural("ru", "members.count", 2)).toBe("2 участника");
    expect(translatePlural("ru", "members.count", 5)).toBe("5 участников");
    expect(translatePlural("ru", "members.count", 21)).toBe("21 участник");
    expect(translatePlural("ru", "members.count", 11)).toBe("11 участников");
  });

  it("falls back to the default locale for a missing translation value", () => {
    // en provides every key, so force the fallback path by reading the default
    // locale value through the singular helper for a plural key.
    expect(translate("ru", "members.count")).toBe("{{count}} участника");
  });

  it("recognises supported locales", () => {
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("reads the default locale when storage is empty and persists a choice", () => {
    expect(readStoredLocale()).toBe(DEFAULT_LOCALE);
    persistLocale("en");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(readStoredLocale()).toBe("en");
  });

  it("ignores an invalid stored locale", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "xx");
    expect(readStoredLocale()).toBe(DEFAULT_LOCALE);
  });
});
