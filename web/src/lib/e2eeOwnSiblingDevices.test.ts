import { describe, expect, it, vi } from "vitest";

import {
  buildOwnSiblingDeviceBundle,
  buildOwnSiblingDevicePreparationKey,
  listPreparedOwnSiblingDeviceBundles,
} from "./e2eeOwnSiblingDevices";

const device = (deviceId: string, version = "v1") => ({
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
  availableOneTimePrekeys: 3,
  registeredAt: "2026-04-27T12:00:00.000Z",
  lastSeenAt: "2026-04-27T12:00:00.000Z",
});

describe("e2eeOwnSiblingDevices", () => {
  it("builds stable preparation keys", () => {
    expect(buildOwnSiblingDevicePreparationKey("self", "phone")).toBe(
      "self:phone"
    );
  });

  it("builds sibling bundles without one-time prekeys", () => {
    expect(buildOwnSiblingDeviceBundle(device("tablet"), "self")).toEqual(
      expect.objectContaining({
        userId: "self",
        deviceId: "tablet",
        oneTimePrekey: null,
        deviceVersion: "v1",
      })
    );
  });

  it("filters the current device and caches trusted sibling bundles", async () => {
    const readPreparedOwnSiblingDeviceState = vi.fn(() => null);
    const rememberPreparedOwnSiblingDeviceState = vi.fn();

    const result = await listPreparedOwnSiblingDeviceBundles({
      token: "token",
      currentUserId: "self",
      currentDeviceId: "phone",
      inFlightOwnSiblingDevicePreparation: new Map(),
      readPreparedOwnSiblingDeviceState,
      rememberPreparedOwnSiblingDeviceState,
      clearPreparedOwnSiblingDeviceState: vi.fn(),
      listOwnEncryptionDevices: vi.fn(async () => [
        device("phone"),
        device("tablet"),
        device("desktop"),
      ]),
      validateAndPinDeviceBundle: vi.fn(async (bundle) => bundle.deviceId !== "desktop"),
    });

    expect(result?.rawBundles.map((bundle) => bundle.deviceId)).toEqual([
      "tablet",
      "desktop",
    ]);
    expect(result?.trustedBundles.map((bundle) => bundle.deviceId)).toEqual([
      "tablet",
    ]);
    expect(rememberPreparedOwnSiblingDeviceState).toHaveBeenCalled();
  });

  it("returns cached state without hitting the API", async () => {
    const cachedState = {
      rawBundles: [buildOwnSiblingDeviceBundle(device("tablet"), "self")],
      trustedBundles: [buildOwnSiblingDeviceBundle(device("tablet"), "self")],
    };
    const listOwnEncryptionDevices = vi.fn(async () => [device("tablet")]);

    const result = await listPreparedOwnSiblingDeviceBundles({
      token: "token",
      currentUserId: "self",
      currentDeviceId: "phone",
      inFlightOwnSiblingDevicePreparation: new Map(),
      readPreparedOwnSiblingDeviceState: vi.fn(() => cachedState),
      rememberPreparedOwnSiblingDeviceState: vi.fn(),
      clearPreparedOwnSiblingDeviceState: vi.fn(),
      listOwnEncryptionDevices,
      validateAndPinDeviceBundle: vi.fn(async () => true),
    });

    expect(result).toBe(cachedState);
    expect(listOwnEncryptionDevices).not.toHaveBeenCalled();
  });
});
