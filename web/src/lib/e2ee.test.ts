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
    getOwnGroupHistoryKeys: vi.fn(),
    getOwnEncryptionRecoverySnapshot: vi.fn(),
    listOwnEncryptionDevices: vi.fn(),
    resolveEncryptionDeviceManifest: vi.fn(),
    resolveEncryptionDeviceBundles: vi.fn(),
    updateMessage: vi.fn(),
    upsertGroupHistoryKey: vi.fn(),
    upsertOwnEncryptionRecoverySnapshot: vi.fn(),
    upsertOwnEncryptionDevice: vi.fn(),
  };
});

vi.mock("./realtime", () => ({
  sendMessageRaw: vi.fn(),
}));

import {
  ApiError,
  getMessagesRaw,
  getOwnGroupHistoryKeys,
  getOwnEncryptionRecoverySnapshot,
  listOwnEncryptionDevices,
  resolveEncryptionDeviceManifest,
  resolveEncryptionDeviceBundles,
  upsertGroupHistoryKey,
  upsertOwnEncryptionRecoverySnapshot,
  upsertOwnEncryptionDevice,
} from "./api";
import { sendMessageRaw } from "./realtime";
import {
  clearPinnedEncryptionIdentity,
  clearUnlockedEncryptionState,
  ensureEncryptionReady,
  grantGroupHistoryAccessForParticipants,
  getEncryptedMessages,
  getEncryptedMessagesSnapshot,
  hasUnlockedPrivateEncryptionKey,
  hydrateChatMessage,
  hydrateChatMessageSnapshot,
  isEncryptionIdentityChangedError,
  primeEncryptedMessageRecipients,
  sendEncryptedMessage,
  syncEncryptionDeviceState,
} from "./e2ee";
import {
  readMessageHydrationDiagnostics,
  rememberCurrentBuildRevision,
} from "./messageHydrationDiagnostics";
import type { ApiChatMessage } from "./types";

const USER_ID = "user-id";
const REMOTE_USER_ID = "remote-user-id";
const REMOTE_USER_ID_TWO = "remote-user-id-two";
const SESSION_KEY = `north-messenger:unlocked-e2ee:${USER_ID}`;
const AUTO_UNLOCKED_KEY = `north-messenger:auto-unlocked-e2ee:${USER_ID}`;
const REMEMBERED_KEY = `north-messenger:remembered-e2ee:${USER_ID}`;
const TRUSTED_DEVICE_KEY = `north-messenger:trusted-device-e2ee:${USER_ID}`;
const DEVICE_MATERIAL_KEY = `north-messenger:device-e2ee:${USER_ID}`;
const DEVICE_SESSION_KEY = `north-messenger:device-session-e2ee:${USER_ID}`;
const GROUP_SENDER_CHAIN_KEY = `north-messenger:group-sender-chain-e2ee:${USER_ID}`;
const GROUP_HISTORY_KEY = `north-messenger:group-history-key-e2ee:${USER_ID}`;
const PINNED_DEVICE_KEY = `north-messenger:pinned-device-e2ee:${REMOTE_USER_ID}:device-id`;
const STORAGE_SCHEMA_KEY = "north-messenger:e2ee-storage-schema-version";
const testTextEncoder = new TextEncoder();
const testTextDecoder = new TextDecoder();
const GENERATED_OKP_X = okpComponent("generated");

