import {
  ApiError,
  getMessagesRaw,
  getOwnEncryptionKeyBundle,
  resolveEncryptionPublicKeys,
  sendMessageRaw,
  updateMessage,
  upsertOwnEncryptionKeyBundle,
} from "./api";
import type {
  ApiChatMessage,
  AuthResponse,
  ChatMessage,
  Participant,
  UserEncryptionKeyBundle,
} from "./types";

const MESSAGE_SCHEME = "RSA-OAEP-256/AES-GCM";
const KDF_ITERATIONS = 250_000;
const ENCRYPTED_MESSAGE_UNAVAILABLE = "[Encrypted message unavailable]";
const UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:unlocked-e2ee:";
const REMEMBERED_UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:remembered-e2ee:";
const TRUSTED_DEVICE_STORAGE_PREFIX = "north-messenger:trusted-device-e2ee:";
const PINNED_PUBLIC_KEY_FINGERPRINT_STORAGE_PREFIX = "north-messenger:pinned-e2ee-fingerprint:";
const TRUSTED_DEVICE_RP_NAME = "North Messenger";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const publicKeyCache = new Map<string, string>();
const importedPublicKeyCache = new Map<string, Promise<CryptoKey>>();
const importedPrivateKeyCache = new Map<string, Promise<CryptoKey>>();
const unlockedIdentityByUserId = new Map<string, LocalIdentity>();

type LocalIdentity = {
  publicKey: string;
  privateKey: string;
};

type TrustedDeviceUnlockRecord = {
  credentialId: string;
  prfSalt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export function hasUnlockedPrivateEncryptionKey(userId: string) {
  return readUnlockedIdentity(userId) !== null;
}

export function isTrustedDeviceUnlockSupported() {
  if (typeof window === "undefined") {
    return false;
  }

  const credentialsContainer = navigator.credentials;
  return Boolean(
    window.isSecureContext &&
      typeof PublicKeyCredential !== "undefined" &&
      credentialsContainer &&
      typeof credentialsContainer.create === "function" &&
      typeof credentialsContainer.get === "function"
  );
}

export function hasTrustedDeviceUnlock(userId: string) {
  return readTrustedDeviceUnlockRecord(userId) !== null;
}

export function isUnavailableEncryptedMessage(content: string) {
  return content === ENCRYPTED_MESSAGE_UNAVAILABLE;
}

export function clearUnlockedEncryptionState(userId?: string) {
  if (userId) {
    const identity = unlockedIdentityByUserId.get(userId);
    if (identity) {
      importedPrivateKeyCache.delete(identity.privateKey);
      publicKeyCache.delete(userId);
      unlockedIdentityByUserId.delete(userId);
    }
    removeUnlockedIdentityFromSession(userId);
    removeUnlockedIdentityFromPersistentStorage(userId);
    return;
  }

  unlockedIdentityByUserId.forEach((identity, currentUserId) => {
    importedPrivateKeyCache.delete(identity.privateKey);
    publicKeyCache.delete(currentUserId);
    removeUnlockedIdentityFromSession(currentUserId);
    removeUnlockedIdentityFromPersistentStorage(currentUserId);
  });
  unlockedIdentityByUserId.clear();
  importedPublicKeyCache.clear();
  publicKeyCache.clear();
}

export async function ensureEncryptionReady(session: AuthResponse, password: string) {
  const unlockedIdentity = readUnlockedIdentity(session.user.id);
  if (unlockedIdentity) {
    publicKeyCache.set(session.user.id, unlockedIdentity.publicKey);
    return;
  }

  let bundle: UserEncryptionKeyBundle | null = null;
  try {
    bundle = await getOwnEncryptionKeyBundle(session.token);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      throw error;
    }
  }

  if (bundle) {
    await assertPinnedPublicKey(session.user.id, bundle.publicKey);
    const privateKey = await unwrapPrivateKey(bundle, password);
    const identity = {
      publicKey: bundle.publicKey,
      privateKey,
    };
    writeUnlockedIdentity(session.user.id, identity);
    publicKeyCache.set(session.user.id, bundle.publicKey);
    return;
  }

  const generatedIdentity = await generateIdentity();
  const wrappedPrivateKey = await wrapPrivateKey(generatedIdentity.privateKey, password);
  await upsertOwnEncryptionKeyBundle(session.token, {
    publicKey: generatedIdentity.publicKey,
    encryptedPrivateKey: wrappedPrivateKey.ciphertext,
    kdfSalt: wrappedPrivateKey.salt,
    kdfIv: wrappedPrivateKey.iv,
    kdfIterations: wrappedPrivateKey.iterations,
  });

  await assertPinnedPublicKey(session.user.id, generatedIdentity.publicKey);
  writeUnlockedIdentity(session.user.id, generatedIdentity);
  publicKeyCache.set(session.user.id, generatedIdentity.publicKey);
}

