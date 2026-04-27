import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import type { Participant, UserEncryptionDeviceBundle } from "./types";
import type { ConversationDeviceBundleResolution } from "./e2eeDeviceDirectory";
import { prepareGroupRecipientEncryptionContext } from "./e2eeGroupRecipients";

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

type GroupRecipientOptions = {
  token: string;
  currentUserId: string;
  participants: Participant[];
  conversationBundles?: ConversationDeviceBundleResolution;
  readOwnMaterial: (currentUserId: string) => Promise<OwnMaterial | null>;
  resolveConversationDeviceBundles: (
    token: string,
    participants: Participant[],
    requesterDeviceId: string,
    currentUserId: string
  ) => Promise<ConversationDeviceBundleResolution>;
  buildSelfDeviceBundle: (ownMaterial: OwnMaterial, currentUserId: string) => UserEncryptionDeviceBundle;
  getDeviceBundleMapKey: (userId: string, deviceId: string) => string;
  readCurrentDeviceSessions: (
    currentUserId: string,
    ownMaterialId: string
  ) => Promise<Record<string, SessionRecord>>;
  shouldEstablishDeviceSession: (
    existingSessions: Record<string, SessionRecord>,
    bundle: UserEncryptionDeviceBundle
  ) => boolean;
  wasCurrentDeviceSessionRestoredFromPersistent: (
    currentUserId: string,
    peerUserId: string,
    peerDeviceId: string
  ) => boolean;
  establishInitiatorDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    targetBundle: UserEncryptionDeviceBundle
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  markCurrentDeviceSessionAsReactivated: (
    currentUserId: string,
    peerUserId: string,
    peerDeviceId: string
  ) => void;
  resolveEncryptionDeviceBundles: (
    token: string,
    userIds: string[],
    options: {
      consumeOneTimePrekeys: boolean;
      deviceIds: string[];
      requesterDeviceId: string;
    }
  ) => Promise<UserEncryptionDeviceBundle[]>;
  validateAndPinDeviceBundle: (bundle: UserEncryptionDeviceBundle) => Promise<boolean>;
};

function createBaseOptions(
  override: Partial<GroupRecipientOptions> = {}
) {
  const participants = [participant("self"), participant("peer", "Peer")];
  const resolvedBundles: ConversationDeviceBundleResolution = {
    rawBundles: [bundle("peer", "peer-device")],
    trustedBundles: [bundle("peer", "peer-device")],
    missingParticipants: [],
    participantsWithUntrustedDevices: [],
  };

  return {
    token: "token",
    currentUserId: "self",
    participants,
    readOwnMaterial: async () => ({ deviceId: "self-device", materialId: "own-material" }),
    resolveConversationDeviceBundles: async () => resolvedBundles,
    buildSelfDeviceBundle: () => bundle("self", "self-device"),
    getDeviceBundleMapKey: (userId: string, deviceId: string) => `${userId}:${deviceId}`,
    readCurrentDeviceSessions: async () => ({}),
    shouldEstablishDeviceSession: () => true,
    wasCurrentDeviceSessionRestoredFromPersistent: () => false,
    establishInitiatorDeviceSession: async (
      _currentUserId: string,
      _ownMaterial: OwnMaterial,
      targetBundle: UserEncryptionDeviceBundle
    ) => ({
      sessionId: `${targetBundle.userId}:${targetBundle.deviceId}`,
    }),
    setCurrentDeviceSessionRecord: (sessions: Record<string, SessionRecord>, sessionRecord: SessionRecord) => {
      sessions[sessionRecord.sessionId] = sessionRecord;
    },
    markCurrentDeviceSessionAsReactivated: vi.fn(),
    resolveEncryptionDeviceBundles: async () => [bundle("peer", "peer-device")],
    validateAndPinDeviceBundle: async () => true,
    ...override,
  };
}

describe("e2eeGroupRecipients", () => {
  it("throws when encrypted chat is not initialized on this device", async () => {
    await expect(
      prepareGroupRecipientEncryptionContext({
        ...createBaseOptions({
          readOwnMaterial: async () => null,
        }),
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "Encrypted chat is still initializing on this device. Try again.",
    });
  });

  it("throws when participants have untrusted devices", async () => {
    await expect(
      prepareGroupRecipientEncryptionContext({
        ...createBaseOptions({
          conversationBundles: {
            rawBundles: [bundle("peer", "peer-device")],
            trustedBundles: [],
            missingParticipants: [],
            participantsWithUntrustedDevices: [participant("peer", "Peer")],
          },
        }),
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      details: ["Peer"],
    });
  });

  it("establishes missing sessions for self and peer bundles", async () => {
    const markReactivated = vi.fn();
    const result = await prepareGroupRecipientEncryptionContext({
      ...createBaseOptions({
        markCurrentDeviceSessionAsReactivated: markReactivated,
      }),
    });

    expect(result.ownMaterial).toMatchObject({ deviceId: "self-device" });
    expect(result.targetBundles.map((entry) => `${entry.userId}:${entry.deviceId}`).sort()).toEqual([
      "peer:peer-device",
      "self:self-device",
    ]);
    expect(Object.keys(result.nextSessions).sort()).toEqual(["peer:peer-device", "self:self-device"]);
    expect(markReactivated).toHaveBeenCalledTimes(2);
  });

  it("throws when a consumable remote bundle fails trust validation", async () => {
    await expect(
      prepareGroupRecipientEncryptionContext({
        ...createBaseOptions({
          validateAndPinDeviceBundle: async () => false,
        }),
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      details: ["Peer"],
    });
  });
});
