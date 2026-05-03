import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { logout } from "../../lib/api";
import { isResettableEncryptionRecoveryError } from "../../lib/e2eeShared";
import {
  hasTrustedBrowserUnlock,
  isTrustedBrowserUnlockSupported,
} from "../../lib/e2eeTrustedBrowser";
import type { AuthResponse } from "../../lib/types";
import { buildUnlockErrorPresentation } from "./unlockErrorPresentation";

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
  const canTrustThisBrowser = isTrustedBrowserUnlockSupported();
  const hasTrustedUnlock = canTrustThisBrowser && hasTrustedBrowserUnlock(session.user.id);

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
      if (canTrustThisBrowser && !hasTrustedUnlock) {
        try {
          const { trustCurrentBrowserUnlock } = await import("../../lib/e2ee");
          await trustCurrentBrowserUnlock(nextSession);
        } catch {
          // Keep password-based unlock as the fallback when browser enrollment is skipped or canceled.
        }
      }
      await finalizeUnlock(nextSession);
    },
  });

  const trustedUnlockMutation = useMutation({
    mutationFn: async () => {
      const { unlockWithTrustedBrowser } = await import("../../lib/e2ee");
      await unlockWithTrustedBrowser(session);
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
      const { ensureEncryptionReady, trustCurrentBrowserUnlock } = await import("../../lib/e2ee");
      await ensureEncryptionReady(session, password);
      await trustCurrentBrowserUnlock(session);
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
      const { lockUnlockedEncryptionState } = await import("../../lib/e2ee");
      lockUnlockedEncryptionState(session.user.id);
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
  const visibleError = [resetRecoveryMutation.error, ...unlockErrors].find(Boolean);
  const unlockErrorPresentation = buildUnlockErrorPresentation(visibleError);
  const isOverlay = variant === "overlay";
  const shouldShowTrustedBrowserFirst = hasTrustedUnlock;
  const shouldShowPasswordForm = !shouldShowTrustedBrowserFirst || showPasswordFallback;
  const canResetRecovery =
    (Boolean(resettableRecoveryError) || Boolean(unlockErrorPresentation?.canReset)) &&
    shouldShowPasswordForm;
  const shouldRenderCompactTrustedUnlock = shouldShowTrustedBrowserFirst && !showPasswordFallback;
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
  const encryptionDeviceSummary =
    "If another browser session still opens encrypted chats, keep it signed in until recovery is finished.";
  const resetConsequencesCopy =
    "Reset starts a new encrypted-chat key for future recovery on this account. Messages that only the previous key could decrypt will stay unavailable in this browser session.";
  const resetGuidanceCopy =
    "If any other browser session can still unlock the previous key, stop here and recover from that session instead of resetting.";

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
            ? "Using the trusted browser factor for this browser session."
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
                  {trustedUnlockMutation.isPending ? "Unlocking with browser..." : "Unlock with browser"}
                </button>
                <p className="auth-device-note">
                  Use a passkey, Windows Hello, Touch ID, or another trusted browser factor instead of
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
              If your account password changed recently, encrypted chats in this browser session may still
              require the previous password until recovery is reset or re-secured.
            </p>

            <div className="form-note auth-unlock-summary">{encryptionDeviceSummary}</div>

            {unlockErrorPresentation ? (
              <div className="form-error auth-error-panel">
                <strong className="auth-error-title">{unlockErrorPresentation.title}</strong>
                <p className="auth-error-copy">{unlockErrorPresentation.description}</p>
                {unlockErrorPresentation.detailLines.length > 0 ? (
                  <ul className="auth-error-detail-list">
                    {unlockErrorPresentation.detailLines.map((detailLine) => (
                      <li key={detailLine}>{detailLine}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

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
              {canTrustThisBrowser && !hasTrustedUnlock ? (
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
                    ? "Enabling browser unlock..."
                    : "Unlock and trust this browser"}
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
                      <div className="form-note auth-recovery-warning">
                        <strong>Reset consequences</strong>
                        <p>{resetConsequencesCopy}</p>
                        <p>{resetGuidanceCopy}</p>
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
            {unlockErrorPresentation ? (
              <div className="form-error auth-error-panel">
                <strong className="auth-error-title">{unlockErrorPresentation.title}</strong>
                <p className="auth-error-copy">{unlockErrorPresentation.description}</p>
                {unlockErrorPresentation.detailLines.length > 0 ? (
                  <ul className="auth-error-detail-list">
                    {unlockErrorPresentation.detailLines.map((detailLine) => (
                      <li key={detailLine}>{detailLine}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