export async function prepareOwnEncryptionKeyBundleForPasswordChange(
  token: string,
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const unlockedIdentity = readUnlockedIdentity(userId);
  if (unlockedIdentity) {
    const wrappedPrivateKey = await wrapPrivateKey(unlockedIdentity.privateKey, newPassword);
    return {
      publicKey: unlockedIdentity.publicKey,
      encryptedPrivateKey: wrappedPrivateKey.ciphertext,
      kdfSalt: wrappedPrivateKey.salt,
      kdfIv: wrappedPrivateKey.iv,
      kdfIterations: wrappedPrivateKey.iterations,
    };
  }

  let bundle: UserEncryptionKeyBundle | null = null;
  try {
    bundle = await getOwnEncryptionKeyBundle(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  let privateKey: string;
  try {
    privateKey = await unwrapPrivateKey(bundle, currentPassword);
  } catch {
    throw new ApiError("Current password could not unlock encrypted chats", 400);
  }
  const wrappedPrivateKey = await wrapPrivateKey(privateKey, newPassword);
  return {
    publicKey: bundle.publicKey,
    encryptedPrivateKey: wrappedPrivateKey.ciphertext,
    kdfSalt: wrappedPrivateKey.salt,
    kdfIv: wrappedPrivateKey.iv,
    kdfIterations: wrappedPrivateKey.iterations,
  };
}

export async function trustCurrentDeviceUnlock(session: AuthResponse) {
  if (!isTrustedDeviceUnlockSupported()) {
    throw new ApiError("This browser does not support secure device unlock for encrypted chats yet", 400);
  }

  const identity = readUnlockedIdentity(session.user.id);
  if (!identity) {
    throw new ApiError("Unlock encrypted chats with your password first", 409);
  }

  const credentialId = await createTrustedDeviceCredential(session);
  const prfSalt = randomBytes(32);
  const wrappingKey = await deriveTrustedDeviceKey(credentialId, prfSalt);
  const iv = randomBytes(12);
  const payload = textEncoder.encode(JSON.stringify(identity));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      wrappingKey,
      payload
    )
  );

  writeTrustedDeviceUnlockRecord(session.user.id, {
    credentialId: bytesToBase64(credentialId),
    prfSalt: bytesToBase64(prfSalt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    createdAt: new Date().toISOString(),
  });
}

export async function unlockWithTrustedDevice(userId: string) {
  if (!isTrustedDeviceUnlockSupported()) {
    throw new ApiError("This browser does not support secure device unlock for encrypted chats yet", 400);
  }

  const record = readTrustedDeviceUnlockRecord(userId);
  if (!record) {
    throw new ApiError("Secure device unlock is not configured in this browser yet", 404);
  }

  try {
    const wrappingKey = await deriveTrustedDeviceKey(
      base64ToBytes(record.credentialId),
      base64ToBytes(record.prfSalt)
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(record.iv),
      },
      wrappingKey,
      base64ToBytes(record.ciphertext)
    );

    const parsedIdentity = JSON.parse(textDecoder.decode(plaintext)) as Partial<LocalIdentity>;
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
    };
    writeUnlockedIdentity(userId, identity);
    publicKeyCache.set(userId, parsedIdentity.publicKey);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("Device unlock failed. Re-enter your password and trust this device again", 400);
  }
}

export async function getEncryptedMessages(
  token: string,
  userId: string,
  chatId: string,
  options: { before?: string | null; limit?: number } = {}
) {
  const messages = await getMessagesRaw(token, chatId, options);
  return Promise.all(messages.map((message) => hydrateChatMessage(message, userId)));
}

