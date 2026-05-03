import {
  ApiError,
  downloadEncryptedChatAttachment,
  getMessagesRaw,
  getOwnActiveGroupHistoryKey,
  getOwnEncryptionAccountKey,
  getOwnGroupHistoryKeys,
  getOwnEncryptionRecoverySnapshot,
  resetOwnEncryptionIdentity,
  resolveEncryptionAccountKeys,
  upsertOwnEncryptionAccountKey,
  upsertOwnEncryptionRecoverySnapshot,
  uploadEncryptedChatAttachment,
  updateMessage,
} from "./api";
import { sendMessageRaw } from "./realtime";
import type {
  ActiveGroupHistoryKeyEvent,
  ApiChatMessage,
  AuthResponse,
  ChatPrejoinHistoryPolicy,
  ChatMessage,
  ChatMessageAttachment,
  EncryptedMessagePayload,
  GroupHistoryKeyAccess,
  Participant,
  UserEncryptionAccountKey,
  UserEncryptionRecoverySnapshot,
} from "./types";
import {
  ENCRYPTION_INITIALIZING_MESSAGE,
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
import {
  decryptRememberedUnlockedIdentityRecord as decryptRememberedUnlockedIdentityRecordInternal,
  normalizeRememberedUnlockedIdentityRecord as normalizeRememberedUnlockedIdentityRecordInternal,
  readRememberedUnlockedIdentity as readRememberedUnlockedIdentityInternal,
  readRememberedUnlockedIdentityRecord as readRememberedUnlockedIdentityRecordInternal,
  readUnlockedIdentity as readUnlockedIdentityInternal,
  readUnlockedIdentityFromPersistentAutoStorage as readUnlockedIdentityFromPersistentAutoStorageInternal,
  readUnlockedIdentityFromSession as readUnlockedIdentityFromSessionInternal,
  rememberUnlockedIdentity as rememberUnlockedIdentityInternal,
  removeUnlockedIdentityFromPersistentStorage as removeUnlockedIdentityFromPersistentStorageInternal,
  removeUnlockedIdentityFromSession as removeUnlockedIdentityFromSessionInternal,
  writeRememberedUnlockedIdentityRecord as writeRememberedUnlockedIdentityRecordInternal,
  writeUnlockedIdentity as writeUnlockedIdentityInternal,
  writeUnlockedIdentityToPersistentAutoStorage as writeUnlockedIdentityToPersistentAutoStorageInternal,
  writeUnlockedIdentityToSession as writeUnlockedIdentityToSessionInternal,
  type RememberedUnlockedIdentityRecord,
} from "./e2eeIdentityStore";
import {
  clearUnlockedEncryptionState as clearUnlockedEncryptionStateInternal,
  createLocalVaultIdentity as createLocalVaultIdentityInternal,
  lockUnlockedEncryptionState as lockUnlockedEncryptionStateInternal,
} from "./e2eeLocalStateLifecycle";
import {
  ensureEncryptionReady as ensureEncryptionReadyInternal,
  resetEncryptionAfterPasswordReset as resetEncryptionAfterPasswordResetInternal,
  resecureLocalEncryptionStateForPasswordChange as resecureLocalEncryptionStateForPasswordChangeInternal,
} from "./e2eeEncryptionLifecycle";
import {
  buildOwnRecoverySnapshotUpload as buildOwnRecoverySnapshotUploadInternal,
  mergeArchivedDecryptedMessageRecords as mergeArchivedDecryptedMessageRecordsInternal,
  restoreEncryptionRecoverySnapshot as restoreEncryptionRecoverySnapshotInternal,
  shouldReplaceArchivedDecryptedMessageRecord as shouldReplaceArchivedDecryptedMessageRecordInternal,
  syncEncryptionRecoverySnapshotInternal as syncEncryptionRecoverySnapshotInternalExternal,
} from "./e2eeRecoverySnapshotLifecycle";
import {
  clearCurrentGroupHistoryKeyRecord as clearCurrentGroupHistoryKeyRecordInternal,
  persistGroupHistoryKeyRecord as persistGroupHistoryKeyRecordInternal,
  readCurrentGroupHistoryKeyRecord as readCurrentGroupHistoryKeyRecordInternal,
  readGroupHistorySyncState as readGroupHistorySyncStateInternal,
  readGroupHistoryKeyState as readGroupHistoryKeyStateInternal,
  removeGroupHistoryKeys as removeGroupHistoryKeysInternal,
  resolveLocalGroupHistoryKeyRecord as resolveLocalGroupHistoryKeyRecordInternal,
  writeGroupHistorySyncState as writeGroupHistorySyncStateInternal,
  writeGroupHistoryKeyState as writeGroupHistoryKeyStateInternal,
} from "./e2eeGroupStateStore";
import {
  parseGroupHistoryKeyGrantPayload,
  type GroupHistoryKeyGrantPayload,
  type GroupHistoryKeyRecord,
  type GroupHistoryKeyState,
} from "./e2eeGroupEngine";
import {
  createLocalGroupHistoryKeyRecord as createLocalGroupHistoryKeyRecordInternal,
  resolveActiveGroupHistoryKeyRecordFromServer as resolveActiveGroupHistoryKeyRecordFromServerInternal,
  resolveGroupHistoryKeyRecordsFromAccesses as resolveGroupHistoryKeyRecordsFromAccessesInternal,
  resolveGroupHistoryKeyRecordFromServer as resolveGroupHistoryKeyRecordFromServerInternal,
} from "./e2eeGroupHistory";
import {
  hydrateChatMessage as hydrateChatMessageInternal,
  hydrateChatMessageSnapshot as hydrateChatMessageSnapshotInternal,
  hydrateLatestUnavailableMessageSnapshots,
} from "./e2eeMessageHydration";
import {
  createE2eeMessageReadbackStore,
  type RememberedDecryptedMessageArchiveRecord,
} from "./e2eeMessageReadbackStore";
import { dispatchE2eeEncryptionStateSynced } from "./e2eeEvents";
import {
  decryptArchivedDecryptedMessage as decryptArchivedDecryptedMessageInternal,
  decryptRecoverySnapshotPayload as decryptRecoverySnapshotPayloadInternal,
  encryptArchivedDecryptedMessage as encryptArchivedDecryptedMessageInternal,
  encryptRecoverySnapshotPayload as encryptRecoverySnapshotPayloadInternal,
  normalizeEncryptedRecoverySnapshotPayloadRecord,
  type EncryptedRecoverySnapshotPayloadRecord,
  type RecoverySnapshotPayload,
} from "./e2eeRecoveryArchive";
import {
  readTrustedBrowserUnlockRecord as readTrustedBrowserUnlockRecordInternal,
  removeTrustedBrowserUnlockRecord as removeTrustedBrowserUnlockRecordInternal,
  writeTrustedBrowserUnlockRecord as writeTrustedBrowserUnlockRecordInternal,
  hasTrustedBrowserUnlock,
  isTrustedBrowserUnlockSupported,
  type TrustedBrowserUnlockRecord,
} from "./e2eeTrustedBrowser";
import {
  createTrustedBrowserCredential as createTrustedBrowserCredentialInternal,
  deriveTrustedBrowserKey as deriveTrustedBrowserKeyInternal,
  trustCurrentBrowserUnlock as trustCurrentBrowserUnlockInternal,
  unlockWithTrustedBrowser as unlockWithTrustedBrowserInternal,
} from "./e2eeTrustedBrowserUnlock";
import { recordSendDiagnosticStep } from "./sendDiagnostics";
import { recordMessageHydrationDiagnostic } from "./messageHydrationDiagnostics";

const MESSAGE_SCHEME_CHAT_EPOCH = "CHAT-EPOCH-KEY-AES-GCM";
const MESSAGE_CONTENT_ENVELOPE_TYPE = "north.message.v1";
const KDF_ITERATIONS = 250_000;
const UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:unlocked-e2ee:";
const AUTO_UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:auto-unlocked-e2ee:";
const REMEMBERED_UNLOCKED_IDENTITY_STORAGE_PREFIX = "north-messenger:remembered-e2ee:";
const GROUP_HISTORY_KEY_STORAGE_PREFIX = "north-messenger:group-history-key-e2ee:";
const DECRYPTED_MESSAGE_ARCHIVE_STORAGE_PREFIX = "north-messenger:decrypted-message-archive:";
const E2EE_STORAGE_SCHEMA_VERSION_KEY = "north-messenger:e2ee-storage-schema-version";
const E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION = "5";
const DECRYPTED_MESSAGE_ARCHIVE_DB_NAME = "north-messenger-decrypted-message-archive";
const DECRYPTED_MESSAGE_ARCHIVE_DB_VERSION = 1;
const DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME = "messages";
const DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME = "by-user-chat-created-at";
const TRUSTED_BROWSER_RP_NAME = "North Messenger";
const ACCOUNT_KEY_ALGORITHM = "RSA-OAEP";
const ACCOUNT_KEY_HASH = "SHA-256";
const ACCOUNT_KEY_MODULUS_LENGTH = 3072;
const ACCOUNT_KEY_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);
const IDENTITY_SIGNING_KEY_ALGORITHM = "RSA-PSS";
const IDENTITY_SIGNING_KEY_HASH = "SHA-256";
const IDENTITY_SIGNING_KEY_MODULUS_LENGTH = 3072;
const IDENTITY_SIGNING_KEY_SALT_LENGTH = 32;
const ACCOUNT_KEY_SIGNATURE_CONTEXT = "north.account-key-bundle.v2";
const IDENTITY_KEY_ALGORITHM_ID = "RSA-PSS-SHA256";
const ACCOUNT_KEY_ALGORITHM_ID = "RSA-OAEP-3072-SHA256";
const CHAT_EPOCH_ENVELOPE_AAD_VERSION = 1;
const CHAT_EPOCH_ENVELOPE_CONTEXT = "north.chat-message.v1";
const ACCOUNT_HISTORY_KEY_GRANT_LEGACY_AAD_VERSION = 1;
const ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION = 2;
const ACCOUNT_HISTORY_KEY_GRANT_CONTEXT = "north.account-history-key-grant.v2";
const ACCOUNT_HISTORY_KEY_WRAP_LABEL = "north.account-history-key-grant.wrap.v2";
const GROUP_HISTORY_KEY_GRANT_AAD_VERSION = 1;
const GROUP_HISTORY_KEY_GRANT_CONTEXT = "north.group-history-key-grant.v1";
const RECOVERY_SNAPSHOT_SYNC_DEBOUNCE_MS = 1_000;
const RECOVERY_SNAPSHOT_SYNC_FRESH_TTL_MS = 10_000;
const RECOVERY_SYNC_SESSION_WAIT_TIMEOUT_MS = 1_000;
const RECOVERY_SYNC_SESSION_WAIT_POLL_MS = 25;
const RECOVERY_SNAPSHOT_PAYLOAD_VERSION = 1;
const REMOTE_RECOVERY_ARCHIVE_REFRESH_TTL_MS = 5_000;
const FAST_HISTORY_INLINE_HYDRATION_SUFFIX_SIZE = 3;
const STALE_ACTIVE_HISTORY_KEY_MESSAGE =
  "Encrypted chat epoch history key is no longer active";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const importedAccountPublicKeyCache = new Map<string, Promise<CryptoKey>>();
