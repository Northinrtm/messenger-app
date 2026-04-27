import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptRememberedEncryptionDeviceMaterial,
  encryptRememberedEncryptionDeviceMaterial,
  normalizeDeviceEncryptionMaterial,
  pruneRetiredOneTimePrekeys,
  pruneRetiredSignedPrekeys,
  readEncryptionDeviceMaterial,
  readRememberedEncryptionDeviceMaterial,
  rememberEncryptionDeviceMaterial,
  removeEncryptionDeviceMaterial,
  removeRememberedEncryptionDeviceMaterial,
  writeEncryptionDeviceMaterial,
} from "./e2eeOwnDeviceMaterialStore";

const userId = "self";

const material = {
  deviceId: "device-id",
  materialId: "material-id",
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
  oneTimePrekeys: [{ keyId: 1, publicKey: "otp", privateKey: "otp-private" }],
  retiredOneTimePrekeys: [
    {
      keyId: 2,
      publicKey: "old-otp",
      privateKey: "old-otp-private",
      retiredAt: "2026-04-20T12:00:00.000Z",
      expiresAt: "2026-04-28T12:00:00.000Z",
    },
  ],
  retiredSignedPrekeys: [
    {
      signedPrekeyId: 2,
      signedPrekeyPublicKey: "old-signed",
      signedPrekeyPrivateKey: "old-signed-private",
      signedPrekeyAlgorithm: "X25519",
      retiredAt: "2026-04-20T12:00:00.000Z",
      expiresAt: "2026-04-28T12:00:00.000Z",
    },
  ],
  createdAt: "2026-04-20T12:00:00.000Z",
  signedPrekeyCreatedAt: "2026-04-20T12:00:00.000Z",
};

describe("e2eeOwnDeviceMaterialStore", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("prunes expired retired prekeys", () => {
    expect(
      pruneRetiredSignedPrekeys(material.retiredSignedPrekeys, Date.parse("2026-04-27T12:00:00.000Z"))
    ).toHaveLength(1);
    expect(
      pruneRetiredSignedPrekeys(material.retiredSignedPrekeys, Date.parse("2026-04-29T12:00:00.000Z"))
    ).toHaveLength(0);
    expect(
      pruneRetiredOneTimePrekeys(material.retiredOneTimePrekeys, Date.parse("2026-04-29T12:00:00.000Z"))
    ).toHaveLength(0);
  });

  it("normalizes device material and drops invalid payloads", () => {
    expect(normalizeDeviceEncryptionMaterial(material)).toEqual(
      expect.objectContaining({
        deviceId: "device-id",
        materialId: "material-id",
      })
    );
    expect(normalizeDeviceEncryptionMaterial({ nope: true })).toBeNull();
  });

  it("writes session material and reads it back via sessionStorage", async () => {
    const sessionKey = (value: string) => `device:${value}`;

    writeEncryptionDeviceMaterial({
      userId,
      material,
      getEncryptionDeviceStorageKey: sessionKey,
    });

    const restored = await readEncryptionDeviceMaterial({
      userId,
      getEncryptionDeviceStorageKey: sessionKey,
      normalizeDeviceEncryptionMaterial,
      removeEncryptionDeviceMaterial: (targetUserId) =>
        removeEncryptionDeviceMaterial({
          userId: targetUserId,
          getEncryptionDeviceStorageKey: sessionKey,
        }),
      writeEncryptionDeviceMaterial: (targetUserId, targetMaterial) =>
        writeEncryptionDeviceMaterial({
          userId: targetUserId,
          material: targetMaterial,
          getEncryptionDeviceStorageKey: sessionKey,
        }),
      readRememberedEncryptionDeviceMaterial: vi.fn(async () => null),
    });

    expect(restored).toEqual(expect.objectContaining({ materialId: "material-id" }));
  });

  it("round-trips remembered material through encrypted localStorage", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockResolvedValue(
      new Uint8Array([1, 2, 3]).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(material)).buffer
    );

    const rememberedKey = (value: string) => `remembered:${value}`;
    const deriveWrappingKey = vi.fn(async () => ({} as CryptoKey));
    const encryptRecord = async (privateKey: string, targetMaterial: typeof material) =>
      encryptRememberedEncryptionDeviceMaterial({
        privateKey,
        material: targetMaterial,
        randomBytes: (length) => new Uint8Array(length).fill(1),
        deriveWrappingKey,
        bytesToBase64: (bytes) => btoa(String.fromCharCode(...bytes)),
        textEncoder: new TextEncoder(),
        kdfIterations: 10,
      });
    const decryptRecord = async (privateKey: string, record: { salt: string; iv: string; ciphertext: string; createdAt: string }) =>
      decryptRememberedEncryptionDeviceMaterial({
        privateKey,
        record,
        base64ToBytes: (value) =>
          Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
        deriveWrappingKey,
        textDecoder: new TextDecoder(),
        kdfIterations: 10,
      });

    await rememberEncryptionDeviceMaterial({
      userId,
      material,
      readUnlockedIdentity: () => ({ privateKey: "vault-private" }),
      encryptRememberedEncryptionDeviceMaterial: encryptRecord,
      getRememberedEncryptionDeviceStorageKey: rememberedKey,
    });

    const restored = await readRememberedEncryptionDeviceMaterial({
      userId,
      readUnlockedIdentity: () => ({ privateKey: "vault-private" }),
      getRememberedEncryptionDeviceStorageKey: rememberedKey,
      decryptRememberedEncryptionDeviceMaterial: decryptRecord,
      normalizeDeviceEncryptionMaterial,
      removeRememberedEncryptionDeviceMaterial: (targetUserId) =>
        removeRememberedEncryptionDeviceMaterial({
          userId: targetUserId,
          getRememberedEncryptionDeviceStorageKey: rememberedKey,
        }),
    });

    expect(restored).toEqual(expect.objectContaining({ materialId: "material-id" }));
  });

  it("removes invalid remembered records", async () => {
    const rememberedKey = (value: string) => `remembered:${value}`;
    window.localStorage.setItem(rememberedKey(userId), JSON.stringify({ broken: true }));

    const restored = await readRememberedEncryptionDeviceMaterial({
      userId,
      readUnlockedIdentity: () => ({ privateKey: "vault-private" }),
      getRememberedEncryptionDeviceStorageKey: rememberedKey,
      decryptRememberedEncryptionDeviceMaterial: vi.fn(async () => null),
      normalizeDeviceEncryptionMaterial,
      removeRememberedEncryptionDeviceMaterial: (targetUserId) =>
        removeRememberedEncryptionDeviceMaterial({
          userId: targetUserId,
          getRememberedEncryptionDeviceStorageKey: rememberedKey,
        }),
    });

    expect(restored).toBeNull();
    expect(window.localStorage.getItem(rememberedKey(userId))).toBeNull();
  });
});
