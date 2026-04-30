import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptRememberedGroupSenderChainState,
  encryptRememberedGroupSenderChainState,
  persistGroupHistoryKeyRecord,
  readCurrentGroupHistoryKeyRecord,
  readGroupHistoryKeyState,
  readGroupSenderChainState,
  readRememberedGroupSenderChainState,
  rememberGroupSenderChainState,
  removeGroupHistoryKeys,
  removeGroupSenderChains,
  removeRememberedGroupSenderChainState,
  resolveLocalGroupHistoryKeyRecord,
  writeGroupHistoryKeyState,
  writeGroupSenderChainState,
} from "./e2eeGroupStateStore";
import type { GroupHistoryKeyRecord, GroupSenderChainState } from "./e2eeGroupEngine";

const senderChainState: GroupSenderChainState = {
  outboundChains: {
    "chat-id": {
      chatId: "chat-id",
      ownMaterialId: "material-id",
      senderDeviceId: "self-device",
      senderKeyId: "sender-key-id",
      recipientDeviceSetHash: "hash",
      chainKey: "chain-key",
      nextMessageCounter: 1,
      createdAt: "2026-04-27T12:00:00.000Z",
    },
  },
  inboundChains: {},
};

const historyKeyRecord: GroupHistoryKeyRecord = {
  historyKeyId: "history-key-id",
  chatId: "chat-id",
  keyMaterial: "key-material",
  createdAt: "2026-04-27T12:00:00.000Z",
  updatedAt: "2026-04-27T12:00:00.000Z",
};

describe("e2eeGroupStateStore", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("round-trips remembered sender chain state through encrypted localStorage", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockResolvedValue(
      new Uint8Array([1, 2, 3]).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(senderChainState)).buffer
    );

    const rememberedKey = (userId: string) => `remembered-group:${userId}`;
    const deriveWrappingKey = vi.fn(async () => ({} as CryptoKey));
    const encryptState = async (
      privateKey: string,
      state: typeof senderChainState
    ) =>
      encryptRememberedGroupSenderChainState({
        privateKey,
        state,
        randomBytes: (length) => new Uint8Array(length).fill(1),
        deriveWrappingKey,
        bytesToBase64: (bytes) => btoa(String.fromCharCode(...bytes)),
        textEncoder: new TextEncoder(),
        kdfIterations: 10,
      });
    const decryptState = async (
      privateKey: string,
      record: { salt: string; iv: string; ciphertext: string; createdAt: string }
    ) =>
      decryptRememberedGroupSenderChainState({
        privateKey,
        record,
        base64ToBytes: (value) =>
          Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
        deriveWrappingKey,
        textDecoder: new TextDecoder(),
        kdfIterations: 10,
      });

    await rememberGroupSenderChainState({
      userId: "self",
      state: senderChainState,
      readUnlockedIdentity: () => ({ privateKey: "vault-private" }),
      encryptRememberedGroupSenderChainState: encryptState,
      getRememberedGroupSenderChainStorageKey: rememberedKey,
    });

    const restored = await readRememberedGroupSenderChainState({
      userId: "self",
      readUnlockedIdentity: () => ({ privateKey: "vault-private" }),
      getRememberedGroupSenderChainStorageKey: rememberedKey,
      decryptRememberedGroupSenderChainState: decryptState,
      removeRememberedGroupSenderChainState: (userId) =>
        removeRememberedGroupSenderChainState({
          userId,
          getRememberedGroupSenderChainStorageKey: rememberedKey,
        }),
    });

    expect(restored).toEqual(senderChainState);
  });

  it("hydrates sender chain state from remembered storage", async () => {
    const sessionKey = (userId: string) => `group:${userId}`;

    const state = await readGroupSenderChainState({
      userId: "self",
      getGroupSenderChainStorageKey: sessionKey,
      readRememberedGroupSenderChainState: vi.fn(async () => senderChainState),
      writeGroupSenderChainState: (userId, state) =>
        writeGroupSenderChainState({
          userId,
          state,
          getGroupSenderChainStorageKey: sessionKey,
        }),
      removeGroupSenderChains: (userId) =>
        removeGroupSenderChains({
          userId,
          getGroupSenderChainStorageKey: sessionKey,
          getRememberedGroupSenderChainStorageKey: (value) =>
            `remembered-group:${value}`,
        }),
    });

    expect(state).toEqual(senderChainState);
    expect(window.sessionStorage.getItem(sessionKey("self"))).toBeTruthy();
  });

  it("normalizes group history key state and drops dangling current ids", async () => {
    const historyKeyStorageKey = (userId: string) => `history:${userId}`;
    window.sessionStorage.setItem(
      historyKeyStorageKey("self"),
      JSON.stringify({
        currentKeyIdsByChatId: {
          "chat-id": "missing-id",
          "chat-two": "history-key-id",
        },
        keysById: {
          "history-key-id": {
            ...historyKeyRecord,
            chatId: "chat-two",
          },
        },
      })
    );

    const state = await readGroupHistoryKeyState({
      userId: "self",
      getGroupHistoryKeyStorageKey: historyKeyStorageKey,
      removeGroupHistoryKeys: (userId) =>
        removeGroupHistoryKeys({
          userId,
          getGroupHistoryKeyStorageKey: historyKeyStorageKey,
        }),
    });

    expect(state.currentKeyIdsByChatId).toEqual({
      "chat-two": "history-key-id",
    });
  });

  it("persists and resolves local group history key records", async () => {
    const historyKeyStorageKey = (userId: string) => `history:${userId}`;
    const readState = (userId: string) =>
      readGroupHistoryKeyState({
        userId,
        getGroupHistoryKeyStorageKey: historyKeyStorageKey,
        removeGroupHistoryKeys: (targetUserId) =>
          removeGroupHistoryKeys({
            userId: targetUserId,
            getGroupHistoryKeyStorageKey: historyKeyStorageKey,
          }),
      });
    const writeState = (
      userId: string,
      state: Awaited<ReturnType<typeof readState>>
    ) =>
      writeGroupHistoryKeyState({
        userId,
        state,
        getGroupHistoryKeyStorageKey: historyKeyStorageKey,
      });

    await persistGroupHistoryKeyRecord({
      userId: "self",
      record: historyKeyRecord,
      readGroupHistoryKeyState: readState,
      writeGroupHistoryKeyState: writeState,
    });

    await expect(
      resolveLocalGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat-id",
        historyKeyId: "history-key-id",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual(historyKeyRecord);

    await expect(
      readCurrentGroupHistoryKeyRecord({
        userId: "self",
        chatId: "chat-id",
        readGroupHistoryKeyState: readState,
      })
    ).resolves.toEqual(historyKeyRecord);
  });
});
