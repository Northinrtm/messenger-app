import {
  ApiError,
  downloadEncryptedChatAttachment,
  getMessagesRaw,
  getOwnGroupHistoryKeys,
  getOwnEncryptionRecoverySnapshot,
  listOwnEncryptionDevices,
  resolveEncryptionDeviceBundles,
  upsertGroupHistoryKey,
  upsertOwnEncryptionRecoverySnapshot,
  upsertOwnEncryptionDevice,
  uploadEncryptedChatAttachment,
  updateMessage,
} from "./api";
import { sendMessageRaw } from "./realtime";
import type {
  ApiChatMessage,
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
  EncryptedMessagePayload,
  Participant,
  UserEncryptionDevice,
  UserEncryptionDeviceBundle,
  UserEncryptionRecoverySnapshot,
} from "./types";
import {
  ENCRYPTED_MESSAGE_UNAVAILABLE,
  ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
  PINNED_DEVICE_BUNDLE_STORAGE_PREFIX,
  clearPinnedEncryptionIdentity,
  isEncryptionIdentityChangedError,
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
import {
  TRUSTED_DEVICE_STORAGE_PREFIX,
  hasTrustedDeviceUnlock,
  isTrustedDeviceUnlockSupported,
} from "./e2eeTrustedDevice";
import { recordSendDiagnosticStep } from "./sendDiagnostics";

const MESSAGE_SCHEME_DEVICE = "X3DH-DEVICE-AES-GCM";
const MESSAGE_SCHEME_GROUP_SENDER_KEY = "GROUP-SENDER-KEY-AES-GCM";
const MESSAGE_CONTENT_ENVELOPE_TYPE = "north.message.v1";
const KDF_ITERATIONS = 250_000;
const UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:unlocked-e2ee:";
const AUTO_UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:auto-unlocked-e2ee:";
const REMEMBERED_UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:remembered-e2ee:";
const ENCRYPTION_DEVICE_STORAGE_PREFIX = "north-messenger:device-e2ee:";
const REMEMBERED_ENCRYPTION_DEVICE_STORAGE_PREFIX = "north-messenger:remembered-device-e2ee:";
const ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX = "north-messenger:device-session-e2ee:";
const REMEMBERED_ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX =
  "north-messenger:remembered-device-session-e2ee:";
const GROUP_SENDER_CHAIN_STORAGE_PREFIX = "north-messenger:group-sender-chain-e2ee:";
const GROUP_HISTORY_KEY_STORAGE_PREFIX = "north-messenger:group-history-key-e2ee:";
const DECRYPTED_MESSAGE_ARCHIVE_STORAGE_PREFIX = "north-messenger:decrypted-message-archive:";
const E2EE_STORAGE_SCHEMA_VERSION_KEY = "north-messenger:e2ee-storage-schema-version";
const E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION = "5";
const DECRYPTED_MESSAGE_ARCHIVE_DB_NAME = "north-messenger-decrypted-message-archive";
const DECRYPTED_MESSAGE_ARCHIVE_DB_VERSION = 1;
const DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME = "messages";
const DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME = "by-user-chat-created-at";
const TRUSTED_DEVICE_RP_NAME = "North Messenger";
const DEVICE_AGREEMENT_KEY_ALGORITHM = "X25519";
const DEVICE_SIGNATURE_KEY_ALGORITHM = "Ed25519";
const DEVICE_ONE_TIME_PREKEY_COUNT = 16;
const DEVICE_MIN_ONE_TIME_PREKEYS = 4;
const DEVICE_SIGNED_PREKEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_PREKEY_GRACE_MS = 24 * 60 * 60 * 1000;
const DEVICE_KEY_ID_SPACE = 2_000_000_000 - DEVICE_ONE_TIME_PREKEY_COUNT - 32;
const DEVICE_MAX_MESSAGE_GAP = 4_096;
const MAX_ARCHIVED_DEVICE_SESSIONS_PER_PEER_DEVICE = 4;
const GROUP_MAX_MESSAGE_GAP = 4_096;
const GROUP_SENDER_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DIRECT_ENVELOPE_AAD_VERSION = 1;
const GROUP_SHARED_ENVELOPE_AAD_VERSION = 1;
const GROUP_HISTORY_ENVELOPE_AAD_VERSION = 1;
const GROUP_SENDER_DISTRIBUTION_AAD_VERSION = 1;
const GROUP_HISTORY_KEY_GRANT_AAD_VERSION = 1;
const DEVICE_REGISTRATION_CACHE_TTL_MS = 30_000;
const DEVICE_PREPARATION_CACHE_TTL_MS = 30_000;
const RECOVERY_SNAPSHOT_SYNC_DEBOUNCE_MS = 1_000;
const RECOVERY_SYNC_SESSION_WAIT_TIMEOUT_MS = 1_000;
const RECOVERY_SYNC_SESSION_WAIT_POLL_MS = 25;
const RECOVERY_SNAPSHOT_PAYLOAD_VERSION = 1;
const SIGNED_PREKEY_SIGNATURE_CONTEXT = "north-signed-prekey-v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const importedDevicePublicKeyCache = new Map<string, Promise<CryptoKey>>();
const unlockedIdentityByUserId = new Map<string, LocalIdentity>();
const inFlightEncryptionDeviceRegistration = new Map<string, Promise<void>>();
const completedEncryptionDeviceRegistration = new Map<string, number>();
const inFlightDevicePreparation = new Map<string, Promise<void>>();
const completedDevicePreparation = new Map<string, number>();
const inFlightMessageHydrationBatchByUserId = new Map<string, Promise<void>>();
const inFlightMessageHydrationByUserId = new Map<string, Promise<void>>();
const recoverySyncSessionByUserId = new Map<string, AuthResponse>();
const scheduledRecoverySnapshotSyncByUserId = new Map<string, number>();
const inFlightRecoverySnapshotSyncByUserId = new Map<string, Promise<void>>();
const queuedRecoverySnapshotSyncByUserId = new Set<string>();
const inFlightRecoverySyncSessionWaitByUserId = new Map<string, Promise<AuthResponse | null>>();
const DECRYPTED_ATTACHMENT_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const decryptedAttachmentCache = new Map<
  string,
  {
    blob: Blob;
    fileName: string;
  }
>();
let decryptedAttachmentCacheSizeBytes = 0;

export {
  clearPinnedEncryptionIdentity,
  isEncryptionIdentityChangedError,
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
export { hasTrustedDeviceUnlock, isTrustedDeviceUnlockSupported } from "./e2eeTrustedDevice";
let decryptedMessageArchiveDbPromise: Promise<IDBDatabase> | null = null;

function ensureE2eeTransportStorageSchema() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const currentSchemaVersion = window.localStorage.getItem(E2EE_STORAGE_SCHEMA_VERSION_KEY);
    if (currentSchemaVersion === E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION) {
      return;
    }

    clearLegacyE2eeTransportStorage(window.localStorage);
    clearLegacyE2eeTransportStorage(window.sessionStorage);
    importedDevicePublicKeyCache.clear();
    completedEncryptionDeviceRegistration.clear();
    completedDevicePreparation.clear();
    window.localStorage.setItem(
      E2EE_STORAGE_SCHEMA_VERSION_KEY,
      E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION
    );
  } catch {
    return;
  }
}

function clearLegacyE2eeTransportStorage(storage: Storage) {
  const transportStoragePrefixes = [
    PINNED_DEVICE_BUNDLE_STORAGE_PREFIX,
    ENCRYPTION_DEVICE_STORAGE_PREFIX,
    REMEMBERED_ENCRYPTION_DEVICE_STORAGE_PREFIX,
    ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX,
    REMEMBERED_ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX,
    GROUP_SENDER_CHAIN_STORAGE_PREFIX,
    GROUP_HISTORY_KEY_STORAGE_PREFIX,
  ];
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const currentKey = storage.key(index);
    if (
      currentKey &&
      transportStoragePrefixes.some((prefix) => currentKey.startsWith(prefix))
    ) {
      keysToRemove.push(currentKey);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

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

type AutoUnlockedIdentityRecord = {
  publicKey: string;
  privateKey: string;
  createdAt: string;
};

type DeviceOneTimePrekeyMaterial = {
  keyId: number;
  publicKey: string;
  privateKey: string;
};

type RetiredDeviceOneTimePrekeyMaterial = DeviceOneTimePrekeyMaterial & {
  retiredAt: string;
  expiresAt: string;
};

type RetiredSignedPrekeyMaterial = {
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeyPrivateKey: string;
  signedPrekeyAlgorithm: string;
  retiredAt: string;
  expiresAt: string;
};

type DeviceEncryptionMaterial = {
  deviceId: string | null;
  materialId: string;
  identityKey: string;
  identityPrivateKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignaturePrivateKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeyPrivateKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekeys: DeviceOneTimePrekeyMaterial[];
  retiredOneTimePrekeys?: RetiredDeviceOneTimePrekeyMaterial[];
  retiredSignedPrekeys?: RetiredSignedPrekeyMaterial[];
  createdAt: string;
  signedPrekeyCreatedAt: string;
};

type RegisteredDeviceEncryptionMaterial = DeviceEncryptionMaterial & {
  deviceId: string;
};

type RememberedDeviceEncryptionMaterialRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type DeviceSessionRecord = {
  sessionId: string;
  peerUserId: string;
  peerDeviceId: string;
  sessionOrigin?: "initiator" | "responder";
  ownMaterialId: string;
  remoteIdentityKey: string;
  remoteIdentitySignatureKey: string;
  remoteSignedPrekeyId: number;
  remoteSignedPrekeyPublicKey: string;
  remoteOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  sendingRatchetPublicKey: string;
  sendingRatchetPrivateKey: string;
  remoteRatchetPublicKey: string | null;
  sendingRatchetUsed: boolean;
  pendingSendingRatchetStep: boolean;
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  receivingChains?: Record<
    string,
    {
      chainKey: string;
      counter: number;
    }
  >;
  sendingCounter: number;
  receivingCounter: number;
  cachedMessageKeys?: Record<string, string>;
  establishedAt: string;
};

type RememberedDeviceSessionRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type RememberedGroupSenderChainStateRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type RememberedUnlockedIdentityRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type RememberedDecryptedMessageArchiveRecord = {
  messageId: string;
  chatId: string;
  createdAt: string;
  editedAt: string | null;
  salt: string;
  iv: string;
  ciphertext: string;
  archivedAt: string;
};

type ArchivedDecryptedMessagePayload = {
  content: string;
  attachments?: ChatMessageAttachment[];
};

type MessageContentEnvelope = {
  type: typeof MESSAGE_CONTENT_ENVELOPE_TYPE;
  text: string;
  attachments?: ChatMessageAttachment[];
};

type EncryptedRecoverySnapshotPayloadRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type RecoverySnapshotPayload = {
  version: number;
  archivedMessages: RememberedDecryptedMessageArchiveRecord[];
};

type DirectDeviceEnvelope = {
  aadVersion: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  senderIdentityKey: string;
  senderIdentitySignatureKey: string;
  initiatorEphemeralPublicKey: string;
  ratchetPublicKey: string;
  recipientSignedPrekeyId: number;
  recipientOneTimePrekeyId: number | null;
  messageCounter: number;
  ciphertext: string;
  iv: string;
};

type GroupSharedEnvelope = {
  aadVersion: number;
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  messageCounter: number;
  ciphertext: string;
  iv: string;
  signature: string;
};

type GroupHistoryEnvelope = {
  aadVersion: number;
  historyKeyId: string;
  ciphertext: string;
  iv: string;
};

type GroupSenderKeyDistribution = {
  aadVersion: number;
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  messageCounter: number;
  chainKey: string;
};

type GroupSenderChainRecord = {
  chatId: string;
  ownMaterialId: string;
  senderDeviceId: string;
  senderKeyId: string;
  recipientDeviceSetHash: string;
  chainKey: string;
  nextMessageCounter: number;
  createdAt: string;
};

type GroupInboundSenderChainRecord = {
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  nextChainKey: string;
  nextMessageCounter: number;
  cachedMessageKeys?: Record<string, string>;
  updatedAt: string;
};

type GroupSenderChainState = {
  outboundChains: Record<string, GroupSenderChainRecord>;
  inboundChains: Record<string, GroupInboundSenderChainRecord>;
};

type GroupHistoryKeyGrantPayload = {
  aadVersion: number;
  chatId: string;
  historyKeyId: string;
  historyKey: string;
  createdAt: string;
};

type GroupHistoryKeyRecord = {
  historyKeyId: string;
  chatId: string;
  keyMaterial: string;
  createdAt: string;
  updatedAt: string;
};

type GroupHistoryKeyState = {
  currentKeyIdsByChatId: Record<string, string>;
  keysById: Record<string, GroupHistoryKeyRecord>;
};

type PinnedDeviceBundleRecord = {
  userId: string;
  deviceId: string;
  identityFingerprint: string;
  identitySignatureFingerprint: string;
  signedPrekeyFingerprint: string;
  signedPrekeyId: number;
  updatedAt: string;
};

export function hasUnlockedPrivateEncryptionKey(userId: string) {
  return readUnlockedIdentity(userId) !== null;
}

function rememberRecoverySyncSession(session: AuthResponse) {
  recoverySyncSessionByUserId.set(session.user.id, session);
}

function waitForRecoverySyncSession(userId: string) {
  const existingSession = recoverySyncSessionByUserId.get(userId);
  if (existingSession) {
    return Promise.resolve(existingSession);
  }

  const inFlightWait = inFlightRecoverySyncSessionWaitByUserId.get(userId);
  if (inFlightWait) {
    return inFlightWait;
  }

  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const waitPromise = new Promise<AuthResponse | null>((resolve) => {
    const deadline = Date.now() + RECOVERY_SYNC_SESSION_WAIT_TIMEOUT_MS;

    const poll = () => {
      const session = recoverySyncSessionByUserId.get(userId);
      if (session) {
        resolve(session);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }

      window.setTimeout(poll, RECOVERY_SYNC_SESSION_WAIT_POLL_MS);
    };

    poll();
  }).finally(() => {
    if (inFlightRecoverySyncSessionWaitByUserId.get(userId) === waitPromise) {
      inFlightRecoverySyncSessionWaitByUserId.delete(userId);
    }
  });

  inFlightRecoverySyncSessionWaitByUserId.set(userId, waitPromise);
  return waitPromise;
}

function clearRecoverySnapshotSyncState(userId?: string) {
  if (typeof window !== "undefined") {
    if (userId) {
      const timerId = scheduledRecoverySnapshotSyncByUserId.get(userId);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    } else {
      scheduledRecoverySnapshotSyncByUserId.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    }
  }

  if (userId) {
    recoverySyncSessionByUserId.delete(userId);
    inFlightRecoverySnapshotSyncByUserId.delete(userId);
    inFlightRecoverySyncSessionWaitByUserId.delete(userId);
    scheduledRecoverySnapshotSyncByUserId.delete(userId);
    queuedRecoverySnapshotSyncByUserId.delete(userId);
    return;
  }

  recoverySyncSessionByUserId.clear();
  inFlightRecoverySnapshotSyncByUserId.clear();
  inFlightRecoverySyncSessionWaitByUserId.clear();
  scheduledRecoverySnapshotSyncByUserId.clear();
  queuedRecoverySnapshotSyncByUserId.clear();
}

function scheduleEncryptionRecoverySnapshotSync(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!hasUnlockedPrivateEncryptionKey(userId) || !recoverySyncSessionByUserId.has(userId)) {
    return;
  }

  const existingTimer = scheduledRecoverySnapshotSyncByUserId.get(userId);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  const timerId = window.setTimeout(() => {
    scheduledRecoverySnapshotSyncByUserId.delete(userId);
    const session = recoverySyncSessionByUserId.get(userId);
    if (!session) {
      return;
    }
    void syncEncryptionRecoverySnapshot(session);
  }, RECOVERY_SNAPSHOT_SYNC_DEBOUNCE_MS);

  scheduledRecoverySnapshotSyncByUserId.set(userId, timerId);
}

async function syncEncryptionRecoverySnapshot(session: AuthResponse) {
  rememberRecoverySyncSession(session);

  const userId = session.user.id;
  const inFlightSync = inFlightRecoverySnapshotSyncByUserId.get(userId);
  if (inFlightSync) {
    queuedRecoverySnapshotSyncByUserId.add(userId);
    await inFlightSync;
    return;
  }

  const syncPromise = syncEncryptionRecoverySnapshotInternal(session);
  inFlightRecoverySnapshotSyncByUserId.set(userId, syncPromise);
  try {
    await syncPromise;
  } finally {
    if (inFlightRecoverySnapshotSyncByUserId.get(userId) === syncPromise) {
      inFlightRecoverySnapshotSyncByUserId.delete(userId);
    }
    if (queuedRecoverySnapshotSyncByUserId.delete(userId)) {
      const latestSession = recoverySyncSessionByUserId.get(userId);
      if (latestSession) {
        void syncEncryptionRecoverySnapshot(latestSession);
      }
    }
  }
}

async function syncEncryptionRecoverySnapshotInternal(session: AuthResponse) {
  const userId = session.user.id;
  if (typeof window === "undefined" || !hasUnlockedPrivateEncryptionKey(userId)) {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  const rememberedIdentityRecord = readRememberedUnlockedIdentityRecord(userId);
  if (!identity || !rememberedIdentityRecord) {
    return;
  }

  const archivedMessages = await readAllStoredArchivedDecryptedMessageRecords(userId);
  const snapshotPayloadRecord = await encryptRecoverySnapshotPayload(
    identity.privateKey,
    archivedMessages
  );
  await upsertOwnEncryptionRecoverySnapshot(session.token, {
    snapshotPayloadJson: JSON.stringify(snapshotPayloadRecord),
    wrappedIdentityRecordJson: JSON.stringify(rememberedIdentityRecord),
  });
}

export async function syncEncryptionDeviceState(session: AuthResponse) {
  ensureE2eeTransportStorageSchema();
  rememberRecoverySyncSession(session);

  if (!hasUnlockedPrivateEncryptionKey(session.user.id)) {
    return;
  }

  try {
    await Promise.all([
      ensureRegisteredEncryptionDevice(session),
      syncEncryptionRecoverySnapshot(session),
    ]);
  } catch {
    // Device and recovery sync are best-effort. Messaging should keep working on the last known good state.
  }
}

export async function readLatestArchivedDecryptedChatMessage(userId: string, chatId: string) {
  const archivedMessage = await readLatestArchivedDecryptedMessageRecord(userId, chatId);
  if (!archivedMessage) {
    return null;
  }

  return {
    id: archivedMessage.messageId,
    chatId: archivedMessage.chatId,
    content: archivedMessage.content,
    createdAt: archivedMessage.createdAt,
    editedAt: archivedMessage.editedAt,
    replyTo: null,
    attachments: archivedMessage.attachments,
  };
}

function getRecoverableEncryptedEnvelopeErrorMode(error: unknown): "session" | "device" | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }

  if (
    [
      "Encrypted device envelope recipient one-time prekey is invalid",
      "Encrypted device envelope recipient one-time prekey sender is invalid",
      "Encrypted device envelope recipient one-time prekey was already used",
      "Encrypted device envelope recipient prekey is stale",
      "Encrypted device envelope message counter is stale",
      "Encrypted device envelope chain metadata is invalid",
      "Encrypted device envelope must start at counter zero",
      "Encrypted device envelope message counter advanced too far",
      "Encrypted group envelope message counter is stale",
      "Encrypted group envelope must start at counter zero",
      "Encrypted group envelope message counter advanced too far",
      "Group history key recipient prekey is stale",
      "Encrypted payload contains unknown recipient devices",
      "Encrypted payload must include every active participant device",
      "Encrypted device envelope recipient device is invalid",
    ].includes(error.message)
  ) {
    return "session";
  }

  return (
    [
      "Encrypted device envelope sender device is invalid",
      "Encrypted device envelope sender identity does not match the registered device",
    ].includes(error.message)
      ? "device"
      : null
  );
}

function resetLocalEncryptionSessionsForRetry(userId: string, clearGroupSenderChainsToo: boolean) {
  removeDeviceSessions(userId);
  removeRememberedDeviceSessions(userId);
  clearCompletedDevicePreparation(userId);
  if (clearGroupSenderChainsToo) {
    removeGroupSenderChains(userId);
    removeGroupHistoryKeys(userId);
  }
}

function resetLocalEncryptionDeviceForRetry(userId: string) {
  removeEncryptionDeviceMaterial(userId);
  removeRememberedEncryptionDeviceMaterial(userId);
  clearCompletedEncryptionDeviceRegistration(userId);
  clearCompletedDevicePreparation(userId);
}

async function recoverLocalEncryptionStateForRetry(
  currentUserId: string,
  clearGroupSenderChainsToo: boolean,
  session: AuthResponse | undefined,
  repairMode: "session" | "device"
) {
  resetLocalEncryptionSessionsForRetry(currentUserId, clearGroupSenderChainsToo);
  if (repairMode !== "device") {
    return;
  }

  resetLocalEncryptionDeviceForRetry(currentUserId);
  if (session && session.user.id === currentUserId) {
    await waitForEncryptionDeviceRegistration(session);
  }
}

export function clearUnlockedEncryptionState(userId?: string) {
  ensureE2eeTransportStorageSchema();

  if (userId) {
    const identity = unlockedIdentityByUserId.get(userId);
    if (identity) {
      unlockedIdentityByUserId.delete(userId);
    }
    clearInFlightMessageHydration(userId);
    removeUnlockedIdentityFromSession(userId);
    removeUnlockedIdentityFromPersistentStorage(userId);
    removeEncryptionDeviceMaterial(userId);
    removeRememberedEncryptionDeviceMaterial(userId);
    removeDeviceSessions(userId);
    removeRememberedDeviceSessions(userId);
    removeGroupSenderChains(userId);
    removeGroupHistoryKeys(userId);
    clearCompletedEncryptionDeviceRegistration(userId);
    clearCompletedDevicePreparation(userId);
    clearRecoverySnapshotSyncState(userId);
    return;
  }

  unlockedIdentityByUserId.forEach((identity, currentUserId) => {
    clearInFlightMessageHydration(currentUserId);
    removeUnlockedIdentityFromSession(currentUserId);
    removeUnlockedIdentityFromPersistentStorage(currentUserId);
    removeEncryptionDeviceMaterial(currentUserId);
    removeRememberedEncryptionDeviceMaterial(currentUserId);
    removeDeviceSessions(currentUserId);
    removeRememberedDeviceSessions(currentUserId);
    removeGroupSenderChains(currentUserId);
    removeGroupHistoryKeys(currentUserId);
    clearCompletedEncryptionDeviceRegistration(currentUserId);
  });
  unlockedIdentityByUserId.clear();
  importedDevicePublicKeyCache.clear();
  completedEncryptionDeviceRegistration.clear();
  completedDevicePreparation.clear();
  clearRecoverySnapshotSyncState();
  clearInFlightMessageHydration();
}

export function lockUnlockedEncryptionState(userId?: string) {
  ensureE2eeTransportStorageSchema();

  if (userId) {
    unlockedIdentityByUserId.delete(userId);
    clearInFlightMessageHydration(userId);
    removeUnlockedIdentityFromSession(userId);
    removeEncryptionDeviceMaterial(userId);
    removeDeviceSessions(userId);
    removeRememberedDeviceSessions(userId);
    removeGroupSenderChains(userId);
    removeGroupHistoryKeys(userId);
    clearCompletedEncryptionDeviceRegistration(userId);
    clearCompletedDevicePreparation(userId);
    clearRecoverySnapshotSyncState(userId);
    return;
  }

  unlockedIdentityByUserId.forEach((identity, currentUserId) => {
    clearInFlightMessageHydration(currentUserId);
    removeUnlockedIdentityFromSession(currentUserId);
    removeEncryptionDeviceMaterial(currentUserId);
    removeDeviceSessions(currentUserId);
    removeRememberedDeviceSessions(currentUserId);
    removeGroupSenderChains(currentUserId);
    removeGroupHistoryKeys(currentUserId);
    clearCompletedEncryptionDeviceRegistration(currentUserId);
  });
  unlockedIdentityByUserId.clear();
  completedEncryptionDeviceRegistration.clear();
  completedDevicePreparation.clear();
  clearRecoverySnapshotSyncState();
  clearInFlightMessageHydration();
}