const importedIdentitySigningPublicKeyCache = new Map<string, Promise<CryptoKey>>();
const unlockedIdentityByUserId = new Map<string, LocalIdentity>();
const inFlightEncryptedConversationSendByKey = new Map<string, Promise<void>>();
const inFlightMessageHydrationBatchByUserId = new Map<string, Promise<void>>();
const inFlightMessageHydrationByUserId = new Map<string, Promise<void>>();
const recoverySyncSessionByUserId = new Map<string, AuthResponse>();
const scheduledRecoverySnapshotSyncByUserId = new Map<string, number>();
const inFlightRecoverySnapshotSyncByUserId = new Map<string, Promise<void>>();
const queuedRecoverySnapshotSyncByUserId = new Set<string>();
const inFlightRecoverySyncSessionWaitByUserId = new Map<string, Promise<AuthResponse | null>>();
const inFlightRecoveryArchiveRefreshByUserId = new Map<string, Promise<boolean>>();
const completedRecoverySnapshotSyncByUserId = new Map<string, number>();
const completedRecoveryArchiveRefreshByUserId = new Map<string, number>();
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
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
export { hasTrustedBrowserUnlock, isTrustedBrowserUnlockSupported } from "./e2eeTrustedBrowser";

const e2eeMessageReadbackStore = createE2eeMessageReadbackStore({
  decryptedMessageArchiveStoragePrefix: DECRYPTED_MESSAGE_ARCHIVE_STORAGE_PREFIX,
  decryptedMessageArchiveDbName: DECRYPTED_MESSAGE_ARCHIVE_DB_NAME,
  decryptedMessageArchiveDbVersion: DECRYPTED_MESSAGE_ARCHIVE_DB_VERSION,
  decryptedMessageArchiveStoreName: DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME,
  decryptedMessageArchiveChatIndexName: DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME,
});

const {
  writeArchivedDecryptedMessageRecord,
  writeArchivedDecryptedMessageRecords,
  readStoredArchivedDecryptedMessageRecord,
  readAllStoredArchivedDecryptedMessageRecords,
  clearStoredArchivedDecryptedMessageRecords,
  readLatestStoredArchivedDecryptedMessageRecord,
  normalizeArchivedDecryptedMessageRecord,
  sortArchivedDecryptedMessageRecords,
} = e2eeMessageReadbackStore;

function ensureE2eeTransportStorageSchema() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const currentSchemaVersion = window.localStorage.getItem(E2EE_STORAGE_SCHEMA_VERSION_KEY);
    if (currentSchemaVersion === E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION) {
      return;
    }

    resetE2eeTransportStorage(window.localStorage);
    resetE2eeTransportStorage(window.sessionStorage);
    importedAccountPublicKeyCache.clear();
    importedIdentitySigningPublicKeyCache.clear();
    window.localStorage.setItem(
      E2EE_STORAGE_SCHEMA_VERSION_KEY,
      E2EE_TRANSPORT_STORAGE_SCHEMA_VERSION
    );
  } catch {
    return;
  }
}

function resetE2eeTransportStorage(storage: Storage) {
  const transportStoragePrefixes = [GROUP_HISTORY_KEY_STORAGE_PREFIX];
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
  accountPublicKey?: string;
  accountPrivateKey?: string;
  accountKeyVersion?: number;
  identityGeneration?: number;
  identitySigningPublicKey?: string;
  identitySigningPrivateKey?: string;
};

type MessageContentEnvelope = {
  type: typeof MESSAGE_CONTENT_ENVELOPE_TYPE;
  text: string;
  attachments?: ChatMessageAttachment[];
};

export function hasUnlockedPrivateEncryptionKey(userId: string) {
  return readUnlockedIdentity(userId) !== null;
}

function rememberRecoverySyncSession(session: AuthResponse) {
  recoverySyncSessionByUserId.set(session.user.id, session);
}

function shouldRefreshRemoteRecoveryArchive(userId: string) {
  const lastCompletedRefresh = completedRecoveryArchiveRefreshByUserId.get(userId);
  return !lastCompletedRefresh || Date.now() - lastCompletedRefresh >= REMOTE_RECOVERY_ARCHIVE_REFRESH_TTL_MS;
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
    inFlightRecoveryArchiveRefreshByUserId.delete(userId);
    completedRecoverySnapshotSyncByUserId.delete(userId);
    completedRecoveryArchiveRefreshByUserId.delete(userId);
    scheduledRecoverySnapshotSyncByUserId.delete(userId);
    queuedRecoverySnapshotSyncByUserId.delete(userId);
    return;
  }

  recoverySyncSessionByUserId.clear();
  inFlightRecoverySnapshotSyncByUserId.clear();
  inFlightRecoverySyncSessionWaitByUserId.clear();
  inFlightRecoveryArchiveRefreshByUserId.clear();
  completedRecoverySnapshotSyncByUserId.clear();
  completedRecoveryArchiveRefreshByUserId.clear();
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
    completedRecoverySnapshotSyncByUserId.set(userId, Date.now());
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

async function syncEncryptionRecoverySnapshotInternal(
  session: AuthResponse,
  publishOwnEncryptionAccountKey: (
    token: string,
    userId: string,
    identity: LocalIdentity
  ) => Promise<unknown> = publishOwnEncryptionAccountKeyBundle
) {
  return syncEncryptionRecoverySnapshotInternalExternal({
    session,
    isBrowserEnvironment: () => typeof window !== "undefined",
    hasUnlockedPrivateEncryptionKey,
    readUnlockedIdentity,
    readRememberedUnlockedIdentityRecord,
    readAllStoredArchivedDecryptedMessageRecords,
    readRemoteRecoverySnapshotArchivedMessages,
    writeArchivedDecryptedMessageRecords,
    encryptRecoverySnapshotPayload,
    publishOwnEncryptionAccountKey,
    upsertOwnEncryptionRecoverySnapshot,
  });
}

function shouldReplaceArchivedDecryptedMessageRecord(
  currentRecord: RememberedDecryptedMessageArchiveRecord | null | undefined,
  nextRecord: RememberedDecryptedMessageArchiveRecord
) {
  return shouldReplaceArchivedDecryptedMessageRecordInternal(currentRecord, nextRecord);
}

function mergeArchivedDecryptedMessageRecords(
  baseRecords: RememberedDecryptedMessageArchiveRecord[],
  nextRecords: RememberedDecryptedMessageArchiveRecord[]
) {
  return sortArchivedDecryptedMessageRecords(
    mergeArchivedDecryptedMessageRecordsInternal(baseRecords, nextRecords)
  );
}