export async function sendEncryptedMessage(
  token: string,
  chatId: string,
  content: string,
  participants: Participant[],
  clientMessageId?: string,
  replyToMessageId?: string | null,
  options?: {
    sendViaRealtime?: (request: {
      clientMessageId?: string;
      replyToMessageId?: string | null;
      encryptedPayload: {
        scheme: string;
        ciphertext: string;
        iv: string;
        encryptedKeysByUserId: Record<string, string>;
      };
    }) => Promise<ChatMessage> | null;
  }
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  const publicKeysByUserId = await loadPublicKeys(token, participants.map((participant) => participant.id));
  const missingParticipants = participants.filter((participant) => !publicKeysByUserId.has(participant.id));
  if (missingParticipants.length > 0) {
    throw new ApiError(
      "Encrypted chat is unavailable until every participant signs in after the E2EE upgrade",
      409,
      missingParticipants.map((participant) => participant.displayName)
    );
  }

  const encryptedPayload = await encryptMessage(normalizedContent, publicKeysByUserId);
  try {
    const realtimeResponse = await options?.sendViaRealtime?.({
      clientMessageId,
      replyToMessageId,
      encryptedPayload,
    });
    if (realtimeResponse) {
      return realtimeResponse;
    }
  } catch {
    // Fall back to HTTP when realtime send is unavailable or acknowledgement is delayed.
  }

  const response = await sendMessageRaw(token, chatId, {
    clientMessageId,
    replyToMessageId,
    encryptedPayload,
  });

  return {
    id: response.id,
    chatId: response.chatId,
    sender: response.sender,
    content: normalizedContent,
    createdAt: response.createdAt,
    editedAt: response.editedAt,
    status: response.status,
    clientMessageId: response.clientMessageId ?? clientMessageId ?? null,
    replyTo: response.replyTo,
    reactions: response.reactions ?? [],
  } satisfies ChatMessage;
}

export async function updateEncryptedMessage(
  token: string,
  userId: string,
  chatId: string,
  messageId: string,
  content: string,
  participants: Participant[]
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  const publicKeysByUserId = await loadPublicKeys(token, participants.map((participant) => participant.id));
  const missingParticipants = participants.filter((participant) => !publicKeysByUserId.has(participant.id));
  if (missingParticipants.length > 0) {
    throw new ApiError(
      "Encrypted chat is unavailable until every participant signs in after the E2EE upgrade",
      409,
      missingParticipants.map((participant) => participant.displayName)
    );
  }

  const encryptedPayload = await encryptMessage(normalizedContent, publicKeysByUserId);
  const response = await updateMessage(token, chatId, messageId, {
    encryptedPayload,
  });

  return {
    ...(await hydrateChatMessage(response, userId)),
    content: normalizedContent,
  } satisfies ChatMessage;
}

export async function primeEncryptedMessageRecipients(token: string, participants: Participant[]) {
  const publicKeysByUserId = await loadPublicKeys(token, participants.map((participant) => participant.id));
  await Promise.all([...publicKeysByUserId.values()].map((publicKey) => importPublicKey(publicKey)));
}

export async function hydrateChatMessage(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  if (!message.encryptedPayload) {
    return {
      id: message.id,
      chatId: message.chatId,
      sender: message.sender,
      content: ENCRYPTED_MESSAGE_UNAVAILABLE,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
      replyTo: message.replyTo,
      reactions: message.reactions ?? [],
    };
  }

  try {
    const content = await decryptMessage(message.encryptedPayload, userId);
    return {
      id: message.id,
      chatId: message.chatId,
      sender: message.sender,
      content,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
      replyTo: message.replyTo,
      reactions: message.reactions ?? [],
    };
  } catch {
    return {
      id: message.id,
      chatId: message.chatId,
      sender: message.sender,
      content: ENCRYPTED_MESSAGE_UNAVAILABLE,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
      replyTo: message.replyTo,
      reactions: message.reactions ?? [],
    };
  }
}

async function loadPublicKeys(token: string, userIds: string[]) {
  const keysByUserId = new Map<string, string>();
  const missingUserIds = Array.from(new Set(userIds)).filter((userId) => {
    const cachedPublicKey = publicKeyCache.get(userId);
    if (!cachedPublicKey) {
      return true;
    }

    keysByUserId.set(userId, cachedPublicKey);
    return false;
  });

  if (missingUserIds.length > 0) {
    const resolvedKeys = await resolveEncryptionPublicKeys(token, missingUserIds);
    await Promise.all(
      resolvedKeys.map((entry) => assertPinnedPublicKey(entry.userId, entry.publicKey))
    );
    resolvedKeys.forEach((entry) => {
      publicKeyCache.set(entry.userId, entry.publicKey);
      keysByUserId.set(entry.userId, entry.publicKey);
    });
  }

  return keysByUserId;
}

