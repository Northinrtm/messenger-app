import { describe, expect, it } from "vitest";

import {
  buildReadableIncomingMessageIdsKey,
  canAcknowledgeVisibleMessagesAsRead,
  shouldAcknowledgeIncomingMessageAsRead,
} from "./messageReadVisibility";

describe("messageReadVisibility", () => {
  it("keeps an incoming message unread when the matching chat is not actually open", () => {
    expect(
      shouldAcknowledgeIncomingMessageAsRead({
        activeChatId: "chat-1",
        messageChatId: "chat-1",
        isActiveChatOpen: false,
        isDocumentVisible: true,
        hasDocumentFocus: true,
      })
    ).toBe(false);
  });

  it("marks an incoming message as read only after that exact chat is opened", () => {
    expect(
      shouldAcknowledgeIncomingMessageAsRead({
        activeChatId: "chat-1",
        messageChatId: "chat-2",
        isActiveChatOpen: true,
        isDocumentVisible: true,
        hasDocumentFocus: true,
      })
    ).toBe(false);

    expect(
      shouldAcknowledgeIncomingMessageAsRead({
        activeChatId: "chat-1",
        messageChatId: "chat-1",
        isActiveChatOpen: true,
        isDocumentVisible: true,
        hasDocumentFocus: true,
      })
    ).toBe(true);
  });

  it("does not acknowledge visible history as read until the chat pane is open", () => {
    expect(
      canAcknowledgeVisibleMessagesAsRead({
        isActiveChatOpen: false,
        isDocumentVisible: true,
        hasDocumentFocus: true,
      })
    ).toBe(false);

    expect(
      canAcknowledgeVisibleMessagesAsRead({
        isActiveChatOpen: true,
        isDocumentVisible: true,
        hasDocumentFocus: true,
      })
    ).toBe(true);
  });

  it("tracks readable incoming messages so read-ack can rerun after updates", () => {
    expect(
      buildReadableIncomingMessageIdsKey(
        [
          {
            id: "message-1",
            chatId: "chat-1",
            serverOrder: 1,
            sender: {
              id: "user-2",
              username: "alice",
              displayName: "Alice",
              profession: null,
              avatarUrl: null,
              online: true,
            },
            content: "message-1",
            createdAt: "2026-04-27T09:00:00.000Z",
            editedAt: null,
            status: null,
            clientMessageId: null,
            localOrder: null,
            replyTo: null,
            reactions: [],
            attachments: [],
          },
          {
            id: "message-2",
            chatId: "chat-1",
            serverOrder: 2,
            sender: {
              id: "user-2",
              username: "alice",
              displayName: "Alice",
              profession: null,
              avatarUrl: null,
              online: true,
            },
            content: "hello",
            createdAt: "2026-04-27T09:00:01.000Z",
            editedAt: null,
            status: null,
            clientMessageId: null,
            localOrder: null,
            replyTo: null,
            reactions: [],
            attachments: [],
          },
        ],
        "user-1"
      )
    ).toBe("message-1,message-2");
  });
});
