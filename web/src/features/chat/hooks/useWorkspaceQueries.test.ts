import { describe, expect, it, vi } from "vitest";

import type { ApiChatMessage } from "../../../lib/types";
import {
  buildMessageHydrationKey,
  resetMessageHydrationStateForChat,
} from "./useWorkspaceQueries";

function rawMessage(id: string): ApiChatMessage {
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
    createdAt: "2026-04-30T06:10:00.000Z",
    editedAt: null,
    status: null,
    clientMessageId: null,
    replyTo: null,
    reactions: [],
    encryptedPayload: null,
  };
}

describe("useWorkspaceQueries hydration helpers", () => {
  it("builds a stable hydration key from chat id and edit state", () => {
    expect(
      buildMessageHydrationKey("chat-1", {
        id: "message-1",
        editedAt: "2026-04-30T06:10:00.000Z",
      })
    ).toBe("chat-1:message-1:2026-04-30T06:10:00.000Z");

    expect(
      buildMessageHydrationKey("chat-1", {
        id: "message-1",
        editedAt: null,
      })
    ).toBe("chat-1:message-1:");
  });

  it("resets queued hydration state only for the requested chat", () => {
    const clearTimeoutSpy = vi.fn();
    const queuedHydrationKeys = new Set([
      "chat-1:message-1:",
      "chat-1:message-2:",
      "chat-2:message-3:",
    ]);
    const hydrationQueue = new Map([
      ["chat-1:message-1:", { chatId: "chat-1", rawMessage: rawMessage("message-1") }],
      ["chat-2:message-3:", { chatId: "chat-2", rawMessage: { ...rawMessage("message-3"), chatId: "chat-2" } }],
    ]);
    const hydrationRetryCounts = new Map([
      ["chat-1:message-2:", 2],
      ["chat-2:message-3:", 1],
    ]);
    const hydrationRetryTimeoutIds = new Map([
      ["chat-1:message-1:", 101],
      ["chat-2:message-3:", 202],
    ]);

    resetMessageHydrationStateForChat({
      chatId: "chat-1",
      queuedHydrationKeys,
      hydrationQueue,
      hydrationRetryCounts,
      hydrationRetryTimeoutIds,
      clearTimeout: clearTimeoutSpy,
    });

    expect([...queuedHydrationKeys]).toEqual(["chat-2:message-3:"]);
    expect([...hydrationQueue.keys()]).toEqual(["chat-2:message-3:"]);
    expect([...hydrationRetryCounts.entries()]).toEqual([["chat-2:message-3:", 1]]);
    expect([...hydrationRetryTimeoutIds.entries()]).toEqual([["chat-2:message-3:", 202]]);
    expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(101);
  });
});
