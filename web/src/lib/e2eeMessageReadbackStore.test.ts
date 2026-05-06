import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createE2eeMessageReadbackStore } from "./e2eeMessageReadbackStore";

function createIndexedDbMock() {
  const persistedEntries = new Map<string, unknown>();
  let hasStore = false;
  const idbKeyRange = {
    bound: (lower: unknown[], upper: unknown[]) => ({ lower, upper }),
  };

  const database = {
    objectStoreNames: {
      contains: (name: string) => hasStore && name === "messages",
    },
    createObjectStore: () => {
      hasStore = true;
      return {
        indexNames: {
          contains: () => false,
        },
        createIndex: () => undefined,
      };
    },
    transaction: (_storeName: string, _mode: string) => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as Error | null,
        objectStore: () => ({
          put: (value: { userId: string; messageId: string; chatId: string; createdAt: string }) => {
            persistedEntries.set(`${value.userId}:${value.messageId}`, value);
            queueMicrotask(() => transaction.oncomplete?.());
          },
          get: ([userId, messageId]: [string, string]) => {
            const request = {
              result: persistedEntries.get(`${userId}:${messageId}`),
              error: null as Error | null,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
          openCursor: (range?: { lower?: unknown[]; upper?: unknown[] }) => {
            const entries = (Array.from(persistedEntries.values()) as Array<Record<string, unknown>>)
              .filter((value) =>
                !range?.lower?.length ||
                (typeof range.lower[0] === "string" && value.userId === range.lower[0])
              );
            let index = 0;
            const request = {
              result: null as
                | {
                    value: unknown;
                    continue: () => void;
                    delete: () => void;
                  }
                | null,
              error: null as Error | null,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            const advance = () => {
              if (index >= entries.length) {
                request.result = null;
                queueMicrotask(() => transaction.oncomplete?.());
              } else {
                const value = entries[index];
                request.result = {
                  value,
                  continue: () => {
                    index += 1;
                    queueMicrotask(() => {
                      advance();
                      request.onsuccess?.();
                    });
                  },
                  delete: () => {
                    persistedEntries.delete(`${value.userId}:${value.messageId}`);
                  },
                };
              }
            };
            queueMicrotask(() => {
              advance();
              request.onsuccess?.();
            });
            return request;
          },
          index: () => ({
            openCursor: (range?: { lower?: unknown[]; upper?: unknown[] }, direction?: string) => {
              const entries = Array.from(persistedEntries.values())
                .filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
                .filter((value) =>
                  !range?.lower?.length ||
                  (typeof range.lower[0] === "string" &&
                    typeof range.lower[1] === "string" &&
                    value.userId === range.lower[0] &&
                    value.chatId === range.lower[1])
                )
                .sort((left, right) =>
                  String(left.createdAt).localeCompare(String(right.createdAt))
                );
              const selectedEntry =
                direction === "prev" ? entries[entries.length - 1] ?? null : entries[0] ?? null;
              const request = {
                result: selectedEntry ? { value: selectedEntry } : null,
                error: null as Error | null,
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
              };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
          }),
        }),
      };
      return transaction;
    },
  } as unknown as IDBDatabase;

  return {
    persistedEntries,
    idbKeyRange,
    indexedDb: {
      open: () => {
        const request = {
          result: database,
          error: null as Error | null,
          onupgradeneeded: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onblocked: null as (() => void) | null,
          transaction: {
            objectStore: () => ({
              indexNames: {
                contains: () => false,
              },
              createIndex: () => undefined,
            }),
          },
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

const createStore = () =>
  createE2eeMessageReadbackStore({
    decryptedMessageArchiveDbName: "test-archive-db",
    decryptedMessageArchiveDbVersion: 1,
    decryptedMessageArchiveStoreName: "messages",
    decryptedMessageArchiveChatIndexName: "by-user-chat-created-at",
  });

describe("e2eeMessageReadbackStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T10:05:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores archived records in indexeddb and returns the latest chat preview", async () => {
    const { indexedDb, idbKeyRange } = createIndexedDbMock();
    vi.stubGlobal("indexedDB", indexedDb);
    vi.stubGlobal("IDBKeyRange", idbKeyRange);
    const store = createStore();

    try {
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

      await expect(
        store.readStoredArchivedDecryptedMessageRecord("self-user", "m1")
      ).resolves.toMatchObject({
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
      await expect(store.readAllStoredArchivedDecryptedMessageRecords("self-user")).resolves.toEqual(
        []
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
