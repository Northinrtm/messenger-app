import { describe, expect, it } from "vitest";

import {
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
});
