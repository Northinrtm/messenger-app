import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { I18nProvider, useI18n } from "./I18nProvider";
import { LOCALE_STORAGE_KEY } from "./index";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function Probe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="title">{t("settings.title")}</span>
      <span data-testid="locale">{locale}</span>
      <button type="button" onClick={() => setLocale("en")}>
        en
      </button>
      <button type="button" onClick={() => setLocale("ru")}>
        ru
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    window.localStorage.clear();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("defaults to Russian and switches to English, persisting the choice", () => {
    act(() => {
      root!.render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      );
    });

    expect(container.querySelector('[data-testid="locale"]')?.textContent).toBe("ru");
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe("Мой профиль");

    const enButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "en",
    )!;
    act(() => {
      enButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="locale"]')?.textContent).toBe("en");
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe("My profile");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("falls back to the default locale (Russian) without a provider", () => {
    act(() => {
      root!.render(<Probe />);
    });

    expect(container.querySelector('[data-testid="locale"]')?.textContent).toBe("ru");
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe("Мой профиль");
  });
});