export async function ensureEncryptionReady(session: AuthResponse, password: string) {
  ensureE2eeTransportStorageSchema();
  rememberRecoverySyncSession(session);

  const unlockedIdentity = readUnlockedIdentity(session.user.id);
  if (unlockedIdentity) {
    await rememberUnlockedIdentity(session.user.id, unlockedIdentity, password);
    await ensureRegisteredEncryptionDevice(session);
    try {
      await syncEncryptionRecoverySnapshot(session);
    } catch {
      // Recovery snapshot upload is best-effort after a successful local unlock.
    }
    return;
  }

  const rememberedIdentity = await readRememberedUnlockedIdentity(session.user.id, password);
  if (rememberedIdentity) {
    writeUnlockedIdentity(session.user.id, rememberedIdentity);
    await rememberUnlockedIdentity(session.user.id, rememberedIdentity, password);
    await ensureRegisteredEncryptionDevice(session);
    try {
      await syncEncryptionRecoverySnapshot(session);
    } catch {
      // Recovery snapshot upload is best-effort after a successful local unlock.
    }
    return;
  }

  const restoredIdentity = await restoreEncryptionRecoverySnapshot(session, password);
  if (restoredIdentity) {
    await ensureRegisteredEncryptionDevice(session);
    try {
      await syncEncryptionRecoverySnapshot(session);
    } catch {
      // Recovery snapshot upload is best-effort after a successful local unlock.
    }
    return;
  }

  const existingDevices = await listOwnEncryptionDevices(session.token);
  if (existingDevices.length > 0) {
    throw new ApiError(ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE, 409);
  }

  const localVaultIdentity = createLocalVaultIdentity();
  writeUnlockedIdentity(session.user.id, localVaultIdentity);
  await rememberUnlockedIdentity(session.user.id, localVaultIdentity, password);
  await ensureRegisteredEncryptionDevice(session);
  try {
    await syncEncryptionRecoverySnapshot(session);
  } catch {
    // Recovery snapshot upload is best-effort after a successful local unlock.
  }
}

export async function resetEncryptionAfterPasswordReset(session: AuthResponse, password: string) {
  if (!password.trim()) {
    throw new ApiError("Enter your account password before resetting encrypted chats", 400);
  }

  ensureE2eeTransportStorageSchema();
  const userId = session.user.id;

  clearUnlockedEncryptionState(userId);
  removeTrustedDeviceUnlockRecord(userId);
  clearPinnedDeviceBundleRecords(userId);
  await clearStoredArchivedDecryptedMessageRecords(userId);
  rememberRecoverySyncSession(session);

  const localVaultIdentity = createLocalVaultIdentity();
  writeUnlockedIdentity(userId, localVaultIdentity);
  await rememberUnlockedIdentity(userId, localVaultIdentity, password);
  await ensureRegisteredEncryptionDevice(session);
  await syncEncryptionRecoverySnapshot(session);
}

export async function resecureLocalEncryptionStateForPasswordChange(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  ensureE2eeTransportStorageSchema();

  const unlockedIdentity = readUnlockedIdentity(userId);
  if (unlockedIdentity) {
    await rememberUnlockedIdentity(userId, unlockedIdentity, newPassword);
    return;
  }

  const rememberedIdentity = await readRememberedUnlockedIdentity(userId, currentPassword);
  if (!rememberedIdentity) {
    throw new ApiError("Current password could not unlock encrypted chats", 400);
  }
  writeUnlockedIdentity(userId, rememberedIdentity);
  await rememberUnlockedIdentity(userId, rememberedIdentity, newPassword);
}

export async function trustCurrentDeviceUnlock(session: AuthResponse) {
  ensureE2eeTransportStorageSchema();
  rememberRecoverySyncSession(session);

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

export async function unlockWithTrustedDevice(session: AuthResponse) {
  ensureE2eeTransportStorageSchema();
  rememberRecoverySyncSession(session);

  if (!isTrustedDeviceUnlockSupported()) {
    throw new ApiError("This browser does not support secure device unlock for encrypted chats yet", 400);
  }

  const record = readTrustedDeviceUnlockRecord(session.user.id);
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
    writeUnlockedIdentity(session.user.id, identity);
    await ensureRegisteredEncryptionDevice(session);
    try {
      await syncEncryptionRecoverySnapshot(session);
    } catch {
      // Recovery snapshot upload is best-effort after a successful local unlock.
    }
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
  options: {
    beforeServerOrder?: number | null;
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {}
) {
  ensureE2eeTransportStorageSchema();

  return withSerializedMessageHydrationBatch(userId, async () => {
    const messages = await getMessagesRaw(token, chatId, {
      ...options,
      acknowledgeDelivered: options.acknowledgeDelivered ?? false,
    });
    const hydratedMessages: ChatMessage[] = [];
    for (const message of messages) {
      hydratedMessages.push(await hydrateChatMessageInternal(message, userId));
    }
    return hydratedMessages;
  });
}

export async function getEncryptedMessagesSnapshot(
  token: string,
  userId: string,
  chatId: string,
  options: {
    beforeServerOrder?: number | null;
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {}
) {
  ensureE2eeTransportStorageSchema();

  const rawMessages = await getMessagesRaw(token, chatId, {
    ...options,
    acknowledgeDelivered: options.acknowledgeDelivered ?? false,
  });
  const hydratedMessages = await Promise.all(
    rawMessages.map((message) => hydrateChatMessageSnapshot(message, userId))
  );

  return {
    rawMessages,
    hydratedMessages,
  };
}

export async function prepareEncryptedMessageAttachments(
  token: string,
  chatId: string,
  files: File[],
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: AttachmentUploadProgress) => void;
  } = {}
): Promise<ChatMessageAttachment[]> {
  const attachments: ChatMessageAttachment[] = [];
  const fileCount = files.length;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;
  for (const [fileIndex, file] of files.entries()) {
    throwIfAttachmentUploadAborted(options.signal);
    const fileName = normalizeAttachmentFileName(file.name);
    const mimeType = normalizeAttachmentMimeType(file.type);
    reportAttachmentUploadProgress(options.onProgress, {
      fileIndex,
      fileCount,
      fileName,
      loadedBytes: completedBytes,
      phase: "encrypting",
      totalBytes,
    });
    const keyBytes = randomBytes(32);
    const iv = randomBytes(12);
    const key = await window.crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      await file.arrayBuffer()
    );
    throwIfAttachmentUploadAborted(options.signal);
    const upload = await uploadEncryptedChatAttachment(
      token,
      chatId,
      new Blob([ciphertext], { type: "application/octet-stream" }),
      {
        signal: options.signal,
        onProgress: (progress) => {
          const loadedBytes = completedBytes + Math.round(file.size * progress.ratio);
          reportAttachmentUploadProgress(options.onProgress, {
            fileIndex,
            fileCount,
            fileName,
            loadedBytes,
            phase: "uploading",
            totalBytes,
          });
        },
      }
    );
    completedBytes += file.size;
    reportAttachmentUploadProgress(options.onProgress, {
      fileIndex,
      fileCount,
      fileName,
      loadedBytes: completedBytes,
      phase: "uploading",
      totalBytes,
    });
    rememberDecryptedAttachment(
      chatId,
      upload.id,
      fileName,
      file.slice(0, file.size, mimeType)
    );
    attachments.push({
      id: upload.id,
      fileName,
      mimeType,
      sizeBytes: file.size,
      ciphertextSizeBytes: upload.ciphertextSizeBytes,
      key: bytesToBase64(keyBytes),
      iv: bytesToBase64(iv),
    });
  }
  return attachments;
}

export type AttachmentUploadProgress = {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  loadedBytes: number;
  phase: "encrypting" | "uploading";
  ratio: number;
  totalBytes: number;
};

function reportAttachmentUploadProgress(
  onProgress: ((progress: AttachmentUploadProgress) => void) | undefined,
  progress: Omit<AttachmentUploadProgress, "ratio">
) {
  const ratio =
    progress.totalBytes > 0
      ? Math.max(0, Math.min(1, progress.loadedBytes / progress.totalBytes))
      : 0;
  onProgress?.({
    ...progress,
    ratio,
  });
}

function throwIfAttachmentUploadAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error("Attachment upload cancelled");
  error.name = "AbortError";
  throw error;
}

export async function downloadDecryptedMessageAttachment(
  token: string,
  chatId: string,
  attachment: ChatMessageAttachment
) {
  const cachedAttachment = readDecryptedAttachment(chatId, attachment.id);
  if (cachedAttachment) {
    return cachedAttachment;
  }

  const ciphertext = await downloadEncryptedChatAttachment(token, chatId, attachment.id);
  const key = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(attachment.key)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(attachment.iv) },
    key,
    ciphertext
  );
  const blob = new Blob([plaintext], { type: normalizeAttachmentMimeType(attachment.mimeType) });
  const fileName = normalizeAttachmentFileName(attachment.fileName);
  rememberDecryptedAttachment(chatId, attachment.id, fileName, blob);
  return { blob, fileName };
}

export async function sendEncryptedMessage(
  token: string,
  chatId: string,
  content: string,
  participants: Participant[],
  clientMessageId?: string,
  replyToMessageId?: string | null,
  options?: {
    currentUserId?: string;
    isDirectChat?: boolean;
    session?: AuthResponse;
    attachments?: ChatMessageAttachment[];
  }
) {
  ensureE2eeTransportStorageSchema();
  const resolvedClientMessageId = clientMessageId?.trim() ?? "";
  if (resolvedClientMessageId) {
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:start", {
      participantCount: participants.length,
      directChat: options?.isDirectChat !== false,
      attachmentCount: options?.attachments?.length ?? 0,
    });
  }

  const attachments = normalizeChatMessageAttachments(options?.attachments ?? []);
  const normalizedContent = content.trim() || buildAttachmentOnlyContent(attachments);
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  if (!options?.currentUserId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  if (options.session && options.session.user.id === options.currentUserId) {
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:waitDeviceRegistration:start");
    await waitForEncryptionDeviceRegistration(options.session);
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:waitDeviceRegistration:end");
  }

  const currentUserId = options.currentUserId;
  recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:primeRecipients:start");
  await primeEncryptedMessageRecipients(token, participants, {
    currentUserId,
    session: options.session,
  });
  recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:primeRecipients:end");
  const dispatchMessage = async () => {
    const encryptedContent = serializeMessageContent(normalizedContent, attachments);
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:encrypt:start");
    const encryptedPayload = options.isDirectChat === false
      ? await encryptGroupMessage(token, chatId, currentUserId, encryptedContent, participants)
      : await encryptDirectDeviceMessage(token, currentUserId, encryptedContent, participants);
    if (!resolvedClientMessageId) {
      throw new ApiError("Client message id is required", 400);
    }
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:encrypt:end", {
      scheme: encryptedPayload.scheme,
    });

    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:transportDispatch:start");
    const response = await sendMessageRaw(token, chatId, {
      clientMessageId: resolvedClientMessageId,
      replyToMessageId,
      attachmentIds: attachments.map((attachment) => attachment.id),
      encryptedPayload,
    });
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:transportDispatch:end", {
      messageId: response.id,
      serverOrder: response.serverOrder ?? null,
    });

    const sentMessage = {
      id: response.id,
      chatId: response.chatId,
      serverOrder: response.serverOrder ?? null,
      sender: response.sender,
      content: normalizedContent,
      createdAt: response.createdAt,
      editedAt: response.editedAt,
      status: response.status,
      clientMessageId: response.clientMessageId ?? resolvedClientMessageId,
      replyTo: response.replyTo,
      reactions: response.reactions ?? [],
      attachments,
    } satisfies ChatMessage;
    void rememberArchivedDecryptedMessage(currentUserId, sentMessage);
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:archiveRemembered");
    return sentMessage;
  };

  try {
    return await dispatchMessage();
  } catch (error) {
    const recoverableRetryMode = getRecoverableEncryptedEnvelopeErrorMode(error);
    if (!recoverableRetryMode) {
      throw error;
    }

    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:recoverableRetry", {
      mode: recoverableRetryMode,
    });
    await recoverLocalEncryptionStateForRetry(
      currentUserId,
      options.isDirectChat === false,
      options.session,
      recoverableRetryMode
    );
    recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:recoverableRetryRecovered", {
      mode: recoverableRetryMode,
    });
    return dispatchMessage();
  }
}

export async function updateEncryptedMessage(
  token: string,
  userId: string,
  chatId: string,
  messageId: string,
  content: string,
  participants: Participant[],
  options?: {
    currentUserId?: string;
    isDirectChat?: boolean;
    session?: AuthResponse;
    attachments?: ChatMessageAttachment[];
  }
) {
  ensureE2eeTransportStorageSchema();

  const attachments = normalizeChatMessageAttachments(options?.attachments ?? []);
  const normalizedContent = content.trim() || buildAttachmentOnlyContent(attachments);
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  if (!(options?.currentUserId ?? userId)) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  if (options?.session && options.session.user.id === (options.currentUserId ?? userId)) {
    await waitForEncryptionDeviceRegistration(options.session);
  }

  const currentUserId = options?.currentUserId ?? userId;
  await primeEncryptedMessageRecipients(token, participants, {
    currentUserId,
    session: options?.session,
  });
  const dispatchUpdate = async () => {
    const encryptedContent = serializeMessageContent(normalizedContent, attachments);
    const encryptedPayload = options?.isDirectChat === false
      ? await encryptGroupMessage(
          token,
          chatId,
          currentUserId,
          encryptedContent,
          participants
        )
      : await encryptDirectDeviceMessage(
          token,
          currentUserId,
          encryptedContent,
          participants
        );
    const response = await updateMessage(token, chatId, messageId, {
      encryptedPayload,
    });

    const hydratedMessage = {
      ...(await hydrateChatMessage(response, userId)),
      content: normalizedContent,
      attachments,
    } satisfies ChatMessage;
    await rememberArchivedDecryptedMessage(currentUserId, hydratedMessage);
    return hydratedMessage;
  };

  try {
    return await dispatchUpdate();
  } catch (error) {
    const recoverableRetryMode = getRecoverableEncryptedEnvelopeErrorMode(error);
    if (!recoverableRetryMode) {
      throw error;
    }

    await recoverLocalEncryptionStateForRetry(
      currentUserId,
      options?.isDirectChat === false,
      options?.session,
      recoverableRetryMode
    );
    return dispatchUpdate();
  }
}

export async function primeEncryptedMessageRecipients(
  token: string,
  participants: Participant[],
  options?: { currentUserId?: string; session?: AuthResponse; forceRefresh?: boolean }
) {
  ensureE2eeTransportStorageSchema();

  if (!options?.currentUserId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  if (options.session && options.session.user.id === options.currentUserId) {
    await waitForEncryptionDeviceRegistration(options.session);
  }

  const remoteParticipantIds = participants
    .map((participant) => participant.id)
    .filter((participantId) => participantId !== options.currentUserId);
  await prepareDeviceEncryptionState(
    token,
    options.currentUserId,
    remoteParticipantIds,
    options.forceRefresh === true
  );
}

async function prepareDeviceEncryptionState(
  token: string,
  currentUserId: string | null,
  remoteParticipantIds: string[],
  forceRefresh = false
) {
  const preparationKey = buildDevicePreparationKey(currentUserId, remoteParticipantIds);
  if (!forceRefresh) {
    const cachedPreparationTimestamp = completedDevicePreparation.get(preparationKey);
    if (
      cachedPreparationTimestamp &&
      Date.now() - cachedPreparationTimestamp < DEVICE_PREPARATION_CACHE_TTL_MS
    ) {
      return;
    }
    if (cachedPreparationTimestamp) {
      completedDevicePreparation.delete(preparationKey);
    }

    const inFlightPreparation = inFlightDevicePreparation.get(preparationKey);
    if (inFlightPreparation) {
      await inFlightPreparation;
      return;
    }
  } else {
    completedDevicePreparation.delete(preparationKey);
    inFlightDevicePreparation.delete(preparationKey);
  }

  const preparationPromise = (async () => {
    const ownMaterial = currentUserId ? await readEncryptionDeviceMaterial(currentUserId) : null;
    const { rawBundles, trustedBundles } = await primeDeviceBundles(
      token,
      remoteParticipantIds,
      ownMaterial?.deviceId ?? null
    );
    const rawUserIds = new Set(rawBundles.map((bundle) => bundle.userId));
    const trustedBundleKeys = new Set(
      trustedBundles.map((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId))
    );
    const untrustedParticipantIds = Array.from(
      new Set(
        rawBundles
          .filter((bundle) => !trustedBundleKeys.has(getDeviceBundleMapKey(bundle.userId, bundle.deviceId)))
          .map((bundle) => bundle.userId)
      )
    );
    if (untrustedParticipantIds.length > 0) {
      throw new ApiError(ENCRYPTION_IDENTITY_CHANGED_MESSAGE, 409);
    }

    const bootstrapped = await bootstrapDeviceSessions(token, currentUserId, trustedBundles);
    if (bootstrapped) {
      completedDevicePreparation.set(preparationKey, Date.now());
    }
  })();
  inFlightDevicePreparation.set(preparationKey, preparationPromise);

  try {
    await preparationPromise;
  } finally {
    if (inFlightDevicePreparation.get(preparationKey) === preparationPromise) {
      inFlightDevicePreparation.delete(preparationKey);
    }
  }
}

function buildDevicePreparationKey(
  currentUserId: string | null,
  remoteParticipantIds: string[]
) {
  return `${currentUserId ?? "anonymous"}:${Array.from(new Set(remoteParticipantIds.filter(Boolean)))
    .sort()
    .join(",")}`;
}

function clearCompletedDevicePreparation(userId: string) {
  for (const cacheKey of Array.from(completedDevicePreparation.keys())) {
    if (cacheKey.startsWith(`${userId}:`)) {
      completedDevicePreparation.delete(cacheKey);
    }
  }
}

export async function hydrateChatMessage(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  await waitForPendingMessageHydrationBatch(userId);
  return hydrateChatMessageInternal(message, userId);
}

export async function hydrateChatMessageSnapshot(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  ensureE2eeTransportStorageSchema();

  const archivedMessage = await readArchivedDecryptedMessageRecord(userId, message.id);
  return buildHydratedChatMessage(
    message,
    archivedMessage?.content ?? ENCRYPTED_MESSAGE_UNAVAILABLE,
    archivedMessage?.editedAt ?? message.editedAt,
    archivedMessage?.attachments
  );
}

async function hydrateChatMessageInternal(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  return serializeMessageHydration(userId, async () => {
    ensureE2eeTransportStorageSchema();

    if (!message.encryptedPayload) {
      const archivedMessage = await readArchivedDecryptedMessageRecord(userId, message.id);
      return archivedMessage
        ? buildHydratedChatMessage(
            message,
            archivedMessage.content,
            archivedMessage.editedAt,
            archivedMessage.attachments
          )
        : buildHydratedChatMessage(message, ENCRYPTED_MESSAGE_UNAVAILABLE);
    }

    try {
      const content = await decryptMessage(message, userId);
      const hydratedMessage = buildHydratedChatMessage(message, content);
      void rememberArchivedDecryptedMessage(userId, hydratedMessage);
      return hydratedMessage;
    } catch {
      const archivedMessage = await readArchivedDecryptedMessageRecord(userId, message.id);
      return archivedMessage
        ? buildHydratedChatMessage(
            message,
            archivedMessage.content,
            archivedMessage.editedAt,
            archivedMessage.attachments
          )
        : buildHydratedChatMessage(message, ENCRYPTED_MESSAGE_UNAVAILABLE);
    }
  });
}

function withSerializedMessageHydrationBatch<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previousBatch = inFlightMessageHydrationBatchByUserId.get(userId) ?? Promise.resolve();
  const batchTask = previousBatch.catch(() => undefined).then(task);
  const settledBatchTask = batchTask.then(
    () => undefined,
    () => undefined
  );
  inFlightMessageHydrationBatchByUserId.set(userId, settledBatchTask);

  return batchTask.finally(() => {
    if (inFlightMessageHydrationBatchByUserId.get(userId) === settledBatchTask) {
      inFlightMessageHydrationBatchByUserId.delete(userId);
    }
  });
}

async function waitForPendingMessageHydrationBatch(userId: string) {
  const pendingBatch = inFlightMessageHydrationBatchByUserId.get(userId);
  if (!pendingBatch) {
    return;
  }

  await pendingBatch.catch(() => undefined);
}

function buildHydratedChatMessage(
  message: ApiChatMessage,
  content: string,
  editedAt = message.editedAt,
  archivedAttachments?: ChatMessageAttachment[]
) {
  const decodedContent = archivedAttachments
    ? { content, attachments: archivedAttachments }
    : parseMessageContent(content);
  return {
    id: message.id,
    chatId: message.chatId,
    serverOrder: message.serverOrder ?? null,
    sender: message.sender,
    content: decodedContent.content,
    createdAt: message.createdAt,
    editedAt,
    status: message.status,
    clientMessageId: message.clientMessageId ?? null,
    replyTo: message.replyTo,
    reactions: message.reactions ?? [],
    attachments: decodedContent.attachments,
  } satisfies ChatMessage;
}

function serializeMessageContent(content: string, attachments: ChatMessageAttachment[]) {
  if (attachments.length === 0) {
    return content;
  }

  return JSON.stringify({
    type: MESSAGE_CONTENT_ENVELOPE_TYPE,
    text: content,
    attachments,
  } satisfies MessageContentEnvelope);
}

function parseMessageContent(value: string): Pick<ChatMessage, "content" | "attachments"> {
  if (!value.trim() || isUnavailableEncryptedMessage(value)) {
    return { content: value, attachments: [] };
  }

  try {
    const parsed = JSON.parse(value) as Partial<MessageContentEnvelope>;
    if (parsed.type !== MESSAGE_CONTENT_ENVELOPE_TYPE || typeof parsed.text !== "string") {
      return { content: value, attachments: [] };
    }

    return {
      content: parsed.text,
      attachments: normalizeChatMessageAttachments(parsed.attachments ?? []),
    };
  } catch {
    return { content: value, attachments: [] };
  }
}

function normalizeChatMessageAttachments(value: unknown): ChatMessageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((attachment) => normalizeChatMessageAttachment(attachment))
    .filter((attachment): attachment is ChatMessageAttachment => attachment !== null);
}

function normalizeChatMessageAttachment(value: unknown): ChatMessageAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ChatMessageAttachment>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.sizeBytes !== "number" ||
    typeof candidate.ciphertextSizeBytes !== "number" ||
    typeof candidate.key !== "string" ||
    typeof candidate.iv !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fileName: normalizeAttachmentFileName(candidate.fileName),
    mimeType: normalizeAttachmentMimeType(candidate.mimeType),
    sizeBytes: Math.max(0, Math.trunc(candidate.sizeBytes)),
    ciphertextSizeBytes: Math.max(0, Math.trunc(candidate.ciphertextSizeBytes)),
    key: candidate.key,
    iv: candidate.iv,
  };
}

function normalizeAttachmentFileName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return normalized.slice(0, 180) || "attachment";
}

function normalizeAttachmentMimeType(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "application/octet-stream";
}

function buildAttachmentOnlyContent(attachments: ChatMessageAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    return `\u0424\u0430\u0439\u043B: ${attachments[0].fileName}`;
  }

  return `\u0424\u0430\u0439\u043B\u044B: ${attachments.length}`;
}

function getDecryptedAttachmentCacheKey(chatId: string, attachmentId: string) {
  return `${chatId}:${attachmentId}`;
}

function readDecryptedAttachment(chatId: string, attachmentId: string) {
  const cacheKey = getDecryptedAttachmentCacheKey(chatId, attachmentId);
  const cachedAttachment = decryptedAttachmentCache.get(cacheKey);
  if (!cachedAttachment) {
    return null;
  }

  decryptedAttachmentCache.delete(cacheKey);
  decryptedAttachmentCache.set(cacheKey, cachedAttachment);
  return {
    blob: cachedAttachment.blob,
    fileName: cachedAttachment.fileName,
  };
}

function rememberDecryptedAttachment(
  chatId: string,
  attachmentId: string,
  fileName: string,
  blob: Blob
) {
  const cacheKey = getDecryptedAttachmentCacheKey(chatId, attachmentId);
  const existingAttachment = decryptedAttachmentCache.get(cacheKey);
  if (existingAttachment) {
    decryptedAttachmentCacheSizeBytes -= existingAttachment.blob.size;
    decryptedAttachmentCache.delete(cacheKey);
  }

  if (blob.size > DECRYPTED_ATTACHMENT_CACHE_MAX_BYTES) {
    return;
  }

  decryptedAttachmentCache.set(cacheKey, { blob, fileName });
  decryptedAttachmentCacheSizeBytes += blob.size;

  while (decryptedAttachmentCacheSizeBytes > DECRYPTED_ATTACHMENT_CACHE_MAX_BYTES) {
    const oldestCacheKey = decryptedAttachmentCache.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }

    const oldestAttachment = decryptedAttachmentCache.get(oldestCacheKey);
    decryptedAttachmentCache.delete(oldestCacheKey);
    decryptedAttachmentCacheSizeBytes -= oldestAttachment?.blob.size ?? 0;
  }
}

