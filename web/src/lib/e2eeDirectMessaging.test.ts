import { describe, expect, it, vi } from "vitest";

import {
  buildDirectEnvelopeAdditionalData,
  createDirectRecipientEnvelopeContent,
  decryptDirectMessage,
  decryptDirectRecipientEnvelope,
  encryptDirectDeviceMessage,
  parseDirectDeviceEnvelope,
  type DirectDeviceEnvelope,
} from "./e2eeDirectMessaging";

const bundle = (userId: string, deviceId: string) => ({
  userId,
  deviceId,
  deviceName: `${deviceId}-name`,
  identityKey: `${deviceId}-identity`,
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: `${deviceId}-signature`,
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 1,
  signedPrekeyPublicKey: `${deviceId}-signed-prekey`,
  signedPrekeySignature: "b64:1,2,3",
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekey: null,
  deviceVersion: "v1",
  registeredAt: "2026-04-27T12:00:00.000Z",
  lastSeenAt: "2026-04-27T12:00:00.000Z",
});

describe("e2eeDirectMessaging", () => {
  it("creates a direct recipient envelope and includes the bootstrap one-time prekey only on the first message", async () => {
    const sessionRecord = {
      peerDeviceId: "peer-device",
      remoteSignedPrekeyId: 7,
      remoteOneTimePrekeyId: 11,
      initiatorEphemeralPublicKey: "initiator-eph",
      sendingRatchetPublicKey: "send-ratchet",
      sendingCounter: 1,
      remoteRatchetPublicKey: null,
      pendingSendingRatchetStep: false,
      sendingRatchetUsed: false,
    };

    const envelope = await createDirectRecipientEnvelopeContent({
      senderUserId: "self",
      ownMaterial: {
        deviceId: "self-device",
        identityKey: "self-identity",
        identitySignatureKey: "self-signature",
      },
      sessionRecord,
      content: "hello",
      directEnvelopeAadVersion: 1,
      createInitializingError: () => new Error("init"),
      randomBytes: () => new Uint8Array([1, 2, 3]),
      bytesToBase64: (value) => `b64:${Array.from(value).join(",")}`,
      applyOutgoingDhRatchet: vi.fn(async () => undefined),
      advanceSendingChain: vi.fn(async () => ({
        messageCounter: 0,
        messageKey: new Uint8Array([9]),
      })),
      encryptEnvelopeCiphertext: vi.fn(async () => "ciphertext"),
    });

    expect(envelope).toMatchObject({
      senderUserId: "self",
      senderDeviceId: "self-device",
      recipientDeviceId: "peer-device",
      recipientOneTimePrekeyId: 11,
      messageCounter: 0,
      ciphertext: "ciphertext",
    });

    const aad = JSON.parse(
      new TextDecoder().decode(
        buildDirectEnvelopeAdditionalData(
          (({ ciphertext: _ciphertext, ...metadata }) => metadata)(envelope),
          new TextEncoder()
        )
      )
    ) as { senderUserId?: string; recipientDeviceId?: string };
    expect(aad).toMatchObject({
      senderUserId: "self",
      recipientDeviceId: "peer-device",
    });
  });

  it("decrypts a direct recipient envelope by establishing a responder session when needed", async () => {
    const envelope: DirectDeviceEnvelope = {
      aadVersion: 1,
      senderUserId: "peer",
      senderDeviceId: "peer-device",
      recipientDeviceId: "self-device",
      senderIdentityKey: "peer-identity",
      senderIdentitySignatureKey: "peer-signature",
      initiatorEphemeralPublicKey: "peer-eph",
      ratchetPublicKey: "peer-ratchet",
      recipientSignedPrekeyId: 7,
      recipientOneTimePrekeyId: null,
      messageCounter: 0,
      ciphertext: "ciphertext",
      iv: "iv",
    };
    const sessions: Record<string, { remoteRatchetPublicKey: string | null }> = {};
    const persistOwnMaterial = vi.fn(async () => undefined);

    const result = await decryptDirectRecipientEnvelope({
      serializedEnvelope: JSON.stringify(envelope),
      userId: "self",
      ownMaterial: {
        deviceId: "self-device",
      },
      directEnvelopeAadVersion: 1,
      assertTrustedDirectSender: vi.fn(async () => undefined),
      readDeviceSessions: vi.fn(async () => sessions),
      getDeviceSessionMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      findDeviceSessionEntryForEnvelope: () => null,
      establishResponderDeviceSession: vi.fn(async () => ({
        remoteRatchetPublicKey: "peer-ratchet",
      })),
      setCurrentDeviceSessionRecord: (nextSessions, sessionRecord) => {
        nextSessions["peer:peer-device"] = sessionRecord;
      },
      persistOwnMaterial,
      resolveReceivingChain: () => null,
      applyIncomingDhRatchet: vi.fn(async () => undefined),
      getEnvelopeMessageKey: vi.fn(async () => new Uint8Array([1, 2, 3])),
      writeDeviceSessions: vi.fn(),
      rememberDeviceSessions: vi.fn(async () => undefined),
      decryptEnvelopeCiphertext: vi.fn(async () => "hello"),
    });

    expect(result.content).toBe("hello");
    expect(result.envelope).toMatchObject({
      senderUserId: "peer",
      recipientDeviceId: "self-device",
    });
    expect(persistOwnMaterial).toHaveBeenCalledTimes(1);
  });

  it("decrypts a direct message using the current device envelope", async () => {
    const content = await decryptDirectMessage({
      payload: {
        scheme: "X3DH-DEVICE-AES-GCM",
        encryptedKeysByRecipientId: {
          "self-device": "serialized-envelope",
        },
      },
      userId: "self",
      readOwnMaterial: vi.fn(async () => ({ deviceId: "self-device" })),
      isOwnMaterialAvailable: (
        material
      ): material is {
        deviceId: string;
      } => Boolean(material?.deviceId),
      decryptDirectRecipientEnvelope: vi.fn(async () => ({ content: "secret hello" })),
    });

    expect(content).toBe("secret hello");
  });

  it("encrypts a direct message for recipient and self devices", async () => {
    const payload = await encryptDirectDeviceMessage({
      token: "token",
      currentUserId: "self",
      content: "secret",
      participants: [
        { id: "self", displayName: "Self" } as never,
        { id: "peer", displayName: "Peer" } as never,
      ],
      createInitializingError: () => new Error("init"),
      createIdentityChangedError: (displayNames) =>
        new Error(`identity:${displayNames.join(",")}`),
      createMissingParticipantsError: (displayNames) =>
        new Error(`missing:${displayNames.join(",")}`),
      createUnavailableError: () => new Error("unavailable"),
      messageSchemeDevice: "X3DH-DEVICE-AES-GCM",
      readOwnMaterial: vi.fn(async () => ({
        deviceId: "self-device",
        materialId: "material-id",
        identityKey: "self-identity",
        identitySignatureKey: "self-signature",
      })),
      resolveConversationDeviceBundles: vi.fn(async () => ({
        rawBundles: [bundle("peer", "peer-device")],
        trustedBundles: [bundle("peer", "peer-device")],
        missingParticipants: [],
        participantsWithUntrustedDevices: [],
      })),
      buildSelfDeviceBundle: vi.fn(
        (ownMaterial, currentUserId) =>
          ({
            userId: currentUserId,
            deviceId: ownMaterial.deviceId,
          }) as never
      ),
      getDeviceBundleMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      readCurrentDeviceSessions: vi.fn(async () => ({})),
      shouldEstablishDeviceSession: vi.fn(() => true),
      wasCurrentDeviceSessionRestoredFromPersistent: vi.fn(() => false),
      establishInitiatorDeviceSession: vi.fn(async (_currentUserId, _ownMaterial, bundle) => ({
        peerUserId: bundle.userId,
        peerDeviceId: bundle.deviceId,
      })),
      setCurrentDeviceSessionRecord: (
        sessions,
        sessionRecord: { peerUserId: string; peerDeviceId: string }
      ) => {
        sessions[`${sessionRecord.peerUserId}:${sessionRecord.peerDeviceId}`] = sessionRecord;
      },
      markCurrentDeviceSessionAsReactivated: vi.fn(),
      resolveEncryptionDeviceBundles: vi.fn(async () => [bundle("peer", "peer-device")]),
      validateAndPinDeviceBundle: vi.fn(async () => true),
      createDirectRecipientEnvelope: vi.fn(
        async (
          _currentUserId,
          _ownMaterial,
          sessionRecord: { peerDeviceId: string }
        ) => ({
          peerDeviceId: sessionRecord.peerDeviceId,
        })
      ),
      writeDeviceSessions: vi.fn(),
      rememberDeviceSessions: vi.fn(async () => undefined),
    });

    expect(payload).toMatchObject({
      scheme: "X3DH-DEVICE-AES-GCM",
      encryptedKeysByRecipientId: {
        "peer-device": expect.any(String),
        "self-device": expect.any(String),
      },
    });
  });

  it("rejects malformed direct envelopes", () => {
    expect(() => parseDirectDeviceEnvelope("{}", 1)).toThrow(
      "Malformed direct encrypted envelope"
    );
  });
});
