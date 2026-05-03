import { describe, expect, it, vi } from "vitest";

import type { ApiChatMessage, ChatMessage } from "./types";
import {
  hydrateChatMessage,
  hydrateChatMessageSnapshot,
  hydrateLatestUnavailableMessageSnapshots,
} from "./e2eeMessageHydration";

const baseMessage = (overrides: Partial<ApiChatMessage> = {}): ApiChatMessage => ({
  id: "message-id",
  chatId: "chat-id",
  serverOrder: 1,
  sender: {
    id: "self-user",
    username: "self",
    displayName: "Self",
    profession: null,
    avatarUrl: null,
    online: true,
  },
  createdAt: "2026-04-27T10:00:00.000Z",
  editedAt: null,
  status: null,
  clientMessageId: "client-message-id",
  replyTo: null,
  reactions: [],
  encryptedPayload: {
    scheme: "CHAT-EPOCH-KEY-AES-GCM",
  },
  ...overrides,
});

const buildHydratedChatMessage = (
  message: ApiChatMessage,
  content: string,
  editedAt = message.editedAt,
  attachments: ChatMessage["attachments"] = []
): ChatMessage => ({
  id: message.id,
  chatId: message.chatId,
  serverOrder: message.serverOrder ?? null,
  sender: message.sender,
  content,
  createdAt: message.createdAt,
  editedAt,
  status: message.status,
  clientMessageId: message.clientMessageId ?? null,
  replyTo: message.replyTo,
  reactions: message.reactions ?? [],
  attachments,
});

describe("e2eeMessageHydration", () => {
  it("builds a snapshot from archived decrypted content", async () => {
    const recordMessageHydrationDiagnostic = vi.fn();

    const hydrated = await hydrateChatMessageSnapshot({
      message: baseMessage(),
      userId: "self-user",
      ensureE2eeTransportStorageSchema: vi.fn(),
      readArchivedDecryptedMessageRecord: vi.fn(async () => ({
        content: "archived",
        editedAt: null,
        attachments: [],
      })),
      buildHydratedChatMessage,
      recordMessageHydrationDiagnostic,
    });

    expect(hydrated.content).toBe("archived");
    expect(recordMessageHydrationDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "snapshot",
        outcome: "snapshot-archive-hit",
        archiveHit: true,
        mirrorHit: false,
      })
    );
  });

  it("stores a successfully decrypted own message in the archive", async () => {
    const rememberArchivedDecryptedMessage = vi.fn(async () => undefined);
    const recordMessageHydrationDiagnostic = vi.fn();

    const hydrated = await hydrateChatMessage({
      message: baseMessage(),
      userId: "self-user",
      serializeMessageHydration: async (_userId, action) => action(),
      ensureE2eeTransportStorageSchema: vi.fn(),
      readArchivedDecryptedMessageRecord: vi.fn(async () => null),
      buildHydratedChatMessage,
      recordMessageHydrationDiagnostic,
      decryptMessage: vi.fn(async () => "decrypted"),
      rememberArchivedDecryptedMessage,
      refreshArchivedMessagesFromRemoteRecoverySnapshot: vi.fn(async () => false),
    });

    expect(hydrated.content).toBe("decrypted");
    expect(rememberArchivedDecryptedMessage).toHaveBeenCalledWith(
      "self-user",
      expect.objectContaining({ content: "decrypted" })
    );
    expect(recordMessageHydrationDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "hydrate",
        outcome: "decrypt-success",
      })
    );
  });

  it("refreshes the remote archive after a decrypt failure and rehydrates from it", async () => {
    const readArchivedDecryptedMessageRecord = vi
      .fn<() => Promise<{ content: string; editedAt: string | null; attachments: [] } | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        content: "remote-archive",
        editedAt: null,
        attachments: [],
      });
    const recordMessageHydrationDiagnostic = vi.fn();

    const hydrated = await hydrateChatMessage({
      message: baseMessage(),
      userId: "self-user",
      serializeMessageHydration: async (_userId, action) => action(),
      ensureE2eeTransportStorageSchema: vi.fn(),
      readArchivedDecryptedMessageRecord,
      buildHydratedChatMessage,
      recordMessageHydrationDiagnostic,
      decryptMessage: vi.fn(async () => {
        throw new Error("decrypt failed");
      }),
      rememberArchivedDecryptedMessage: vi.fn(async () => undefined),
      refreshArchivedMessagesFromRemoteRecoverySnapshot: vi.fn(async () => true),
    });

    expect(hydrated.content).toBe("remote-archive");
    expect(recordMessageHydrationDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "hydrate",
        outcome: "decrypt-failed-archive-refresh-hit",
        remoteArchiveRefreshAttempted: true,
        remoteArchiveRefreshHit: true,
      })
    );
  });

  it("rehydrates only the latest unavailable encrypted snapshots", async () => {
    const rawMessages = [
      baseMessage({ id: "m1", encryptedPayload: null }),
      baseMessage({ id: "m2" }),
      baseMessage({ id: "m3" }),
      baseMessage({ id: "m4" }),
      baseMessage({ id: "m5" }),
    ];
    const hydratedMessages: ChatMessage[] = rawMessages.map((message, index) =>
      buildHydratedChatMessage(
        message,
        index === 2 || index === 4 ? "[Encrypted message unavailable]" : `content-${index + 1}`
      )
    );
    const hydrateMessage = vi.fn(async (message: ApiChatMessage) =>
      buildHydratedChatMessage(message, `rehydrated-${message.id}`)
    );

    const nextMessages = await hydrateLatestUnavailableMessageSnapshots({
      rawMessages,
      hydratedMessages,
      userId: "self-user",
      beforeServerOrder: null,
      suffixSize: 2,
      isUnavailableEncryptedMessage: (value) => value === "[Encrypted message unavailable]",
      withSerializedMessageHydrationBatch: async (_userId, action) => action(),
      hydrateChatMessage: hydrateMessage,
    });

    expect(hydrateMessage).toHaveBeenCalledTimes(1);
    expect(hydrateMessage).toHaveBeenCalledWith(rawMessages[4], "self-user");
    expect(nextMessages[2].content).toBe("[Encrypted message unavailable]");
    expect(nextMessages[4].content).toBe("rehydrated-m5");
  });
});
