import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptRememberedUnlockedIdentityRecord,
  readRememberedUnlockedIdentity,
  readRememberedUnlockedIdentityRecord,
  readUnlockedIdentity,
  readUnlockedIdentityFromSession,
  readUnlockedIdentityFromPersistentAutoStorage,
  rememberUnlockedIdentity,
  removeUnlockedIdentityFromPersistentStorage,
  removeUnlockedIdentityFromSession,
  writeRememberedUnlockedIdentityRecord,
  writeUnlockedIdentity,
  writeUnlockedIdentityToPersistentAutoStorage,
  writeUnlockedIdentityToSession,
} from "./e2eeIdentityStore";

const unlockedIdentityStorageKey = (userId: string) => `unlocked:${userId}`;
const rememberedIdentityStorageKey = (userId: string) => `remembered:${userId}`;
const autoUnlockedIdentityStorageKey = (userId: string) => `auto:${userId}`;

describe("e2eeIdentityStore", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("hydrates unlocked identity from persistent auto storage", () => {
    const unlockedIdentityByUserId = new Map();
    writeUnlockedIdentityToPersistentAutoStorage({
      userId: "self",
      identity: {
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      },
      getAutoUnlockedIdentityStorageKey: autoUnlockedIdentityStorageKey,
      now: () => "2026-04-27T12:00:00.000Z",
    });

    const identity = readUnlockedIdentity({
      userId: "self",
      unlockedIdentityByUserId,
      readUnlockedIdentityFromSession: (userId) =>
        readUnlockedIdentityFromSession({
          userId,
          getUnlockedIdentityStorageKey: unlockedIdentityStorageKey,
          removeUnlockedIdentityFromSession: (targetUserId) =>
            removeUnlockedIdentityFromSession({
              userId: targetUserId,
              getUnlockedIdentityStorageKey: unlockedIdentityStorageKey,
            }),
        }),
      readUnlockedIdentityFromPersistentAutoStorage: (userId) =>
        readUnlockedIdentityFromPersistentAutoStorage({
          userId,
          getAutoUnlockedIdentityStorageKey: autoUnlockedIdentityStorageKey,
        }),
      writeUnlockedIdentityToSession: (userId, identity) =>
        writeUnlockedIdentityToSession({
          userId,
          identity,
          getUnlockedIdentityStorageKey: unlockedIdentityStorageKey,
        }),
    });

    expect(identity).toEqual({
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(
      window.sessionStorage.getItem(unlockedIdentityStorageKey("self"))
    ).toContain("vault-private");
  });

  it("writes unlocked identity to memory, session, and persistent auto storage", () => {
    const unlockedIdentityByUserId = new Map();

    writeUnlockedIdentity({
      userId: "self",
      identity: {
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      },
      unlockedIdentityByUserId,
      writeUnlockedIdentityToSession: (userId, identity) =>
        writeUnlockedIdentityToSession({
          userId,
          identity,
          getUnlockedIdentityStorageKey: unlockedIdentityStorageKey,
        }),
      writeUnlockedIdentityToPersistentAutoStorage: (userId, identity) =>
        writeUnlockedIdentityToPersistentAutoStorage({
          userId,
          identity,
          getAutoUnlockedIdentityStorageKey: autoUnlockedIdentityStorageKey,
          now: () => "2026-04-27T12:00:00.000Z",
        }),
    });

    expect(unlockedIdentityByUserId.get("self")).toEqual({
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(
      window.sessionStorage.getItem(unlockedIdentityStorageKey("self"))
    ).toContain("vault-private");
    expect(
      window.localStorage.getItem(autoUnlockedIdentityStorageKey("self"))
    ).toContain("vault-private");
  });

  it("round-trips remembered unlocked identity through encrypted localStorage", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockResolvedValue(
      new Uint8Array([1, 2, 3]).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockResolvedValue(
      new TextEncoder().encode(
        JSON.stringify({
          publicKey: "local-device-vault",
          privateKey: "vault-private",
        })
      ).buffer
    );

    const deriveWrappingKey = vi.fn(async () => ({} as CryptoKey));

    await rememberUnlockedIdentity({
      userId: "self",
      identity: {
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      },
      password: "password",
      randomBytes: (length) => new Uint8Array(length).fill(1),
      deriveWrappingKey,
      bytesToBase64: (bytes) => btoa(String.fromCharCode(...bytes)),
      textEncoder: new TextEncoder(),
      kdfIterations: 10,
      writeRememberedUnlockedIdentityRecord: (userId, record) =>
        writeRememberedUnlockedIdentityRecord({
          userId,
          record,
          getRememberedUnlockedIdentityStorageKey: rememberedIdentityStorageKey,
        }),
      now: () => "2026-04-27T12:00:00.000Z",
    });

    const restored = await readRememberedUnlockedIdentity({
      userId: "self",
      password: "password",
      readRememberedUnlockedIdentityRecord: (userId) =>
        readRememberedUnlockedIdentityRecord({
          userId,
          getRememberedUnlockedIdentityStorageKey: rememberedIdentityStorageKey,
          removeUnlockedIdentityFromPersistentStorage: (targetUserId) =>
            removeUnlockedIdentityFromPersistentStorage({
              userId: targetUserId,
              getAutoUnlockedIdentityStorageKey: autoUnlockedIdentityStorageKey,
              getRememberedUnlockedIdentityStorageKey: rememberedIdentityStorageKey,
            }),
        }),
      decryptRememberedUnlockedIdentityRecord: (record, password) =>
        decryptRememberedUnlockedIdentityRecord({
          record,
          password,
          deriveWrappingKey,
          base64ToBytes: (value) =>
            Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
          textDecoder: new TextDecoder(),
          kdfIterations: 10,
        }),
    });

    expect(restored).toEqual({
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
  });

  it("removes malformed remembered identity records", () => {
    window.localStorage.setItem(
      rememberedIdentityStorageKey("self"),
      JSON.stringify({ salt: 1, iv: "iv", ciphertext: "ciphertext" })
    );

    const record = readRememberedUnlockedIdentityRecord({
      userId: "self",
      getRememberedUnlockedIdentityStorageKey: rememberedIdentityStorageKey,
      removeUnlockedIdentityFromPersistentStorage: (userId) =>
        removeUnlockedIdentityFromPersistentStorage({
          userId,
          getAutoUnlockedIdentityStorageKey: autoUnlockedIdentityStorageKey,
          getRememberedUnlockedIdentityStorageKey: rememberedIdentityStorageKey,
        }),
    });

    expect(record).toBeNull();
    expect(
      window.localStorage.getItem(rememberedIdentityStorageKey("self"))
    ).toBeNull();
  });
});
