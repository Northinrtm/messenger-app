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
    getOwnActiveGroupHistoryKey: vi.fn(),
    getOwnEncryptionAccountKey: vi.fn(),
    getOwnGroupHistoryKeys: vi.fn(),
    getOwnEncryptionRecoverySnapshot: vi.fn(),
    resolveEncryptionAccountKeys: vi.fn(),
    resetOwnEncryptionIdentity: vi.fn(),
    updateMessage: vi.fn(),
    upsertOwnEncryptionAccountKey: vi.fn(),
    upsertOwnEncryptionRecoverySnapshot: vi.fn(),
  };
});

vi.mock("./realtime", () => ({
  sendMessageRaw: vi.fn(),
}));

import {
  ApiError,
  getMessagesRaw,
  getOwnActiveGroupHistoryKey,
  getOwnEncryptionAccountKey,
  getOwnGroupHistoryKeys,
  getOwnEncryptionRecoverySnapshot,
  resolveEncryptionAccountKeys,
  resetOwnEncryptionIdentity,
  upsertOwnEncryptionAccountKey,
  upsertOwnEncryptionRecoverySnapshot,
} from "./api";
import { sendMessageRaw } from "./realtime";
import {
  clearUnlockedEncryptionState,
  ensureEncryptionReady,
  getEncryptedMessages,
  getEncryptedMessagesSnapshot,
  hasUnlockedPrivateEncryptionKey,
  hydrateChatMessage,
  hydrateChatMessageSnapshot,
  primeEncryptedMessageRecipients,
  sendEncryptedMessage,
} from "./e2ee";
import { ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE } from "./e2eeShared";
import { readMessageHydrationDiagnostics } from "./messageHydrationDiagnostics";
import type { ApiChatMessage } from "./types";

const USER_ID = "user-id";
const REMOTE_USER_ID = "remote-user-id";
const REMOTE_USER_ID_TWO = "remote-user-id-two";
const SESSION_KEY = `north-messenger:unlocked-e2ee:${USER_ID}`;
const AUTO_UNLOCKED_KEY = `north-messenger:auto-unlocked-e2ee:${USER_ID}`;
const REMEMBERED_KEY = `north-messenger:remembered-e2ee:${USER_ID}`;
const TRUSTED_BROWSER_KEY = `north-messenger:trusted-browser-e2ee:${USER_ID}`;
const GROUP_HISTORY_KEY = `north-messenger:group-history-key-e2ee:${USER_ID}`;
const STORAGE_SCHEMA_KEY = "north-messenger:e2ee-storage-schema-version";
const testTextEncoder = new TextEncoder();
const testTextDecoder = new TextDecoder();

const validAccountPublicKey = JSON.stringify({
  key_ops: ["encrypt"],
  ext: true,
  alg: "RSA-OAEP-256",
  kty: "RSA",
  n: "uxuOqicwBx9XS9P_Idp_N69zGRno7-JNZhy7FZWjD8mhOOsmrehqytj2DCzkTnynQw3PXwF4xtO6o5tR2pa7yTDwHjO8dbttxZRyjCLuuRL7kijBhpYT1vU0mCRmU0WfUyRSKOvHGAf2HcBjkDQRUoNhwrqEcVSkQkKNR5BNGbHAvFFk4JPiVBfFI53Pt6Nee9nWBmkKVtoOEqpKo_ONJpDoYuFuCbDZiTSe96qxWmGHWbC1culT1lDEKSx5vKay2XjxmOXZJ2oDaLo4X5RaFR1VQnkPyYNZjYgd0vZxGDyiN8h-8aqVVWGlGHg4WelovqNK_LSOgx-8WE7o99PIlQ",
  e: "AQAB",
});