async function readRemoteRecoverySnapshotArchivedMessages(token: string, privateKey: string) {
  let remoteSnapshot: UserEncryptionRecoverySnapshot;
  try {
    remoteSnapshot = await getOwnEncryptionRecoverySnapshot(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    return [];
  }

  let snapshotPayloadRecord: EncryptedRecoverySnapshotPayloadRecord | null = null;
  try {
    snapshotPayloadRecord = normalizeEncryptedRecoverySnapshotPayloadRecord(
      JSON.parse(remoteSnapshot.snapshotPayloadJson) as unknown
    );
  } catch {
    snapshotPayloadRecord = null;
  }
  if (!snapshotPayloadRecord) {
    return [];
  }

  const snapshotPayload = await decryptRecoverySnapshotPayload(privateKey, snapshotPayloadRecord);
  return snapshotPayload?.archivedMessages ?? [];
}

async function refreshArchivedMessagesFromRemoteRecoverySnapshot(userId: string) {
  if (!hasUnlockedPrivateEncryptionKey(userId)) {
    return false;
  }

  if (!shouldRefreshRemoteRecoveryArchive(userId)) {
    return false;
  }

  const inFlightRefresh = inFlightRecoveryArchiveRefreshByUserId.get(userId);
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const refreshPromise = (async () => {
    const session =
      recoverySyncSessionByUserId.get(userId) ?? (await waitForRecoverySyncSession(userId));
    if (!session) {
      return false;
    }

    const unlockedIdentity = readUnlockedIdentity(userId);
    if (!unlockedIdentity) {
      return false;
    }

    const remoteArchivedMessages = await readRemoteRecoverySnapshotArchivedMessages(
      session.token,
      unlockedIdentity.privateKey
    );
    if (remoteArchivedMessages.length === 0) {
      return false;
    }

    const existingRecords = new Map(
      (await readAllStoredArchivedDecryptedMessageRecords(userId)).map((record) => [
        record.messageId,
        record,
      ])
    );
    const nextRecords = remoteArchivedMessages.filter((record) =>
      shouldReplaceArchivedDecryptedMessageRecord(existingRecords.get(record.messageId), record)
    );
    if (nextRecords.length === 0) {
      return false;
    }

    await writeArchivedDecryptedMessageRecords(userId, nextRecords);
    return true;
  })().finally(() => {
    completedRecoveryArchiveRefreshByUserId.set(userId, Date.now());
    if (inFlightRecoveryArchiveRefreshByUserId.get(userId) === refreshPromise) {
      inFlightRecoveryArchiveRefreshByUserId.delete(userId);
    }
  });

  inFlightRecoveryArchiveRefreshByUserId.set(userId, refreshPromise);
  return refreshPromise;
}

export async function syncEncryptionState(session: AuthResponse) {
  ensureE2eeTransportStorageSchema();
  const userId = session.user.id;
  const hadRecoverySyncSession = recoverySyncSessionByUserId.has(userId);
  rememberRecoverySyncSession(session);

  if (!hasUnlockedPrivateEncryptionKey(userId)) {
    if (!hadRecoverySyncSession) {
      dispatchE2eeEncryptionStateSynced(userId);
    }
    return;
  }

  try {
    await syncEncryptionRecoverySnapshot(session);
  } catch {
    // Recovery sync is best-effort. Messaging should keep working on the last known good state.
  } finally {
    if (!hadRecoverySyncSession) {
      dispatchE2eeEncryptionStateSynced(userId);
    }
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

export function clearUnlockedEncryptionState(userId?: string) {
  ensureE2eeTransportStorageSchema();
  return clearUnlockedEncryptionStateInternal({
    userId,
    unlockedIdentityByUserId,
    clearInFlightMessageHydration,
    removeUnlockedIdentityFromSession,
    removeUnlockedIdentityFromPersistentStorage,
    removeGroupHistoryKeys,
    clearRecoverySnapshotSyncState,
  });
}

export function lockUnlockedEncryptionState(userId?: string) {
  ensureE2eeTransportStorageSchema();
  return lockUnlockedEncryptionStateInternal({
    userId,
    unlockedIdentityByUserId,
    clearInFlightMessageHydration,
    removeUnlockedIdentityFromSession,
    removeGroupHistoryKeys,
    clearRecoverySnapshotSyncState,
  });
}

export async function ensureEncryptionReady(session: AuthResponse, password: string) {
  return ensureEncryptionReadyInternal({
    session,
    password,
    ensureE2eeTransportStorageSchema,
    rememberRecoverySyncSession,
    readUnlockedIdentity,
    rememberUnlockedIdentity: (userId, identity, targetPassword) =>
      rememberUnlockedIdentity(userId, identity, targetPassword),
    syncEncryptionRecoverySnapshot,
    readRememberedUnlockedIdentity: (userId, targetPassword) =>
      readRememberedUnlockedIdentity(userId, targetPassword),
    writeUnlockedIdentity,
    ensureAccountKeyPair: (userId, identity, targetPassword) =>
      ensureLocalIdentityHasAccountKeyPair(userId, identity, targetPassword),
    restoreEncryptionRecoverySnapshot: (targetSession, targetPassword) =>
      restoreEncryptionRecoverySnapshot(targetSession, targetPassword),
    createLocalVaultIdentity,
  });
}

function hasFreshCompletedRecoverySnapshotSync(userId: string) {
  const completedAt = completedRecoverySnapshotSyncByUserId.get(userId);
  return Boolean(
    completedAt && Date.now() - completedAt < RECOVERY_SNAPSHOT_SYNC_FRESH_TTL_MS
  );
}

async function ensureFreshPublishedAccountKey(
  session: AuthResponse | undefined,
  currentUserId: string
) {
  if (!session || session.user.id !== currentUserId) {
    return;
  }

  rememberRecoverySyncSession(session);
  if (!hasUnlockedPrivateEncryptionKey(currentUserId)) {
    return;
  }
  if (hasFreshCompletedRecoverySnapshotSync(currentUserId)) {
    return;
  }

  await syncEncryptionRecoverySnapshot(session);
}

export async function resetEncryptionAfterPasswordReset(session: AuthResponse, password: string) {
  let nextIdentityGeneration = 1;
  try {
    const currentBundle = await getOwnEncryptionAccountKey(session.token);
    if (
      typeof currentBundle.identityGeneration === "number" &&
      Number.isFinite(currentBundle.identityGeneration) &&
      currentBundle.identityGeneration >= 1
    ) {
      nextIdentityGeneration = currentBundle.identityGeneration + 1;
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  return resetEncryptionAfterPasswordResetInternal({
    session,
    password,
    ensureE2eeTransportStorageSchema,
    clearUnlockedEncryptionState,
    removeTrustedBrowserUnlockRecord,
    clearStoredArchivedDecryptedMessageRecords,
    rememberRecoverySyncSession,
    createLocalVaultIdentity: () => ({
      ...createLocalVaultIdentity(),
      identityGeneration: nextIdentityGeneration,
    }),
    ensureAccountKeyPair: (userId, identity, targetPassword) =>
      ensureLocalIdentityHasAccountKeyPair(userId, identity, targetPassword),
    writeUnlockedIdentity,
    rememberUnlockedIdentity: (userId, identity, targetPassword) =>
      rememberUnlockedIdentity(userId, identity, targetPassword),
    syncEncryptionRecoverySnapshot: (targetSession) =>
      syncEncryptionRecoverySnapshotInternal(
        targetSession,
        (token, userId, identity) =>
          publishOwnEncryptionAccountKeyBundleAfterIdentityReset(
            token,
            userId,
            identity,
            password
          )
      ),
  });
}

export async function resecureLocalEncryptionStateForPasswordChange(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  return resecureLocalEncryptionStateForPasswordChangeInternal({
    userId,
    currentPassword,
    newPassword,
    ensureE2eeTransportStorageSchema,
    readUnlockedIdentity,
    rememberUnlockedIdentity: (targetUserId, identity, targetPassword) =>
      rememberUnlockedIdentity(targetUserId, identity, targetPassword),
    readRememberedUnlockedIdentity: (targetUserId, targetPassword) =>
      readRememberedUnlockedIdentity(targetUserId, targetPassword),
    writeUnlockedIdentity,
    ensureAccountKeyPair: (targetUserId, identity, targetPassword) =>
      ensureLocalIdentityHasAccountKeyPair(targetUserId, identity, targetPassword),
  });
}

export async function buildOwnEncryptionRecoverySnapshotUpload(userId: string) {
  return buildOwnRecoverySnapshotUploadInternal({
    userId,
    readUnlockedIdentity,
    readRememberedUnlockedIdentityRecord,
    readAllStoredArchivedDecryptedMessageRecords,
    encryptRecoverySnapshotPayload,
  });
}

export async function trustCurrentBrowserUnlock(session: AuthResponse) {
  return trustCurrentBrowserUnlockInternal({
    session,
    ensureE2eeTransportStorageSchema,
    rememberRecoverySyncSession,
    isTrustedBrowserUnlockSupported,
    readUnlockedIdentity,
    createTrustedBrowserCredential: (targetSession) =>
      createTrustedBrowserCredential(targetSession),
    randomBytes,
    deriveTrustedBrowserKey,
    textEncoder,
    bytesToBase64,
    writeTrustedBrowserUnlockRecord,
  });
}

export async function unlockWithTrustedBrowser(session: AuthResponse) {
  return unlockWithTrustedBrowserInternal({
    session,
    ensureE2eeTransportStorageSchema,
    rememberRecoverySyncSession,
    isTrustedBrowserUnlockSupported,
    readTrustedBrowserUnlockRecord,
    deriveTrustedBrowserKey,
    base64ToBytes,
    textDecoder,
    writeUnlockedIdentity,
    syncEncryptionRecoverySnapshot,
  });
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
      hydratedMessages.push(await hydrateChatMessageWithoutBatchWait(message, userId));
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
    prefetchedRawMessages?: ApiChatMessage[];
    prefetchedActiveGroupHistoryKeyAccess?: GroupHistoryKeyAccess | null;
  } = {}
) {
  ensureE2eeTransportStorageSchema();

  await primePrefetchedActiveGroupHistoryKeyAccess(
    userId,
    chatId,
    options.prefetchedActiveGroupHistoryKeyAccess
  );

  const rawMessages =
    options.prefetchedRawMessages ??
    (await getMessagesRaw(token, chatId, {
      beforeServerOrder: options.beforeServerOrder,
      limit: options.limit,
      acknowledgeDelivered: options.acknowledgeDelivered ?? false,
    }));
  const hydratedMessages = await Promise.all(
    rawMessages.map((message) => hydrateChatMessageSnapshot(message, userId))
  );
  const nextHydratedMessages = await hydrateLatestUnavailableMessageSnapshots({
    rawMessages,
    hydratedMessages,
    userId,
    beforeServerOrder: options.beforeServerOrder ?? null,
    suffixSize: FAST_HISTORY_INLINE_HYDRATION_SUFFIX_SIZE,
    isUnavailableEncryptedMessage,
    withSerializedMessageHydrationBatch,
    hydrateChatMessage: hydrateChatMessageWithoutBatchWait,
  });

  return {
    rawMessages,
    hydratedMessages: nextHydratedMessages,
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
    membershipVersion?: number;
    prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
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
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
  }

  const currentUserId = options.currentUserId;
  return serializeEncryptedConversationSend(
    currentUserId,
    chatId,
    resolvedClientMessageId,
    async () => {
      await ensureFreshPublishedAccountKey(options.session, currentUserId);
      const encryptedContent = serializeMessageContent(normalizedContent, attachments);
      if (!resolvedClientMessageId) {
        throw new ApiError("Client message id is required", 400);
      }
      const sentMessage = await dispatchEncryptedMessageWithActiveKeyRetry({
        token,
        chatId,
        currentUserId,
        encryptedContent,
        participants,
        resolvedClientMessageId,
        replyToMessageId,
        attachments,
        membershipVersion: options?.membershipVersion,
        prejoinHistoryPolicy: options?.prejoinHistoryPolicy ?? null,
        buildChatMessage: (response) =>
          ({
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
          }) satisfies ChatMessage,
      });
      const archivedMessageVariants: Pick<
        ChatMessage,
        "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments"
      >[] = [sentMessage];
      if (resolvedClientMessageId && resolvedClientMessageId !== sentMessage.id) {
        archivedMessageVariants.push({
          ...sentMessage,
          id: resolvedClientMessageId,
        });
      }
      await rememberArchivedDecryptedMessages(currentUserId, archivedMessageVariants);
      recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:archiveRemembered");
      return sentMessage;
    }
  );
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
    membershipVersion?: number;
    prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
  }
) {
  ensureE2eeTransportStorageSchema();

  const attachments = normalizeChatMessageAttachments(options?.attachments ?? []);
  const normalizedContent = content.trim() || buildAttachmentOnlyContent(attachments);
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  if (!(options?.currentUserId ?? userId)) {
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
  }

  const currentUserId = options?.currentUserId ?? userId;
  return serializeEncryptedConversationSend(currentUserId, chatId, "", async () => {
    await ensureFreshPublishedAccountKey(options?.session, currentUserId);
    const encryptedContent = serializeMessageContent(normalizedContent, attachments);
    const response = await updateEncryptedMessageWithActiveKeyRetry({
      token,
      chatId,
      currentUserId,
      messageId,
      encryptedContent,
      participants,
      attachments,
      membershipVersion: options?.membershipVersion,
      prejoinHistoryPolicy: options?.prejoinHistoryPolicy ?? null,
    });

    const hydratedMessage = {
      ...(await hydrateChatMessage(response, userId)),
      content: normalizedContent,
      attachments,
    } satisfies ChatMessage;
    await rememberArchivedDecryptedMessage(currentUserId, hydratedMessage);
    return hydratedMessage;
  });
}

export async function primeEncryptedMessageRecipients(
  token: string,
  participants: Participant[],
  options?: { currentUserId?: string; session?: AuthResponse; forceRefresh?: boolean }
) {
  ensureE2eeTransportStorageSchema();

  if (!options?.currentUserId) {
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
  }

  await ensureFreshPublishedAccountKey(options.session, options.currentUserId);
  await resolveConversationAccountKeyDirectory(
    token,
    options.currentUserId,
    participants,
    await ensureRuntimeAccountIdentity(options.currentUserId)
  );
}

export async function hydrateChatMessage(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  await waitForPendingMessageHydrationBatch(userId);
  return hydrateChatMessageWithoutBatchWait(message, userId);
}

async function hydrateChatMessageWithoutBatchWait(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  return hydrateChatMessageInternal({
    message,
    userId,
    serializeMessageHydration,
    ensureE2eeTransportStorageSchema,
    readArchivedDecryptedMessageRecord: readArchivedDecryptedMessageRecordForHydration,
    buildHydratedChatMessage,
    recordMessageHydrationDiagnostic,
    decryptMessage,
    rememberArchivedDecryptedMessage,
    refreshArchivedMessagesFromRemoteRecoverySnapshot,
  });
}

export async function hydrateChatMessageSnapshot(
  message: ApiChatMessage,
  userId: string
): Promise<ChatMessage> {
  return hydrateChatMessageSnapshotInternal({
    message,
    userId,
    ensureE2eeTransportStorageSchema,
    readArchivedDecryptedMessageRecord: readArchivedDecryptedMessageRecordForHydration,
    buildHydratedChatMessage,
    recordMessageHydrationDiagnostic,
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

function serializeEncryptedConversationSend<T>(
  userId: string,
  chatId: string,
  clientMessageId: string,
  task: () => Promise<T>
): Promise<T> {
  const queueKey = `${userId}:${chatId}`;
  const previousSend =
    inFlightEncryptedConversationSendByKey.get(queueKey) ?? Promise.resolve();
  const queued = inFlightEncryptedConversationSendByKey.has(queueKey);
  if (queued) {
    recordSendDiagnosticStep(clientMessageId, "e2ee:conversationQueue:waiting", {
      queueKey,
    });
  }

  const serializedTask = previousSend.catch(() => undefined).then(async () => {
    recordSendDiagnosticStep(clientMessageId, "e2ee:conversationQueue:acquired", {
      queueKey,
      queued,
    });
    return task();
  });
  const settledTask = serializedTask.then(
    () => undefined,
    () => undefined
  );
  inFlightEncryptedConversationSendByKey.set(queueKey, settledTask);

  return serializedTask.finally(() => {
    recordSendDiagnosticStep(clientMessageId, "e2ee:conversationQueue:released", {
      queueKey,
    });
    if (inFlightEncryptedConversationSendByKey.get(queueKey) === settledTask) {
      inFlightEncryptedConversationSendByKey.delete(queueKey);
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

async function decryptMessage(message: ApiChatMessage, userId: string) {
  const payload = message.encryptedPayload;
  if (!payload) {
    return "";
  }

  if (payload.scheme === MESSAGE_SCHEME_CHAT_EPOCH) {
    return decryptChatEpochMessage(message, userId);
  }

  throw new Error(`Unsupported encrypted payload scheme: ${payload.scheme}`);
}

async function encryptChatEpochMessage(
  token: string,
  chatId: string,
  currentUserId: string,
  content: string,
  options: {
    messageRefId: string;
    membershipVersion?: number;
    contentType: string;
  }
) {
  const historyKeyRecord = await ensureChatHistoryKeyRecord(
    token,
    chatId,
    currentUserId
  );
  const envelope = await createChatEpochEnvelope(
    chatId,
    currentUserId,
    historyKeyRecord,
    content,
    {
      messageRefId: options.messageRefId,
      createdAt: new Date().toISOString(),
      contentType: options.contentType,
      membershipVersion:
        historyKeyRecord.membershipVersion ?? options.membershipVersion ?? 0,
    }
  );
  const serializedEnvelope = JSON.stringify(envelope);
  return {
    scheme: MESSAGE_SCHEME_CHAT_EPOCH,
    sharedEnvelope: serializedEnvelope,
  } satisfies EncryptedMessagePayload;
}

function createLocalGroupHistoryKeyRecord(
  chatId: string,
  options?: {
    membershipVersion?: number;
    historyPolicy?: GroupHistoryKeyGrantPayload["historyPolicy"];
  }
): GroupHistoryKeyRecord {
  return createLocalGroupHistoryKeyRecordInternal(chatId, {
    membershipVersion: options?.membershipVersion ?? 0,
    historyPolicy: options?.historyPolicy ?? "DIRECT",
    createHistoryKeyId: () => window.crypto.randomUUID(),
    createKeyMaterial: () => bytesToBase64(randomBytes(32)),
    now: () => new Date().toISOString(),
  });
}

async function resolveGroupHistoryKeyRecordFromServer(
  token: string,
  userId: string,
  chatId: string
) {
  return resolveGroupHistoryKeyRecordFromServerInternal({
    token,
    userId,
    chatId,
    getOwnGroupHistoryKeys,
    decryptHistoryKeyGrantPayload: decryptDirectHistoryKeyGrantPayload,
    parseGroupHistoryKeyGrantPayload: (value) =>
      parseGroupHistoryKeyGrantPayload(value, GROUP_HISTORY_KEY_GRANT_AAD_VERSION),
    persistGroupHistoryKeyRecord,
    readGroupHistorySyncState,
    writeGroupHistorySyncState,
  });
}

async function resolveActiveGroupHistoryKeyRecordFromServer(
  token: string,
  userId: string,
  chatId: string
) {
  return resolveActiveGroupHistoryKeyRecordFromServerInternal({
    token,
    userId,
    chatId,
    getOwnActiveGroupHistoryKey,
    decryptHistoryKeyGrantPayload: decryptDirectHistoryKeyGrantPayload,
    parseGroupHistoryKeyGrantPayload: (value) =>
      parseGroupHistoryKeyGrantPayload(value, GROUP_HISTORY_KEY_GRANT_AAD_VERSION),
    persistGroupHistoryKeyRecord,
  });
}

async function resolveConversationAccountKeyDirectory(
  token: string,
  currentUserId: string,
  participants: Participant[],
  ownIdentity: LocalIdentity
) {
  if (!hasAccountKeyPair(ownIdentity)) {
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
  }

  const participantIds = Array.from(new Set(participants.map((participant) => participant.id)));
  const remoteParticipants = participantIds.filter((participantId) => participantId !== currentUserId);
  const resolvedRemoteKeys = remoteParticipants.length
    ? await resolveEncryptionAccountKeys(token, remoteParticipants)
    : [];
  await verifyResolvedAccountKeyBundles(participants, resolvedRemoteKeys);
  const accountKeyDirectory = Object.fromEntries(
    resolvedRemoteKeys.map((entry) => [
      entry.userId,
      {
        publicKey: entry.publicKey,
        accountKeyVersion: entry.accountKeyVersion,
      } satisfies ConversationAccountKeyDirectoryEntry,
    ])
  ) as Record<string, ConversationAccountKeyDirectoryEntry>;
  accountKeyDirectory[currentUserId] = {
    publicKey: ownIdentity.accountPublicKey,
    accountKeyVersion: ownIdentity.accountKeyVersion,
  };

  const missingParticipants = participantIds.filter(
    (participantId) => !accountKeyDirectory[participantId]?.publicKey
  );
  if (missingParticipants.length > 0) {
    const missingDisplayNames = participants
      .filter((participant) => missingParticipants.includes(participant.id))
      .map((participant) => participant.displayName);
    throw new ApiError(
      "Encrypted chat is unavailable because some participants have not initialized account encryption yet",
      409,
      missingDisplayNames
    );
  }

  return accountKeyDirectory;
}

type AccountHistoryKeyGrantEnvelope = {
  aadVersion: number;
  ciphertext: string;
  context?: string;
  chatId?: string;
  historyKeyId?: string;
  recipientUserId?: string;
  recipientAccountKeyVersion?: number;
  membershipVersion?: number;
  historyPolicy?: GroupHistoryKeyGrantPayload["historyPolicy"];
  createdAt?: string;
  wrappedKey?: string;
  iv?: string;
};

type ConversationAccountKeyDirectoryEntry = {
  publicKey: string;
  accountKeyVersion: number;
};

type ChatEpochEnvelope = {
  aadVersion: number;
  context: string;
  chatId: string;
  senderUserId: string;
  historyKeyId: string;
  membershipVersion: number;
  messageRefId: string;
  createdAt: string;
  contentType: string;
  ciphertext: string;
  iv: string;
};

function parseAccountHistoryKeyGrantEnvelope(value: string) {
  const parsed = JSON.parse(value) as Partial<AccountHistoryKeyGrantEnvelope>;
  if (
    (parsed.aadVersion !== ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION &&
      parsed.aadVersion !== ACCOUNT_HISTORY_KEY_GRANT_LEGACY_AAD_VERSION) ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("Malformed account history key grant envelope");
  }

  const hasHybridFields = parsed.wrappedKey !== undefined || parsed.iv !== undefined;
  if (
    hasHybridFields &&
    (typeof parsed.wrappedKey !== "string" || typeof parsed.iv !== "string")
  ) {
    throw new Error("Malformed account history key grant envelope");
  }

  if (parsed.aadVersion === ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION) {
    if (
      parsed.context !== ACCOUNT_HISTORY_KEY_GRANT_CONTEXT ||
      typeof parsed.chatId !== "string" ||
      typeof parsed.historyKeyId !== "string" ||
      typeof parsed.recipientUserId !== "string" ||
      typeof parsed.recipientAccountKeyVersion !== "number" ||
      typeof parsed.membershipVersion !== "number" ||
      !Number.isFinite(parsed.membershipVersion) ||
      parsed.membershipVersion < 0 ||
      (parsed.historyPolicy !== "DIRECT" &&
        parsed.historyPolicy !== "JOIN_ONLY" &&
        parsed.historyPolicy !== "FULL_HISTORY") ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.wrappedKey !== "string" ||
      typeof parsed.iv !== "string"
    ) {
      throw new Error("Malformed account history key grant envelope");
    }
  }

  return parsed as AccountHistoryKeyGrantEnvelope;
}

function buildAccountHistoryKeyGrantAdditionalData(
  envelope: Pick<
    AccountHistoryKeyGrantEnvelope,
    | "aadVersion"
    | "context"
    | "chatId"
    | "historyKeyId"
    | "recipientUserId"
    | "recipientAccountKeyVersion"
    | "membershipVersion"
    | "historyPolicy"
    | "createdAt"
  >
) {
  return textEncoder.encode(
    [
      envelope.context ?? "",
      String(envelope.aadVersion),
      envelope.chatId ?? "",
      envelope.historyKeyId ?? "",
      envelope.recipientUserId ?? "",
      String(envelope.recipientAccountKeyVersion ?? 0),
      String(envelope.membershipVersion ?? 0),
      envelope.historyPolicy ?? "",
      envelope.createdAt ?? "",
    ].join("\n")
  );
}

async function decryptAccountHistoryKeyGrantEnvelope(
  identity: LocalIdentity,
  wrappedPayloadJson: string
) {
  if (!identity.accountPrivateKey) {
    throw new Error("Encrypted account history key is not available in this browser");
  }
  const envelope = parseAccountHistoryKeyGrantEnvelope(wrappedPayloadJson);
  const privateKey = await importAccountPrivateKey(identity.accountPrivateKey);
  let plaintext: ArrayBuffer;
  if (envelope.wrappedKey && envelope.iv) {
    const wrappingKeyDecryptAlgorithm =
      envelope.aadVersion === ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION
        ? {
            name: ACCOUNT_KEY_ALGORITHM,
            label: textEncoder.encode(ACCOUNT_HISTORY_KEY_WRAP_LABEL),
          }
        : {
            name: ACCOUNT_KEY_ALGORITHM,
          };
    const wrappingKeyBytes = await window.crypto.subtle.decrypt(
      wrappingKeyDecryptAlgorithm,
      privateKey,
      base64ToBytes(envelope.wrappedKey)
    );
    const wrappingKey = await window.crypto.subtle.importKey(
      "raw",
      wrappingKeyBytes,
      "AES-GCM",
      false,
      ["decrypt"]
    );
    plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(envelope.iv),
        additionalData:
          envelope.aadVersion === ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION
            ? buildAccountHistoryKeyGrantAdditionalData(envelope)
            : textEncoder.encode(String(ACCOUNT_HISTORY_KEY_GRANT_LEGACY_AAD_VERSION)),
      },
      wrappingKey,
      base64ToBytes(envelope.ciphertext)
    );
  } else {
    plaintext = await window.crypto.subtle.decrypt(
      {
        name: ACCOUNT_KEY_ALGORITHM,
      },
      privateKey,
      base64ToBytes(envelope.ciphertext)
    );
  }
  const plaintextValue = textDecoder.decode(plaintext);
  if (envelope.aadVersion === ACCOUNT_HISTORY_KEY_GRANT_AAD_VERSION) {
    const grantPayload = parseGroupHistoryKeyGrantPayload(
      plaintextValue,
      GROUP_HISTORY_KEY_GRANT_AAD_VERSION
    );
    if (
      grantPayload.chatId !== envelope.chatId ||
      grantPayload.historyKeyId !== envelope.historyKeyId ||
      grantPayload.membershipVersion !== envelope.membershipVersion ||
      grantPayload.historyPolicy !== envelope.historyPolicy ||
      grantPayload.createdAt !== envelope.createdAt
    ) {
      throw new Error("Account history key grant envelope metadata does not match the payload");
    }
  }
  return plaintextValue;
}

function parseChatEpochEnvelope(value: string): ChatEpochEnvelope {
  const parsed = JSON.parse(value) as Partial<ChatEpochEnvelope>;
  if (
    parsed.aadVersion !== CHAT_EPOCH_ENVELOPE_AAD_VERSION ||
    parsed.context !== CHAT_EPOCH_ENVELOPE_CONTEXT ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.membershipVersion !== "number" ||
    !Number.isFinite(parsed.membershipVersion) ||
    parsed.membershipVersion < 0 ||
    typeof parsed.messageRefId !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.contentType !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string"
  ) {
    throw new Error("Malformed chat epoch envelope");
  }

  return parsed as ChatEpochEnvelope;
}

function buildChatEpochEnvelopeAdditionalData(
  envelope: Omit<ChatEpochEnvelope, "ciphertext">
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      context: envelope.context,
      chatId: envelope.chatId,
      senderUserId: envelope.senderUserId,
      historyKeyId: envelope.historyKeyId,
      membershipVersion: envelope.membershipVersion,
      messageRefId: envelope.messageRefId,
      createdAt: envelope.createdAt,
      contentType: envelope.contentType,
      iv: envelope.iv,
    })
  );
}

async function createChatEpochEnvelope(
  chatId: string,
  senderUserId: string,
  historyKeyRecord: GroupHistoryKeyRecord,
  content: string,
  options: {
    messageRefId: string;
    createdAt: string;
    contentType: string;
    membershipVersion: number;
  }
): Promise<ChatEpochEnvelope> {
  const iv = randomBytes(12);
  const envelopeMetadata: Omit<ChatEpochEnvelope, "ciphertext"> = {
    aadVersion: CHAT_EPOCH_ENVELOPE_AAD_VERSION,
    context: CHAT_EPOCH_ENVELOPE_CONTEXT,
    chatId,
    senderUserId,
    historyKeyId: historyKeyRecord.historyKeyId,
    membershipVersion: options.membershipVersion,
    messageRefId: options.messageRefId,
    createdAt: options.createdAt,
    contentType: options.contentType,
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
      additionalData: buildChatEpochEnvelopeAdditionalData(envelopeMetadata),
    },
    historyKey,
    textEncoder.encode(content)
  );

  return {
    ...envelopeMetadata,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function primePrefetchedActiveGroupHistoryKeyAccess(
  userId: string,
  chatId: string,
  access: GroupHistoryKeyAccess | null | undefined
) {
  if (!access) {
    return;
  }

  try {
    await resolveGroupHistoryKeyRecordsFromAccessesInternal(
      {
        userId,
        chatId,
        decryptHistoryKeyGrantPayload: decryptDirectHistoryKeyGrantPayload,
        parseGroupHistoryKeyGrantPayload: (value) =>
          parseGroupHistoryKeyGrantPayload(value, GROUP_HISTORY_KEY_GRANT_AAD_VERSION),
        persistGroupHistoryKeyRecord,
      },
      [access]
    );
  } catch {
    // Ignore malformed prefetched access and allow the normal server fallback to resolve keys.
  }
}

async function decryptChatEpochEnvelopeContent(
  envelope: ChatEpochEnvelope,
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
      iv: base64ToBytes(envelope.iv),
      additionalData: buildChatEpochEnvelopeAdditionalData(envelope),
    },
    historyKey,
    base64ToBytes(envelope.ciphertext)
  );

  return textDecoder.decode(plaintext);
}

async function decryptChatEpochMessage(message: ApiChatMessage, userId: string) {
  const payload = message.encryptedPayload;
  if (!payload?.sharedEnvelope) {
    throw new Error("Encrypted chat epoch payload is not available");
  }

  const envelope = parseChatEpochEnvelope(payload.sharedEnvelope);
  let historyKeyRecord = await resolveLocalGroupHistoryKeyRecord(
    userId,
    message.chatId,
    envelope.historyKeyId
  );
  if (!historyKeyRecord) {
    const session =
      recoverySyncSessionByUserId.get(userId) ?? (await waitForRecoverySyncSession(userId));
    if (!session) {
      throw new Error("Encrypted chat history key is not available in this browser");
    }

    historyKeyRecord = await resolveGroupHistoryKeyRecordFromServer(session.token, userId, message.chatId);
  }
  if (!historyKeyRecord || historyKeyRecord.historyKeyId !== envelope.historyKeyId) {
    throw new Error("Encrypted chat history key is not available for this message");
  }

  return decryptChatEpochEnvelopeContent(envelope, historyKeyRecord);
}

async function ensureChatHistoryKeyRecord(
  token: string,
  chatId: string,
  currentUserId: string
) {
  const localRecord = await readCurrentGroupHistoryKeyRecord(currentUserId, chatId);
  if (localRecord) {
    return localRecord;
  }

  const remoteRecord = await resolveActiveGroupHistoryKeyRecordFromServer(
    token,
    currentUserId,
    chatId
  );
  if (!remoteRecord) {
    throw new ApiError("Active encrypted chat history key was not found", 404);
  }
  return remoteRecord;
}

async function dispatchEncryptedMessageWithActiveKeyRetry(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  encryptedContent: string;
  participants: Participant[];
  resolvedClientMessageId: string;
  replyToMessageId?: string | null;
  attachments: ChatMessageAttachment[];
  membershipVersion?: number;
  prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
  buildChatMessage: (response: ApiChatMessage) => ChatMessage;
}) {
  return dispatchWithActiveKeyRetry({
    token: options.token,
    chatId: options.chatId,
    currentUserId: options.currentUserId,
    encryptedContent: options.encryptedContent,
    participants: options.participants,
    clientMessageIdForDiagnostics: options.resolvedClientMessageId,
    messageRefId: options.resolvedClientMessageId,
    membershipVersion: options.membershipVersion,
    prejoinHistoryPolicy: options.prejoinHistoryPolicy ?? null,
    contentType: options.attachments.length > 0 ? MESSAGE_CONTENT_ENVELOPE_TYPE : "text/plain",
    dispatch: async (encryptedPayload) =>
      sendMessageRaw(options.token, options.chatId, {
        clientMessageId: options.resolvedClientMessageId,
        replyToMessageId: options.replyToMessageId,
        attachmentIds: options.attachments.map((attachment) => attachment.id),
        encryptedPayload,
      }),
    mapResponse: options.buildChatMessage,
  });
}

async function updateEncryptedMessageWithActiveKeyRetry(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  messageId: string;
  encryptedContent: string;
  participants: Participant[];
  attachments?: ChatMessageAttachment[];
  membershipVersion?: number;
  prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
}) {
  return dispatchWithActiveKeyRetry({
    token: options.token,
    chatId: options.chatId,
    currentUserId: options.currentUserId,
    encryptedContent: options.encryptedContent,
    participants: options.participants,
    clientMessageIdForDiagnostics: "",
    messageRefId: options.messageId,
    membershipVersion: options.membershipVersion,
    prejoinHistoryPolicy: options.prejoinHistoryPolicy ?? null,
    contentType:
      (options.attachments?.length ?? 0) > 0 ? MESSAGE_CONTENT_ENVELOPE_TYPE : "text/plain",
    dispatch: async (encryptedPayload) =>
      updateMessage(options.token, options.chatId, options.messageId, {
        encryptedPayload,
      }),
    mapResponse: (response) => response,
  });
}

async function dispatchWithActiveKeyRetry<TResponse, TResult>(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  encryptedContent: string;
  participants: Participant[];
  clientMessageIdForDiagnostics: string;
  messageRefId: string;
  membershipVersion?: number;
  prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
  contentType: string;
  dispatch: (encryptedPayload: EncryptedMessagePayload) => Promise<TResponse>;
  mapResponse: (response: TResponse) => TResult;
}) {
  let allowRetryOnStaleActiveKey = true;
  while (true) {
    recordSendDiagnosticStep(options.clientMessageIdForDiagnostics, "e2ee:encrypt:start");
    const encryptedPayload = await encryptChatEpochMessage(
      options.token,
      options.chatId,
      options.currentUserId,
      options.encryptedContent,
      {
        messageRefId: options.messageRefId,
        membershipVersion: options.membershipVersion,
        contentType: options.contentType,
      }
    );
    recordSendDiagnosticStep(options.clientMessageIdForDiagnostics, "e2ee:encrypt:end", {
      scheme: encryptedPayload.scheme,
    });

    try {
      recordSendDiagnosticStep(
        options.clientMessageIdForDiagnostics,
        "e2ee:transportDispatch:start"
      );
      const response = await options.dispatch(encryptedPayload);
      const mappedResponse = options.mapResponse(response);
      if (isApiChatMessage(response)) {
        recordSendDiagnosticStep(
          options.clientMessageIdForDiagnostics,
          "e2ee:transportDispatch:end",
          {
            messageId: response.id,
            serverOrder: response.serverOrder ?? null,
          }
        );
      }
      return mappedResponse;
    } catch (error) {
      if (allowRetryOnStaleActiveKey && isStaleActiveHistoryKeyError(error)) {
        allowRetryOnStaleActiveKey = false;
        recordSendDiagnosticStep(
          options.clientMessageIdForDiagnostics,
          "e2ee:activeHistoryKey:staleRetry"
        );
        await clearCurrentGroupHistoryKeyRecord(options.currentUserId, options.chatId);
        continue;
      }

      throw error;
    }
  }
}

function isApiChatMessage(value: unknown): value is ApiChatMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof (value as { id?: unknown }).id === "string"
  );
}

