import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => {
  class MockApiError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    getMessagesRaw: vi.fn(),
    getOwnEncryptionKeyBundle: vi.fn(),
    resolveEncryptionPublicKeys: vi.fn(),
    sendMessageRaw: vi.fn(),
    updateMessage: vi.fn(),
    upsertOwnEncryptionKeyBundle: vi.fn(),
  };
});

import { ApiError, resolveEncryptionPublicKeys } from "./api";
import {
  clearPinnedEncryptionIdentity,
  clearUnlockedEncryptionState,
  hasUnlockedPrivateEncryptionKey,
  isEncryptionIdentityChangedError,
  primeEncryptedMessageRecipients,
} from "./e2ee";

const USER_ID = "user-id";
const REMOTE_USER_ID = "remote-user-id";
const SESSION_KEY = `north-messenger:unlocked-e2ee:${USER_ID}`;
const REMEMBERED_KEY = `north-messenger:remembered-e2ee:${USER_ID}`;
const TRUSTED_DEVICE_KEY = `north-messenger:trusted-device-e2ee:${USER_ID}`;
const PINNED_KEY = `north-messenger:pinned-e2ee-fingerprint:${REMOTE_USER_ID}`;

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

const participant = {
  id: REMOTE_USER_ID,
  username: "remote",
  displayName: "Remote User",
  profession: null,
  avatarUrl: null,
  online: true,
};

describe("e2ee hardening", () => {
  beforeEach(() => {
    clearUnlockedEncryptionState();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearUnlockedEncryptionState();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not restore an unlocked identity from persistent storage even on trusted devices", () => {
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("removes remembered identity remnants when the encryption state is cleared", () => {
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    clearUnlockedEncryptionState(USER_ID);

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
  });

  it("pins participant public keys and rejects silent key replacement", async () => {
    const importKeySpy = vi
      .spyOn(window.crypto.subtle, "importKey")
      .mockResolvedValue({} as CryptoKey);
    const resolveKeysMock = vi.mocked(resolveEncryptionPublicKeys);

    resolveKeysMock.mockResolvedValueOnce([
      { userId: REMOTE_USER_ID, publicKey: '{"kty":"RSA","n":"first-key"}' },
    ]);

    await primeEncryptedMessageRecipients("token", [participant]);

    expect(window.localStorage.getItem(PINNED_KEY)).toBeTruthy();
    expect(importKeySpy).toHaveBeenCalledTimes(1);

    clearUnlockedEncryptionState();
    importKeySpy.mockClear();

    resolveKeysMock.mockResolvedValueOnce([
      { userId: REMOTE_USER_ID, publicKey: '{"kty":"RSA","n":"second-key"}' },
    ]);

    await expect(primeEncryptedMessageRecipients("token", [participant])).rejects.toMatchObject({
      status: 409,
    });
    expect(importKeySpy).not.toHaveBeenCalled();
  });

  it("clears pinned public key fingerprints without clearing trusted-device setup", () => {
    window.localStorage.setItem(PINNED_KEY, "fingerprint");
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));

    clearPinnedEncryptionIdentity(REMOTE_USER_ID);

    expect(window.localStorage.getItem(PINNED_KEY)).toBeNull();
    expect(window.localStorage.getItem(TRUSTED_DEVICE_KEY)).not.toBeNull();
  });

  it("recognizes the dedicated encryption identity mismatch error", () => {
    expect(
      isEncryptionIdentityChangedError(
        new ApiError(
          "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
          409
        )
      )
    ).toBe(true);
    expect(isEncryptionIdentityChangedError(new ApiError("Another 409", 409))).toBe(false);
    expect(isEncryptionIdentityChangedError(new Error("plain error"))).toBe(false);
  });
});
