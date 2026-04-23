import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applyChatMessageActivity,
  applyChatPreviewOverrides,
  clearChatMessageActivity,
  flattenMessagePages,
  getMessageIdentityKey,
  mergeMessagePages,
  parseUsernames,
  reconcileMessageInfiniteData,
  replaceChatPreviewOverride,
  removeMessageByClientMessageId,
  upsertChatPreviewOverride,
  updateMessageByClientMessageId,
  updateMessageReactionsPages,
  updateMessageStatusPages,
} from "./chatState";
import { ensureOwnMessageStatus as normalizeOwnMessageStatus } from "./messagePresentation";
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
      profession: null,
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

  it("hydrates reply previews from decrypted messages instead of the server placeholder", () => {
    const repliedMessage = {
      ...message("1", "2026-03-22T10:00:00.000Z"),
      sender: {
        id: "user-2",
        username: "denis",
        displayName: "Денис",
        profession: null,
        avatarUrl: "avatar.png",
        online: true,
      },
      content: "Привет, это исходное сообщение",
    };
    const replyMessage: ChatMessage = {
      ...message("2", "2026-03-22T10:01:00.000Z"),
      replyTo: {
        id: "1",
        sender: {
          id: "user-2",
          username: "denis",
          displayName: "Денис",
          profession: null,
          avatarUrl: null,
          online: false,
        },
        createdAt: repliedMessage.createdAt,
        preview: "Encrypted message",
      },
    };

    const next = flattenMessagePages([[replyMessage, repliedMessage]]);

    expect(next[1]?.replyTo?.preview).toBe("Привет, это исходное сообщение");
    expect(next[1]?.replyTo?.sender.avatarUrl).toBe("avatar.png");
    expect(next[1]?.replyTo?.sender.online).toBe(true);
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

  it("replaces a failed optimistic message with a confirmed sent message after ack", () => {
    const currentUser = {
      id: "user-1",
      username: "north",
      displayName: "North",
      createdAt: "2026-03-22T09:59:00.000Z",
      profession: null,
      avatarUrl: null,
      online: true,
    };
    const current = {
      pages: [[{
        ...message("client-1", "2026-03-22T10:00:00.000Z"),
        clientMessageId: "client-1",
        status: {
          state: "FAILED" as const,
          recipientCount: 1,
          deliveredCount: 0,
          readCount: 0,
        },
      }]],
      pageParams: [null],
    };
    const confirmed = normalizeOwnMessageStatus({
      ...message("server-1", "2026-03-22T10:00:01.000Z"),
      clientMessageId: "client-1",
      status: null,
    }, currentUser);

    const merged = mergeMessagePages(current, confirmed);

    expect(merged.pages[0]).toHaveLength(1);
    expect(merged.pages[0][0]?.id).toBe("server-1");
    expect(merged.pages[0][0]?.status?.state).toBe("SENT");
  });

  it("orders equal timestamps deterministically by message identity", () => {
    const pages = [[
      message("b", "2026-03-22T10:00:00.000Z"),
      message("a", "2026-03-22T10:00:00.000Z"),
    ]];

    expect(flattenMessagePages(pages).map((item: ChatMessage) => item.id)).toEqual(["a", "b"]);
  });

  it("uses serverOrder as the authoritative order after realtime or refetch", () => {
    const pages = [[
      { ...message("server-2", "2026-03-22T10:00:05.000Z"), serverOrder: 2 },
      { ...message("server-1", "2026-03-22T10:00:06.000Z"), serverOrder: 1 },
    ]];

    expect(flattenMessagePages(pages).map((item: ChatMessage) => item.id)).toEqual([
      "server-1",
      "server-2",
    ]);
  });

  it("keeps rapid-send optimistic messages in local send order when timestamps match", () => {
    const pages = [[
      { ...message("client-2", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-2", localOrder: 2 },
      { ...message("client-3", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-3", localOrder: 3 },
      { ...message("client-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1", localOrder: 1 },
    ]];

    expect(flattenMessagePages(pages).map((item: ChatMessage) => item.clientMessageId)).toEqual([
      "client-1",
      "client-2",
      "client-3",
    ]);
  });

  it("keeps the same render identity when an optimistic message is confirmed", () => {
    const optimistic = {
      ...message("client-1", "2026-03-22T10:00:00.000Z"),
      clientMessageId: "client-1",
    };
    const confirmed = {
      ...message("server-1", "2026-03-22T10:00:01.000Z"),
      clientMessageId: "client-1",
    };

    expect(getMessageIdentityKey(optimistic)).toBe("client-1");
    expect(getMessageIdentityKey(confirmed)).toBe("client-1");
  });

  it("preserves rapid-send order when multiple confirmations arrive out of order", () => {
    let current: InfiniteData<ChatMessage[]> = {
      pages: [[
        { ...message("client-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1", localOrder: 1 },
        { ...message("client-2", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-2", localOrder: 2 },
        { ...message("client-3", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-3", localOrder: 3 },
      ]],
      pageParams: [null],
    };

    current = mergeMessagePages(current, {
      ...message("server-3", "2026-03-22T10:00:03.000Z"),
      clientMessageId: "client-3",
    });
    current = mergeMessagePages(current, {
      ...message("server-1", "2026-03-22T10:00:05.000Z"),
      clientMessageId: "client-1",
    });
    current = mergeMessagePages(current, {
      ...message("server-2", "2026-03-22T10:00:04.000Z"),
      clientMessageId: "client-2",
    });

    expect(flattenMessagePages(current.pages).map((item: ChatMessage) => item.id)).toEqual([
      "server-1",
      "server-2",
      "server-3",
    ]);
  });

  it("preserves rapid-send order when realtime delivery and local acknowledgements interleave", () => {
    let current: InfiniteData<ChatMessage[]> = {
      pages: [[
        { ...message("client-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1", localOrder: 1 },
        { ...message("client-2", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-2", localOrder: 2 },
        { ...message("client-3", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-3", localOrder: 3 },
      ]],
      pageParams: [null],
    };

    current = mergeMessagePages(current, {
      ...message("server-2", "2026-03-22T10:00:01.000Z"),
      clientMessageId: "client-2",
    });
    current = mergeMessagePages(current, {
      ...message("server-3", "2026-03-22T10:00:04.000Z"),
      clientMessageId: "client-3",
    });
    current = mergeMessagePages(current, {
      ...message("server-1", "2026-03-22T10:00:05.000Z"),
      clientMessageId: "client-1",
    });

    expect(flattenMessagePages(current.pages).map((item: ChatMessage) => item.id)).toEqual([
      "server-1",
      "server-2",
      "server-3",
    ]);
  });

  it("preserves rapid-send order across refetch reconciliation", () => {
    const current = {
      pages: [[
        { ...message("server-1", "2026-03-22T10:00:05.000Z"), clientMessageId: "client-1", localOrder: 1 },
        { ...message("server-2", "2026-03-22T10:00:04.000Z"), clientMessageId: "client-2", localOrder: 2 },
        { ...message("server-3", "2026-03-22T10:00:03.000Z"), clientMessageId: "client-3", localOrder: 3 },
      ]],
      pageParams: [null],
    };
    const incoming = {
      pages: [[
        { ...message("server-3", "2026-03-22T10:00:03.000Z"), clientMessageId: "client-3" },
        { ...message("server-2", "2026-03-22T10:00:04.000Z"), clientMessageId: "client-2" },
        { ...message("server-1", "2026-03-22T10:00:05.000Z"), clientMessageId: "client-1" },
      ]],
      pageParams: [null],
    };

    const reconciled = reconcileMessageInfiniteData(current, incoming);

    expect(flattenMessagePages(reconciled?.pages).map((item: ChatMessage) => item.id)).toEqual([
      "server-1",
      "server-2",
      "server-3",
    ]);
  });

  it("keeps older paginated history ahead of newer rapid-send messages", () => {
    const pages = [
      [
        { ...message("server-2", "2026-03-22T10:00:04.000Z"), clientMessageId: "client-2", localOrder: 2 },
        { ...message("server-1", "2026-03-22T10:00:05.000Z"), clientMessageId: "client-1", localOrder: 1 },
      ],
      [
        message("history-1", "2026-03-22T09:59:58.000Z"),
        message("history-2", "2026-03-22T09:59:59.000Z"),
      ],
    ];

    expect(flattenMessagePages(pages).map((item: ChatMessage) => item.id)).toEqual([
      "history-1",
      "history-2",
      "server-1",
      "server-2",
    ]);
  });

  it("keeps already decrypted content when the same realtime message arrives as unavailable", () => {
    const current = {
      pages: [[message("1", "2026-03-22T10:00:00.000Z")]],
      pageParams: [null],
    };
    const unavailable = {
      ...message("1", "2026-03-22T10:00:00.000Z"),
      content: "[Encrypted message unavailable]",
    };

    const merged = mergeMessagePages(current, unavailable);

    expect(merged.pages[0][0]?.content).toBe("message-1");
  });

  it("preserves decrypted history when a refetch returns the same message as unavailable", () => {
    const current = {
      pages: [[message("1", "2026-03-22T10:00:00.000Z")]],
      pageParams: [null],
    };
    const incoming = {
      pages: [[
        {
          ...message("1", "2026-03-22T10:00:00.000Z"),
          content: "[Encrypted message unavailable]",
        },
      ]],
      pageParams: [null],
    };

    const reconciled = reconcileMessageInfiniteData(current, incoming);

    expect(reconciled?.pages[0][0]?.content).toBe("message-1");
  });

  it("removes an optimistic message by client message id", () => {
    const current = {
      pages: [[{ ...message("local-1", "2026-03-22T10:00:00.000Z"), clientMessageId: "client-1" }]],
      pageParams: [null],
    };

    const next = removeMessageByClientMessageId(current, "client-1");

    expect(next?.pages[0]).toEqual([]);
  });

  it("marks a pending optimistic message as failed without removing it", () => {
    const current = {
      pages: [[{
        ...message("client-1", "2026-03-22T10:00:00.000Z"),
        clientMessageId: "client-1",
        localOrder: 1,
        status: {
          state: "SENDING" as const,
          recipientCount: 1,
          deliveredCount: 0,
          readCount: 0,
        },
      }]],
      pageParams: [null],
    };

    const next = updateMessageByClientMessageId(current, "client-1", (entry) => ({
      ...entry,
      status: {
        state: "FAILED",
        recipientCount: 1,
        deliveredCount: 0,
        readCount: 0,
      },
    }));

    expect(next?.pages[0]).toHaveLength(1);
    expect(next?.pages[0][0]?.status?.state).toBe("FAILED");
    expect(next?.pages[0][0]?.id).toBe("client-1");
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
        moderatorUserIds: [],
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
        moderatorUserIds: [],
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

  it("keeps unread count sourced from the server when preview updates arrive for inactive chats", () => {
    const chats: ChatSummary[] = [
      {
        id: "chat-1",
        direct: true,
        title: "Alice",
        avatarUrl: null,
        ownerUserId: null,
        moderatorUserIds: [],
        members: [],
        lastMessage: "previous",
        lastMessageAt: "2026-03-22T10:00:00.000Z",
        updatedAt: "2026-03-22T10:00:00.000Z",
        unreadCount: 3,
        pinnedMessage: null,
      },
    ];

    const next = applyChatMessageActivity(
      chats,
      {
        ...message("2", "2026-03-22T10:01:00.000Z"),
        chatId: "chat-1",
      },
      "keep"
    );

    expect(next?.[0]?.unreadCount).toBe(3);
    expect(next?.[0]?.lastMessageAt).toBe("2026-03-22T10:01:00.000Z");
  });

  it("still clears unread count for the active chat after read acknowledgement", () => {
    const chats: ChatSummary[] = [
      {
        id: "chat-1",
        direct: true,
        title: "Alice",
        avatarUrl: null,
        ownerUserId: null,
        moderatorUserIds: [],
        members: [],
        lastMessage: "previous",
        lastMessageAt: "2026-03-22T10:00:00.000Z",
        updatedAt: "2026-03-22T10:00:00.000Z",
        unreadCount: 3,
        pinnedMessage: null,
      },
    ];

    const next = applyChatMessageActivity(
      chats,
      {
        ...message("2", "2026-03-22T10:01:00.000Z"),
        chatId: "chat-1",
      },
      "clear"
    );

    expect(next?.[0]?.unreadCount).toBe(0);
  });

  it("clears the chat preview when the last visible message is deleted", () => {
    const chats: ChatSummary[] = [
      {
        id: "chat-1",
        direct: false,
        title: "Group",
        avatarUrl: null,
        ownerUserId: null,
        moderatorUserIds: [],
        members: [],
        lastMessage: "deleted message",
        lastMessageAt: "2026-03-22T10:02:00.000Z",
        lastMessageServerOrder: 12,
        updatedAt: "2026-03-22T10:02:00.000Z",
        unreadCount: 0,
        pinnedMessage: null,
      },
    ];

    const next = clearChatMessageActivity(chats, "chat-1");

    expect(next?.[0]).toMatchObject({
      lastMessage: null,
      lastMessageAt: null,
      lastMessageServerOrder: null,
      updatedAt: "2026-03-22T10:02:00.000Z",
    });
  });
});