function serializeMessageHydration<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previousHydration = inFlightMessageHydrationByUserId.get(userId) ?? Promise.resolve();
  const serializedTask = previousHydration.catch(() => undefined).then(task);
  const settledTask = serializedTask.then(
    () => undefined,
    () => undefined
  );
  inFlightMessageHydrationByUserId.set(userId, settledTask);

  return serializedTask.finally(() => {
    if (inFlightMessageHydrationByUserId.get(userId) === settledTask) {
      inFlightMessageHydrationByUserId.delete(userId);
    }
  });
}

export function clearInFlightMessageHydration(userId?: string) {
  if (userId) {
    inFlightMessageHydrationBatchByUserId.delete(userId);
    inFlightMessageHydrationByUserId.delete(userId);
    return;
  }

  inFlightMessageHydrationBatchByUserId.clear();
  inFlightMessageHydrationByUserId.clear();
}

async function primeDeviceBundles(token: string, userIds: string[], requesterDeviceId?: string | null) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return {
      rawBundles: [] as UserEncryptionDeviceBundle[],
      trustedBundles: [] as UserEncryptionDeviceBundle[],
    };
  }

  let rawBundles: UserEncryptionDeviceBundle[] = [];
  try {
    rawBundles = await resolveEncryptionDeviceBundles(token, uniqueUserIds, {
      consumeOneTimePrekeys: false,
      requesterDeviceId: requesterDeviceId ?? undefined,
    });
  } catch {
    return {
      rawBundles: [] as UserEncryptionDeviceBundle[],
      trustedBundles: [] as UserEncryptionDeviceBundle[],
    };
  }

  const trustedBundles = await Promise.all(
    rawBundles.map(async (bundle) => {
      try {
        return (await validateAndPinDeviceBundle(bundle)) ? bundle : null;
      } catch {
        return null;
      }
    })
  );

  return {
    rawBundles,
    trustedBundles: trustedBundles.filter(
      (bundle): bundle is UserEncryptionDeviceBundle => bundle !== null
    ),
  };
}

function getDeviceBundleMapKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

async function resolveConversationDeviceBundles(
  token: string,
  participants: Participant[],
  requesterDeviceId?: string | null,
  currentUserId?: string | null
) {
  const { rawBundles, trustedBundles } = await primeDeviceBundles(
    token,
    participants.map((participant) => participant.id),
    requesterDeviceId
  );
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const trustedBundleKeys = new Set(
    trustedBundles.map((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId))
  );
  const missingParticipants = participants.filter(
    (participant) =>
      participant.id !== currentUserId &&
      !rawBundles.some((bundle) => bundle.userId === participant.id)
  );
  const participantsWithUntrustedDevices = Array.from(
    new Set(
      rawBundles
        .filter((bundle) => !trustedBundleKeys.has(getDeviceBundleMapKey(bundle.userId, bundle.deviceId)))
        .map((bundle) => bundle.userId)
    )
  )
    .map((participantId) => participantById.get(participantId))
    .filter((participant): participant is Participant => Boolean(participant));

  return {
    rawBundles,
    trustedBundles,
    missingParticipants,
    participantsWithUntrustedDevices,
  };
}

