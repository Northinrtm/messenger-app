import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { describeError, logout } from "../../lib/api";
import { isResettableEncryptionRecoveryError } from "../../lib/e2eeShared";
import { hasTrustedDeviceUnlock, isTrustedDeviceUnlockSupported } from "../../lib/e2eeTrustedDevice";
import type { AuthResponse } from "../../lib/types";

type Props = {
  session: AuthResponse;
  onUnlocked: (session: AuthResponse) => void;
  onSignedOut: () => void;
  variant?: "standalone" | "overlay";
};

export function UnlockCard({
  session,
  onUnlocked,
  onSignedOut,
  variant = "standalone",
}: Props) {
  const [password, setPassword] = useState("");
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [confirmingRecoveryReset, setConfirmingRecoveryReset] = useState(false);
  const autoTrustedUnlockAttemptedRef = useRef(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const canTrustThisDevice = isTrustedDeviceUnlockSupported();
  const hasTrustedUnlock = canTrustThisDevice && hasTrustedDeviceUnlock(session.user.id);

  const finalizeUnlock = async (nextSession: AuthResponse) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["messages", session.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["chats", session.token] }),
    ]);
    setPassword("");
    onUnlocked(nextSession);
  };

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const { ensureEncryptionReady } = await import("../../lib/e2ee");
      await ensureEncryptionReady(session, password);
      return session;
    },
    onSuccess: async (nextSession) => {
      if (canTrustThisDevice && !hasTrustedUnlock) {
        try {
          const { trustCurrentDeviceUnlock } = await import("../../lib/e2ee");
          await trustCurrentDeviceUnlock(nextSession);
        } catch {
          // Keep password-based unlock as the fallback when device enrollment is skipped or canceled.
        }
      }
      await finalizeUnlock(nextSession);
    },
  });

  const trustedUnlockMutation = useMutation({
    mutationFn: async () => {
      const { unlockWithTrustedDevice } = await import("../../lib/e2ee");
      await unlockWithTrustedDevice(session);
      return session;
    },
    onSuccess: async (nextSession) => {
      await finalizeUnlock(nextSession);
    },
    onError: () => {
      setShowPasswordFallback(true);
    },
  });

  const trustThisDeviceMutation = useMutation({
    mutationFn: async () => {
      const { ensureEncryptionReady, trustCurrentDeviceUnlock } = await import("../../lib/e2ee");
      await ensureEncryptionReady(session, password);
      await trustCurrentDeviceUnlock(session);
      return session;
    },
    onSuccess: async (nextSession) => {
      await finalizeUnlock(nextSession);
    },
  });

  const resetRecoveryMutation = useMutation({
    mutationFn: async () => {
      const { resetEncryptionAfterPasswordReset } = await import("../../lib/e2ee");
      await resetEncryptionAfterPasswordReset(session, password);
      return session;
    },
    onSuccess: async (nextSession) => {
      setConfirmingRecoveryReset(false);
      await finalizeUnlock(nextSession);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: async () => {
      const { clearUnlockedEncryptionState } = await import("../../lib/e2ee");
      clearUnlockedEncryptionState(session.user.id);
      onSignedOut();
    },
  });

  const unlockErrors = [
    trustedUnlockMutation.error,
    trustThisDeviceMutation.error,
    unlockMutation.error,
  ].filter(Boolean);
  const resettableRecoveryError = unlockErrors.find((item) =>
    isResettableEncryptionRecoveryError(item)
  );
  const error = [...unlockErrors, resetRecoveryMutation.error]
    .filter(Boolean)
    .map((item) => describeError(item))
    .find(Boolean);
  const isOverlay = variant === "overlay";
  const shouldShowDeviceFirst = hasTrustedUnlock;
  const shouldShowPasswordForm = !shouldShowDeviceFirst || showPasswordFallback;
  const canResetRecovery = Boolean(resettableRecoveryError) && shouldShowPasswordForm;
  const shouldRenderCompactTrustedUnlock = shouldShowDeviceFirst && !showPasswordFallback;
  const containerClassName = isOverlay ? "unlock-overlay" : "auth-shell";
  const cardClassName = [
    "auth-card",
    "unlock-card",
    isOverlay ? "is-overlay" : null,
    shouldRenderCompactTrustedUnlock ? "is-device-loading" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const description = isOverlay
    ? "Your session is active, but this browser tab does not have the private key for message decryption unlocked yet."
    : "Your session was restored, but the private key for message decryption is locked in this browser tab.";

  useEffect(() => {
    if (!hasTrustedUnlock || autoTrustedUnlockAttemptedRef.current) {
      return;
    }

    autoTrustedUnlockAttemptedRef.current = true;
    trustedUnlockMutation.mutate();
  }, [hasTrustedUnlock, trustedUnlockMutation]);

  useEffect(() => {
    if (!shouldShowPasswordForm) {
      return;
    }

    passwordInputRef.current?.focus();
  }, [shouldShowPasswordForm]);

  return (
    <div className={containerClassName}>
      <section className={cardClassName} role={isOverlay ? "dialog" : undefined} aria-modal={isOverlay || undefined}>
        <div className="eyebrow">Unlock E2EE</div>
        <h1>{shouldRenderCompactTrustedUnlock ? "Restoring encrypted chats." : "Unlock encrypted chats."}</h1>
        <p className="auth-copy">
          {shouldRenderCompactTrustedUnlock
            ? "Using the trusted device factor for this browser session."
            : description}
        </p>
        {hasTrustedUnlock ? (
          <div className={shouldRenderCompactTrustedUnlock ? "auth-device-unlock is-compact" : "auth-device-unlock"}>
            {shouldRenderCompactTrustedUnlock ? (
              <>
                <div className="auth-inline-loader" aria-hidden="true">
                  <span className="auth-inline-loader-dot" />
                  <span className="auth-inline-loader-dot" />
                  <span className="auth-inline-loader-dot" />
                </div>
                <button
                  type="button"
                  className="ghost-button auth-secondary-button"
                  onClick={() => setShowPasswordFallback(true)}
                  disabled={
                    trustThisDeviceMutation.isPending ||
                    unlockMutation.isPending ||
                    trustedUnlockMutation.isPending
                  }
                >
                  Use password instead
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="primary-button auth-device-button"
                  onClick={() => {
                    setShowPasswordFallback(false);
                    trustedUnlockMutation.mutate();
                  }}
                  disabled={trustedUnlockMutation.isPending}
                >
                  {trustedUnlockMutation.isPending ? "Unlocking with device..." : "Unlock with device"}
                </button>
                <p className="auth-device-note">
                  Use a passkey, Windows Hello, Touch ID, or another trusted device factor instead of
                  re-entering your chat password.
                </p>
              </>
            )}
          </div>
        ) : null}

        {shouldShowPasswordForm ? (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              unlockMutation.mutate();
            }}
          >
            <label className="field">
              <span>Encrypted chat password</span>
              <input
                ref={passwordInputRef}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setConfirmingRecoveryReset(false);
                  resetRecoveryMutation.reset();
                }}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>

            <p className="auth-field-hint">
              If your account password changed recently, encrypted chats on this device may still
              require the previous password until recovery is reset or re-secured.
            </p>

            {error ? <div className="form-error">{error}</div> : null}

            <div className="auth-action-stack">
              <button
                type="submit"
                className={hasTrustedUnlock ? "ghost-button auth-secondary-button" : "primary-button"}
                disabled={
                  unlockMutation.isPending ||
                  trustThisDeviceMutation.isPending ||
                  resetRecoveryMutation.isPending
                }
              >
                {unlockMutation.isPending ? "Unlocking..." : "Unlock with password"}
              </button>
              {canTrustThisDevice && !hasTrustedUnlock ? (
                <button
                  type="button"
                  className="primary-button auth-trust-button"
                  onClick={() => trustThisDeviceMutation.mutate()}
                  disabled={
                    !password.trim() ||
                    unlockMutation.isPending ||
                    trustThisDeviceMutation.isPending ||
                    resetRecoveryMutation.isPending
                  }
                >
                  {trustThisDeviceMutation.isPending
                    ? "Enabling device unlock..."
                    : "Unlock and trust this device"}
                </button>
              ) : null}
              {canResetRecovery ? (
                <>
                  <button
                    type="button"
                    className="ghost-button auth-secondary-button"
                    onClick={() => setConfirmingRecoveryReset(true)}
                    disabled={
                      confirmingRecoveryReset ||
                      unlockMutation.isPending ||
                      trustThisDeviceMutation.isPending ||
                      resetRecoveryMutation.isPending
                    }
                  >
                    I cannot unlock encrypted chats
                  </button>
                  {confirmingRecoveryReset ? (
                    <>
                      <div className="form-note">
                        This starts a new encrypted-chat key. Messages that only the previous key could decrypt
                        will stay unavailable.
                      </div>
                      <button
                        type="button"
                        className="ghost-button auth-secondary-button danger-button"
                        onClick={() => resetRecoveryMutation.mutate()}
                        disabled={
                          !password.trim() ||
                          unlockMutation.isPending ||
                          trustThisDeviceMutation.isPending ||
                          resetRecoveryMutation.isPending
                        }
                      >
                        {resetRecoveryMutation.isPending ? "Resetting encrypted chats..." : "Reset encrypted chats"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button auth-secondary-button"
                        onClick={() => setConfirmingRecoveryReset(false)}
                        disabled={resetRecoveryMutation.isPending}
                      >
                        Cancel reset
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              {hasTrustedUnlock ? (
                <button
                  type="button"
                  className="ghost-button auth-secondary-button"
                  onClick={() => {
                    setShowPasswordFallback(false);
                    trustedUnlockMutation.mutate();
                  }}
                  disabled={
                    trustedUnlockMutation.isPending ||
                    unlockMutation.isPending ||
                    resetRecoveryMutation.isPending
                  }
                >
                  Unlock with device instead
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <>
            {error ? <div className="form-error">{error}</div> : null}
            {!shouldRenderCompactTrustedUnlock ? (
              <button
                type="button"
                className="ghost-button auth-secondary-button"
                onClick={() => setShowPasswordFallback(true)}
                disabled={trustedUnlockMutation.isPending}
              >
                Use password instead
              </button>
            ) : null}
          </>
        )}

        <div className="mode-switch">
          <button
            type="button"
            className="mode-button"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            {signOutMutation.isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}
