import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AuthCard } from "../features/auth/AuthCard";
import { UnlockCard } from "../features/auth/UnlockCard";
import { NorthMessengerWorkspace } from "../features/chat/NorthMessengerWorkspace";
import { refreshSession } from "../lib/api";
import { clearUnlockedEncryptionState, hasUnlockedPrivateEncryptionKey } from "../lib/e2ee";
import {
  getSessionRefreshDelay,
  isRefreshCompatible,
  isAccessTokenExpired,
  shouldRefreshSessionSoon,
} from "../lib/session";
import type { AuthResponse } from "../lib/types";

const SESSION_RESTORE_CARD_DELAY_MS = 180;
const INVITE_PATH_PREFIX = "/j/";
let initialSessionRestorePromise: Promise<AuthResponse | null> | null = null;

function restoreInitialSession() {
  if (!initialSessionRestorePromise) {
    // Keep the first restore request single-flight so StrictMode does not rotate refresh tokens twice in dev.
    initialSessionRestorePromise = refreshSession().catch(() => null);
  }

  return initialSessionRestorePromise;
}

function extractInviteCodeFromPath(pathname: string) {
  if (!pathname.startsWith(INVITE_PATH_PREFIX)) {
    return null;
  }

  const suffix = pathname.slice(INVITE_PATH_PREFIX.length).trim();
  const code = suffix.split("/")[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9]{4,16}$/.test(code) ? code : null;
}

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [showRestoringSessionCard, setShowRestoringSessionCard] = useState(false);
  const [refreshingExpiredSession, setRefreshingExpiredSession] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() =>
    typeof window === "undefined" ? null : extractInviteCodeFromPath(window.location.pathname)
  );
  const refreshInFlightRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  const requestSessionRefresh = useEffectEvent(async (blocking = false) => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    if (blocking) {
      setRefreshingExpiredSession(true);
    }

    try {
      const nextSession = await refreshSession();
      setSession((currentSession) =>
        isRefreshCompatible(currentSession, nextSession) ? nextSession : null
      );
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
    let cancelled = false;

    void restoreInitialSession().then((nextSession) => {
      if (cancelled) {
        return;
      }

      setSession(nextSession);
      setRestoringSession(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restoringSession) {
      setShowRestoringSessionCard(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowRestoringSessionCard(true);
    }, SESSION_RESTORE_CARD_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [restoringSession]);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const nextUserId = session?.user.id ?? null;

    if (previousUserId && previousUserId !== nextUserId) {
      clearUnlockedEncryptionState(previousUserId);
    }

    if (!nextUserId && previousUserId) {
      clearUnlockedEncryptionState(previousUserId);
    }

    previousUserIdRef.current = nextUserId;
  }, [session?.user.id]);

  useEffect(() => {
    if (restoringSession || !session) {
      setRefreshingExpiredSession(false);
      return;
    }

    if (isAccessTokenExpired(session)) {
      void requestSessionRefresh(true);
      return;
    }

    const delay = getSessionRefreshDelay(session);
    const timer = window.setTimeout(() => {
      void requestSessionRefresh(false);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [session, requestSessionRefresh]);

  useEffect(() => {
    if (restoringSession || !session) {
      return;
    }

    const refreshOnReturn = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (isAccessTokenExpired(session)) {
        void requestSessionRefresh(true);
        return;
      }

      if (shouldRefreshSessionSoon(session)) {
        void requestSessionRefresh(false);
      }
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [session, requestSessionRefresh]);

  const handlePendingInviteHandled = useEffectEvent(() => {
    setPendingInviteCode(null);
    if (typeof window !== "undefined" && extractInviteCodeFromPath(window.location.pathname)) {
      window.history.replaceState({}, "", "/");
    }
  });

  const showBlockingRestore =
    restoringSession || Boolean(session && refreshingExpiredSession && isAccessTokenExpired(session));
  const showSessionRestoreCard =
    (restoringSession && showRestoringSessionCard) ||
    Boolean(session && refreshingExpiredSession && isAccessTokenExpired(session));
  const sessionNeedsUnlock = Boolean(session && !hasUnlockedPrivateEncryptionKey(session.user.id));

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      {showBlockingRestore ? (
        <main className="auth-shell">
          {showSessionRestoreCard ? (
            <section className="auth-card">
              <div className="eyebrow">Restoring session</div>
              <h1>Reconnecting securely.</h1>
              <p className="auth-copy">Refreshing access to your chats before the workspace opens.</p>
            </section>
          ) : null}
        </main>
      ) : session ? (
        <>
          <NorthMessengerWorkspace
            session={session}
            pendingInviteCode={pendingInviteCode}
            onPendingInviteHandled={handlePendingInviteHandled}
            onSessionChange={setSession}
          />
          {sessionNeedsUnlock ? (
            <UnlockCard
              session={session}
              variant="overlay"
              onUnlocked={(nextSession) => {
                setSession({ ...nextSession });
              }}
              onSignedOut={() => {
                setSession(null);
              }}
            />
          ) : null}
        </>
      ) : (
        <AuthCard onAuthenticated={setSession} />
      )}
    </div>
  );
}

