import {
  ApiError,
  getMessagesRaw,
  getOwnEncryptionKeyBundle,
  resolveEncryptionPublicKeys,
  sendMessageRaw,
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

export function hasUnlockedPrivateEncryptionKey(userId: string) {
  return readUnlockedIdentity(userId) !== null;
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
    return;
  }

  unlockedIdentityByUserId.forEach((identity, currentUserId) => {
    importedPrivateKeyCache.delete(identity.privateKey);
    publicKeyCache.delete(currentUserId);
    removeUnlockedIdentityFromSession(currentUserId);
  });
  unlockedIdentityByUserId.clear();
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
    const privateKey = await unwrapPrivateKey(bundle, password);
    writeUnlockedIdentity(session.user.id, {
      publicKey: bundle.publicKey,
      privateKey,
    });
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

  writeUnlockedIdentity(session.user.id, generatedIdentity);
  publicKeyCache.set(session.user.id, generatedIdentity.publicKey);
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
  options?: {
    sendViaRealtime?: (request: {
      clientMessageId?: string;
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
    encryptedPayload,
  });

  return {
    id: response.id,
    chatId: response.chatId,
    sender: response.sender,
    content: normalizedContent,
    createdAt: response.createdAt,
    status: response.status,
    clientMessageId: response.clientMessageId ?? clientMessageId ?? null,
    reactions: response.reactions ?? [],
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
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
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
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
      reactions: message.reactions ?? [],
    };
  } catch {
    return {
      id: message.id,
      chatId: message.chatId,
      sender: message.sender,
      content: ENCRYPTED_MESSAGE_UNAVAILABLE,
      createdAt: message.createdAt,
      status: message.status,
      clientMessageId: message.clientMessageId ?? null,
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

function getUnlockedIdentityStorageKey(userId: string) {
  return `${UNLOCKED_IDENTITY_STORAGE_PREFIX}${userId}`;
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
