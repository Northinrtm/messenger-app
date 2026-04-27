import { describe, expect, it, vi } from "vitest";

import {
  bootstrapDeviceSessions,
  shouldEstablishDeviceSession,
  validateAndPinDeviceBundle,
} from "./e2eeDirectBootstrap";

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
  signedPrekeySignature: "sig",
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekey: null,
  deviceVersion: "v1",
  registeredAt: "2026-04-27T12:00:00.000Z",
  lastSeenAt: "2026-04-27T12:00:00.000Z",
});

describe("e2eeDirectBootstrap", () => {
  it("detects when a device session must be established or refreshed", () => {
    const remoteBundle = bundle("peer", "peer-device");

    expect(
      shouldEstablishDeviceSession({
        existingSessions: {},
        bundle: remoteBundle,
        getDeviceSessionMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      })
    ).toBe(true);

    expect(
      shouldEstablishDeviceSession({
        existingSessions: {
          "peer:peer-device": {
            remoteIdentityKey: remoteBundle.identityKey,
            remoteIdentitySignatureKey: remoteBundle.identitySignatureKey,
            remoteSignedPrekeyId: remoteBundle.signedPrekeyId,
            remoteSignedPrekeyPublicKey: remoteBundle.signedPrekeyPublicKey,
          },
        },
        bundle: remoteBundle,
        getDeviceSessionMapKey: (userId, deviceId) => `${userId}:${deviceId}`,
      })
    ).toBe(false);
  });

  it("reuses pinned device versions without re-verifying signatures", async () => {
    const remoteBundle = bundle("peer", "peer-device");
    const verifySignedPrekeySignature = vi.fn(async () => {
      throw new Error("should not run");
    });

    const result = await validateAndPinDeviceBundle({
      bundle: remoteBundle,
      deviceAgreementKeyAlgorithm: "X25519",
      deviceSignatureKeyAlgorithm: "Ed25519",
      readPinnedDeviceBundleRecord: () => ({
        identityFingerprint: "identity-fp",
        identitySignatureFingerprint: "signature-fp",
        signedPrekeyId: 1,
        deviceVersion: "v1",
      }),
      verifySignedPrekeySignature,
      fingerprintPublicKey: vi.fn(async (value) => `${value}-fp`),
      writePinnedDeviceBundleRecord: vi.fn(),
      now: () => "2026-04-27T12:00:00.000Z",
    });

    expect(result).toBe(true);
    expect(verifySignedPrekeySignature).not.toHaveBeenCalled();
  });

  it("bootstraps only unresolved device sessions and persists them", async () => {
    const remoteBundle = bundle("peer", "peer-device");
    const selfBundle = bundle("self", "self-device");
    const established: Array<{ peerUserId: string; peerDeviceId: string }> = [];
    const nextSessionsStore: Record<string, { peerUserId: string; peerDeviceId: string }> = {};

    const result = await bootstrapDeviceSessions({
      token: "token",
      currentUserId: "self",
      previewBundles: [remoteBundle, selfBundle],
      readOwnMaterial: vi.fn(async () => ({
        deviceId: "self-device",
        materialId: "material-id",
      })),
      readCurrentDeviceSessions: vi.fn(async () => ({
        "self:self-device": {
          peerUserId: "self",
          peerDeviceId: "self-device",
        },
      })),
      shouldEstablishDeviceSession: vi.fn((sessions, candidate) => !sessions[`${candidate.userId}:${candidate.deviceId}`]),
      resolveEncryptionDeviceBundles: vi.fn(async () => [remoteBundle]),
      validateAndPinDeviceBundle: vi.fn(async () => true),
      establishInitiatorDeviceSession: vi.fn(async (_currentUserId, _ownMaterial, candidate) => {
        const session = {
          peerUserId: candidate.userId,
          peerDeviceId: candidate.deviceId,
        };
        established.push(session);
        return session;
      }),
      setCurrentDeviceSessionRecord: (
        sessions,
        sessionRecord: { peerUserId: string; peerDeviceId: string }
      ) => {
        sessions[`${sessionRecord.peerUserId}:${sessionRecord.peerDeviceId}`] = sessionRecord;
        nextSessionsStore[`${sessionRecord.peerUserId}:${sessionRecord.peerDeviceId}`] = sessionRecord;
      },
      writeDeviceSessions: vi.fn(),
      rememberDeviceSessions: vi.fn(async () => undefined),
    });

    expect(result).toBe(true);
    expect(established).toEqual([{ peerUserId: "peer", peerDeviceId: "peer-device" }]);
    expect(nextSessionsStore["peer:peer-device"]).toBeTruthy();
  });
});
