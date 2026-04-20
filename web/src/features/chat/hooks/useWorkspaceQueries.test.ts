import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../../lib/types";
import {
  getConferenceQueryRefreshStrategy,
  createInitialMessagePageCursor,
  getCleanupEligiblePendingMessageClientIds,
  getChatsQueryRefreshStrategy,
  getNextMessagePageCursor,
} from "./useWorkspaceQueries";

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    chatId: "chat-id",
    serverOrder: Number(id.replace("message-", "")) + 1,
    sender: {
      id: "sender-id",
      username: "north",
      displayName: "North",
      profession: null,
      avatarUrl: null,
      online: true,
    },
    content: "encrypted message",
    createdAt,
    editedAt: null,
    status: null,
    clientMessageId: null,
    replyTo: null,
    reactions: [],
  };
}

describe("useWorkspaceQueries pagination helpers", () => {
  it("keeps chat polling but skips redundant focus reloads", () => {
    expect(getChatsQueryRefreshStrategy(true)).toEqual({
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    });

    expect(getChatsQueryRefreshStrategy(false)).toEqual({
      refetchInterval: 2_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: false,
    });
  });

  it("keeps conference data warm for tab indicators and refreshes aggressively only while viewing conferences", () => {
    expect(getConferenceQueryRefreshStrategy(false)).toEqual({
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 60_000,
      refetchOnWindowFocus: true,
    });

    expect(getConferenceQueryRefreshStrategy(true)).toEqual({
      refetchInterval: 5_000,
      refetchIntervalInBackground: false,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    });
  });

  it("uses a smaller initial page cursor for faster first chat paint", () => {
    expect(createInitialMessagePageCursor()).toEqual({
      beforeServerOrder: null,
      limit: 30,
    });
  });

  it("switches to the full history page size after the initial page", () => {
    const lastPage = Array.from({ length: 30 }, (_, index) =>
      message(
        `message-${index}`,
        `2026-04-17T10:${String(index).padStart(2, "0")}:00.000Z`
      )
    );

    expect(
      getNextMessagePageCursor(lastPage, {
        beforeServerOrder: null,
        limit: 30,
      })
    ).toEqual({
      beforeServerOrder: lastPage[0]?.serverOrder,
      limit: 50,
    });
  });

  it("does not request another page when the current page is shorter than requested", () => {
    expect(
      getNextMessagePageCursor(
        [message("message-1", "2026-04-17T10:00:00.000Z")],
        {
          beforeServerOrder: 5,
          limit: 50,
        }
      )
    ).toBeUndefined();
  });

  it("keeps local recovered plaintext until the confirmed server copy is decryptable", () => {
    const cleanupEligibleIds = getCleanupEligiblePendingMessageClientIds([
      {
        ...message("server-1", "2026-04-17T10:00:00.000Z"),
        clientMessageId: "client-1",
        content: "[Encrypted message unavailable]",
      },
      {
        ...message("server-2", "2026-04-17T10:01:00.000Z"),
        clientMessageId: "client-2",
        content: "confirmed plaintext",
      },
    ]);

    expect(cleanupEligibleIds.has("client-1")).toBe(false);
    expect(cleanupEligibleIds.has("client-2")).toBe(true);
  });
});
