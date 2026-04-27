import { describe, expect, it, vi } from "vitest";

import type { AuthResponse } from "./types";
import {
  discardUnusableRegisteredEncryptionDeviceMaterial,
  ensureRegisteredEncryptionDeviceInternal,
  findOwnEncryptionDevice,
  isRegistrationSyncFresh,
  isRegisteredEncryptionDeviceMaterialAvailable,
  isSignedPrekeyRotationDue,
  waitForEncryptionDeviceRegistration,
} from "./e2eeOwnDeviceRegistration";

const session: AuthResponse = {
  token: "token",
  tokenExpiresAt: "2026-04-27T12:00:00.000Z",
  sessionId: "session-id",
  user: {
    id: "self",
    username: "self",
    displayName: "Self",
    profession: null,
    avatarUrl: null,
    createdAt: "2026-04-20T12:00:00.000Z",
    online: true,
  },
};

const material = {
  deviceId: "self-device",
  identityKey: "identity",
  identityPrivateKey: "identity-private",
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: "signature",
  identitySignaturePrivateKey: "signature-private",
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 1,
  signedPrekeyPublicKey: "signed-prekey",
  signedPrekeyPrivateKey: "signed-prekey-private",
  signedPrekeySignature: "sig",
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekeys: [{ keyId: 7, publicKey: "otp" }],
  createdAt: "2026-04-20T12:00:00.000Z",
  signedPrekeyCreatedAt: "2026-04-20T12:00:00.000Z",
};

