import { describe, expect, it, vi } from "vitest";

import type { GroupHistoryKeyAccess } from "./types";
import type { GroupHistoryKeyRecord } from "./e2eeGroupEngine";
import {
  createLocalGroupHistoryKeyRecord,
  resolveActiveGroupHistoryKeyRecordFromServer,
  resolveGroupHistoryKeyRecordFromServer,
} from "./e2eeGroupHistory";

describe("e2eeGroupHistory", () => {
  it("creates local history-key records with deterministic helpers", () => {
    expect(
      createLocalGroupHistoryKeyRecord("chat", {
        membershipVersion: 4,
        historyPolicy: "FULL_HISTORY",
        createHistoryKeyId: () => "history-id",
        createKeyMaterial: () => "key-material",
        now: () => "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({
      historyKeyId: "history-id",
      chatId: "chat",
      keyMaterial: "key-material",
      membershipVersion: 4,
      historyPolicy: "FULL_HISTORY",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("resolves and persists the latest valid remote history-key record", async () => {
    const accesses: GroupHistoryKeyAccess[] = [
      {
        historyKeyId: "wrong",
        wrappedKeyPayloadJson: "wrong",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        historyKeyId: "history-1",
        wrappedKeyPayloadJson: "payload-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
      {
        historyKeyId: "history-2",
        wrappedKeyPayloadJson: "payload-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
      },
    ];
    const persist = vi.fn<
      (_userId: string, _record: GroupHistoryKeyRecord) => Promise<void>
    >(async () => undefined);

    const record = await resolveGroupHistoryKeyRecordFromServer({
      token: "token",
      userId: "self",
      chatId: "chat",
      getOwnGroupHistoryKeys: async () => accesses,
      decryptHistoryKeyGrantPayload: async (payload: string) => payload,
      parseGroupHistoryKeyGrantPayload: (value) => {
        if (value === "wrong") {
          return {
            aadVersion: 1,
            context: "north.group-history-key-grant.v1",
            chatId: "other-chat",
            historyKeyId: "wrong",
            historyKey: "wrong-key",
            membershipVersion: 2,
            historyPolicy: "JOIN_ONLY",
            createdAt: "2026-01-01T00:00:00.000Z",
          };
        }

        return {
          aadVersion: 1,
          context: "north.group-history-key-grant.v1",
          chatId: "chat",
          historyKeyId: value === "payload-1" ? "history-1" : "history-2",
          historyKey: value === "payload-1" ? "key-1" : "key-2",
          membershipVersion: 4,
          historyPolicy: "FULL_HISTORY",
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      persistGroupHistoryKeyRecord: persist,
    });

    expect(record).toMatchObject({
      historyKeyId: "history-2",
      chatId: "chat",
      keyMaterial: "key-2",
      membershipVersion: 4,
      historyPolicy: "FULL_HISTORY",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("uses a stored cursor only after the chat was fully synced", async () => {
    const persist = vi.fn<
      (_userId: string, _record: GroupHistoryKeyRecord) => Promise<void>
    >(async () => undefined);
    const getOwnGroupHistoryKeys = vi.fn(async () => [
      {
        historyKeyId: "history-3",
        wrappedKeyPayloadJson: "payload-3",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:03.000Z",
      },
    ]);
    const writeGroupHistorySyncState = vi.fn<
      (
        _userId: string,
        _chatId: string,
        _state: { cursor: string | null; fullySynced: boolean }
      ) => Promise<void>
    >(async () => undefined);

    await resolveGroupHistoryKeyRecordFromServer({
      token: "token",
      userId: "self",
      chatId: "chat",
      getOwnGroupHistoryKeys,
      decryptHistoryKeyGrantPayload: async (payload: string) => payload,
      parseGroupHistoryKeyGrantPayload: () => ({
        aadVersion: 1,
        context: "north.group-history-key-grant.v1",
        chatId: "chat",
        historyKeyId: "history-3",
        historyKey: "key-3",
        membershipVersion: 6,
        historyPolicy: "FULL_HISTORY",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      persistGroupHistoryKeyRecord: persist,
      readGroupHistorySyncState: async () => ({
        cursor: "2026-01-01T00:00:02.000Z|history-2",
        fullySynced: true,
      }),
      writeGroupHistorySyncState,
    });

    expect(getOwnGroupHistoryKeys).toHaveBeenCalledWith(
      "token",
      "chat",
      "2026-01-01T00:00:02.000Z|history-2"
    );
    expect(writeGroupHistorySyncState).toHaveBeenCalledWith("self", "chat", {
      cursor: "2026-01-01T00:00:03.000Z|history-3",
      fullySynced: true,
    });
  });

  it("resolves a server-selected active history-key record", async () => {
    const persist = vi.fn<
      (_userId: string, _record: GroupHistoryKeyRecord) => Promise<void>
    >(async () => undefined);

    const record = await resolveActiveGroupHistoryKeyRecordFromServer({
      token: "token",
      userId: "self",
      chatId: "chat",
      getOwnActiveGroupHistoryKey: async () => ({
        historyKeyId: "history-2",
        wrappedKeyPayloadJson: "payload-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
      }),
      decryptHistoryKeyGrantPayload: async (payload: string) => payload,
      parseGroupHistoryKeyGrantPayload: () => ({
        aadVersion: 1,
        context: "north.group-history-key-grant.v1",
        chatId: "chat",
        historyKeyId: "history-2",
        historyKey: "key-2",
        membershipVersion: 5,
        historyPolicy: "JOIN_ONLY",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      persistGroupHistoryKeyRecord: persist,
    });

    expect(record).toMatchObject({
      historyKeyId: "history-2",
      chatId: "chat",
      keyMaterial: "key-2",
      membershipVersion: 5,
      historyPolicy: "JOIN_ONLY",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