function okpComponent(seed: string) {
  const source = testTextEncoder.encode(seed);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = source[index % source.length] ?? 0;
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function publicOkpJwk(curve: "X25519" | "Ed25519", seed: string) {
  return JSON.stringify({
    kty: "OKP",
    crv: curve,
    x: okpComponent(seed),
  });
}

function privateOkpJwk(curve: "X25519" | "Ed25519", publicSeed: string, privateSeed: string) {
  return JSON.stringify({
    kty: "OKP",
    crv: curve,
    d: okpComponent(privateSeed),
    x: okpComponent(publicSeed),
  });
}

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

const secondParticipant = {
  id: REMOTE_USER_ID_TWO,
  username: "remote-two",
  displayName: "Remote User Two",
  profession: null,
  avatarUrl: null,
  online: true,
};

const selfParticipant = {
  id: USER_ID,
  username: "self",
  displayName: "Self User",
  profession: null,
  avatarUrl: null,
  online: true,
};

const deviceBundle = {
  userId: REMOTE_USER_ID,
  deviceId: "device-id",
  deviceName: "Remote desktop",
  identityKey: publicOkpJwk("X25519", "agreement"),
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: publicOkpJwk("Ed25519", "signature"),
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 7,
  signedPrekeyPublicKey: publicOkpJwk("X25519", "signed-prekey"),
  signedPrekeySignature: "c2lnbmF0dXJl",
  signedPrekeyAlgorithm: "X25519",
  deviceVersion: "device-version-1",
  oneTimePrekey: null,
  registeredAt: "2026-04-09T10:00:00.000Z",
  lastSeenAt: "2026-04-09T10:00:00.000Z",
};

const consumableDeviceBundle = {
  ...deviceBundle,
  oneTimePrekey: {
    keyId: 11,
    publicKey: publicOkpJwk("X25519", "otp"),
  },
};

const secondDeviceBundle = {
  ...deviceBundle,
  userId: REMOTE_USER_ID_TWO,
  deviceId: "device-id-two",
  deviceName: "Remote tablet",
};

const secondConsumableDeviceBundle = {
  ...secondDeviceBundle,
  oneTimePrekey: {
    keyId: 12,
    publicKey: publicOkpJwk("X25519", "otp-two"),
  },
};

const localDeviceMaterial = {
  deviceId: "self-device",
  materialId: "material-id",
  identityKey: publicOkpJwk("X25519", "self-agreement"),
  identityPrivateKey: privateOkpJwk("X25519", "self-agreement", "self-agreement-private"),
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: publicOkpJwk("Ed25519", "self-signature"),
  identitySignaturePrivateKey: privateOkpJwk(
    "Ed25519",
    "self-signature",
    "self-signature-private"
  ),
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 9,
  signedPrekeyPublicKey: publicOkpJwk("X25519", "self-signed"),
  signedPrekeyPrivateKey: privateOkpJwk("X25519", "self-signed", "self-signed-private"),
  signedPrekeySignature: "c2ln",
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekeys: [],
  createdAt: "2026-04-09T10:00:00.000Z",
  signedPrekeyCreatedAt: "2026-04-09T10:00:00.000Z",
};

const readyLocalDeviceMaterial = {
  ...localDeviceMaterial,
  signedPrekeyCreatedAt: new Date().toISOString(),
  oneTimePrekeys: [
    {
      keyId: 101,
      publicKey: publicOkpJwk("X25519", "otp-101"),
      privateKey: privateOkpJwk("X25519", "otp-101", "otp-private-101"),
    },
    {
      keyId: 102,
      publicKey: publicOkpJwk("X25519", "otp-102"),
      privateKey: privateOkpJwk("X25519", "otp-102", "otp-private-102"),
    },
    {
      keyId: 103,
      publicKey: publicOkpJwk("X25519", "otp-103"),
      privateKey: privateOkpJwk("X25519", "otp-103", "otp-private-103"),
    },
    {
      keyId: 104,
      publicKey: publicOkpJwk("X25519", "otp-104"),
      privateKey: privateOkpJwk("X25519", "otp-104", "otp-private-104"),
    },
  ],
};

const currentSession = {
  token: "token",
  tokenExpiresAt: "2026-04-10T10:00:00.000Z",
  sessionId: "session-id",
  user: {
    id: USER_ID,
    username: "self",
    displayName: "Self User",
    profession: null,
    createdAt: "2026-04-09T10:00:00.000Z",
    avatarUrl: null,
    online: true,
  },
};

const currentRegisteredDevice = {
  deviceId: "self-device",
  deviceName: "Current device",
  identityKey: localDeviceMaterial.identityKey,
  identityKeyAlgorithm: localDeviceMaterial.identityKeyAlgorithm,
  identitySignatureKey: localDeviceMaterial.identitySignatureKey,
  identitySignatureKeyAlgorithm: localDeviceMaterial.identitySignatureKeyAlgorithm,
  signedPrekeyId: localDeviceMaterial.signedPrekeyId,
  signedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
  signedPrekeySignature: localDeviceMaterial.signedPrekeySignature,
  signedPrekeyAlgorithm: localDeviceMaterial.signedPrekeyAlgorithm,
  deviceVersion: "self-device-version-1",
  availableOneTimePrekeys: 8,
  registeredAt: localDeviceMaterial.createdAt,
  lastSeenAt: localDeviceMaterial.createdAt,
};

const siblingRegisteredDevice = {
  deviceId: "self-device-two",
  deviceName: "Sibling device",
  identityKey: publicOkpJwk("X25519", "self-agreement-two"),
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: publicOkpJwk("Ed25519", "self-signature-two"),
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 10,
  signedPrekeyPublicKey: publicOkpJwk("X25519", "self-signed-two"),
  signedPrekeySignature: "c2lnLXR3bw==",
  signedPrekeyAlgorithm: "X25519",
  deviceVersion: "self-device-version-2",
  availableOneTimePrekeys: 8,
  registeredAt: localDeviceMaterial.createdAt,
  lastSeenAt: localDeviceMaterial.createdAt,
};

const siblingOwnDeviceBundle = {
  userId: USER_ID,
  deviceId: siblingRegisteredDevice.deviceId,
  deviceName: siblingRegisteredDevice.deviceName,
  identityKey: siblingRegisteredDevice.identityKey,
  identityKeyAlgorithm: siblingRegisteredDevice.identityKeyAlgorithm,
  identitySignatureKey: siblingRegisteredDevice.identitySignatureKey,
  identitySignatureKeyAlgorithm: siblingRegisteredDevice.identitySignatureKeyAlgorithm,
  signedPrekeyId: siblingRegisteredDevice.signedPrekeyId,
  signedPrekeyPublicKey: siblingRegisteredDevice.signedPrekeyPublicKey,
  signedPrekeySignature: siblingRegisteredDevice.signedPrekeySignature,
  signedPrekeyAlgorithm: siblingRegisteredDevice.signedPrekeyAlgorithm,
  deviceVersion: "self-device-version-2",
  oneTimePrekey: null,
  registeredAt: siblingRegisteredDevice.registeredAt,
  lastSeenAt: siblingRegisteredDevice.lastSeenAt,
};

const siblingConsumableOwnDeviceBundle = {
  ...siblingOwnDeviceBundle,
  oneTimePrekey: {
    keyId: 13,
    publicKey: publicOkpJwk("X25519", "self-otp-two"),
  },
};

function bufferSourceToArrayBuffer(value: BufferSource): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

function bufferSourceToByteValues(value?: BufferSource): number[] | null {
  if (!value) {
    return null;
  }

  return Array.from(new Uint8Array(bufferSourceToArrayBuffer(value)));
}

function utf8ToBase64(value: string) {
  const bytes = testTextEncoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("e2ee hardening", () => {
  beforeEach(() => {
    clearUnlockedEncryptionState();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_SCHEMA_KEY, "5");
    vi.restoreAllMocks();
    vi.mocked(getOwnEncryptionRecoverySnapshot).mockRejectedValue(
      new ApiError("Recovery snapshot not found", 404)
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([]);
    vi.mocked(getOwnGroupHistoryKeys).mockResolvedValue([]);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);
    vi.mocked(upsertGroupHistoryKey).mockResolvedValue({
      historyKeyId: "history-key-id",
      createdAt: "2026-04-20T10:00:00.000Z",
    });
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

  it("restores an unlocked identity from same-browser persistent storage", () => {
    window.localStorage.setItem(
      AUTO_UNLOCKED_KEY,
      JSON.stringify({
        ...identity,
        createdAt: "2026-04-20T08:00:00.000Z",
      })
    );

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "{}")).toMatchObject(identity);
  });

  it("removes remembered identity remnants when the encryption state is cleared", () => {
    window.localStorage.setItem(
      AUTO_UNLOCKED_KEY,
      JSON.stringify({
        ...identity,
        createdAt: "2026-04-20T08:00:00.000Z",
      })
    );
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    clearUnlockedEncryptionState(USER_ID);

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTO_UNLOCKED_KEY)).toBeNull();
    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
  });

  it("previews device bundles without consuming one-time prekeys", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledWith("token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: false,
      requesterDeviceId: undefined,
    });
  });

  it("uses the device manifest endpoint for priming when a full manifest is available", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.mocked(resolveEncryptionDeviceManifest).mockResolvedValue({
      version: "manifest-version-1",
      fullSync: true,
      bundles: [deviceBundle],
      removedDeviceIds: [],
    });

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });

    expect(resolveEncryptionDeviceManifest).toHaveBeenCalledWith("token", [REMOTE_USER_ID], {
      knownVersion: undefined,
      knownDevices: undefined,
    });
    expect(resolveEncryptionDeviceBundles).not.toHaveBeenCalled();
  });

  it("merges manifest deltas for priming without falling back to legacy bundle resolve", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    const rotatedManifestBundle = {
      ...deviceBundle,
      signedPrekeyId: 8,
      signedPrekeyPublicKey: publicOkpJwk("X25519", "signed-prekey-rotated"),
      deviceVersion: "device-version-2",
    };
    vi.mocked(resolveEncryptionDeviceManifest)
      .mockResolvedValueOnce({
        version: "manifest-version-1",
        fullSync: true,
        bundles: [deviceBundle],
        removedDeviceIds: [],
      })
      .mockResolvedValueOnce({
        version: "manifest-version-2",
        fullSync: false,
        bundles: [rotatedManifestBundle],
        removedDeviceIds: [],
      });

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });
    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      forceRefresh: true,
    });

    expect(resolveEncryptionDeviceManifest).toHaveBeenNthCalledWith(2, "token", [REMOTE_USER_ID], {
      knownVersion: "manifest-version-1",
      knownDevices: [{ deviceId: "device-id", version: "device-version-1" }],
    });
    expect(resolveEncryptionDeviceBundles).not.toHaveBeenCalled();
  });

  it("normalizes public Ed25519 key_ops metadata when validating device bundles", async () => {
    const bundleWithEmptyVerifyOps = {
      ...deviceBundle,
      identitySignatureKey:
        '{"key_ops":[],"ext":true,"alg":"Ed25519","crv":"Ed25519","x":"signature","kty":"OKP"}',
    };
    const importKeySpy = vi
      .spyOn(window.crypto.subtle, "importKey")
      .mockImplementation(async (_format, keyData, _algorithm, _extractable, usages) => {
        const jwk = keyData as JsonWebKey;
        if (jwk.crv === "Ed25519") {
          expect(jwk.key_ops).toEqual(["verify"]);
          expect(usages).toEqual(["verify"]);
        }
        return {} as CryptoKey;
      });
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([bundleWithEmptyVerifyOps]);

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
      })
    ).resolves.toBeUndefined();
    expect(importKeySpy).toHaveBeenCalled();
  });

  it("treats invalid device bundle signatures during priming as identity mismatches", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(false);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
      })
    ).rejects.toMatchObject({
      message:
        "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      status: 409,
    });
    expect(window.sessionStorage.getItem(DEVICE_SESSION_KEY)).toBeNull();
  });

  it("rejects a stale recipient identity instead of re-pinning it during priming", async () => {
    const rotatedBundle = {
      ...deviceBundle,
      identityKey: '{"kty":"OKP","crv":"X25519","x":"agreement-rotated"}',
      identitySignatureKey: '{"kty":"OKP","crv":"Ed25519","x":"signature-rotated"}',
    };
    window.localStorage.setItem(
      PINNED_DEVICE_KEY,
      JSON.stringify({
        userId: REMOTE_USER_ID,
        deviceId: "device-id",
        identityFingerprint: "legacy-identity-fingerprint",
        identitySignatureFingerprint: "legacy-signature-fingerprint",
        signedPrekeyFingerprint: "legacy-signed-prekey-fingerprint",
        signedPrekeyId: 7,
        updatedAt: "2026-04-09T10:00:00.000Z",
      })
    );
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValueOnce([rotatedBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
      })
    ).rejects.toMatchObject({
      message:
        "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      status: 409,
    });

    expect(JSON.parse(window.localStorage.getItem(PINNED_DEVICE_KEY) ?? "{}")).toMatchObject({
      userId: REMOTE_USER_ID,
      deviceId: "device-id",
      signedPrekeyId: 7,
      identityFingerprint: "legacy-identity-fingerprint",
      identitySignatureFingerprint: "legacy-signature-fingerprint",
    });
  });

  it("bootstraps a hidden direct-chat device session only for unresolved devices", async () => {
    const importKeySpy = vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });

    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(1, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: false,
      deviceIds: undefined,
      requesterDeviceId: "self-device",
    });
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(2, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: true,
      deviceIds: ["device-id"],
      requesterDeviceId: "self-device",
    });
    expect(JSON.parse(window.sessionStorage.getItem(DEVICE_SESSION_KEY) ?? "{}")).toMatchObject({
      [`${REMOTE_USER_ID}:device-id`]: {
        peerUserId: REMOTE_USER_ID,
        peerDeviceId: "device-id",
        remoteSignedPrekeyId: 7,
      },
    });
    expect(importKeySpy).toHaveBeenCalled();
  });

  it("archives the previous current direct session when peer bootstrap metadata changes", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    const rotatedDeviceBundle = {
      ...deviceBundle,
      signedPrekeyId: 8,
      signedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"signed-prekey-rotated"}',
    };
    const consumableRotatedDeviceBundle = {
      ...rotatedDeviceBundle,
      oneTimePrekey: {
        keyId: 13,
        publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-rotated"}',
      },
    };
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([rotatedDeviceBundle])
      .mockResolvedValueOnce([consumableRotatedDeviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "stale-session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: deviceBundle.signedPrekeyId,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: 11,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"old-send-private","x":"old-send"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("old-root"),
          sendingChainKey: utf8ToBase64("old-send-chain"),
          receivingChainKey: utf8ToBase64("old-recv-chain"),
          sendingCounter: 1,
          receivingCounter: 0,
          cachedMessageKeys: {
            'send|{"kty":"OKP","crv":"X25519","x":"old-send"}|0': utf8ToBase64("old cached"),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });

    expect(JSON.parse(window.sessionStorage.getItem(DEVICE_SESSION_KEY) ?? "{}")).toMatchObject({
      [`${REMOTE_USER_ID}:device-id`]: {
        remoteSignedPrekeyId: 8,
      },
      [`${REMOTE_USER_ID}:device-id:archive:stale-session-record`]: {
        remoteSignedPrekeyId: 7,
      },
    });
  });

  it("reuses recently prepared device state for the same recipients", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });
    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(1, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: false,
      deviceIds: undefined,
      requesterDeviceId: "self-device",
    });
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(2, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: true,
      deviceIds: ["device-id"],
      requesterDeviceId: "self-device",
    });
  });

  it("reuses prepared device state for the first direct send after priming", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([
      currentRegisteredDevice,
      siblingRegisteredDevice,
    ]);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle, siblingConsumableOwnDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "message-id-after-prime",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:30:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });
    vi.mocked(resolveEncryptionDeviceBundles).mockClear();

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "secret hello after priming",
      [selfParticipant, participant],
      "client-message-id-after-prime",
      null,
      { currentUserId: USER_ID }
    );

    expect(resolveEncryptionDeviceBundles).not.toHaveBeenCalled();
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId ?? {})
        .sort()
    ).toEqual(["device-id", "self-device", "self-device-two"]);
  });

  it("cold-send priming resolves remote manifests separately from own sibling devices", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([
      currentRegisteredDevice,
      siblingRegisteredDevice,
    ]);
    vi.mocked(resolveEncryptionDeviceManifest).mockResolvedValue({
      version: "manifest-version-cold-send",
      fullSync: true,
      bundles: [deviceBundle],
      removedDeviceIds: [],
    });
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([
      consumableDeviceBundle,
      siblingConsumableOwnDeviceBundle,
    ]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "cold-send-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:30:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "cold send manifest split",
      [selfParticipant, participant],
      "client-cold-send-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(resolveEncryptionDeviceManifest).toHaveBeenCalledWith("token", [REMOTE_USER_ID], {
      knownVersion: undefined,
      knownDevices: undefined,
    });
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(1);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledWith(
      "token",
      [REMOTE_USER_ID, USER_ID],
      {
        consumeOneTimePrekeys: true,
        deviceIds: ["device-id", "self-device-two"],
        requesterDeviceId: "self-device",
      }
    );
  });

  it("reuses prepared device state across auth session rotations for the same device recipients", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      session: {
        ...currentSession,
        sessionId: "session-one",
      },
    });
    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      session: {
        ...currentSession,
        sessionId: "session-two",
      },
    });

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(1, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: false,
      deviceIds: undefined,
      requesterDeviceId: "self-device",
    });
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(2, "token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: true,
      deviceIds: ["device-id"],
      requesterDeviceId: "self-device",
    });
  });

  it("reuses pinned device versions during forced priming refreshes", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const verifySpy = vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([
      currentRegisteredDevice,
      siblingRegisteredDevice,
    ]);
    vi.mocked(resolveEncryptionDeviceManifest).mockResolvedValue({
      version: "manifest-version-fast-path",
      fullSync: true,
      bundles: [deviceBundle],
      removedDeviceIds: [],
    });
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      forceRefresh: true,
    });
    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      forceRefresh: true,
    });

    expect(verifySpy).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceManifest).toHaveBeenCalledTimes(2);
    expect(listOwnEncryptionDevices).toHaveBeenCalledTimes(2);
  });

  it("bypasses cached preparation when recipient trust is refreshed", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });
    clearPinnedEncryptionIdentity(REMOTE_USER_ID);
    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
      forceRefresh: true,
    });

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(3);
    expect(resolveEncryptionDeviceBundles).toHaveBeenLastCalledWith("token", [REMOTE_USER_ID], {
      consumeOneTimePrekeys: false,
      requesterDeviceId: "self-device",
    });
  });

  it("drops incompatible legacy transport state before priming on a new storage schema", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.localStorage.setItem(STORAGE_SCHEMA_KEY, "1");
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "legacy-session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: "legacy-own-material",
          remoteIdentityKey: "legacy-identity",
          remoteIdentitySignatureKey: "legacy-signature",
          remoteSignedPrekeyId: 999,
          remoteSignedPrekeyPublicKey: "legacy-signed-prekey",
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: "legacy-ephemeral",
          sendingRatchetPublicKey: "legacy-send",
          sendingRatchetPrivateKey: "legacy-send-private",
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: "legacy-root",
          sendingChainKey: "legacy-send-chain",
          receivingChainKey: "legacy-recv-chain",
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        "legacy-chat": {
          chatId: "legacy-chat",
          ownMaterialId: "legacy-own-material",
          senderDeviceId: "legacy-device",
          senderKeyId: "legacy-sender-key",
          chainKey: "legacy-chain-key",
          nextMessageCounter: 4,
          createdAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );
    window.localStorage.setItem(
      PINNED_DEVICE_KEY,
      JSON.stringify({
        userId: REMOTE_USER_ID,
        deviceId: "device-id",
        identityFingerprint: "legacy-identity-fingerprint",
        identitySignatureFingerprint: "legacy-signature-fingerprint",
        signedPrekeyFingerprint: "legacy-signed-prekey-fingerprint",
        signedPrekeyId: 999,
        updatedAt: "2026-04-09T10:00:00.000Z",
      })
    );
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([]);
    vi.mocked(upsertOwnEncryptionDevice).mockResolvedValue(currentRegisteredDevice);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle]);

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
        session: currentSession,
      })
    ).resolves.toBeUndefined();

    expect(window.localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe("5");
    expect(window.sessionStorage.getItem(GROUP_SENDER_CHAIN_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(PINNED_DEVICE_KEY) ?? "{}")).toMatchObject({
      userId: REMOTE_USER_ID,
      deviceId: "device-id",
      signedPrekeyId: 7,
    });
  });

  it("restores a usable local device binding before priming when the stored deviceId is missing", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);
    vi.mocked(upsertOwnEncryptionDevice).mockResolvedValue(currentRegisteredDevice);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...readyLocalDeviceMaterial,
        deviceId: null,
      })
    );

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
        session: currentSession,
      })
    ).resolves.toBeUndefined();

    expect(vi.mocked(listOwnEncryptionDevices)).toHaveBeenCalledWith("token");
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}")
    ).toMatchObject({
      deviceId: "self-device",
      materialId: expect.any(String),
    });
  });

  it("verifies a locally usable device against the server before priming in a fresh runtime", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([]);
    vi.mocked(upsertOwnEncryptionDevice).mockResolvedValue(currentRegisteredDevice);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
        session: currentSession,
      })
    ).resolves.toBeUndefined();

    expect(vi.mocked(listOwnEncryptionDevices)).toHaveBeenCalledWith("token");
    expect(vi.mocked(upsertOwnEncryptionDevice)).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh registered device sync without repeatedly hitting devices me", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);

    await syncEncryptionDeviceState(currentSession);
    await syncEncryptionDeviceState(currentSession);

    expect(vi.mocked(listOwnEncryptionDevices)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertOwnEncryptionDevice)).not.toHaveBeenCalled();
  });

  it("merges remote recovery history into sync uploads when the local archive is missing", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    window.localStorage.setItem(
      REMEMBERED_KEY,
      JSON.stringify({
        salt: utf8ToBase64("remembered-salt"),
        iv: utf8ToBase64("remembered-iv"),
        ciphertext: utf8ToBase64(JSON.stringify(identity)),
        createdAt: "2026-04-25T13:04:50.000Z",
      })
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);

    const archivedRecord = {
      messageId: "remote-sync-preserved-message-id",
      chatId: "chat-id",
      createdAt: "2026-04-25T13:04:55.000Z",
      editedAt: null,
      salt: utf8ToBase64("archive-salt"),
      iv: utf8ToBase64("archive-iv"),
      ciphertext: utf8ToBase64(
        JSON.stringify({
          content: "preserved remote archive",
        })
      ),
      archivedAt: "2026-04-25T13:05:00.000Z",
    };

    const remoteSnapshot = {
      snapshotPayloadJson: JSON.stringify({
        salt: utf8ToBase64("snapshot-salt"),
        iv: utf8ToBase64("snapshot-iv"),
        ciphertext: utf8ToBase64(
          JSON.stringify({
            version: 1,
            archivedMessages: [archivedRecord],
          })
        ),
        createdAt: "2026-04-25T13:05:10.000Z",
      }),
      wrappedIdentityRecordJson: JSON.stringify({
        salt: utf8ToBase64("identity-salt"),
        iv: utf8ToBase64("identity-iv"),
        ciphertext: utf8ToBase64(JSON.stringify(identity)),
        createdAt: "2026-04-25T13:05:11.000Z",
      }),
      createdAt: "2026-04-25T13:05:12.000Z",
      updatedAt: "2026-04-25T13:05:13.000Z",
    };

    vi.mocked(getOwnEncryptionRecoverySnapshot).mockResolvedValue(remoteSnapshot);
    vi.mocked(upsertOwnEncryptionRecoverySnapshot).mockResolvedValue(remoteSnapshot);

    await syncEncryptionDeviceState(currentSession);

    const uploadedSnapshotJson = vi.mocked(upsertOwnEncryptionRecoverySnapshot).mock.calls[0]?.[1]
      ?.snapshotPayloadJson;
    expect(uploadedSnapshotJson).toBeTruthy();

    const uploadedSnapshot = JSON.parse(uploadedSnapshotJson ?? "{}") as { ciphertext?: string };
    const uploadedPayload = JSON.parse(window.atob(uploadedSnapshot.ciphertext ?? "")) as {
      archivedMessages: typeof archivedRecord[];
    };
    expect(uploadedPayload.archivedMessages).toEqual([archivedRecord]);

    await expect(
      hydrateChatMessage(
        {
          id: "remote-sync-preserved-message-id",
          chatId: "chat-id",
          sender: selfParticipant,
          createdAt: "2026-04-25T13:04:55.000Z",
          editedAt: null,
          status: null,
          clientMessageId: "remote-sync-preserved-client-id",
          replyTo: null,
          reactions: [],
          encryptedPayload: null,
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "preserved remote archive",
    });
  });

  it("keeps the current encryption device usable after auth session rotation without forcing a rebind", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    const nextSession = {
      ...currentSession,
      sessionId: "session-id-two",
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);
    await syncEncryptionDeviceState(nextSession);

    expect(vi.mocked(upsertOwnEncryptionDevice)).not.toHaveBeenCalled();
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}")
    ).toMatchObject({
      deviceId: "self-device",
      materialId: expect.any(String),
    });
  });

  it("re-registers the current encryption device before priming when stored private keys are unusable", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...readyLocalDeviceMaterial,
        signedPrekeyPrivateKey: "broken-private-key",
      })
    );
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([]);
    vi.mocked(upsertOwnEncryptionDevice).mockResolvedValue({
      ...currentRegisteredDevice,
      deviceId: "rebound-device",
    });
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
        session: currentSession,
      })
    ).resolves.toBeUndefined();

    expect(vi.mocked(upsertOwnEncryptionDevice)).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}")
    ).toMatchObject({
      deviceId: "rebound-device",
    });
  });

  it("reports missing recipient devices without the stale upgrade wording", async () => {
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);

    await expect(
      sendEncryptedMessage(
        "token",
        "chat-id",
        "secret hello",
        [selfParticipant, participant],
        "client-message-id",
        null,
        { currentUserId: USER_ID }
      )
    ).rejects.toMatchObject({
      message:
        "Encrypted chat is unavailable because some participants do not have an available encryption device yet",
      status: 409,
      details: ["Remote User"],
    });
  });

  it("treats untrusted recipient bundles as identity mismatches instead of missing devices", async () => {
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(false);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);

    await expect(
      sendEncryptedMessage(
        "token",
        "chat-id",
        "secret hello",
        [selfParticipant, participant],
        "client-message-id",
        null,
        { currentUserId: USER_ID }
      )
    ).rejects.toMatchObject({
      message:
        "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      status: 409,
    });
  });

  it("force-registers a fresh encryption device when the initial registration attempt leaves no usable local material", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([]);
    vi.mocked(upsertOwnEncryptionDevice)
      .mockRejectedValueOnce(new Error("temporary registration failure"))
      .mockResolvedValueOnce(currentRegisteredDevice);
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([]);

    await expect(
      primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
        currentUserId: USER_ID,
        session: currentSession,
      })
    ).resolves.toBeUndefined();

    expect(vi.mocked(upsertOwnEncryptionDevice)).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}")
    ).toMatchObject({
      deviceId: "self-device",
      materialId: expect.any(String),
    });
  });

  it("sends and decrypts direct messages with per-device envelopes", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:30:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "secret hello",
      [selfParticipant, participant],
      "client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(sendMessageRaw).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload).toMatchObject({
      scheme: "X3DH-DEVICE-AES-GCM",
      encryptedKeysByRecipientId: expect.objectContaining({
        "device-id": expect.any(String),
        "self-device": expect.any(String),
      }),
    });
    const firstRemoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientOneTimePrekeyId?: number | null };
    expect(firstRemoteEnvelope.recipientOneTimePrekeyId).toBe(11);

    const decrypted = await hydrateChatMessage(
      {
        id: "message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:30:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "client-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload: vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload ?? null,
      },
      USER_ID
    );

    expect(decrypted.content).toBe("secret hello");
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "second secret",
      [selfParticipant, participant],
      "client-message-id-2",
      null,
      { currentUserId: USER_ID }
    );

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);
    const secondRemoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientOneTimePrekeyId?: number | null };
    expect(secondRemoteEnvelope.recipientOneTimePrekeyId).toBeNull();
  });

  it("rebuilds a responder-established direct session before the first outgoing reply", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "reply-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "responder-session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "responder",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"peer-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"local-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"local-ratchet-private","x":"local-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"peer-ratchet"}',
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: true,
          rootKey: utf8ToBase64("12345678901234567890123456789012"),
          sendingChainKey: utf8ToBase64("abcdefghijklmnopqrstuvwx12345678"),
          receivingChainKey: utf8ToBase64("zyxwvutsrqponmlkjihgfedcba876543"),
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "reply over responder session",
      [selfParticipant, participant],
      "client-message-id-reply",
      null,
      { currentUserId: USER_ID }
    );

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.some(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toBe(true);
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);

    const remoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientSignedPrekeyId?: number };
    expect(remoteEnvelope.recipientSignedPrekeyId).toBe(deviceBundle.signedPrekeyId);
  });

  it("refreshes a remembered direct session before the first outgoing send after reload", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "initial direct secret",
      [selfParticipant, participant],
      "client-message-id-initial",
      null,
      { currentUserId: USER_ID }
    );

    expect(window.localStorage.getItem(`north-messenger:remembered-device-session-e2ee:${USER_ID}`)).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    vi.mocked(resolveEncryptionDeviceBundles).mockClear();
    vi.mocked(sendMessageRaw).mockClear();

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "restored direct secret",
      [selfParticipant, participant],
      "client-message-id-restored",
      null,
      { currentUserId: USER_ID }
    );

    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.some(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toBe(true);
    const restoredRemoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientOneTimePrekeyId?: number | null };
    expect(restoredRemoteEnvelope.recipientOneTimePrekeyId).toBe(11);
  });

  it("refreshes a session-storage direct session only once after a fresh runtime reload", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "initial direct secret",
      [selfParticipant, participant],
      "client-message-id-initial-runtime",
      null,
      { currentUserId: USER_ID }
    );

    const storedSessions = window.sessionStorage.getItem(DEVICE_SESSION_KEY);
    expect(storedSessions).not.toBeNull();

    clearUnlockedEncryptionState(USER_ID);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(DEVICE_SESSION_KEY, storedSessions ?? "{}");

    vi.mocked(resolveEncryptionDeviceBundles).mockReset();
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    vi.mocked(sendMessageRaw).mockClear();

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "restored session-storage secret",
      [selfParticipant, participant],
      "client-message-id-session-storage-restored",
      null,
      { currentUserId: USER_ID }
    );

    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.some(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toBe(true);
    const restoredRemoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientOneTimePrekeyId?: number | null };
    expect(restoredRemoteEnvelope.recipientOneTimePrekeyId).toBe(11);

    vi.mocked(resolveEncryptionDeviceBundles).mockClear();
    vi.mocked(sendMessageRaw).mockClear();

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "same runtime follow-up secret",
      [selfParticipant, participant],
      "client-message-id-session-storage-follow-up",
      null,
      { currentUserId: USER_ID }
    );

    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.some(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toBe(false);
  });

  it("rebuilds a responder-established direct session when the remote signed prekey rotated", async () => {
    const rotatedDeviceBundle = {
      ...deviceBundle,
      signedPrekeyId: 8,
      signedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"signed-prekey-rotated"}',
    };
    const rotatedConsumableDeviceBundle = {
      ...rotatedDeviceBundle,
      oneTimePrekey: {
        keyId: 11,
        publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-rotated"}',
      },
    };
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([rotatedDeviceBundle])
      .mockResolvedValueOnce([rotatedConsumableDeviceBundle])
      .mockResolvedValueOnce([rotatedDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "reply-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "responder-session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "responder",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: rotatedDeviceBundle.identityKey,
          remoteIdentitySignatureKey: rotatedDeviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 7,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"peer-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"local-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"local-ratchet-private","x":"local-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"peer-ratchet"}',
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: true,
          rootKey: utf8ToBase64("12345678901234567890123456789012"),
          sendingChainKey: utf8ToBase64("abcdefghijklmnopqrstuvwx12345678"),
          receivingChainKey: utf8ToBase64("zyxwvutsrqponmlkjihgfedcba876543"),
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "reply after remote prekey rotation",
      [selfParticipant, participant],
      "client-message-id-rotated-reply",
      null,
      { currentUserId: USER_ID }
    );

    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.some(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toBe(true);
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);

    const remoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientSignedPrekeyId?: number; recipientOneTimePrekeyId?: number | null };
    expect(remoteEnvelope.recipientSignedPrekeyId).toBe(8);
  });

  it("imports X25519 public device bundles without deriveBits key usage", async () => {
    const importKeySpy = vi
      .spyOn(window.crypto.subtle, "importKey")
      .mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:30:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "secret hello",
      [selfParticipant, participant],
      "client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(importKeySpy).toHaveBeenCalledWith(
      "jwk",
      JSON.parse(deviceBundle.identityKey),
      { name: "X25519" },
      false,
      []
    );
    expect(importKeySpy).toHaveBeenCalledWith(
      "jwk",
      JSON.parse(deviceBundle.signedPrekeyPublicKey),
      { name: "X25519" },
      false,
      []
    );
  });

  it("rebuilds direct device sessions when the backend rejects a stale bootstrap prekey", async () => {
    const retriedConsumableDeviceBundle = {
      ...consumableDeviceBundle,
      oneTimePrekey: {
        keyId: 12,
        publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-retry"}',
      },
    };
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([retriedConsumableDeviceBundle]);
    vi.mocked(sendMessageRaw)
      .mockRejectedValueOnce(
        new ApiError("Encrypted device envelope recipient one-time prekey is invalid", 400)
      )
      .mockImplementationOnce(async (_token, chatId, request) => ({
        id: "message-id",
        chatId,
        sender: selfParticipant,
        createdAt: "2026-04-09T10:30:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: request.clientMessageId ?? null,
        replyTo: null,
        reactions: [],
        encryptedPayload: request.encryptedPayload,
      }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await expect(
      sendEncryptedMessage(
        "token",
        "chat-id",
        "secret hello",
        [selfParticipant, participant],
        "client-message-id",
        null,
        { currentUserId: USER_ID }
      )
    ).resolves.toMatchObject({
      id: "message-id",
      clientMessageId: "client-message-id",
    });

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(4);

    const firstRemoteEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "device-id"
      ] ?? "{}"
    ) as { recipientOneTimePrekeyId?: number | null };
    expect(firstRemoteEnvelope.recipientOneTimePrekeyId).toBe(11);

    expect(
      vi.mocked(resolveEncryptionDeviceBundles).mock.calls.filter(
        ([, , request]) => request?.consumeOneTimePrekeys === true
      )
    ).toHaveLength(2);
  });

  it("re-registers the local encryption device when the backend rejects the sender device", async () => {
    const retriedConsumableDeviceBundle = {
      ...consumableDeviceBundle,
      oneTimePrekey: {
        keyId: 12,
        publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-retry"}',
      },
    };
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);
    vi.mocked(upsertOwnEncryptionDevice).mockResolvedValue(currentRegisteredDevice);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([retriedConsumableDeviceBundle]);
    vi.mocked(sendMessageRaw)
      .mockRejectedValueOnce(new ApiError("Encrypted device envelope sender device is invalid", 400))
      .mockImplementationOnce(async (_token, chatId, request) => ({
        id: "message-id",
        chatId,
        sender: selfParticipant,
        createdAt: "2026-04-09T10:30:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: request.clientMessageId ?? null,
        replyTo: null,
        reactions: [],
        encryptedPayload: request.encryptedPayload,
      }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await expect(
      sendEncryptedMessage(
        "token",
        "chat-id",
        "secret hello",
        [selfParticipant, participant],
        "client-message-id",
        null,
        { currentUserId: USER_ID, session: currentSession }
      )
    ).resolves.toMatchObject({
      id: "message-id",
      clientMessageId: "client-message-id",
    });

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);
    expect(upsertOwnEncryptionDevice).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(4);
    expect(JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}")).toMatchObject({
      deviceId: "self-device",
      materialId: expect.any(String),
    });

    const retriedSelfEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.encryptedKeysByRecipientId[
        "self-device"
      ] ?? "{}"
    ) as { senderDeviceId?: string | null; recipientDeviceId?: string | null };
    expect(retriedSelfEnvelope.senderDeviceId).toBe("self-device");
    expect(retriedSelfEnvelope.recipientDeviceId).toBe("self-device");
  });

  it("keeps a confirmed own message readable even if its echoed direct envelope metadata is later tampered", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(async (algorithm, _key, data) => {
      const payload = {
        aad: bufferSourceToByteValues(
          (algorithm as AesGcmParams & { additionalData?: BufferSource }).additionalData
        ),
        plaintext: bufferSourceToByteValues(data),
      };
      return testTextEncoder.encode(JSON.stringify(payload)).buffer;
    });
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(async (algorithm, _key, data) => {
      const payload = JSON.parse(
        testTextDecoder.decode(bufferSourceToArrayBuffer(data))
      ) as {
        aad: number[] | null;
        plaintext: number[];
      };
      const actualAad = bufferSourceToByteValues(
        (algorithm as AesGcmParams & { additionalData?: BufferSource }).additionalData
      );
      if (JSON.stringify(payload.aad) !== JSON.stringify(actualAad)) {
        throw new DOMException("AAD mismatch", "OperationError");
      }

      return Uint8Array.from(payload.plaintext).buffer;
    });
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "tampered-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:40:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "integrity protected",
      [selfParticipant, participant],
      "tampered-client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    const encryptedPayload = structuredClone(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload
    );
    const selfEnvelope = JSON.parse(
      encryptedPayload?.encryptedKeysByRecipientId["self-device"] ?? "{}"
    ) as Record<string, unknown>;
    selfEnvelope.recipientSignedPrekeyId = 999;
    encryptedPayload.encryptedKeysByRecipientId["self-device"] = JSON.stringify(selfEnvelope);

    const decrypted = await hydrateChatMessage(
      {
        id: "tampered-message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:40:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "tampered-client-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload,
      },
      USER_ID
    );

    expect(decrypted.content).toBe("integrity protected");
  });

  it("consumes the referenced local one-time prekey after responder bootstrap", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    const responderMaterial = {
      ...localDeviceMaterial,
      oneTimePrekeys: [
        {
          keyId: 21,
          publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
          privateKey:
            '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
        },
      ],
    };
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(responderMaterial));

    const decrypted = await hydrateChatMessage(
      {
        id: "incoming-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:50:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: 21,
              messageCounter: 0,
              ciphertext: utf8ToBase64("hello from remote"),
              iv: utf8ToBase64("123456789012"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(decrypted.content).toBe("hello from remote");
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}").oneTimePrekeys
    ).toEqual([]);
  });

  it("decrypts bootstrap messages that arrive after signed-prekey rotation using retained prekeys", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    const retiredAt = new Date(Date.now() - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const rotatedResponderMaterial = {
      ...localDeviceMaterial,
      signedPrekeyId: 10,
      signedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"signed-current"}',
      signedPrekeyPrivateKey:
        '{"kty":"OKP","crv":"X25519","d":"signed-current-private","x":"signed-current"}',
      oneTimePrekeys: [],
      retiredSignedPrekeys: [
        {
          signedPrekeyId: 9,
          signedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          signedPrekeyPrivateKey: localDeviceMaterial.signedPrekeyPrivateKey,
          signedPrekeyAlgorithm: localDeviceMaterial.signedPrekeyAlgorithm,
          retiredAt,
          expiresAt,
        },
      ],
      retiredOneTimePrekeys: [
        {
          keyId: 21,
          publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
          privateKey:
            '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          retiredAt,
          expiresAt,
        },
      ],
    };
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(rotatedResponderMaterial));

    const decrypted = await hydrateChatMessage(
      {
        id: "incoming-rotated-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T11:05:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
              recipientSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
              recipientOneTimePrekeyId: 21,
              messageCounter: 0,
              ciphertext: utf8ToBase64("hello after rotation"),
              iv: utf8ToBase64("123456789012"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(decrypted.content).toBe("hello after rotation");
    expect(
      JSON.parse(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY) ?? "{}").retiredOneTimePrekeys
    ).toEqual([]);
  });

  it("restores incoming direct message history after a fresh runtime from remembered device state", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...localDeviceMaterial,
        oneTimePrekeys: [
          {
            keyId: 21,
            publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          },
        ],
      })
    );

    const incomingMessages: ApiChatMessage[] = [
      {
        id: "incoming-message-id-1",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:50:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: 21,
              messageCounter: 0,
              ciphertext: utf8ToBase64("hello from remote 1"),
              iv: utf8ToBase64("123456789012"),
            }),
          },
        },
      },
      {
        id: "incoming-message-id-2",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:50:01.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 1,
              ciphertext: utf8ToBase64("hello from remote 2"),
              iv: utf8ToBase64("123456789013"),
            }),
          },
        },
      },
    ];

    await expect(hydrateChatMessage(incomingMessages[0], USER_ID)).resolves.toMatchObject({
      content: "hello from remote 1",
    });
    await expect(hydrateChatMessage(incomingMessages[1], USER_ID)).resolves.toMatchObject({
      content: "hello from remote 2",
    });

    expect(window.localStorage.getItem(`north-messenger:remembered-device-e2ee:${USER_ID}`)).not.toBeNull();
    expect(window.localStorage.getItem(`north-messenger:remembered-device-session-e2ee:${USER_ID}`)).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);

    await expect(hydrateChatMessage(incomingMessages[0], USER_ID)).resolves.toMatchObject({
      content: "hello from remote 1",
    });
    await expect(hydrateChatMessage(incomingMessages[1], USER_ID)).resolves.toMatchObject({
      content: "hello from remote 2",
    });
  });

  it("falls back to the archived decrypted message when direct session state is gone", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...localDeviceMaterial,
        oneTimePrekeys: [
          {
            keyId: 21,
            publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          },
        ],
      })
    );

    const incomingMessage: ApiChatMessage = {
      id: "archived-incoming-message-id",
      chatId: "chat-id",
      sender: participant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "X3DH-DEVICE-AES-GCM",
        encryptedKeysByRecipientId: {
          "self-device": JSON.stringify({
            aadVersion: 1,
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            recipientDeviceId: "self-device",
            senderIdentityKey: deviceBundle.identityKey,
            senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
            initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
            ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
            recipientSignedPrekeyId: 9,
            recipientOneTimePrekeyId: 21,
            messageCounter: 0,
            ciphertext: utf8ToBase64("archived fallback"),
            iv: utf8ToBase64("123456789012"),
          }),
        },
      },
    };

    await expect(hydrateChatMessage(incomingMessage, USER_ID)).resolves.toMatchObject({
      content: "archived fallback",
    });

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    window.localStorage.removeItem(`north-messenger:remembered-device-e2ee:${USER_ID}`);
    window.localStorage.removeItem(`north-messenger:remembered-device-session-e2ee:${USER_ID}`);

    await expect(hydrateChatMessage(incomingMessage, USER_ID)).resolves.toMatchObject({
      content: "archived fallback",
    });
  });

  it("refuses to silently create a fresh encryption identity when the account already has server devices", async () => {
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);

    await expect(ensureEncryptionReady(currentSession, "password")).rejects.toMatchObject({
      message:
        "Encrypted chats already exist for this account, but this device could not restore their keys",
      status: 409,
    });

    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(DEVICE_MATERIAL_KEY)).toBeNull();
  });

  it("restores archived history from the remote recovery snapshot on a fresh unlock", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);

    const archivedRecord = {
      messageId: "remote-recovery-message-id",
      chatId: "chat-id",
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      salt: utf8ToBase64("archive-salt"),
      iv: utf8ToBase64("archive-iv"),
      ciphertext: utf8ToBase64(
        JSON.stringify({
          content: "restored from remote snapshot",
        })
      ),
      archivedAt: "2026-04-09T10:31:05.000Z",
    };

    const remoteSnapshot = {
      snapshotPayloadJson: JSON.stringify({
        salt: utf8ToBase64("snapshot-salt"),
        iv: utf8ToBase64("snapshot-iv"),
        ciphertext: utf8ToBase64(
          JSON.stringify({
            version: 1,
            archivedMessages: [archivedRecord],
          })
        ),
        createdAt: "2026-04-09T10:31:10.000Z",
      }),
      wrappedIdentityRecordJson: JSON.stringify({
        salt: utf8ToBase64("identity-salt"),
        iv: utf8ToBase64("identity-iv"),
        ciphertext: utf8ToBase64(JSON.stringify(identity)),
        createdAt: "2026-04-09T10:31:11.000Z",
      }),
      createdAt: "2026-04-09T10:31:12.000Z",
      updatedAt: "2026-04-09T10:31:13.000Z",
    };

    vi.mocked(getOwnEncryptionRecoverySnapshot).mockResolvedValue(remoteSnapshot);
    vi.mocked(upsertOwnEncryptionRecoverySnapshot).mockResolvedValue(remoteSnapshot);

    await expect(ensureEncryptionReady(currentSession, "password")).resolves.toBeUndefined();

    expect(window.localStorage.getItem(REMEMBERED_KEY)).not.toBeNull();
    expect(vi.mocked(getOwnEncryptionRecoverySnapshot)).toHaveBeenCalledWith("token");
    expect(vi.mocked(upsertOwnEncryptionRecoverySnapshot)).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        wrappedIdentityRecordJson: remoteSnapshot.wrappedIdentityRecordJson,
      })
    );

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    window.localStorage.removeItem(`north-messenger:remembered-device-e2ee:${USER_ID}`);
    window.localStorage.removeItem(`north-messenger:remembered-device-session-e2ee:${USER_ID}`);

    await expect(
      hydrateChatMessage(
        {
          id: "remote-recovery-message-id",
          chatId: "chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:31:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ephemeral"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: 21,
                messageCounter: 0,
                ciphertext: utf8ToBase64("restored fallback"),
                iv: utf8ToBase64("123456789012"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "restored from remote snapshot",
    });
  });

  it("refreshes archived direct history from the remote recovery snapshot when local self-session keys are gone", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(readyLocalDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${USER_ID}:self-device`]: {
          sessionId: "self-current-session",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          ownMaterialId: readyLocalDeviceMaterial.materialId,
          remoteIdentityKey: readyLocalDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: readyLocalDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: readyLocalDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: readyLocalDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-self-ratchet-private","x":"current-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 2,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-10T10:00:00.000Z",
        },
      })
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([currentRegisteredDevice]);

    await primeEncryptedMessageRecipients("token", [selfParticipant], {
      currentUserId: USER_ID,
      session: currentSession,
    });

    const archivedRecord = {
      messageId: "remote-refresh-message-id",
      chatId: "chat-id",
      createdAt: "2026-04-25T09:41:00.000Z",
      editedAt: null,
      salt: utf8ToBase64("archive-salt"),
      iv: utf8ToBase64("archive-iv"),
      ciphertext: utf8ToBase64(
        JSON.stringify({
          content: "restored after remote archive refresh",
        })
      ),
      archivedAt: "2026-04-25T09:41:05.000Z",
    };

    vi.mocked(getOwnEncryptionRecoverySnapshot).mockResolvedValue({
      snapshotPayloadJson: JSON.stringify({
        salt: utf8ToBase64("snapshot-salt"),
        iv: utf8ToBase64("snapshot-iv"),
        ciphertext: utf8ToBase64(
          JSON.stringify({
            version: 1,
            archivedMessages: [archivedRecord],
          })
        ),
        createdAt: "2026-04-25T09:41:10.000Z",
      }),
      wrappedIdentityRecordJson: JSON.stringify({
        salt: utf8ToBase64("identity-salt"),
        iv: utf8ToBase64("identity-iv"),
        ciphertext: utf8ToBase64(JSON.stringify(identity)),
        createdAt: "2026-04-25T09:41:11.000Z",
      }),
      createdAt: "2026-04-25T09:41:12.000Z",
      updatedAt: "2026-04-25T09:41:13.000Z",
    });

    const message = {
      id: "remote-refresh-message-id",
      chatId: "chat-id",
      sender: selfParticipant,
      createdAt: "2026-04-25T09:41:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "remote-refresh-client-id",
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "X3DH-DEVICE-AES-GCM",
        encryptedKeysByRecipientId: {
          "self-device": JSON.stringify({
            aadVersion: 1,
            senderUserId: USER_ID,
            senderDeviceId: "self-device",
            recipientDeviceId: "self-device",
            senderIdentityKey: readyLocalDeviceMaterial.identityKey,
            senderIdentitySignatureKey: readyLocalDeviceMaterial.identitySignatureKey,
            initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
            ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}',
            recipientSignedPrekeyId: readyLocalDeviceMaterial.signedPrekeyId,
            recipientOneTimePrekeyId: null,
            messageCounter: 0,
            ciphertext: utf8ToBase64("payload no longer decryptable locally"),
            iv: utf8ToBase64("selfarchiv12"),
          }),
        },
      },
    } satisfies ApiChatMessage;

    await expect(hydrateChatMessage(message, USER_ID)).resolves.toMatchObject({
      content: "restored after remote archive refresh",
    });
    await expect(hydrateChatMessage(message, USER_ID)).resolves.toMatchObject({
      content: "restored after remote archive refresh",
    });
    expect(getOwnEncryptionRecoverySnapshot).toHaveBeenCalledTimes(1);
    expect(getOwnEncryptionRecoverySnapshot).toHaveBeenCalledWith("token");
  });

  it("silently re-establishes an inbound responder session when bootstrap metadata changes", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "stale-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: "material-id",
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 3,
          remoteSignedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"stale-signed"}',
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"stale-ephemeral"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"local-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"local-send-private","x":"local-send"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("12345678901234567890123456789012"),
          sendingChainKey: utf8ToBase64("abcdefghijklmnopqrstuvwx12345678"),
          receivingChainKey: utf8ToBase64("zyxwvutsrqponmlkjihgfedcba876543"),
          sendingCounter: 4,
          receivingCounter: 4,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const decrypted = await hydrateChatMessage(
      {
        id: "rebootstrap-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:55:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ratchet"}',
              recipientSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
              recipientOneTimePrekeyId: null,
              messageCounter: 0,
              ciphertext: utf8ToBase64("re-established hello"),
              iv: utf8ToBase64("abcdefghijkl"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(decrypted.content).toBe("re-established hello");
    expect(JSON.parse(window.sessionStorage.getItem(DEVICE_SESSION_KEY) ?? "{}")).toMatchObject({
      [`${REMOTE_USER_ID}:device-id`]: {
        remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
        initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ephemeral"}',
      },
    });
  });

  it("drops stale device sessions from a previous local login and re-establishes silently", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "stale-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: "old-material-id",
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 7,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"stale-ephemeral"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"local-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"local-send-private","x":"local-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("12345678901234567890123456789012"),
          sendingChainKey: utf8ToBase64("abcdefghijklmnopqrstuvwx12345678"),
          receivingChainKey: utf8ToBase64("zyxwvutsrqponmlkjihgfedcba876543"),
          sendingCounter: 2,
          receivingCounter: 2,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const decrypted = await hydrateChatMessage(
      {
        id: "reestablish-after-login-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:58:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ephemeral"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 0,
              ciphertext: utf8ToBase64("hello after relogin"),
              iv: utf8ToBase64("sessionfresh1"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(decrypted.content).toBe("hello after relogin");
    expect(JSON.parse(window.sessionStorage.getItem(DEVICE_SESSION_KEY) ?? "{}")).toMatchObject({
      [`${REMOTE_USER_ID}:device-id`]: {
        ownMaterialId: "material-id",
        initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"fresh-ephemeral"}',
      },
    });
  });

  it("decrypts late incoming messages from a previous remote ratchet chain", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: deviceBundle.signedPrekeyId,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"self-ratchet-private","x":"self-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("current-recv"),
          receivingChains: {
            '{"kty":"OKP","crv":"X25519","x":"old-remote-ratchet"}': {
              chainKey: utf8ToBase64("old-recv"),
              counter: 0,
            },
          },
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "late-old-ratchet-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-10T10:05:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-remote-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 0,
              ciphertext: utf8ToBase64("late old ratchet"),
              iv: utf8ToBase64("oldratchet12"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("late old ratchet");
  });

  it("decrypts own sent messages from an older local ratchet chain", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${USER_ID}:self-device`]: {
          sessionId: "self-session-record",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-self-ratchet-private","x":"current-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 1,
          receivingCounter: 0,
          cachedMessageKeys: {
            'send|{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}|0': utf8ToBase64("own old message"),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "self-old-ratchet-message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-10T10:06:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "self-old-ratchet-client-id",
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: USER_ID,
              senderDeviceId: "self-device",
              recipientDeviceId: "self-device",
              senderIdentityKey: localDeviceMaterial.identityKey,
              senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 0,
              ciphertext: utf8ToBase64("own old message"),
              iv: utf8ToBase64("selfratchet1"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("own old message");
  });

  it("hydrates direct history from archived session epochs after newer sessions replace the current record", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "current-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 9,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: 21,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-send-private","x":"current-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("current-root"),
          sendingChainKey: utf8ToBase64("current-send-chain"),
          receivingChainKey: utf8ToBase64("current-recv-chain"),
          sendingCounter: 1,
          receivingCounter: 1,
          cachedMessageKeys: {},
          establishedAt: "2026-04-10T10:00:00.000Z",
        },
        [`${REMOTE_USER_ID}:device-id:archive:older-remote-session`]: {
          sessionId: "older-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "responder",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 9,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: 21,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"older-send-private","x":"older-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("older-root"),
          sendingChainKey: utf8ToBase64("older-send-chain"),
          receivingChainKey: utf8ToBase64("older-recv-chain"),
          sendingCounter: 0,
          receivingCounter: 1,
          cachedMessageKeys: {
            'recv|{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}|0': utf8ToBase64(
              "archived incoming"
            ),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
        [`${USER_ID}:self-device`]: {
          sessionId: "current-self-session",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-self-ratchet-private","x":"current-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("current-self-root"),
          sendingChainKey: utf8ToBase64("current-self-send"),
          receivingChainKey: utf8ToBase64("current-self-recv"),
          sendingCounter: 1,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-10T10:00:00.000Z",
        },
        [`${USER_ID}:self-device:archive:older-self-session`]: {
          sessionId: "older-self-session",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-self-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"older-self-ratchet-private","x":"older-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("older-self-root"),
          sendingChainKey: utf8ToBase64("older-self-send"),
          receivingChainKey: utf8ToBase64("older-self-recv"),
          sendingCounter: 1,
          receivingCounter: 0,
          cachedMessageKeys: {
            'send|{"kty":"OKP","crv":"X25519","x":"older-self-ratchet"}|0': utf8ToBase64(
              "archived own"
            ),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    await expect(
      hydrateChatMessage(
        {
          id: "archived-incoming-message-id",
          chatId: "chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:05:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: 21,
                messageCounter: 0,
                ciphertext: utf8ToBase64("archived incoming"),
                iv: utf8ToBase64("archivedin12"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "archived incoming",
    });

    await expect(
      hydrateChatMessage(
        {
          id: "archived-own-message-id",
          chatId: "chat-id",
          sender: selfParticipant,
          createdAt: "2026-04-09T10:06:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: "archived-own-client-id",
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: USER_ID,
                senderDeviceId: "self-device",
                recipientDeviceId: "self-device",
                senderIdentityKey: localDeviceMaterial.identityKey,
                senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
                initiatorEphemeralPublicKey:
                  '{"kty":"OKP","crv":"X25519","x":"older-self-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-self-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 0,
                ciphertext: utf8ToBase64("archived own"),
                iv: utf8ToBase64("archivedown1"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "archived own",
    });
  });

  it("hydrates group history from archived direct session epochs after newer sessions replace the current record", async () => {
    const decoder = new TextDecoder();
    vi.spyOn(window.crypto.subtle, "importKey").mockImplementation(
      async (format, keyData) => {
        if (format === "raw") {
          return {
            __raw: Array.from(new Uint8Array(bufferSourceToArrayBuffer(keyData as BufferSource))),
          } as unknown as CryptoKey;
        }
        return {} as CryptoKey;
      }
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(async (_algorithm, key, data) => {
      const rawKey = Uint8Array.from((key as CryptoKey & { __raw?: number[] }).__raw ?? []);
      const payload = decoder.decode(new Uint8Array(bufferSourceToArrayBuffer(data)));
      if (payload.includes('"senderKeyId":"older-group-sender-key"')) {
        if (decoder.decode(rawKey) !== "archived-distribution-key") {
          throw new Error("wrong direct session selected for archived group distribution");
        }
      }
      return bufferSourceToArrayBuffer(data);
    });
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "current-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 12,
          remoteSignedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"signed-prekey-current"}',
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-send-private","x":"current-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("current-root"),
          sendingChainKey: utf8ToBase64("current-send-chain"),
          receivingChainKey: utf8ToBase64("current-recv-chain"),
          sendingCounter: 1,
          receivingCounter: 1,
          cachedMessageKeys: {},
          establishedAt: "2026-04-10T10:00:00.000Z",
        },
        [`${REMOTE_USER_ID}:device-id:archive:older-remote-session`]: {
          sessionId: "older-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "responder",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 9,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: 21,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"older-send-private","x":"older-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("older-root"),
          sendingChainKey: utf8ToBase64("older-send-chain"),
          receivingChainKey: utf8ToBase64("older-recv-chain"),
          sendingCounter: 0,
          receivingCounter: 1,
          cachedMessageKeys: {
            'recv|{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}|0': utf8ToBase64(
              "archived-distribution-key"
            ),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        outboundChains: {},
        inboundChains: {},
      })
    );

    await expect(
      hydrateChatMessage(
        {
          id: "archived-group-history-message-id",
          chatId: "group-chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:05:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            sharedEnvelope: JSON.stringify({
              aadVersion: 1,
              chatId: "group-chat-id",
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              senderKeyId: "older-group-sender-key",
              messageCounter: 0,
              ciphertext: utf8ToBase64("archived group via archived direct session"),
              iv: utf8ToBase64("grouparchold1"),
              signature: utf8ToBase64("valid-signature"),
            }),
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"older-remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: 21,
                messageCounter: 0,
                ciphertext: utf8ToBase64(
                  JSON.stringify({
                    aadVersion: 1,
                    chatId: "group-chat-id",
                    senderUserId: REMOTE_USER_ID,
                    senderDeviceId: "device-id",
                    senderKeyId: "older-group-sender-key",
                    chainKey: utf8ToBase64("older-group-chain-key"),
                    messageCounter: 0,
                  })
                ),
                iv: utf8ToBase64("groupdistold1"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "archived group via archived direct session",
    });
  });

  it("hydrates group history from archived direct sessions tied to an older own material", async () => {
    const decoder = new TextDecoder();
    vi.spyOn(window.crypto.subtle, "importKey").mockImplementation(
      async (format, keyData) => {
        if (format === "raw") {
          return {
            __raw: Array.from(new Uint8Array(bufferSourceToArrayBuffer(keyData as BufferSource))),
          } as unknown as CryptoKey;
        }
        return {} as CryptoKey;
      }
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(async (_algorithm, key, data) => {
      const rawKey = Uint8Array.from((key as CryptoKey & { __raw?: number[] }).__raw ?? []);
      const payload = decoder.decode(new Uint8Array(bufferSourceToArrayBuffer(data)));
      if (payload.includes('"senderKeyId":"old-material-group-sender-key"')) {
        if (decoder.decode(rawKey) !== "old-material-distribution-key") {
          throw new Error("group history decrypt did not use the archived old-material direct session");
        }
      }
      return bufferSourceToArrayBuffer(data);
    });
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "current-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 12,
          remoteSignedPrekeyPublicKey: '{"kty":"OKP","crv":"X25519","x":"signed-prekey-current"}',
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-send-private","x":"current-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("current-root"),
          sendingChainKey: utf8ToBase64("current-send-chain"),
          receivingChainKey: utf8ToBase64("current-recv-chain"),
          sendingCounter: 1,
          receivingCounter: 1,
          cachedMessageKeys: {},
          establishedAt: "2026-04-10T10:00:00.000Z",
        },
        [`${REMOTE_USER_ID}:device-id:archive:old-material-remote-session`]: {
          sessionId: "old-material-remote-session",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          sessionOrigin: "responder",
          ownMaterialId: "retired-own-material-id",
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: 9,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: 31,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-material-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-material-send"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"old-material-send-private","x":"old-material-send"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-material-remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("old-material-root"),
          sendingChainKey: utf8ToBase64("old-material-send-chain"),
          receivingChainKey: utf8ToBase64("old-material-recv-chain"),
          sendingCounter: 0,
          receivingCounter: 1,
          cachedMessageKeys: {
            'recv|{"kty":"OKP","crv":"X25519","x":"old-material-remote-ratchet"}|0': utf8ToBase64(
              "old-material-distribution-key"
            ),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        outboundChains: {},
        inboundChains: {},
      })
    );

    await expect(
      hydrateChatMessage(
        {
          id: "old-material-group-history-message-id",
          chatId: "group-chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:05:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            sharedEnvelope: JSON.stringify({
              aadVersion: 1,
              chatId: "group-chat-id",
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              senderKeyId: "old-material-group-sender-key",
              messageCounter: 0,
              ciphertext: utf8ToBase64("group history through old own material"),
              iv: utf8ToBase64("grouphistold2"),
              signature: utf8ToBase64("valid-signature"),
            }),
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey:
                  '{"kty":"OKP","crv":"X25519","x":"old-material-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-material-remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: 31,
                messageCounter: 0,
                ciphertext: utf8ToBase64(
                  JSON.stringify({
                    aadVersion: 1,
                    chatId: "group-chat-id",
                    senderUserId: REMOTE_USER_ID,
                    senderDeviceId: "device-id",
                    senderKeyId: "old-material-group-sender-key",
                    chainKey: utf8ToBase64("old-material-group-chain-key"),
                    messageCounter: 0,
                  })
                ),
                iv: utf8ToBase64("groupdistold2"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({
      content: "group history through old own material",
    });
  });

  it("serializes message hydration per user to avoid concurrent decrypt ratchet races", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    let activeDecryptions = 0;
    let maxConcurrentDecryptions = 0;
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(async (_algorithm, _key, data) => {
      activeDecryptions += 1;
      maxConcurrentDecryptions = Math.max(maxConcurrentDecryptions, activeDecryptions);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      activeDecryptions -= 1;
      return bufferSourceToArrayBuffer(data);
    });
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${USER_ID}:self-device`]: {
          sessionId: "self-session-record",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          sessionOrigin: "initiator",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-self-ratchet-private","x":"current-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 2,
          receivingCounter: 0,
          cachedMessageKeys: {
            'send|{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}|0': utf8ToBase64("first"),
            'send|{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}|1': utf8ToBase64("second"),
          },
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const [firstHydrated, secondHydrated] = await Promise.all([
      hydrateChatMessage(
        {
          id: "self-concurrent-message-1",
          chatId: "chat-id",
          sender: selfParticipant,
          createdAt: "2026-04-10T10:06:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: "self-concurrent-client-id-1",
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: USER_ID,
                senderDeviceId: "self-device",
                recipientDeviceId: "self-device",
                senderIdentityKey: localDeviceMaterial.identityKey,
                senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 0,
                ciphertext: utf8ToBase64("first"),
                iv: utf8ToBase64("selfconc0001"),
              }),
            },
          },
        },
        USER_ID
      ),
      hydrateChatMessage(
        {
          id: "self-concurrent-message-2",
          chatId: "chat-id",
          sender: selfParticipant,
          createdAt: "2026-04-10T10:06:01.000Z",
          editedAt: null,
          status: null,
          clientMessageId: "self-concurrent-client-id-2",
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: USER_ID,
                senderDeviceId: "self-device",
                recipientDeviceId: "self-device",
                senderIdentityKey: localDeviceMaterial.identityKey,
                senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 1,
                ciphertext: utf8ToBase64("second"),
                iv: utf8ToBase64("selfconc0002"),
              }),
            },
          },
        },
        USER_ID
      ),
    ]);

    expect(firstHydrated.content).toBe("first");
    expect(secondHydrated.content).toBe("second");
    expect(maxConcurrentDecryptions).toBe(1);
  });

  it("rejects direct envelopes with an excessive message counter gap", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: deviceBundle.signedPrekeyId,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"self-ratchet-private","x":"self-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "gap-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-10T10:00:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 5000,
              ciphertext: utf8ToBase64("too far ahead"),
              iv: utf8ToBase64("gapcounter12"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("[Encrypted message unavailable]");
  });

  it("keeps older direct message keys after a newer counter advances the ratchet", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: deviceBundle.signedPrekeyId,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"self-ratchet-private","x":"self-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    await expect(
      hydrateChatMessage(
        {
          id: "late-direct-message-id",
          chatId: "chat-id",
          sender: participant,
          createdAt: "2026-04-10T10:00:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 600,
                ciphertext: utf8ToBase64("late direct"),
                iv: utf8ToBase64("latecounter1"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({ content: "late direct" });

    await expect(
      hydrateChatMessage(
        {
          id: "early-direct-message-id",
          chatId: "chat-id",
          sender: participant,
          createdAt: "2026-04-10T09:59:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "X3DH-DEVICE-AES-GCM",
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 0,
                ciphertext: utf8ToBase64("early direct"),
                iv: utf8ToBase64("earlycount12"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({ content: "early direct" });
  });

  it("rejects legacy direct envelopes without authenticated metadata fields", async () => {
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          sessionId: "session-record",
          peerUserId: REMOTE_USER_ID,
          peerDeviceId: "device-id",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
          remoteSignedPrekeyId: deviceBundle.signedPrekeyId,
          remoteSignedPrekeyPublicKey: deviceBundle.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"self-ratchet-private","x":"self-ratchet"}',
          remoteRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"remote-ratchet"}',
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 0,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-09T10:00:00.000Z",
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "legacy-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-10T10:00:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "X3DH-DEVICE-AES-GCM",
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"initiator"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              ciphertext: utf8ToBase64("ciphertext"),
              iv: utf8ToBase64("legacy-iv"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("[Encrypted message unavailable]");
  });

  it("sends group messages with per-device envelopes for every participant device", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle, secondDeviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle, secondConsumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle, secondDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "group-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "group secret",
      [selfParticipant, participant, secondParticipant],
      "group-client-message-id",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(
      1,
      "token",
      [REMOTE_USER_ID, REMOTE_USER_ID_TWO],
      {
        consumeOneTimePrekeys: false,
        requesterDeviceId: "self-device",
      }
    );
    expect(resolveEncryptionDeviceBundles).toHaveBeenNthCalledWith(
      2,
      "token",
      [REMOTE_USER_ID, REMOTE_USER_ID_TWO],
      {
        consumeOneTimePrekeys: true,
        deviceIds: ["device-id", "device-id-two"],
        requesterDeviceId: "self-device",
      }
    );
    expect(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload).toMatchObject({
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      sharedEnvelope: expect.any(String),
      encryptedKeysByRecipientId: expect.objectContaining({
        "device-id": expect.any(String),
        "device-id-two": expect.any(String),
        "self-device": expect.any(String),
      }),
    });

    const decrypted = await hydrateChatMessage(
      {
        id: "group-message-id",
        chatId: "group-chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "group-client-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload: vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload ?? null,
      },
      USER_ID
    );

    expect(decrypted.content).toBe("group secret");
  });

  it("rotates a remembered outbound group sender chain before the first send after reload", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "group-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "initial group secret",
      [selfParticipant, participant],
      "group-client-message-id-initial",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    const initialSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };
    expect(window.localStorage.getItem(`north-messenger:group-sender-chain-e2ee:remembered:${USER_ID}`)).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    window.sessionStorage.removeItem(GROUP_SENDER_CHAIN_KEY);
    vi.mocked(resolveEncryptionDeviceBundles).mockClear();
    vi.mocked(sendMessageRaw).mockClear();

    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "restored group secret",
      [selfParticipant, participant],
      "group-client-message-id-restored",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    const restoredSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };
    expect(restoredSharedEnvelope.messageCounter).toBe(0);
    expect(restoredSharedEnvelope.senderKeyId).not.toBe(initialSharedEnvelope.senderKeyId);
  });

  it("reuses prepared device state for the first group send after priming", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(listOwnEncryptionDevices).mockResolvedValue([
      currentRegisteredDevice,
      siblingRegisteredDevice,
    ]);
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle, siblingConsumableOwnDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "group-message-id-after-prime",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await primeEncryptedMessageRecipients("token", [selfParticipant, participant], {
      currentUserId: USER_ID,
    });
    vi.mocked(resolveEncryptionDeviceBundles).mockClear();

    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "group secret after priming",
      [selfParticipant, participant],
      "group-client-message-id-after-prime",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    expect(resolveEncryptionDeviceBundles).not.toHaveBeenCalled();
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.encryptedKeysByRecipientId ?? {})
        .sort()
    ).toEqual(["device-id", "self-device", "self-device-two"]);
  });

  it("retries group sends after the backend rejects a stale outbound sender chain", async () => {
    const retriedConsumableDeviceBundle = {
      ...consumableDeviceBundle,
      oneTimePrekey: {
        keyId: 12,
        publicKey: publicOkpJwk("X25519", "otp-retry"),
      },
    };
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([retriedConsumableDeviceBundle]);
    vi.mocked(sendMessageRaw)
      .mockRejectedValueOnce(new ApiError("Encrypted group envelope must start at counter zero", 400))
      .mockImplementationOnce(async (_token, chatId, request) => ({
        id: "group-message-id",
        chatId,
        sender: selfParticipant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: request.clientMessageId ?? null,
        replyTo: null,
        reactions: [],
        encryptedPayload: request.encryptedPayload,
      }));
    const freshSenderChainCreatedAt = new Date(
      Date.now() - 6 * 24 * 60 * 60 * 1000
    ).toISOString();
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        outboundChains: {
          "group-chat-id": {
            chatId: "group-chat-id",
            ownMaterialId: localDeviceMaterial.materialId,
            senderDeviceId: localDeviceMaterial.deviceId,
            senderKeyId: "stale-group-sender-key",
            recipientDeviceSetHash: `${REMOTE_USER_ID}:device-id|${USER_ID}:self-device`,
            chainKey: utf8ToBase64("stale-group-chain-key"),
            nextMessageCounter: 5,
            createdAt: freshSenderChainCreatedAt,
          },
        },
        inboundChains: {},
      })
    );

    await expect(
      sendEncryptedMessage(
        "token",
        "group-chat-id",
        "group secret retry",
        [selfParticipant, participant],
        "group-client-message-id",
        null,
        { currentUserId: USER_ID, isDirectChat: false }
      )
    ).resolves.toMatchObject({
      id: "group-message-id",
      clientMessageId: "group-client-message-id",
    });

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(4);

    const firstSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };
    const retriedSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };

    expect(firstSharedEnvelope).toMatchObject({
      senderKeyId: "stale-group-sender-key",
      messageCounter: 5,
    });
    expect(retriedSharedEnvelope.messageCounter).toBe(0);
    expect(retriedSharedEnvelope.senderKeyId).not.toBe("stale-group-sender-key");

    const persistedGroupState = JSON.parse(
      window.sessionStorage.getItem(GROUP_SENDER_CHAIN_KEY) ?? "{}"
    ) as {
      outboundChains?: Record<
        string,
        {
          senderKeyId?: string;
          nextMessageCounter?: number;
        }
      >;
    };

    expect(persistedGroupState.outboundChains?.["group-chat-id"]).toMatchObject({
      senderKeyId: retriedSharedEnvelope.senderKeyId,
      nextMessageCounter: 1,
    });
  });

  it("restores a newer remembered outbound group sender chain before rotating on session repair", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementationOnce(async (_token, chatId, request) => ({
      id: "group-message-id-initial",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "initial group secret",
      [selfParticipant, participant],
      "group-client-message-id-initial",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    const initialSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };
    const staleGroupState = JSON.parse(
      window.sessionStorage.getItem(GROUP_SENDER_CHAIN_KEY) ?? "{}"
    ) as {
      outboundChains?: Record<
        string,
        {
          senderKeyId?: string;
          nextMessageCounter?: number;
        }
      >;
    };
    expect(window.localStorage.getItem(`north-messenger:group-sender-chain-e2ee:remembered:${USER_ID}`)).not.toBeNull();
    staleGroupState.outboundChains = {
      ...(staleGroupState.outboundChains ?? {}),
      "group-chat-id": {
        ...(staleGroupState.outboundChains?.["group-chat-id"] ?? {}),
        nextMessageCounter: 0,
      },
    };
    window.sessionStorage.setItem(GROUP_SENDER_CHAIN_KEY, JSON.stringify(staleGroupState));

    vi.mocked(sendMessageRaw).mockReset();
    vi.mocked(sendMessageRaw)
      .mockRejectedValueOnce(new ApiError("Encrypted group envelope message counter is stale", 400))
      .mockImplementationOnce(async (_token, chatId, request) => ({
        id: "group-message-id-restored",
        chatId,
        sender: selfParticipant,
        createdAt: "2026-04-09T10:36:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: request.clientMessageId ?? null,
        replyTo: null,
        reactions: [],
        encryptedPayload: request.encryptedPayload,
      }));

    await expect(
      sendEncryptedMessage(
        "token",
        "group-chat-id",
        "group secret after session restore",
        [selfParticipant, participant],
        "group-client-message-id-restored",
        null,
        { currentUserId: USER_ID, isDirectChat: false }
      )
    ).resolves.toMatchObject({
      id: "group-message-id-restored",
      clientMessageId: "group-client-message-id-restored",
    });

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);

    const staleSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };
    const restoredSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { senderKeyId?: string; messageCounter?: number };

    expect(staleSharedEnvelope).toMatchObject({
      senderKeyId: initialSharedEnvelope.senderKeyId,
      messageCounter: 0,
    });
    expect(restoredSharedEnvelope).toMatchObject({
      senderKeyId: initialSharedEnvelope.senderKeyId,
      messageCounter: 1,
    });

    const persistedGroupState = JSON.parse(
      window.sessionStorage.getItem(GROUP_SENDER_CHAIN_KEY) ?? "{}"
    ) as {
      outboundChains?: Record<
        string,
        {
          senderKeyId?: string;
          nextMessageCounter?: number;
        }
      >;
    };

    expect(persistedGroupState.outboundChains?.["group-chat-id"]).toMatchObject({
      senderKeyId: initialSharedEnvelope.senderKeyId,
      nextMessageCounter: 2,
    });
  });

  it("retries group sends after the backend rejects a stale history-key recipient prekey", async () => {
    const retriedConsumableDeviceBundle = {
      ...consumableDeviceBundle,
      oneTimePrekey: {
        keyId: 13,
        publicKey: publicOkpJwk("X25519", "otp-history-retry"),
      },
    };
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([retriedConsumableDeviceBundle]);
    vi.mocked(upsertGroupHistoryKey)
      .mockRejectedValueOnce(new ApiError("Group history key recipient prekey is stale", 400))
      .mockResolvedValueOnce({
        historyKeyId: "history-key-id",
        createdAt: "2026-04-20T10:00:00.000Z",
      });
    vi.mocked(sendMessageRaw).mockImplementationOnce(async (_token, chatId, request) => ({
      id: "group-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await expect(
      sendEncryptedMessage(
        "token",
        "group-chat-id",
        "group secret retry",
        [selfParticipant, participant],
        "group-client-message-id",
        null,
        { currentUserId: USER_ID, isDirectChat: false }
      )
    ).resolves.toMatchObject({
      id: "group-message-id",
      clientMessageId: "group-client-message-id",
    });

    expect(upsertGroupHistoryKey).toHaveBeenCalledTimes(2);
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(4);

    const retriedWrappedKeys = vi.mocked(upsertGroupHistoryKey).mock.calls[1]?.[2]
      .wrappedKeysByRecipientDeviceId;
    expect(retriedWrappedKeys).toEqual(
      expect.objectContaining({
        "device-id": expect.any(String),
        "self-device": expect.any(String),
      })
    );
  });

  it("retries group sends after stale history-key access references unknown recipient devices", async () => {
    const retriedConsumableDeviceBundle = {
      ...consumableDeviceBundle,
      oneTimePrekey: {
        keyId: 14,
        publicKey: publicOkpJwk("X25519", "otp-history-device-refresh"),
      },
    };
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles)
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([consumableDeviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([deviceBundle])
      .mockResolvedValueOnce([retriedConsumableDeviceBundle]);
    vi.mocked(upsertGroupHistoryKey)
      .mockRejectedValueOnce(
        new ApiError("Group history key access contains unknown recipient devices", 400)
      )
      .mockResolvedValueOnce({
        historyKeyId: "history-key-id",
        createdAt: "2026-04-20T10:00:00.000Z",
      });
    vi.mocked(sendMessageRaw).mockImplementationOnce(async (_token, chatId, request) => ({
      id: "group-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await expect(
      sendEncryptedMessage(
        "token",
        "group-chat-id",
        "group secret retry after stale access",
        [selfParticipant, participant],
        "group-client-message-id",
        null,
        { currentUserId: USER_ID, isDirectChat: false }
      )
    ).resolves.toMatchObject({
      id: "group-message-id",
      clientMessageId: "group-client-message-id",
    });

    expect(upsertGroupHistoryKey).toHaveBeenCalledTimes(2);
    expect(sendMessageRaw).toHaveBeenCalledTimes(1);
    expect(resolveEncryptionDeviceBundles).toHaveBeenCalledTimes(4);

    const retriedWrappedKeys = vi.mocked(upsertGroupHistoryKey).mock.calls[1]?.[2]
      .wrappedKeysByRecipientDeviceId;
    expect(retriedWrappedKeys).toEqual(
      expect.objectContaining({
        "device-id": expect.any(String),
        "self-device": expect.any(String),
      })
    );
  });

  it("backfills all known group history keys for current participants after a membership change", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "group-chat-id": "history-key-2",
          "other-chat-id": "other-history-key",
        },
        keysById: {
          "history-key-1": {
            historyKeyId: "history-key-1",
            chatId: "group-chat-id",
            keyMaterial: utf8ToBase64("group-history-key-material-1"),
            createdAt: "2026-04-20T10:00:00.000Z",
            updatedAt: "2026-04-20T10:00:00.000Z",
          },
          "history-key-2": {
            historyKeyId: "history-key-2",
            chatId: "group-chat-id",
            keyMaterial: utf8ToBase64("group-history-key-material-2"),
            createdAt: "2026-04-21T10:00:00.000Z",
            updatedAt: "2026-04-21T10:00:00.000Z",
          },
          "other-history-key": {
            historyKeyId: "other-history-key",
            chatId: "other-chat-id",
            keyMaterial: utf8ToBase64("other-group-history-key-material"),
            createdAt: "2026-04-22T10:00:00.000Z",
            updatedAt: "2026-04-22T10:00:00.000Z",
          },
        },
      })
    );

    await expect(
      grantGroupHistoryAccessForParticipants(
        "token",
        "group-chat-id",
        [selfParticipant, participant],
        { currentUserId: USER_ID, force: true }
      )
    ).resolves.toBeUndefined();

    expect(upsertGroupHistoryKey).toHaveBeenCalledTimes(2);
    expect(vi.mocked(upsertGroupHistoryKey).mock.calls[0]?.[2]?.historyKeyId).toBe(
      "history-key-1"
    );
    expect(vi.mocked(upsertGroupHistoryKey).mock.calls[1]?.[2]?.historyKeyId).toBe(
      "history-key-2"
    );
  });

  it("skips repeating the same group history backfill fingerprint until the membership or keys change", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([deviceBundle]);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "group-chat-id": "history-key-1",
        },
        keysById: {
          "history-key-1": {
            historyKeyId: "history-key-1",
            chatId: "group-chat-id",
            keyMaterial: utf8ToBase64("group-history-key-material-1"),
            createdAt: "2026-04-20T10:00:00.000Z",
            updatedAt: "2026-04-20T10:00:00.000Z",
          },
        },
      })
    );

    await grantGroupHistoryAccessForParticipants(
      "token",
      "group-chat-id",
      [selfParticipant, participant],
      { currentUserId: USER_ID }
    );
    await grantGroupHistoryAccessForParticipants(
      "token",
      "group-chat-id",
      [selfParticipant, participant],
      { currentUserId: USER_ID }
    );

    expect(upsertGroupHistoryKey).toHaveBeenCalledTimes(1);
  });

  it("restores incoming group message history from persisted inbound sender-chain state after reload", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        outboundChains: {},
        inboundChains: {
          "group-chat-id|remote-user-id|device-id|group-sender-key": {
            chatId: "group-chat-id",
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            senderKeyId: "group-sender-key",
            nextChainKey: utf8ToBase64("group-next-chain-key"),
            nextMessageCounter: 1,
            cachedMessageKeys: {
              "0": utf8ToBase64("group-message-key"),
            },
            updatedAt: "2026-04-09T10:35:00.000Z",
          },
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "group-history-message-id",
        chatId: "group-chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "GROUP-SENDER-KEY-AES-GCM",
          sharedEnvelope: JSON.stringify({
            aadVersion: 1,
            chatId: "group-chat-id",
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            senderKeyId: "group-sender-key",
            messageCounter: 0,
            ciphertext: utf8ToBase64("hello group after refresh"),
            iv: utf8ToBase64("grouprefresh"),
            signature: "c2ln",
          }),
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              recipientDeviceId: "self-device",
              senderIdentityKey: deviceBundle.identityKey,
              senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
              initiatorEphemeralPublicKey:
                '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
              recipientSignedPrekeyId: 9,
              recipientOneTimePrekeyId: null,
              messageCounter: 5,
              ciphertext: utf8ToBase64("unused distribution"),
              iv: utf8ToBase64("groupdistiv1"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("hello group after refresh");
  });

  it("hydrates post-patch group history for a later participant via the group history key fallback", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "group-chat-id": "group-history-key-id",
        },
        keysById: {
          "group-history-key-id": {
            historyKeyId: "group-history-key-id",
            chatId: "group-chat-id",
            keyMaterial: utf8ToBase64("group-history-key-material"),
            createdAt: "2026-04-20T10:00:00.000Z",
            updatedAt: "2026-04-20T10:00:00.000Z",
          },
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "late-joiner-group-history-message-id",
        chatId: "group-chat-id",
        sender: participant,
        createdAt: "2026-04-20T10:05:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "GROUP-SENDER-KEY-AES-GCM",
          sharedEnvelope: JSON.stringify({
            aadVersion: 1,
            chatId: "group-chat-id",
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            senderKeyId: "group-sender-key",
            messageCounter: 3,
            ciphertext: utf8ToBase64("live payload unavailable to late joiner"),
            iv: utf8ToBase64("groupsharediv"),
            signature: "c2ln",
          }),
          historyEnvelope: JSON.stringify({
            aadVersion: 1,
            historyKeyId: "group-history-key-id",
            ciphertext: utf8ToBase64("visible after joining later"),
            iv: utf8ToBase64("grouphistory"),
          }),
          encryptedKeysByRecipientId: {},
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("visible after joining later");
  });

  it("falls back to the group history envelope when self distribution keys are no longer available", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${USER_ID}:self-device`]: {
          sessionId: "self-group-session",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-group-init"}',
          sendingRatchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"current-self-ratchet"}',
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"current-self-ratchet-private","x":"current-self-ratchet"}',
          remoteRatchetPublicKey: null,
          sendingRatchetUsed: false,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("root"),
          sendingChainKey: utf8ToBase64("send"),
          receivingChainKey: utf8ToBase64("recv"),
          sendingCounter: 2,
          receivingCounter: 0,
          cachedMessageKeys: {},
          establishedAt: "2026-04-25T09:40:00.000Z",
        },
      })
    );
    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "group-chat-id": "group-history-key-id",
        },
        keysById: {
          "group-history-key-id": {
            historyKeyId: "group-history-key-id",
            chatId: "group-chat-id",
            keyMaterial: utf8ToBase64("group-history-key-material"),
            createdAt: "2026-04-25T09:40:00.000Z",
            updatedAt: "2026-04-25T09:40:00.000Z",
          },
        },
      })
    );

    const hydrated = await hydrateChatMessage(
      {
        id: "self-group-history-fallback-message-id",
        chatId: "group-chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-25T09:42:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "self-group-history-fallback-client-id",
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "GROUP-SENDER-KEY-AES-GCM",
          sharedEnvelope: JSON.stringify({
            aadVersion: 1,
            chatId: "group-chat-id",
            senderUserId: USER_ID,
            senderDeviceId: "self-device",
            senderKeyId: "group-sender-key",
            messageCounter: 0,
            ciphertext: utf8ToBase64("group payload not decryptable from self session"),
            iv: utf8ToBase64("groupsharediv"),
            signature: "c2ln",
          }),
          historyEnvelope: JSON.stringify({
            aadVersion: 1,
            historyKeyId: "group-history-key-id",
            ciphertext: utf8ToBase64("group message restored from history"),
            iv: utf8ToBase64("grouphistory"),
          }),
          encryptedKeysByRecipientId: {
            "self-device": JSON.stringify({
              aadVersion: 1,
              senderUserId: USER_ID,
              senderDeviceId: "self-device",
              recipientDeviceId: "self-device",
              senderIdentityKey: localDeviceMaterial.identityKey,
              senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
              initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-group-init"}',
              ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"old-self-ratchet"}',
              recipientSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
              recipientOneTimePrekeyId: null,
              messageCounter: 0,
              ciphertext: utf8ToBase64("self distribution no longer decryptable"),
              iv: utf8ToBase64("groupdistiv1"),
            }),
          },
        },
      },
      USER_ID
    );

    expect(hydrated.content).toBe("group message restored from history");
    expect(getOwnGroupHistoryKeys).not.toHaveBeenCalled();
  });

  it("waits briefly for the recovery sync session before fetching remote group history keys", async () => {
    const historyGrantRatchetPublicKey = '{"kty":"OKP","crv":"X25519","x":"self-history-ratchet"}';

    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${USER_ID}:self-device`]: {
          sessionId: "self-history-session",
          peerUserId: USER_ID,
          peerDeviceId: "self-device",
          ownMaterialId: localDeviceMaterial.materialId,
          remoteIdentityKey: localDeviceMaterial.identityKey,
          remoteIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          remoteSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          remoteSignedPrekeyPublicKey: localDeviceMaterial.signedPrekeyPublicKey,
          remoteOneTimePrekeyId: null,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-history-init"}',
          sendingRatchetPublicKey: historyGrantRatchetPublicKey,
          sendingRatchetPrivateKey:
            '{"kty":"OKP","crv":"X25519","d":"self-history-private","x":"self-history-ratchet"}',
          remoteRatchetPublicKey: historyGrantRatchetPublicKey,
          sendingRatchetUsed: true,
          pendingSendingRatchetStep: false,
          rootKey: utf8ToBase64("12345678901234567890123456789012"),
          sendingChainKey: utf8ToBase64("abcdefghijklmnopqrstuvwx12345678"),
          receivingChainKey: utf8ToBase64("zyxwvutsrqponmlkjihgfedcba876543"),
          sendingCounter: 1,
          receivingCounter: 0,
          cachedMessageKeys: {
            [`send|${historyGrantRatchetPublicKey}|0`]: utf8ToBase64("history-grant-message-key"),
          },
          establishedAt: "2026-04-20T10:00:00.000Z",
        },
      })
    );
    vi.mocked(getOwnGroupHistoryKeys).mockResolvedValue([
      {
        historyKeyId: "remote-group-history-key-id",
        wrappedKeyPayloadJson: JSON.stringify({
          aadVersion: 1,
          senderUserId: USER_ID,
          senderDeviceId: "self-device",
          recipientDeviceId: "self-device",
          senderIdentityKey: localDeviceMaterial.identityKey,
          senderIdentitySignatureKey: localDeviceMaterial.identitySignatureKey,
          initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"self-history-init"}',
          ratchetPublicKey: historyGrantRatchetPublicKey,
          recipientSignedPrekeyId: localDeviceMaterial.signedPrekeyId,
          recipientOneTimePrekeyId: null,
          messageCounter: 0,
          ciphertext: utf8ToBase64(
            JSON.stringify({
              aadVersion: 1,
              chatId: "group-chat-id",
              historyKeyId: "remote-group-history-key-id",
              historyKey: utf8ToBase64("remote-group-history-key-material"),
              createdAt: "2026-04-20T10:00:00.000Z",
            })
          ),
          iv: utf8ToBase64("historygrant1"),
        }),
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
      },
    ]);

    const hydrationPromise = hydrateChatMessage(
      {
        id: "remote-group-history-message-id",
        chatId: "group-chat-id",
        sender: participant,
        createdAt: "2026-04-20T10:05:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "GROUP-SENDER-KEY-AES-GCM",
          sharedEnvelope: JSON.stringify({
            aadVersion: 1,
            chatId: "group-chat-id",
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            senderKeyId: "group-sender-key",
            messageCounter: 4,
            ciphertext: utf8ToBase64("payload requires remote history key"),
            iv: utf8ToBase64("groupsharediv"),
            signature: "c2ln",
          }),
          historyEnvelope: JSON.stringify({
            aadVersion: 1,
            historyKeyId: "remote-group-history-key-id",
            ciphertext: utf8ToBase64("visible after recovery session appears"),
            iv: utf8ToBase64("grouphistory"),
          }),
          encryptedKeysByRecipientId: {},
        },
      },
      USER_ID
    );

    window.setTimeout(() => {
      void syncEncryptionDeviceState(currentSession);
    }, 0);

    const hydrated = await hydrationPromise;

    expect(hydrated.content).toBe("visible after recovery session appears");
    expect(getOwnGroupHistoryKeys).toHaveBeenCalledWith("token", "group-chat-id", "self-device");
  });

  it("keeps older group sender-chain keys after a newer counter advances the chain", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));
    window.sessionStorage.setItem(
      GROUP_SENDER_CHAIN_KEY,
      JSON.stringify({
        outboundChains: {},
        inboundChains: {
          "group-chat-id|remote-user-id|device-id|group-sender-key": {
            chatId: "group-chat-id",
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            senderKeyId: "group-sender-key",
            nextChainKey: utf8ToBase64("group-next-chain-key"),
            nextMessageCounter: 0,
            cachedMessageKeys: {},
            updatedAt: "2026-04-09T10:35:00.000Z",
          },
        },
      })
    );

    await expect(
      hydrateChatMessage(
        {
          id: "late-group-message-id",
          chatId: "group-chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:35:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            sharedEnvelope: JSON.stringify({
              aadVersion: 1,
              chatId: "group-chat-id",
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              senderKeyId: "group-sender-key",
              messageCounter: 600,
              ciphertext: utf8ToBase64("late group"),
              iv: utf8ToBase64("grouplateiv1"),
              signature: "c2ln",
            }),
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 600,
                ciphertext: utf8ToBase64("unused distribution"),
                iv: utf8ToBase64("grouplateiv2"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({ content: "late group" });

    await expect(
      hydrateChatMessage(
        {
          id: "early-group-message-id",
          chatId: "group-chat-id",
          sender: participant,
          createdAt: "2026-04-09T10:34:00.000Z",
          editedAt: null,
          status: null,
          clientMessageId: null,
          replyTo: null,
          reactions: [],
          encryptedPayload: {
            scheme: "GROUP-SENDER-KEY-AES-GCM",
            sharedEnvelope: JSON.stringify({
              aadVersion: 1,
              chatId: "group-chat-id",
              senderUserId: REMOTE_USER_ID,
              senderDeviceId: "device-id",
              senderKeyId: "group-sender-key",
              messageCounter: 0,
              ciphertext: utf8ToBase64("early group"),
              iv: utf8ToBase64("groupearly12"),
              signature: "c2ln",
            }),
            encryptedKeysByRecipientId: {
              "self-device": JSON.stringify({
                aadVersion: 1,
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                recipientDeviceId: "self-device",
                senderIdentityKey: deviceBundle.identityKey,
                senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
                initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
                ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
                recipientSignedPrekeyId: 9,
                recipientOneTimePrekeyId: null,
                messageCounter: 0,
                ciphertext: utf8ToBase64("unused distribution"),
                iv: utf8ToBase64("groupearlyiv"),
              }),
            },
          },
        },
        USER_ID
      )
    ).resolves.toMatchObject({ content: "early group" });
  });

  it("falls back to the archived decrypted message when incoming group session state is gone", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...localDeviceMaterial,
        oneTimePrekeys: [
          {
            keyId: 21,
            publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          },
        ],
      })
    );

    const incomingGroupMessage: ApiChatMessage = {
      id: "archived-group-message-id",
      chatId: "group-chat-id",
      sender: participant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "GROUP-SENDER-KEY-AES-GCM",
        sharedEnvelope: JSON.stringify({
          aadVersion: 1,
          chatId: "group-chat-id",
          senderUserId: REMOTE_USER_ID,
          senderDeviceId: "device-id",
          senderKeyId: "group-sender-key",
          messageCounter: 0,
          ciphertext: utf8ToBase64("archived group fallback"),
          iv: utf8ToBase64("grouparchiv12"),
          signature: "c2ln",
        }),
        encryptedKeysByRecipientId: {
          "self-device": JSON.stringify({
            aadVersion: 1,
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            recipientDeviceId: "self-device",
            senderIdentityKey: deviceBundle.identityKey,
            senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
            initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
            ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
            recipientSignedPrekeyId: 9,
            recipientOneTimePrekeyId: 21,
            messageCounter: 0,
            ciphertext: utf8ToBase64(
              JSON.stringify({
                aadVersion: 1,
                chatId: "group-chat-id",
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                senderKeyId: "group-sender-key",
                chainKey: utf8ToBase64("group-next-chain-key"),
                messageCounter: 0,
              })
            ),
            iv: utf8ToBase64("groupdistiv2"),
          }),
        },
      },
    };

    await expect(hydrateChatMessage(incomingGroupMessage, USER_ID)).resolves.toMatchObject({
      content: "archived group fallback",
    });

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    window.sessionStorage.removeItem(GROUP_SENDER_CHAIN_KEY);
    window.localStorage.removeItem(`north-messenger:remembered-device-e2ee:${USER_ID}`);
    window.localStorage.removeItem(`north-messenger:remembered-device-session-e2ee:${USER_ID}`);
    window.localStorage.removeItem(`north-messenger:remembered-group-sender-chain-e2ee:${USER_ID}`);

    await expect(hydrateChatMessage(incomingGroupMessage, USER_ID)).resolves.toMatchObject({
      content: "archived group fallback",
    });
  });

  it("returns a fast history snapshot from the archived decrypted message cache", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...localDeviceMaterial,
        oneTimePrekeys: [
          {
            keyId: 21,
            publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          },
        ],
      })
    );

    const incomingGroupMessage: ApiChatMessage = {
      id: "archived-group-snapshot-message-id",
      chatId: "group-chat-id",
      sender: participant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "GROUP-SENDER-KEY-AES-GCM",
        sharedEnvelope: JSON.stringify({
          aadVersion: 1,
          chatId: "group-chat-id",
          senderUserId: REMOTE_USER_ID,
          senderDeviceId: "device-id",
          senderKeyId: "group-sender-key",
          messageCounter: 0,
          ciphertext: utf8ToBase64("archived group snapshot"),
          iv: utf8ToBase64("grouparchiv34"),
          signature: "c2ln",
        }),
        encryptedKeysByRecipientId: {
          "self-device": JSON.stringify({
            aadVersion: 1,
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            recipientDeviceId: "self-device",
            senderIdentityKey: deviceBundle.identityKey,
            senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
            initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
            ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
            recipientSignedPrekeyId: 9,
            recipientOneTimePrekeyId: 21,
            messageCounter: 0,
            ciphertext: utf8ToBase64(
              JSON.stringify({
                aadVersion: 1,
                chatId: "group-chat-id",
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                senderKeyId: "group-sender-key",
                chainKey: utf8ToBase64("group-next-chain-key"),
                messageCounter: 0,
              })
            ),
            iv: utf8ToBase64("groupdistiv3"),
          }),
        },
      },
    };

    await expect(hydrateChatMessage(incomingGroupMessage, USER_ID)).resolves.toMatchObject({
      content: "archived group snapshot",
    });

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
    window.sessionStorage.removeItem(GROUP_SENDER_CHAIN_KEY);
    vi.mocked(getMessagesRaw).mockResolvedValue([incomingGroupMessage]);

    const historySnapshot = await getEncryptedMessagesSnapshot("token", USER_ID, "group-chat-id");

    expect(historySnapshot.hydratedMessages).toEqual([
      expect.objectContaining({
        id: "archived-group-snapshot-message-id",
        content: "archived group snapshot",
      }),
    ]);
    expect(historySnapshot.rawMessages).toEqual([incomingGroupMessage]);
  });

  it("inline-hydrates the newest unavailable encrypted snapshot message on the latest page", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    window.sessionStorage.setItem(
      DEVICE_MATERIAL_KEY,
      JSON.stringify({
        ...localDeviceMaterial,
        oneTimePrekeys: [
          {
            keyId: 21,
            publicKey: '{"kty":"OKP","crv":"X25519","x":"otp-local"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"otp-local-private","x":"otp-local"}',
          },
        ],
        signedPrekey: {
          keyId: 9,
          publicKey: '{"kty":"OKP","crv":"X25519","x":"spk-local"}',
          privateKey:
            '{"kty":"OKP","crv":"X25519","d":"spk-local-private","x":"spk-local"}',
        },
      })
    );
    window.sessionStorage.setItem(
      DEVICE_SESSION_KEY,
      JSON.stringify({
        [`${REMOTE_USER_ID}:device-id`]: {
          remoteUserId: REMOTE_USER_ID,
          remoteDeviceId: "device-id",
          rootKey: utf8ToBase64("group-root-key-4"),
          sendingChainKey: utf8ToBase64("group-send-chain-4"),
          receivingChainKey: utf8ToBase64("group-recv-chain-4"),
          lastSentCounter: 0,
          lastReceivedCounter: -1,
          createdAt: "2026-04-09T10:30:00.000Z",
          updatedAt: "2026-04-09T10:30:00.000Z",
          localEphemeralKeyPair: {
            publicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
            privateKey:
              '{"kty":"OKP","crv":"X25519","d":"group-initiator-private","x":"group-initiator"}',
          },
          remoteEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
          remoteIdentityKey: deviceBundle.identityKey,
          remoteIdentitySignatureKey: deviceBundle.identitySignatureKey,
        },
      })
    );

    const incomingGroupMessage: ApiChatMessage = {
      id: "latest-group-inline-hydration-message-id",
      chatId: "group-chat-id",
      sender: participant,
      createdAt: "2026-04-09T10:35:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "GROUP-SENDER-KEY-AES-GCM",
        sharedEnvelope: JSON.stringify({
          aadVersion: 1,
          chatId: "group-chat-id",
          senderUserId: REMOTE_USER_ID,
          senderDeviceId: "device-id",
          senderKeyId: "group-sender-key",
          messageCounter: 0,
          ciphertext: utf8ToBase64("latest group inline hydration"),
          iv: utf8ToBase64("groupinline12"),
          signature: "c2ln",
        }),
        encryptedKeysByRecipientId: {
          "self-device": JSON.stringify({
            aadVersion: 1,
            senderUserId: REMOTE_USER_ID,
            senderDeviceId: "device-id",
            recipientDeviceId: "self-device",
            senderIdentityKey: deviceBundle.identityKey,
            senderIdentitySignatureKey: deviceBundle.identitySignatureKey,
            initiatorEphemeralPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-initiator"}',
            ratchetPublicKey: '{"kty":"OKP","crv":"X25519","x":"group-ratchet"}',
            recipientSignedPrekeyId: 9,
            recipientOneTimePrekeyId: 21,
            messageCounter: 0,
            ciphertext: utf8ToBase64(
              JSON.stringify({
                aadVersion: 1,
                chatId: "group-chat-id",
                senderUserId: REMOTE_USER_ID,
                senderDeviceId: "device-id",
                senderKeyId: "group-sender-key",
                chainKey: utf8ToBase64("group-next-chain-key-inline"),
                messageCounter: 0,
              })
            ),
            iv: utf8ToBase64("groupdistiv4"),
          }),
        },
      },
    };

    vi.mocked(getMessagesRaw).mockResolvedValue([incomingGroupMessage]);

    const historySnapshot = await getEncryptedMessagesSnapshot("token", USER_ID, "group-chat-id");

    expect(historySnapshot.hydratedMessages).toEqual([
      expect.objectContaining({
        id: "latest-group-inline-hydration-message-id",
        content: "latest group inline hydration",
      }),
    ]);
  });

  it("records snapshot unavailable diagnostics when no local readback fallback exists", async () => {
    rememberCurrentBuildRevision("test-build-revision");

    const hydratedMessage = await hydrateChatMessageSnapshot(
      {
        id: "snapshot-unavailable-message-id",
        chatId: "group-chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "client-snapshot-unavailable-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload: {
          scheme: "GROUP-SENDER-KEY-AES-GCM",
          sharedEnvelope: JSON.stringify({
            aadVersion: 1,
            chatId: "group-chat-id",
            senderUserId: USER_ID,
            senderDeviceId: "self-device",
            senderKeyId: "group-sender-key",
            messageCounter: 0,
            ciphertext: utf8ToBase64("snapshot unavailable content"),
            iv: utf8ToBase64("groupsnapiv1"),
            signature: "c2ln",
          }),
          encryptedKeysByRecipientId: {},
        },
      },
      USER_ID
    );

    expect(hydratedMessage.content).toBe("[Encrypted message unavailable]");
    expect(readMessageHydrationDiagnostics()[0]).toMatchObject({
      messageId: "snapshot-unavailable-message-id",
      phase: "snapshot",
      outcome: "snapshot-unavailable",
      ownMessage: true,
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      mirrorHit: false,
      archiveHit: false,
      buildRevision: "test-build-revision",
    });
  });

  it("restores a newly confirmed own message from the local outgoing mirror when archive persistence was skipped", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "mirrored-own-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "mirror-protected own message",
      [selfParticipant, participant],
      "client-mirror-own-message-id",
      null,
      { currentUserId: USER_ID }
    );

    const encryptedPayload =
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload ?? null;
    expect(encryptedPayload).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);
    vi.mocked(getMessagesRaw).mockResolvedValue([
      {
        id: "mirrored-own-message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:31:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "client-mirror-own-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload,
      },
    ]);

    const historySnapshot = await getEncryptedMessagesSnapshot("token", USER_ID, "chat-id");

    expect(historySnapshot.hydratedMessages).toEqual([
      expect.objectContaining({
        id: "mirrored-own-message-id",
        content: "mirror-protected own message",
      }),
    ]);
  });

  it("keeps a freshly echoed own message readable before the send ack resolves", async () => {
    const deferredSend = createDeferred<ApiChatMessage>();
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(() => deferredSend.promise);
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    const sendPromise = sendEncryptedMessage(
      "token",
      "chat-id",
      "pre-ack mirror own message",
      [selfParticipant, participant],
      "client-preack-mirror-message-id",
      null,
      { currentUserId: USER_ID }
    );

    for (let attempt = 0; attempt < 20 && vi.mocked(sendMessageRaw).mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const encryptedPayload =
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload ?? null;
    expect(encryptedPayload).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);

    const hydratedBeforeAck = await hydrateChatMessage(
      {
        id: "preack-own-message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:31:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "client-preack-mirror-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload,
      },
      USER_ID
    );

    expect(hydratedBeforeAck.content).toBe("pre-ack mirror own message");

    deferredSend.resolve({
      id: "preack-own-message-id",
      chatId: "chat-id",
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "client-preack-mirror-message-id",
      replyTo: null,
      reactions: [],
      encryptedPayload,
    });

    await expect(sendPromise).resolves.toMatchObject({
      id: "preack-own-message-id",
      clientMessageId: "client-preack-mirror-message-id",
      content: "pre-ack mirror own message",
    });
  });

  it("serializes encrypted sends per conversation so the second send waits for the first", async () => {
    const firstSend = createDeferred<ApiChatMessage>();
    const secondSend = createDeferred<ApiChatMessage>();
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => {
      if (request.clientMessageId === "client-first-queued-send") {
        return firstSend.promise;
      }

      return secondSend.promise;
    });
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    const firstPromise = sendEncryptedMessage(
      "token",
      "chat-id",
      "first queued send",
      [selfParticipant, participant],
      "client-first-queued-send",
      null,
      { currentUserId: USER_ID }
    );
    const secondPromise = sendEncryptedMessage(
      "token",
      "chat-id",
      "second queued send",
      [selfParticipant, participant],
      "client-second-queued-send",
      null,
      { currentUserId: USER_ID }
    );

    for (let attempt = 0; attempt < 20 && vi.mocked(sendMessageRaw).mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    expect(vi.mocked(sendMessageRaw).mock.calls).toHaveLength(1);
    expect(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].clientMessageId).toBe(
      "client-first-queued-send"
    );

    firstSend.resolve({
      id: "queued-first-message-id",
      chatId: "chat-id",
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "client-first-queued-send",
      replyTo: null,
      reactions: [],
      encryptedPayload: vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload,
    });

    for (let attempt = 0; attempt < 20 && vi.mocked(sendMessageRaw).mock.calls.length < 2; attempt += 1) {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    expect(vi.mocked(sendMessageRaw).mock.calls).toHaveLength(2);
    expect(vi.mocked(sendMessageRaw).mock.calls[1]?.[2].clientMessageId).toBe(
      "client-second-queued-send"
    );

    secondSend.resolve({
      id: "queued-second-message-id",
      chatId: "chat-id",
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:01.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "client-second-queued-send",
      replyTo: null,
      reactions: [],
      encryptedPayload: vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload,
    });

    await expect(Promise.all([firstPromise, secondPromise])).resolves.toMatchObject([
      {
        id: "queued-first-message-id",
        clientMessageId: "client-first-queued-send",
      },
      {
        id: "queued-second-message-id",
        clientMessageId: "client-second-queued-send",
      },
    ]);
  });

  it("records decrypt-failed mirror diagnostics when an own encrypted message falls back to the local mirror", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.spyOn(window.crypto.subtle, "generateKey").mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    vi.spyOn(window.crypto.subtle, "exportKey").mockResolvedValue({
      kty: "OKP",
      crv: "X25519",
      x: "generated",
    } as JsonWebKey);
    vi.spyOn(window.crypto.subtle, "deriveBits").mockResolvedValue(new Uint8Array(32).buffer);
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(resolveEncryptionDeviceBundles).mockResolvedValue([consumableDeviceBundle]);
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => ({
      id: "mirror-diagnostic-message-id",
      chatId,
      sender: selfParticipant,
      createdAt: "2026-04-09T10:31:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: request.clientMessageId ?? null,
      replyTo: null,
      reactions: [],
      encryptedPayload: request.encryptedPayload,
    }));
    window.sessionStorage.setItem(DEVICE_MATERIAL_KEY, JSON.stringify(localDeviceMaterial));

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "mirror diagnostics own message",
      [selfParticipant, participant],
      "client-mirror-diagnostic-message-id",
      null,
      { currentUserId: USER_ID }
    );

    const encryptedPayload =
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload ?? null;
    expect(encryptedPayload).not.toBeNull();

    window.sessionStorage.removeItem(DEVICE_MATERIAL_KEY);

    const hydratedMessage = await hydrateChatMessage(
      {
        id: "mirror-diagnostic-message-id",
        chatId: "chat-id",
        sender: selfParticipant,
        createdAt: "2026-04-09T10:31:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: "client-mirror-diagnostic-message-id",
        replyTo: null,
        reactions: [],
        encryptedPayload,
      },
      USER_ID
    );

    expect(hydratedMessage.content).toBe("mirror diagnostics own message");
    expect(readMessageHydrationDiagnostics()[0]).toMatchObject({
      messageId: "mirror-diagnostic-message-id",
      phase: "hydrate",
      outcome: "decrypt-failed-mirror-hit",
      ownMessage: true,
      mirrorHit: true,
      archiveHit: false,
    });
  });

  it("waits for history hydration batches before hydrating later realtime messages", async () => {
    const deferredMessages = createDeferred<ApiChatMessage[]>();
    vi.mocked(getMessagesRaw).mockReturnValue(deferredMessages.promise);

    const historyHydrationPromise = getEncryptedMessages("token", USER_ID, "chat-id");
    let realtimeHydrationSettled = false;
    const realtimeHydrationPromise = hydrateChatMessage(
      {
        id: "realtime-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:35:01.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: null,
      },
      USER_ID
    ).then(() => {
      realtimeHydrationSettled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(realtimeHydrationSettled).toBe(false);

    deferredMessages.resolve([
      {
        id: "history-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: null,
      },
    ]);

    const hydratedHistory = await historyHydrationPromise;
    expect(hydratedHistory).toHaveLength(1);
    expect(realtimeHydrationSettled).toBe(false);

    await realtimeHydrationPromise;
    expect(realtimeHydrationSettled).toBe(true);
  });

  it("defaults history loads to skip implicit delivered acknowledgements", async () => {
    vi.mocked(getMessagesRaw).mockResolvedValue([
      {
        id: "history-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: null,
      },
    ]);

    await getEncryptedMessages("token", USER_ID, "chat-id");

    expect(getMessagesRaw).toHaveBeenCalledWith("token", "chat-id", {
      acknowledgeDelivered: false,
    });
  });

  it("preserves explicit delivered acknowledgement overrides for history loads", async () => {
    vi.mocked(getMessagesRaw).mockResolvedValue([
      {
        id: "history-message-id",
        chatId: "chat-id",
        sender: participant,
        createdAt: "2026-04-09T10:35:00.000Z",
        editedAt: null,
        status: null,
        clientMessageId: null,
        replyTo: null,
        reactions: [],
        encryptedPayload: null,
      },
    ]);

    await getEncryptedMessages("token", USER_ID, "chat-id", {
      acknowledgeDelivered: true,
      limit: 12,
    });

    expect(getMessagesRaw).toHaveBeenCalledWith("token", "chat-id", {
      acknowledgeDelivered: true,
      limit: 12,
    });
  });


  it("clears pinned device trust without clearing trusted-device setup", () => {
    window.localStorage.setItem(
      PINNED_DEVICE_KEY,
      JSON.stringify({
        userId: REMOTE_USER_ID,
        deviceId: "device-id",
        identityFingerprint: "identity",
        identitySignatureFingerprint: "signature",
        signedPrekeyFingerprint: "signed-prekey",
        signedPrekeyId: 7,
        updatedAt: "2026-04-09T10:00:00.000Z",
      })
    );
    window.localStorage.setItem(TRUSTED_DEVICE_KEY, JSON.stringify(trustedDeviceRecord));

    clearPinnedEncryptionIdentity(REMOTE_USER_ID);

    expect(window.localStorage.getItem(PINNED_DEVICE_KEY)).toBeNull();
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
