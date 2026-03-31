import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, logout } from "../../lib/api";
import { ensureEncryptionReady } from "../../lib/e2ee";
import type { AuthResponse } from "../../lib/types";

type Props = {
  session: AuthResponse;
  onUnlocked: (session: AuthResponse) => void;
  onSignedOut: () => void;
};

export function UnlockCard({ session, onUnlocked, onSignedOut }: Props) {
  const [password, setPassword] = useState("");

  const unlockMutation = useMutation({
    mutationFn: async () => {
      await ensureEncryptionReady(session, password);
      return session;
    },
    onSuccess: (nextSession) => {
      onUnlocked(nextSession);
    },
    onSettled: () => {
      setPassword("");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      onSignedOut();
    },
  });

  const error =
    unlockMutation.error instanceof ApiError
      ? [unlockMutation.error.message, ...unlockMutation.error.details].filter(Boolean).join(". ")
      : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Unlock E2EE</div>
        <h1>Unlock encrypted chats.</h1>
        <p className="auth-copy">
          Your session was restored, but the private key for message decryption is locked in this
          browser.
        </p>

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
    </main>
  );
}
