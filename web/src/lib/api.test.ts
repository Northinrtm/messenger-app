import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getChatAttachmentBrowserPage,
  register,
  requestPasswordReset,
  resendOwnEmailVerification,
} from "./api";

describe("api request helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts successful empty-body responses for password reset requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 202,
          statusText: "Accepted",
        })
      )
    );

    await expect(requestPasswordReset({ email: "north@example.com" })).resolves.toBeUndefined();
  });

  it("posts own-email verification resend with bearer auth", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        statusText: "Accepted",
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resendOwnEmailVerification("access-token")).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(requestInit.method).toBe("POST");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token"
    );
  });

  it("posts register payload with the canonical displayName field", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "access-token",
          tokenExpiresAt: "2026-04-19T08:00:00Z",
          sessionId: "session-1",
          user: {
            id: "user-1",
            username: "north",
            displayName: "North",
            profession: null,
            createdAt: "2026-04-18T08:00:00Z",
            avatarUrl: null,
            online: true,
          },
        }),
        {
          status: 200,
          statusText: "OK",
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    await register({
      username: "north",
      email: "north@example.com",
      displayName: "North",
      password: "riverlantern",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(requestUrl)).toContain("/api/auth/register");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(String(requestInit.body))).toEqual({
      username: "north",
      email: "north@example.com",
      displayName: "North",
      password: "riverlantern",
    });
  });

  it("requests chat attachment browser pages with kind and cursor query params", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          nextCursor: null,
        }),
        {
          status: 200,
          statusText: "OK",
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    await getChatAttachmentBrowserPage("access-token", "chat-1", {
      kind: "DOCUMENTS",
      cursor: "101|2026-05-08T12:00:00Z|attachment-1",
      limit: 25,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(requestUrl)).toContain("/api/chats/chat-1/attachments/browser");
    expect(String(requestUrl)).toContain("kind=DOCUMENTS");
    expect(String(requestUrl)).toContain("cursor=101%7C2026-05-08T12%3A00%3A00Z%7Cattachment-1");
    expect(String(requestUrl)).toContain("limit=25");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token"
    );
  });
});
