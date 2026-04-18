import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../../lib/types";
import {
  getConferenceQueryRefreshStrategy,
  createInitialMessagePageCursor,
  getChatsQueryRefreshStrategy,
  getNextMessagePageCursor,
} from "./useWorkspaceQueries";

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    chatId: "chat-id",
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
      before: null,
      beforeMessageId: null,
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
        before: null,
        beforeMessageId: null,
        limit: 30,
      })
    ).toEqual({
      before: lastPage[0]?.createdAt,
      beforeMessageId: lastPage[0]?.id,
      limit: 50,
    });
  });

  it("does not request another page when the current page is shorter than requested", () => {
    expect(
      getNextMessagePageCursor(
        [message("message-1", "2026-04-17T10:00:00.000Z")],
        {
          before: "2026-04-17T10:05:00.000Z",
          beforeMessageId: "message-5",
          limit: 50,
        }
      )
    ).toBeUndefined();
  });
});
