import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { describeError, logout } from "../../lib/api";
import { ensureEncryptionReady } from "../../lib/e2ee";
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
  const queryClient = useQueryClient();

  const unlockMutation = useMutation({
    mutationFn: async () => {
      await ensureEncryptionReady(session, password);
      return session;
    },
    onSuccess: async (nextSession) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", session.token] }),
        queryClient.invalidateQueries({ queryKey: ["chats", session.token] }),
      ]);
      setPassword("");
      onUnlocked(nextSession);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      onSignedOut();
    },
  });

  const error = unlockMutation.error ? describeError(unlockMutation.error) : null;
  const isOverlay = variant === "overlay";
  const containerClassName = isOverlay ? "unlock-overlay" : "auth-shell";
  const cardClassName = isOverlay ? "auth-card unlock-card is-overlay" : "auth-card unlock-card";
  const description = isOverlay
    ? "Your session is active, but this browser tab does not have the private key for message decryption unlocked yet."
    : "Your session was restored, but the private key for message decryption is locked in this browser tab.";

  return (
    <div className={containerClassName}>
      <section className={cardClassName} role={isOverlay ? "dialog" : undefined} aria-modal={isOverlay || undefined}>
        <div className="eyebrow">Unlock E2EE</div>
        <h1>Unlock encrypted chats.</h1>
        <p className="auth-copy">{description}</p>

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
              required
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button type="submit" className="primary-button" disabled={unlockMutation.isPending}>
            {unlockMutation.isPending ? "Unlocking..." : "Unlock chats"}
          </button>
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
