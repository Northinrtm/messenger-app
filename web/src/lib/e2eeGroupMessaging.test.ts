import { describe, expect, it, vi } from "vitest";

import type { Participant, UserEncryptionDeviceBundle } from "./types";
import type { ConversationDeviceBundleResolution } from "./e2eeDeviceDirectory";
import type {
  GroupHistoryEnvelope,
  GroupHistoryKeyRecord,
  GroupSenderChainState,
  GroupSharedEnvelope,
} from "./e2eeGroupEngine";
import { buildGroupDistributionPayload, encryptGroupMessage } from "./e2eeGroupMessaging";

const participant = (id: string, displayName = id): Participant => ({
  id,
  username: id,
  displayName,
  profession: null,
  avatarUrl: null,
  online: true,
});

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

type OwnMaterial = {
  deviceId: string;
  materialId: string;
};

type SessionRecord = {
  sessionId: string;
};

describe("e2eeGroupMessaging", () => {
  it("builds a valid group sender distribution payload", () => {
    expect(
      JSON.parse(
        buildGroupDistributionPayload({
          aadVersion: 1,
          chatId: "chat",
          senderUserId: "self",
          senderDeviceId: "self-device",
          senderKeyId: "sender-key",
          messageCounter: 2,
          chainKey: "chain-key",
        })
      )
    ).toEqual({
      aadVersion: 1,
      chatId: "chat",
      senderUserId: "self",
      senderDeviceId: "self-device",
      senderKeyId: "sender-key",
      messageCounter: 2,
      chainKey: "chain-key",
    });
  });

  it("orchestrates group encryption and persists updated sender chain state", async () => {
    const ownMaterial: OwnMaterial = {
      deviceId: "self-device",
      materialId: "own-material",
    };
    const targetBundles = [bundle("peer", "peer-device"), bundle("self", "self-device")];
    const nextSessions: Record<string, SessionRecord> = {};
    const groupSenderChainState: GroupSenderChainState = {
      outboundChains: {},
      inboundChains: {},
    };
    const sharedEnvelope: GroupSharedEnvelope = {
      aadVersion: 1,
      chatId: "chat",
      senderUserId: "self",
      senderDeviceId: "self-device",
      senderKeyId: "sender-key",
      messageCounter: 0,
      ciphertext: "shared-ciphertext",
      iv: "shared-iv",
      signature: "shared-signature",
    };
    const historyKeyRecord: GroupHistoryKeyRecord = {
      historyKeyId: "history-id",
      chatId: "chat",
      keyMaterial: "history-key",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const historyEnvelope: GroupHistoryEnvelope = {
      aadVersion: 1,
      historyKeyId: "history-id",
      ciphertext: "history-ciphertext",
      iv: "history-iv",
    };
    const rememberDeviceSessions = vi.fn(async () => undefined);
    const rememberGroupSenderChainState = vi.fn(async () => undefined);
    const markOutboundGroupSenderChainAsReactivated = vi.fn();

    const payload = await encryptGroupMessage<OwnMaterial, SessionRecord>({
      token: "token",
      chatId: "chat",
      currentUserId: "self",
      content: "hello",
      participants: [participant("self"), participant("peer")],
      conversationBundles: {
        rawBundles: targetBundles,
        trustedBundles: targetBundles,
        missingParticipants: [],
        participantsWithUntrustedDevices: [],
      } satisfies ConversationDeviceBundleResolution,
      prepareGroupRecipientEncryptionContext: async () => ({
        ownMaterial,
        targetBundles,
        nextSessions,
      }),
      readGroupSenderChainState: async () => groupSenderChainState,
      wasOutboundGroupSenderChainRestoredFromPersistent: () => false,
      buildRecipientDeviceSetHash: () => "peer:peer-device|self:self-device",
      isGroupSenderChainRotationDue: () => false,
      createGroupSenderChain: () => ({
        chatId: "chat",
        ownMaterialId: "own-material",
        senderDeviceId: "self-device",
        senderKeyId: "sender-key",
        recipientDeviceSetHash: "peer:peer-device|self:self-device",
        chainKey: "chain-key",
        nextMessageCounter: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      base64ToBytes: () => new Uint8Array([1, 2, 3]),
      bytesToBase64: (value) => `b64-${Array.from(value).join("-")}`,
      deriveMessageRatchetStep: async () => ({
        messageKey: new Uint8Array([4, 5, 6]),
        nextChainKey: new Uint8Array([7, 8, 9]),
      }),
      createGroupSharedEnvelope: async () => sharedEnvelope,
      ensureGroupHistoryKeyRecord: async () => historyKeyRecord,
      createGroupHistoryEnvelope: async () => historyEnvelope,
      groupSenderDistributionAadVersion: 1,
      getDeviceSessionMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      establishInitiatorDeviceSession: async (_currentUserId, _ownMaterial, targetBundle) => ({
        sessionId: `${targetBundle.userId}:${targetBundle.deviceId}`,
      }),
      setCurrentDeviceSessionRecord: (sessions, sessionRecord) => {
        sessions[sessionRecord.sessionId] = sessionRecord;
      },
      createDirectRecipientEnvelopeContent: async (_currentUserId, _ownMaterial, sessionRecord, content) => ({
        sessionId: sessionRecord.sessionId,
        content,
      }),
      writeDeviceSessions: () => undefined,
      rememberDeviceSessions,
      writeGroupSenderChainState: () => undefined,
      rememberGroupSenderChainState,
      markOutboundGroupSenderChainAsReactivated,
      messageSchemeGroupSenderKey: "GROUP-SENDER-KEY-AES-GCM",
    });

    expect(payload).toMatchObject({
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      sharedEnvelope: JSON.stringify(sharedEnvelope),
      historyEnvelope: JSON.stringify(historyEnvelope),
    });
    expect(payload.encryptedKeysByRecipientId["peer-device"]).toContain("\"sessionId\":\"peer:peer-device\"");
    expect(groupSenderChainState.outboundChains.chat).toMatchObject({
      senderKeyId: "sender-key",
      nextMessageCounter: 1,
      chainKey: "b64-7-8-9",
    });
    expect(rememberDeviceSessions).toHaveBeenCalledTimes(1);
    expect(rememberGroupSenderChainState).toHaveBeenCalledTimes(1);
    expect(markOutboundGroupSenderChainAsReactivated).toHaveBeenCalledWith("self", "chat");
  });
});