const validAccountPrivateKey = JSON.stringify({
  key_ops: ["decrypt"],
  ext: true,
  alg: "RSA-OAEP-256",
  kty: "RSA",
  n: "uxuOqicwBx9XS9P_Idp_N69zGRno7-JNZhy7FZWjD8mhOOsmrehqytj2DCzkTnynQw3PXwF4xtO6o5tR2pa7yTDwHjO8dbttxZRyjCLuuRL7kijBhpYT1vU0mCRmU0WfUyRSKOvHGAf2HcBjkDQRUoNhwrqEcVSkQkKNR5BNGbHAvFFk4JPiVBfFI53Pt6Nee9nWBmkKVtoOEqpKo_ONJpDoYuFuCbDZiTSe96qxWmGHWbC1culT1lDEKSx5vKay2XjxmOXZJ2oDaLo4X5RaFR1VQnkPyYNZjYgd0vZxGDyiN8h-8aqVVWGlGHg4WelovqNK_LSOgx-8WE7o99PIlQ",
  e: "AQAB",
  d: "Rg8EdSulLRWMH0Vqw2dHuTcFlsF_2cpXhsN9PZDA9Jlft6s82WMsEXX5cwegGM9N5aqXGhC4A2KmALqYhItqFuQvFG_0wfSDHrb9yQEPd9bmwYxnIhixpww7PDhs5AMuq_ful4npC1N30R4HaahFUCsHgN1L2A-ETZcTxVb_t32WIT9-OLcj9Tq2-pDLdPpNBGLaeiZFxb8tgOct8wfHb-n1LovFaPPnU_QobZEx-CrqVfN3mwHFBidsSxqO6ObMMW5VF8v7n1XwrEw1NsXBf9_nmoaFPvzqp-W6CHLDpl2eYsKAVHM4XOQpDdnhqs-eE3nJTnZ1wZ5K6hfGiVSExQ",
  p: "4TRcdrnaFL0c1VuYVEFKHG-2qpEsbWJusp0GwkM6T1bJcLy3nkzvKbgTwMsfes269h8KFHYXxIxwFOrdVDiaxD-0hoIq3WXqG3FiYIIw1ZRDZauYQVkngMScHyVFFaqMT1RInQMwZb-KMIeF094s6fQTvxfri0l9oZ43YlcMO6c",
  q: "1LGN9-HrpwHKTyayk3Ld5S6DbkGkD7NCYFSiUvjp9KxoyDvg-R1wx-LJC06sCcUXS1VmzDw4_xJ_e0Dd3HwBnQm41Tn1sUPwrhMQLYvMJsW2EH0T3WTER1FaOVkr_Rj8S3-kXRYSpYL-y9_mU8jJbr7LYN40brWEYy-oVMKccWM",
  dp: "QGqz0BoVMT1u0_ChP-h1BHFH9L4V0SwIsfqMhmCoey097YttklA7UNmgfNMdLAlQ4zm5rmShI81v-eu8Z2zRiDUYtCjjjfSq5DKoiyZyRYVlSd2tbXPNAt46MgZ9HldsTvyy0Iaq_0-sfXkmZJX2ju0MAOscqvjYgLQ671wq2Z0",
  dq: "Dup0vlGFqSyi93ILS_PeQ9hDN1Q7IS69FOxahd8W6SW-I2yvlkjOQ_ZPiw91WSoNPCc9Ek2W4ax2bDpcVL4NjunDoJBz_n55PnvvwoHvSzjKT9W1su0CJs45uZPbVeCOsOy-phiKLjlFjR6ilHWcSrvun1h17N2l7x7Ee006k2k",
  qi: "NWbeBkJLswHIMo8E7haRp6MI_vysqvWJnWI8eV2hnzD0xC17b6xhHROE19rwOwk_XrL06QLut-A7YO8fm7kyQlWO56JQvt6Xo02G3s3FCEXJfTAxaLVcq6KHz8vOXwTajsz6hMJDW9F-SJuJSjYJ9l_PQHTWXJrqMNPrCFlk0Ec",
});
const validAccountPublicJwk = JSON.parse(validAccountPublicKey) as JsonWebKey;
const validAccountPrivateJwk = JSON.parse(validAccountPrivateKey) as JsonWebKey;
const rotatedAccountPublicKey = JSON.stringify({
  ...validAccountPublicJwk,
  n: `${validAccountPublicJwk.n?.slice(0, -1) ?? "rotated"}A`,
});
const validIdentitySigningPublicKey = JSON.stringify({
  key_ops: ["verify"],
  ext: true,
  alg: "PS256",
  kty: "RSA",
  n: validAccountPublicJwk.n,
  e: validAccountPublicJwk.e,
});
const validIdentitySigningPrivateKey = JSON.stringify({
  key_ops: ["sign"],
  ext: true,
  alg: "PS256",
  kty: "RSA",
  n: validAccountPrivateJwk.n,
  e: validAccountPrivateJwk.e,
  d: validAccountPrivateJwk.d,
  p: validAccountPrivateJwk.p,
  q: validAccountPrivateJwk.q,
  dp: validAccountPrivateJwk.dp,
  dq: validAccountPrivateJwk.dq,
  qi: validAccountPrivateJwk.qi,
});
const validIdentitySigningPublicJwk = JSON.parse(validIdentitySigningPublicKey) as JsonWebKey;
const validIdentitySigningPrivateJwk = JSON.parse(validIdentitySigningPrivateKey) as JsonWebKey;
const validRemoteAccountBundleSignature = "cmVtb3RlLWFjY291bnQtc2lnbmF0dXJl";
const validOwnAccountBundleSignature = "b3duLWFjY291bnQtc2lnbmF0dXJl";
const identityGeneration = 1;
const identityKeyAlgorithm = "RSA-PSS-SHA256";
const accountKeyAlgorithm = "RSA-OAEP-3072-SHA256";
const signedAt = "2026-04-20T10:00:00.000Z";

