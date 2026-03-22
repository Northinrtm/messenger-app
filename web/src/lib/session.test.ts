import { beforeEach, describe, expect, it } from "vitest";
import { loadSession, saveSession } from "./session";
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
});