async function encryptMessage(content: string, publicKeysByUserId: Map<string, string>) {
  const contentKey = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
  const rawContentKey = await window.crypto.subtle.exportKey("raw", contentKey);
  const iv = randomBytes(12);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    contentKey,
    textEncoder.encode(content)
  );

  const encryptedKeysEntries = await Promise.all(
    [...publicKeysByUserId.entries()].map(async ([userId, publicKey]) => {
      const importedPublicKey = await importPublicKey(publicKey);
      const encryptedKey = await window.crypto.subtle.encrypt(
        {
          name: "RSA-OAEP",
        },
        importedPublicKey,
        rawContentKey
      );

      return [userId, bytesToBase64(new Uint8Array(encryptedKey))] as const;
    })
  );

  return {
    scheme: MESSAGE_SCHEME,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    encryptedKeysByUserId: Object.fromEntries(encryptedKeysEntries),
  };
}

async function decryptMessage(payload: ApiChatMessage["encryptedPayload"], userId: string) {
  if (!payload) {
    return "";
  }

  const identity = requireLocalIdentity(userId);
  const privateKey = await importPrivateKey(identity.privateKey);
  const rawContentKey = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    base64ToBytes(payload.encryptedKey)
  );
  const contentKey = await window.crypto.subtle.importKey(
    "raw",
    rawContentKey,
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(payload.iv),
    },
    contentKey,
    base64ToBytes(payload.ciphertext)
  );

  return textDecoder.decode(plaintext);
}

async function generateIdentity() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKey: JSON.stringify(publicKey),
    privateKey: JSON.stringify(privateKey),
  };
}

async function wrapPrivateKey(privateKey: string, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(privateKey)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: KDF_ITERATIONS,
  };
}

async function unwrapPrivateKey(bundle: UserEncryptionKeyBundle, password: string) {
  const wrappingKey = await deriveWrappingKey(
    password,
    base64ToBytes(bundle.kdfSalt),
    bundle.kdfIterations
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(bundle.kdfIv),
    },
    wrappingKey,
    base64ToBytes(bundle.encryptedPrivateKey)
  );

  return textDecoder.decode(plaintext);
}

async function deriveWrappingKey(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importPublicKey(serializedPublicKey: string) {
  const cachedKey = importedPublicKeyCache.get(serializedPublicKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importPromise = window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPublicKey) as JsonWebKey,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );

  importedPublicKeyCache.set(serializedPublicKey, importPromise);
  try {
    return await importPromise;
  } catch (error) {
    importedPublicKeyCache.delete(serializedPublicKey);
    throw error;
  }
}

async function importPrivateKey(serializedPrivateKey: string) {
  const cachedKey = importedPrivateKeyCache.get(serializedPrivateKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importPromise = window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPrivateKey) as JsonWebKey,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["decrypt"]
  );

  importedPrivateKeyCache.set(serializedPrivateKey, importPromise);
  try {
    return await importPromise;
  } catch (error) {
    importedPrivateKeyCache.delete(serializedPrivateKey);
    throw error;
  }
}

function requireLocalIdentity(userId: string) {
  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    throw new Error("Encrypted chat keys are not available in this browser session");
  }

  return identity;
}

function readUnlockedIdentity(userId: string): LocalIdentity | null {
  const inMemoryIdentity = unlockedIdentityByUserId.get(userId) ?? null;
  if (inMemoryIdentity) {
    return inMemoryIdentity;
  }

  const sessionIdentity = readUnlockedIdentityFromSession(userId);
  if (!sessionIdentity) {
    return null;
  }

  unlockedIdentityByUserId.set(userId, sessionIdentity);
  return sessionIdentity;
}

function writeUnlockedIdentity(userId: string, identity: LocalIdentity) {
  unlockedIdentityByUserId.set(userId, identity);
  writeUnlockedIdentityToSession(userId, identity);
}

async function assertPinnedPublicKey(userId: string, publicKey: string) {
  const fingerprint = await fingerprintPublicKey(publicKey);
  const pinnedFingerprint = readPinnedPublicKeyFingerprint(userId);
  if (!pinnedFingerprint) {
    writePinnedPublicKeyFingerprint(userId, fingerprint);
    return;
  }

  if (pinnedFingerprint !== fingerprint) {
    publicKeyCache.delete(userId);
    throw new ApiError(
      "Encryption identity changed for this account in this browser. Re-establish trust before continuing",
      409
    );
  }
}

