import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  logout: vi.fn(async () => undefined),
}));

vi.mock("../../lib/e2ee", () => ({
  lockUnlockedEncryptionState: vi.fn(),
}));

vi.mock("../../lib/e2eeTrustedBrowser", () => ({
  hasTrustedBrowserUnlock: vi.fn(() => false),
  isTrustedBrowserUnlockSupported: vi.fn(() => false),
}));

import { logout } from "../../lib/api";
import { lockUnlockedEncryptionState } from "../../lib/e2ee";
import { UnlockCard } from "./UnlockCard";

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

function renderUnlockCard(root: Root, node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  root.render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("UnlockCard sign out", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    vi.clearAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("locks remembered encrypted state instead of clearing it on sign out", async () => {
    const signedOutSpy = vi.fn();

    await act(async () => {
      renderUnlockCard(
        root!,
        <UnlockCard
          session={sessionResponse()}
          onUnlocked={vi.fn()}
          onSignedOut={signedOutSpy}
        />
      );
      await flushMicrotasks();
    });

    const signOutButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Sign out")
    );
    if (!signOutButton) {
      throw new Error("Sign out button is missing");
    }

    await act(async () => {
      signOutButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(lockUnlockedEncryptionState).toHaveBeenCalledWith("user-1");
    expect(signedOutSpy).toHaveBeenCalledTimes(1);
  });
});
