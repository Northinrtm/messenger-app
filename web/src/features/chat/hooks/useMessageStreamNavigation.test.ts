import { describe, expect, it } from "vitest";

import type { ChatMessage, Participant } from "../../../lib/types";
import { resolveInitialMessageAnchorId } from "./useMessageStreamNavigation";

function participant(id: string): Participant {
  return {
    id,
    username: id,
    displayName: id,
    profession: null,
    avatarUrl: null,
    online: true,
  };
}

function message(id: string, senderId: string, createdAt: string): ChatMessage {
  return {
    id,
    chatId: "chat-1",
    sender: participant(senderId),
    content: id,
    createdAt,
    editedAt: null,
    status: null,
    replyTo: null,
    reactions: [],
  };
}

describe("resolveInitialMessageAnchorId", () => {
  it("returns the latest message when there are no unread messages", () => {
    const messages = [
      message("m1", "other", "2026-04-09T10:00:00.000Z"),
      message("m2", "me", "2026-04-09T10:01:00.000Z"),
      message("m3", "other", "2026-04-09T10:02:00.000Z"),
    ];

    expect(resolveInitialMessageAnchorId(messages, "me", 0)).toBe("m3");
  });

  it("returns the first unread incoming message from the tail", () => {
    const messages = [
      message("m1", "other", "2026-04-09T10:00:00.000Z"),
      message("m2", "me", "2026-04-09T10:01:00.000Z"),
      message("m3", "other", "2026-04-09T10:02:00.000Z"),
      message("m4", "other", "2026-04-09T10:03:00.000Z"),
      message("m5", "me", "2026-04-09T10:04:00.000Z"),
      message("m6", "other", "2026-04-09T10:05:00.000Z"),
    ];

    expect(resolveInitialMessageAnchorId(messages, "me", 2)).toBe("m4");
  });

  it("falls back to the earliest available unread incoming message when unread count is larger than the tail", () => {
    const messages = [
      message("m1", "me", "2026-04-09T10:00:00.000Z"),
      message("m2", "other", "2026-04-09T10:01:00.000Z"),
      message("m3", "me", "2026-04-09T10:02:00.000Z"),
    ];

    expect(resolveInitialMessageAnchorId(messages, "me", 5)).toBe("m2");
  });
});