async function validateAndPinDeviceBundle(bundle: UserEncryptionDeviceBundle) {
  try {
    if (
      bundle.identityKeyAlgorithm !== DEVICE_AGREEMENT_KEY_ALGORITHM ||
      bundle.identitySignatureKeyAlgorithm !== DEVICE_SIGNATURE_KEY_ALGORITHM ||
      bundle.signedPrekeyAlgorithm !== DEVICE_AGREEMENT_KEY_ALGORITHM
    ) {
      return false;
    }

    const signatureValid = await verifySignedPrekeySignature(bundle);
    if (!signatureValid) {
      return false;
    }

    const identityFingerprint = await fingerprintPublicKey(bundle.identityKey);
    const identitySignatureFingerprint = await fingerprintPublicKey(bundle.identitySignatureKey);
    const signedPrekeyFingerprint = await fingerprintPublicKey(bundle.signedPrekeyPublicKey);
    const currentRecord = readPinnedDeviceBundleRecord(bundle.userId, bundle.deviceId);

    if (
      currentRecord &&
      (currentRecord.identityFingerprint !== identityFingerprint ||
        currentRecord.identitySignatureFingerprint !== identitySignatureFingerprint)
    ) {
      return false;
    }

    writePinnedDeviceBundleRecord(bundle.userId, bundle.deviceId, {
      userId: bundle.userId,
      deviceId: bundle.deviceId,
      identityFingerprint,
      identitySignatureFingerprint,
      signedPrekeyFingerprint,
      signedPrekeyId: bundle.signedPrekeyId,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

async function bootstrapDeviceSessions(
  token: string,
  currentUserId: string | null,
  previewBundles: UserEncryptionDeviceBundle[]
) {
  if (!currentUserId || previewBundles.length === 0) {
    return true;
  }

  const ownMaterial = await readEncryptionDeviceMaterial(currentUserId);
  if (!ownMaterial) {
    return false;
  }

  const existingSessions = await readCurrentDeviceSessions(currentUserId, ownMaterial.materialId);
  const unresolvedBundles = previewBundles.filter((bundle) =>
    shouldEstablishDeviceSession(existingSessions, bundle)
  );

  if (unresolvedBundles.length === 0) {
    return true;
  }

  let consumableBundles: UserEncryptionDeviceBundle[] = [];
  try {
      consumableBundles = await resolveEncryptionDeviceBundles(
        token,
        Array.from(new Set(unresolvedBundles.map((bundle) => bundle.userId))),
        {
          consumeOneTimePrekeys: true,
          deviceIds: unresolvedBundles.map((bundle) => bundle.deviceId),
          requesterDeviceId: ownMaterial.deviceId ?? undefined,
        }
      );
  } catch {
    return false;
  }

  const nextSessions = { ...existingSessions };
  for (const bundle of consumableBundles) {
    if (!unresolvedBundles.some((candidate) => candidate.deviceId === bundle.deviceId)) {
      continue;
    }

    if (!(await validateAndPinDeviceBundle(bundle))) {
      continue;
    }

    setCurrentDeviceSessionRecord(
      nextSessions,
      await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle)
    );
  }

  writeDeviceSessions(currentUserId, nextSessions);
  await rememberDeviceSessions(currentUserId, nextSessions);
  return true;
}

function shouldEstablishDeviceSession(
  existingSessions: Record<string, DeviceSessionRecord>,
  bundle: UserEncryptionDeviceBundle
) {
  const existingSession = existingSessions[getDeviceSessionMapKey(bundle.userId, bundle.deviceId)];
  if (!existingSession) {
    return true;
  }

  if (
    existingSession.remoteIdentityKey !== bundle.identityKey ||
    existingSession.remoteIdentitySignatureKey !== bundle.identitySignatureKey
  ) {
    return true;
  }

  if (existingSession.sessionOrigin === "responder") {
    return false;
  }

  return (
    existingSession.remoteSignedPrekeyId !== bundle.signedPrekeyId ||
    existingSession.remoteSignedPrekeyPublicKey !== bundle.signedPrekeyPublicKey
  );
}

async function establishInitiatorDeviceSession(
  currentUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  bundle: UserEncryptionDeviceBundle
): Promise<DeviceSessionRecord> {
  const ownIdentityPrivateKey = await importDevicePrivateKey(
    ownMaterial.identityPrivateKey,
    ownMaterial.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteIdentityPublicKey = await importDevicePublicKey(
    bundle.identityKey,
    bundle.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteSignedPrekeyPublicKey = await importDevicePublicKey(
    bundle.signedPrekeyPublicKey,
    bundle.signedPrekeyAlgorithm,
    ["deriveBits"]
  );
  const initiatorEphemeralKeyPair = await generateAsymmetricKeyPair(
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const sendingRatchetKeyPair = await generateAsymmetricKeyPair(
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const initiatorEphemeralPublicKey = await exportJsonWebKey(initiatorEphemeralKeyPair.publicKey);

  const sharedSecrets = [
    await deriveAgreementSecret(ownIdentityPrivateKey, remoteSignedPrekeyPublicKey),
    await deriveAgreementSecret(initiatorEphemeralKeyPair.privateKey, remoteIdentityPublicKey),
    await deriveAgreementSecret(initiatorEphemeralKeyPair.privateKey, remoteSignedPrekeyPublicKey),
  ];

  let remoteOneTimePrekeyId: number | null = null;
  if (bundle.oneTimePrekey) {
    const remoteOneTimePrekeyPublicKey = await importDevicePublicKey(
      bundle.oneTimePrekey.publicKey,
      DEVICE_AGREEMENT_KEY_ALGORITHM,
      ["deriveBits"]
    );
    sharedSecrets.push(
      await deriveAgreementSecret(initiatorEphemeralKeyPair.privateKey, remoteOneTimePrekeyPublicKey)
    );
    remoteOneTimePrekeyId = bundle.oneTimePrekey.keyId;
  }

  const transcript = buildInitialDeviceSessionTranscript({
    initiatorUserId: currentUserId,
    initiatorDeviceId: ownMaterial.deviceId,
    responderUserId: bundle.userId,
    responderDeviceId: bundle.deviceId,
    responderSignedPrekeyId: bundle.signedPrekeyId,
    responderOneTimePrekeyId: remoteOneTimePrekeyId,
    initiatorEphemeralPublicKey,
  });
  const masterSecret = concatByteArrays(sharedSecrets);
  const rootKey = await deriveSessionSecret(masterSecret, transcript, "north-x3dh-root");
  const sendingChainKey = await deriveSessionSecret(rootKey, transcript, "north-x3dh-send");
  const receivingChainKey = await deriveSessionSecret(rootKey, transcript, "north-x3dh-recv");

  return {
    sessionId: window.crypto.randomUUID(),
    peerUserId: bundle.userId,
    peerDeviceId: bundle.deviceId,
    sessionOrigin: "initiator",
    ownMaterialId: ownMaterial.materialId,
    remoteIdentityKey: bundle.identityKey,
    remoteIdentitySignatureKey: bundle.identitySignatureKey,
    remoteSignedPrekeyId: bundle.signedPrekeyId,
    remoteSignedPrekeyPublicKey: bundle.signedPrekeyPublicKey,
    remoteOneTimePrekeyId,
    initiatorEphemeralPublicKey,
    sendingRatchetPublicKey: await exportJsonWebKey(sendingRatchetKeyPair.publicKey),
    sendingRatchetPrivateKey: await exportJsonWebKey(sendingRatchetKeyPair.privateKey),
    remoteRatchetPublicKey: null,
    sendingRatchetUsed: false,
    pendingSendingRatchetStep: false,
    rootKey: bytesToBase64(rootKey),
    sendingChainKey: bytesToBase64(sendingChainKey),
    receivingChainKey: bytesToBase64(receivingChainKey),
    sendingCounter: 0,
    receivingCounter: 0,
    cachedMessageKeys: {},
    establishedAt: new Date().toISOString(),
  };
}

async function verifySignedPrekeySignature(bundle: UserEncryptionDeviceBundle) {
  const signatureKey = await importDevicePublicKey(
    bundle.identitySignatureKey,
    bundle.identitySignatureKeyAlgorithm,
    ["verify"]
  );
  return window.crypto.subtle.verify(
    { name: bundle.identitySignatureKeyAlgorithm } as AlgorithmIdentifier,
    signatureKey,
    base64ToBytes(bundle.signedPrekeySignature),
    buildSignedPrekeySignaturePayload(bundle.signedPrekeyPublicKey)
  );
}

async function decryptMessage(message: ApiChatMessage, userId: string) {
  const payload = message.encryptedPayload;
  if (!payload) {
    return "";
  }

  if (payload.scheme === MESSAGE_SCHEME_DEVICE) {
    return decryptDirectMessage(payload, userId);
  }

  if (payload.scheme === MESSAGE_SCHEME_GROUP_SENDER_KEY) {
    return decryptGroupMessage(message, userId);
  }

  throw new Error(`Unsupported encrypted payload scheme: ${payload.scheme}`);
}

async function encryptDirectDeviceMessage(
  token: string,
  currentUserId: string,
  content: string,
  participants: Participant[]
) {
  const ownMaterial = await readEncryptionDeviceMaterial(currentUserId);
  if (!ownMaterial?.deviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  const {
    trustedBundles: previewBundles,
    missingParticipants,
    participantsWithUntrustedDevices,
  } = await resolveConversationDeviceBundles(
    token,
    participants,
    ownMaterial.deviceId,
    currentUserId
  );
  const currentSelfBundle = buildSelfDeviceBundle(ownMaterial, currentUserId);
  const currentSelfBundleKey = getDeviceBundleMapKey(currentUserId, ownMaterial.deviceId);
  const participantsWithUntrustedBundles = participantsWithUntrustedDevices;
  if (participantsWithUntrustedBundles.length > 0) {
    throw new ApiError(
      ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
      409,
      participantsWithUntrustedBundles.map((participant) => participant.displayName)
    );
  }
  if (missingParticipants.length > 0) {
    throw new ApiError(
      "Encrypted chat is unavailable because some participants do not have an available encryption device yet",
      409,
      missingParticipants.map((participant) => participant.displayName)
    );
  }

  const existingSessions = await readCurrentDeviceSessions(currentUserId, ownMaterial.materialId);
  const targetBundles = [
    ...previewBundles.filter(
      (bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey
    ),
    currentSelfBundle,
  ];
  const unresolvedRemoteBundles = targetBundles
    .filter((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey)
    .filter((bundle) =>
      shouldEstablishDeviceSession(existingSessions, bundle)
    );

  const nextSessions = { ...existingSessions };
  if (shouldEstablishDeviceSession(existingSessions, currentSelfBundle)) {
    const selfSession = await establishInitiatorDeviceSession(
      currentUserId,
      ownMaterial,
      currentSelfBundle
    );
    setCurrentDeviceSessionRecord(nextSessions, selfSession);
  }

  if (unresolvedRemoteBundles.length > 0) {
    let consumableBundles: UserEncryptionDeviceBundle[] = [];
    try {
      consumableBundles = await resolveEncryptionDeviceBundles(
        token,
        Array.from(new Set(unresolvedRemoteBundles.map((bundle) => bundle.userId))),
        {
          consumeOneTimePrekeys: true,
          deviceIds: unresolvedRemoteBundles.map((bundle) => bundle.deviceId),
          requesterDeviceId: ownMaterial.deviceId,
        }
      );
    } catch {
      throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
    }

    for (const bundle of consumableBundles) {
      if (!(await validateAndPinDeviceBundle(bundle))) {
        continue;
      }
      setCurrentDeviceSessionRecord(
        nextSessions,
        await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle)
      );
    }
  }

  const envelopes = await Promise.all(
    targetBundles.map(async (bundle) => {
      const sessionRecord =
        nextSessions[getDeviceSessionMapKey(bundle.userId, bundle.deviceId)] ??
        (await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle));
      setCurrentDeviceSessionRecord(nextSessions, sessionRecord);
      return [bundle.deviceId, await createDirectRecipientEnvelope(currentUserId, ownMaterial, sessionRecord, content)] as const;
    })
  );

  writeDeviceSessions(currentUserId, nextSessions);
  await rememberDeviceSessions(currentUserId, nextSessions);

  const envelopeByDeviceId = Object.fromEntries(envelopes);
  if (Object.keys(envelopeByDeviceId).length === 0) {
    throw new ApiError("Encrypted chat is unavailable", 409);
  }

  return {
    scheme: MESSAGE_SCHEME_DEVICE,
    encryptedKeysByRecipientId: Object.fromEntries(
      Object.entries(envelopeByDeviceId).map(([deviceId, envelope]) => [
        deviceId,
        JSON.stringify(envelope),
      ])
    ),
  };
}

async function encryptGroupMessage(
  token: string,
  chatId: string,
  currentUserId: string,
  content: string,
  participants: Participant[]
) {
  const { ownMaterial, targetBundles, nextSessions } =
    await prepareGroupRecipientEncryptionContext(token, currentUserId, participants);
  const groupSenderChainState = await readGroupSenderChainState(currentUserId);
  const senderChains = groupSenderChainState.outboundChains;
  let senderChain = senderChains[chatId];
  const recipientDeviceSetHash = buildRecipientDeviceSetHash(targetBundles);
  if (
    !senderChain ||
    senderChain.ownMaterialId !== ownMaterial.materialId ||
    senderChain.senderDeviceId !== ownMaterial.deviceId ||
    senderChain.recipientDeviceSetHash !== recipientDeviceSetHash ||
    isGroupSenderChainRotationDue(senderChain)
  ) {
    senderChain = createGroupSenderChain(chatId, ownMaterial, recipientDeviceSetHash);
  }

  const currentChainKey = base64ToBytes(senderChain.chainKey);
  const currentMessageCounter = senderChain.nextMessageCounter;
  const ratchetStep = await deriveMessageRatchetStep(currentChainKey, currentMessageCounter);
  const sharedEnvelope = await createGroupSharedEnvelope(
    chatId,
    currentUserId,
    ownMaterial,
    senderChain.senderKeyId,
    currentMessageCounter,
    ratchetStep.messageKey,
    content
  );
  const historyKeyRecord = await ensureGroupHistoryKeyRecord(
    token,
    chatId,
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions
  );
  const historyEnvelope = await createGroupHistoryEnvelope(sharedEnvelope, historyKeyRecord, content);
  const distributionPayload = JSON.stringify({
    aadVersion: GROUP_SENDER_DISTRIBUTION_AAD_VERSION,
    chatId,
    senderUserId: currentUserId,
    senderDeviceId: ownMaterial.deviceId,
    senderKeyId: senderChain.senderKeyId,
    messageCounter: currentMessageCounter,
    chainKey: bytesToBase64(currentChainKey),
  } satisfies GroupSenderKeyDistribution);

  const distributionEnvelopes = await Promise.all(
    targetBundles.map(async (bundle) => {
      const sessionRecord =
        nextSessions[getDeviceSessionMapKey(bundle.userId, bundle.deviceId)] ??
        (await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle));
      setCurrentDeviceSessionRecord(nextSessions, sessionRecord);
      return [
        bundle.deviceId,
        await createDirectRecipientEnvelopeContent(
          currentUserId,
          ownMaterial,
          sessionRecord,
          distributionPayload
        ),
      ] as const;
    })
  );

  senderChains[chatId] = {
    ...senderChain,
    chainKey: bytesToBase64(ratchetStep.nextChainKey),
    nextMessageCounter: currentMessageCounter + 1,
  };

  writeDeviceSessions(currentUserId, nextSessions);
  await rememberDeviceSessions(currentUserId, nextSessions);
  writeGroupSenderChainState(currentUserId, groupSenderChainState);
  await rememberGroupSenderChainState(currentUserId, groupSenderChainState);

  return {
    scheme: MESSAGE_SCHEME_GROUP_SENDER_KEY,
    sharedEnvelope: JSON.stringify(sharedEnvelope),
    historyEnvelope: JSON.stringify(historyEnvelope),
    encryptedKeysByRecipientId: Object.fromEntries(
      distributionEnvelopes.map(([deviceId, envelope]) => [deviceId, JSON.stringify(envelope)])
    ),
  };
}

async function prepareGroupRecipientEncryptionContext(
  token: string,
  currentUserId: string,
  participants: Participant[]
): Promise<{
  ownMaterial: RegisteredDeviceEncryptionMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, DeviceSessionRecord>;
}> {
  const ownMaterial = await readEncryptionDeviceMaterial(currentUserId);
  if (!isRegisteredEncryptionDeviceMaterialAvailable(ownMaterial)) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  const {
    trustedBundles: previewBundles,
    missingParticipants,
    participantsWithUntrustedDevices,
  } = await resolveConversationDeviceBundles(
    token,
    participants,
    ownMaterial.deviceId,
    currentUserId
  );
  const currentSelfBundle = buildSelfDeviceBundle(ownMaterial, currentUserId);
  const currentSelfBundleKey = getDeviceBundleMapKey(currentUserId, ownMaterial.deviceId);
  const participantsWithUntrustedBundles = participantsWithUntrustedDevices;
  if (participantsWithUntrustedBundles.length > 0) {
    throw new ApiError(
      ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
      409,
      participantsWithUntrustedBundles.map((participant) => participant.displayName)
    );
  }
  if (missingParticipants.length > 0) {
    throw new ApiError(
      "Encrypted chat is unavailable because some participants do not have an available encryption device yet",
      409,
      missingParticipants.map((participant) => participant.displayName)
    );
  }

  const existingSessions = await readCurrentDeviceSessions(currentUserId, ownMaterial.materialId);
  const targetBundles = [
    ...previewBundles.filter(
      (bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey
    ),
    currentSelfBundle,
  ];
  const unresolvedRemoteBundles = targetBundles
    .filter((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey)
    .filter((bundle) =>
      shouldEstablishDeviceSession(existingSessions, bundle)
    );

  const nextSessions = { ...existingSessions };
  if (shouldEstablishDeviceSession(existingSessions, currentSelfBundle)) {
    const selfSession = await establishInitiatorDeviceSession(
      currentUserId,
      ownMaterial,
      currentSelfBundle
    );
    setCurrentDeviceSessionRecord(nextSessions, selfSession);
  }

  if (unresolvedRemoteBundles.length > 0) {
    let consumableBundles: UserEncryptionDeviceBundle[] = [];
    try {
      consumableBundles = await resolveEncryptionDeviceBundles(
        token,
        Array.from(new Set(unresolvedRemoteBundles.map((bundle) => bundle.userId))),
        {
          consumeOneTimePrekeys: true,
          deviceIds: unresolvedRemoteBundles.map((bundle) => bundle.deviceId),
          requesterDeviceId: ownMaterial.deviceId,
        }
      );
    } catch {
      throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
    }

    for (const bundle of consumableBundles) {
      if (!(await validateAndPinDeviceBundle(bundle))) {
        const affectedParticipant = participants.find((participant) => participant.id === bundle.userId);
        throw new ApiError(
          ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
          409,
          affectedParticipant ? [affectedParticipant.displayName] : []
        );
      }
      setCurrentDeviceSessionRecord(
        nextSessions,
        await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle)
      );
    }
  }
  return {
    ownMaterial,
    targetBundles,
    nextSessions,
  };
}

export async function grantGroupHistoryAccessForParticipants(
  token: string,
  chatId: string,
  participants: Participant[],
  options?: { currentUserId?: string; session?: AuthResponse }
) {
  ensureE2eeTransportStorageSchema();

  if (!options?.currentUserId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  if (options.session && options.session.user.id === options.currentUserId) {
    await waitForEncryptionDeviceRegistration(options.session);
  }

  const currentUserId = options.currentUserId;
  const { ownMaterial, targetBundles, nextSessions } = await prepareGroupRecipientEncryptionContext(
    token,
    currentUserId,
    participants
  );
  const historyKeyRecord =
    (await readCurrentGroupHistoryKeyRecord(currentUserId, chatId)) ??
    (await resolveGroupHistoryKeyRecordFromServer(token, currentUserId, chatId, ownMaterial));
  if (!historyKeyRecord) {
    return;
  }

  await upsertGroupHistoryKeyAccessForTargets(
    token,
    chatId,
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    historyKeyRecord
  );
}

async function ensureGroupHistoryKeyRecord(
  token: string,
  chatId: string,
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  targetBundles: UserEncryptionDeviceBundle[],
  nextSessions: Record<string, DeviceSessionRecord>
) {
  const localRecord = await readCurrentGroupHistoryKeyRecord(currentUserId, chatId);
  if (localRecord) {
    return localRecord;
  }

  const remoteRecord = await resolveGroupHistoryKeyRecordFromServer(
    token,
    currentUserId,
    chatId,
    ownMaterial
  );
  if (remoteRecord) {
    return remoteRecord;
  }

  const createdRecord = createLocalGroupHistoryKeyRecord(chatId);
  await upsertGroupHistoryKeyAccessForTargets(
    token,
    chatId,
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    createdRecord
  );
  await persistGroupHistoryKeyRecord(currentUserId, createdRecord);
  return createdRecord;
}

function createLocalGroupHistoryKeyRecord(chatId: string): GroupHistoryKeyRecord {
  return {
    historyKeyId: window.crypto.randomUUID(),
    chatId,
    keyMaterial: bytesToBase64(randomBytes(32)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function resolveGroupHistoryKeyRecordFromServer(
  token: string,
  userId: string,
  chatId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial
) {
  let latestRecord: GroupHistoryKeyRecord | null = null;
  const accesses = await getOwnGroupHistoryKeys(token, chatId, ownMaterial.deviceId);
  for (const access of accesses) {
    try {
      const decryptedPayload = await decryptDirectRecipientEnvelopeContent(
        access.wrappedKeyPayloadJson,
        userId,
        ownMaterial
      );
      const grantPayload = parseGroupHistoryKeyGrantPayload(decryptedPayload);
      if (
        grantPayload.chatId !== chatId ||
        grantPayload.historyKeyId !== access.historyKeyId
      ) {
        continue;
      }

      const record: GroupHistoryKeyRecord = {
        historyKeyId: grantPayload.historyKeyId,
        chatId: grantPayload.chatId,
        keyMaterial: grantPayload.historyKey,
        createdAt: access.createdAt,
        updatedAt: access.updatedAt,
      };
      await persistGroupHistoryKeyRecord(userId, record);
      if (
        !latestRecord ||
        Date.parse(record.updatedAt) >= Date.parse(latestRecord.updatedAt)
      ) {
        latestRecord = record;
      }
    } catch {
      // Ignore malformed or undecryptable grants and keep checking other records.
    }
  }

  return latestRecord;
}

async function upsertGroupHistoryKeyAccessForTargets(
  token: string,
  chatId: string,
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  targetBundles: UserEncryptionDeviceBundle[],
  nextSessions: Record<string, DeviceSessionRecord>,
  historyKeyRecord: GroupHistoryKeyRecord
) {
  const wrappedKeysByRecipientDeviceId = await buildGroupHistoryKeyAccessEnvelopes(
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    historyKeyRecord
  );
  if (Object.keys(wrappedKeysByRecipientDeviceId).length === 0) {
    throw new ApiError("Encrypted chat is unavailable", 409);
  }

  writeDeviceSessions(currentUserId, nextSessions);
  await rememberDeviceSessions(currentUserId, nextSessions);
  await upsertGroupHistoryKey(token, chatId, {
    historyKeyId: historyKeyRecord.historyKeyId,
    wrappedKeysByRecipientDeviceId,
  });
  await persistGroupHistoryKeyRecord(currentUserId, {
    ...historyKeyRecord,
    updatedAt: new Date().toISOString(),
  });
}

async function buildGroupHistoryKeyAccessEnvelopes(
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  targetBundles: UserEncryptionDeviceBundle[],
  nextSessions: Record<string, DeviceSessionRecord>,
  historyKeyRecord: GroupHistoryKeyRecord
) {
  const serializedGrantPayload = JSON.stringify({
    aadVersion: GROUP_HISTORY_KEY_GRANT_AAD_VERSION,
    chatId: historyKeyRecord.chatId,
    historyKeyId: historyKeyRecord.historyKeyId,
    historyKey: historyKeyRecord.keyMaterial,
    createdAt: historyKeyRecord.createdAt,
  } satisfies GroupHistoryKeyGrantPayload);

  const wrappedEnvelopes = await Promise.all(
    targetBundles.map(async (bundle) => {
      const sessionRecord =
        nextSessions[getDeviceSessionMapKey(bundle.userId, bundle.deviceId)] ??
        (await establishInitiatorDeviceSession(currentUserId, ownMaterial, bundle));
      setCurrentDeviceSessionRecord(nextSessions, sessionRecord);
      return [
        bundle.deviceId,
        JSON.stringify(
          await createDirectRecipientEnvelopeContent(
            currentUserId,
            ownMaterial,
            sessionRecord,
            serializedGrantPayload
          )
        ),
      ] as const;
    })
  );

  return Object.fromEntries(wrappedEnvelopes);
}

async function createGroupHistoryEnvelope(
  sharedEnvelope: GroupSharedEnvelope,
  historyKeyRecord: GroupHistoryKeyRecord,
  content: string
): Promise<GroupHistoryEnvelope> {
  const iv = randomBytes(12);
  const historyEnvelopeMetadata: Omit<GroupHistoryEnvelope, "ciphertext"> = {
    aadVersion: GROUP_HISTORY_ENVELOPE_AAD_VERSION,
    historyKeyId: historyKeyRecord.historyKeyId,
    iv: bytesToBase64(iv),
  };
  const historyKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(historyKeyRecord.keyMaterial)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildGroupHistoryEnvelopeAdditionalData(historyEnvelopeMetadata, sharedEnvelope),
    },
    historyKey,
    textEncoder.encode(content)
  );

  return {
    ...historyEnvelopeMetadata,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function buildGroupHistoryEnvelopeAdditionalData(
  historyEnvelope: Omit<GroupHistoryEnvelope, "ciphertext">,
  sharedEnvelope: Pick<
    GroupSharedEnvelope,
    "chatId" | "senderUserId" | "senderDeviceId" | "senderKeyId" | "messageCounter"
  >
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: historyEnvelope.aadVersion,
      historyKeyId: historyEnvelope.historyKeyId,
      chatId: sharedEnvelope.chatId,
      senderUserId: sharedEnvelope.senderUserId,
      senderDeviceId: sharedEnvelope.senderDeviceId,
      senderKeyId: sharedEnvelope.senderKeyId,
      messageCounter: sharedEnvelope.messageCounter,
      iv: historyEnvelope.iv,
    })
  );
}

function buildSelfDeviceBundle(
  ownMaterial: DeviceEncryptionMaterial,
  currentUserId: string
): UserEncryptionDeviceBundle {
  if (!ownMaterial.deviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  return {
    userId: currentUserId,
    deviceId: ownMaterial.deviceId,
    deviceName: "Current device",
    identityKey: ownMaterial.identityKey,
    identityKeyAlgorithm: ownMaterial.identityKeyAlgorithm,
    identitySignatureKey: ownMaterial.identitySignatureKey,
    identitySignatureKeyAlgorithm: ownMaterial.identitySignatureKeyAlgorithm,
    signedPrekeyId: ownMaterial.signedPrekeyId,
    signedPrekeyPublicKey: ownMaterial.signedPrekeyPublicKey,
    signedPrekeySignature: ownMaterial.signedPrekeySignature,
    signedPrekeyAlgorithm: ownMaterial.signedPrekeyAlgorithm,
    oneTimePrekey: null,
    registeredAt: ownMaterial.createdAt,
    lastSeenAt: ownMaterial.createdAt,
  };
}

async function createDirectRecipientEnvelope(
  senderUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  sessionRecord: DeviceSessionRecord,
  content: string
): Promise<DirectDeviceEnvelope> {
  return createDirectRecipientEnvelopeContent(senderUserId, ownMaterial, sessionRecord, content);
}

async function createDirectRecipientEnvelopeContent(
  senderUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  sessionRecord: DeviceSessionRecord,
  content: string
): Promise<DirectDeviceEnvelope> {
  if (!ownMaterial.deviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  if (sessionRecord.pendingSendingRatchetStep && sessionRecord.remoteRatchetPublicKey) {
    await applyOutgoingDhRatchet(sessionRecord);
  }

  const ratchetStep = await advanceSendingChain(sessionRecord);
  const iv = randomBytes(12);
  const envelopeMetadata: Omit<DirectDeviceEnvelope, "ciphertext"> = {
    aadVersion: DIRECT_ENVELOPE_AAD_VERSION,
    senderUserId,
    senderDeviceId: ownMaterial.deviceId,
    recipientDeviceId: sessionRecord.peerDeviceId,
    senderIdentityKey: ownMaterial.identityKey,
    senderIdentitySignatureKey: ownMaterial.identitySignatureKey,
    initiatorEphemeralPublicKey: sessionRecord.initiatorEphemeralPublicKey,
    ratchetPublicKey: sessionRecord.sendingRatchetPublicKey,
    recipientSignedPrekeyId: sessionRecord.remoteSignedPrekeyId,
    recipientOneTimePrekeyId: shouldIncludeBootstrapOneTimePrekey(sessionRecord, ratchetStep.messageCounter)
      ? sessionRecord.remoteOneTimePrekeyId
      : null,
    messageCounter: ratchetStep.messageCounter,
    iv: bytesToBase64(iv),
  };
  const messageKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(ratchetStep.messageKey),
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt"]
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildDirectEnvelopeAdditionalData(envelopeMetadata),
    },
    messageKey,
    textEncoder.encode(content)
  );

  return {
    ...envelopeMetadata,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function shouldIncludeBootstrapOneTimePrekey(
  sessionRecord: DeviceSessionRecord,
  messageCounter: number
) {
  return (
    sessionRecord.remoteOneTimePrekeyId !== null &&
    messageCounter === 0 &&
    sessionRecord.sendingCounter === 1 &&
    sessionRecord.remoteRatchetPublicKey === null &&
    !sessionRecord.pendingSendingRatchetStep &&
    !sessionRecord.sendingRatchetUsed
  );
}

async function advanceSendingChain(sessionRecord: DeviceSessionRecord) {
  const currentCounter = sessionRecord.sendingCounter;
  const currentChainKey = base64ToBytes(sessionRecord.sendingChainKey);
  const ratchetStep = await deriveMessageRatchetStep(currentChainKey, currentCounter);
  sessionRecord.sendingChainKey = bytesToBase64(ratchetStep.nextChainKey);
  sessionRecord.sendingCounter = currentCounter + 1;
  cacheSessionMessageKey(
    sessionRecord,
    "send",
    sessionRecord.sendingRatchetPublicKey,
    currentCounter,
    ratchetStep.messageKey
  );
  return {
    messageCounter: currentCounter,
    messageKey: ratchetStep.messageKey,
  };
}

async function applyOutgoingDhRatchet(sessionRecord: DeviceSessionRecord) {
  if (!sessionRecord.remoteRatchetPublicKey) {
    return;
  }

  if (sessionRecord.sendingRatchetUsed) {
    const nextRatchetKeyPair = await generateAsymmetricKeyPair(DEVICE_AGREEMENT_KEY_ALGORITHM, [
      "deriveBits",
    ]);
    sessionRecord.sendingRatchetPublicKey = await exportJsonWebKey(nextRatchetKeyPair.publicKey);
    sessionRecord.sendingRatchetPrivateKey = await exportJsonWebKey(nextRatchetKeyPair.privateKey);
    sessionRecord.sendingRatchetUsed = false;
  }

  const sendingRatchetPrivateKey = await importDevicePrivateKey(
    sessionRecord.sendingRatchetPrivateKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const remoteRatchetPublicKey = await importDevicePublicKey(
    sessionRecord.remoteRatchetPublicKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const dhSecret = await deriveAgreementSecret(sendingRatchetPrivateKey, remoteRatchetPublicKey);
  const nextRootKey = await deriveSessionSecret(
    dhSecret,
    base64ToBytes(sessionRecord.rootKey),
    "north-dh-ratchet-root"
  );
  const nextSendingChainKey = await deriveSessionSecret(
    nextRootKey,
    encodeRatchetCounter(0),
    "north-dh-ratchet-send"
  );

  sessionRecord.rootKey = bytesToBase64(nextRootKey);
  sessionRecord.sendingChainKey = bytesToBase64(nextSendingChainKey);
  sessionRecord.sendingCounter = 0;
  sessionRecord.sendingRatchetUsed = true;
  sessionRecord.pendingSendingRatchetStep = false;
}

async function getReceivingMessageKey(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  messageCounter: number
): Promise<Uint8Array> {
  const cacheKey = buildSessionMessageCacheKey("recv", ratchetPublicKey, messageCounter);
  const cachedMessageKey = sessionRecord.cachedMessageKeys?.[cacheKey];
  if (cachedMessageKey) {
    return base64ToBytes(cachedMessageKey);
  }

  const currentReceivingChain = resolveReceivingChain(sessionRecord, ratchetPublicKey);
  if (!currentReceivingChain) {
    throw new Error("Encrypted message chain is no longer available for this session");
  }

  if (messageCounter < currentReceivingChain.counter) {
    throw new Error("Encrypted message key is no longer available for this session");
  }
  if (messageCounter - currentReceivingChain.counter > DEVICE_MAX_MESSAGE_GAP) {
    throw new Error("Encrypted message counter gap is too large for this session");
  }

  let currentCounter = currentReceivingChain.counter;
  let currentChainKey: Uint8Array = base64ToBytes(currentReceivingChain.chainKey);
  while (currentCounter <= messageCounter) {
    const ratchetStep = await deriveMessageRatchetStep(currentChainKey, currentCounter);
    cacheSessionMessageKey(
      sessionRecord,
      "recv",
      ratchetPublicKey,
      currentCounter,
      ratchetStep.messageKey
    );
    currentChainKey = Uint8Array.from(ratchetStep.nextChainKey);
    currentCounter += 1;
  }

  updateReceivingChain(sessionRecord, ratchetPublicKey, {
    chainKey: bytesToBase64(currentChainKey),
    counter: currentCounter,
  });
  const resolvedMessageKey =
    sessionRecord.cachedMessageKeys?.[buildSessionMessageCacheKey("recv", ratchetPublicKey, messageCounter)];
  if (!resolvedMessageKey) {
    throw new Error("Encrypted message key could not be derived for this session");
  }

  return base64ToBytes(resolvedMessageKey);
}

async function getEnvelopeMessageKey(
  sessionRecord: DeviceSessionRecord,
  envelope: DirectDeviceEnvelope,
  currentUserId: string,
  currentDeviceId: string
): Promise<Uint8Array> {
  if (
    envelope.senderUserId === currentUserId &&
    envelope.senderDeviceId === currentDeviceId
  ) {
    const ownSentMessageKey =
      sessionRecord.cachedMessageKeys?.[
        buildSessionMessageCacheKey("send", envelope.ratchetPublicKey, envelope.messageCounter)
      ];
    if (ownSentMessageKey) {
      return base64ToBytes(ownSentMessageKey);
    }
  }

  return getReceivingMessageKey(sessionRecord, envelope.ratchetPublicKey, envelope.messageCounter ?? 0);
}

async function applyIncomingDhRatchet(
  sessionRecord: DeviceSessionRecord,
  remoteRatchetPublicKey: string
) {
  const sendingRatchetPrivateKey = await importDevicePrivateKey(
    sessionRecord.sendingRatchetPrivateKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const remoteRatchetPublic = await importDevicePublicKey(
    remoteRatchetPublicKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const dhSecret = await deriveAgreementSecret(sendingRatchetPrivateKey, remoteRatchetPublic);
  const nextRootKey = await deriveSessionSecret(
    dhSecret,
    base64ToBytes(sessionRecord.rootKey),
    "north-dh-ratchet-root"
  );
  const nextReceivingChainKey = await deriveSessionSecret(
    nextRootKey,
    encodeRatchetCounter(0),
    "north-dh-ratchet-recv"
  );

  if (sessionRecord.remoteRatchetPublicKey) {
    storeReceivingChain(sessionRecord, sessionRecord.remoteRatchetPublicKey, {
      chainKey: sessionRecord.receivingChainKey,
      counter: sessionRecord.receivingCounter,
    });
  }
  sessionRecord.rootKey = bytesToBase64(nextRootKey);
  sessionRecord.receivingChainKey = bytesToBase64(nextReceivingChainKey);
  sessionRecord.receivingCounter = 0;
  sessionRecord.remoteRatchetPublicKey = remoteRatchetPublicKey;
  sessionRecord.sendingRatchetUsed = true;
  sessionRecord.pendingSendingRatchetStep = true;
}

async function deriveMessageRatchetStep(
  chainKey: Uint8Array,
  counter: number
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  const counterBytes = encodeRatchetCounter(counter);
  const messageKey = await deriveSessionSecret(chainKey, counterBytes, "north-ratchet-message");
  const nextChainKey = await deriveSessionSecret(chainKey, counterBytes, "north-ratchet-next");
  return {
    messageKey,
    nextChainKey,
  };
}

function cacheSessionMessageKey(
  sessionRecord: DeviceSessionRecord,
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number,
  messageKey: Uint8Array
) {
  const nextCache = {
    ...(sessionRecord.cachedMessageKeys ?? {}),
    [buildSessionMessageCacheKey(direction, ratchetPublicKey, counter)]: bytesToBase64(messageKey),
  };
  sessionRecord.cachedMessageKeys = pruneCachedSessionMessageKeys(nextCache);
}

function pruneCachedSessionMessageKeys(cache: Record<string, string>) {
  // Keep every derived direct-message key so historical envelopes remain decryptable
  // regardless of how far later traffic advances the ratchet.
  return cache;
}

function buildSessionMessageCacheKey(
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number
) {
  return `${direction}|${ratchetPublicKey}|${counter}`;
}

function resolveReceivingChain(sessionRecord: DeviceSessionRecord, ratchetPublicKey: string) {
  if (sessionRecord.remoteRatchetPublicKey === ratchetPublicKey) {
    return {
      chainKey: sessionRecord.receivingChainKey,
      counter: sessionRecord.receivingCounter,
    };
  }

  return sessionRecord.receivingChains?.[ratchetPublicKey] ?? null;
}

function updateReceivingChain(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  chain: { chainKey: string; counter: number }
) {
  if (sessionRecord.remoteRatchetPublicKey === ratchetPublicKey) {
    sessionRecord.receivingChainKey = chain.chainKey;
    sessionRecord.receivingCounter = chain.counter;
    return;
  }

  storeReceivingChain(sessionRecord, ratchetPublicKey, chain);
}

function storeReceivingChain(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  chain: { chainKey: string; counter: number }
) {
  sessionRecord.receivingChains = {
    ...(sessionRecord.receivingChains ?? {}),
    [ratchetPublicKey]: chain,
  };
}

function encodeRatchetCounter(counter: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, counter, false);
  return bytes;
}

function buildDirectEnvelopeAdditionalData(
  envelope: Omit<DirectDeviceEnvelope, "ciphertext">
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      recipientDeviceId: envelope.recipientDeviceId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderIdentityKey: envelope.senderIdentityKey,
      senderIdentitySignatureKey: envelope.senderIdentitySignatureKey,
      initiatorEphemeralPublicKey: envelope.initiatorEphemeralPublicKey,
      ratchetPublicKey: envelope.ratchetPublicKey,
      recipientSignedPrekeyId: envelope.recipientSignedPrekeyId,
      recipientOneTimePrekeyId: envelope.recipientOneTimePrekeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
    })
  );
}

function buildGroupEnvelopeAdditionalData(
  envelope: Omit<GroupSharedEnvelope, "ciphertext" | "signature">
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      chatId: envelope.chatId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderKeyId: envelope.senderKeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
    })
  );
}

async function decryptGroupHistoryEnvelopeContent(
  historyEnvelope: GroupHistoryEnvelope,
  sharedEnvelope: GroupSharedEnvelope,
  historyKeyRecord: GroupHistoryKeyRecord
) {
  const historyKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(historyKeyRecord.keyMaterial)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(historyEnvelope.iv),
      additionalData: buildGroupHistoryEnvelopeAdditionalData(historyEnvelope, sharedEnvelope),
    },
    historyKey,
    base64ToBytes(historyEnvelope.ciphertext)
  );

  return textDecoder.decode(plaintext);
}

function buildGroupEnvelopeSignatureData(
  envelope: GroupSharedEnvelope | (Omit<GroupSharedEnvelope, "signature"> & { signature?: string })
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      chatId: envelope.chatId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderKeyId: envelope.senderKeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
    })
  );
}

async function decryptGroupSharedEnvelopeContent(
  sharedEnvelope: GroupSharedEnvelope,
  messageKeyBytes: Uint8Array
) {
  const messageKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(messageKeyBytes),
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(sharedEnvelope.iv),
      additionalData: buildGroupEnvelopeAdditionalData(sharedEnvelope),
    },
    messageKey,
    base64ToBytes(sharedEnvelope.ciphertext)
  );

  return textDecoder.decode(plaintext);
}

function assertGroupDistributionSenderMatchesSharedEnvelope(
  distributionEnvelope: Pick<
    DirectDeviceEnvelope,
    "senderUserId" | "senderDeviceId" | "senderIdentitySignatureKey"
  >,
  sharedEnvelope: GroupSharedEnvelope
) {
  if (
    distributionEnvelope.senderUserId !== sharedEnvelope.senderUserId ||
    distributionEnvelope.senderDeviceId !== sharedEnvelope.senderDeviceId
  ) {
    throw new Error("Encrypted group sender key distribution sender is invalid");
  }
}

async function assertValidGroupEnvelopeSignature(
  sharedEnvelope: GroupSharedEnvelope,
  senderIdentitySignatureKey: string
) {
  const signatureKey = await importDevicePublicKey(
    senderIdentitySignatureKey,
    DEVICE_SIGNATURE_KEY_ALGORITHM,
    ["verify"]
  );
  const validSignature = await window.crypto.subtle.verify(
    { name: DEVICE_SIGNATURE_KEY_ALGORITHM } as AlgorithmIdentifier,
    signatureKey,
    base64ToBytes(sharedEnvelope.signature),
    buildGroupEnvelopeSignatureData(sharedEnvelope)
  );
  if (!validSignature) {
    throw new Error("Encrypted group message signature is invalid");
  }
}

function getGroupInboundSenderChainMapKey(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  senderKeyId: string
) {
  return `${chatId}|${senderUserId}|${senderDeviceId}|${senderKeyId}`;
}

function resolveInboundGroupSenderChainRecord(
  state: GroupSenderChainState,
  sharedEnvelope: GroupSharedEnvelope
) {
  return (
    state.inboundChains[
      getGroupInboundSenderChainMapKey(
        sharedEnvelope.chatId,
        sharedEnvelope.senderUserId,
        sharedEnvelope.senderDeviceId,
        sharedEnvelope.senderKeyId
      )
    ] ?? null
  );
}

function cacheGroupInboundMessageKey(
  record: GroupInboundSenderChainRecord,
  counter: number,
  messageKey: Uint8Array
) {
  const nextCache = {
    ...(record.cachedMessageKeys ?? {}),
    [String(counter)]: bytesToBase64(messageKey),
  };
  record.cachedMessageKeys = pruneCachedGroupInboundMessageKeys(nextCache);
}

function pruneCachedGroupInboundMessageKeys(cache: Record<string, string>) {
  // Keep every derived group-message key so older messages stay readable after
  // later sender-chain traffic advances the counter.
  return cache;
}

async function resolveInboundGroupMessageKey(
  record: GroupInboundSenderChainRecord,
  messageCounter: number
) {
  const cachedMessageKey = record.cachedMessageKeys?.[String(messageCounter)];
  if (cachedMessageKey) {
    return base64ToBytes(cachedMessageKey);
  }

  if (messageCounter < record.nextMessageCounter) {
    throw new Error("Encrypted group message key is no longer available for this sender chain");
  }
  if (messageCounter - record.nextMessageCounter > GROUP_MAX_MESSAGE_GAP) {
    throw new Error("Encrypted group message counter gap is too large for this sender chain");
  }

  let currentCounter = record.nextMessageCounter;
  let currentChainKey = base64ToBytes(record.nextChainKey);
  while (currentCounter <= messageCounter) {
    const ratchetStep = await deriveMessageRatchetStep(currentChainKey, currentCounter);
    cacheGroupInboundMessageKey(record, currentCounter, ratchetStep.messageKey);
    currentChainKey = Uint8Array.from(ratchetStep.nextChainKey);
    currentCounter += 1;
  }

  record.nextChainKey = bytesToBase64(currentChainKey);
  record.nextMessageCounter = currentCounter;
  record.updatedAt = new Date().toISOString();
  const resolvedMessageKey = record.cachedMessageKeys?.[String(messageCounter)];
  if (!resolvedMessageKey) {
    throw new Error("Encrypted group message key could not be derived for this sender chain");
  }

  return base64ToBytes(resolvedMessageKey);
}

function upsertInboundGroupSenderChainRecord(
  state: GroupSenderChainState,
  distribution: GroupSenderKeyDistribution,
  ratchetStep: { messageKey: Uint8Array; nextChainKey: Uint8Array }
) {
  const chainKey = getGroupInboundSenderChainMapKey(
    distribution.chatId,
    distribution.senderUserId,
    distribution.senderDeviceId,
    distribution.senderKeyId
  );
  const existingRecord = state.inboundChains[chainKey];
  const nextRecord: GroupInboundSenderChainRecord = existingRecord ?? {
    chatId: distribution.chatId,
    senderUserId: distribution.senderUserId,
    senderDeviceId: distribution.senderDeviceId,
    senderKeyId: distribution.senderKeyId,
    nextChainKey: bytesToBase64(ratchetStep.nextChainKey),
    nextMessageCounter: distribution.messageCounter + 1,
    cachedMessageKeys: {},
    updatedAt: new Date().toISOString(),
  };

  cacheGroupInboundMessageKey(nextRecord, distribution.messageCounter, ratchetStep.messageKey);
  if (distribution.messageCounter >= nextRecord.nextMessageCounter - 1) {
    nextRecord.nextChainKey = bytesToBase64(ratchetStep.nextChainKey);
    nextRecord.nextMessageCounter = distribution.messageCounter + 1;
  }
  nextRecord.updatedAt = new Date().toISOString();
  state.inboundChains[chainKey] = nextRecord;
  pruneInboundGroupSenderChains(state);
}

function pruneInboundGroupSenderChains(state: GroupSenderChainState) {
  void state;
}

async function decryptDirectMessage(payload: EncryptedMessagePayload, userId: string) {
  const ownMaterial = await readEncryptionDeviceMaterial(userId);
  if (!isRegisteredEncryptionDeviceMaterialAvailable(ownMaterial)) {
    throw new Error("Encrypted device session is not available in this browser");
  }

  const serializedEnvelope = payload.encryptedKeysByRecipientId[ownMaterial.deviceId];
  if (!serializedEnvelope) {
    throw new Error("Encrypted device envelope is not available for this device");
  }

  return decryptDirectRecipientEnvelopeContent(serializedEnvelope, userId, ownMaterial);
}

async function decryptGroupMessage(message: ApiChatMessage, userId: string) {
  const payload = message.encryptedPayload;
  if (!payload) {
    throw new Error("Encrypted group payload is not available");
  }
  const ownMaterial = await readEncryptionDeviceMaterial(userId);
  if (!isRegisteredEncryptionDeviceMaterialAvailable(ownMaterial)) {
    throw new Error("Encrypted device session is not available in this browser");
  }

  if (!payload.sharedEnvelope) {
    throw new Error("Encrypted group envelope is not available");
  }

  const sharedEnvelope = parseGroupSharedEnvelope(payload.sharedEnvelope);
  const serializedDistributionEnvelope = payload.encryptedKeysByRecipientId[ownMaterial.deviceId];
  if (!serializedDistributionEnvelope) {
    if (payload.historyEnvelope) {
      return decryptGroupHistoryMessage(message, userId, ownMaterial, sharedEnvelope);
    }
    throw new Error("Encrypted group sender key distribution is not available for this device");
  }

  const distributionEnvelopeMetadata = parseDirectDeviceEnvelope(serializedDistributionEnvelope);
  if (distributionEnvelopeMetadata.recipientDeviceId !== ownMaterial.deviceId) {
    throw new Error("Encrypted device envelope is not addressed to this device");
  }
  assertGroupDistributionSenderMatchesSharedEnvelope(distributionEnvelopeMetadata, sharedEnvelope);
  const senderChainState = await readGroupSenderChainState(userId);
  const cachedInboundSenderChain = resolveInboundGroupSenderChainRecord(senderChainState, sharedEnvelope);
  if (cachedInboundSenderChain) {
    await assertValidGroupEnvelopeSignature(
      sharedEnvelope,
      distributionEnvelopeMetadata.senderIdentitySignatureKey
    );
    try {
      const cachedMessageKey = await resolveInboundGroupMessageKey(
        cachedInboundSenderChain,
        sharedEnvelope.messageCounter
      );
      writeGroupSenderChainState(userId, senderChainState);
      await rememberGroupSenderChainState(userId, senderChainState);
      return decryptGroupSharedEnvelopeContent(sharedEnvelope, cachedMessageKey);
    } catch {
      if (payload.historyEnvelope) {
        return decryptGroupHistoryMessage(message, userId, ownMaterial, sharedEnvelope);
      }
      // Fall through to the direct distribution envelope path when the cached inbound
      // sender-chain state no longer covers this exact message.
    }
  }

  const { content: distributionContent, envelope: distributionEnvelope } =
    await decryptDirectRecipientEnvelope(serializedDistributionEnvelope, userId, ownMaterial);
  assertGroupDistributionSenderMatchesSharedEnvelope(distributionEnvelope, sharedEnvelope);

  const distribution = parseGroupSenderKeyDistribution(distributionContent);
  if (
    distribution.chatId !== sharedEnvelope.chatId ||
    distribution.senderUserId !== sharedEnvelope.senderUserId ||
    distribution.senderDeviceId !== sharedEnvelope.senderDeviceId ||
    distribution.senderKeyId !== sharedEnvelope.senderKeyId ||
    distribution.messageCounter !== sharedEnvelope.messageCounter
  ) {
    throw new Error("Encrypted group sender key distribution does not match the message");
  }

  await assertValidGroupEnvelopeSignature(
    sharedEnvelope,
    distributionEnvelope.senderIdentitySignatureKey
  );

  const groupRatchetStep = await deriveMessageRatchetStep(
    base64ToBytes(distribution.chainKey),
    distribution.messageCounter
  );
  const plaintext = await decryptGroupSharedEnvelopeContent(
    sharedEnvelope,
    groupRatchetStep.messageKey
  );
  upsertInboundGroupSenderChainRecord(senderChainState, distribution, groupRatchetStep);
  writeGroupSenderChainState(userId, senderChainState);
  await rememberGroupSenderChainState(userId, senderChainState);
  return plaintext;
}

async function decryptGroupHistoryMessage(
  message: ApiChatMessage,
  userId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  sharedEnvelope: GroupSharedEnvelope
) {
  if (!message.encryptedPayload?.historyEnvelope) {
    throw new Error("Encrypted group history envelope is not available");
  }

  const historyEnvelope = parseGroupHistoryEnvelope(message.encryptedPayload.historyEnvelope);
  let historyKeyRecord = await resolveLocalGroupHistoryKeyRecord(
    userId,
    sharedEnvelope.chatId,
    historyEnvelope.historyKeyId
  );
  if (!historyKeyRecord) {
    const session =
      recoverySyncSessionByUserId.get(userId) ?? (await waitForRecoverySyncSession(userId));
    if (!session) {
      throw new Error("Encrypted group history key is not available for this device");
    }

    historyKeyRecord = await resolveGroupHistoryKeyRecordFromServer(
      session.token,
      userId,
      sharedEnvelope.chatId,
      ownMaterial
    );
  }
  if (!historyKeyRecord || historyKeyRecord.historyKeyId !== historyEnvelope.historyKeyId) {
    throw new Error("Encrypted group history key is not available for this message");
  }

  return decryptGroupHistoryEnvelopeContent(historyEnvelope, sharedEnvelope, historyKeyRecord);
}

async function decryptDirectRecipientEnvelopeContent(
  serializedEnvelope: string,
  userId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial
) {
  const { content } = await decryptDirectRecipientEnvelope(serializedEnvelope, userId, ownMaterial);
  return content;
}

async function decryptDirectRecipientEnvelope(
  serializedEnvelope: string,
  userId: string,
  ownMaterial: DeviceEncryptionMaterial
) {
  if (!isRegisteredEncryptionDeviceMaterialAvailable(ownMaterial)) {
    throw new Error("Encrypted device session is not available in this browser");
  }

  const envelope = parseDirectDeviceEnvelope(serializedEnvelope);
  if (envelope.recipientDeviceId !== ownMaterial.deviceId) {
    throw new Error("Encrypted device envelope is not addressed to this device");
  }
  await assertTrustedDirectSender(envelope);

  const sessions = await readDeviceSessions(userId);
  const sessionKey = getDeviceSessionMapKey(envelope.senderUserId, envelope.senderDeviceId);
  const selectedSessionEntry = findDeviceSessionEntryForEnvelope(
    sessions,
    envelope,
    userId,
    ownMaterial.deviceId
  );
  let sessionStorageKey = selectedSessionEntry?.[0] ?? sessionKey;
  let sessionRecord = selectedSessionEntry?.[1] ?? null;
  if (!sessionRecord) {
    sessionRecord = await establishResponderDeviceSession(userId, ownMaterial, envelope);
    setCurrentDeviceSessionRecord(sessions, sessionRecord);
    sessionStorageKey = sessionKey;
    writeEncryptionDeviceMaterial(userId, ownMaterial);
    await rememberEncryptionDeviceMaterial(userId, ownMaterial);
  }
  if (
    envelope.senderUserId !== userId &&
    envelope.senderDeviceId !== ownMaterial.deviceId &&
    sessionRecord.remoteRatchetPublicKey !== envelope.ratchetPublicKey &&
    !resolveReceivingChain(sessionRecord, envelope.ratchetPublicKey)
  ) {
    await applyIncomingDhRatchet(sessionRecord, envelope.ratchetPublicKey);
  }
  const messageKeyBytes = await getEnvelopeMessageKey(
    sessionRecord,
    envelope,
    userId,
    ownMaterial.deviceId
  );
  sessions[sessionStorageKey] = sessionRecord;
  writeDeviceSessions(userId, sessions);
  await rememberDeviceSessions(userId, sessions);

  const messageKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(messageKeyBytes),
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );
  const plaintext = await window.crypto.subtle.decrypt(
    buildDirectDecryptionAlgorithm(envelope),
    messageKey,
    base64ToBytes(envelope.ciphertext)
  );

  return {
    content: textDecoder.decode(plaintext),
    envelope,
  };
}