describe("e2eeOwnDeviceRegistration", () => {
  it("finds the current device first by deviceId and then by keys", () => {
    const devices = [
      {
        deviceId: "other-device",
        deviceName: "Other",
        identityKey: "other-identity",
        identityKeyAlgorithm: "X25519",
        identitySignatureKey: "other-signature",
        identitySignatureKeyAlgorithm: "Ed25519",
        signedPrekeyId: 2,
        signedPrekeyPublicKey: "other-signed-prekey",
        signedPrekeySignature: "sig",
        signedPrekeyAlgorithm: "X25519",
        deviceVersion: "v1",
        availableOneTimePrekeys: 5,
        registeredAt: "2026-04-20T12:00:00.000Z",
        lastSeenAt: "2026-04-20T12:00:00.000Z",
      },
      {
        deviceId: "self-device",
        deviceName: "Self",
        identityKey: "identity",
        identityKeyAlgorithm: "X25519",
        identitySignatureKey: "signature",
        identitySignatureKeyAlgorithm: "Ed25519",
        signedPrekeyId: 1,
        signedPrekeyPublicKey: "signed-prekey",
        signedPrekeySignature: "sig",
        signedPrekeyAlgorithm: "X25519",
        deviceVersion: "v1",
        availableOneTimePrekeys: 5,
        registeredAt: "2026-04-20T12:00:00.000Z",
        lastSeenAt: "2026-04-20T12:00:00.000Z",
      },
    ];

    expect(findOwnEncryptionDevice(devices, material)?.deviceId).toBe("self-device");
    expect(
      findOwnEncryptionDevice(devices, {
        ...material,
        deviceId: null,
      })?.deviceId
    ).toBe("self-device");
  });

  it("clears broken local material when private key import fails", async () => {
    const removeEncryptionDeviceMaterial = vi.fn();
    const clearCompletedDevicePreparation = vi.fn();

    const result = await discardUnusableRegisteredEncryptionDeviceMaterial({
      userId: "self",
      material,
      isRegisteredEncryptionDeviceMaterialUsable: vi.fn(async () => false),
      removeEncryptionDeviceMaterial,
      removeRememberedEncryptionDeviceMaterial: vi.fn(),
      removeDeviceSessions: vi.fn(),
      removeRememberedDeviceSessions: vi.fn(),
      removeGroupSenderChains: vi.fn(),
      removeGroupHistoryKeys: vi.fn(),
      clearCompletedEncryptionDeviceRegistration: vi.fn(),
      clearCompletedDevicePreparation,
    });

    expect(result).toBeNull();
    expect(removeEncryptionDeviceMaterial).toHaveBeenCalledWith("self");
    expect(clearCompletedDevicePreparation).toHaveBeenCalledWith("self");
  });

  it("rehydrates a matching local device with the server deviceId", async () => {
    const writeEncryptionDeviceMaterial = vi.fn();
    const rememberEncryptionDeviceMaterial = vi.fn(async () => undefined);
    const markRegistrationCompleted = vi.fn();
    const clearCompletedDevicePreparation = vi.fn();

    await ensureRegisteredEncryptionDeviceInternal({
      session,
      isSecureContextAvailable: () => true,
      listOwnEncryptionDevices: vi.fn(async () => [
        {
          deviceId: "server-device",
          deviceName: "Self",
          identityKey: material.identityKey,
          identityKeyAlgorithm: "X25519",
          identitySignatureKey: material.identitySignatureKey,
          identitySignatureKeyAlgorithm: "Ed25519",
          signedPrekeyId: material.signedPrekeyId,
          signedPrekeyPublicKey: material.signedPrekeyPublicKey,
          signedPrekeySignature: "sig",
          signedPrekeyAlgorithm: "X25519",
          deviceVersion: "v1",
          availableOneTimePrekeys: 5,
          registeredAt: "2026-04-20T12:00:00.000Z",
          lastSeenAt: "2026-04-20T12:00:00.000Z",
        },
      ]),
      readEncryptionDeviceMaterial: vi.fn(async () => ({
        ...material,
        deviceId: null,
      })),
      discardUnusableRegisteredEncryptionDeviceMaterial: vi.fn(async (_userId, value) => value),
      isSignedPrekeyRotationDue: vi.fn(() => false),
      minOneTimePrekeys: 4,
      refreshEncryptionDeviceMaterial: vi.fn(async () => material),
      createEncryptionDeviceMaterial: vi.fn(async () => material),
      upsertOwnEncryptionDevice: vi.fn(async () => ({ deviceId: "server-device" })),
      writeEncryptionDeviceMaterial,
      rememberEncryptionDeviceMaterial,
      markRegistrationCompleted,
      clearCompletedDevicePreparation,
    });

    expect(writeEncryptionDeviceMaterial).toHaveBeenCalledWith(
      "self",
      expect.objectContaining({ deviceId: "server-device" })
    );
    expect(rememberEncryptionDeviceMaterial).toHaveBeenCalled();
    expect(markRegistrationCompleted).toHaveBeenCalledWith("self");
    expect(clearCompletedDevicePreparation).toHaveBeenCalledWith("self");
  });

  it("falls through to force-register when ensure/recover do not yield a fresh usable device", async () => {
    const forceRegisteredMaterial = {
      ...material,
      oneTimePrekeys: [
        { keyId: 7, publicKey: "otp" },
        { keyId: 8, publicKey: "otp2" },
        { keyId: 9, publicKey: "otp3" },
        { keyId: 10, publicKey: "otp4" },
      ],
    };

    await expect(
      waitForEncryptionDeviceRegistration({
        session,
        rememberRecoverySyncSession: vi.fn(),
        getInFlightRegistration: vi.fn(() => undefined),
        readEncryptionDeviceMaterial: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        discardUnusableRegisteredEncryptionDeviceMaterial: vi.fn(async (_userId, value) => value),
        hasFreshCompletedEncryptionDeviceRegistration: vi
          .fn()
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(true),
        ensureRegisteredEncryptionDevice: vi.fn(async () => undefined),
        recoverRegisteredEncryptionDeviceMaterial: vi.fn(async () => null),
        forceRegisterEncryptionDevice: vi.fn(async () => forceRegisteredMaterial),
        initializationErrorMessage: "Encrypted chat is still initializing on this device. Try again.",
      })
    ).resolves.toBeUndefined();
  });

  it("detects registration freshness from one-time prekey count and signed prekey age", () => {
    expect(isRegisteredEncryptionDeviceMaterialAvailable(material)).toBe(true);
    expect(
      isRegistrationSyncFresh(material, 1, (candidate) =>
        isSignedPrekeyRotationDue(candidate, null, 7 * 24 * 60 * 60 * 1000, Date.parse("2026-04-21T12:00:00.000Z"))
      )
    ).toBe(true);
  });
});
