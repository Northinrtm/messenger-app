import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    details: string[];

    constructor(message: string, status = 500, details: string[] = []) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  },
  describeError: (error: unknown) => {
    if (error instanceof Error) {
      const details =
        error instanceof Object && "details" in error && Array.isArray((error as { details?: unknown }).details)
          ? ((error as { details: string[] }).details ?? [])
          : [];
      return [error.message, ...details].filter(Boolean).join(". ");
    }
    return "Unexpected error";
  },
  register: vi.fn(),
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  resendEmailVerification: vi.fn(),
  confirmEmailVerification: vi.fn(),
}));

vi.mock("../../lib/e2ee", () => ({
  ensureEncryptionReady: vi.fn(),
}));

import {
  ApiError,
  confirmEmailVerification,
  login,
  register,
  resendEmailVerification,
} from "../../lib/api";
import { ensureEncryptionReady } from "../../lib/e2ee";
import { AuthCard } from "./AuthCard";

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
      emailVerified: false,
      emailVerificationEnabled: true,
    },
  };
}

async function flushMicrotasks(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderAuthCard(root: Root, node: ReactNode) {
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

describe("AuthCard auth flow", () => {
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

  it("logs the user in immediately after successful registration", async () => {
    const response = sessionResponse();
    const authenticatedSpy = vi.fn();
    vi.mocked(register).mockResolvedValueOnce(response);
    vi.mocked(ensureEncryptionReady).mockResolvedValueOnce(undefined);

    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={authenticatedSpy} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    const displayNameInput = inputs[2] as HTMLInputElement;
    const passwordInput = inputs[3] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "North");
      setInputValue(passwordInput, "riverlantern");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(register).toHaveBeenCalledWith({
      username: "north",
      email: "north@example.com",
      displayName: "North",
      password: "riverlantern",
    });
    expect(ensureEncryptionReady).toHaveBeenCalledWith(response, "riverlantern");
    expect(authenticatedSpy).toHaveBeenCalledWith(response);
    expect(container.textContent).not.toContain("Account created. Sign in to continue.");
    expect(container.textContent).not.toContain("must not be empty");
  });

  it("shows registration errors and clears them when switching to sign in", async () => {
    vi.mocked(register).mockRejectedValueOnce(
      new ApiError("Validation failed", 400, ["displayName: must not be empty"])
    );

    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={vi.fn()} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    const displayNameInput = inputs[2] as HTMLInputElement;
    const passwordInput = inputs[3] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "");
      setInputValue(passwordInput, "riverlantern");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Validation failed. displayName: must not be empty");

    const signInButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Sign in")
    );
    if (!signInButton) {
      throw new Error("Sign in mode button is missing");
    }

    await act(async () => {
      signInButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    expect(container.textContent).not.toContain("displayName: must not be empty");
  });

  it("sign in still works normally", async () => {
    const response = sessionResponse();
    const authenticatedSpy = vi.fn();
    vi.mocked(login).mockResolvedValueOnce(response);
    vi.mocked(ensureEncryptionReady).mockResolvedValueOnce(undefined);

    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={authenticatedSpy} />);
      await flushMicrotasks();
    });

    const signInButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Sign in")
    );
    if (!signInButton) {
      throw new Error("Sign in mode button is missing");
    }

    await act(async () => {
      signInButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(passwordInput, "riverlantern");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(login).toHaveBeenCalledWith({ username: "north", password: "riverlantern" });
    expect(ensureEncryptionReady).toHaveBeenCalledWith(response, "riverlantern");
    expect(authenticatedSpy).toHaveBeenCalledWith(response);
  });

  it("continues sign in when encrypted chat recovery needs a separate unlock", async () => {
    const response = sessionResponse();
    const authenticatedSpy = vi.fn();
    vi.mocked(login).mockResolvedValueOnce(response);
    vi.mocked(ensureEncryptionReady).mockRejectedValueOnce(
      new ApiError("Current password could not restore encrypted chats on this device", 409)
    );

    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={authenticatedSpy} />);
      await flushMicrotasks();
    });

    const signInButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Sign in")
    );
    if (!signInButton) {
      throw new Error("Sign in mode button is missing");
    }

    await act(async () => {
      signInButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(passwordInput, "newriverlantern");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(login).toHaveBeenCalledWith({ username: "north", password: "newriverlantern" });
    expect(ensureEncryptionReady).toHaveBeenCalledWith(response, "newriverlantern");
    expect(authenticatedSpy).toHaveBeenCalledWith(response);
    expect(container.textContent).not.toContain(
      "Current password could not restore encrypted chats on this device"
    );
  });

  it("returns to sign in immediately after opening a valid verification link", async () => {
    vi.mocked(confirmEmailVerification).mockResolvedValueOnce(undefined);
    const handledSpy = vi.fn();

    await act(async () => {
      renderAuthCard(
        root!,
        <AuthCard
          onAuthenticated={vi.fn()}
          initialEmailVerificationToken="verify-token"
          onEmailVerificationHandled={handledSpy}
        />
      );
      await flushMicrotasks();
    });

    expect(confirmEmailVerification).toHaveBeenCalledWith({ token: "verify-token" });
    expect(handledSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Email verified. Sign in to continue.");
    expect(container.textContent).toContain("Username");
    expect(container.textContent).toContain("Password");
    expect(container.textContent).not.toContain("Continue to sign in");
  });

  it("returns to sign in when the email is already verified", async () => {
    vi.mocked(confirmEmailVerification).mockRejectedValueOnce(
      new ApiError("Email is already verified", 409)
    );
    const handledSpy = vi.fn();

    await act(async () => {
      renderAuthCard(
        root!,
        <AuthCard
          onAuthenticated={vi.fn()}
          initialEmailVerificationToken="verify-token"
          onEmailVerificationHandled={handledSpy}
        />
      );
      await flushMicrotasks();
    });

    expect(confirmEmailVerification).toHaveBeenCalledWith({ token: "verify-token" });
    expect(handledSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("This email is already verified. You can sign in now.");
    expect(container.textContent).toContain("Username");
    expect(container.textContent).toContain("Password");
  });

  it("shows expired verification state for an expired link", async () => {
    vi.mocked(confirmEmailVerification).mockRejectedValueOnce(
      new ApiError("Email verification token is expired", 410)
    );

    await act(async () => {
      renderAuthCard(
        root!,
        <AuthCard
          onAuthenticated={vi.fn()}
          initialEmailVerificationToken="expired-token"
          onEmailVerificationHandled={vi.fn()}
        />
      );
      await flushMicrotasks();
    });

    expect(container.textContent).toContain(
      "This verification link has expired. Request a new one to continue."
    );
    expect(container.textContent).toContain("Resend verification email");
  });

  it("resends verification email after opening the resend flow", async () => {
    vi.mocked(confirmEmailVerification).mockRejectedValueOnce(
      new ApiError("Email verification token is expired", 410)
    );
    vi.mocked(resendEmailVerification).mockResolvedValueOnce(undefined);

    function VerificationWrapper() {
      const [token, setToken] = useState<string | null>("expired-token");

      return (
        <AuthCard
          onAuthenticated={vi.fn()}
          initialEmailVerificationToken={token}
          onEmailVerificationHandled={() => setToken(null)}
        />
      );
    }

    await act(async () => {
      renderAuthCard(root!, <VerificationWrapper />);
      await flushMicrotasks();
    });

    const resendButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Resend verification email")
    );
    if (!resendButton) {
      throw new Error("Resend button is missing");
    }

    await act(async () => {
      resendButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement | null;
    if (!emailInput) {
      throw new Error("Email input is missing");
    }

    await act(async () => {
      setInputValue(emailInput, "north@example.com");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(resendEmailVerification).toHaveBeenCalledWith({ email: "north@example.com" });
    expect(container.textContent).toContain(
      "If that email can be verified, a new verification link has been sent."
    );
  });
});
