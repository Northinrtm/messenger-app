import { describe, expect, it, beforeEach } from "vitest";

import {
  recoverLocalPendingMessages,
  toRecoveredPendingChatMessage,
  upsertLocalPendingMessage,
} from "./localPendingMessages";
import { flattenMessagePages } from "../features/chat/chatState";
import type { ChatMessage, UserProfile } from "./types";

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
  };
}

describe("localPendingMessages reload recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("recovers an in-flight message as still sending instead of surfacing a retry on reload", () => {
    upsertLocalPendingMessage("user-1", {
      chatId: "chat-1",
      clientMessageId: "client-1",
      content: "hello after reload",
      createdAt: "2026-04-18T12:00:01.000Z",
      localOrder: 7,
      recipientCount: 1,
      replyTo: null,
      status: "SENDING",
    });

    const recovered = recoverLocalPendingMessages("user-1");
    const recoveredMessage = toRecoveredPendingChatMessage(currentUser(), recovered[0]!);

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe("SENDING");
    expect(recoveredMessage.status?.state).toBe("SENDING");
    expect(recoveredMessage.clientMessageId).toBe("client-1");
    expect(recoveredMessage.id).toBe("client-1");
  });

  it("does not duplicate a recovered pending message when the server already confirmed the same client message id", () => {
    upsertLocalPendingMessage("user-1", {
      chatId: "chat-1",
      clientMessageId: "client-1",
      content: "hello after reload",
      createdAt: "2026-04-18T12:00:01.000Z",
      localOrder: 7,
      recipientCount: 1,
      replyTo: null,
      status: "SENDING",
    });

    const recovered = recoverLocalPendingMessages("user-1").map((message) =>
      toRecoveredPendingChatMessage(currentUser(), message)
    );
    const flattened = flattenMessagePages([
      [confirmedServerMessage()],
      recovered,
    ]);

    expect(flattened).toHaveLength(1);
    expect(flattened[0]?.id).toBe("server-1");
    expect(flattened[0]?.clientMessageId).toBe("client-1");
    expect(flattened[0]?.status?.state).toBe("SENT");
  });
});
