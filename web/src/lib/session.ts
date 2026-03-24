import type { AuthResponse } from "./types";

const SESSION_REFRESH_LEEWAY_MS = 60_000;

export function isRefreshCompatible(
  currentSession: AuthResponse | null,
  nextSession: AuthResponse
) {
  if (!currentSession) {
    return true;
  }

  return currentSession.user.id === nextSession.user.id;
}

export function isAccessTokenExpired(session: AuthResponse, now = Date.now()) {
  return new Date(session.tokenExpiresAt).getTime() <= now;
}

export function shouldRefreshSessionSoon(session: AuthResponse, now = Date.now()) {
  return new Date(session.tokenExpiresAt).getTime() - now <= SESSION_REFRESH_LEEWAY_MS;
}

export function getSessionRefreshDelay(session: AuthResponse, now = Date.now()) {
  return Math.max(new Date(session.tokenExpiresAt).getTime() - now - SESSION_REFRESH_LEEWAY_MS, 1_000);
}
