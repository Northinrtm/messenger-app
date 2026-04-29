import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import type { GroupHistoryKeyAccess, UserEncryptionDeviceBundle } from "./types";
import type { GroupHistoryKeyRecord, GroupSharedEnvelope } from "./e2eeGroupEngine";
import {
  buildGroupHistoryKeyAccessEnvelopes,
  createLocalGroupHistoryKeyRecord,
  decryptGroupHistoryMessage,
  ensureGroupHistoryKeyRecord,
  isRecoverableGroupHistoryFallbackError,
  resolveGroupHistoryKeyRecordFromServer,
} from "./e2eeGroupHistory";

const bundle = (userId: string, deviceId: string): UserEncryptionDeviceBundle => ({
  userId,
  deviceId,
  deviceName: `${deviceId}-name`,
  identityKey: `${deviceId}-identity`,
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: `${deviceId}-signature-identity`,
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 1,
  signedPrekeyPublicKey: `${deviceId}-signed-prekey`,
  signedPrekeySignature: `${deviceId}-signature`,
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekey: null,
  registeredAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  deviceVersion: "v1",
});

describe("e2eeGroupHistory", () => {
  it("creates local history-key records with deterministic helpers", () => {
    expect(
      createLocalGroupHistoryKeyRecord("chat", {
        createHistoryKeyId: () => "history-id",
        createKeyMaterial: () => "key-material",
        now: () => "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({
      historyKeyId: "history-id",
      chatId: "chat",
      keyMaterial: "key-material",
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
    const persist = vi.fn<(_userId: string, _record: GroupHistoryKeyRecord) => Promise<void>>(
      async () => undefined
    );

    const record = await resolveGroupHistoryKeyRecordFromServer({
      token: "token",
      userId: "self",
      chatId: "chat",
      ownMaterial: { deviceId: "self-device" },
      getOwnGroupHistoryKeys: async () => accesses,
      decryptDirectRecipientEnvelopeContent: async (payload) => payload,
      parseGroupHistoryKeyGrantPayload: (value) => {
        if (value === "wrong") {
          return {
            aadVersion: 1,
            chatId: "other-chat",
            historyKeyId: "wrong",
            historyKey: "wrong-key",
            createdAt: "2026-01-01T00:00:00.000Z",
          };
        }

        return {
          aadVersion: 1,
          chatId: "chat",
          historyKeyId: value === "payload-1" ? "history-1" : "history-2",
          historyKey: value === "payload-1" ? "key-1" : "key-2",
          createdAt: "2026-01-01T00:00:00.000Z",
        };
      },
      persistGroupHistoryKeyRecord: persist,
    });

    expect(record).toMatchObject({
      historyKeyId: "history-2",
      chatId: "chat",
      keyMaterial: "key-2",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("builds wrapped history-key access envelopes for all target devices", async () => {
    const nextSessions: Record<string, { sessionId: string }> = {};
    const envelopes = await buildGroupHistoryKeyAccessEnvelopes({
      currentUserId: "self",
      ownMaterial: { deviceId: "self-device" },
      targetBundles: [bundle("peer", "peer-device"), bundle("self", "self-device")],
      nextSessions,
      historyKeyRecord: {
        historyKeyId: "history-id",
        chatId: "chat",
        keyMaterial: "key-material",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      serializeGrantPayload: (record) => JSON.stringify({ historyKeyId: record.historyKeyId }),
      getDeviceSessionMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      establishInitiatorDeviceSession: async (_userId, _ownMaterial, targetBundle) => ({
        sessionId: `${targetBundle.userId}:${targetBundle.deviceId}`,
      }),
      setCurrentDeviceSessionRecord: (sessions, sessionRecord) => {
        sessions[sessionRecord.sessionId] = sessionRecord;
      },
      createDirectRecipientEnvelopeContent: async (_userId, _ownMaterial, sessionRecord, content) => ({
        sessionId: sessionRecord.sessionId,
        content,
      }),
    });

    expect(Object.keys(envelopes).sort()).toEqual(["peer-device", "self-device"]);
    expect(JSON.parse(envelopes["peer-device"] ?? "{}")).toMatchObject({
      sessionId: "peer:peer-device",
    });
  });

  it("creates and persists a local history key when neither local nor remote record exists", async () => {
    const createdRecord: GroupHistoryKeyRecord = {
      historyKeyId: "created-history",
      chatId: "chat",
      keyMaterial: "key-material",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const persist = vi.fn<(_userId: string, _record: GroupHistoryKeyRecord) => Promise<void>>(
      async () => undefined
    );
    const upsert = vi.fn(
      async (
        _token: string,
        _chatId: string,
        _currentUserId: string,
        _ownMaterial: { deviceId: string },
        _targetBundles: UserEncryptionDeviceBundle[],
        _nextSessions: Record<string, { sessionId: string }>,
        _historyKeyRecord: GroupHistoryKeyRecord
      ) => undefined
    );

    const record = await ensureGroupHistoryKeyRecord({
      token: "token",
      chatId: "chat",
      currentUserId: "self",
      ownMaterial: { deviceId: "self-device" },
      targetBundles: [bundle("peer", "peer-device")],
      nextSessions: {},
      readCurrentGroupHistoryKeyRecord: async () => null,
      resolveGroupHistoryKeyRecordFromServer: async () => null,
      createLocalGroupHistoryKeyRecord: () => createdRecord,
      upsertGroupHistoryKeyAccessForTargets: upsert,
      persistGroupHistoryKeyRecord: persist,
    });

    expect(record).toBe(createdRecord);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("self", createdRecord);
  });

  it("identifies recoverable fallback errors for group history decryption", () => {
    expect(
      isRecoverableGroupHistoryFallbackError(
        new Error("Encrypted message key is no longer available for this session")
      )
    ).toBe(true);
    expect(isRecoverableGroupHistoryFallbackError(new Error("other"))).toBe(true);
    expect(
      isRecoverableGroupHistoryFallbackError(new ApiError("identity changed", 409))
    ).toBe(false);
  });

  it("decrypts group history messages from a local or remotely recovered history key", async () => {
    const sharedEnvelope: GroupSharedEnvelope = {
      aadVersion: 1,
      chatId: "chat",
      senderUserId: "sender",
      senderDeviceId: "device",
      senderKeyId: "sender-key",
      messageCounter: 5,
      ciphertext: "ciphertext",
      iv: "iv",
      signature: "sig",
    };
    const parseGroupHistoryEnvelope = () => ({
      aadVersion: 1,
      historyKeyId: "history-id",
      ciphertext: "ciphertext",
      iv: "iv",
    });
    const decryptContent = vi.fn(async () => "plaintext");

    await expect(
      decryptGroupHistoryMessage({
        message: {
          id: "message-id",
          chatId: "chat",
          sender: {
            id: "sender",
            username: "sender",
            displayName: "Sender",
            profession: null,
            avatarUrl: null,
            online: true,
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            encryptedKeysByRecipientId: {},
            sharedEnvelope: "{}",
            historyEnvelope: "{}",
          },
        },
        userId: "self",
        ownMaterial: { deviceId: "self-device" },
        sharedEnvelope,
        parseGroupHistoryEnvelope,
        resolveLocalGroupHistoryKeyRecord: async () => ({
          historyKeyId: "history-id",
          chatId: "chat",
          keyMaterial: "local-key",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        getRecoverySyncSession: async () => null,
        resolveGroupHistoryKeyRecordFromServer: async () => null,
        decryptGroupHistoryEnvelopeContent: decryptContent,
      })
    ).resolves.toBe("plaintext");

    expect(decryptContent).toHaveBeenCalledTimes(1);

    await expect(
      decryptGroupHistoryMessage({
        message: {
          id: "message-id",
          chatId: "chat",
          sender: {
            id: "sender",
            username: "sender",
            displayName: "Sender",
            profession: null,
            avatarUrl: null,
            online: true,
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            encryptedKeysByRecipientId: {},
            sharedEnvelope: "{}",
            historyEnvelope: "{}",
          },
        },
        userId: "self",
        ownMaterial: { deviceId: "self-device" },
        sharedEnvelope,
        parseGroupHistoryEnvelope,
        resolveLocalGroupHistoryKeyRecord: async () => null,
        getRecoverySyncSession: async () => ({ token: "token" }),
        resolveGroupHistoryKeyRecordFromServer: async () => ({
          historyKeyId: "history-id",
          chatId: "chat",
          keyMaterial: "remote-key",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        decryptGroupHistoryEnvelopeContent: decryptContent,
      })
    ).resolves.toBe("plaintext");
  });
});
