import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupHistoryKeyRecord } from "./e2eeGroupEngine";
import {
  clearCurrentGroupHistoryKeyRecord,
  persistGroupHistoryKeyRecord,
  readCurrentGroupHistoryKeyRecord,
  readGroupHistorySyncState,
  readGroupHistoryKeyState,
  removeGroupHistoryKeys,
  resolveLocalGroupHistoryKeyRecord,
  writeGroupHistorySyncState,
  writeGroupHistoryKeyState,
} from "./e2eeGroupStateStore";

const readState = (userId: string) =>
  readGroupHistoryKeyState({
    userId,
    getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
    removeGroupHistoryKeys: (value) =>
      removeGroupHistoryKeys({
        userId: value,
        getGroupHistoryKeyStorageKey: (key) => `history:${key}`,
      }),
  });

const writeState = (
  userId: string,
  state: {
    currentKeyIdsByChatId: Record<string, string>;
    syncCursorByChatId: Record<string, string>;
    fullySyncedChatIds: string[];
    keysById: Record<string, GroupHistoryKeyRecord>;
  }
) =>
  writeGroupHistoryKeyState({
    userId,
    state,
    getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
  });

function createIndexedDbMock() {
  const persistedEntries = new Map<string, unknown>();
  let hasStore = false;

  const database = {
    objectStoreNames: {
      contains: (name: string) => hasStore && name === "states",
    },
    createObjectStore: () => {
      hasStore = true;
      return {};
    },
    transaction: (_storeName: string, _mode: string) => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as Error | null,
        objectStore: () => ({
          put: (value: { userId: string }) => {
            persistedEntries.set(value.userId, value);
            queueMicrotask(() => transaction.oncomplete?.());
          },
          delete: (userId: string) => {
            persistedEntries.delete(userId);
            queueMicrotask(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
  } as unknown as IDBDatabase;

  const indexedDb = {
    open: () => {
      const request = {
        result: database,
        error: null as Error | null,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  return { indexedDb, persistedEntries };
}

describe("e2eeGroupStateStore", () => {
  beforeEach(() => {
    removeGroupHistoryKeys({
      userId: "self",
      getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
    });
    removeGroupHistoryKeys({
      userId: "encrypted",
      getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
    });
  });

  it("returns an empty state when no local history keys are stored", async () => {
    await expect(readState("self")).resolves.toEqual({
      currentKeyIdsByChatId: {},
      syncCursorByChatId: {},
      fullySyncedChatIds: [],
      keysById: {},
    });
  });

  it("persists and resolves local history key records", async () => {
    const record: GroupHistoryKeyRecord = {
      historyKeyId: "history-1",
      chatId: "chat",
      keyMaterial: "key-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    };

    await persistGroupHistoryKeyRecord({
      userId: "self",
      record,
      readGroupHistoryKeyState: readState,
      writeGroupHistoryKeyState: writeState,
    });

    await expect(
      resolveLocalGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat",
        historyKeyId: "history-1",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual(record);

    await expect(
      readCurrentGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual(record);

    await clearCurrentGroupHistoryKeyRecord({
      userId: "self",
      chatId: "chat",
      readGroupHistoryKeyState: readState,
      writeGroupHistoryKeyState: writeState,
    });

    await expect(
      readCurrentGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toBeNull();
  });

  it("tracks sync cursor and full-sync state per chat", async () => {
    await writeGroupHistorySyncState({
      userId: "self",
      chatId: "chat",
      cursor: "2026-01-01T00:00:01.000Z|history-1",
      fullySynced: true,
      readGroupHistoryKeyState: readState,
      writeGroupHistoryKeyState: writeState,
    });

    await expect(
      readGroupHistorySyncState({
        userId: "self",
        chatId: "chat",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual({
      cursor: "2026-01-01T00:00:01.000Z|history-1",
      fullySynced: true,
    });
  });

  it("persists encrypted group history state instead of plaintext records", async () => {
    const { indexedDb, persistedEntries } = createIndexedDbMock();
    vi.stubGlobal("indexedDB", indexedDb);

    try {
      writeGroupHistoryKeyState({
        userId: "encrypted",
        state: {
          currentKeyIdsByChatId: {
            chat: "history-1",
          },
          syncCursorByChatId: {},
          fullySyncedChatIds: [],
          keysById: {
            "history-1": {
              historyKeyId: "history-1",
              chatId: "chat",
              keyMaterial: "key-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        },
        getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
        encryptPersistedGroupHistoryKeyState: async (state) => ({
          version: 1,
          salt: "salt",
          iv: "iv",
          ciphertext: JSON.stringify(state),
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(persistedEntries.get("encrypted")).toEqual({
        userId: "encrypted",
        encryptedState: {
          version: 1,
          salt: "salt",
          iv: "iv",
          ciphertext: JSON.stringify({
            currentKeyIdsByChatId: {
              chat: "history-1",
            },
            syncCursorByChatId: {},
            fullySyncedChatIds: [],
            keysById: {
              "history-1": {
                historyKeyId: "history-1",
                chatId: "chat",
                keyMaterial: "key-1",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          }),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