function parseDirectDeviceEnvelope(value: string): DirectDeviceEnvelope {
  const parsed = JSON.parse(value) as Partial<DirectDeviceEnvelope>;
  if (
    parsed.aadVersion !== DIRECT_ENVELOPE_AAD_VERSION ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.recipientDeviceId !== "string" ||
    typeof parsed.senderIdentityKey !== "string" ||
    typeof parsed.senderIdentitySignatureKey !== "string" ||
    typeof parsed.initiatorEphemeralPublicKey !== "string" ||
    typeof parsed.ratchetPublicKey !== "string" ||
    typeof parsed.recipientSignedPrekeyId !== "number" ||
    !(typeof parsed.recipientOneTimePrekeyId === "number" || parsed.recipientOneTimePrekeyId === null) ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string"
  ) {
    throw new Error("Malformed direct encrypted envelope");
  }

  return parsed as DirectDeviceEnvelope;
}

function parseGroupSharedEnvelope(value: string): GroupSharedEnvelope {
  const parsed = JSON.parse(value) as Partial<GroupSharedEnvelope>;
  if (
    parsed.aadVersion !== GROUP_SHARED_ENVELOPE_AAD_VERSION ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.senderKeyId !== "string" ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.signature !== "string"
  ) {
    throw new Error("Malformed group shared envelope");
  }

  return parsed as GroupSharedEnvelope;
}

function parseGroupHistoryEnvelope(value: string): GroupHistoryEnvelope {
  const parsed = JSON.parse(value) as Partial<GroupHistoryEnvelope>;
  if (
    parsed.aadVersion !== GROUP_HISTORY_ENVELOPE_AAD_VERSION ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string"
  ) {
    throw new Error("Malformed group history envelope");
  }

  return parsed as GroupHistoryEnvelope;
}

function parseGroupSenderKeyDistribution(value: string): GroupSenderKeyDistribution {
  const parsed = JSON.parse(value) as Partial<GroupSenderKeyDistribution>;
  if (
    parsed.aadVersion !== GROUP_SENDER_DISTRIBUTION_AAD_VERSION ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.senderKeyId !== "string" ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.chainKey !== "string"
  ) {
    throw new Error("Malformed group sender key distribution");
  }

  return parsed as GroupSenderKeyDistribution;
}

function parseGroupHistoryKeyGrantPayload(value: string): GroupHistoryKeyGrantPayload {
  const parsed = JSON.parse(value) as Partial<GroupHistoryKeyGrantPayload>;
  if (
    parsed.aadVersion !== GROUP_HISTORY_KEY_GRANT_AAD_VERSION ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.historyKey !== "string" ||
    typeof parsed.createdAt !== "string"
  ) {
    throw new Error("Malformed group history key grant");
  }

  return parsed as GroupHistoryKeyGrantPayload;
}

function shouldReestablishResponderDeviceSession(
  sessionRecord: DeviceSessionRecord,
  envelope: DirectDeviceEnvelope
) {
  return (
    sessionRecord.remoteIdentityKey !== envelope.senderIdentityKey ||
    sessionRecord.remoteIdentitySignatureKey !== envelope.senderIdentitySignatureKey ||
    sessionRecord.remoteSignedPrekeyId !== envelope.recipientSignedPrekeyId ||
    (envelope.recipientOneTimePrekeyId !== null &&
      sessionRecord.remoteOneTimePrekeyId !== envelope.recipientOneTimePrekeyId) ||
    sessionRecord.initiatorEphemeralPublicKey !== envelope.initiatorEphemeralPublicKey
  );
}

function buildDirectDecryptionAlgorithm(
  envelope: DirectDeviceEnvelope
): AesGcmParams {
  return {
    name: "AES-GCM",
    iv: base64ToBytes(envelope.iv),
    additionalData: buildDirectEnvelopeAdditionalData({
      ...envelope,
    }),
  };
}

async function assertTrustedDirectSender(envelope: DirectDeviceEnvelope) {
  const pinnedRecord = readPinnedDeviceBundleRecord(envelope.senderUserId, envelope.senderDeviceId);
  if (!pinnedRecord) {
    return;
  }

  const identityFingerprint = await fingerprintPublicKey(envelope.senderIdentityKey);
  const identitySignatureFingerprint = await fingerprintPublicKey(envelope.senderIdentitySignatureKey);
  if (
    pinnedRecord.identityFingerprint !== identityFingerprint ||
    pinnedRecord.identitySignatureFingerprint !== identitySignatureFingerprint
  ) {
    throw new ApiError(ENCRYPTION_IDENTITY_CHANGED_MESSAGE, 409);
  }
}

function resolveRecipientSignedPrekeyMaterial(
  ownMaterial: DeviceEncryptionMaterial,
  signedPrekeyId: number
) {
  if (ownMaterial.signedPrekeyId === signedPrekeyId) {
    return {
      signedPrekeyId: ownMaterial.signedPrekeyId,
      signedPrekeyPublicKey: ownMaterial.signedPrekeyPublicKey,
      signedPrekeyPrivateKey: ownMaterial.signedPrekeyPrivateKey,
      signedPrekeyAlgorithm: ownMaterial.signedPrekeyAlgorithm,
    };
  }

  const retiredSignedPrekey = pruneRetiredSignedPrekeys(ownMaterial.retiredSignedPrekeys).find(
    (prekey) => prekey.signedPrekeyId === signedPrekeyId
  );
  if (!retiredSignedPrekey) {
    throw new Error("Referenced signed prekey is not available on this device");
  }

  ownMaterial.retiredSignedPrekeys = pruneRetiredSignedPrekeys(ownMaterial.retiredSignedPrekeys);
  return retiredSignedPrekey;
}

function resolveRecipientOneTimePrekeyMaterial(
  ownMaterial: DeviceEncryptionMaterial,
  keyId: number
) {
  const currentPrekey = ownMaterial.oneTimePrekeys.find((prekey) => prekey.keyId === keyId);
  if (currentPrekey) {
    return currentPrekey;
  }

  const retiredPrekey = pruneRetiredOneTimePrekeys(ownMaterial.retiredOneTimePrekeys).find(
    (prekey) => prekey.keyId === keyId
  );
  if (!retiredPrekey) {
    return null;
  }

  ownMaterial.retiredOneTimePrekeys = pruneRetiredOneTimePrekeys(ownMaterial.retiredOneTimePrekeys);
  return retiredPrekey;
}

function consumeRecipientOneTimePrekeyMaterial(
  ownMaterial: DeviceEncryptionMaterial,
  keyId: number
) {
  ownMaterial.oneTimePrekeys = ownMaterial.oneTimePrekeys.filter((prekey) => prekey.keyId !== keyId);
  ownMaterial.retiredOneTimePrekeys = pruneRetiredOneTimePrekeys(
    ownMaterial.retiredOneTimePrekeys
  ).filter((prekey) => prekey.keyId !== keyId);
}

async function establishResponderDeviceSession(
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  envelope: DirectDeviceEnvelope
): Promise<DeviceSessionRecord> {
  const ownIdentityPrivateKey = await importDevicePrivateKey(
    ownMaterial.identityPrivateKey,
    ownMaterial.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const recipientSignedPrekey = resolveRecipientSignedPrekeyMaterial(
    ownMaterial,
    envelope.recipientSignedPrekeyId
  );
  const ownSignedPrekeyPrivateKey = await importDevicePrivateKey(
    recipientSignedPrekey.signedPrekeyPrivateKey,
    recipientSignedPrekey.signedPrekeyAlgorithm,
    ["deriveBits"]
  );
  const senderIdentityPublicKey = await importDevicePublicKey(
    envelope.senderIdentityKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const sendingRatchetKeyPair = await generateAsymmetricKeyPair(DEVICE_AGREEMENT_KEY_ALGORITHM, [
    "deriveBits",
  ]);
  const initiatorEphemeralPublicKey = await importDevicePublicKey(
    envelope.initiatorEphemeralPublicKey,
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );

  const sharedSecrets = [
    await deriveAgreementSecret(ownSignedPrekeyPrivateKey, senderIdentityPublicKey),
    await deriveAgreementSecret(ownIdentityPrivateKey, initiatorEphemeralPublicKey),
    await deriveAgreementSecret(ownSignedPrekeyPrivateKey, initiatorEphemeralPublicKey),
  ];

  if (envelope.recipientOneTimePrekeyId !== null) {
    const oneTimePrekey = resolveRecipientOneTimePrekeyMaterial(
      ownMaterial,
      envelope.recipientOneTimePrekeyId
    );
    if (!oneTimePrekey) {
      throw new Error("Referenced one-time prekey is not available on this device");
    }
    const oneTimePrekeyPrivateKey = await importDevicePrivateKey(
      oneTimePrekey.privateKey,
      DEVICE_AGREEMENT_KEY_ALGORITHM,
      ["deriveBits"]
    );
    sharedSecrets.push(
      await deriveAgreementSecret(oneTimePrekeyPrivateKey, initiatorEphemeralPublicKey)
    );
    consumeRecipientOneTimePrekeyMaterial(ownMaterial, envelope.recipientOneTimePrekeyId);
  }

  const transcript = buildInitialDeviceSessionTranscript({
    initiatorUserId: envelope.senderUserId,
    initiatorDeviceId: envelope.senderDeviceId,
    responderUserId: currentUserId,
    responderDeviceId: ownMaterial.deviceId,
    responderSignedPrekeyId: envelope.recipientSignedPrekeyId,
    responderOneTimePrekeyId: envelope.recipientOneTimePrekeyId,
    initiatorEphemeralPublicKey: envelope.initiatorEphemeralPublicKey,
  });
  const masterSecret = concatByteArrays(sharedSecrets);
  const rootKey = await deriveSessionSecret(masterSecret, transcript, "north-x3dh-root");
  const receivingChainKey = await deriveSessionSecret(rootKey, transcript, "north-x3dh-send");
  const sendingChainKey = await deriveSessionSecret(rootKey, transcript, "north-x3dh-recv");

  return {
    sessionId: window.crypto.randomUUID(),
    peerUserId: envelope.senderUserId,
    peerDeviceId: envelope.senderDeviceId,
    sessionOrigin: "responder",
    ownMaterialId: ownMaterial.materialId,
    remoteIdentityKey: envelope.senderIdentityKey,
    remoteIdentitySignatureKey: envelope.senderIdentitySignatureKey,
    remoteSignedPrekeyId: envelope.recipientSignedPrekeyId,
    remoteSignedPrekeyPublicKey: recipientSignedPrekey.signedPrekeyPublicKey,
    remoteOneTimePrekeyId: envelope.recipientOneTimePrekeyId,
    initiatorEphemeralPublicKey: envelope.initiatorEphemeralPublicKey,
    sendingRatchetPublicKey: await exportJsonWebKey(sendingRatchetKeyPair.publicKey),
    sendingRatchetPrivateKey: await exportJsonWebKey(sendingRatchetKeyPair.privateKey),
    remoteRatchetPublicKey: envelope.ratchetPublicKey ?? envelope.initiatorEphemeralPublicKey,
    sendingRatchetUsed: false,
    pendingSendingRatchetStep: true,
    rootKey: bytesToBase64(rootKey),
    sendingChainKey: bytesToBase64(sendingChainKey),
    receivingChainKey: bytesToBase64(receivingChainKey),
    sendingCounter: 0,
    receivingCounter: 0,
    cachedMessageKeys: {},
    establishedAt: new Date().toISOString(),
  };
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

async function importDevicePublicKey(
  serializedPublicKey: string,
  algorithm: string,
  usages: KeyUsage[]
) {
  const normalizedUsages =
    algorithm === DEVICE_AGREEMENT_KEY_ALGORITHM &&
    usages.length > 0 &&
    usages.every((usage) => usage === "deriveBits")
      ? []
      : usages;
  const parsedPublicKey = JSON.parse(serializedPublicKey) as JsonWebKey;
  const normalizedPublicKey: JsonWebKey = Array.isArray(parsedPublicKey.key_ops)
    ? {
        ...parsedPublicKey,
        key_ops: [...normalizedUsages],
      }
    : parsedPublicKey;
  const cacheKey = `${algorithm}:${JSON.stringify(normalizedPublicKey)}:${normalizedUsages.join(",")}`;
  const cachedKey = importedDevicePublicKeyCache.get(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importPromise = window.crypto.subtle.importKey(
    "jwk",
    normalizedPublicKey,
    { name: algorithm } as AlgorithmIdentifier,
    false,
    normalizedUsages
  );

  importedDevicePublicKeyCache.set(cacheKey, importPromise);
  try {
    return await importPromise;
  } catch (error) {
    importedDevicePublicKeyCache.delete(cacheKey);
    throw error;
  }
}

async function importDevicePrivateKey(
  serializedPrivateKey: string,
  algorithm: string,
  usages: KeyUsage[]
) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPrivateKey) as JsonWebKey,
    { name: algorithm } as AlgorithmIdentifier,
    false,
    usages
  );
}

async function deriveAgreementSecret(privateKey: CryptoKey, publicKey: CryptoKey) {
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: DEVICE_AGREEMENT_KEY_ALGORITHM,
      public: publicKey,
    } as EcdhKeyDeriveParams,
    privateKey,
    256
  );
  return new Uint8Array(sharedBits);
}

async function deriveSessionSecret(
  ikm: Uint8Array,
  salt: Uint8Array,
  label: string
): Promise<Uint8Array> {
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(ikm),
    "HKDF",
    false,
    ["deriveBits"]
  );
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(textEncoder.encode(label)),
    },
    baseKey,
    256
  );
  return new Uint8Array(derivedBits);
}

function concatByteArrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function buildInitialDeviceSessionTranscript(params: {
  initiatorUserId: string;
  initiatorDeviceId: string | null;
  responderUserId: string;
  responderDeviceId: string;
  responderSignedPrekeyId: number;
  responderOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
}) {
  if (!params.initiatorDeviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  return textEncoder.encode(
    JSON.stringify({
      initiatorUserId: params.initiatorUserId,
      initiatorDeviceId: params.initiatorDeviceId,
      responderUserId: params.responderUserId,
      responderDeviceId: params.responderDeviceId,
      responderSignedPrekeyId: params.responderSignedPrekeyId,
      responderOneTimePrekeyId: params.responderOneTimePrekeyId,
      initiatorEphemeralPublicKey: params.initiatorEphemeralPublicKey,
    })
  );
}

function readUnlockedIdentity(userId: string): LocalIdentity | null {
  const inMemoryIdentity = unlockedIdentityByUserId.get(userId) ?? null;
  if (inMemoryIdentity) {
    return inMemoryIdentity;
  }

  const sessionIdentity = readUnlockedIdentityFromSession(userId);
  if (!sessionIdentity) {
    const persistentIdentity = readUnlockedIdentityFromPersistentAutoStorage(userId);
    if (!persistentIdentity) {
      return null;
    }

    unlockedIdentityByUserId.set(userId, persistentIdentity);
    writeUnlockedIdentityToSession(userId, persistentIdentity);
    return persistentIdentity;
  }

  unlockedIdentityByUserId.set(userId, sessionIdentity);
  return sessionIdentity;
}

function writeUnlockedIdentity(userId: string, identity: LocalIdentity) {
  unlockedIdentityByUserId.set(userId, identity);
  writeUnlockedIdentityToSession(userId, identity);
  writeUnlockedIdentityToPersistentAutoStorage(userId, identity);
}

function createLocalVaultIdentity(): LocalIdentity {
  return {
    publicKey: "local-device-vault",
    privateKey: bytesToBase64(randomBytes(32)),
  };
}

function buildRecipientDeviceSetHash(bundles: UserEncryptionDeviceBundle[]) {
  return bundles
    .map((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId))
    .sort()
    .join("|");
}

function createGroupSenderChain(
  chatId: string,
  ownMaterial: DeviceEncryptionMaterial,
  recipientDeviceSetHash: string
): GroupSenderChainRecord {
  if (!ownMaterial.deviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  return {
    chatId,
    ownMaterialId: ownMaterial.materialId,
    senderDeviceId: ownMaterial.deviceId,
    senderKeyId: window.crypto.randomUUID(),
    recipientDeviceSetHash,
    chainKey: bytesToBase64(randomBytes(32)),
    nextMessageCounter: 0,
    createdAt: new Date().toISOString(),
  };
}

async function createGroupSharedEnvelope(
  chatId: string,
  senderUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  senderKeyId: string,
  messageCounter: number,
  messageKeyBytes: Uint8Array,
  content: string
): Promise<GroupSharedEnvelope> {
  if (!ownMaterial.deviceId) {
    throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
  }

  const iv = randomBytes(12);
  const messageKey = await window.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(messageKeyBytes),
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt"]
  );
  const metadata: Omit<GroupSharedEnvelope, "ciphertext" | "signature"> = {
    aadVersion: GROUP_SHARED_ENVELOPE_AAD_VERSION,
    chatId,
    senderUserId,
    senderDeviceId: ownMaterial.deviceId,
    senderKeyId,
    messageCounter,
    iv: bytesToBase64(iv),
  };
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildGroupEnvelopeAdditionalData(metadata),
    },
    messageKey,
    textEncoder.encode(content)
  );
  const signingKey = await importDevicePrivateKey(
    ownMaterial.identitySignaturePrivateKey,
    DEVICE_SIGNATURE_KEY_ALGORITHM,
    ["sign"]
  );
  const envelopeWithoutSignature = {
    ...metadata,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  const signature = await window.crypto.subtle.sign(
    { name: DEVICE_SIGNATURE_KEY_ALGORITHM } as AlgorithmIdentifier,
    signingKey,
    buildGroupEnvelopeSignatureData(envelopeWithoutSignature)
  );

  return {
    ...envelopeWithoutSignature,
    signature: bytesToBase64(new Uint8Array(signature)),
  };
}

