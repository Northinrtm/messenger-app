import { describe, expect, it } from "vitest";

import type { Participant, UserEncryptionDeviceBundle } from "./types";
import {
  buildConversationDeviceBundleResolution,
  buildDeviceManifestPreparationKey,
  getDeviceBundleMapKey,
  mergePreparedConversationDeviceBundles,
  mergeResolvedDeviceManifestBundles,
} from "./e2eeDeviceDirectory";

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

describe("e2eeDeviceDirectory", () => {
  it("builds stable manifest preparation keys", () => {
    expect(buildDeviceManifestPreparationKey("self", ["b", "a", "b"])).toBe("self:a,b");
  });

  it("merges prepared conversation bundles without duplicating device keys", () => {
    const merged = mergePreparedConversationDeviceBundles(
      [bundle("u1", "d1")],
      [bundle("u1", "d1"), bundle("u2", "d2")]
    );

    expect(merged.map((entry) => getDeviceBundleMapKey(entry.userId, entry.deviceId)).sort()).toEqual([
      "u1:d1",
      "u2:d2",
    ]);
  });

  it("merges manifest bundles and removes retired device ids", () => {
    const merged = mergeResolvedDeviceManifestBundles(
      [bundle("u1", "d1"), bundle("u2", "d2")],
      [bundle("u1", "d1-new"), bundle("u3", "d3")],
      ["d2"]
    );

    expect(merged.map((entry) => entry.deviceId).sort()).toEqual(["d1", "d1-new", "d3"]);
  });

  it("builds conversation resolution with missing and untrusted participants", () => {
    const participants = [participant("self"), participant("u1"), participant("u2")];
    const rawBundles = [bundle("u1", "d1"), bundle("self", "self-device")];
    const trustedBundles = [bundle("self", "self-device")];

    const resolution = buildConversationDeviceBundleResolution(
      participants,
      rawBundles,
      trustedBundles,
      "self"
    );

    expect(resolution.missingParticipants.map((entry) => entry.id)).toEqual(["u2"]);
    expect(resolution.participantsWithUntrustedDevices.map((entry) => entry.id)).toEqual(["u1"]);
  });
});
