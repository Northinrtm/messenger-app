import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  refreshSession: vi.fn(),
}));

vi.mock("../lib/e2ee", () => ({
  hasUnlockedPrivateEncryptionKey: vi.fn(() => true),
  lockUnlockedEncryptionState: vi.fn(),
  syncEncryptionDeviceState: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/session", () => ({
  getSessionRefreshDelay: vi.fn(() => 60_000),
  isRefreshCompatible: vi.fn((_current, next) => Boolean(next)),
  isAccessTokenExpired: vi.fn(() => false),
  shouldRefreshSessionSoon: vi.fn(() => false),
}));

vi.mock("../features/auth/AuthCard", () => ({
  AuthCard: (props: {
    initialEmailVerificationToken?: string | null;
    onEmailVerificationHandled?: () => void;
  }) => (
    <div>
      <div>auth-card:{props.initialEmailVerificationToken ?? "none"}</div>
      <button type="button" onClick={() => props.onEmailVerificationHandled?.()}>
        handled
      </button>
    </div>
  ),
}));

vi.mock("../features/auth/UnlockCard", () => ({
  UnlockCard: () => <div>unlock-card</div>,
}));

vi.mock("../features/chat/NorthMessengerWorkspace", () => ({
  NorthMessengerWorkspace: () => <div>workspace</div>,
}));

import { refreshSession } from "../lib/api";
import { App } from "./App";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function sessionResponse() {
  return {
    token: "access-token",
    tokenExpiresAt: "2026-04-19T08:00:00Z",
    sessionId: "session-1",
    user: {
      id: "user-1",
      username: "north",
      displayName: "North",
      profession: null,
      createdAt: "2026-04-18T08:00:00Z",
      avatarUrl: null,
      online: true,
      email: "north@example.com",
      emailVerified: true,
      emailVerificationEnabled: true,
    },
  };
}

async function flushMicrotasks(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("App email verification flow", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/?verifyEmailToken=verify-token");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    window.history.replaceState({}, "", "/");
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("restores the existing session after handling a verification link", async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce(sessionResponse());

    await act(async () => {
      root!.render(<App />);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("auth-card:verify-token");
    expect(container.textContent).not.toContain("workspace");

    await act(async () => {
      const button = container.querySelector("button");
      if (!button) {
        throw new Error("Handled button is missing");
      }
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("workspace");
    expect(window.location.search).toBe("");
  });
});