function normalizeRememberedUnlockedIdentityRecord(
  value: unknown
): RememberedUnlockedIdentityRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RememberedUnlockedIdentityRecord>;
  if (
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
  };
}

function readRememberedUnlockedIdentityRecord(userId: string): RememberedUnlockedIdentityRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getRememberedUnlockedIdentityStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = normalizeRememberedUnlockedIdentityRecord(JSON.parse(rawValue) as unknown);
    if (!parsedRecord) {
      removeUnlockedIdentityFromPersistentStorage(userId);
      return null;
    }

    return parsedRecord;
  } catch {
    removeUnlockedIdentityFromPersistentStorage(userId);
    return null;
  }
}

function writeRememberedUnlockedIdentityRecord(
  userId: string,
  record: RememberedUnlockedIdentityRecord
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getRememberedUnlockedIdentityStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

async function decryptRememberedUnlockedIdentityRecord(
  record: RememberedUnlockedIdentityRecord,
  password: string
): Promise<LocalIdentity | null> {
  try {
    const wrappingKey = await deriveWrappingKey(password, base64ToBytes(record.salt), KDF_ITERATIONS);
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
      return null;
    }

    return {
      publicKey: parsedIdentity.publicKey,
      privateKey: parsedIdentity.privateKey,
    };
  } catch {
    return null;
  }
}

async function readRememberedUnlockedIdentity(
  userId: string,
  password: string
): Promise<LocalIdentity | null> {
  const parsedRecord = readRememberedUnlockedIdentityRecord(userId);
  if (!parsedRecord) {
    return null;
  }

  return decryptRememberedUnlockedIdentityRecord(parsedRecord, password);
}

async function rememberUnlockedIdentity(
  userId: string,
  identity: LocalIdentity,
  password: string
) {
  if (typeof window === "undefined") {
    return;
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(JSON.stringify(identity))
  );

  writeRememberedUnlockedIdentityRecord(userId, {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      createdAt: new Date().toISOString(),
    } satisfies RememberedUnlockedIdentityRecord);
}

async function restoreEncryptionRecoverySnapshot(
  session: AuthResponse,
  password: string
): Promise<LocalIdentity | null> {
  let remoteSnapshot: UserEncryptionRecoverySnapshot;
  try {
    remoteSnapshot = await getOwnEncryptionRecoverySnapshot(session.token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  let wrappedIdentityRecord: RememberedUnlockedIdentityRecord | null = null;
  let snapshotPayloadRecord: EncryptedRecoverySnapshotPayloadRecord | null = null;
  try {
    wrappedIdentityRecord = normalizeRememberedUnlockedIdentityRecord(
      JSON.parse(remoteSnapshot.wrappedIdentityRecordJson) as unknown
    );
    snapshotPayloadRecord = normalizeEncryptedRecoverySnapshotPayloadRecord(
      JSON.parse(remoteSnapshot.snapshotPayloadJson) as unknown
    );
  } catch {
    wrappedIdentityRecord = null;
    snapshotPayloadRecord = null;
  }

  if (!wrappedIdentityRecord || !snapshotPayloadRecord) {
    throw new ApiError(ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE, 409);
  }

  const restoredIdentity = await decryptRememberedUnlockedIdentityRecord(
    wrappedIdentityRecord,
    password
  );
  if (!restoredIdentity) {
    throw new ApiError(ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE, 409);
  }

  const snapshotPayload = await decryptRecoverySnapshotPayload(
    restoredIdentity.privateKey,
    snapshotPayloadRecord
  );
  if (!snapshotPayload) {
    throw new ApiError(ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE, 409);
  }

  writeUnlockedIdentity(session.user.id, restoredIdentity);
  writeRememberedUnlockedIdentityRecord(session.user.id, wrappedIdentityRecord);
  await writeArchivedDecryptedMessageRecords(session.user.id, snapshotPayload.archivedMessages);
  return restoredIdentity;
}

async function ensureRegisteredEncryptionDevice(session: AuthResponse) {
  const registrationKey = session.user.id;
  const cachedRegistrationTimestamp = completedEncryptionDeviceRegistration.get(registrationKey);
  if (
    cachedRegistrationTimestamp &&
    Date.now() - cachedRegistrationTimestamp < DEVICE_REGISTRATION_CACHE_TTL_MS
  ) {
    const material = await readEncryptionDeviceMaterial(session.user.id);
    if (isRegistrationSyncFresh(material)) {
      return;
    }
    completedEncryptionDeviceRegistration.delete(registrationKey);
  }

  const inFlightRegistration = inFlightEncryptionDeviceRegistration.get(registrationKey);
  if (inFlightRegistration) {
    await inFlightRegistration;
    return;
  }

  const registrationPromise = ensureRegisteredEncryptionDeviceInternal(session);
  inFlightEncryptionDeviceRegistration.set(registrationKey, registrationPromise);
  try {
    await registrationPromise;
    if (isRegistrationSyncFresh(await readEncryptionDeviceMaterial(session.user.id))) {
      completedEncryptionDeviceRegistration.set(registrationKey, Date.now());
    }
  } finally {
    if (inFlightEncryptionDeviceRegistration.get(registrationKey) === registrationPromise) {
      inFlightEncryptionDeviceRegistration.delete(registrationKey);
    }
  }
}

async function waitForEncryptionDeviceRegistration(session: AuthResponse) {
  const registrationKey = session.user.id;
  const inFlightRegistration = inFlightEncryptionDeviceRegistration.get(registrationKey);
  if (inFlightRegistration) {
    await inFlightRegistration;
    return;
  }

  let material = await discardUnusableRegisteredEncryptionDeviceMaterial(
    session.user.id,
    await readEncryptionDeviceMaterial(session.user.id)
  );
  if (
    hasFreshCompletedEncryptionDeviceRegistration(registrationKey) &&
    (await isRegisteredEncryptionDeviceMaterialUsable(material))
  ) {
    return;
  }

  await ensureRegisteredEncryptionDevice(session);
  material = await discardUnusableRegisteredEncryptionDeviceMaterial(
    session.user.id,
    await readEncryptionDeviceMaterial(session.user.id)
  );
  if (
    hasFreshCompletedEncryptionDeviceRegistration(registrationKey) &&
    (await isRegisteredEncryptionDeviceMaterialUsable(material))
  ) {
    return;
  }

  material = await recoverRegisteredEncryptionDeviceMaterial(session, material);
  material = await discardUnusableRegisteredEncryptionDeviceMaterial(
    session.user.id,
    material
  );
  if (
    hasFreshCompletedEncryptionDeviceRegistration(registrationKey) &&
    (await isRegisteredEncryptionDeviceMaterialUsable(material))
  ) {
    return;
  }

  material = await forceRegisterEncryptionDevice(session);
  material = await discardUnusableRegisteredEncryptionDeviceMaterial(
    session.user.id,
    material
  );
  if (
    hasFreshCompletedEncryptionDeviceRegistration(registrationKey) &&
    (await isRegisteredEncryptionDeviceMaterialUsable(material))
  ) {
    return;
  }

  throw new ApiError("Encrypted chat is still initializing on this device. Try again.", 409);
}

async function ensureRegisteredEncryptionDeviceInternal(session: AuthResponse) {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return;
  }

  let ownDevices: UserEncryptionDevice[] = [];
  try {
    ownDevices = await listOwnEncryptionDevices(session.token);
  } catch {
    return;
  }

  let material = await discardUnusableRegisteredEncryptionDeviceMaterial(
    session.user.id,
    await readEncryptionDeviceMaterial(session.user.id)
  );
  const existingDevice = findOwnEncryptionDevice(ownDevices, material);

  const rotateSignedPrekey = isSignedPrekeyRotationDue(material, existingDevice);
  const hasMatchingExistingDeviceMaterial = Boolean(
    material &&
      existingDevice &&
      existingDevice.identityKey === material.identityKey &&
      existingDevice.identitySignatureKey === material.identitySignatureKey &&
      existingDevice.signedPrekeyPublicKey === material.signedPrekeyPublicKey
  );

  if (
    material &&
    existingDevice &&
    hasMatchingExistingDeviceMaterial &&
    material.deviceId !== existingDevice.deviceId
  ) {
    const hydratedMaterial = {
      ...material,
      deviceId: existingDevice.deviceId,
    };
    writeEncryptionDeviceMaterial(session.user.id, hydratedMaterial);
    await rememberEncryptionDeviceMaterial(session.user.id, hydratedMaterial);
    completedEncryptionDeviceRegistration.set(session.user.id, Date.now());
    clearCompletedDevicePreparation(session.user.id);
    material = hydratedMaterial;
  }

  if (
    material &&
    existingDevice &&
    hasMatchingExistingDeviceMaterial &&
    material.deviceId === existingDevice.deviceId &&
    existingDevice.availableOneTimePrekeys >= DEVICE_MIN_ONE_TIME_PREKEYS &&
    !rotateSignedPrekey
  ) {
    completedEncryptionDeviceRegistration.set(session.user.id, Date.now());
    return;
  }

  const nextMaterial = material
    ? await refreshEncryptionDeviceMaterial(material, { rotateSignedPrekey })
    : await createEncryptionDeviceMaterial();

  try {
    const persistedDevice = await upsertOwnEncryptionDevice(session.token, {
      deviceId: nextMaterial.deviceId ?? undefined,
      identityKey: nextMaterial.identityKey,
      identityKeyAlgorithm: nextMaterial.identityKeyAlgorithm,
      identitySignatureKey: nextMaterial.identitySignatureKey,
      identitySignatureKeyAlgorithm: nextMaterial.identitySignatureKeyAlgorithm,
      signedPrekeyId: nextMaterial.signedPrekeyId,
      signedPrekeyPublicKey: nextMaterial.signedPrekeyPublicKey,
      signedPrekeySignature: nextMaterial.signedPrekeySignature,
      signedPrekeyAlgorithm: nextMaterial.signedPrekeyAlgorithm,
      oneTimePrekeys: nextMaterial.oneTimePrekeys.map((prekey) => ({
        keyId: prekey.keyId,
        publicKey: prekey.publicKey,
      })),
    });
    const persistedMaterial = {
      ...nextMaterial,
      deviceId: persistedDevice.deviceId,
    };
    writeEncryptionDeviceMaterial(session.user.id, persistedMaterial);
    await rememberEncryptionDeviceMaterial(session.user.id, persistedMaterial);
    completedEncryptionDeviceRegistration.set(session.user.id, Date.now());
    clearCompletedDevicePreparation(session.user.id);
  } catch {
    return;
  }
}

async function recoverRegisteredEncryptionDeviceMaterial(
  session: AuthResponse,
  material?: DeviceEncryptionMaterial | null
) {
  let currentMaterial = material ?? (await readEncryptionDeviceMaterial(session.user.id));
  if (!currentMaterial) {
    return currentMaterial;
  }
  if (currentMaterial.deviceId) {
    return currentMaterial;
  }

  try {
    const existingDevice = findOwnEncryptionDevice(
      await listOwnEncryptionDevices(session.token),
      currentMaterial
    );
    if (
      !existingDevice ||
      existingDevice.identityKey !== currentMaterial.identityKey ||
      existingDevice.identitySignatureKey !== currentMaterial.identitySignatureKey ||
      existingDevice.signedPrekeyPublicKey !== currentMaterial.signedPrekeyPublicKey
    ) {
      return currentMaterial;
    }

    const hydratedMaterial = {
      ...currentMaterial,
      deviceId: existingDevice.deviceId,
    };
    writeEncryptionDeviceMaterial(session.user.id, hydratedMaterial);
    await rememberEncryptionDeviceMaterial(session.user.id, hydratedMaterial);
    completedEncryptionDeviceRegistration.set(session.user.id, Date.now());
    return hydratedMaterial;
  } catch {
    return currentMaterial;
  }
}

async function forceRegisterEncryptionDevice(session: AuthResponse) {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return await readEncryptionDeviceMaterial(session.user.id);
  }

  removeEncryptionDeviceMaterial(session.user.id);
  removeRememberedEncryptionDeviceMaterial(session.user.id);
  removeDeviceSessions(session.user.id);
  removeRememberedDeviceSessions(session.user.id);
  removeGroupSenderChains(session.user.id);
  removeGroupHistoryKeys(session.user.id);
  clearCompletedEncryptionDeviceRegistration(session.user.id);
  clearCompletedDevicePreparation(session.user.id);

  const nextMaterial = await createEncryptionDeviceMaterial();
  const persistedDevice = await upsertOwnEncryptionDevice(session.token, {
    deviceId: nextMaterial.deviceId ?? undefined,
    identityKey: nextMaterial.identityKey,
    identityKeyAlgorithm: nextMaterial.identityKeyAlgorithm,
    identitySignatureKey: nextMaterial.identitySignatureKey,
    identitySignatureKeyAlgorithm: nextMaterial.identitySignatureKeyAlgorithm,
    signedPrekeyId: nextMaterial.signedPrekeyId,
    signedPrekeyPublicKey: nextMaterial.signedPrekeyPublicKey,
    signedPrekeySignature: nextMaterial.signedPrekeySignature,
    signedPrekeyAlgorithm: nextMaterial.signedPrekeyAlgorithm,
    oneTimePrekeys: nextMaterial.oneTimePrekeys.map((prekey) => ({
      keyId: prekey.keyId,
      publicKey: prekey.publicKey,
    })),
  });
  const persistedMaterial = {
    ...nextMaterial,
    deviceId: persistedDevice.deviceId,
  };
  writeEncryptionDeviceMaterial(session.user.id, persistedMaterial);
  await rememberEncryptionDeviceMaterial(session.user.id, persistedMaterial);
  completedEncryptionDeviceRegistration.set(session.user.id, Date.now());
  return persistedMaterial;
}

function isSignedPrekeyRotationDue(
  material: DeviceEncryptionMaterial | null,
  existingDevice: UserEncryptionDevice | null
) {
  const candidateTimestamp =
    material?.signedPrekeyCreatedAt ??
    existingDevice?.registeredAt ??
    material?.createdAt ??
    null;
  if (!candidateTimestamp) {
    return true;
  }

  const createdAt = Date.parse(candidateTimestamp);
  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt >= DEVICE_SIGNED_PREKEY_MAX_AGE_MS;
}

function isGroupSenderChainRotationDue(senderChain: GroupSenderChainRecord) {
  const createdAt = Date.parse(senderChain.createdAt);
  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt >= GROUP_SENDER_KEY_MAX_AGE_MS;
}

function findOwnEncryptionDevice(devices: UserEncryptionDevice[], material: DeviceEncryptionMaterial | null) {
  if (material?.deviceId) {
    const deviceById = devices.find((device) => device.deviceId === material.deviceId);
    if (deviceById) {
      return deviceById;
    }
  }

  if (material) {
    const deviceByKeys =
      devices.find(
        (device) =>
          device.identityKey === material.identityKey &&
          device.identitySignatureKey === material.identitySignatureKey &&
          device.signedPrekeyPublicKey === material.signedPrekeyPublicKey
      ) ?? null;
    if (deviceByKeys) {
      return deviceByKeys;
    }
  }

  return null;
}

function isRegisteredEncryptionDeviceMaterialAvailable(
  material: DeviceEncryptionMaterial | null
): material is RegisteredDeviceEncryptionMaterial {
  return typeof material?.deviceId === "string" && material.deviceId.length > 0;
}

async function isRegisteredEncryptionDeviceMaterialUsable(material: DeviceEncryptionMaterial | null) {
  if (!isRegisteredEncryptionDeviceMaterialAvailable(material)) {
    return false;
  }

  try {
    await importDevicePrivateKey(
      material.identityPrivateKey,
      material.identityKeyAlgorithm,
      ["deriveBits"]
    );
    await importDevicePrivateKey(
      material.signedPrekeyPrivateKey,
      material.signedPrekeyAlgorithm,
      ["deriveBits"]
    );
    await importDevicePrivateKey(
      material.identitySignaturePrivateKey,
      material.identitySignatureKeyAlgorithm,
      ["sign"]
    );
    return true;
  } catch {
    return false;
  }
}

async function discardUnusableRegisteredEncryptionDeviceMaterial(
  userId: string,
  material: DeviceEncryptionMaterial | null
) {
  if (!material || (await isRegisteredEncryptionDeviceMaterialUsable(material))) {
    return material;
  }

  removeEncryptionDeviceMaterial(userId);
  removeRememberedEncryptionDeviceMaterial(userId);
  removeDeviceSessions(userId);
  removeRememberedDeviceSessions(userId);
  removeGroupSenderChains(userId);
  removeGroupHistoryKeys(userId);
  clearCompletedEncryptionDeviceRegistration(userId);
  clearCompletedDevicePreparation(userId);
  return null;
}

function isRegistrationSyncFresh(material: DeviceEncryptionMaterial | null) {
  if (!material || !isRegisteredEncryptionDeviceMaterialAvailable(material)) {
    return false;
  }

  return (
    material.oneTimePrekeys.length >= DEVICE_MIN_ONE_TIME_PREKEYS &&
    !isSignedPrekeyRotationDue(material, null)
  );
}

function clearCompletedEncryptionDeviceRegistration(userId: string) {
  for (const cacheKey of Array.from(completedEncryptionDeviceRegistration.keys())) {
    if (cacheKey === userId || cacheKey.startsWith(`${userId}:`)) {
      completedEncryptionDeviceRegistration.delete(cacheKey);
    }
  }
}

function hasFreshCompletedEncryptionDeviceRegistration(registrationKey: string) {
  const cachedRegistrationTimestamp = completedEncryptionDeviceRegistration.get(registrationKey);
  return Boolean(
    cachedRegistrationTimestamp &&
      Date.now() - cachedRegistrationTimestamp < DEVICE_REGISTRATION_CACHE_TTL_MS
  );
}

async function createEncryptionDeviceMaterial(): Promise<DeviceEncryptionMaterial> {
  const identityAgreement = await generateAsymmetricKeyPair(
    DEVICE_AGREEMENT_KEY_ALGORITHM,
    ["deriveBits"]
  );
  const identitySigning = await generateAsymmetricKeyPair(DEVICE_SIGNATURE_KEY_ALGORITHM, ["sign"]);
  const signedPrekey = await generateAsymmetricKeyPair(DEVICE_AGREEMENT_KEY_ALGORITHM, ["deriveBits"]);
  const signedPrekeyId = nextDeviceKeyId();
  const signedPrekeyPublicKey = await exportJsonWebKey(signedPrekey.publicKey);
  const signedPrekeySignature = bytesToBase64(
    new Uint8Array(
      await window.crypto.subtle.sign(
        DEVICE_SIGNATURE_KEY_ALGORITHM,
        identitySigning.privateKey,
        buildSignedPrekeySignaturePayload(signedPrekeyPublicKey)
      )
    )
  );

  const createdAt = new Date().toISOString();
  return {
    deviceId: null,
    materialId: window.crypto.randomUUID(),
    identityKey: await exportJsonWebKey(identityAgreement.publicKey),
    identityPrivateKey: await exportJsonWebKey(identityAgreement.privateKey),
    identityKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    identitySignatureKey: await exportJsonWebKey(identitySigning.publicKey),
    identitySignaturePrivateKey: await exportJsonWebKey(identitySigning.privateKey),
    identitySignatureKeyAlgorithm: DEVICE_SIGNATURE_KEY_ALGORITHM,
    signedPrekeyId,
    signedPrekeyPublicKey,
    signedPrekeyPrivateKey: await exportJsonWebKey(signedPrekey.privateKey),
    signedPrekeySignature,
    signedPrekeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    oneTimePrekeys: await createOneTimePrekeys(),
    retiredOneTimePrekeys: [],
    retiredSignedPrekeys: [],
    createdAt,
    signedPrekeyCreatedAt: createdAt,
  };
}

async function refreshEncryptionDeviceMaterial(
  currentMaterial: DeviceEncryptionMaterial,
  options: { rotateSignedPrekey: boolean }
): Promise<DeviceEncryptionMaterial> {
  if (!options.rotateSignedPrekey) {
    const refreshedAt = new Date().toISOString();
    return {
      ...currentMaterial,
      retiredOneTimePrekeys: mergeRetiredOneTimePrekeys(
        currentMaterial.retiredOneTimePrekeys,
        currentMaterial.oneTimePrekeys,
        refreshedAt
      ),
      retiredSignedPrekeys: pruneRetiredSignedPrekeys(currentMaterial.retiredSignedPrekeys),
      oneTimePrekeys: await createOneTimePrekeys(),
    };
  }

  const signedPrekey = await generateAsymmetricKeyPair(DEVICE_AGREEMENT_KEY_ALGORITHM, ["deriveBits"]);
  const signaturePrivateKey = await importDevicePrivateKey(
    currentMaterial.identitySignaturePrivateKey,
    currentMaterial.identitySignatureKeyAlgorithm,
    ["sign"]
  );
  const signedPrekeyId = nextDeviceKeyId();
  const signedPrekeyPublicKey = await exportJsonWebKey(signedPrekey.publicKey);
  const signedPrekeySignature = bytesToBase64(
    new Uint8Array(
      await window.crypto.subtle.sign(
        currentMaterial.identitySignatureKeyAlgorithm,
        signaturePrivateKey,
        buildSignedPrekeySignaturePayload(signedPrekeyPublicKey)
      )
    )
  );

  const rotatedAt = new Date().toISOString();
  return {
    ...currentMaterial,
    signedPrekeyId,
    signedPrekeyPublicKey,
    signedPrekeyPrivateKey: await exportJsonWebKey(signedPrekey.privateKey),
    signedPrekeySignature,
    retiredOneTimePrekeys: mergeRetiredOneTimePrekeys(
      currentMaterial.retiredOneTimePrekeys,
      currentMaterial.oneTimePrekeys,
      rotatedAt
    ),
    retiredSignedPrekeys: mergeRetiredSignedPrekeys(currentMaterial, rotatedAt),
    oneTimePrekeys: await createOneTimePrekeys(),
    signedPrekeyCreatedAt: rotatedAt,
  };
}

async function createOneTimePrekeys() {
  const baseKeyId = nextDeviceKeyId();
  return Promise.all(
    Array.from({ length: DEVICE_ONE_TIME_PREKEY_COUNT }, (_, index) =>
      createOneTimePrekeyMaterial(baseKeyId + index + 1)
    )
  );
}

async function createOneTimePrekeyMaterial(keyId: number): Promise<DeviceOneTimePrekeyMaterial> {
  const keyPair = await generateAsymmetricKeyPair(DEVICE_AGREEMENT_KEY_ALGORITHM, ["deriveBits"]);
  return {
    keyId,
    publicKey: await exportJsonWebKey(keyPair.publicKey),
    privateKey: await exportJsonWebKey(keyPair.privateKey),
  };
}

async function generateAsymmetricKeyPair(
  name: string,
  usages: KeyUsage[]
): Promise<CryptoKeyPair> {
  return (await window.crypto.subtle.generateKey(
    { name } as AlgorithmIdentifier,
    true,
    usages
  )) as CryptoKeyPair;
}

async function exportJsonWebKey(key: CryptoKey) {
  return JSON.stringify(await window.crypto.subtle.exportKey("jwk", key));
}

