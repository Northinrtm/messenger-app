import { useEffect, useState } from "react";
import { AuthCard } from "../features/auth/AuthCard";
import { Workspace } from "../features/chat/Workspace";
import { refreshSession } from "../lib/api";
import { loadSession, saveSession } from "../lib/session";
import type { AuthResponse } from "../lib/types";

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(() => loadSession());

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (new Date(session.refreshTokenExpiresAt).getTime() <= Date.now()) {
      setSession(null);
      return;
    }

    let cancelled = false;
    const delay = Math.max(new Date(session.tokenExpiresAt).getTime() - Date.now() - 60_000, 1_000);
    const timer = window.setTimeout(() => {
      void refreshSession(session.refreshToken)
        .then((nextSession) => {
          if (!cancelled) {
            setSession(nextSession);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSession(null);
          }
        });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session]);

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      {session ? (
        <Workspace session={session} onSessionChange={setSession} />
      ) : (
        <AuthCard onAuthenticated={setSession} />
      )}
    </div>
  );
}
