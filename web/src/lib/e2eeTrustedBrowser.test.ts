import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasTrustedBrowserUnlock,
  readTrustedBrowserUnlockRecord,
  removeTrustedBrowserUnlockRecord,
  writeTrustedBrowserUnlockRecord,
} from "./e2eeTrustedBrowser";
import {
  trustCurrentBrowserUnlock,
  unlockWithTrustedBrowser,
} from "./e2eeTrustedBrowserUnlock";

const session = {
  token: "token",
  user: {
    id: "self",
    username: "denis",
    displayName: "Denis",
  },
} as const;

describe("e2eeTrustedBrowser", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and reads trusted browser unlock records", () => {
    writeTrustedBrowserUnlockRecord("self", {
      credentialId: "cred",
      prfSalt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      createdAt: "2026-04-27T12:00:00.000Z",
    });

    expect(readTrustedBrowserUnlockRecord("self")).toEqual({
      credentialId: "cred",
      prfSalt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      createdAt: "2026-04-27T12:00:00.000Z",
    });
    expect(hasTrustedBrowserUnlock("self")).toBe(true);

    removeTrustedBrowserUnlockRecord("self");
    expect(readTrustedBrowserUnlockRecord("self")).toBeNull();
  });

  it("trusts the current browser unlock with unlocked identity", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockResolvedValue(
      new Uint8Array([1, 2, 3]).buffer
    );

    await trustCurrentBrowserUnlock({
      session: session as never,
      ensureE2eeTransportStorageSchema: vi.fn(),
      rememberRecoverySyncSession: vi.fn(),
      isTrustedBrowserUnlockSupported: () => true,
      readUnlockedIdentity: () => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      }),
      createTrustedBrowserCredential: vi.fn(async () => new Uint8Array([1, 2, 3])),
      randomBytes: (length) => new Uint8Array(length).fill(1),
      deriveTrustedBrowserKey: vi.fn(async () => ({} as CryptoKey)),
      textEncoder: new TextEncoder(),
      bytesToBase64: (bytes) => btoa(String.fromCharCode(...bytes)),
      writeTrustedBrowserUnlockRecord,
      now: () => "2026-04-27T12:00:00.000Z",
    });

    expect(readTrustedBrowserUnlockRecord("self")).toMatchObject({
      createdAt: "2026-04-27T12:00:00.000Z",
    });
  });

  it("unlocks with the trusted browser and restores unlocked identity", async () => {
    writeTrustedBrowserUnlockRecord("self", {
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
    const syncEncryptionRecoverySnapshot = vi.fn(async () => {});

    await unlockWithTrustedBrowser({
      session: session as never,
      ensureE2eeTransportStorageSchema: vi.fn(),
      rememberRecoverySyncSession: vi.fn(),
      isTrustedBrowserUnlockSupported: () => true,
      readTrustedBrowserUnlockRecord,
      deriveTrustedBrowserKey: vi.fn(async () => ({} as CryptoKey)),
      base64ToBytes: (value) =>
        Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
      textDecoder: new TextDecoder(),
      writeUnlockedIdentity,
      syncEncryptionRecoverySnapshot,
    });

    expect(writeUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(syncEncryptionRecoverySnapshot).toHaveBeenCalledWith(session);
  });
});
