import { ApiError } from "./api";
import type { AuthResponse } from "./types";
import type { TrustedBrowserUnlockRecord } from "./e2eeTrustedBrowser";

type StoredLocalIdentity = {
  publicKey: string;
  privateKey: string;
  accountPublicKey?: string;
  accountPrivateKey?: string;
  accountKeyVersion?: number;
  identityGeneration?: number;
  identitySigningPublicKey?: string;
  identitySigningPrivateKey?: string;
};

export async function createTrustedBrowserCredential(options: {
  session: AuthResponse;
  randomBytes: (length: number) => Uint8Array;
  toArrayBuffer: (bytes: Uint8Array) => ArrayBuffer;
  rpId: string;
  rpName: string;
  textEncoder: TextEncoder;
}) {
  const userIdBytes = options.textEncoder.encode(options.session.user.id);
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: options.toArrayBuffer(options.randomBytes(32)),
      rp: {
        id: options.rpId,
        name: options.rpName,
      },
      user: {
        id: options.toArrayBuffer(userIdBytes),
        name: options.session.user.username,
        displayName: options.session.user.displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      extensions: {
        prf: {
          eval: {
            first: options.toArrayBuffer(options.randomBytes(32)),
          },
        },
      } as Record<string, unknown>,
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new ApiError("Browser unlock setup was cancelled", 400);
  }

  return new Uint8Array(credential.rawId);
}

