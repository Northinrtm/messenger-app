import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, login, register } from "../../lib/api";
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
      if (mode === "register") {
        return register({ username, displayName, password });
      }

      return login({ username, password });
    },
    onSuccess: (response) => {
      onAuthenticated(response);
    },
  });

  const error =
    authMutation.error instanceof ApiError
      ? [authMutation.error.message, ...authMutation.error.details].filter(Boolean).join(". ")
      : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
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
              placeholder="Minimum 8 characters"
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