function isStaleActiveHistoryKeyError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === STALE_ACTIVE_HISTORY_KEY_MESSAGE
  );
}

async function decryptDirectHistoryKeyGrantPayload(
  serializedEnvelope: string,
  userId: string
) {
  const identity = readUnlockedIdentity(userId);
  if (!identity?.accountPrivateKey) {
    throw new Error("Encrypted account history key is not available in this browser");
  }
  return decryptAccountHistoryKeyGrantEnvelope(identity, serializedEnvelope);
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

async function importAccountPublicKey(serializedPublicKey: string) {
  const cacheKey = `${ACCOUNT_KEY_ALGORITHM}:${serializedPublicKey}:encrypt`;
  const cachedKey = importedAccountPublicKeyCache.get(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importPromise = window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPublicKey) as JsonWebKey,
    {
      name: ACCOUNT_KEY_ALGORITHM,
      hash: ACCOUNT_KEY_HASH,
    } satisfies RsaHashedImportParams,
    false,
    ["encrypt"]
  );
  importedAccountPublicKeyCache.set(cacheKey, importPromise);
  try {
    return await importPromise;
  } catch (error) {
    importedAccountPublicKeyCache.delete(cacheKey);
    throw error;
  }
}

async function importAccountPrivateKey(serializedPrivateKey: string) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPrivateKey) as JsonWebKey,
    {
      name: ACCOUNT_KEY_ALGORITHM,
      hash: ACCOUNT_KEY_HASH,
    } satisfies RsaHashedImportParams,
    false,
    ["decrypt"]
  );
}