export async function deriveTrustedBrowserKey(options: {
  credentialId: Uint8Array;
  prfSalt: Uint8Array;
  rpId: string;
  randomBytes: (length: number) => Uint8Array;
  toArrayBuffer: (bytes: Uint8Array) => ArrayBuffer;
  bytesToBase64Url: (bytes: Uint8Array) => string;
}) {
  const credentialIdBase64Url = options.bytesToBase64Url(options.credentialId);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: options.toArrayBuffer(options.randomBytes(32)),
      rpId: options.rpId,
      allowCredentials: [
        {
          id: options.toArrayBuffer(options.credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60_000,
      extensions: {
        prf: {
          evalByCredential: {
            [credentialIdBase64Url]: {
              first: options.toArrayBuffer(options.prfSalt),
            },
          },
        },
      } as Record<string, unknown>,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new ApiError("Browser unlock was cancelled", 400);
  }

  const extensionResults = assertion.getClientExtensionResults() as {
    prf?: {
      enabled?: boolean;
      results?: {
        first?: ArrayBuffer;
      };
    };
  };
  const prfOutput = extensionResults.prf?.results?.first;
  if (!(prfOutput instanceof ArrayBuffer) || prfOutput.byteLength === 0) {
    throw new ApiError(
      "This authenticator does not expose the secure PRF output required for browser unlock",
      400
    );
  }

  return window.crypto.subtle.importKey(
    "raw",
    prfOutput,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function trustCurrentBrowserUnlock(options: {
  session: AuthResponse;
  ensureE2eeTransportStorageSchema: () => void;
  rememberRecoverySyncSession: (session: AuthResponse) => void;
  isTrustedBrowserUnlockSupported: () => boolean;
  readUnlockedIdentity: (userId: string) => StoredLocalIdentity | null;
  createTrustedBrowserCredential: (session: AuthResponse) => Promise<Uint8Array>;
  randomBytes: (length: number) => Uint8Array;
  deriveTrustedBrowserKey: (
    credentialId: Uint8Array,
    prfSalt: Uint8Array
  ) => Promise<CryptoKey>;
  textEncoder: TextEncoder;
  bytesToBase64: (bytes: Uint8Array) => string;
  writeTrustedBrowserUnlockRecord: (userId: string, record: TrustedBrowserUnlockRecord) => void;
  now?: () => string;
}) {
  options.ensureE2eeTransportStorageSchema();
  options.rememberRecoverySyncSession(options.session);

  if (!options.isTrustedBrowserUnlockSupported()) {
    throw new ApiError(
      "This browser does not support secure browser unlock for encrypted chats yet",
      400
    );
  }

  const identity = options.readUnlockedIdentity(options.session.user.id);
  if (!identity) {
    throw new ApiError("Unlock encrypted chats with your password first", 409);
  }

  const credentialId = await options.createTrustedBrowserCredential(options.session);
  const prfSalt = options.randomBytes(32);
  const wrappingKey = await options.deriveTrustedBrowserKey(credentialId, prfSalt);
  const iv = options.randomBytes(12);
  const payload = options.textEncoder.encode(JSON.stringify(identity));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
      },
      wrappingKey,
      payload
    )
  );

  options.writeTrustedBrowserUnlockRecord(options.session.user.id, {
    credentialId: options.bytesToBase64(credentialId),
    prfSalt: options.bytesToBase64(prfSalt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(ciphertext),
    createdAt: options.now?.() ?? new Date().toISOString(),
  });
}

export async function unlockWithTrustedBrowser(options: {
  session: AuthResponse;
  ensureE2eeTransportStorageSchema: () => void;
  rememberRecoverySyncSession: (session: AuthResponse) => void;
  isTrustedBrowserUnlockSupported: () => boolean;
  readTrustedBrowserUnlockRecord: (userId: string) => TrustedBrowserUnlockRecord | null;
  deriveTrustedBrowserKey: (
    credentialId: Uint8Array,
    prfSalt: Uint8Array
  ) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  textDecoder: TextDecoder;
  writeUnlockedIdentity: (userId: string, identity: StoredLocalIdentity) => void;
  syncEncryptionRecoverySnapshot: (session: AuthResponse) => Promise<void>;
}) {
  options.ensureE2eeTransportStorageSchema();
  options.rememberRecoverySyncSession(options.session);

  if (!options.isTrustedBrowserUnlockSupported()) {
    throw new ApiError(
      "This browser does not support secure browser unlock for encrypted chats yet",
      400
    );
  }

  const record = options.readTrustedBrowserUnlockRecord(options.session.user.id);
  if (!record) {
    throw new ApiError("Secure browser unlock is not configured in this browser yet", 404);
  }

  try {
    const wrappingKey = await options.deriveTrustedBrowserKey(
      options.base64ToBytes(record.credentialId),
      options.base64ToBytes(record.prfSalt)
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: options.base64ToBytes(record.iv) as BufferSource,
      },
      wrappingKey,
      options.base64ToBytes(record.ciphertext) as BufferSource
    );

    const parsedIdentity = JSON.parse(options.textDecoder.decode(plaintext)) as Partial<StoredLocalIdentity>;
    if (
      typeof parsedIdentity.publicKey !== "string" ||
      parsedIdentity.publicKey.length === 0 ||
      typeof parsedIdentity.privateKey !== "string" ||
      parsedIdentity.privateKey.length === 0
    ) {
      throw new Error("Invalid trusted identity");
    }

    const identity = {
      publicKey: parsedIdentity.publicKey,
      privateKey: parsedIdentity.privateKey,
      accountPublicKey:
        typeof parsedIdentity.accountPublicKey === "string" &&
        parsedIdentity.accountPublicKey.length > 0
          ? parsedIdentity.accountPublicKey
          : undefined,
      accountPrivateKey:
        typeof parsedIdentity.accountPrivateKey === "string" &&
        parsedIdentity.accountPrivateKey.length > 0
          ? parsedIdentity.accountPrivateKey
          : undefined,
      accountKeyVersion:
        typeof parsedIdentity.accountKeyVersion === "number" &&
        Number.isFinite(parsedIdentity.accountKeyVersion) &&
        parsedIdentity.accountKeyVersion >= 1
          ? parsedIdentity.accountKeyVersion
          : undefined,
      identitySigningPublicKey:
        typeof parsedIdentity.identitySigningPublicKey === "string" &&
        parsedIdentity.identitySigningPublicKey.length > 0
          ? parsedIdentity.identitySigningPublicKey
          : undefined,
      identitySigningPrivateKey:
        typeof parsedIdentity.identitySigningPrivateKey === "string" &&
        parsedIdentity.identitySigningPrivateKey.length > 0
          ? parsedIdentity.identitySigningPrivateKey
          : undefined,
    };
    options.writeUnlockedIdentity(options.session.user.id, identity);
    try {
      await options.syncEncryptionRecoverySnapshot(options.session);
    } catch {
      return;
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      "Browser unlock failed. Re-enter your password and trust this browser again",
      400
    );
  }
}
