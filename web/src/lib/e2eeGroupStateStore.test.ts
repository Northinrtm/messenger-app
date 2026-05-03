import { describe, expect, it, vi } from "vitest";

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

describe("e2eeGroupStateStore", () => {
  it("restores and filters stored group history key state", async () => {
    sessionStorage.setItem(
      "history:self",
      JSON.stringify({
        currentKeyIdsByChatId: {
          chat: "history-1",
          missing: "history-missing",
        },
        keysById: {
          "history-1": {
            historyKeyId: "history-1",
            chatId: "chat",
            keyMaterial: "key-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
          },
          invalid: {
            historyKeyId: 1,
          },
        },
      })
    );

    const state = await readGroupHistoryKeyState({
      userId: "self",
      getGroupHistoryKeyStorageKey: (userId) => `history:${userId}`,
      removeGroupHistoryKeys: vi.fn(),
    });

    expect(state.currentKeyIdsByChatId).toEqual({
      chat: "history-1",
    });
    expect(state.syncCursorByChatId).toEqual({});
    expect(state.fullySyncedChatIds).toEqual([]);
    expect(Object.keys(state.keysById)).toEqual(["history-1"]);
  });

  it("cleans up malformed stored state", async () => {
    sessionStorage.setItem("history:self", "not-json");

    const removeState = vi.fn((userId: string) =>
      removeGroupHistoryKeys({
        userId,
        getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
      })
    );

    const state = await readGroupHistoryKeyState({
      userId: "self",
      getGroupHistoryKeyStorageKey: (userId) => `history:${userId}`,
      removeGroupHistoryKeys: removeState,
    });

    expect(state).toEqual({
      currentKeyIdsByChatId: {},
      syncCursorByChatId: {},
      fullySyncedChatIds: [],
      keysById: {},
    });
    expect(removeState).toHaveBeenCalledWith("self");
  });

  it("persists and resolves local history key records", async () => {
    const writeState = vi.fn(
      (
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
        })
    );
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

    await expect(
      resolveLocalGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat",
        historyKeyId: "history-1",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual(record);
  });

  it("tracks sync cursor and full-sync state per chat", async () => {
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

    await writeGroupHistorySyncState({
      userId: "self",
      chatId: "chat",
      cursor: "2026-01-01T00:00:01.000Z|history-1",
      fullySynced: true,
      readGroupHistoryKeyState: readState,
      writeGroupHistoryKeyState: (userId, state) =>
        writeGroupHistoryKeyState({
          userId,
          state,
          getGroupHistoryKeyStorageKey: (value) => `history:${value}`,
        }),
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
});
