import { describe, expect, it } from "vitest";
import {
  getSessionRefreshDelay,
  isRefreshCompatible,
  isAccessTokenExpired,
  shouldRefreshSessionSoon,
} from "./session";
import type { AuthResponse } from "./types";

const validSession: AuthResponse = {
  token: "access-token",
  tokenExpiresAt: "2026-03-22T20:00:00.000Z",
  sessionId: "session-id",
  user: {
    id: "user-id",
    username: "north",
    displayName: "North",
    createdAt: "2026-03-20T20:00:00.000Z",
    avatarUrl: null,
    online: true,
  },
};

describe("session timing", () => {
  it("detects when the access token is expired", () => {
    expect(isAccessTokenExpired(validSession, Date.parse("2026-03-22T20:00:01.000Z"))).toBe(true);
  });

  it("schedules a proactive refresh shortly before token expiry", () => {
    expect(shouldRefreshSessionSoon(validSession, Date.parse("2026-03-22T19:59:10.000Z"))).toBe(true);
    expect(getSessionRefreshDelay(validSession, Date.parse("2026-03-22T19:00:00.000Z"))).toBe(3_540_000);
  });

  it("rejects a refresh response that belongs to another user", () => {
    expect(
      isRefreshCompatible(validSession, {
        ...validSession,
        user: {
          ...validSession.user,
          id: "another-user-id",
          username: "someone-else",
        },
      })
    ).toBe(false);
  });

  it("accepts refresh when there is no existing session in the tab", () => {
    expect(isRefreshCompatible(null, validSession)).toBe(true);
  });
});
