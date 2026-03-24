import { describe, expect, it } from "vitest";
import {
  flattenMessagePages,
  mergeMessagePages,
  parseUsernames,
  updateMessageStatusPages,
} from "./chatState";
import type { ChatMessage, MessageStatusEvent } from "../../lib/types";

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    chatId: "chat-1",
    sender: {
      id: "user-1",
      username: "north",
      displayName: "North",
      avatarUrl: null,
      online: true,
    },
    content: `message-${id}`,
    createdAt,
    status: null,
  };
}

describe("chatState", () => {
  it("flattens paged messages into chronological unique history", () => {
    const pages = [
      [
        message("2", "2026-03-22T10:01:00.000Z"),
        message("3", "2026-03-22T10:02:00.000Z"),
      ],
      [
        message("1", "2026-03-22T10:00:00.000Z"),
        message("2", "2026-03-22T10:01:00.000Z"),
      ],
    ];

    expect(flattenMessagePages(pages).map((item: ChatMessage) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("merges a realtime message into the newest page only once", () => {
    const current = {
      pages: [[message("1", "2026-03-22T10:00:00.000Z")]],
      pageParams: [null],
    };
    const nextMessage = message("2", "2026-03-22T10:01:00.000Z");

    const merged = mergeMessagePages(current, nextMessage);
    const duplicate = mergeMessagePages(merged, nextMessage);

    expect(merged.pages[0].map((item: ChatMessage) => item.id)).toEqual(["1", "2"]);
    expect(duplicate.pages[0].map((item: ChatMessage) => item.id)).toEqual(["1", "2"]);
  });

  it("normalizes usernames for chat creation inputs", () => {
    expect(parseUsernames(" Alice, @Bob  carol ")).toEqual(["alice", "bob", "carol"]);
  });

  it("updates message status in cached pages", () => {
    const current = {
      pages: [[message("1", "2026-03-22T10:00:00.000Z")]],
      pageParams: [null],
    };
    const event: MessageStatusEvent = {
      messageId: "1",
      chatId: "chat-1",
      status: {
        state: "READ",
        recipientCount: 1,
        deliveredCount: 1,
        readCount: 1,
      },
    };

    const next = updateMessageStatusPages(current, event);

    expect(next?.pages[0][0].status?.state).toBe("READ");
  });
});
