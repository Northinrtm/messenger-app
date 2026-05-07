import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  confirmEmailVerification,
  confirmPasswordReset,
  describeError,
  login,
  register,
  requestPasswordReset,
  resendEmailVerification,
} from "../../lib/api";
import type { AuthResponse } from "../../lib/types";

type Props = {
  onAuthenticated: (response: AuthResponse) => void;
  initialPasswordResetToken?: string | null;
  onPasswordResetHandled?: () => void;
  initialEmailVerificationToken?: string | null;
  onEmailVerificationHandled?: () => void;
};

type Mode =
  | "login"
  | "register"
  | "requestReset"
  | "confirmReset"
  | "resendVerification"
  | "verifyEmail";

type VerificationViewState =
  | { kind: "idle"; message: null }
  | { kind: "pending"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "expired"; message: string }
  | { kind: "alreadyVerified"; message: string };

export function AuthCard({
  onAuthenticated,
  initialPasswordResetToken = null,
  onPasswordResetHandled,
  initialEmailVerificationToken = null,
  onEmailVerificationHandled,
}: Props) {
  const [mode, setMode] = useState<Mode>(
    initialPasswordResetToken ? "confirmReset" : initialEmailVerificationToken ? "verifyEmail" : "register"
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [resetToken, setResetToken] = useState(initialPasswordResetToken ?? "");
  const [resetPassword, setResetPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(
    initialPasswordResetToken ? "Choose a new password for this reset link." : null
  );
  const [verificationViewState, setVerificationViewState] = useState<VerificationViewState>(() =>
    initialEmailVerificationToken
      ? { kind: "pending", message: "Checking your verification link." }
      : { kind: "idle", message: null }
  );
  const verifiedTokenRef = useRef<string | null>(null);

  const authMutation = useMutation<AuthResponse>({
    mutationFn: async () => {
      setInfoMessage(null);
      if (mode === "register") {
        return register({ username, email, displayName, password });
      }

      return login({ username, password });
    },
    onSuccess: (response) => {
      setPassword("");
      setPasswordConfirm("");
      onAuthenticated(response);
    },
  });

  const requestResetMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return requestPasswordReset({ email });
    },
    onSuccess: () => {
      switchMode("login", "If that email exists, reset instructions have been sent.");
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return resendEmailVerification({ email });
    },
    onSuccess: () => {
      switchMode("login", "If that email can be verified, a new verification link has been sent.");
    },
  });

  const confirmResetMutation = useMutation({
    mutationFn: () => {
      setInfoMessage(null);
      return confirmPasswordReset({ token: resetToken, newPassword: resetPassword });
    },
    onSuccess: () => {
      setResetPassword("");
      setResetToken("");
      onPasswordResetHandled?.();
      switchMode("login", "Password updated. Sign in with your new password.");
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: (token: string) => confirmEmailVerification({ token }),
    onMutate: () => {
      setVerificationViewState({
        kind: "pending",
        message: "Checking your verification link.",
      });
      setInfoMessage(null);
    },
    onSuccess: () => {
      returnToLogin("Email verified. Sign in to continue.");
    },
    onError: (error) => {
      const nextState = resolveVerificationViewState(error);
      if (nextState.kind === "alreadyVerified") {
        returnToLogin(nextState.message);
        return;
      }

      setVerificationViewState(nextState);
    },
  });

  function switchMode(nextMode: Mode, nextInfoMessage: string | null = null) {
    authMutation.reset();
    requestResetMutation.reset();
    resendVerificationMutation.reset();
    confirmResetMutation.reset();
    verifyEmailMutation.reset();
    setInfoMessage(nextInfoMessage);
    setVerificationViewState({ kind: "idle", message: null });
    setMode(nextMode);
  }

  useEffect(() => {
    if (!initialPasswordResetToken) {
      return;
    }

    setResetToken(initialPasswordResetToken);
    setResetPassword("");
    switchMode("confirmReset", "Choose a new password for this reset link.");
  }, [initialPasswordResetToken]);

  useEffect(() => {
    if (initialEmailVerificationToken) {
      return;
    }

    verifiedTokenRef.current = null;
  }, [initialEmailVerificationToken]);

  useEffect(() => {
    if (!initialEmailVerificationToken) {
      return;
    }
    if (verifiedTokenRef.current === initialEmailVerificationToken) {
      return;
    }

    verifiedTokenRef.current = initialEmailVerificationToken;
    authMutation.reset();
    requestResetMutation.reset();
    resendVerificationMutation.reset();
    confirmResetMutation.reset();
    verifyEmailMutation.reset();
    setInfoMessage(null);
    setMode("verifyEmail");
    setVerificationViewState({
      kind: "pending",
      message: "Checking your verification link.",
    });
    verifyEmailMutation.mutate(initialEmailVerificationToken);
  }, [
    authMutation,
    confirmResetMutation,
    initialEmailVerificationToken,
    requestResetMutation,
    resendVerificationMutation,
    verifyEmailMutation,
  ]);

  const error = [authMutation.error, requestResetMutation.error, resendVerificationMutation.error, confirmResetMutation.error]
    .filter(Boolean)
    .map((item) => describeError(item))
    .find(Boolean);
  const registrationPasswordsMatch = password === passwordConfirm;
  const registrationPasswordReady =
    mode !== "register" || (password.length > 0 && passwordConfirm.length > 0 && registrationPasswordsMatch);
  const isAuthMode = mode === "login" || mode === "register";
  const isBusy =
    authMutation.isPending ||
    requestResetMutation.isPending ||
    resendVerificationMutation.isPending ||
    confirmResetMutation.isPending ||
    verifyEmailMutation.isPending;
  const description =
    mode === "requestReset"
      ? "Enter the email tied to your account. If it exists, the reset link will be sent there."
      : mode === "confirmReset"
        ? "Set a new password for your account. The link can be used only once."
        : mode === "resendVerification"
          ? "Enter the email used for registration. If it can be verified, a new link will be sent there."
          : mode === "verifyEmail"
            ? "Confirming the email verification link for your account."
        : "Java backend, typed web client, direct dialogs and live message delivery.";
  const title =
    mode === "confirmReset"
      ? "Reset your password."
      : mode === "resendVerification" || mode === "verifyEmail"
        ? "Verify your email."
        : "Realtime chat for serious products.";

  function returnToLogin(nextInfoMessage: string | null = null) {
    onEmailVerificationHandled?.();
    switchMode("login", nextInfoMessage);
  }

  function openResendVerification() {
    onEmailVerificationHandled?.();
    switchMode("resendVerification", "Enter your email to receive a fresh verification link.");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="auth-brand-mark" src="/logo-mark.svg?v=20260408d" alt="North Messenger" />
        <div className="eyebrow">North Messenger</div>
        {!isAuthMode ? (
          <>
            <h1>{title}</h1>
            <p className="auth-copy">{description}</p>
          </>
        ) : null}

        {isAuthMode ? (
          <div className="mode-switch">
            <button
              type="button"
              className={mode === "register" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
            <button
              type="button"
              className={mode === "login" ? "mode-button is-active" : "mode-button"}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
          </div>
        ) : null}

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "requestReset") {
              requestResetMutation.mutate();
              return;
            }
            if (mode === "resendVerification") {
              resendVerificationMutation.mutate();
              return;
            }
            if (mode === "confirmReset") {
              confirmResetMutation.mutate();
              return;
            }
            if (mode === "verifyEmail") {
              return;
            }
            if (mode === "register" && !registrationPasswordReady) {
              return;
            }
            authMutation.mutate();
          }}
        >
          {mode === "requestReset" ||
          mode === "confirmReset" ||
          mode === "resendVerification" ||
          mode === "verifyEmail" ? null : (
            <label className="field">
              <span>Username or email</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder=""
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
          )}

          {mode === "register" || mode === "requestReset" || mode === "resendVerification" ? (
            <label className="field">
              <span>Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder=""
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
          ) : null}

          {mode === "register" ? (
            <label className="field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder=""
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
          ) : null}

          {mode === "confirmReset" ? (
            <>
              <label className="field">
                <span>Reset token</span>
                <input
                  value={resetToken}
                  onChange={(event) => setResetToken(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder=""
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          ) : mode === "requestReset" ? null : (
            <>
              <label className="field">
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder=""
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                />
              </label>
              {mode === "register" ? (
                <label className="field">
                  <span>Confirm password</span>
                  <input
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder=""
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : null}
            </>
          )}

          {infoMessage ? <div className="form-note">{infoMessage}</div> : null}

          {mode === "verifyEmail" && verificationViewState.message ? (
            <div
              className={
                verificationViewState.kind === "invalid" || verificationViewState.kind === "expired"
                  ? "form-error"
                  : "form-note"
              }
            >
              {verificationViewState.message}
            </div>
          ) : null}

          {mode === "register" && passwordConfirm.length > 0 && !registrationPasswordsMatch ? (
            <div className="form-error">Passwords do not match.</div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}

          {mode === "verifyEmail" ? null : (
            <button
              type="submit"
              className="primary-button"
              disabled={isBusy || (mode === "register" && !registrationPasswordReady)}
            >
              {mode === "requestReset"
                ? requestResetMutation.isPending
                  ? "Sending reset link..."
                  : "Send reset link"
                : mode === "resendVerification"
                  ? resendVerificationMutation.isPending
                    ? "Sending verification link..."
                    : "Resend verification email"
                  : mode === "confirmReset"
                    ? confirmResetMutation.isPending
                      ? "Updating password..."
                      : "Reset password"
                    : authMutation.isPending
                      ? "Connecting..."
                      : mode === "register"
                        ? "Create account"
                        : "Sign in"}
            </button>
          )}

          {mode === "login" ? (
            <>
              <button
                type="button"
                className="ghost-button auth-secondary-button"
                onClick={() => switchMode("requestReset")}
                disabled={isBusy}
              >
                Forgot password?
              </button>
            </>
          ) : null}

          {mode === "requestReset" || mode === "confirmReset" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => {
                setResetPassword("");
                if (mode === "confirmReset") {
                  setResetToken("");
                  onPasswordResetHandled?.();
                }
                switchMode("login");
              }}
              disabled={isBusy}
            >
              Back to sign in
            </button>
          ) : null}

          {mode === "resendVerification" ? (
            <button
              type="button"
              className="ghost-button auth-secondary-button"
              onClick={() => switchMode("login")}
              disabled={isBusy}
            >
              Back
            </button>
          ) : null}

          {mode === "verifyEmail" ? (
            <>
              {verificationViewState.kind === "invalid" || verificationViewState.kind === "expired" ? (
                <button
                  type="button"
                  className="ghost-button auth-secondary-button"
                  onClick={openResendVerification}
                  disabled={isBusy}
                >
                  Resend verification email
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button auth-secondary-button"
                onClick={() => {
                  returnToLogin();
                }}
                disabled={isBusy}
              >
                Back to sign in
              </button>
            </>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function resolveVerificationViewState(error: unknown): VerificationViewState {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.message === "Email is already verified") {
      return {
        kind: "alreadyVerified",
        message: "This email is already verified. You can sign in now.",
      };
    }
    if (error.status === 410 && error.message === "Email verification token is expired") {
      return {
        kind: "expired",
        message: "This verification link has expired. Request a new one to continue.",
      };
    }
  }

  return {
    kind: "invalid",
    message: "This verification link is invalid. Request a new email verification link.",
  };
}