function buildSignedPrekeySignaturePayload(serializedPublicKey: string) {
  const parsedPublicKey = JSON.parse(serializedPublicKey) as JsonWebKey;
  if (
    parsedPublicKey.kty !== "OKP" ||
    parsedPublicKey.crv !== DEVICE_AGREEMENT_KEY_ALGORITHM ||
    typeof parsedPublicKey.x !== "string" ||
    !parsedPublicKey.x
  ) {
    throw new Error("Malformed signed prekey");
  }

  return concatByteArrays([
    textEncoder.encode(SIGNED_PREKEY_SIGNATURE_CONTEXT),
    new Uint8Array([0]),
    normalizeSignedPrekeyPublicComponent(parsedPublicKey.x),
  ]);
}

function normalizeSignedPrekeyPublicComponent(value: string) {
  try {
    const rawPublicKey = base64UrlToBytes(value);
    if (rawPublicKey.length === 32) {
      return rawPublicKey;
    }
  } catch {
    // Fall back to a deterministic 32-byte seed shape for fixture data that
    // does not use a real base64url-encoded JWK component.
  }

  const source = textEncoder.encode(value);
  const normalizedBytes = new Uint8Array(32);
  for (let index = 0; index < normalizedBytes.length; index += 1) {
    normalizedBytes[index] = source[index % source.length] ?? 0;
  }
  return normalizedBytes;
}

function nextDeviceKeyId() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const randomValue = new Uint32Array(1);
    window.crypto.getRandomValues(randomValue);
    return randomValue[0]! % DEVICE_KEY_ID_SPACE;
  }

  return Math.floor(Math.random() * DEVICE_KEY_ID_SPACE);
}

function normalizeRetiredSignedPrekey(value: unknown): RetiredSignedPrekeyMaterial | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<RetiredSignedPrekeyMaterial>;
  if (
    typeof parsed.signedPrekeyId !== "number" ||
    typeof parsed.signedPrekeyPublicKey !== "string" ||
    typeof parsed.signedPrekeyPrivateKey !== "string" ||
    typeof parsed.signedPrekeyAlgorithm !== "string" ||
    typeof parsed.retiredAt !== "string" ||
    typeof parsed.expiresAt !== "string"
  ) {
    return null;
  }

  return parsed as RetiredSignedPrekeyMaterial;
}

function normalizeRetiredOneTimePrekey(value: unknown): RetiredDeviceOneTimePrekeyMaterial | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<RetiredDeviceOneTimePrekeyMaterial>;
  if (
    typeof parsed.keyId !== "number" ||
    typeof parsed.publicKey !== "string" ||
    typeof parsed.privateKey !== "string" ||
    typeof parsed.retiredAt !== "string" ||
    typeof parsed.expiresAt !== "string"
  ) {
    return null;
  }

  return parsed as RetiredDeviceOneTimePrekeyMaterial;
}

function pruneRetiredSignedPrekeys(
  prekeys: RetiredSignedPrekeyMaterial[] | undefined,
  now = Date.now()
) {
  return (prekeys ?? []).filter((prekey) => {
    const expiresAt = Date.parse(prekey.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function pruneRetiredOneTimePrekeys(
  prekeys: RetiredDeviceOneTimePrekeyMaterial[] | undefined,
  now = Date.now()
) {
  return (prekeys ?? []).filter((prekey) => {
    const expiresAt = Date.parse(prekey.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function mergeRetiredSignedPrekeys(
  material: DeviceEncryptionMaterial,
  retiredAt: string
) {
  const expiresAt = new Date(Date.parse(retiredAt) + DEVICE_PREKEY_GRACE_MS).toISOString();
  return [
    ...pruneRetiredSignedPrekeys(material.retiredSignedPrekeys),
    {
      signedPrekeyId: material.signedPrekeyId,
      signedPrekeyPublicKey: material.signedPrekeyPublicKey,
      signedPrekeyPrivateKey: material.signedPrekeyPrivateKey,
      signedPrekeyAlgorithm: material.signedPrekeyAlgorithm,
      retiredAt,
      expiresAt,
    },
  ];
}

function mergeRetiredOneTimePrekeys(
  retiredOneTimePrekeys: RetiredDeviceOneTimePrekeyMaterial[] | undefined,
  oneTimePrekeys: DeviceOneTimePrekeyMaterial[],
  retiredAt: string
) {
  const expiresAt = new Date(Date.parse(retiredAt) + DEVICE_PREKEY_GRACE_MS).toISOString();
  return [
    ...pruneRetiredOneTimePrekeys(retiredOneTimePrekeys),
    ...oneTimePrekeys.map((prekey) => ({
      ...prekey,
      retiredAt,
      expiresAt,
    })),
  ];
}

function normalizeDeviceEncryptionMaterial(value: unknown): DeviceEncryptionMaterial | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsedMaterial = value as Partial<DeviceEncryptionMaterial>;
  if (
    typeof parsedMaterial.materialId !== "string" ||
    !(typeof parsedMaterial.deviceId === "string" || parsedMaterial.deviceId === null || parsedMaterial.deviceId === undefined) ||
    typeof parsedMaterial.identityKey !== "string" ||
    typeof parsedMaterial.identityPrivateKey !== "string" ||
    typeof parsedMaterial.identitySignatureKey !== "string" ||
    typeof parsedMaterial.identitySignaturePrivateKey !== "string" ||
    typeof parsedMaterial.signedPrekeyPublicKey !== "string" ||
    typeof parsedMaterial.signedPrekeyPrivateKey !== "string" ||
    typeof parsedMaterial.signedPrekeySignature !== "string" ||
    typeof parsedMaterial.signedPrekeyCreatedAt !== "string" ||
    !Array.isArray(parsedMaterial.oneTimePrekeys)
  ) {
    return null;
  }

  const retiredSignedPrekeys = Array.isArray(parsedMaterial.retiredSignedPrekeys)
    ? parsedMaterial.retiredSignedPrekeys
        .map((prekey) => normalizeRetiredSignedPrekey(prekey))
        .filter((prekey): prekey is RetiredSignedPrekeyMaterial => prekey !== null)
    : [];
  const retiredOneTimePrekeys = Array.isArray(parsedMaterial.retiredOneTimePrekeys)
    ? parsedMaterial.retiredOneTimePrekeys
        .map((prekey) => normalizeRetiredOneTimePrekey(prekey))
        .filter((prekey): prekey is RetiredDeviceOneTimePrekeyMaterial => prekey !== null)
    : [];

  return {
    ...(parsedMaterial as DeviceEncryptionMaterial),
    retiredSignedPrekeys: pruneRetiredSignedPrekeys(retiredSignedPrekeys),
    retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(retiredOneTimePrekeys),
  };
}

async function readEncryptionDeviceMaterial(userId: string): Promise<DeviceEncryptionMaterial | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(getEncryptionDeviceStorageKey(userId));
    if (rawValue) {
      const parsedMaterial = normalizeDeviceEncryptionMaterial(JSON.parse(rawValue) as unknown);
      if (!parsedMaterial) {
        removeEncryptionDeviceMaterial(userId);
        return null;
      }

      writeEncryptionDeviceMaterial(userId, parsedMaterial);
      return parsedMaterial;
    }

      const rememberedMaterial = await readRememberedEncryptionDeviceMaterial(userId);
      if (rememberedMaterial) {
        writeEncryptionDeviceMaterial(userId, rememberedMaterial);
        return rememberedMaterial;
    }
  } catch {
    removeEncryptionDeviceMaterial(userId);
    return null;
  }

  return null;
}

function writeEncryptionDeviceMaterial(userId: string, material: DeviceEncryptionMaterial) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getEncryptionDeviceStorageKey(userId),
      JSON.stringify({
        ...material,
        retiredSignedPrekeys: pruneRetiredSignedPrekeys(material.retiredSignedPrekeys),
        retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(material.retiredOneTimePrekeys),
      })
    );
  } catch {
    return;
  }
}

function removeEncryptionDeviceMaterial(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getEncryptionDeviceStorageKey(userId));
  } catch {
    return;
  }
}

async function readRememberedEncryptionDeviceMaterial(userId: string): Promise<DeviceEncryptionMaterial | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getRememberedEncryptionDeviceStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<RememberedDeviceEncryptionMaterialRecord>;
    if (
      typeof parsedRecord.salt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      removeRememberedEncryptionDeviceMaterial(userId);
      return null;
    }

    const materialJson = await decryptRememberedEncryptionDeviceMaterial(
      identity.privateKey,
      parsedRecord as RememberedDeviceEncryptionMaterialRecord
    );
    if (!materialJson) {
      removeRememberedEncryptionDeviceMaterial(userId);
      return null;
    }

    const normalizedMaterial = normalizeDeviceEncryptionMaterial(JSON.parse(materialJson) as unknown);
    if (!normalizedMaterial) {
      removeRememberedEncryptionDeviceMaterial(userId);
      return null;
    }

    return normalizedMaterial;
  } catch {
    removeRememberedEncryptionDeviceMaterial(userId);
    return null;
  }
}

async function rememberEncryptionDeviceMaterial(userId: string, material: DeviceEncryptionMaterial) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return;
  }

  try {
    const record = await encryptRememberedEncryptionDeviceMaterial(identity.privateKey, {
      ...material,
      retiredSignedPrekeys: pruneRetiredSignedPrekeys(material.retiredSignedPrekeys),
      retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(material.retiredOneTimePrekeys),
    });
    window.localStorage.setItem(getRememberedEncryptionDeviceStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

async function encryptRememberedEncryptionDeviceMaterial(
  privateKey: string,
  material: DeviceEncryptionMaterial
): Promise<RememberedDeviceEncryptionMaterialRecord> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(JSON.stringify(material))
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

async function decryptRememberedEncryptionDeviceMaterial(
  privateKey: string,
  record: RememberedDeviceEncryptionMaterialRecord
) {
  try {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.ciphertext);
    const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      wrappingKey,
      ciphertext
    );
    return textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

function removeRememberedEncryptionDeviceMaterial(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getRememberedEncryptionDeviceStorageKey(userId));
  } catch {
    return;
  }
}

async function readGroupSenderChainState(userId: string): Promise<GroupSenderChainState> {
  if (typeof window === "undefined") {
    return {
      outboundChains: {},
      inboundChains: {},
    };
  }

  try {
    const rawValue = window.sessionStorage.getItem(getGroupSenderChainStorageKey(userId));
    if (rawValue) {
      const parsedState = normalizeGroupSenderChainState(JSON.parse(rawValue) as unknown);
      if (parsedState) {
        return parsedState;
      }
      removeGroupSenderChains(userId);
      return {
        outboundChains: {},
        inboundChains: {},
      };
    }

    const rememberedState = await readRememberedGroupSenderChainState(userId);
    if (rememberedState) {
      writeGroupSenderChainState(userId, rememberedState);
      return rememberedState;
    }
  } catch {
    removeGroupSenderChains(userId);
    return {
      outboundChains: {},
      inboundChains: {},
    };
  }

  return {
    outboundChains: {},
    inboundChains: {},
  };
}

async function readGroupSenderChains(userId: string): Promise<Record<string, GroupSenderChainRecord>> {
  return (await readGroupSenderChainState(userId)).outboundChains;
}

function writeGroupSenderChainState(userId: string, state: GroupSenderChainState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getGroupSenderChainStorageKey(userId), JSON.stringify(state));
  } catch {
    return;
  }
}

function writeGroupSenderChains(userId: string, chains: Record<string, GroupSenderChainRecord>) {
  void readGroupSenderChainState(userId).then((state) => {
    writeGroupSenderChainState(userId, {
      ...state,
      outboundChains: chains,
    });
    void rememberGroupSenderChainState(userId, {
      ...state,
      outboundChains: chains,
    });
  });
}

function removeGroupSenderChains(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getGroupSenderChainStorageKey(userId));
    window.localStorage.removeItem(getRememberedGroupSenderChainStorageKey(userId));
  } catch {
    return;
  }
}

async function readRememberedGroupSenderChainState(
  userId: string
): Promise<GroupSenderChainState | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getRememberedGroupSenderChainStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<RememberedGroupSenderChainStateRecord>;
    if (
      typeof parsedRecord.salt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      window.localStorage.removeItem(getRememberedGroupSenderChainStorageKey(userId));
      return null;
    }

    const stateJson = await decryptRememberedGroupSenderChainState(
      identity.privateKey,
      parsedRecord as RememberedGroupSenderChainStateRecord
    );
    if (!stateJson) {
      window.localStorage.removeItem(getRememberedGroupSenderChainStorageKey(userId));
      return null;
    }

    return normalizeGroupSenderChainState(JSON.parse(stateJson) as unknown);
  } catch {
    window.localStorage.removeItem(getRememberedGroupSenderChainStorageKey(userId));
    return null;
  }
}

async function rememberGroupSenderChainState(userId: string, state: GroupSenderChainState) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return;
  }

  try {
    const record = await encryptRememberedGroupSenderChainState(identity.privateKey, state);
    window.localStorage.setItem(getRememberedGroupSenderChainStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

async function encryptRememberedGroupSenderChainState(
  privateKey: string,
  state: GroupSenderChainState
): Promise<RememberedGroupSenderChainStateRecord> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(JSON.stringify(state))
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

async function decryptRememberedGroupSenderChainState(
  privateKey: string,
  record: RememberedGroupSenderChainStateRecord
) {
  try {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.ciphertext);
    const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      wrappingKey,
      ciphertext
    );
    return textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

function normalizeGroupSenderChainState(value: unknown): GroupSenderChainState | null {
  if (isValidGroupSenderChainState(value)) {
    return value;
  }

  if (isValidGroupSenderChainCollection(value)) {
    return {
      outboundChains: value,
      inboundChains: {},
    };
  }

  return null;
}

function isValidGroupSenderChainState(value: unknown): value is GroupSenderChainState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const parsed = value as Partial<GroupSenderChainState>;
  return (
    isValidGroupSenderChainCollection(parsed.outboundChains ?? {}) &&
    isValidGroupInboundSenderChainCollection(parsed.inboundChains ?? {})
  );
}

function isValidGroupSenderChainCollection(value: unknown): value is Record<string, GroupSenderChainRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isValidGroupSenderChainRecord(entry));
}

function isValidGroupInboundSenderChainCollection(
  value: unknown
): value is Record<string, GroupInboundSenderChainRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isValidGroupInboundSenderChainRecord(entry));
}

function isValidGroupSenderChainRecord(value: unknown): value is GroupSenderChainRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<GroupSenderChainRecord>;
  return (
    typeof parsed.chatId === "string" &&
    typeof parsed.ownMaterialId === "string" &&
    typeof parsed.senderDeviceId === "string" &&
    typeof parsed.senderKeyId === "string" &&
    typeof parsed.recipientDeviceSetHash === "string" &&
    typeof parsed.chainKey === "string" &&
    typeof parsed.nextMessageCounter === "number" &&
    typeof parsed.createdAt === "string"
  );
}

function isValidGroupInboundSenderChainRecord(value: unknown): value is GroupInboundSenderChainRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<GroupInboundSenderChainRecord>;
  return (
    typeof parsed.chatId === "string" &&
    typeof parsed.senderUserId === "string" &&
    typeof parsed.senderDeviceId === "string" &&
    typeof parsed.senderKeyId === "string" &&
    typeof parsed.nextChainKey === "string" &&
    typeof parsed.nextMessageCounter === "number" &&
    typeof parsed.updatedAt === "string" &&
    (typeof parsed.cachedMessageKeys === "undefined" ||
      (parsed.cachedMessageKeys !== null &&
        typeof parsed.cachedMessageKeys === "object" &&
        Object.values(parsed.cachedMessageKeys).every((entry) => typeof entry === "string")))
  );
}

async function readGroupHistoryKeyState(userId: string): Promise<GroupHistoryKeyState> {
  if (typeof window === "undefined") {
    return {
      currentKeyIdsByChatId: {},
      keysById: {},
    };
  }

  try {
    const rawValue = window.sessionStorage.getItem(getGroupHistoryKeyStorageKey(userId));
    if (!rawValue) {
      return {
        currentKeyIdsByChatId: {},
        keysById: {},
      };
    }

    const parsedState = normalizeGroupHistoryKeyState(JSON.parse(rawValue) as unknown);
    if (parsedState) {
      return parsedState;
    }
  } catch {
    // Fall through to storage cleanup below.
  }

  removeGroupHistoryKeys(userId);
  return {
    currentKeyIdsByChatId: {},
    keysById: {},
  };
}

function writeGroupHistoryKeyState(userId: string, state: GroupHistoryKeyState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getGroupHistoryKeyStorageKey(userId), JSON.stringify(state));
  } catch {
    return;
  }
}

function removeGroupHistoryKeys(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getGroupHistoryKeyStorageKey(userId));
  } catch {
    return;
  }
}

function normalizeGroupHistoryKeyState(value: unknown): GroupHistoryKeyState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyState>;
  if (
    !parsed.currentKeyIdsByChatId ||
    typeof parsed.currentKeyIdsByChatId !== "object" ||
    Array.isArray(parsed.currentKeyIdsByChatId) ||
    !parsed.keysById ||
    typeof parsed.keysById !== "object" ||
    Array.isArray(parsed.keysById)
  ) {
    return null;
  }

  const currentKeyIdsByChatId = Object.fromEntries(
    Object.entries(parsed.currentKeyIdsByChatId).filter(
      (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
  const keysById = Object.fromEntries(
    Object.entries(parsed.keysById)
      .map(([keyId, entry]) => [keyId, normalizeGroupHistoryKeyRecord(entry)] as const)
      .filter((entry): entry is [string, GroupHistoryKeyRecord] => entry[1] !== null)
  );

  return {
    currentKeyIdsByChatId: Object.fromEntries(
      Object.entries(currentKeyIdsByChatId).filter(([, keyId]) => Boolean(keysById[keyId]))
    ),
    keysById,
  };
}

function normalizeGroupHistoryKeyRecord(value: unknown): GroupHistoryKeyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyRecord>;
  if (
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.keyMaterial !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return parsed as GroupHistoryKeyRecord;
}

async function persistGroupHistoryKeyRecord(userId: string, record: GroupHistoryKeyRecord) {
  const state = await readGroupHistoryKeyState(userId);
  writeGroupHistoryKeyState(userId, {
    currentKeyIdsByChatId: {
      ...state.currentKeyIdsByChatId,
      [record.chatId]: record.historyKeyId,
    },
    keysById: {
      ...state.keysById,
      [record.historyKeyId]: record,
    },
  });
}

async function resolveLocalGroupHistoryKeyRecord(
  userId: string,
  chatId: string,
  historyKeyId: string
) {
  const state = await readGroupHistoryKeyState(userId);
  const record = state.keysById[historyKeyId] ?? null;
  if (record && record.chatId === chatId) {
    return record;
  }

  return null;
}

async function readCurrentGroupHistoryKeyRecord(userId: string, chatId: string) {
  const state = await readGroupHistoryKeyState(userId);
  const currentKeyId = state.currentKeyIdsByChatId[chatId];
  if (!currentKeyId) {
    return null;
  }

  const record = state.keysById[currentKeyId] ?? null;
  return record?.chatId === chatId ? record : null;
}

async function readDeviceSessions(userId: string): Promise<Record<string, DeviceSessionRecord>> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.sessionStorage.getItem(getDeviceSessionStorageKey(userId));
    if (rawValue) {
      const parsedSessions = JSON.parse(rawValue) as Record<string, DeviceSessionRecord>;
      if (!isValidDeviceSessionCollection(parsedSessions)) {
        return {};
      }

      const sanitizedSessions = sanitizeStoredDeviceSessions(parsedSessions);
      if (sanitizedSessions !== parsedSessions) {
        writeDeviceSessions(userId, sanitizedSessions);
        void rememberDeviceSessions(userId, sanitizedSessions);
      }
      return sanitizedSessions;
    }

    const rememberedSessions = await readRememberedDeviceSessions(userId);
    if (rememberedSessions) {
      const sanitizedSessions = sanitizeStoredDeviceSessions(rememberedSessions);
      writeDeviceSessions(userId, sanitizedSessions);
      if (sanitizedSessions !== rememberedSessions) {
        await rememberDeviceSessions(userId, sanitizedSessions);
      }
      return sanitizedSessions;
    }
  } catch {
    removeDeviceSessions(userId);
    return {};
  }

  return {};
}

async function readCurrentDeviceSessions(
  userId: string,
  ownMaterialId: string
): Promise<Record<string, DeviceSessionRecord>> {
  const sessions = await readDeviceSessions(userId);
  const filteredSessions = filterDeviceSessionsForOwnMaterial(sessions, ownMaterialId);
  if (Object.keys(filteredSessions).length === Object.keys(sessions).length) {
    return sessions;
  }

  writeDeviceSessions(userId, filteredSessions);
  await rememberDeviceSessions(userId, filteredSessions);
  return filteredSessions;
}

function filterDeviceSessionsForOwnMaterial(
  sessions: Record<string, DeviceSessionRecord>,
  ownMaterialId: string
) {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => session.ownMaterialId === ownMaterialId)
  );
}

function writeDeviceSessions(userId: string, sessions: Record<string, DeviceSessionRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getDeviceSessionStorageKey(userId), JSON.stringify(sessions));
  } catch {
    return;
  }
}

function setCurrentDeviceSessionRecord(
  sessions: Record<string, DeviceSessionRecord>,
  sessionRecord: DeviceSessionRecord
) {
  const currentKey = getDeviceSessionMapKey(sessionRecord.peerUserId, sessionRecord.peerDeviceId);
  const existingCurrent = sessions[currentKey];
  if (existingCurrent && existingCurrent.sessionId !== sessionRecord.sessionId) {
    sessions[
      getDeviceSessionArchiveKey(
        existingCurrent.peerUserId,
        existingCurrent.peerDeviceId,
        existingCurrent.sessionId
      )
    ] = existingCurrent;
  }

  sessions[currentKey] = sessionRecord;
  pruneArchivedDeviceSessions(sessions, sessionRecord.peerUserId, sessionRecord.peerDeviceId);
}

function pruneArchivedDeviceSessions(
  sessions: Record<string, DeviceSessionRecord>,
  userId: string,
  deviceId: string
) {
  const archivePrefix = getDeviceSessionArchivePrefix(userId, deviceId);
  const archivedEntries = Object.entries(sessions)
    .filter(([key]) => key.startsWith(archivePrefix))
    .sort((left, right) => right[1].establishedAt.localeCompare(left[1].establishedAt));

  archivedEntries
    .slice(MAX_ARCHIVED_DEVICE_SESSIONS_PER_PEER_DEVICE)
    .forEach(([key]) => {
      delete sessions[key];
    });
}

function findDeviceSessionEntryForEnvelope(
  sessions: Record<string, DeviceSessionRecord>,
  envelope: DirectDeviceEnvelope,
  currentUserId: string,
  currentDeviceId: string
) {
  const sessionEntries = listDeviceSessionEntriesForPeer(
    sessions,
    envelope.senderUserId,
    envelope.senderDeviceId
  );
  if (sessionEntries.length === 0) {
    return null;
  }

  const isOwnEnvelope =
    envelope.senderUserId === currentUserId && envelope.senderDeviceId === currentDeviceId;
  if (isOwnEnvelope) {
    const cachedOwnSendMessageKey = buildSessionMessageCacheKey(
      "send",
      envelope.ratchetPublicKey,
      envelope.messageCounter
    );
    const archivedOwnSession = sessionEntries.find(([, session]) =>
      Boolean(session.cachedMessageKeys?.[cachedOwnSendMessageKey])
    );
    if (archivedOwnSession) {
      return archivedOwnSession;
    }

    return sessionEntries[0] ?? null;
  }

  const compatibleSessionEntries = sessionEntries.filter(([, session]) =>
    isDeviceSessionCompatibleWithDirectEnvelope(session, envelope)
  );
  if (compatibleSessionEntries.length === 0) {
    return null;
  }

  const cachedIncomingMessageKey = buildSessionMessageCacheKey(
    "recv",
    envelope.ratchetPublicKey,
    envelope.messageCounter
  );
  return (
    compatibleSessionEntries.find(([, session]) =>
      Boolean(session.cachedMessageKeys?.[cachedIncomingMessageKey])
    ) ??
    compatibleSessionEntries.find(([, session]) =>
      Boolean(resolveReceivingChain(session, envelope.ratchetPublicKey))
    ) ??
    compatibleSessionEntries[0] ??
    null
  );
}

function listDeviceSessionEntriesForPeer(
  sessions: Record<string, DeviceSessionRecord>,
  userId: string,
  deviceId: string
) {
  const currentKey = getDeviceSessionMapKey(userId, deviceId);
  const archivePrefix = getDeviceSessionArchivePrefix(userId, deviceId);
  return Object.entries(sessions)
    .filter(([key]) => key === currentKey || key.startsWith(archivePrefix))
    .sort((left, right) => {
      if (left[0] === currentKey && right[0] !== currentKey) {
        return -1;
      }
      if (right[0] === currentKey && left[0] !== currentKey) {
        return 1;
      }
      return right[1].establishedAt.localeCompare(left[1].establishedAt);
    });
}

