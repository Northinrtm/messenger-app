import { describe, expect, it } from "vitest";

import {
  clearPersistentRestoredCurrentDeviceSessions,
  findDeviceSessionEntryForEnvelope,
  getDeviceSessionArchiveKey,
  getDeviceSessionMapKey,
  markCurrentDeviceSessionAsReactivated,
  markPersistentRestoredCurrentDeviceSessions,
  sanitizeStoredDeviceSessions,
  setCurrentDeviceSessionRecord,
  wasCurrentDeviceSessionRestoredFromPersistent,
} from "./e2eeSessionStore";

type SessionRecord = {
  sessionId: string;
  peerUserId: string;
  peerDeviceId: string;
  ownMaterialId: string;
  remoteIdentityKey: string;
  remoteIdentitySignatureKey: string;
  remoteSignedPrekeyId: number;
  remoteOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  establishedAt: string;
  cachedMessageKeys?: Record<string, string>;
};

describe("e2eeSessionStore", () => {
  it("archives a previous current session and prunes older archives", () => {
    const sessions: Record<string, SessionRecord> = {
      [getDeviceSessionMapKey("peer", "device")]: {
        sessionId: "current-1",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T10:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "old-1")]: {
        sessionId: "old-1",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T09:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "old-2")]: {
        sessionId: "old-2",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T08:00:00.000Z",
      },
    };

    setCurrentDeviceSessionRecord(
      sessions,
      {
        sessionId: "current-2",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T11:00:00.000Z",
      },
      2
    );

    expect(sessions[getDeviceSessionMapKey("peer", "device")].sessionId).toBe("current-2");
    expect(sessions[getDeviceSessionArchiveKey("peer", "device", "current-1")]).toBeTruthy();
    expect(sessions[getDeviceSessionArchiveKey("peer", "device", "old-2")]).toBeUndefined();
  });

  it("tracks and clears restored current sessions", () => {
    const restored = new Map<string, Set<string>>();
    markPersistentRestoredCurrentDeviceSessions(restored, "self", {
      [getDeviceSessionMapKey("peer", "device")]: {} as SessionRecord,
      [getDeviceSessionArchiveKey("peer", "device", "old")]: {} as SessionRecord,
    });

    expect(wasCurrentDeviceSessionRestoredFromPersistent(restored, "self", "peer", "device")).toBe(true);

    markCurrentDeviceSessionAsReactivated(restored, "self", "peer", "device");
    expect(wasCurrentDeviceSessionRestoredFromPersistent(restored, "self", "peer", "device")).toBe(false);

    markPersistentRestoredCurrentDeviceSessions(restored, "self", {});
    clearPersistentRestoredCurrentDeviceSessions(restored, "self");
    expect(restored.has("self")).toBe(false);
  });

  it("prefers cached keys when selecting a session for an envelope", () => {
    const sessions: Record<string, SessionRecord> = {
      [getDeviceSessionMapKey("peer", "device")]: {
        sessionId: "current",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T11:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "archived")]: {
        sessionId: "archived",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        remoteIdentityKey: "id",
        remoteIdentitySignatureKey: "sig",
        remoteSignedPrekeyId: 1,
        remoteOneTimePrekeyId: null,
        initiatorEphemeralPublicKey: "eph",
        establishedAt: "2026-04-27T10:00:00.000Z",
        cachedMessageKeys: {
          "recv:ratchet:5": "cached",
        },
      },
    };

    const selected = findDeviceSessionEntryForEnvelope(sessions, {
      senderUserId: "peer",
      senderDeviceId: "device",
      senderIdentityKey: "id",
      senderIdentitySignatureKey: "sig",
      recipientSignedPrekeyId: 1,
      recipientOneTimePrekeyId: null,
      initiatorEphemeralPublicKey: "eph",
      ratchetPublicKey: "ratchet",
      messageCounter: 5,
    }, {
      currentUserId: "self",
      currentDeviceId: "self-device",
      buildSessionMessageCacheKey: (direction, ratchetPublicKey, counter) =>
        `${direction}:${ratchetPublicKey}:${counter}`,
      resolveReceivingChain: () => null,
    });

    expect(selected?.[1].sessionId).toBe("archived");
  });

  it("sanitizes archives down to the configured limit", () => {
    const sessions = {
      [getDeviceSessionMapKey("peer", "device")]: {
        sessionId: "current",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        establishedAt: "2026-04-27T12:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "a1")]: {
        sessionId: "a1",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        establishedAt: "2026-04-27T11:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "a2")]: {
        sessionId: "a2",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        establishedAt: "2026-04-27T10:00:00.000Z",
      },
      [getDeviceSessionArchiveKey("peer", "device", "a3")]: {
        sessionId: "a3",
        peerUserId: "peer",
        peerDeviceId: "device",
        ownMaterialId: "own",
        establishedAt: "2026-04-27T09:00:00.000Z",
      },
    } as Record<string, SessionRecord>;

    const sanitized = sanitizeStoredDeviceSessions(sessions, 2);
    expect(Object.keys(sanitized)).toHaveLength(3);
    expect(sanitized[getDeviceSessionArchiveKey("peer", "device", "a3")]).toBeUndefined();
  });
});
