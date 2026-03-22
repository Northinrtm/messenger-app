import type { AuthResponse } from "./types";

const SESSION_KEY = "north-messenger-session";

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
      !parsed.user
    ) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return parsed as AuthResponse;
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
