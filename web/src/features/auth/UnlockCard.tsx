import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { describeError, logout } from "../../lib/api";
import {
  ensureEncryptionReady,
  hasTrustedDeviceUnlock,
  isTrustedDeviceUnlockSupported,
  trustCurrentDeviceUnlock,
  unlockWithTrustedDevice,
} from "../../lib/e2ee";
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
  const autoTrustedUnlockAttemptedRef = useRef(false);
  const queryClient = useQueryClient();
  const canTrustThisDevice = isTrustedDeviceUnlockSupported();
  const hasTrustedUnlock = canTrustThisDevice && hasTrustedDeviceUnlock(session.user.id);

  const finalizeUnlock = async (nextSession: AuthResponse) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["messages", session.token] }),
      queryClient.invalidateQueries({ queryKey: ["chats", session.token] }),
    ]);
    setPassword("");
    onUnlocked(nextSession);
  };

  const unlockMutation = useMutation({
    mutationFn: async () => {
      await ensureEncryptionReady(session, password);
      return session;
    },
    onSuccess: async (nextSession) => {
      await finalizeUnlock(nextSession);
    },
  });

  const trustedUnlockMutation = useMutation({
    mutationFn: async () => {
      await unlockWithTrustedDevice(session.user.id);
      return session;
    },
    onSuccess: async (nextSession) => {
      await finalizeUnlock(nextSession);
    },
  });

  const trustThisDeviceMutation = useMutation({
    mutationFn: async () => {
      await ensureEncryptionReady(session, password);
      await trustCurrentDeviceUnlock(session);
      return session;
    },
    onSuccess: async (nextSession) => {
      await finalizeUnlock(nextSession);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      onSignedOut();
    },
  });

  const error = [trustedUnlockMutation.error, trustThisDeviceMutation.error, unlockMutation.error]
    .filter(Boolean)
    .map((item) => describeError(item))
    .find(Boolean);
  const isOverlay = variant === "overlay";
  const containerClassName = isOverlay ? "unlock-overlay" : "auth-shell";
  const cardClassName = isOverlay ? "auth-card unlock-card is-overlay" : "auth-card unlock-card";
  const description = isOverlay
    ? "Your session is active, but this browser tab does not have the private key for message decryption unlocked yet."
    : "Your session was restored, but the private key for message decryption is locked in this browser tab.";

  useEffect(() => {
    if (!isOverlay || !hasTrustedUnlock || autoTrustedUnlockAttemptedRef.current) {
      return;
    }

    autoTrustedUnlockAttemptedRef.current = true;
    trustedUnlockMutation.mutate();
  }, [hasTrustedUnlock, isOverlay, trustedUnlockMutation]);

  return (
    <div className={containerClassName}>
      <section className={cardClassName} role={isOverlay ? "dialog" : undefined} aria-modal={isOverlay || undefined}>
        <div className="eyebrow">Unlock E2EE</div>
        <h1>Unlock encrypted chats.</h1>
        <p className="auth-copy">{description}</p>
        {hasTrustedUnlock ? (
          <div className="auth-device-unlock">
            <button
              type="button"
              className="primary-button auth-device-button"
              onClick={() => trustedUnlockMutation.mutate()}
              disabled={trustedUnlockMutation.isPending}
            >
              {trustedUnlockMutation.isPending ? "Unlocking with device..." : "Unlock with device"}
            </button>
            <p className="auth-device-note">
              Use a passkey, Windows Hello, Touch ID, or another trusted device factor instead of
              re-entering your chat password.
            </p>
          </div>
        ) : null}

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            unlockMutation.mutate();
          }}
        >
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              autoFocus={!hasTrustedUnlock}
              required
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="auth-action-stack">
            <button
              type="submit"
              className={hasTrustedUnlock ? "ghost-button auth-secondary-button" : "primary-button"}
              disabled={unlockMutation.isPending || trustThisDeviceMutation.isPending}
            >
              {unlockMutation.isPending ? "Unlocking..." : "Unlock with password"}
            </button>
            {canTrustThisDevice && !hasTrustedUnlock ? (
              <button
                type="button"
                className="primary-button auth-trust-button"
                onClick={() => trustThisDeviceMutation.mutate()}
                disabled={!password.trim() || unlockMutation.isPending || trustThisDeviceMutation.isPending}
              >
                {trustThisDeviceMutation.isPending
                  ? "Enabling device unlock..."
                  : "Unlock and trust this device"}
              </button>
            ) : null}
          </div>
        </form>

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
