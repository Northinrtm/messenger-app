import type { AuthResponse } from "./types";

const SESSION_KEY = "north-messenger-session";
const SESSION_REFRESH_LEEWAY_MS = 60_000;

export function loadSession(): AuthResponse | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthResponse> | null;
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.tokenExpiresAt !== "string" ||
      typeof parsed.refreshTokenExpiresAt !== "string" ||
      typeof parsed.sessionId !== "string" ||
      !isValidSessionUser(parsed.user)
    ) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return {
      ...parsed,
      user: {
        ...parsed.user,
        online: parsed.user.online === true,
      },
    } as AuthResponse;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AuthResponse | null) {
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function isAccessTokenExpired(session: AuthResponse, now = Date.now()) {
  return new Date(session.tokenExpiresAt).getTime() <= now;
}

export function isRefreshTokenExpired(session: AuthResponse, now = Date.now()) {
  return new Date(session.refreshTokenExpiresAt).getTime() <= now;
}

export function shouldRefreshSessionSoon(session: AuthResponse, now = Date.now()) {
  return new Date(session.tokenExpiresAt).getTime() - now <= SESSION_REFRESH_LEEWAY_MS;
}

export function getSessionRefreshDelay(session: AuthResponse, now = Date.now()) {
  return Math.max(new Date(session.tokenExpiresAt).getTime() - now - SESSION_REFRESH_LEEWAY_MS, 1_000);
}

function isValidSessionUser(user: AuthResponse["user"] | null | undefined): user is AuthResponse["user"] {
  return Boolean(
    user &&
      typeof user.id === "string" &&
      typeof user.username === "string" &&
      typeof user.displayName === "string" &&
      typeof user.createdAt === "string" &&
      (typeof user.avatarUrl === "string" || user.avatarUrl === null) &&
      (typeof user.online === "boolean" || typeof user.online === "undefined")
  );
}
