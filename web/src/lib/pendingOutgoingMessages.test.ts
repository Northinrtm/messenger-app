import { describe, expect, it } from "vitest";

import { flattenMessagePages } from "../features/chat/chatState";
import { toRecoveredPendingChatMessage } from "./pendingOutgoingMessages";
import type { ChatMessage, PendingOutgoingMessage, UserProfile } from "./types";

function currentUser(): UserProfile {
  return {
    id: "user-1",
    username: "north",
    displayName: "North",
    createdAt: "2026-04-18T12:00:00.000Z",
    profession: null,
    avatarUrl: null,
    online: true,
  };
}

function pendingMessage(): PendingOutgoingMessage {
  return {
    chatId: "chat-1",
    clientMessageId: "client-1",
    content: "hello after reload",
    createdAt: "2026-04-18T12:00:01.000Z",
    localOrder: 7,
    recipientCount: 1,
    replyTo: null,
    status: "SENDING",
    updatedAt: "2026-04-18T12:00:01.000Z",
    attachments: [],
  };
}

function confirmedServerMessage(): ChatMessage {
  return {
    id: "server-1",
    chatId: "chat-1",
    serverOrder: 101,
    sender: currentUser(),
    content: "hello after reload",
    createdAt: "2026-04-18T12:00:02.000Z",
    editedAt: null,
    status: {
      state: "SENT",
      recipientCount: 1,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId: "client-1",
    replyTo: null,
    reactions: [],
    attachments: [],
  };
}

describe("pendingOutgoingMessages", () => {
  it("converts a recovered pending message into a sending bubble", () => {
    const recoveredMessage = toRecoveredPendingChatMessage(currentUser(), pendingMessage());

    expect(recoveredMessage.status?.state).toBe("SENDING");
    expect(recoveredMessage.clientMessageId).toBe("client-1");
    expect(recoveredMessage.id).toBe("client-1");
  });

  it("does not duplicate a recovered pending bubble when the server already confirmed the message", () => {
    const recovered = [toRecoveredPendingChatMessage(currentUser(), pendingMessage())];
    const flattened = flattenMessagePages([[confirmedServerMessage()], recovered]);

    expect(flattened).toHaveLength(1);
    expect(flattened[0]?.id).toBe("server-1");
    expect(flattened[0]?.clientMessageId).toBe("client-1");
    expect(flattened[0]?.status?.state).toBe("SENT");
  });
});
