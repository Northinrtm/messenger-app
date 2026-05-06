import { Suspense, lazy, useEffect, useEffectEvent, useRef, useState } from "react";
import { AuthCard } from "../features/auth/AuthCard";
import { refreshSession } from "../lib/api";
import {
  getSessionRefreshDelay,
  isRefreshCompatible,
  isAccessTokenExpired,
  shouldRefreshSessionSoon,
} from "../lib/session";
import type { AuthResponse } from "../lib/types";

const SESSION_RESTORE_CARD_DELAY_MS = 900;
const INVITE_PATH_PREFIX = "/j/";
const PASSWORD_RESET_QUERY_PARAM = "resetToken";
const EMAIL_VERIFICATION_QUERY_PARAM = "verifyEmailToken";
let initialSessionRestorePromise: Promise<AuthResponse | null> | null = null;
const NorthMessengerWorkspace = lazy(async () => {
  const module = await import("../features/chat/NorthMessengerWorkspace");
  return { default: module.NorthMessengerWorkspace };
});

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
  const code = decodeURIComponent(suffix.split("/")[0]?.trim() ?? "");
  return /^\+[A-Za-z0-9]{16}$/.test(code) ? code : null;
}

function extractPasswordResetTokenFromSearch(search: string) {
  const value = new URLSearchParams(search).get(PASSWORD_RESET_QUERY_PARAM)?.trim() ?? "";
  return value || null;
}

function extractEmailVerificationTokenFromSearch(search: string) {
  const value = new URLSearchParams(search).get(EMAIL_VERIFICATION_QUERY_PARAM)?.trim() ?? "";
  return value || null;
}

function clearQueryParamFromLocation(queryParam: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete(queryParam);
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [showRestoringSessionCard, setShowRestoringSessionCard] = useState(false);
  const [refreshingExpiredSession, setRefreshingExpiredSession] = useState(false);
  const [preparingSessionEncryption, setPreparingSessionEncryption] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() =>
    typeof window === "undefined" ? null : extractInviteCodeFromPath(window.location.pathname)
  );
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : extractPasswordResetTokenFromSearch(window.location.search)
  );
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : extractEmailVerificationTokenFromSearch(window.location.search)
  );
  const refreshInFlightRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = "ru";
    document.documentElement.classList.add("notranslate");
    document.documentElement.setAttribute("translate", "no");
    document.body.classList.add("notranslate");
    document.body.setAttribute("translate", "no");
  }, []);

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
    if (passwordResetToken || emailVerificationToken) {
      setRestoringSession(false);
      return;
    }

    let cancelled = false;
    setRestoringSession(true);

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
  }, [emailVerificationToken, passwordResetToken]);

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
      void import("../lib/e2ee").then(({ lockUnlockedEncryptionState }) => {
        lockUnlockedEncryptionState(previousUserId);
      });
    }

    if (!nextUserId && previousUserId) {
      void import("../lib/e2ee").then(({ lockUnlockedEncryptionState }) => {
        lockUnlockedEncryptionState(previousUserId);
      });
    }

    previousUserIdRef.current = nextUserId;
  }, [session?.user.id]);

  useEffect(() => {
    if (passwordResetToken || emailVerificationToken || restoringSession || !session) {
      setPreparingSessionEncryption(false);
      return;
    }

    let cancelled = false;
    setPreparingSessionEncryption(true);
    void import("../lib/e2ee")
      .then(async ({ ensureEncryptionReadyForActiveSession }) => {
        await ensureEncryptionReadyForActiveSession(session);
        if (!cancelled) {
          setPreparingSessionEncryption(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreparingSessionEncryption(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emailVerificationToken, passwordResetToken, restoringSession, session]);

  useEffect(() => {
    if (passwordResetToken || emailVerificationToken) {
      return;
    }

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
  }, [emailVerificationToken, passwordResetToken, session, requestSessionRefresh]);

  useEffect(() => {
    if (passwordResetToken || emailVerificationToken) {
      return;
    }

    if (restoringSession || !session) {
      return;
    }

    void import("../lib/e2ee").then(({ syncEncryptionState }) => {
      void syncEncryptionState(session);
    });
  }, [emailVerificationToken, passwordResetToken, restoringSession, session]);

  useEffect(() => {
    if (passwordResetToken || emailVerificationToken) {
      return;
    }

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

      void import("../lib/e2ee").then(({ syncEncryptionState }) => {
        void syncEncryptionState(session);
      });
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [emailVerificationToken, passwordResetToken, session, requestSessionRefresh]);

  const handlePendingInviteHandled = useEffectEvent(() => {
    setPendingInviteCode(null);
    if (typeof window !== "undefined" && extractInviteCodeFromPath(window.location.pathname)) {
      window.history.replaceState({}, "", "/");
    }
  });

  const showBlockingRestore =
    restoringSession ||
    preparingSessionEncryption ||
    Boolean(session && refreshingExpiredSession && isAccessTokenExpired(session));
  const showSessionRestoreCard =
    (restoringSession && showRestoringSessionCard) ||
    preparingSessionEncryption ||
    Boolean(session && refreshingExpiredSession && isAccessTokenExpired(session));

  return (
    <div className="app-shell notranslate" translate="no">
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
      ) : passwordResetToken ? (
        <AuthCard
          onAuthenticated={setSession}
          initialPasswordResetToken={passwordResetToken}
          onPasswordResetHandled={() => {
            setPasswordResetToken(null);
            setSession(null);
            if (typeof window !== "undefined") {
              clearQueryParamFromLocation(PASSWORD_RESET_QUERY_PARAM);
            }
          }}
        />
      ) : emailVerificationToken ? (
        <AuthCard
          onAuthenticated={setSession}
          initialEmailVerificationToken={emailVerificationToken}
          onEmailVerificationHandled={() => {
            setEmailVerificationToken(null);
            if (typeof window !== "undefined") {
              clearQueryParamFromLocation(EMAIL_VERIFICATION_QUERY_PARAM);
            }
          }}
        />
      ) : session ? (
        <Suspense
          fallback={
            <main className="auth-shell" aria-hidden="true" />
          }
        >
          <NorthMessengerWorkspace
            session={session}
            pendingInviteCode={pendingInviteCode}
            onPendingInviteHandled={handlePendingInviteHandled}
            onSessionChange={setSession}
          />
        </Suspense>
      ) : (
        <AuthCard onAuthenticated={setSession} />
      )}
    </div>
  );
}