function readTrustedDeviceUnlockRecord(userId: string): TrustedDeviceUnlockRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTrustedDeviceStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<TrustedDeviceUnlockRecord>;
    if (
      typeof parsedRecord.credentialId !== "string" ||
      typeof parsedRecord.prfSalt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      removeTrustedDeviceUnlockRecord(userId);
      return null;
    }

    return {
      credentialId: parsedRecord.credentialId,
      prfSalt: parsedRecord.prfSalt,
      iv: parsedRecord.iv,
      ciphertext: parsedRecord.ciphertext,
      createdAt: typeof parsedRecord.createdAt === "string" ? parsedRecord.createdAt : "",
    };
  } catch {
    removeTrustedDeviceUnlockRecord(userId);
    return null;
  }
}

function writeTrustedDeviceUnlockRecord(userId: string, record: TrustedDeviceUnlockRecord) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getTrustedDeviceStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

function removeTrustedDeviceUnlockRecord(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getTrustedDeviceStorageKey(userId));
  } catch {
    return;
  }
}

function readUnlockedIdentityFromSession(userId: string): LocalIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(getUnlockedIdentityStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedIdentity = JSON.parse(rawValue) as Partial<LocalIdentity>;
    if (
      typeof parsedIdentity.publicKey !== "string" ||
      parsedIdentity.publicKey.length === 0 ||
      typeof parsedIdentity.privateKey !== "string" ||
      parsedIdentity.privateKey.length === 0
    ) {
      removeUnlockedIdentityFromSession(userId);
      return null;
    }

    return {
      publicKey: parsedIdentity.publicKey,
      privateKey: parsedIdentity.privateKey,
    };
  } catch {
    removeUnlockedIdentityFromSession(userId);
    return null;
  }
}

function writeUnlockedIdentityToSession(userId: string, identity: LocalIdentity) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getUnlockedIdentityStorageKey(userId), JSON.stringify(identity));
  } catch {
    return;
  }
}

function removeUnlockedIdentityFromSession(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getUnlockedIdentityStorageKey(userId));
  } catch {
    return;
  }
}

function removeUnlockedIdentityFromPersistentStorage(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getRememberedUnlockedIdentityStorageKey(userId));
  } catch {
    return;
  }
}

function getUnlockedIdentityStorageKey(userId: string) {
  return `${UNLOCKED_IDENTITY_STORAGE_PREFIX}${userId}`;
}

function getRememberedUnlockedIdentityStorageKey(userId: string) {
  return `${REMEMBERED_UNLOCKED_IDENTITY_STORAGE_PREFIX}${userId}`;
}

function getTrustedDeviceStorageKey(userId: string) {
  return `${TRUSTED_DEVICE_STORAGE_PREFIX}${userId}`;
}

function getPinnedPublicKeyFingerprintStorageKey(userId: string) {
  return `${PINNED_PUBLIC_KEY_FINGERPRINT_STORAGE_PREFIX}${userId}`;
}

function readPinnedPublicKeyFingerprint(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(getPinnedPublicKeyFingerprintStorageKey(userId));
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writePinnedPublicKeyFingerprint(userId: string, fingerprint: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getPinnedPublicKeyFingerprintStorageKey(userId), fingerprint);
  } catch {
    return;
  }
}

async function fingerprintPublicKey(publicKey: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", textEncoder.encode(publicKey));
  return bytesToBase64(new Uint8Array(digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createTrustedDeviceCredential(session: AuthResponse) {
  const userIdBytes = textEncoder.encode(session.user.id);
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: toArrayBuffer(randomBytes(32)),
      rp: {
        id: getTrustedDeviceRpId(),
        name: TRUSTED_DEVICE_RP_NAME,
      },
      user: {
        id: toArrayBuffer(userIdBytes),
        name: session.user.username,
        displayName: session.user.displayName,
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
            first: toArrayBuffer(randomBytes(32)),
          },
        },
      } as Record<string, unknown>,
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new ApiError("Device unlock setup was cancelled", 400);
  }

  return new Uint8Array(credential.rawId);
}

async function deriveTrustedDeviceKey(credentialId: Uint8Array, prfSalt: Uint8Array) {
  const credentialIdBase64Url = bytesToBase64Url(credentialId);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(randomBytes(32)),
      rpId: getTrustedDeviceRpId(),
      allowCredentials: [
        {
          id: toArrayBuffer(credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60_000,
      extensions: {
        prf: {
          evalByCredential: {
            [credentialIdBase64Url]: {
              first: toArrayBuffer(prfSalt),
            },
          },
        },
      } as Record<string, unknown>,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new ApiError("Device unlock was cancelled", 400);
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
    throw new ApiError("This authenticator does not expose the secure PRF output required for device unlock", 400);
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

function getTrustedDeviceRpId() {
  return window.location.hostname;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
