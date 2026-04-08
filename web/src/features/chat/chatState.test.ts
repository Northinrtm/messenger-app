import { describe, expect, it } from "vitest";
import {
  applyChatPreviewOverrides,
  flattenMessagePages,
  mergeMessagePages,
  parseUsernames,
  replaceChatPreviewOverride,
  removeMessageByClientMessageId,
  upsertChatPreviewOverride,
  updateMessageReactionsPages,
  updateMessageStatusPages,
} from "./chatState";
import type {
  ChatMessage,
  ChatSummary,
  MessageReactionEvent,
  MessageStatusEvent,
} from "../../lib/types";

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
    editedAt: null,
    status: null,
    replyTo: null,
    reactions: [],
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

  it("prefers the confirmed server message over the optimistic client copy", () => {
    const pages = [[
      { ...message("client-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1" },
      { ...message("server-1", "2026-03-22T10:00:01.000Z"), clientMessageId: "client-1" },
    ]];

    expect(flattenMessagePages(pages)).toEqual([
      { ...message("server-1", "2026-03-22T10:00:01.000Z"), clientMessageId: "client-1" },
    ]);
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

  it("replaces an optimistic message when the server echoes the same client message id", () => {
    const current = {
      pages: [[{ ...message("local-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1" }]],
      pageParams: [null],
    };
    const confirmed = {
      ...message("server-1", "2026-03-22T10:00:01.000Z"),
      clientMessageId: "client-1",
    };

    const merged = mergeMessagePages(current, confirmed);

    expect(merged.pages[0]).toEqual([confirmed]);
  });

  it("removes an optimistic message by client message id", () => {
    const current = {
      pages: [[{ ...message("local-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1" }]],
      pageParams: [null],
    };

    const next = removeMessageByClientMessageId(current, "client-1");

    expect(next?.pages[0]).toEqual([]);
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

  it("updates message reactions in cached pages", () => {
    const current = {
      pages: [[message("1", "2026-03-22T10:00:00.000Z")]],
      pageParams: [null],
    };
    const event: MessageReactionEvent = {
      messageId: "1",
      chatId: "chat-1",
      reactions: [
        {
          key: "LIKE",
          count: 2,
          reactedByCurrentUser: true,
        },
      ],
    };

    const next = updateMessageReactionsPages(current, event);

    expect(next?.pages[0][0].reactions).toEqual(event.reactions);
  });

  it("applies a decrypted preview over the server placeholder for the same message timestamp", () => {
    const chats: ChatSummary[] = [
      {
        id: "chat-1",
        direct: true,
        title: "Alice",
        avatarUrl: null,
        ownerUserId: null,
        members: [],
        lastMessage: "Encrypted message",
        lastMessageAt: "2026-03-22T10:00:00.000Z",
        updatedAt: "2026-03-22T10:00:00.000Z",
        unreadCount: 0,
        pinnedMessage: null,
      },
    ];

    const next = applyChatPreviewOverrides(chats, {
      "chat-1": {
        lastMessage: "hello",
        lastMessageAt: "2026-03-22T10:00:00.000Z",
      },
    });

    expect(next[0]?.lastMessage).toBe("hello");
  });

  it("keeps the newer server timestamp when the local preview is stale", () => {
    const chats: ChatSummary[] = [
      {
        id: "chat-1",
        direct: true,
        title: "Alice",
        avatarUrl: null,
        ownerUserId: null,
        members: [],
        lastMessage: "Encrypted message",
        lastMessageAt: "2026-03-22T10:01:00.000Z",
        updatedAt: "2026-03-22T10:01:00.000Z",
        unreadCount: 0,
        pinnedMessage: null,
      },
    ];

    const next = applyChatPreviewOverrides(chats, {
      "chat-1": {
        lastMessage: "older",
        lastMessageAt: "2026-03-22T10:00:00.000Z",
      },
    });

    expect(next[0]?.lastMessage).toBe("Encrypted message");
  });

  it("updates the preview override only when the incoming message is newer", () => {
    const current = {
      "chat-1": {
        lastMessage: "newest",
        lastMessageAt: "2026-03-22T10:01:00.000Z",
      },
    };

    const next = upsertChatPreviewOverride(current, message("2", "2026-03-22T10:00:00.000Z"));

    expect(next).toBe(current);
  });

  it("replaces the preview override when a deletion reveals an older latest message", () => {
    const current = {
      "chat-1": {
        lastMessage: "deleted message",
        lastMessageAt: "2026-03-22T10:02:00.000Z",
      },
    };

    const next = replaceChatPreviewOverride(current, "chat-1", {
      lastMessage: "visible older message",
      lastMessageAt: "2026-03-22T10:01:00.000Z",
    });

    expect(next["chat-1"]).toEqual({
      lastMessage: "visible older message",
      lastMessageAt: "2026-03-22T10:01:00.000Z",
    });
  });
});
