import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearUnlockedEncryptionState, hasUnlockedPrivateEncryptionKey } from "./e2ee";

const USER_ID = "user-id";
const SESSION_KEY = `north-messenger:unlocked-e2ee:${USER_ID}`;
const REMEMBERED_KEY = `north-messenger:remembered-e2ee:${USER_ID}`;
const TRUSTED_DEVICE_KEY = `north-messenger:trusted-device-e2ee:${USER_ID}`;

const identity = {
  publicKey: '{"kty":"RSA","n":"public"}',
  privateKey: '{"kty":"RSA","d":"private"}',
};

const trustedDeviceRecord = {
  credentialId: "credential-id",
  prfSalt: "prf-salt",
  iv: "iv",
  ciphertext: "ciphertext",
  createdAt: "2026-04-08T10:00:00.000Z",
};

describe("e2ee unlock persistence", () => {
  beforeEach(() => {
    clearUnlockedEncryptionState(USER_ID);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    clearUnlockedEncryptionState(USER_ID);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("restores an unlocked identity from persistent storage on trusted devices", () => {
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(true);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(identity));
  });

  it("ignores remembered keys until trusted device unlock is configured", () => {
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("removes remembered identities when the encryption state is cleared", () => {
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(true);

    clearUnlockedEncryptionState(USER_ID);

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
  });
});
