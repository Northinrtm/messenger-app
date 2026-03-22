import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AuthCard } from "../features/auth/AuthCard";
import { TelegramWorkspace } from "../features/chat/TelegramWorkspace";
import { refreshSession } from "../lib/api";
import {
  getSessionRefreshDelay,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  loadSession,
  saveSession,
  shouldRefreshSessionSoon,
} from "../lib/session";
import type { AuthResponse } from "../lib/types";

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(() => {
    const initialSession = loadSession();
    return initialSession && !isRefreshTokenExpired(initialSession) ? initialSession : null;
  });
  const [refreshingExpiredSession, setRefreshingExpiredSession] = useState<boolean>(() => {
    const initialSession = loadSession();
    return Boolean(initialSession && !isRefreshTokenExpired(initialSession) && isAccessTokenExpired(initialSession));
  });
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const requestSessionRefresh = useEffectEvent(async (currentSession: AuthResponse, blocking = false) => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    if (blocking) {
      setRefreshingExpiredSession(true);
    }

    try {
      const nextSession = await refreshSession(currentSession.refreshToken);
      setSession(nextSession);
    } catch {
      setSession(null);
    } finally {
      refreshInFlightRef.current = false;
      if (blocking) {
        setRefreshingExpiredSession(false);
      }
    }
  });

  useEffect(() => {
    if (!session) {
      setRefreshingExpiredSession(false);
      return;
    }

    if (isRefreshTokenExpired(session)) {
      setSession(null);
      return;
    }

    if (isAccessTokenExpired(session)) {
      void requestSessionRefresh(session, true);
      return;
    }

    const delay = getSessionRefreshDelay(session);
    const timer = window.setTimeout(() => {
      void requestSessionRefresh(session);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [session, requestSessionRefresh]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const refreshOnReturn = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (isRefreshTokenExpired(session)) {
        setSession(null);
        return;
      }

      if (isAccessTokenExpired(session)) {
        void requestSessionRefresh(session, true);
        return;
      }

      if (shouldRefreshSessionSoon(session)) {
        void requestSessionRefresh(session);
      }
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [session, requestSessionRefresh]);

  const showSessionRestore = Boolean(session && refreshingExpiredSession && isAccessTokenExpired(session));

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      {showSessionRestore ? (
        <main className="auth-shell">
          <section className="auth-card">
            <div className="eyebrow">Restoring session</div>
            <h1>Reconnecting securely.</h1>
            <p className="auth-copy">Refreshing access to your chats before the workspace opens.</p>
          </section>
        </main>
      ) : session ? (
        <TelegramWorkspace session={session} onSessionChange={setSession} />
      ) : (
        <AuthCard onAuthenticated={setSession} />
      )}
    </div>
  );
}
