import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import type { Participant } from "./types";
import {
  buildDevicePreparationKey,
  prepareSendConversationDeviceBundles,
  primeDeviceBundles,
} from "./e2eeDevicePreparation";

const bundle = (userId: string, deviceId: string, version = "v1") => ({
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
  deviceVersion: version,
  oneTimePrekey: null,
  registeredAt: "2026-04-27T12:00:00.000Z",
  lastSeenAt: "2026-04-27T12:00:00.000Z",
});

describe("e2eeDevicePreparation", () => {
  it("builds stable preparation keys from deduplicated participant ids", () => {
    expect(
      buildDevicePreparationKey("self", ["b", "a", "", "b", "a"])
    ).toBe("self:a,b");
    expect(buildDevicePreparationKey(null, ["peer"])).toBe("anonymous:peer");
  });

  it("falls back to bundle resolve when manifest response is invalid", async () => {
    const peerBundle = bundle("peer", "peer-device");

    const result = await primeDeviceBundles({
      token: "token",
      userIds: ["peer", "peer"],
      requesterDeviceId: "self-device",
      currentUserId: "self",
      readPreparedDeviceManifestState: vi.fn(() => null),
      rememberPreparedDeviceManifestState: vi.fn(),
      resolveEncryptionDeviceManifest: vi.fn(async () => ({ invalid: true })),
      resolveEncryptionDeviceBundles: vi.fn(async () => [peerBundle]),
      validateAndPinDeviceBundle: vi.fn(async () => true),
    });

    expect(result.rawBundles).toEqual([peerBundle]);
    expect(result.trustedBundles).toEqual([peerBundle]);
  });

  it("merges sibling bundles into prepared send resolution and caches them", async () => {
    const participants: Participant[] = [
      {
        id: "self",
        username: "self",
        displayName: "Self",
        profession: null,
        avatarUrl: null,
        online: true,
      },
      {
        id: "peer",
        username: "peer",
        displayName: "Peer",
        profession: null,
        avatarUrl: null,
        online: true,
      },
    ];
    const peerBundle = bundle("peer", "peer-device");
    const siblingBundle = bundle("self", "self-tablet");
    const rememberPreparedConversationDeviceState = vi.fn();
    const bootstrapDeviceSessions = vi.fn(async () => true);

    const result = await prepareSendConversationDeviceBundles({
      token: "token",
      currentUserId: "self",
      participants,
      inFlightDevicePreparation: new Map<string, Promise<void>>(),
      readPreparedConversationDeviceState: vi.fn(() => null),
      readPreparedDeviceManifestState: vi.fn(() => null),
      rememberPreparedConversationDeviceState,
      rememberPreparedDeviceManifestState: vi.fn(),
      readEncryptionDeviceMaterial: vi.fn(async () => ({
        deviceId: "self-phone",
      })),
      listPreparedOwnSiblingDeviceBundles: vi.fn(async () => ({
        rawBundles: [siblingBundle],
        trustedBundles: [siblingBundle],
      })),
      bootstrapDeviceSessions,
      resolveEncryptionDeviceManifest: vi.fn(async () => ({
        version: "manifest-v1",
        fullSync: true,
        bundles: [peerBundle],
        removedDeviceIds: [],
      })),
      resolveEncryptionDeviceBundles: vi.fn(async () => []),
      validateAndPinDeviceBundle: vi.fn(async () => true),
      encryptionIdentityChangedMessage: "identity changed",
    });

    expect(result.rawBundles).toEqual(
      expect.arrayContaining([peerBundle, siblingBundle])
    );
    expect(result.trustedBundles).toEqual(
      expect.arrayContaining([peerBundle, siblingBundle])
    );
    expect(bootstrapDeviceSessions).toHaveBeenCalledWith("token", "self", [
      peerBundle,
      siblingBundle,
    ]);
    expect(rememberPreparedConversationDeviceState).toHaveBeenCalled();
  });

  it("throws an identity-changed error for untrusted device bundles", async () => {
    const participants: Participant[] = [
      {
        id: "self",
        username: "self",
        displayName: "Self",
        profession: null,
        avatarUrl: null,
        online: true,
      },
      {
        id: "peer",
        username: "peer",
        displayName: "Peer",
        profession: null,
        avatarUrl: null,
        online: true,
      },
    ];
    const peerBundle = bundle("peer", "peer-device");

    await expect(
      prepareSendConversationDeviceBundles({
        token: "token",
        currentUserId: "self",
        participants,
        inFlightDevicePreparation: new Map<string, Promise<void>>(),
        readPreparedConversationDeviceState: vi.fn(() => null),
        readPreparedDeviceManifestState: vi.fn(() => null),
        rememberPreparedConversationDeviceState: vi.fn(),
        rememberPreparedDeviceManifestState: vi.fn(),
        readEncryptionDeviceMaterial: vi.fn(async () => null),
        listPreparedOwnSiblingDeviceBundles: vi.fn(async () => null),
        bootstrapDeviceSessions: vi.fn(async () => true),
        resolveEncryptionDeviceManifest: vi.fn(async () => ({
          version: "manifest-v1",
          fullSync: true,
          bundles: [peerBundle],
          removedDeviceIds: [],
        })),
        resolveEncryptionDeviceBundles: vi.fn(async () => []),
        validateAndPinDeviceBundle: vi.fn(async () => false),
        encryptionIdentityChangedMessage: "identity changed",
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