async function importIdentitySigningPublicKey(serializedPublicKey: string) {
  const cacheKey = `${IDENTITY_SIGNING_KEY_ALGORITHM}:${serializedPublicKey}:verify`;
  const cachedKey = importedIdentitySigningPublicKeyCache.get(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  const importPromise = window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPublicKey) as JsonWebKey,
    {
      name: IDENTITY_SIGNING_KEY_ALGORITHM,
      hash: IDENTITY_SIGNING_KEY_HASH,
    } satisfies RsaHashedImportParams,
    false,
    ["verify"]
  );
  importedIdentitySigningPublicKeyCache.set(cacheKey, importPromise);
  try {
    return await importPromise;
  } catch (error) {
    importedIdentitySigningPublicKeyCache.delete(cacheKey);
    throw error;
  }
}

async function importIdentitySigningPrivateKey(serializedPrivateKey: string) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(serializedPrivateKey) as JsonWebKey,
    {
      name: IDENTITY_SIGNING_KEY_ALGORITHM,
      hash: IDENTITY_SIGNING_KEY_HASH,
    } satisfies RsaHashedImportParams,
    false,
    ["sign"]
  );
}

function buildAccountKeySignaturePayload(
  userId: string,
  identityGeneration: number,
  accountKeyVersion: number,
  identitySigningPublicKey: string,
  identityKeyAlgorithm: string,
  accountKeyAlgorithm: string,
  signedAt: string,
  accountPublicKey: string
) {
  return textEncoder.encode(
    [
      ACCOUNT_KEY_SIGNATURE_CONTEXT,
      userId,
      String(identityGeneration),
      String(accountKeyVersion),
      identityKeyAlgorithm,
      accountKeyAlgorithm,
      signedAt,
      identitySigningPublicKey,
      accountPublicKey,
    ].join("\n")
  );
}

