import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasTrustedDeviceUnlock,
  readTrustedDeviceUnlockRecord,
  removeTrustedDeviceUnlockRecord,
  writeTrustedDeviceUnlockRecord,
} from "./e2eeTrustedDevice";
import {
  trustCurrentDeviceUnlock,
  unlockWithTrustedDevice,
} from "./e2eeTrustedDeviceUnlock";

const session = {
  token: "token",
  user: {
    id: "self",
    username: "denis",
    displayName: "Denis",
  },
} as const;

describe("e2eeTrustedDevice", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and reads trusted device unlock records", () => {
    writeTrustedDeviceUnlockRecord("self", {
      credentialId: "cred",
      prfSalt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      createdAt: "2026-04-27T12:00:00.000Z",
    });

    expect(readTrustedDeviceUnlockRecord("self")).toEqual({
      credentialId: "cred",
      prfSalt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      createdAt: "2026-04-27T12:00:00.000Z",
    });
    expect(hasTrustedDeviceUnlock("self")).toBe(true);

    removeTrustedDeviceUnlockRecord("self");
    expect(readTrustedDeviceUnlockRecord("self")).toBeNull();
  });

  it("trusts current device unlock with unlocked identity", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockResolvedValue(
      new Uint8Array([1, 2, 3]).buffer
    );

    await trustCurrentDeviceUnlock({
      session: session as never,
      ensureE2eeTransportStorageSchema: vi.fn(),
      rememberRecoverySyncSession: vi.fn(),
      isTrustedDeviceUnlockSupported: () => true,
      readUnlockedIdentity: () => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      }),
      createTrustedDeviceCredential: vi.fn(async () => new Uint8Array([1, 2, 3])),
      randomBytes: (length) => new Uint8Array(length).fill(1),
      deriveTrustedDeviceKey: vi.fn(async () => ({} as CryptoKey)),
      textEncoder: new TextEncoder(),
      bytesToBase64: (bytes) => btoa(String.fromCharCode(...bytes)),
      writeTrustedDeviceUnlockRecord,
      now: () => "2026-04-27T12:00:00.000Z",
    });

    expect(readTrustedDeviceUnlockRecord("self")).toMatchObject({
      createdAt: "2026-04-27T12:00:00.000Z",
    });
  });

  it("unlocks with trusted device and restores unlocked identity", async () => {
    writeTrustedDeviceUnlockRecord("self", {
      credentialId: btoa("\u0001\u0002\u0003"),
      prfSalt: btoa("\u0001\u0001\u0001"),
      iv: btoa("\u0001".repeat(12)),
      ciphertext: btoa("\u0002\u0003\u0004"),
      createdAt: "2026-04-27T12:00:00.000Z",
    });
    vi.spyOn(window.crypto.subtle, "decrypt").mockResolvedValue(
      new TextEncoder().encode(
        JSON.stringify({
          publicKey: "local-device-vault",
          privateKey: "vault-private",
        })
      ).buffer
    );
    const writeUnlockedIdentity = vi.fn();
    const ensureRegisteredEncryptionDevice = vi.fn(async () => {});
    const syncEncryptionRecoverySnapshot = vi.fn(async () => {});

    await unlockWithTrustedDevice({
      session: session as never,
      ensureE2eeTransportStorageSchema: vi.fn(),
      rememberRecoverySyncSession: vi.fn(),
      isTrustedDeviceUnlockSupported: () => true,
      readTrustedDeviceUnlockRecord,
      deriveTrustedDeviceKey: vi.fn(async () => ({} as CryptoKey)),
      base64ToBytes: (value) =>
        Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
      textDecoder: new TextDecoder(),
      writeUnlockedIdentity,
      ensureRegisteredEncryptionDevice,
      syncEncryptionRecoverySnapshot,
    });

    expect(writeUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(ensureRegisteredEncryptionDevice).toHaveBeenCalledWith(session);
    expect(syncEncryptionRecoverySnapshot).toHaveBeenCalledWith(session);
  });
});