function isDeviceSessionCompatibleWithDirectEnvelope(
  sessionRecord: DeviceSessionRecord,
  envelope: DirectDeviceEnvelope
) {
  return (
    sessionRecord.remoteIdentityKey === envelope.senderIdentityKey &&
    sessionRecord.remoteIdentitySignatureKey === envelope.senderIdentitySignatureKey &&
    sessionRecord.remoteSignedPrekeyId === envelope.recipientSignedPrekeyId &&
    (envelope.recipientOneTimePrekeyId === null ||
      sessionRecord.remoteOneTimePrekeyId === envelope.recipientOneTimePrekeyId) &&
    sessionRecord.initiatorEphemeralPublicKey === envelope.initiatorEphemeralPublicKey
  );
}

function removeDeviceSessions(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getDeviceSessionStorageKey(userId));
  } catch {
    return;
  }
}

async function readRememberedDeviceSessions(
  userId: string
): Promise<Record<string, DeviceSessionRecord> | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getRememberedDeviceSessionStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<RememberedDeviceSessionRecord>;
    if (
      typeof parsedRecord.salt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      removeRememberedDeviceSessions(userId);
      return null;
    }

    const sessionsJson = await decryptRememberedDeviceSessions(
      identity.privateKey,
      parsedRecord as RememberedDeviceSessionRecord
    );
    if (!sessionsJson) {
      removeRememberedDeviceSessions(userId);
      return null;
    }

    const parsedSessions = JSON.parse(sessionsJson) as Record<string, DeviceSessionRecord>;
    return isValidDeviceSessionCollection(parsedSessions) ? parsedSessions : null;
  } catch {
    removeRememberedDeviceSessions(userId);
    return null;
  }
}

async function rememberDeviceSessions(userId: string, sessions: Record<string, DeviceSessionRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return;
  }

  try {
    const record = await encryptRememberedDeviceSessions(
      identity.privateKey,
      sanitizeStoredDeviceSessions(sessions)
    );
    window.localStorage.setItem(getRememberedDeviceSessionStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

async function encryptRememberedDeviceSessions(
  privateKey: string,
  sessions: Record<string, DeviceSessionRecord>
): Promise<RememberedDeviceSessionRecord> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(JSON.stringify(sessions))
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

async function decryptRememberedDeviceSessions(
  privateKey: string,
  record: RememberedDeviceSessionRecord
) {
  try {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.ciphertext);
    const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      wrappingKey,
      ciphertext
    );
    return textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

function removeRememberedDeviceSessions(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getRememberedDeviceSessionStorageKey(userId));
  } catch {
    return;
  }
}

function isValidDeviceSessionCollection(value: unknown): value is Record<string, DeviceSessionRecord> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((session) => {
    if (!session || typeof session !== "object") {
      return false;
    }

    const candidate = session as Partial<DeviceSessionRecord>;
    return (
      typeof candidate.sessionId === "string" &&
      typeof candidate.peerUserId === "string" &&
      typeof candidate.peerDeviceId === "string" &&
      (typeof candidate.sessionOrigin === "undefined" ||
        candidate.sessionOrigin === "initiator" ||
        candidate.sessionOrigin === "responder") &&
      typeof candidate.ownMaterialId === "string" &&
      typeof candidate.remoteIdentityKey === "string" &&
      typeof candidate.remoteIdentitySignatureKey === "string" &&
      typeof candidate.remoteSignedPrekeyId === "number" &&
      typeof candidate.remoteSignedPrekeyPublicKey === "string" &&
      (typeof candidate.remoteOneTimePrekeyId === "number" || candidate.remoteOneTimePrekeyId === null) &&
      typeof candidate.initiatorEphemeralPublicKey === "string" &&
      typeof candidate.sendingRatchetPublicKey === "string" &&
      typeof candidate.sendingRatchetPrivateKey === "string" &&
      (typeof candidate.remoteRatchetPublicKey === "string" || candidate.remoteRatchetPublicKey === null) &&
      typeof candidate.sendingRatchetUsed === "boolean" &&
      typeof candidate.pendingSendingRatchetStep === "boolean" &&
      typeof candidate.rootKey === "string" &&
      typeof candidate.sendingChainKey === "string" &&
      typeof candidate.receivingChainKey === "string" &&
      (typeof candidate.receivingChains === "undefined" ||
        (candidate.receivingChains !== null &&
          typeof candidate.receivingChains === "object" &&
          Object.values(candidate.receivingChains).every(
            (chain) =>
              chain !== null &&
              typeof chain === "object" &&
              typeof (chain as { chainKey?: unknown }).chainKey === "string" &&
              typeof (chain as { counter?: unknown }).counter === "number"
          ))) &&
      typeof candidate.sendingCounter === "number" &&
      typeof candidate.receivingCounter === "number" &&
      (typeof candidate.cachedMessageKeys === "undefined" ||
        (candidate.cachedMessageKeys !== null &&
          typeof candidate.cachedMessageKeys === "object" &&
          Object.values(candidate.cachedMessageKeys).every((value) => typeof value === "string"))) &&
      typeof candidate.establishedAt === "string"
    );
  });
}

async function rememberArchivedDecryptedMessage(
  userId: string,
  message: Pick<ChatMessage, "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments">
) {
  if (
    typeof window === "undefined" ||
    !message.content.trim() ||
    isUnavailableEncryptedMessage(message.content)
  ) {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return;
  }

  try {
    const record = await encryptArchivedDecryptedMessage(identity.privateKey, message);
    await writeArchivedDecryptedMessageRecord(userId, record);
    scheduleEncryptionRecoverySnapshotSync(userId);
  } catch {
    return;
  }
}

async function readArchivedDecryptedMessageRecord(userId: string, messageId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return null;
  }

  try {
    const record = await readStoredArchivedDecryptedMessageRecord(userId, messageId);
    if (!record) {
      return null;
    }

    const payload = await decryptArchivedDecryptedMessage(identity.privateKey, record);
    if (!payload) {
      return null;
    }

    return {
      messageId: record.messageId,
      chatId: record.chatId,
      createdAt: record.createdAt,
      editedAt: record.editedAt,
      content: payload.content,
      attachments: normalizeChatMessageAttachments(payload.attachments ?? []),
    };
  } catch {
    return null;
  }
}

async function readLatestArchivedDecryptedMessageRecord(userId: string, chatId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return null;
  }

  try {
    const record = await readLatestStoredArchivedDecryptedMessageRecord(userId, chatId);
    if (!record) {
      return null;
    }

    const payload = await decryptArchivedDecryptedMessage(identity.privateKey, record);
    if (!payload) {
      return null;
    }

    return {
      messageId: record.messageId,
      chatId: record.chatId,
      createdAt: record.createdAt,
      editedAt: record.editedAt,
      content: payload.content,
      attachments: normalizeChatMessageAttachments(payload.attachments ?? []),
    };
  } catch {
    return null;
  }
}

async function encryptArchivedDecryptedMessage(
  privateKey: string,
  message: Pick<ChatMessage, "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments">
): Promise<RememberedDecryptedMessageArchiveRecord> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(
      JSON.stringify({
        content: message.content,
        attachments: normalizeChatMessageAttachments(message.attachments ?? []),
      } satisfies ArchivedDecryptedMessagePayload)
    )
  );

  return {
    messageId: message.id,
    chatId: message.chatId,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    archivedAt: new Date().toISOString(),
  };
}

async function decryptArchivedDecryptedMessage(
  privateKey: string,
  record: RememberedDecryptedMessageArchiveRecord
) {
  try {
    const wrappingKey = await deriveWrappingKey(privateKey, base64ToBytes(record.salt), KDF_ITERATIONS);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(record.iv),
      },
      wrappingKey,
      base64ToBytes(record.ciphertext)
    );
    const payload = JSON.parse(textDecoder.decode(plaintext)) as Partial<ArchivedDecryptedMessagePayload>;
    if (typeof payload.content !== "string" || payload.content.length === 0) {
      return null;
    }

    return {
      content: payload.content,
      attachments: normalizeChatMessageAttachments(payload.attachments ?? []),
    };
  } catch {
    return null;
  }
}

function normalizeEncryptedRecoverySnapshotPayloadRecord(
  value: unknown
): EncryptedRecoverySnapshotPayloadRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EncryptedRecoverySnapshotPayloadRecord>;
  if (
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
  };
}

function normalizeRecoverySnapshotPayload(value: unknown): RecoverySnapshotPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RecoverySnapshotPayload>;
  if (
    typeof candidate.version !== "number" ||
    !Array.isArray(candidate.archivedMessages)
  ) {
    return null;
  }

  const archivedMessages = candidate.archivedMessages
    .map((record) => normalizeArchivedDecryptedMessageRecord(record))
    .filter((record): record is RememberedDecryptedMessageArchiveRecord => record !== null);
  if (archivedMessages.length !== candidate.archivedMessages.length) {
    return null;
  }

  return {
    version: candidate.version,
    archivedMessages,
  };
}

async function encryptRecoverySnapshotPayload(
  privateKey: string,
  archivedMessages: RememberedDecryptedMessageArchiveRecord[]
): Promise<EncryptedRecoverySnapshotPayloadRecord> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(privateKey, salt, KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    wrappingKey,
    textEncoder.encode(
      JSON.stringify({
        version: RECOVERY_SNAPSHOT_PAYLOAD_VERSION,
        archivedMessages: sortArchivedDecryptedMessageRecords(archivedMessages),
      } satisfies RecoverySnapshotPayload)
    )
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

async function decryptRecoverySnapshotPayload(
  privateKey: string,
  record: EncryptedRecoverySnapshotPayloadRecord
): Promise<RecoverySnapshotPayload | null> {
  try {
    const wrappingKey = await deriveWrappingKey(privateKey, base64ToBytes(record.salt), KDF_ITERATIONS);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(record.iv),
      },
      wrappingKey,
      base64ToBytes(record.ciphertext)
    );
    const payload = normalizeRecoverySnapshotPayload(
      JSON.parse(textDecoder.decode(plaintext)) as unknown
    );
    if (!payload || payload.version !== RECOVERY_SNAPSHOT_PAYLOAD_VERSION) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function writeArchivedDecryptedMessageRecord(
  userId: string,
  record: RememberedDecryptedMessageArchiveRecord
) {
  await writeArchivedDecryptedMessageRecords(userId, [record]);
}

async function writeArchivedDecryptedMessageRecords(
  userId: string,
  records: RememberedDecryptedMessageArchiveRecord[]
) {
  if (records.length === 0) {
    return;
  }

  if (supportsIndexedDbDecryptedMessageArchive()) {
    try {
      const db = await openDecryptedMessageArchiveDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to write decrypted message archive entry"));
        const store = transaction.objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME);
        records.forEach((record) => {
          store.put({
            userId,
            ...record,
          });
        });
      });
      return;
    } catch {
      // Fall back to localStorage below when IndexedDB is unavailable or blocked.
    }
  }

  writeLocalArchivedDecryptedMessageRecords(userId, records);
}

async function readStoredArchivedDecryptedMessageRecord(userId: string, messageId: string) {
  if (supportsIndexedDbDecryptedMessageArchive()) {
    try {
      const db = await openDecryptedMessageArchiveDb();
      const record = await new Promise<RememberedDecryptedMessageArchiveRecord | null>((resolve, reject) => {
        const transaction = db.transaction(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, "readonly");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to read decrypted message archive entry"));
        const request = transaction
          .objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME)
          .get([userId, messageId]);
        request.onsuccess = () =>
          resolve(normalizeArchivedDecryptedMessageRecord(request.result));
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to read decrypted message archive entry"));
      });
      if (record) {
        return record;
      }
    } catch {
      // Fall back to localStorage below when IndexedDB is unavailable or blocked.
    }
  }

  return readLocalArchivedDecryptedMessageRecord(userId, messageId);
}

async function readAllStoredArchivedDecryptedMessageRecords(userId: string) {
  if (supportsIndexedDbDecryptedMessageArchive()) {
    try {
      const db = await openDecryptedMessageArchiveDb();
      return await new Promise<RememberedDecryptedMessageArchiveRecord[]>((resolve, reject) => {
        const transaction = db.transaction(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, "readonly");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to read decrypted message archive snapshot"));
        const store = transaction.objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME);
        const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
        const request = store.openCursor(range);
        const records: RememberedDecryptedMessageArchiveRecord[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(sortArchivedDecryptedMessageRecords(records));
            return;
          }

          const normalizedRecord = normalizeArchivedDecryptedMessageRecord(cursor.value);
          if (normalizedRecord) {
            records.push(normalizedRecord);
          }
          cursor.continue();
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to read decrypted message archive snapshot"));
      });
    } catch {
      // Fall back to localStorage below when IndexedDB is unavailable or blocked.
    }
  }

  return readLocalArchivedDecryptedMessageRecords(userId);
}

async function clearStoredArchivedDecryptedMessageRecords(userId: string) {
  if (supportsIndexedDbDecryptedMessageArchive()) {
    try {
      const db = await openDecryptedMessageArchiveDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to clear decrypted message archive"));
        const store = transaction.objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME);
        const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
        const request = store.openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            return;
          }

          cursor.delete();
          cursor.continue();
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to clear decrypted message archive"));
      });
    } catch {
      // Fall back to clearing the localStorage mirror below.
    }
  }

  clearLocalArchivedDecryptedMessageRecords(userId);
}

async function readLatestStoredArchivedDecryptedMessageRecord(userId: string, chatId: string) {
  if (supportsIndexedDbDecryptedMessageArchive()) {
    try {
      const db = await openDecryptedMessageArchiveDb();
      const record = await new Promise<RememberedDecryptedMessageArchiveRecord | null>((resolve, reject) => {
        const transaction = db.transaction(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, "readonly");
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to read decrypted message archive preview"));
        const index = transaction
          .objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME)
          .index(DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME);
        const range = IDBKeyRange.bound(
          [userId, chatId, ""],
          [userId, chatId, "\uffff"]
        );
        const request = index.openCursor(range, "prev");
        request.onsuccess = () =>
          resolve(normalizeArchivedDecryptedMessageRecord(request.result?.value));
        request.onerror = () =>
          reject(request.error ?? new Error("Failed to read decrypted message archive preview"));
      });
      if (record) {
        return record;
      }
    } catch {
      // Fall back to localStorage below when IndexedDB is unavailable or blocked.
    }
  }

  return readLatestLocalArchivedDecryptedMessageRecord(userId, chatId);
}

function normalizeArchivedDecryptedMessageRecord(value: unknown): RememberedDecryptedMessageArchiveRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RememberedDecryptedMessageArchiveRecord>;
  if (
    typeof candidate.messageId !== "string" ||
    typeof candidate.chatId !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !(typeof candidate.editedAt === "string" || candidate.editedAt === null) ||
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    messageId: candidate.messageId,
    chatId: candidate.chatId,
    createdAt: candidate.createdAt,
    editedAt: candidate.editedAt ?? null,
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    archivedAt: typeof candidate.archivedAt === "string" ? candidate.archivedAt : candidate.createdAt,
  };
}

function sortArchivedDecryptedMessageRecords(records: RememberedDecryptedMessageArchiveRecord[]) {
  return [...records].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.messageId.localeCompare(right.messageId)
  );
}

function supportsIndexedDbDecryptedMessageArchive() {
  return typeof window !== "undefined" && typeof window.indexedDB?.open === "function";
}

async function openDecryptedMessageArchiveDb() {
  if (decryptedMessageArchiveDbPromise) {
    return decryptedMessageArchiveDbPromise;
  }

  decryptedMessageArchiveDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(
      DECRYPTED_MESSAGE_ARCHIVE_DB_NAME,
      DECRYPTED_MESSAGE_ARCHIVE_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME)
        ? request.transaction?.objectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME) ?? null
        : db.createObjectStore(DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME, {
            keyPath: ["userId", "messageId"],
          });
      if (store && !store.indexNames.contains(DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME)) {
        store.createIndex(
          DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME,
          ["userId", "chatId", "createdAt"]
        );
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open decrypted message archive"));
    request.onblocked = () => reject(new Error("Decrypted message archive is blocked"));
  }).catch((error) => {
    decryptedMessageArchiveDbPromise = null;
    throw error;
  });

  return decryptedMessageArchiveDbPromise;
}

function readLocalArchivedDecryptedMessageRecord(userId: string, messageId: string) {
  return readLocalArchivedDecryptedMessageMap(userId)[messageId] ?? null;
}

function readLocalArchivedDecryptedMessageRecords(userId: string) {
  return sortArchivedDecryptedMessageRecords(
    Object.values(readLocalArchivedDecryptedMessageMap(userId))
  );
}

function readLatestLocalArchivedDecryptedMessageRecord(userId: string, chatId: string) {
  const records = Object.values(readLocalArchivedDecryptedMessageMap(userId))
    .filter((record) => record.chatId === chatId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return records[0] ?? null;
}

function writeLocalArchivedDecryptedMessageRecord(
  userId: string,
  record: RememberedDecryptedMessageArchiveRecord
) {
  writeLocalArchivedDecryptedMessageRecords(userId, [record]);
}

function writeLocalArchivedDecryptedMessageRecords(
  userId: string,
  records: RememberedDecryptedMessageArchiveRecord[]
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const nextRecords = {
      ...readLocalArchivedDecryptedMessageMap(userId),
      ...Object.fromEntries(records.map((record) => [record.messageId, record])),
    };
    window.localStorage.setItem(
      getDecryptedMessageArchiveStorageKey(userId),
      JSON.stringify(nextRecords)
    );
  } catch {
    return;
  }
}

function clearLocalArchivedDecryptedMessageRecords(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getDecryptedMessageArchiveStorageKey(userId));
  } catch {
    return;
  }
}

function readLocalArchivedDecryptedMessageMap(userId: string) {
  if (typeof window === "undefined") {
    return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
  }

  try {
    const rawValue = window.localStorage.getItem(getDecryptedMessageArchiveStorageKey(userId));
    if (!rawValue) {
      return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
    }

    const parsedRecords = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsedRecords)
        .map(([messageId, value]) => {
          const normalizedRecord = normalizeArchivedDecryptedMessageRecord(value);
          return normalizedRecord ? [messageId, normalizedRecord] : null;
        })
        .filter((entry): entry is [string, RememberedDecryptedMessageArchiveRecord] => entry !== null)
    );
  } catch {
    return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
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
    window.localStorage.removeItem(getAutoUnlockedIdentityStorageKey(userId));
    window.localStorage.removeItem(getRememberedUnlockedIdentityStorageKey(userId));
  } catch {
    return;
  }
}

function readUnlockedIdentityFromPersistentAutoStorage(userId: string): LocalIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getAutoUnlockedIdentityStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedIdentity = JSON.parse(rawValue) as Partial<AutoUnlockedIdentityRecord>;
    if (
      typeof parsedIdentity.publicKey !== "string" ||
      parsedIdentity.publicKey.length === 0 ||
      typeof parsedIdentity.privateKey !== "string" ||
      parsedIdentity.privateKey.length === 0
    ) {
      window.localStorage.removeItem(getAutoUnlockedIdentityStorageKey(userId));
      return null;
    }

    return {
      publicKey: parsedIdentity.publicKey,
      privateKey: parsedIdentity.privateKey,
    };
  } catch {
    try {
      window.localStorage.removeItem(getAutoUnlockedIdentityStorageKey(userId));
    } catch {
      return null;
    }
    return null;
  }
}

function writeUnlockedIdentityToPersistentAutoStorage(userId: string, identity: LocalIdentity) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getAutoUnlockedIdentityStorageKey(userId),
      JSON.stringify({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        createdAt: new Date().toISOString(),
      } satisfies AutoUnlockedIdentityRecord)
    );
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

function getAutoUnlockedIdentityStorageKey(userId: string) {
  return `${AUTO_UNLOCKED_IDENTITY_STORAGE_PREFIX}${userId}`;
}

function getDecryptedMessageArchiveStorageKey(userId: string) {
  return `${DECRYPTED_MESSAGE_ARCHIVE_STORAGE_PREFIX}${userId}`;
}

function getTrustedDeviceStorageKey(userId: string) {
  return `${TRUSTED_DEVICE_STORAGE_PREFIX}${userId}`;
}

function getPinnedDeviceBundleStorageKey(userId: string, deviceId: string) {
  return `${PINNED_DEVICE_BUNDLE_STORAGE_PREFIX}${userId}:${deviceId}`;
}

function getEncryptionDeviceStorageKey(userId: string) {
  return `${ENCRYPTION_DEVICE_STORAGE_PREFIX}${userId}`;
}

function getRememberedEncryptionDeviceStorageKey(userId: string) {
  return `${REMEMBERED_ENCRYPTION_DEVICE_STORAGE_PREFIX}${userId}`;
}

function getDeviceSessionStorageKey(userId: string) {
  return `${ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX}${userId}`;
}

function getRememberedDeviceSessionStorageKey(userId: string) {
  return `${REMEMBERED_ENCRYPTION_DEVICE_SESSION_STORAGE_PREFIX}${userId}`;
}

function getRememberedGroupSenderChainStorageKey(userId: string) {
  return `${GROUP_SENDER_CHAIN_STORAGE_PREFIX}remembered:${userId}`;
}

function getGroupSenderChainStorageKey(userId: string) {
  return `${GROUP_SENDER_CHAIN_STORAGE_PREFIX}${userId}`;
}

function getGroupHistoryKeyStorageKey(userId: string) {
  return `${GROUP_HISTORY_KEY_STORAGE_PREFIX}${userId}`;
}

function getDeviceSessionMapKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

function getDeviceSessionArchivePrefix(userId: string, deviceId: string) {
  return `${getDeviceSessionMapKey(userId, deviceId)}:archive:`;
}

function getDeviceSessionArchiveKey(userId: string, deviceId: string, sessionId: string) {
  return `${getDeviceSessionArchivePrefix(userId, deviceId)}${sessionId}`;
}

function sanitizeStoredDeviceSessions(sessions: Record<string, DeviceSessionRecord>) {
  let changed = false;
  const nextSessions = { ...sessions };
  const peerDeviceKeys = new Set(
    Object.values(nextSessions).map((session) => `${session.peerUserId}\u0000${session.peerDeviceId}`)
  );

  peerDeviceKeys.forEach((peerDeviceKey) => {
    const [peerUserId, peerDeviceId] = peerDeviceKey.split("\u0000");
    const beforeCount = Object.keys(nextSessions).length;
    pruneArchivedDeviceSessions(nextSessions, peerUserId ?? "", peerDeviceId ?? "");
    if (Object.keys(nextSessions).length !== beforeCount) {
      changed = true;
    }
  });

  return changed ? nextSessions : sessions;
}

function readPinnedDeviceBundleRecord(userId: string, deviceId: string): PinnedDeviceBundleRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getPinnedDeviceBundleStorageKey(userId, deviceId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<PinnedDeviceBundleRecord>;
    if (
      typeof parsedRecord.userId !== "string" ||
      typeof parsedRecord.deviceId !== "string" ||
      typeof parsedRecord.identityFingerprint !== "string" ||
      typeof parsedRecord.identitySignatureFingerprint !== "string" ||
      typeof parsedRecord.signedPrekeyFingerprint !== "string" ||
      typeof parsedRecord.signedPrekeyId !== "number"
    ) {
      clearPinnedDeviceBundleRecord(userId, deviceId);
      return null;
    }

    return parsedRecord as PinnedDeviceBundleRecord;
  } catch {
    clearPinnedDeviceBundleRecord(userId, deviceId);
    return null;
  }
}

function writePinnedDeviceBundleRecord(userId: string, deviceId: string, record: PinnedDeviceBundleRecord) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getPinnedDeviceBundleStorageKey(userId, deviceId), JSON.stringify(record));
  } catch {
    return;
  }
}

function clearPinnedDeviceBundleRecords(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const currentKey = window.localStorage.key(index);
    if (currentKey?.startsWith(`${PINNED_DEVICE_BUNDLE_STORAGE_PREFIX}${userId}:`)) {
      keysToRemove.push(currentKey);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

function clearPinnedDeviceBundleRecord(userId: string, deviceId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getPinnedDeviceBundleStorageKey(userId, deviceId));
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

function base64UrlToBytes(value: string) {
  const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalizedValue.length % 4;
  const paddedValue =
    remainder === 0 ? normalizedValue : `${normalizedValue}${"=".repeat(4 - remainder)}`;
  return base64ToBytes(paddedValue);
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