async function verifyResolvedAccountKeyBundles(
  participants: Participant[],
  resolvedRemoteKeys: UserEncryptionAccountKey[]
) {
  if (resolvedRemoteKeys.length === 0) {
    return;
  }

  const participantsById = Object.fromEntries(
    participants.map((participant) => [participant.id, participant] as const)
  );
  const invalidParticipants = new Set<string>();

  for (const entry of resolvedRemoteKeys) {
    try {
      if (
        !entry.identitySigningPublicKey ||
        !entry.signature ||
        !Number.isFinite(entry.accountKeyVersion) ||
        entry.accountKeyVersion < 1 ||
        !Number.isFinite(entry.identityGeneration) ||
        entry.identityGeneration < 1 ||
        entry.identityKeyAlgorithm !== IDENTITY_KEY_ALGORITHM_ID ||
        entry.accountKeyAlgorithm !== ACCOUNT_KEY_ALGORITHM_ID ||
        typeof entry.signedAt !== "string" ||
        entry.signedAt.length === 0
      ) {
        throw new Error("Account key bundle is incomplete");
      }

      const signingPublicKey = await importIdentitySigningPublicKey(entry.identitySigningPublicKey);
      const valid = await window.crypto.subtle.verify(
        {
          name: IDENTITY_SIGNING_KEY_ALGORITHM,
          saltLength: IDENTITY_SIGNING_KEY_SALT_LENGTH,
        },
        signingPublicKey,
        base64ToBytes(entry.signature),
        buildAccountKeySignaturePayload(
          entry.userId,
          entry.identityGeneration,
          entry.accountKeyVersion,
          entry.identitySigningPublicKey,
          entry.identityKeyAlgorithm,
          entry.accountKeyAlgorithm,
          entry.signedAt,
          entry.publicKey
        )
      );
      if (!valid) {
        throw new Error("Account key signature is invalid");
      }
    } catch {
      invalidParticipants.add(
        participantsById[entry.userId]?.displayName ??
          participantsById[entry.userId]?.username ??
          entry.userId
      );
    }
  }

  if (invalidParticipants.size > 0) {
    throw new ApiError(
      "Encrypted chat participant account key could not be verified",
      409,
      Array.from(invalidParticipants)
    );
  }
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

function readUnlockedIdentity(userId: string): LocalIdentity | null {
  return readUnlockedIdentityInternal({
    userId,
    unlockedIdentityByUserId,
    readUnlockedIdentityFromSession,
    readUnlockedIdentityFromPersistentAutoStorage,
    writeUnlockedIdentityToSession: (targetUserId, identity) =>
      writeUnlockedIdentityToSession(targetUserId, identity),
  });
}

function writeUnlockedIdentity(userId: string, identity: LocalIdentity) {
  return writeUnlockedIdentityInternal({
    userId,
    identity,
    unlockedIdentityByUserId,
    writeUnlockedIdentityToSession: (targetUserId, targetIdentity) =>
      writeUnlockedIdentityToSession(targetUserId, targetIdentity),
    writeUnlockedIdentityToPersistentAutoStorage: (targetUserId, targetIdentity) =>
      writeUnlockedIdentityToPersistentAutoStorage(targetUserId, targetIdentity),
  });
}

function createLocalVaultIdentity(): LocalIdentity {
  return createLocalVaultIdentityInternal({
    bytesToBase64,
    randomBytes,
  });
}

async function exportJsonWebKey(key: CryptoKey) {
  return JSON.stringify(await window.crypto.subtle.exportKey("jwk", key));
}

function hasAccountKeyPair(
  identity: LocalIdentity | null | undefined
): identity is LocalIdentity & {
  accountPublicKey: string;
  accountPrivateKey: string;
  accountKeyVersion: number;
  identityGeneration: number;
  identitySigningPublicKey: string;
  identitySigningPrivateKey: string;
} {
  return Boolean(
    identity?.accountPublicKey &&
      identity?.accountPrivateKey &&
      identity?.identitySigningPublicKey &&
      identity?.identitySigningPrivateKey &&
      typeof identity?.identityGeneration === "number" &&
      identity.identityGeneration >= 1 &&
      typeof identity?.accountKeyVersion === "number" &&
      identity.accountKeyVersion >= 1
  );
}

function hasIdentitySigningKeyPair(identity: LocalIdentity | null | undefined) {
  return Boolean(identity?.identitySigningPublicKey && identity?.identitySigningPrivateKey);
}

function hasStoredAccountKeyMaterial(identity: LocalIdentity | null | undefined) {
  return Boolean(identity?.accountPublicKey && identity?.accountPrivateKey);
}

function hasStoredAccountKeyVersion(identity: LocalIdentity | null | undefined) {
  return typeof identity?.accountKeyVersion === "number" && identity.accountKeyVersion >= 1;
}

function hasStoredIdentityGeneration(identity: LocalIdentity | null | undefined) {
  return typeof identity?.identityGeneration === "number" && identity.identityGeneration >= 1;
}

function assertSignedAccountIdentityContinuity(identity: LocalIdentity | null | undefined) {
  const hasAccountMaterial = hasStoredAccountKeyMaterial(identity);
  const hasAccountVersion = hasStoredAccountKeyVersion(identity);
  const hasSigningMaterial = hasIdentitySigningKeyPair(identity);
  const hasIdentityGeneration = hasStoredIdentityGeneration(identity);

  if ((hasAccountMaterial || hasAccountVersion) && !hasSigningMaterial) {
    throw new ApiError(ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE, 409);
  }

  if (hasAccountMaterial && (!hasAccountVersion || !hasIdentityGeneration)) {
    throw new ApiError(ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE, 409);
  }
}

async function generateAccountKeyPair() {
  const keyPair = (await window.crypto.subtle.generateKey(
    {
      name: ACCOUNT_KEY_ALGORITHM,
      hash: ACCOUNT_KEY_HASH,
      modulusLength: ACCOUNT_KEY_MODULUS_LENGTH,
      publicExponent: ACCOUNT_KEY_PUBLIC_EXPONENT,
    } satisfies RsaHashedKeyGenParams,
    true,
    ["encrypt", "decrypt"]
  )) as CryptoKeyPair;

  return {
    publicKey: await exportJsonWebKey(keyPair.publicKey),
    privateKey: await exportJsonWebKey(keyPair.privateKey),
  };
}

async function generateIdentitySigningKeyPair() {
  const keyPair = (await window.crypto.subtle.generateKey(
    {
      name: IDENTITY_SIGNING_KEY_ALGORITHM,
      hash: IDENTITY_SIGNING_KEY_HASH,
      modulusLength: IDENTITY_SIGNING_KEY_MODULUS_LENGTH,
      publicExponent: ACCOUNT_KEY_PUBLIC_EXPONENT,
    } satisfies RsaHashedKeyGenParams,
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  return {
    publicKey: await exportJsonWebKey(keyPair.publicKey),
    privateKey: await exportJsonWebKey(keyPair.privateKey),
  };
}

function normalizeRememberedUnlockedIdentityRecord(
  value: unknown
): RememberedUnlockedIdentityRecord | null {
  return normalizeRememberedUnlockedIdentityRecordInternal(value);
}

function readRememberedUnlockedIdentityRecord(userId: string): RememberedUnlockedIdentityRecord | null {
  return readRememberedUnlockedIdentityRecordInternal({
    userId,
    getRememberedUnlockedIdentityStorageKey,
    removeUnlockedIdentityFromPersistentStorage,
  });
}

function writeRememberedUnlockedIdentityRecord(
  userId: string,
  record: RememberedUnlockedIdentityRecord
) {
  return writeRememberedUnlockedIdentityRecordInternal({
    userId,
    record,
    getRememberedUnlockedIdentityStorageKey,
  });
}

async function decryptRememberedUnlockedIdentityRecord(
  record: RememberedUnlockedIdentityRecord,
  password: string
): Promise<LocalIdentity | null> {
  return decryptRememberedUnlockedIdentityRecordInternal({
    record,
    password,
    deriveWrappingKey,
    base64ToBytes,
    textDecoder,
    kdfIterations: KDF_ITERATIONS,
  });
}

async function readRememberedUnlockedIdentity(
  userId: string,
  password: string
): Promise<LocalIdentity | null> {
  return readRememberedUnlockedIdentityInternal({
    userId,
    password,
    readRememberedUnlockedIdentityRecord,
    decryptRememberedUnlockedIdentityRecord: (record, targetPassword) =>
      decryptRememberedUnlockedIdentityRecord(record, targetPassword),
  });
}

async function rememberUnlockedIdentity(
  userId: string,
  identity: LocalIdentity,
  password: string
) {
  return rememberUnlockedIdentityInternal({
    userId,
    identity,
    password,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    textEncoder,
    kdfIterations: KDF_ITERATIONS,
    writeRememberedUnlockedIdentityRecord: (targetUserId, record) =>
      writeRememberedUnlockedIdentityRecord(targetUserId, record),
  });
}

async function buildOwnEncryptionAccountKeyUpload(
  userId: string,
  identity: LocalIdentity
) {
  if (!hasAccountKeyPair(identity)) {
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
  }

  const signingPrivateKey = await importIdentitySigningPrivateKey(
    identity.identitySigningPrivateKey
  );
  const signedAt = new Date().toISOString();
  const signature = await window.crypto.subtle.sign(
    {
      name: IDENTITY_SIGNING_KEY_ALGORITHM,
      saltLength: IDENTITY_SIGNING_KEY_SALT_LENGTH,
    },
    signingPrivateKey,
    buildAccountKeySignaturePayload(
      userId,
      identity.identityGeneration,
      identity.accountKeyVersion,
      identity.identitySigningPublicKey,
      IDENTITY_KEY_ALGORITHM_ID,
      ACCOUNT_KEY_ALGORITHM_ID,
      signedAt,
      identity.accountPublicKey
    )
  );

  return {
    publicKey: identity.accountPublicKey,
    accountKeyVersion: identity.accountKeyVersion,
    identityGeneration: identity.identityGeneration,
    identitySigningPublicKey: identity.identitySigningPublicKey,
    identityKeyAlgorithm: IDENTITY_KEY_ALGORITHM_ID,
    accountKeyAlgorithm: ACCOUNT_KEY_ALGORITHM_ID,
    signedAt,
    signature: bytesToBase64(new Uint8Array(signature)),
  };
}

async function publishOwnEncryptionAccountKeyBundle(
  token: string,
  userId: string,
  identity: LocalIdentity
) {
  return upsertOwnEncryptionAccountKey(
    token,
    await buildOwnEncryptionAccountKeyUpload(userId, identity)
  );
}

async function publishOwnEncryptionAccountKeyBundleAfterIdentityReset(
  token: string,
  userId: string,
  identity: LocalIdentity,
  currentPassword: string
) {
  const upload = await buildOwnEncryptionAccountKeyUpload(userId, identity);
  let currentBundle:
    | {
        identityGeneration: number;
      }
    | null = null;
  try {
    currentBundle = await getOwnEncryptionAccountKey(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  if (!currentBundle || upload.identityGeneration <= currentBundle.identityGeneration) {
    return upsertOwnEncryptionAccountKey(token, upload);
  }

  if (upload.identityGeneration !== currentBundle.identityGeneration + 1) {
    throw new ApiError(ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE, 409);
  }

  return resetOwnEncryptionIdentity(token, {
    currentPassword,
    ...upload,
  });
}

async function ensureLocalIdentityHasAccountKeyPair(
  userId: string,
  identity: LocalIdentity,
  password: string
) {
  if (hasAccountKeyPair(identity)) {
    return identity;
  }

  let upgradedIdentity: LocalIdentity = { ...identity };
  assertSignedAccountIdentityContinuity(upgradedIdentity);
  if (!hasIdentitySigningKeyPair(upgradedIdentity)) {
    const identitySigningKeyPair = await generateIdentitySigningKeyPair();
    upgradedIdentity = {
      ...upgradedIdentity,
      identityGeneration: hasStoredIdentityGeneration(upgradedIdentity)
        ? upgradedIdentity.identityGeneration
        : 1,
      identitySigningPublicKey: identitySigningKeyPair.publicKey,
      identitySigningPrivateKey: identitySigningKeyPair.privateKey,
    };
  }
  if (!hasStoredAccountKeyMaterial(upgradedIdentity)) {
    const accountKeyPair = await generateAccountKeyPair();
    const currentAccountKeyVersion = upgradedIdentity.accountKeyVersion;
    const nextAccountKeyVersion =
      typeof currentAccountKeyVersion === "number" && currentAccountKeyVersion >= 1
        ? currentAccountKeyVersion + 1
        : 1;
    upgradedIdentity = {
      ...upgradedIdentity,
      accountPublicKey: accountKeyPair.publicKey,
      accountPrivateKey: accountKeyPair.privateKey,
      identityGeneration: hasStoredIdentityGeneration(upgradedIdentity)
        ? upgradedIdentity.identityGeneration
        : 1,
      accountKeyVersion: nextAccountKeyVersion,
    };
  }
  writeUnlockedIdentity(userId, upgradedIdentity);
  await rememberUnlockedIdentity(userId, upgradedIdentity, password);
  return upgradedIdentity;
}

async function ensureRuntimeAccountIdentity(userId: string): Promise<LocalIdentity> {
  const existingIdentity = readUnlockedIdentity(userId);
  if (hasAccountKeyPair(existingIdentity)) {
    return existingIdentity;
  }

  const baseIdentity = existingIdentity ?? createLocalVaultIdentity();
  let upgradedIdentity: LocalIdentity = { ...baseIdentity };
  assertSignedAccountIdentityContinuity(upgradedIdentity);
  if (!hasIdentitySigningKeyPair(upgradedIdentity)) {
    const identitySigningKeyPair = await generateIdentitySigningKeyPair();
    upgradedIdentity = {
      ...upgradedIdentity,
      identityGeneration: hasStoredIdentityGeneration(upgradedIdentity)
        ? upgradedIdentity.identityGeneration
        : 1,
      identitySigningPublicKey: identitySigningKeyPair.publicKey,
      identitySigningPrivateKey: identitySigningKeyPair.privateKey,
    };
  }
  if (!hasStoredAccountKeyMaterial(upgradedIdentity)) {
    const accountKeyPair = await generateAccountKeyPair();
    const currentAccountKeyVersion = upgradedIdentity.accountKeyVersion;
    const nextAccountKeyVersion =
      typeof currentAccountKeyVersion === "number" && currentAccountKeyVersion >= 1
        ? currentAccountKeyVersion + 1
        : 1;
    upgradedIdentity = {
      ...upgradedIdentity,
      accountPublicKey: accountKeyPair.publicKey,
      accountPrivateKey: accountKeyPair.privateKey,
      identityGeneration: hasStoredIdentityGeneration(upgradedIdentity)
        ? upgradedIdentity.identityGeneration
        : 1,
      accountKeyVersion: nextAccountKeyVersion,
    };
  }
  writeUnlockedIdentity(userId, upgradedIdentity);
  return upgradedIdentity;
}

async function restoreEncryptionRecoverySnapshot(
  session: AuthResponse,
  password: string
): Promise<LocalIdentity | null> {
  return restoreEncryptionRecoverySnapshotInternal({
    session,
    password,
    getOwnEncryptionRecoverySnapshot,
    normalizeRememberedUnlockedIdentityRecord,
    normalizeEncryptedRecoverySnapshotPayloadRecord,
    decryptRememberedUnlockedIdentityRecord: (record, targetPassword) =>
      decryptRememberedUnlockedIdentityRecord(record, targetPassword),
    decryptRecoverySnapshotPayload,
    writeUnlockedIdentity,
    writeRememberedUnlockedIdentityRecord: (userId, record) =>
      writeRememberedUnlockedIdentityRecord(userId, record),
    writeArchivedDecryptedMessageRecords,
    encryptionRecoverySnapshotInvalidMessage: ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
    encryptionRecoveryPasswordRestoreFailedMessage:
      ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
    encryptionRecoveryPreviousPasswordRequiredMessage:
      ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
    encryptionRecoverySnapshotDecryptFailedMessage:
      ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
  });
}

async function readGroupHistoryKeyState(userId: string): Promise<GroupHistoryKeyState> {
  return readGroupHistoryKeyStateInternal({
    userId,
    getGroupHistoryKeyStorageKey,
    removeGroupHistoryKeys,
  });
}

function writeGroupHistoryKeyState(userId: string, state: GroupHistoryKeyState) {
  return writeGroupHistoryKeyStateInternal({
    userId,
    state,
    getGroupHistoryKeyStorageKey,
  });
}

function removeGroupHistoryKeys(userId: string) {
  return removeGroupHistoryKeysInternal({
    userId,
    getGroupHistoryKeyStorageKey,
  });
}

async function readGroupHistorySyncState(userId: string, chatId: string) {
  return readGroupHistorySyncStateInternal({
    userId,
    chatId,
    readGroupHistoryKeyState,
  });
}

async function writeGroupHistorySyncState(
  userId: string,
  chatId: string,
  state: { cursor: string | null; fullySynced: boolean }
) {
  return writeGroupHistorySyncStateInternal({
    userId,
    chatId,
    cursor: state.cursor,
    fullySynced: state.fullySynced,
    readGroupHistoryKeyState,
    writeGroupHistoryKeyState: (targetUserId, nextState) =>
      writeGroupHistoryKeyState(targetUserId, nextState),
  });
}

async function persistGroupHistoryKeyRecord(userId: string, record: GroupHistoryKeyRecord) {
  return persistGroupHistoryKeyRecordInternal({
    userId,
    record,
    readGroupHistoryKeyState,
    writeGroupHistoryKeyState: (targetUserId, state) =>
      writeGroupHistoryKeyState(targetUserId, state),
  });
}

async function clearCurrentGroupHistoryKeyRecord(userId: string, chatId: string) {
  return clearCurrentGroupHistoryKeyRecordInternal({
    userId,
    chatId,
    readGroupHistoryKeyState,
    writeGroupHistoryKeyState: (targetUserId, state) =>
      writeGroupHistoryKeyState(targetUserId, state),
  });
}

export async function invalidateActiveGroupHistoryKeyCache(userId: string, chatId: string) {
  return clearCurrentGroupHistoryKeyRecord(userId, chatId);
}

export async function hydrateOwnActiveGroupHistoryKeyAccess(
  userId: string,
  event: ActiveGroupHistoryKeyEvent
) {
  return resolveGroupHistoryKeyRecordsFromAccessesInternal(
    {
      userId,
      chatId: event.chatId,
      decryptHistoryKeyGrantPayload: decryptDirectHistoryKeyGrantPayload,
      parseGroupHistoryKeyGrantPayload: (value) =>
        parseGroupHistoryKeyGrantPayload(value, GROUP_HISTORY_KEY_GRANT_AAD_VERSION),
      persistGroupHistoryKeyRecord,
    },
    [
      {
        historyKeyId: event.historyKeyId,
        wrappedKeyPayloadJson: event.wrappedKeyPayloadJson,
        serverGrantPayloadJson: event.serverGrantPayloadJson,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
    ]
  );
}

async function resolveLocalGroupHistoryKeyRecord(
  userId: string,
  chatId: string,
  historyKeyId: string
) {
  return resolveLocalGroupHistoryKeyRecordInternal({
    userId,
    chatId,
    historyKeyId,
    readGroupHistoryKeyState,
  });
}

async function readCurrentGroupHistoryKeyRecord(userId: string, chatId: string) {
  return readCurrentGroupHistoryKeyRecordInternal({
    userId,
    chatId,
    readGroupHistoryKeyState,
  });
}

async function readGroupHistoryKeyRecordsForChat(userId: string, chatId: string) {
  const state = await readGroupHistoryKeyState(userId);
  return Object.values(state.keysById)
    .filter((record) => record.chatId === chatId)
    .sort((left, right) => {
      const createdAtDelta = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }
      return left.historyKeyId.localeCompare(right.historyKeyId);
    });
}

async function rememberArchivedDecryptedMessage(
  userId: string,
  message: Pick<ChatMessage, "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments">
) {
  return rememberArchivedDecryptedMessages(userId, [message]);
}

async function rememberArchivedDecryptedMessages(
  userId: string,
  messages: Pick<
    ChatMessage,
    "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments"
  >[]
) {
  if (
    typeof window === "undefined" ||
    messages.length === 0
  ) {
    return;
  }

  const identity = readUnlockedIdentity(userId);
  if (!identity) {
    return;
  }

  try {
    const archiveCandidates = messages.filter(
      (message) => message.content.trim() && !isUnavailableEncryptedMessage(message.content)
    );
    if (archiveCandidates.length === 0) {
      return;
    }
    const records = await Promise.all(
      archiveCandidates.map((message) =>
        encryptArchivedDecryptedMessage(identity.privateKey, message)
      )
    );
    await writeArchivedDecryptedMessageRecords(userId, records);
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

async function readArchivedDecryptedMessageRecordForHydration(
  userId: string,
  message: Pick<ApiChatMessage, "id" | "clientMessageId" | "sender">
) {
  const primaryRecord = await readArchivedDecryptedMessageRecord(userId, message.id);
  if (primaryRecord) {
    return primaryRecord;
  }

  if (message.sender.id !== userId) {
    return null;
  }

  const clientMessageId = message.clientMessageId?.trim();
  if (!clientMessageId || clientMessageId === message.id) {
    return null;
  }

  return readArchivedDecryptedMessageRecord(userId, clientMessageId);
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
  return encryptArchivedDecryptedMessageInternal({
    privateKey,
    message,
    kdfIterations: KDF_ITERATIONS,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    normalizeAttachments: normalizeChatMessageAttachments,
    textEncoder,
  });
}

async function decryptArchivedDecryptedMessage(
  privateKey: string,
  record: RememberedDecryptedMessageArchiveRecord
) {
  return decryptArchivedDecryptedMessageInternal({
    privateKey,
    record,
    kdfIterations: KDF_ITERATIONS,
    deriveWrappingKey,
    base64ToBytes,
    normalizeAttachments: normalizeChatMessageAttachments,
    textDecoder,
  });
}

async function encryptRecoverySnapshotPayload(
  privateKey: string,
  archivedMessages: RememberedDecryptedMessageArchiveRecord[]
): Promise<EncryptedRecoverySnapshotPayloadRecord> {
  return encryptRecoverySnapshotPayloadInternal({
    privateKey,
    archivedMessages,
    recoverySnapshotPayloadVersion: RECOVERY_SNAPSHOT_PAYLOAD_VERSION,
    kdfIterations: KDF_ITERATIONS,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    sortArchivedDecryptedMessageRecords,
    textEncoder,
  });
}

async function decryptRecoverySnapshotPayload(
  privateKey: string,
  record: EncryptedRecoverySnapshotPayloadRecord
): Promise<RecoverySnapshotPayload | null> {
  return decryptRecoverySnapshotPayloadInternal({
    privateKey,
    record,
    recoverySnapshotPayloadVersion: RECOVERY_SNAPSHOT_PAYLOAD_VERSION,
    kdfIterations: KDF_ITERATIONS,
    deriveWrappingKey,
    base64ToBytes,
    normalizeArchivedDecryptedMessageRecord,
    textDecoder,
  });
}

function readTrustedBrowserUnlockRecord(userId: string): TrustedBrowserUnlockRecord | null {
  return readTrustedBrowserUnlockRecordInternal(userId);
}

function writeTrustedBrowserUnlockRecord(userId: string, record: TrustedBrowserUnlockRecord) {
  return writeTrustedBrowserUnlockRecordInternal(userId, record);
}

function removeTrustedBrowserUnlockRecord(userId: string) {
  return removeTrustedBrowserUnlockRecordInternal(userId);
}

function readUnlockedIdentityFromSession(userId: string): LocalIdentity | null {
  return readUnlockedIdentityFromSessionInternal({
    userId,
    getUnlockedIdentityStorageKey,
    removeUnlockedIdentityFromSession,
  });
}

function writeUnlockedIdentityToSession(userId: string, identity: LocalIdentity) {
  return writeUnlockedIdentityToSessionInternal({
    userId,
    identity,
    getUnlockedIdentityStorageKey,
  });
}

function removeUnlockedIdentityFromSession(userId: string) {
  return removeUnlockedIdentityFromSessionInternal({
    userId,
    getUnlockedIdentityStorageKey,
  });
}

function removeUnlockedIdentityFromPersistentStorage(userId: string) {
  return removeUnlockedIdentityFromPersistentStorageInternal({
    userId,
    getAutoUnlockedIdentityStorageKey,
    getRememberedUnlockedIdentityStorageKey,
  });
}

function readUnlockedIdentityFromPersistentAutoStorage(userId: string): LocalIdentity | null {
  return readUnlockedIdentityFromPersistentAutoStorageInternal({
    userId,
    getAutoUnlockedIdentityStorageKey,
  });
}

function writeUnlockedIdentityToPersistentAutoStorage(userId: string, identity: LocalIdentity) {
  return writeUnlockedIdentityToPersistentAutoStorageInternal({
    userId,
    identity,
    getAutoUnlockedIdentityStorageKey,
  });
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

function getGroupHistoryKeyStorageKey(userId: string) {
  return `${GROUP_HISTORY_KEY_STORAGE_PREFIX}${userId}`;
}

async function createTrustedBrowserCredential(session: AuthResponse) {
  return createTrustedBrowserCredentialInternal({
    session,
    randomBytes,
    toArrayBuffer,
    rpId: getTrustedBrowserRpId(),
    rpName: TRUSTED_BROWSER_RP_NAME,
    textEncoder,
  });
}

async function deriveTrustedBrowserKey(credentialId: Uint8Array, prfSalt: Uint8Array) {
  return deriveTrustedBrowserKeyInternal({
    credentialId,
    prfSalt,
    rpId: getTrustedBrowserRpId(),
    randomBytes,
    toArrayBuffer,
    bytesToBase64Url,
  });
}

function getTrustedBrowserRpId() {
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
