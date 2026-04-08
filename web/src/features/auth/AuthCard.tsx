import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { describeError, login, register } from "../../lib/api";
import { ensureEncryptionReady } from "../../lib/e2ee";
import type { AuthResponse } from "../../lib/types";

type Props = {
  onAuthenticated: (response: AuthResponse) => void;
};

export function AuthCard({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const authMutation = useMutation({
    mutationFn: async () => {
      const response =
        mode === "register"
          ? await register({ username, displayName, password })
          : await login({ username, password });

      await ensureEncryptionReady(response, password);
      return response;
    },
    onSuccess: (response) => {
      setPassword("");
      onAuthenticated(response);
    },
  });

  const error = authMutation.error ? describeError(authMutation.error) : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="auth-brand-mark" src="/logo-mark.svg?v=20260408c" alt="North Messenger" />
        <div className="eyebrow">North Messenger</div>
        <h1>Realtime chat for serious products.</h1>
        <p className="auth-copy">
          Java backend, typed web client, direct dialogs and live message delivery.
        </p>

        <div className="mode-switch">
          <button
            type="button"
            className={mode === "register" ? "mode-button is-active" : "mode-button"}
            onClick={() => setMode("register")}
          >
            Register
          </button>
          <button
            type="button"
            className={mode === "login" ? "mode-button is-active" : "mode-button"}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate();
          }}
        >
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder=""
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>

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

          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 10 characters"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button type="submit" className="primary-button" disabled={authMutation.isPending}>
            {authMutation.isPending
              ? "Connecting..."
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
