import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createE2eeMessageReadbackStore } from "./e2eeMessageReadbackStore";

const createStore = () =>
  createE2eeMessageReadbackStore({
    decryptedMessageArchiveStoragePrefix: "test:archive:",
    decryptedMessageArchiveDbName: "test-archive-db",
    decryptedMessageArchiveDbVersion: 1,
    decryptedMessageArchiveStoreName: "messages",
    decryptedMessageArchiveChatIndexName: "by-user-chat-created-at",
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
