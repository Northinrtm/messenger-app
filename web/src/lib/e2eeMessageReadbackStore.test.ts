import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createE2eeMessageReadbackStore } from "./e2eeMessageReadbackStore";
import type { ApiChatMessage, ChatMessageAttachment } from "./types";

const normalizeAttachments = (value: unknown): ChatMessageAttachment[] =>
  Array.isArray(value) ? (value as ChatMessageAttachment[]) : [];

const createStore = () =>
  createE2eeMessageReadbackStore({
    outgoingMessageMirrorStoragePrefix: "test:outgoing:",
    decryptedMessageArchiveStoragePrefix: "test:archive:",
    decryptedMessageArchiveDbName: "test-archive-db",
    decryptedMessageArchiveDbVersion: 1,
    decryptedMessageArchiveStoreName: "messages",
    decryptedMessageArchiveChatIndexName: "by-user-chat-created-at",
    outgoingMessageMirrorTtlMs: 60_000,
    outgoingMessageMirrorMaxRecords: 3,
    normalizeAttachments,
    isUnavailableEncryptedMessage: (value) => value === "[Encrypted message unavailable]",
  });

const ownMessage = (overrides: Partial<ApiChatMessage> = {}): ApiChatMessage => ({
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
  encryptedPayload: null,
  ...overrides,
});

describe("e2eeMessageReadbackStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:05:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mirrors and resolves own outgoing messages by messageId and clientMessageId", () => {
    const store = createStore();

    store.rememberOutgoingMessageMirror("self-user", {
      id: "message-id",
      chatId: "chat-id",
      content: "hello",
      createdAt: "2026-04-27T10:00:00.000Z",
      editedAt: null,
      attachments: [],
      clientMessageId: "client-message-id",
    });

    expect(
      store.readOutgoingMessageMirror(
        "self-user",
        ownMessage({ id: "message-id", clientMessageId: null }),
        "self-user"
      )
    ).toMatchObject({ content: "hello" });

    expect(
      store.readOutgoingMessageMirror(
        "self-user",
        ownMessage({ id: "different-id", clientMessageId: "client-message-id" }),
        "self-user"
      )
    ).toMatchObject({ content: "hello" });
  });

  it("ignores unavailable placeholders in the outgoing mirror", () => {
    const store = createStore();

    store.rememberOutgoingMessageMirror("self-user", {
      id: "message-id",
      chatId: "chat-id",
      content: "[Encrypted message unavailable]",
      createdAt: "2026-04-27T10:00:00.000Z",
      editedAt: null,
      attachments: [],
      clientMessageId: "client-message-id",
    });

    expect(
      store.readOutgoingMessageMirror("self-user", ownMessage(), "self-user")
    ).toBeNull();
  });

  it("stores archived records in localStorage and returns the latest chat preview", async () => {
    const store = createStore();

    await store.writeArchivedDecryptedMessageRecords("self-user", [
      {
        messageId: "m1",
        chatId: "chat-id",
        createdAt: "2026-04-27T10:00:00.000Z",
        editedAt: null,
        salt: "salt-1",
        iv: "iv-1",
        ciphertext: "cipher-1",
        archivedAt: "2026-04-27T10:00:01.000Z",
      },
      {
        messageId: "m2",
        chatId: "chat-id",
        createdAt: "2026-04-27T10:01:00.000Z",
        editedAt: null,
        salt: "salt-2",
        iv: "iv-2",
        ciphertext: "cipher-2",
        archivedAt: "2026-04-27T10:01:01.000Z",
      },
    ]);

    await expect(store.readStoredArchivedDecryptedMessageRecord("self-user", "m1")).resolves.toMatchObject({
      messageId: "m1",
      ciphertext: "cipher-1",
    });
    await expect(
      store.readLatestStoredArchivedDecryptedMessageRecord("self-user", "chat-id")
    ).resolves.toMatchObject({
      messageId: "m2",
      ciphertext: "cipher-2",
    });

    await store.clearStoredArchivedDecryptedMessageRecords("self-user");
    await expect(store.readAllStoredArchivedDecryptedMessageRecords("self-user")).resolves.toEqual([]);
  });
});
