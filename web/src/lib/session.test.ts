import { beforeEach, describe, expect, it } from "vitest";
import {
  getSessionRefreshDelay,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  loadSession,
  saveSession,
  shouldRefreshSessionSoon,
} from "./session";
import type { AuthResponse } from "./types";

const validSession: AuthResponse = {
  token: "access-token",
  tokenExpiresAt: "2026-03-22T20:00:00.000Z",
  refreshToken: "session.secret",
  refreshTokenExpiresAt: "2026-04-21T20:00:00.000Z",
  sessionId: "session-id",
  user: {
    id: "user-id",
    username: "north",
    displayName: "North",
    createdAt: "2026-03-20T20:00:00.000Z",
  },
};

describe("session storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("roundtrips a complete session payload", () => {
    saveSession(validSession);

    expect(loadSession()).toEqual(validSession);
  });

  it("drops incompatible legacy payloads", () => {
    window.localStorage.setItem(
      "north-messenger-session",
      JSON.stringify({
        token: "legacy-token",
        user: validSession.user,
      })
    );

    expect(loadSession()).toBeNull();
    expect(window.localStorage.getItem("north-messenger-session")).toBeNull();
  });

  it("drops payloads with incomplete user data", () => {
    window.localStorage.setItem(
      "north-messenger-session",
      JSON.stringify({
        ...validSession,
        user: {
          id: "user-id",
          username: "north",
        },
      })
    );

    expect(loadSession()).toBeNull();
    expect(window.localStorage.getItem("north-messenger-session")).toBeNull();
  });

  it("detects when access and refresh tokens are expired", () => {
    expect(isAccessTokenExpired(validSession, Date.parse("2026-03-22T20:00:01.000Z"))).toBe(true);
    expect(isRefreshTokenExpired(validSession, Date.parse("2026-04-21T20:00:01.000Z"))).toBe(true);
  });

  it("schedules a proactive refresh shortly before token expiry", () => {
    expect(shouldRefreshSessionSoon(validSession, Date.parse("2026-03-22T19:59:10.000Z"))).toBe(true);
    expect(getSessionRefreshDelay(validSession, Date.parse("2026-03-22T19:00:00.000Z"))).toBe(3_540_000);
  });
});