const identity = {
  publicKey: '{"kty":"RSA","n":"public"}',
  privateKey: '{"kty":"RSA","d":"private"}',
  accountPublicKey: validAccountPublicKey,
  accountPrivateKey: validAccountPrivateKey,
  accountKeyVersion: 1,
  identityGeneration,
  identitySigningPublicKey: validIdentitySigningPublicKey,
  identitySigningPrivateKey: validIdentitySigningPrivateKey,
};

const trustedBrowserRecord = {
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

function createActiveHistoryKeyAccess(
  chatId: string,
  options?: {
    historyKeyId?: string;
    historyKeyMaterial?: string;
    membershipVersion?: number;
    createdAt?: string;
    historyPolicy?: "DIRECT" | "JOIN_ONLY" | "FULL_HISTORY";
  }
) {
  const createdAt = options?.createdAt ?? "2026-04-20T10:00:00.000Z";
  const historyKeyId = options?.historyKeyId ?? `${chatId}-history-key-id`;
  return {
    historyKeyId,
    wrappedKeyPayloadJson: "",
    serverGrantPayloadJson: JSON.stringify({
      aadVersion: 1,
      context: "north.group-history-key-grant.v1",
      chatId,
      historyKeyId,
      historyKey: options?.historyKeyMaterial ?? utf8ToBase64(`${chatId}-history-key-material`),
      membershipVersion: options?.membershipVersion ?? 0,
      historyPolicy: options?.historyPolicy ?? "DIRECT",
      createdAt,
    }),
    createdAt,
    updatedAt: createdAt,
  };
}


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

function mockGeneratedAccountKeyPair() {
  const accountPublicKey = { kind: "account-public" } as unknown as CryptoKey;
  const accountPrivateKey = { kind: "account-private" } as unknown as CryptoKey;
  const identitySigningPublicKey = { kind: "identity-public" } as unknown as CryptoKey;
  const identitySigningPrivateKey = { kind: "identity-private" } as unknown as CryptoKey;
  vi.spyOn(window.crypto.subtle, "generateKey").mockImplementation(async (algorithm) => {
    if (
      typeof algorithm === "object" &&
      algorithm !== null &&
      "name" in algorithm &&
      algorithm.name === "RSA-PSS"
    ) {
      return {
        publicKey: identitySigningPublicKey,
        privateKey: identitySigningPrivateKey,
      } as CryptoKeyPair;
    }

    return {
      publicKey: accountPublicKey,
      privateKey: accountPrivateKey,
    } as CryptoKeyPair;
  });
  vi.spyOn(window.crypto.subtle, "exportKey").mockImplementation(async (_format, key) => {
    if (key === identitySigningPublicKey) {
      return validIdentitySigningPublicJwk;
    }
    if (key === identitySigningPrivateKey) {
      return validIdentitySigningPrivateJwk;
    }
    return key === accountPublicKey ? validAccountPublicJwk : validAccountPrivateJwk;
  });
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
    vi.mocked(getOwnActiveGroupHistoryKey).mockImplementation(async (_token, chatId) =>
      createActiveHistoryKeyAccess(chatId)
    );
    vi.mocked(getOwnGroupHistoryKeys).mockResolvedValue([]);
    vi.spyOn(window.crypto.subtle, "sign").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "verify").mockResolvedValue(true);
    vi.mocked(resolveEncryptionAccountKeys).mockImplementation(async (_token, userIds) =>
      userIds.map((userId) => ({
        userId,
        publicKey: validAccountPublicKey,
        accountKeyVersion: 1,
        identityGeneration,
        identitySigningPublicKey: validIdentitySigningPublicKey,
        identityKeyAlgorithm,
        accountKeyAlgorithm,
        signedAt,
        signature: validRemoteAccountBundleSignature,
      }))
    );
    vi.mocked(getOwnEncryptionAccountKey).mockResolvedValue({
      publicKey: validAccountPublicKey,
      accountKeyVersion: 1,
      identityGeneration,
      identitySigningPublicKey: validIdentitySigningPublicKey,
      identityKeyAlgorithm,
      accountKeyAlgorithm,
      signedAt,
      signature: validOwnAccountBundleSignature,
      createdAt: signedAt,
      updatedAt: signedAt,
    });
    vi.mocked(resetOwnEncryptionIdentity).mockResolvedValue({
      publicKey: validAccountPublicKey,
      accountKeyVersion: 1,
      identityGeneration,
      identitySigningPublicKey: validIdentitySigningPublicKey,
      identityKeyAlgorithm,
      accountKeyAlgorithm,
      signedAt,
      signature: validOwnAccountBundleSignature,
      createdAt: signedAt,
      updatedAt: signedAt,
    });
    vi.mocked(upsertOwnEncryptionAccountKey).mockResolvedValue({
      publicKey: validAccountPublicKey,
      accountKeyVersion: 1,
      identityGeneration,
      identitySigningPublicKey: validIdentitySigningPublicKey,
      identityKeyAlgorithm,
      accountKeyAlgorithm,
      signedAt,
      signature: validOwnAccountBundleSignature,
      createdAt: signedAt,
      updatedAt: signedAt,
    });
  });

  afterEach(() => {
    clearUnlockedEncryptionState();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not restore an unlocked identity from persistent storage even on trusted browsers", () => {
    window.localStorage.setItem(TRUSTED_BROWSER_KEY, JSON.stringify(trustedBrowserRecord));
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
    window.localStorage.setItem(TRUSTED_BROWSER_KEY, JSON.stringify(trustedBrowserRecord));
    window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(identity));

    clearUnlockedEncryptionState(USER_ID);

    expect(hasUnlockedPrivateEncryptionKey(USER_ID)).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTO_UNLOCKED_KEY)).toBeNull();
    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
  });

  it("reports missing participant account keys with current account-key wording", async () => {
    vi.mocked(resolveEncryptionAccountKeys).mockResolvedValue([]);

    await expect(
      primeEncryptedMessageRecipients(
        "token",
        [selfParticipant, participant],
        { currentUserId: USER_ID }
      )
    ).rejects.toMatchObject({
      message: "Encrypted chat is unavailable because some participants have not initialized account encryption yet",
      status: 409,
      details: ["Remote User"],
    });
  });

  it("fails with a recovery error instead of silently rekeying when the identity signing key is missing", async () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...identity,
        identitySigningPublicKey: undefined,
        identitySigningPrivateKey: undefined,
      })
    );

    await expect(
      primeEncryptedMessageRecipients(
        "token",
        [selfParticipant, participant],
        { currentUserId: USER_ID }
      )
    ).rejects.toMatchObject({
      message: ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
      status: 409,
    });
  });

  it("sends and decrypts direct messages with chat epoch envelopes", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
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
    expect(getOwnActiveGroupHistoryKey).toHaveBeenCalledWith("token", "chat-id");
    expect(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload).toMatchObject({
      scheme: "CHAT-EPOCH-KEY-AES-GCM",
      sharedEnvelope: expect.any(String),
    });
    const firstSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as {
      aadVersion?: number;
      chatId?: string;
      senderUserId?: string;
      historyKeyId?: string;
    };
    expect(firstSharedEnvelope).toMatchObject({
      aadVersion: 1,
      chatId: "chat-id",
      senderUserId: USER_ID,
      historyKeyId: expect.any(String),
    });

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
    expect(getOwnActiveGroupHistoryKey).toHaveBeenCalledTimes(1);
    const secondSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { historyKeyId?: string };
    expect(secondSharedEnvelope.historyKeyId).toBe(firstSharedEnvelope.historyKeyId);
  });

  it("reuses the server-selected active history key for sends", async () => {
    const serverHistoryKeyId = "server-history-key-id";
    const serverCreatedAt = "2026-04-20T10:00:00.000Z";
    const serverKeyMaterial = utf8ToBase64("server-active-history-key");

    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(getOwnActiveGroupHistoryKey).mockResolvedValue({
      historyKeyId: serverHistoryKeyId,
      wrappedKeyPayloadJson: "",
      serverGrantPayloadJson: JSON.stringify({
        aadVersion: 1,
        context: "north.group-history-key-grant.v1",
        chatId: "chat-id",
        historyKeyId: serverHistoryKeyId,
        historyKey: serverKeyMaterial,
        membershipVersion: 2,
        historyPolicy: "DIRECT",
        createdAt: serverCreatedAt,
      }),
      createdAt: serverCreatedAt,
      updatedAt: serverCreatedAt,
    });
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

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "server selected secret",
      [selfParticipant, participant],
      "client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(getOwnActiveGroupHistoryKey).toHaveBeenCalledWith("token", "chat-id");
    const sharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { historyKeyId?: string };
    expect(sharedEnvelope.historyKeyId).toBe(serverHistoryKeyId);
  });

  it("reuses the locally cached active history key without remote lookup", async () => {
    const localHistoryKeyId = "local-history-key-id";
    const localCreatedAt = "2026-04-19T10:00:00.000Z";
    const localKeyMaterial = utf8ToBase64("local-active-history-key");

    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "chat-id": localHistoryKeyId,
        },
        keysById: {
          [localHistoryKeyId]: {
            historyKeyId: localHistoryKeyId,
            chatId: "chat-id",
            keyMaterial: localKeyMaterial,
            createdAt: localCreatedAt,
            updatedAt: localCreatedAt,
          },
        },
      })
    );

    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
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

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "cached secret",
      [selfParticipant, participant],
      "client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(getOwnActiveGroupHistoryKey).not.toHaveBeenCalled();
    const sharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { historyKeyId?: string };
    expect(sharedEnvelope.historyKeyId).toBe(localHistoryKeyId);
  });

  it("invalidates a stale local active history key and retries once with the server-selected key", async () => {
    const staleHistoryKeyId = "stale-history-key-id";
    const activeHistoryKeyId = "active-history-key-id";
    const staleCreatedAt = "2026-04-18T10:00:00.000Z";
    const activeCreatedAt = "2026-04-20T10:00:00.000Z";

    window.sessionStorage.setItem(
      GROUP_HISTORY_KEY,
      JSON.stringify({
        currentKeyIdsByChatId: {
          "chat-id": staleHistoryKeyId,
        },
        keysById: {
          [staleHistoryKeyId]: {
            historyKeyId: staleHistoryKeyId,
            chatId: "chat-id",
            keyMaterial: utf8ToBase64("stale-active-history-key"),
            createdAt: staleCreatedAt,
            updatedAt: staleCreatedAt,
          },
        },
      })
    );

    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(getOwnActiveGroupHistoryKey).mockResolvedValue({
      historyKeyId: activeHistoryKeyId,
      wrappedKeyPayloadJson: "",
      serverGrantPayloadJson: JSON.stringify({
        aadVersion: 1,
        context: "north.group-history-key-grant.v1",
        chatId: "chat-id",
        historyKeyId: activeHistoryKeyId,
        historyKey: utf8ToBase64("server-active-history-key"),
        membershipVersion: 3,
        historyPolicy: "DIRECT",
        createdAt: activeCreatedAt,
      }),
      createdAt: activeCreatedAt,
      updatedAt: activeCreatedAt,
    });
    vi.mocked(sendMessageRaw)
      .mockRejectedValueOnce(
        new ApiError("Encrypted chat epoch history key is no longer active", 409)
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

    await sendEncryptedMessage(
      "token",
      "chat-id",
      "retry secret",
      [selfParticipant, participant],
      "client-message-id",
      null,
      { currentUserId: USER_ID }
    );

    expect(sendMessageRaw).toHaveBeenCalledTimes(2);
    expect(getOwnActiveGroupHistoryKey).toHaveBeenCalledTimes(1);

    const firstSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { historyKeyId?: string };
    const secondSharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[1]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as { historyKeyId?: string };
    expect(firstSharedEnvelope.historyKeyId).toBe(staleHistoryKeyId);
    expect(secondSharedEnvelope.historyKeyId).toBe(activeHistoryKeyId);
  });

  it("keeps a confirmed own message readable even if its echoed chat epoch metadata is later tampered", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
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
    await ensureEncryptionReady(currentSession, "password");
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
    const sharedEnvelope = JSON.parse(
      encryptedPayload?.sharedEnvelope ?? "{}"
    ) as Record<string, unknown>;
    sharedEnvelope.historyKeyId = "00000000-0000-0000-0000-000000000999";
    encryptedPayload.sharedEnvelope = JSON.stringify(sharedEnvelope);

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

  it("sends group messages with chat epoch envelopes for participant accounts", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
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
    await sendEncryptedMessage(
      "token",
      "group-chat-id",
      "group secret",
      [selfParticipant, participant, secondParticipant],
      "group-client-message-id",
      null,
      { currentUserId: USER_ID, isDirectChat: false }
    );

    expect(getOwnActiveGroupHistoryKey).toHaveBeenCalledWith("token", "group-chat-id");
    expect(resolveEncryptionAccountKeys).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload).toMatchObject({
      scheme: "CHAT-EPOCH-KEY-AES-GCM",
      sharedEnvelope: expect.any(String),
    });
    const sharedEnvelope = JSON.parse(
      vi.mocked(sendMessageRaw).mock.calls[0]?.[2].encryptedPayload?.sharedEnvelope ?? "{}"
    ) as {
      aadVersion?: number;
      chatId?: string;
      senderUserId?: string;
      historyKeyId?: string;
    };
    expect(sharedEnvelope).toMatchObject({
      aadVersion: 1,
      chatId: "group-chat-id",
      senderUserId: USER_ID,
      historyKeyId: expect.any(String),
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

  it("serializes encrypted sends per conversation so the second send waits for the first", async () => {
    const firstSend = createDeferred<ApiChatMessage>();
    const secondSend = createDeferred<ApiChatMessage>();
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.mocked(sendMessageRaw).mockImplementation(async (_token, chatId, request) => {
      if (request.clientMessageId === "client-first-queued-send") {
        return firstSend.promise;
      }

      return secondSend.promise;
    });
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

  it("records decrypt-failed archive diagnostics when an own encrypted message falls back to the local archive", async () => {
    vi.spyOn(window.crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
    mockGeneratedAccountKeyPair();
    vi.spyOn(window.crypto.subtle, "deriveKey").mockResolvedValue({} as CryptoKey);
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) => bufferSourceToArrayBuffer(data)
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(async (algorithm, _key, data) => {
      if (
        typeof algorithm === "object" &&
        algorithm !== null &&
        "additionalData" in algorithm &&
        (algorithm as AesGcmParams & { additionalData?: BufferSource }).additionalData
      ) {
        throw new DOMException("forced message decrypt failure", "OperationError");
      }

      return bufferSourceToArrayBuffer(data);
    });
    await ensureEncryptionReady(currentSession, "password");
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
      outcome: "decrypt-failed-archive-hit",
      ownMessage: true,
      mirrorHit: false,
      archiveHit: true,
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

  it("hydrates a prefetched raw history page without refetching the same messages", async () => {
    const prefetchedMessages: ApiChatMessage[] = [
      {
        id: "prefetched-history-message-id",
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
    ];

    const historySnapshot = await getEncryptedMessagesSnapshot("token", USER_ID, "chat-id", {
      prefetchedRawMessages: prefetchedMessages,
    });

    expect(historySnapshot.rawMessages).toEqual(prefetchedMessages);
    expect(getMessagesRaw).not.toHaveBeenCalled();
  });

});
