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

import {
  ApiError,
  confirmEmailVerification,
  login,
  register,
  resendEmailVerification,
} from "../../lib/api";
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

function blurInput(input: HTMLInputElement) {
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function getPrimaryButton(container: HTMLDivElement) {
  const button = container.querySelector(".primary-button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Primary submit button is missing");
  }
  return button;
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

    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={authenticatedSpy} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    const displayNameInput = inputs[2] as HTMLInputElement;
    const passwordInput = inputs[3] as HTMLInputElement;
    const passwordConfirmInput = inputs[4] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "North");
      setInputValue(passwordInput, "riverlantern");
      setInputValue(passwordConfirmInput, "riverlantern");
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
    const passwordConfirmInput = inputs[4] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "North");
      setInputValue(passwordInput, "riverlantern");
      setInputValue(passwordConfirmInput, "riverlantern");
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

  it("does not submit registration when password confirmation does not match", async () => {
    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={vi.fn()} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    const displayNameInput = inputs[2] as HTMLInputElement;
    const passwordInput = inputs[3] as HTMLInputElement;
    const passwordConfirmInput = inputs[4] as HTMLInputElement;

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "North");
      setInputValue(passwordInput, "riverlantern");
      setInputValue(passwordConfirmInput, "riverlantern2");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(register).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Пароли не совпадают.");
  });

  it("shows registration validation errors on blur and enables submit only for valid data", async () => {
    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={vi.fn()} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const usernameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    const displayNameInput = inputs[2] as HTMLInputElement;
    const passwordInput = inputs[3] as HTMLInputElement;
    const passwordConfirmInput = inputs[4] as HTMLInputElement;
    const submitButton = getPrimaryButton(container);

    expect(submitButton.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Минимум 8 символов, хотя бы одна буква."
    );

    await act(async () => {
      blurInput(usernameInput);
      blurInput(emailInput);
      blurInput(displayNameInput);
      blurInput(passwordInput);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Поле обязательное для заполнения");
    expect(usernameInput.getAttribute("aria-invalid")).toBe("true");
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(displayNameInput.getAttribute("aria-invalid")).toBe("true");
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");

    await act(async () => {
      setInputValue(emailInput, "north");
      blurInput(emailInput);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Введите корректный email");

    await act(async () => {
      setInputValue(emailInput, "north@");
      blurInput(emailInput);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Введите корректный email");

    await act(async () => {
      setInputValue(passwordInput, "1");
      blurInput(passwordInput);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Пароль должен содержать минимум 8 символов");
    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      setInputValue(usernameInput, "north");
      setInputValue(emailInput, "north@example.com");
      setInputValue(displayNameInput, "North");
      setInputValue(passwordInput, "riverlantern");
      setInputValue(passwordConfirmInput, "riverlantern");
      await flushMicrotasks();
    });

    expect(submitButton.disabled).toBe(false);
  });

  it("toggles password visibility in registration", async () => {
    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={vi.fn()} />);
      await flushMicrotasks();
    });

    const inputs = container.querySelectorAll("input");
    const passwordInput = inputs[3] as HTMLInputElement;
    const passwordConfirmInput = inputs[4] as HTMLInputElement;
    const showPasswordButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Show password"
    );
    const showConfirmPasswordButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Show confirm password"
    );

    if (!showPasswordButton || !showConfirmPasswordButton) {
      throw new Error("Password visibility buttons are missing");
    }

    expect(passwordInput.type).toBe("password");
    expect(passwordConfirmInput.type).toBe("password");

    await act(async () => {
      showPasswordButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      showConfirmPasswordButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    expect(passwordInput.type).toBe("text");
    expect(passwordConfirmInput.type).toBe("text");
  });

  it("sign in works with email as the login identifier", async () => {
    const response = sessionResponse();
    const authenticatedSpy = vi.fn();
    vi.mocked(login).mockResolvedValueOnce(response);

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
      setInputValue(usernameInput, "north@example.com");
      setInputValue(passwordInput, "riverlantern");
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
    });

    expect(login).toHaveBeenCalledWith({ username: "north@example.com", password: "riverlantern" });
    expect(authenticatedSpy).toHaveBeenCalledWith(response);
  });

  it("shows sign in required errors on blur and keeps submit disabled until fields are filled", async () => {
    await act(async () => {
      renderAuthCard(root!, <AuthCard onAuthenticated={vi.fn()} />);
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
    const submitButton = getPrimaryButton(container);

    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      blurInput(usernameInput);
      blurInput(passwordInput);
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Поле обязательное для заполнения");
    expect(usernameInput.getAttribute("aria-invalid")).toBe("true");
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");

    await act(async () => {
      setInputValue(usernameInput, "north");
      await flushMicrotasks();
    });

    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      setInputValue(passwordInput, "riverlantern");
      await flushMicrotasks();
    });

    expect(submitButton.disabled).toBe(false);
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
    expect(container.textContent).toContain("Username or email");
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
    expect(container.textContent).toContain("Username or email");
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
