import {
  ApiError,
  downloadEncryptedChatAttachment,
  getMessagesRaw,
  getOwnGroupHistoryKeys,
  getOwnEncryptionRecoverySnapshot,
  listOwnEncryptionDevices,
  resolveEncryptionDeviceManifest,
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
  ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
  PINNED_DEVICE_BUNDLE_STORAGE_PREFIX,
  clearPinnedEncryptionIdentity,
  isEncryptionIdentityChangedError,
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
import {
  getRecoverableEncryptedEnvelopeErrorMode,
  shouldForceRefreshPreparedRecipientsForError,
} from "./e2eeRecoveryPolicy";
import {
  buildConversationDeviceBundleResolution,
  getDeviceBundleMapKey,
  mergePreparedConversationDeviceBundles,
  type ConversationDeviceBundleResolution,
  type PreparedConversationDeviceState,
  type PreparedDeviceManifestState,
} from "./e2eeDeviceDirectory";
import {
  buildDevicePreparationKey as buildDevicePreparationKeyInternal,
  prepareSendConversationDeviceBundles as prepareSendConversationDeviceBundlesInternal,
  primeDeviceBundles as primeDeviceBundlesInternal,
  resolveConversationDeviceBundles as resolveConversationDeviceBundlesInternal,
} from "./e2eeDevicePreparation";
import {
  clearCompletedDevicePreparation as clearCompletedDevicePreparationInternal,
  clearPreparedConversationDeviceState as clearPreparedConversationDeviceStateInternal,
  clearPreparedDeviceManifestState as clearPreparedDeviceManifestStateInternal,
  clearPreparedOwnSiblingDeviceState as clearPreparedOwnSiblingDeviceStateInternal,
  readPreparedConversationDeviceState as readPreparedConversationDeviceStateInternal,
  readPreparedDeviceManifestState as readPreparedDeviceManifestStateInternal,
  readPreparedOwnSiblingDeviceState as readPreparedOwnSiblingDeviceStateInternal,
  rememberPreparedConversationDeviceState as rememberPreparedConversationDeviceStateInternal,
  rememberPreparedDeviceManifestState as rememberPreparedDeviceManifestStateInternal,
  rememberPreparedOwnSiblingDeviceState as rememberPreparedOwnSiblingDeviceStateInternal,
} from "./e2eeDevicePreparationStore";
import {
  buildOwnSiblingDevicePreparationKey as buildOwnSiblingDevicePreparationKeyInternal,
  listPreparedOwnSiblingDeviceBundles as listPreparedOwnSiblingDeviceBundlesInternal,
} from "./e2eeOwnSiblingDevices";
import {
  discardUnusableRegisteredEncryptionDeviceMaterial as discardUnusableRegisteredEncryptionDeviceMaterialInternal,
  ensureRegisteredEncryptionDeviceInternal as ensureRegisteredEncryptionDeviceInternalExternal,
  findOwnEncryptionDevice as findOwnEncryptionDeviceInternal,
  forceRegisterEncryptionDevice as forceRegisterEncryptionDeviceInternal,
  isRegisteredEncryptionDeviceMaterialAvailable as isRegisteredEncryptionDeviceMaterialAvailableInternal,
  isRegisteredEncryptionDeviceMaterialUsable as isRegisteredEncryptionDeviceMaterialUsableInternal,
  isRegistrationSyncFresh as isRegistrationSyncFreshInternal,
  isSignedPrekeyRotationDue as isSignedPrekeyRotationDueInternal,
  recoverRegisteredEncryptionDeviceMaterial as recoverRegisteredEncryptionDeviceMaterialInternal,
  waitForEncryptionDeviceRegistration as waitForEncryptionDeviceRegistrationInternal,
} from "./e2eeOwnDeviceRegistration";
import {
  decryptRememberedEncryptionDeviceMaterial as decryptRememberedEncryptionDeviceMaterialInternal,
  encryptRememberedEncryptionDeviceMaterial as encryptRememberedEncryptionDeviceMaterialInternal,
  normalizeDeviceEncryptionMaterial as normalizeDeviceEncryptionMaterialInternal,
  pruneRetiredOneTimePrekeys as pruneRetiredOneTimePrekeysInternal,
  pruneRetiredSignedPrekeys as pruneRetiredSignedPrekeysInternal,
  readEncryptionDeviceMaterial as readEncryptionDeviceMaterialInternal,
  readRememberedEncryptionDeviceMaterial as readRememberedEncryptionDeviceMaterialInternal,
  rememberEncryptionDeviceMaterial as rememberEncryptionDeviceMaterialInternal,
  removeEncryptionDeviceMaterial as removeEncryptionDeviceMaterialInternal,
  removeRememberedEncryptionDeviceMaterial as removeRememberedEncryptionDeviceMaterialInternal,
  writeEncryptionDeviceMaterial as writeEncryptionDeviceMaterialInternal,
} from "./e2eeOwnDeviceMaterialStore";
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
  decryptRememberedGroupSenderChainState as decryptRememberedGroupSenderChainStateInternal,
  encryptRememberedGroupSenderChainState as encryptRememberedGroupSenderChainStateInternal,
  persistGroupHistoryKeyRecord as persistGroupHistoryKeyRecordInternal,
  readCurrentGroupHistoryKeyRecord as readCurrentGroupHistoryKeyRecordInternal,
  readGroupHistoryKeyState as readGroupHistoryKeyStateInternal,
  readGroupSenderChainState as readGroupSenderChainStateInternal,
  readRememberedGroupSenderChainState as readRememberedGroupSenderChainStateInternal,
  rememberGroupSenderChainState as rememberGroupSenderChainStateInternal,
  removeGroupHistoryKeys as removeGroupHistoryKeysInternal,
  removeGroupSenderChains as removeGroupSenderChainsInternal,
  removeRememberedGroupSenderChainState as removeRememberedGroupSenderChainStateInternal,
  resolveLocalGroupHistoryKeyRecord as resolveLocalGroupHistoryKeyRecordInternal,
  writeGroupHistoryKeyState as writeGroupHistoryKeyStateInternal,
  writeGroupSenderChainState as writeGroupSenderChainStateInternal,
  writeGroupSenderChains as writeGroupSenderChainsInternal,
} from "./e2eeGroupStateStore";
import {
  assertGroupDistributionSenderMatchesSharedEnvelope,
  buildGroupEnvelopeAdditionalData,
  buildGroupEnvelopeSignatureData,
  buildGroupHistoryEnvelopeAdditionalData,
  buildRecipientDeviceSetHash,
  getGroupInboundSenderChainMapKey,
  isGroupSenderChainRotationDue,
  parseGroupHistoryEnvelope,
  parseGroupHistoryKeyGrantPayload,
  parseGroupSenderKeyDistribution,
  parseGroupSharedEnvelope,
  resolveInboundGroupSenderChainRecord,
  type GroupHistoryEnvelope,
  type GroupHistoryKeyGrantPayload,
  type GroupHistoryKeyRecord,
  type GroupHistoryKeyState,
  type GroupInboundSenderChainRecord,
  type GroupSenderChainRecord,
  type GroupSenderChainState,
  type GroupSenderKeyDistribution,
  type GroupSharedEnvelope,
} from "./e2eeGroupEngine";
import {
  buildGroupHistoryKeyAccessEnvelopes as buildGroupHistoryKeyAccessEnvelopesInternal,
  createLocalGroupHistoryKeyRecord as createLocalGroupHistoryKeyRecordInternal,
  decryptGroupHistoryMessage as decryptGroupHistoryMessageInternal,
  ensureGroupHistoryKeyRecord as ensureGroupHistoryKeyRecordInternal,
  isRecoverableGroupHistoryFallbackError,
  resolveGroupHistoryKeyRecordFromServer as resolveGroupHistoryKeyRecordFromServerInternal,
  upsertGroupHistoryKeyAccessForTargets as upsertGroupHistoryKeyAccessForTargetsInternal,
} from "./e2eeGroupHistory";
import { prepareGroupRecipientEncryptionContext as prepareGroupRecipientEncryptionContextInternal } from "./e2eeGroupRecipients";
import { encryptGroupMessage as encryptGroupMessageInternal } from "./e2eeGroupMessaging";
import { decryptGroupMessage as decryptGroupMessageInternal } from "./e2eeGroupDecryption";
import {
  hydrateChatMessage as hydrateChatMessageInternal,
  hydrateChatMessageSnapshot as hydrateChatMessageSnapshotInternal,
  hydrateLatestUnavailableMessageSnapshots,
} from "./e2eeMessageHydration";
import {
  buildDirectEnvelopeAdditionalData as buildDirectEnvelopeAdditionalDataInternal,
  createDirectRecipientEnvelopeContent as createDirectRecipientEnvelopeContentInternal,
  encryptDirectDeviceMessage as encryptDirectDeviceMessageInternal,
  decryptDirectMessage as decryptDirectMessageInternal,
  decryptDirectRecipientEnvelope as decryptDirectRecipientEnvelopeInternal,
  parseDirectDeviceEnvelope as parseDirectDeviceEnvelopeInternal,
  shouldReestablishResponderDeviceSession as shouldReestablishResponderDeviceSessionInternal,
} from "./e2eeDirectMessaging";
import {
  bootstrapDeviceSessions as bootstrapDeviceSessionsInternal,
  shouldEstablishDeviceSession as shouldEstablishDeviceSessionInternal,
  validateAndPinDeviceBundle as validateAndPinDeviceBundleInternal,
} from "./e2eeDirectBootstrap";
import {
  createE2eeMessageReadbackStore,
  type RememberedDecryptedMessageArchiveRecord,
} from "./e2eeMessageReadbackStore";
import {
  clearPersistentRestoredCurrentDeviceSessions as clearPersistentRestoredCurrentDeviceSessionsInternal,
  filterDeviceSessionsForOwnMaterial,
  findDeviceSessionEntryForEnvelope,
  getDeviceSessionArchiveKey,
  getDeviceSessionArchivePrefix,
  getDeviceSessionMapKey,
  isDeviceSessionCompatibleWithDirectEnvelope,
  listCurrentDeviceSessionKeys,
  listDeviceSessionEntriesForPeer,
  markCurrentDeviceSessionAsReactivated as markCurrentDeviceSessionAsReactivatedInternal,
  markPersistentRestoredCurrentDeviceSessions as markPersistentRestoredCurrentDeviceSessionsInternal,
  pruneArchivedDeviceSessions,
  sanitizeStoredDeviceSessions as sanitizeStoredDeviceSessionsInternal,
  setCurrentDeviceSessionRecord as setCurrentDeviceSessionRecordInternal,
  wasCurrentDeviceSessionRestoredFromPersistent as wasCurrentDeviceSessionRestoredFromPersistentInternal,
} from "./e2eeSessionStore";
import {
  decryptRememberedDeviceSessions as decryptRememberedDeviceSessionsInternal,
  encryptRememberedDeviceSessions as encryptRememberedDeviceSessionsInternal,
  readRememberedDeviceSessions as readRememberedDeviceSessionsInternal,
  rememberDeviceSessions as rememberDeviceSessionsInternal,
  removeRememberedDeviceSessions as removeRememberedDeviceSessionsInternal,
  type RememberedDeviceSessionRecord,
} from "./e2eeSessionPersistence";
import {
  establishInitiatorDeviceSession as establishInitiatorDeviceSessionInternal,
  establishResponderDeviceSession as establishResponderDeviceSessionInternal,
  verifySignedPrekeySignature as verifySignedPrekeySignatureInternal,
} from "./e2eeSessionEstablishment";
import {
  advanceSendingChain as advanceSendingChainInternal,
  applyIncomingDhRatchet as applyIncomingDhRatchetInternal,
  applyOutgoingDhRatchet as applyOutgoingDhRatchetInternal,
  buildSessionMessageCacheKey as buildSessionMessageCacheKeyInternal,
  cacheSessionMessageKey as cacheSessionMessageKeyInternal,
  deriveMessageRatchetStep as deriveMessageRatchetStepInternal,
  encodeRatchetCounter as encodeRatchetCounterInternal,
  getEnvelopeMessageKey as getEnvelopeMessageKeyInternal,
  getReceivingMessageKey as getReceivingMessageKeyInternal,
  resolveReceivingChain as resolveReceivingChainInternal,
  storeReceivingChain as storeReceivingChainInternal,
  updateReceivingChain as updateReceivingChainInternal,
} from "./e2eeSessionRatchet";
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
  TRUSTED_DEVICE_STORAGE_PREFIX,
  readTrustedDeviceUnlockRecord as readTrustedDeviceUnlockRecordInternal,
  removeTrustedDeviceUnlockRecord as removeTrustedDeviceUnlockRecordInternal,
  writeTrustedDeviceUnlockRecord as writeTrustedDeviceUnlockRecordInternal,
  hasTrustedDeviceUnlock,
  isTrustedDeviceUnlockSupported,
  type TrustedDeviceUnlockRecord,
} from "./e2eeTrustedDevice";
import {
  createTrustedDeviceCredential as createTrustedDeviceCredentialInternal,
  deriveTrustedDeviceKey as deriveTrustedDeviceKeyInternal,
  trustCurrentDeviceUnlock as trustCurrentDeviceUnlockInternal,
  unlockWithTrustedDevice as unlockWithTrustedDeviceInternal,
} from "./e2eeTrustedDeviceUnlock";
import { recordSendDiagnosticStep } from "./sendDiagnostics";
import { recordMessageHydrationDiagnostic } from "./messageHydrationDiagnostics";

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
const OUTGOING_MESSAGE_MIRROR_STORAGE_PREFIX = "north-messenger:outgoing-message-mirror:";
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
const REMOTE_RECOVERY_ARCHIVE_REFRESH_TTL_MS = 5_000;
const FAST_HISTORY_INLINE_HYDRATION_SUFFIX_SIZE = 3;
const OUTGOING_MESSAGE_MIRROR_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const OUTGOING_MESSAGE_MIRROR_MAX_RECORDS = 200;
const SIGNED_PREKEY_SIGNATURE_CONTEXT = "north-signed-prekey-v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const importedDevicePublicKeyCache = new Map<string, Promise<CryptoKey>>();
const unlockedIdentityByUserId = new Map<string, LocalIdentity>();
const inFlightEncryptionDeviceRegistration = new Map<string, Promise<void>>();
const completedEncryptionDeviceRegistration = new Map<string, number>();
const inFlightDevicePreparation = new Map<string, Promise<void>>();
const completedDevicePreparation = new Map<string, number>();
const preparedConversationDeviceStates = new Map<string, PreparedConversationDeviceState>();
const inFlightOwnSiblingDevicePreparation = new Map<
  string,
  Promise<PreparedConversationDeviceState | null>
>();
const completedOwnSiblingDevicePreparation = new Map<string, number>();
const preparedOwnSiblingDeviceStates = new Map<string, PreparedConversationDeviceState>();
const completedDeviceManifestPreparation = new Map<string, number>();
const preparedDeviceManifestStates = new Map<string, PreparedDeviceManifestState>();
const restoredPersistentDeviceSessionKeysByUserId = new Map<string, Set<string>>();
const hydratedRuntimeDeviceSessionsByUserId = new Set<string>();
const runtimeWrittenDeviceSessionsByUserId = new Set<string>();
const restoredPersistentOutboundGroupChatsByUserId = new Map<string, Set<string>>();
const inFlightEncryptedConversationSendByKey = new Map<string, Promise<void>>();
const inFlightMessageHydrationBatchByUserId = new Map<string, Promise<void>>();
const inFlightMessageHydrationByUserId = new Map<string, Promise<void>>();
const recoverySyncSessionByUserId = new Map<string, AuthResponse>();
const scheduledRecoverySnapshotSyncByUserId = new Map<string, number>();
const inFlightRecoverySnapshotSyncByUserId = new Map<string, Promise<void>>();
const queuedRecoverySnapshotSyncByUserId = new Set<string>();
const inFlightRecoverySyncSessionWaitByUserId = new Map<string, Promise<AuthResponse | null>>();
const inFlightRecoveryArchiveRefreshByUserId = new Map<string, Promise<boolean>>();
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
  clearPinnedEncryptionIdentity,
  isEncryptionIdentityChangedError,
  isResettableEncryptionRecoveryError,
  isUnavailableEncryptedMessage,
} from "./e2eeShared";
export { hasTrustedDeviceUnlock, isTrustedDeviceUnlockSupported } from "./e2eeTrustedDevice";

const e2eeMessageReadbackStore = createE2eeMessageReadbackStore({
  outgoingMessageMirrorStoragePrefix: OUTGOING_MESSAGE_MIRROR_STORAGE_PREFIX,
  decryptedMessageArchiveStoragePrefix: DECRYPTED_MESSAGE_ARCHIVE_STORAGE_PREFIX,
  decryptedMessageArchiveDbName: DECRYPTED_MESSAGE_ARCHIVE_DB_NAME,
  decryptedMessageArchiveDbVersion: DECRYPTED_MESSAGE_ARCHIVE_DB_VERSION,
  decryptedMessageArchiveStoreName: DECRYPTED_MESSAGE_ARCHIVE_STORE_NAME,
  decryptedMessageArchiveChatIndexName: DECRYPTED_MESSAGE_ARCHIVE_CHAT_INDEX_NAME,
  outgoingMessageMirrorTtlMs: OUTGOING_MESSAGE_MIRROR_TTL_MS,
  outgoingMessageMirrorMaxRecords: OUTGOING_MESSAGE_MIRROR_MAX_RECORDS,
  normalizeAttachments: normalizeChatMessageAttachments,
  isUnavailableEncryptedMessage,
});

const {
  rememberOutgoingMessageMirror,
  readOutgoingMessageMirror,
  writeArchivedDecryptedMessageRecord,
  writeArchivedDecryptedMessageRecords,
  readStoredArchivedDecryptedMessageRecord,
  readAllStoredArchivedDecryptedMessageRecords,
  clearStoredArchivedDecryptedMessageRecords,
  readLatestStoredArchivedDecryptedMessageRecord,
  normalizeArchivedDecryptedMessageRecord,
  sortArchivedDecryptedMessageRecords,
} = e2eeMessageReadbackStore;

function sanitizeStoredDeviceSessions(sessions: Record<string, DeviceSessionRecord>) {
  return sanitizeStoredDeviceSessionsInternal(
    sessions,
    MAX_ARCHIVED_DEVICE_SESSIONS_PER_PEER_DEVICE
  );
}

function markPersistentRestoredCurrentDeviceSessions(
  userId: string,
  sessions: Record<string, DeviceSessionRecord>
) {
  return markPersistentRestoredCurrentDeviceSessionsInternal(
    restoredPersistentDeviceSessionKeysByUserId,
    userId,
    sessions
  );
}

function wasCurrentDeviceSessionRestoredFromPersistent(
  userId: string,
  peerUserId: string,
  peerDeviceId: string
) {
  return wasCurrentDeviceSessionRestoredFromPersistentInternal(
    restoredPersistentDeviceSessionKeysByUserId,
    userId,
    peerUserId,
    peerDeviceId
  );
}

function markCurrentDeviceSessionAsReactivated(
  userId: string,
  peerUserId: string,
  peerDeviceId: string
) {
  return markCurrentDeviceSessionAsReactivatedInternal(
    restoredPersistentDeviceSessionKeysByUserId,
    userId,
    peerUserId,
    peerDeviceId
  );
}

function clearPersistentRestoredCurrentDeviceSessions(userId: string) {
  return clearPersistentRestoredCurrentDeviceSessionsInternal(
    restoredPersistentDeviceSessionKeysByUserId,
    userId
  );
}

function setCurrentDeviceSessionRecord(
  sessions: Record<string, DeviceSessionRecord>,
  sessionRecord: DeviceSessionRecord,
  maxArchivedSessionsPerPeerDevice = MAX_ARCHIVED_DEVICE_SESSIONS_PER_PEER_DEVICE
) {
  return setCurrentDeviceSessionRecordInternal(
    sessions,
    sessionRecord,
    maxArchivedSessionsPerPeerDevice
  );
}

function encodeRatchetCounter(counter: number) {
  return encodeRatchetCounterInternal(counter);
}

async function deriveMessageRatchetStep(
  chainKey: Uint8Array,
  counter: number
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  return deriveMessageRatchetStepInternal({
    chainKey,
    counter,
    deriveSessionSecret,
  });
}

function buildSessionMessageCacheKey(
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number
) {
  return buildSessionMessageCacheKeyInternal(direction, ratchetPublicKey, counter);
}

function resolveReceivingChain(sessionRecord: DeviceSessionRecord, ratchetPublicKey: string) {
  return resolveReceivingChainInternal(sessionRecord, ratchetPublicKey);
}

function storeReceivingChain(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  chain: { chainKey: string; counter: number }
) {
  return storeReceivingChainInternal(sessionRecord, ratchetPublicKey, chain);
}

function updateReceivingChain(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  chain: { chainKey: string; counter: number }
) {
  return updateReceivingChainInternal(sessionRecord, ratchetPublicKey, chain);
}

function cacheSessionMessageKey(
  sessionRecord: DeviceSessionRecord,
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number,
  messageKey: Uint8Array
) {
  return cacheSessionMessageKeyInternal(
    sessionRecord,
    direction,
    ratchetPublicKey,
    counter,
    messageKey,
    bytesToBase64
  );
}

async function advanceSendingChain(sessionRecord: DeviceSessionRecord) {
  return advanceSendingChainInternal({
    sessionRecord,
    base64ToBytes,
    bytesToBase64,
    deriveMessageRatchetStep,
  });
}

async function applyOutgoingDhRatchet(sessionRecord: DeviceSessionRecord) {
  return applyOutgoingDhRatchetInternal({
    sessionRecord,
    deviceAgreementKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    generateAsymmetricKeyPair,
    exportJsonWebKey,
    importDevicePrivateKey,
    importDevicePublicKey,
    deriveAgreementSecret,
    deriveSessionSecret,
    base64ToBytes,
    bytesToBase64,
  });
}

async function getReceivingMessageKey(
  sessionRecord: DeviceSessionRecord,
  ratchetPublicKey: string,
  messageCounter: number
): Promise<Uint8Array> {
  return getReceivingMessageKeyInternal({
    sessionRecord,
    ratchetPublicKey,
    messageCounter,
    deviceMaxMessageGap: DEVICE_MAX_MESSAGE_GAP,
    base64ToBytes,
    bytesToBase64,
    deriveMessageRatchetStep,
  });
}

async function getEnvelopeMessageKey(
  sessionRecord: DeviceSessionRecord,
  envelope: DirectDeviceEnvelope,
  currentUserId: string,
  currentDeviceId: string
): Promise<Uint8Array> {
  return getEnvelopeMessageKeyInternal({
    sessionRecord,
    envelope,
    currentUserId,
    currentDeviceId,
    base64ToBytes,
    getReceivingMessageKey: (ratchetPublicKey, messageCounter) =>
      getReceivingMessageKey(sessionRecord, ratchetPublicKey, messageCounter),
  });
}

async function applyIncomingDhRatchet(
  sessionRecord: DeviceSessionRecord,
  remoteRatchetPublicKey: string
) {
  return applyIncomingDhRatchetInternal({
    sessionRecord,
    remoteRatchetPublicKey,
    deviceAgreementKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    importDevicePrivateKey,
    importDevicePublicKey,
    deriveAgreementSecret,
    deriveSessionSecret,
    base64ToBytes,
    bytesToBase64,
  });
}

async function verifySignedPrekeySignature(bundle: UserEncryptionDeviceBundle) {
  return verifySignedPrekeySignatureInternal({
    bundle,
    importDevicePublicKey,
    base64ToBytes,
    buildSignedPrekeySignaturePayload,
    subtleVerify: (algorithm, key, signature, data) =>
      window.crypto.subtle.verify(algorithm, key, signature, data),
  });
}

async function establishInitiatorDeviceSession(
  currentUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  bundle: UserEncryptionDeviceBundle
): Promise<DeviceSessionRecord> {
  return establishInitiatorDeviceSessionInternal<DeviceEncryptionMaterial, DeviceSessionRecord>({
    currentUserId,
    ownMaterial,
    bundle,
    deviceAgreementKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    importDevicePrivateKey,
    importDevicePublicKey,
    generateAsymmetricKeyPair,
    exportJsonWebKey,
    deriveAgreementSecret,
    deriveSessionSecret,
    bytesToBase64,
    textEncoder,
    createInitializingError: () =>
      new ApiError("Encrypted chat is still initializing on this device. Try again.", 409),
    createSessionId: () => window.crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
}

async function establishResponderDeviceSession(
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  envelope: DirectDeviceEnvelope
): Promise<DeviceSessionRecord> {
  return establishResponderDeviceSessionInternal<
    RegisteredDeviceEncryptionMaterial,
    DeviceSessionRecord
  >({
    currentUserId,
    ownMaterial,
    envelope,
    deviceAgreementKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    pruneRetiredSignedPrekeys,
    pruneRetiredOneTimePrekeys,
    importDevicePrivateKey,
    importDevicePublicKey,
    generateAsymmetricKeyPair,
    exportJsonWebKey,
    deriveAgreementSecret,
    deriveSessionSecret,
    bytesToBase64,
    textEncoder,
    createInitializingError: () =>
      new ApiError("Encrypted chat is still initializing on this device. Try again.", 409),
    createSessionId: () => window.crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
}

function buildDirectEnvelopeAdditionalData(
  envelope: Omit<DirectDeviceEnvelope, "ciphertext">
) {
  return buildDirectEnvelopeAdditionalDataInternal(envelope, textEncoder);
}

async function createDirectRecipientEnvelopeContent(
  senderUserId: string,
  ownMaterial: DeviceEncryptionMaterial,
  sessionRecord: DeviceSessionRecord,
  content: string
): Promise<DirectDeviceEnvelope> {
  return createDirectRecipientEnvelopeContentInternal({
    senderUserId,
    ownMaterial,
    sessionRecord,
    content,
    directEnvelopeAadVersion: DIRECT_ENVELOPE_AAD_VERSION,
    createInitializingError: () =>
      new ApiError("Encrypted chat is still initializing on this device. Try again.", 409),
    randomBytes,
    bytesToBase64,
    applyOutgoingDhRatchet,
    advanceSendingChain,
    encryptEnvelopeCiphertext: async (envelopeMetadata, messageKeyBytes, plaintext, iv) => {
      const messageKey = await window.crypto.subtle.importKey(
        "raw",
        toArrayBuffer(messageKeyBytes),
        {
          name: "AES-GCM",
        },
        false,
        ["encrypt"]
      );
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv as BufferSource,
          additionalData: buildDirectEnvelopeAdditionalData(envelopeMetadata) as BufferSource,
        },
        messageKey,
        textEncoder.encode(plaintext)
      );

      return bytesToBase64(new Uint8Array(ciphertext));
    },
  });
}

function parseDirectDeviceEnvelope(value: string): DirectDeviceEnvelope {
  return parseDirectDeviceEnvelopeInternal(value, DIRECT_ENVELOPE_AAD_VERSION);
}

function shouldReestablishResponderDeviceSession(
  sessionRecord: DeviceSessionRecord,
  envelope: DirectDeviceEnvelope
) {
  return shouldReestablishResponderDeviceSessionInternal(sessionRecord, envelope);
}

async function decryptDirectRecipientEnvelope(
  serializedEnvelope: string,
  userId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial
) {
  return decryptDirectRecipientEnvelopeInternal({
    serializedEnvelope,
    userId,
    ownMaterial,
    directEnvelopeAadVersion: DIRECT_ENVELOPE_AAD_VERSION,
    assertTrustedDirectSender,
    readDeviceSessions,
    getDeviceSessionMapKey,
    findDeviceSessionEntryForEnvelope: (sessions, envelope, context) =>
      findDeviceSessionEntryForEnvelope(sessions, envelope, {
        ...context,
        buildSessionMessageCacheKey,
        resolveReceivingChain,
      }),
    establishResponderDeviceSession,
    setCurrentDeviceSessionRecord,
    persistOwnMaterial: async (currentUserId, nextOwnMaterial) => {
      writeEncryptionDeviceMaterial(currentUserId, nextOwnMaterial);
      await rememberEncryptionDeviceMaterial(currentUserId, nextOwnMaterial);
    },
    resolveReceivingChain,
    applyIncomingDhRatchet,
    getEnvelopeMessageKey,
    writeDeviceSessions,
    rememberDeviceSessions,
    decryptEnvelopeCiphertext: async (envelope, messageKeyBytes) => {
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
      return textDecoder.decode(plaintext);
    },
  });
}

async function decryptDirectMessage(payload: EncryptedMessagePayload, userId: string) {
  return decryptDirectMessageInternal({
    payload,
    userId,
    readOwnMaterial: async (currentUserId) => {
      const material = await readEncryptionDeviceMaterial(currentUserId);
      return isRegisteredEncryptionDeviceMaterialAvailable(material) ? material : null;
    },
    isOwnMaterialAvailable: isRegisteredEncryptionDeviceMaterialAvailable,
    decryptDirectRecipientEnvelope: (serializedEnvelope, currentUserId, ownMaterial) =>
      decryptDirectRecipientEnvelope(serializedEnvelope, currentUserId, ownMaterial),
  });
}

function shouldEstablishDeviceSession(
  existingSessions: Record<string, DeviceSessionRecord>,
  bundle: UserEncryptionDeviceBundle
) {
  return shouldEstablishDeviceSessionInternal({
    existingSessions,
    bundle,
    getDeviceSessionMapKey,
  });
}

async function validateAndPinDeviceBundle(bundle: UserEncryptionDeviceBundle) {
  return validateAndPinDeviceBundleInternal({
    bundle,
    deviceAgreementKeyAlgorithm: DEVICE_AGREEMENT_KEY_ALGORITHM,
    deviceSignatureKeyAlgorithm: DEVICE_SIGNATURE_KEY_ALGORITHM,
    readPinnedDeviceBundleRecord,
    verifySignedPrekeySignature,
    fingerprintPublicKey,
    writePinnedDeviceBundleRecord,
    now: () => new Date().toISOString(),
  });
}

async function bootstrapDeviceSessions(
  token: string,
  currentUserId: string | null,
  previewBundles: UserEncryptionDeviceBundle[]
) {
  return bootstrapDeviceSessionsInternal<
    DeviceEncryptionMaterial,
    DeviceSessionRecord
  >({
    token,
    currentUserId,
    previewBundles,
    readOwnMaterial: readEncryptionDeviceMaterial,
    readCurrentDeviceSessions,
    shouldEstablishDeviceSession,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
    establishInitiatorDeviceSession,
    setCurrentDeviceSessionRecord: (sessions, sessionRecord) =>
      setCurrentDeviceSessionRecord(
        sessions,
        sessionRecord,
        MAX_ARCHIVED_DEVICE_SESSIONS_PER_PEER_DEVICE
      ),
    writeDeviceSessions,
    rememberDeviceSessions,
  });
}

function buildDevicePreparationKey(
  currentUserId: string | null,
  remoteParticipantIds: string[]
) {
  return buildDevicePreparationKeyInternal(currentUserId, remoteParticipantIds);
}

async function primeDeviceBundles(
  token: string,
  userIds: string[],
  requesterDeviceId?: string | null,
  currentUserId?: string | null
) {
  return primeDeviceBundlesInternal({
    token,
    userIds,
    requesterDeviceId,
    currentUserId,
    readPreparedDeviceManifestState,
    rememberPreparedDeviceManifestState,
    resolveEncryptionDeviceManifest,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
  });
}

async function resolveConversationDeviceBundles(
  token: string,
  participants: Participant[],
  requesterDeviceId?: string | null,
  currentUserId?: string | null
): Promise<ConversationDeviceBundleResolution> {
  return resolveConversationDeviceBundlesInternal({
    token,
    participants,
    requesterDeviceId,
    currentUserId,
    readPreparedDeviceManifestState,
    rememberPreparedDeviceManifestState,
    resolveEncryptionDeviceManifest,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
  });
}

async function prepareSendConversationDeviceBundles(
  token: string,
  currentUserId: string,
  participants: Participant[],
  forceRefresh = false
) {
  return prepareSendConversationDeviceBundlesInternal({
    token,
    currentUserId,
    participants,
    inFlightDevicePreparation,
    readPreparedConversationDeviceState,
    readPreparedDeviceManifestState,
    rememberPreparedConversationDeviceState,
    rememberPreparedDeviceManifestState,
    readEncryptionDeviceMaterial,
    listPreparedOwnSiblingDeviceBundles,
    bootstrapDeviceSessions,
    resolveEncryptionDeviceManifest,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
    encryptionIdentityChangedMessage: ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
    forceRefresh,
  });
}

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
    preparedConversationDeviceStates.clear();
    completedOwnSiblingDevicePreparation.clear();
    preparedOwnSiblingDeviceStates.clear();
    completedDeviceManifestPreparation.clear();
    preparedDeviceManifestStates.clear();
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

type MessageContentEnvelope = {
  type: typeof MESSAGE_CONTENT_ENVELOPE_TYPE;
  text: string;
  attachments?: ChatMessageAttachment[];
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

type PinnedDeviceBundleRecord = {
  userId: string;
  deviceId: string;
  identityFingerprint: string;
  identitySignatureFingerprint: string;
  signedPrekeyFingerprint: string;
  signedPrekeyId: number;
  deviceVersion?: string | null;
  updatedAt: string;
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
    completedRecoveryArchiveRefreshByUserId.delete(userId);
    scheduledRecoverySnapshotSyncByUserId.delete(userId);
    queuedRecoverySnapshotSyncByUserId.delete(userId);
    return;
  }

  recoverySyncSessionByUserId.clear();
  inFlightRecoverySnapshotSyncByUserId.clear();
  inFlightRecoverySyncSessionWaitByUserId.clear();
  inFlightRecoveryArchiveRefreshByUserId.clear();
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
  return clearUnlockedEncryptionStateInternal({
    userId,
    unlockedIdentityByUserId,
    importedDevicePublicKeyCache,
    completedEncryptionDeviceRegistration,
    completedDevicePreparation,
    preparedConversationDeviceStates,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
    clearInFlightMessageHydration,
    removeUnlockedIdentityFromSession,
    removeUnlockedIdentityFromPersistentStorage,
    removeEncryptionDeviceMaterial,
    removeRememberedEncryptionDeviceMaterial,
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedEncryptionDeviceRegistration,
    clearCompletedDevicePreparation,
    clearRecoverySnapshotSyncState,
  });
}

export function lockUnlockedEncryptionState(userId?: string) {
  ensureE2eeTransportStorageSchema();
  return lockUnlockedEncryptionStateInternal({
    userId,
    unlockedIdentityByUserId,
    completedEncryptionDeviceRegistration,
    completedDevicePreparation,
    preparedConversationDeviceStates,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
    clearInFlightMessageHydration,
    removeUnlockedIdentityFromSession,
    removeEncryptionDeviceMaterial,
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedEncryptionDeviceRegistration,
    clearCompletedDevicePreparation,
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
    ensureRegisteredEncryptionDevice,
    syncEncryptionRecoverySnapshot,
    readRememberedUnlockedIdentity: (userId, targetPassword) =>
      readRememberedUnlockedIdentity(userId, targetPassword),
    writeUnlockedIdentity,
    restoreEncryptionRecoverySnapshot: (targetSession, targetPassword) =>
      restoreEncryptionRecoverySnapshot(targetSession, targetPassword),
    listOwnEncryptionDevices,
    createLocalVaultIdentity,
    encryptionRecoveryExistingChatsMessage: ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  });
}

export async function resetEncryptionAfterPasswordReset(session: AuthResponse, password: string) {
  return resetEncryptionAfterPasswordResetInternal({
    session,
    password,
    ensureE2eeTransportStorageSchema,
    clearUnlockedEncryptionState,
    removeTrustedDeviceUnlockRecord,
    clearPinnedDeviceBundleRecords,
    clearStoredArchivedDecryptedMessageRecords,
    rememberRecoverySyncSession,
    createLocalVaultIdentity,
    writeUnlockedIdentity,
    rememberUnlockedIdentity: (userId, identity, targetPassword) =>
      rememberUnlockedIdentity(userId, identity, targetPassword),
    ensureRegisteredEncryptionDevice,
    syncEncryptionRecoverySnapshot,
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

export async function trustCurrentDeviceUnlock(session: AuthResponse) {
  return trustCurrentDeviceUnlockInternal({
    session,
    ensureE2eeTransportStorageSchema,
    rememberRecoverySyncSession,
    isTrustedDeviceUnlockSupported,
    readUnlockedIdentity,
    createTrustedDeviceCredential: (targetSession) =>
      createTrustedDeviceCredential(targetSession),
    randomBytes,
    deriveTrustedDeviceKey,
    textEncoder,
    bytesToBase64,
    writeTrustedDeviceUnlockRecord,
  });
}

export async function unlockWithTrustedDevice(session: AuthResponse) {
  return unlockWithTrustedDeviceInternal({
    session,
    ensureE2eeTransportStorageSchema,
    rememberRecoverySyncSession,
    isTrustedDeviceUnlockSupported,
    readTrustedDeviceUnlockRecord,
    deriveTrustedDeviceKey,
    base64ToBytes,
    textDecoder,
    writeUnlockedIdentity,
    ensureRegisteredEncryptionDevice,
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

  const currentUserId = options.currentUserId;
  return serializeEncryptedConversationSend(
    currentUserId,
    chatId,
    resolvedClientMessageId,
    async () => {
      if (options.session && options.session.user.id === options.currentUserId) {
        recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:waitDeviceRegistration:start");
        await waitForEncryptionDeviceRegistration(options.session);
        recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:waitDeviceRegistration:end");
      }

      if (resolvedClientMessageId) {
        rememberOutgoingMessageMirror(currentUserId, {
          id: resolvedClientMessageId,
          chatId,
          content: normalizedContent,
          createdAt: new Date().toISOString(),
          editedAt: null,
          attachments,
          clientMessageId: resolvedClientMessageId,
        });
      }
      recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:primeRecipients:start");
      const primedConversationBundles = await prepareSendConversationDeviceBundles(
        token,
        currentUserId,
        participants
      );
      recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:primeRecipients:end");
      const dispatchMessage = async (conversationBundles: ConversationDeviceBundleResolution) => {
        const encryptedContent = serializeMessageContent(normalizedContent, attachments);
        recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:encrypt:start");
        const encryptedPayload = options.isDirectChat === false
          ? await encryptGroupMessage(
              token,
              chatId,
              currentUserId,
              encryptedContent,
              participants,
              conversationBundles
            )
          : await encryptDirectDeviceMessage(
              token,
              currentUserId,
              encryptedContent,
              participants,
              conversationBundles
            );
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
        rememberOutgoingMessageMirror(currentUserId, sentMessage);
        void rememberArchivedDecryptedMessage(currentUserId, sentMessage);
        recordSendDiagnosticStep(resolvedClientMessageId, "e2ee:archiveRemembered");
        return sentMessage;
      };

      try {
        return await dispatchMessage(primedConversationBundles);
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
        const forceRefresh = shouldForceRefreshPreparedRecipientsForError(error);
        const retriedConversationBundles = await prepareSendConversationDeviceBundles(
          token,
          currentUserId,
          participants,
          forceRefresh
        );
        return dispatchMessage(retriedConversationBundles);
      }
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

  const currentUserId = options?.currentUserId ?? userId;
  return serializeEncryptedConversationSend(currentUserId, chatId, "", async () => {
    if (options?.session && options.session.user.id === (options.currentUserId ?? userId)) {
      await waitForEncryptionDeviceRegistration(options.session);
    }

    rememberOutgoingMessageMirror(currentUserId, {
      id: messageId,
      chatId,
      content: normalizedContent,
      createdAt: new Date().toISOString(),
      editedAt: null,
      attachments,
      clientMessageId: null,
    });
    const primedConversationBundles = await prepareSendConversationDeviceBundles(
      token,
      currentUserId,
      participants
    );
    const dispatchUpdate = async (conversationBundles: ConversationDeviceBundleResolution) => {
      const encryptedContent = serializeMessageContent(normalizedContent, attachments);
      const encryptedPayload = options?.isDirectChat === false
        ? await encryptGroupMessage(
            token,
            chatId,
            currentUserId,
            encryptedContent,
            participants,
            conversationBundles
          )
        : await encryptDirectDeviceMessage(
            token,
            currentUserId,
            encryptedContent,
            participants,
            conversationBundles
          );
      const response = await updateMessage(token, chatId, messageId, {
        encryptedPayload,
      });

      const hydratedMessage = {
        ...(await hydrateChatMessage(response, userId)),
        content: normalizedContent,
        attachments,
      } satisfies ChatMessage;
      rememberOutgoingMessageMirror(currentUserId, hydratedMessage);
      await rememberArchivedDecryptedMessage(currentUserId, hydratedMessage);
      return hydratedMessage;
    };

    try {
      return await dispatchUpdate(primedConversationBundles);
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
      const forceRefresh = shouldForceRefreshPreparedRecipientsForError(error);
      const retriedConversationBundles = await prepareSendConversationDeviceBundles(
        token,
        currentUserId,
        participants,
        forceRefresh
      );
      return dispatchUpdate(retriedConversationBundles);
    }
  });
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
    if (readPreparedConversationDeviceState(preparationKey)) {
      return;
    }

    const inFlightPreparation = inFlightDevicePreparation.get(preparationKey);
    if (inFlightPreparation) {
      await inFlightPreparation;
      return;
    }
  } else {
    clearPreparedConversationDeviceState(preparationKey);
    inFlightDevicePreparation.delete(preparationKey);
  }

  const preparationPromise = (async () => {
    const ownMaterial = currentUserId ? await readEncryptionDeviceMaterial(currentUserId) : null;
    const [
      {
        rawBundles: remoteRawBundles,
        trustedBundles: remoteTrustedBundles,
      },
      preparedOwnDeviceBundles,
    ] = await Promise.all([
      primeDeviceBundles(token, remoteParticipantIds, ownMaterial?.deviceId ?? null, currentUserId),
      currentUserId && ownMaterial?.deviceId
        ? listPreparedOwnSiblingDeviceBundles(
            token,
            currentUserId,
            ownMaterial.deviceId,
            forceRefresh
          )
        : Promise.resolve(null),
    ]);
    let rawBundles = remoteRawBundles;
    let trustedBundles = remoteTrustedBundles;
    let cachePreparedState = true;
    if (currentUserId && ownMaterial?.deviceId) {
      if (preparedOwnDeviceBundles) {
        rawBundles = mergePreparedConversationDeviceBundles(
          rawBundles,
          preparedOwnDeviceBundles.rawBundles
        );
        trustedBundles = mergePreparedConversationDeviceBundles(
          trustedBundles,
          preparedOwnDeviceBundles.trustedBundles
        );
      } else {
        cachePreparedState = false;
      }
    }
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
    if (bootstrapped && cachePreparedState) {
      rememberPreparedConversationDeviceState(preparationKey, {
        rawBundles,
        trustedBundles,
      });
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

function readPreparedConversationDeviceState(preparationKey: string) {
  return readPreparedConversationDeviceStateInternal({
    preparationKey,
    completedDevicePreparation,
    preparedConversationDeviceStates,
    ttlMs: DEVICE_PREPARATION_CACHE_TTL_MS,
    clearPreparedConversationDeviceState,
  });
}

function buildOwnSiblingDevicePreparationKey(currentUserId: string, currentDeviceId: string) {
  return buildOwnSiblingDevicePreparationKeyInternal(currentUserId, currentDeviceId);
}

async function listPreparedOwnSiblingDeviceBundles(
  token: string,
  currentUserId: string,
  currentDeviceId: string,
  forceRefresh = false
) {
  return listPreparedOwnSiblingDeviceBundlesInternal({
    token,
    currentUserId,
    currentDeviceId,
    forceRefresh,
    inFlightOwnSiblingDevicePreparation,
    readPreparedOwnSiblingDeviceState,
    rememberPreparedOwnSiblingDeviceState,
    clearPreparedOwnSiblingDeviceState,
    listOwnEncryptionDevices,
    validateAndPinDeviceBundle,
  });
}

function readPreparedOwnSiblingDeviceState(preparationKey: string) {
  return readPreparedOwnSiblingDeviceStateInternal({
    preparationKey,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
    ttlMs: DEVICE_PREPARATION_CACHE_TTL_MS,
    clearPreparedOwnSiblingDeviceState,
  });
}

function rememberPreparedOwnSiblingDeviceState(
  preparationKey: string,
  preparedState: PreparedConversationDeviceState
) {
  rememberPreparedOwnSiblingDeviceStateInternal({
    preparationKey,
    preparedState,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
  });
}

function clearPreparedOwnSiblingDeviceState(preparationKey: string) {
  clearPreparedOwnSiblingDeviceStateInternal({
    preparationKey,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
  });
}

function rememberPreparedConversationDeviceState(
  preparationKey: string,
  preparedState: PreparedConversationDeviceState
) {
  rememberPreparedConversationDeviceStateInternal({
    preparationKey,
    preparedState,
    completedDevicePreparation,
    preparedConversationDeviceStates,
  });
}

function readPreparedDeviceManifestState(preparationKey: string) {
  return readPreparedDeviceManifestStateInternal({
    preparationKey,
    completedDeviceManifestPreparation,
    preparedDeviceManifestStates,
    ttlMs: DEVICE_PREPARATION_CACHE_TTL_MS,
    clearPreparedDeviceManifestState,
  });
}

function rememberPreparedDeviceManifestState(
  preparationKey: string,
  preparedState: PreparedDeviceManifestState
) {
  rememberPreparedDeviceManifestStateInternal({
    preparationKey,
    preparedState,
    completedDeviceManifestPreparation,
    preparedDeviceManifestStates,
  });
}

function clearPreparedDeviceManifestState(preparationKey: string) {
  clearPreparedDeviceManifestStateInternal({
    preparationKey,
    completedDeviceManifestPreparation,
    preparedDeviceManifestStates,
  });
}

function clearPreparedConversationDeviceState(preparationKey: string) {
  clearPreparedConversationDeviceStateInternal({
    preparationKey,
    completedDevicePreparation,
    preparedConversationDeviceStates,
  });
}

function clearCompletedDevicePreparation(userId: string) {
  clearCompletedDevicePreparationInternal({
    userId,
    completedDevicePreparation,
    preparedConversationDeviceStates,
    completedOwnSiblingDevicePreparation,
    preparedOwnSiblingDeviceStates,
    completedDeviceManifestPreparation,
    preparedDeviceManifestStates,
    clearPreparedConversationDeviceState,
    clearPreparedOwnSiblingDeviceState,
    clearPreparedDeviceManifestState,
  });
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
    readArchivedDecryptedMessageRecord,
    readOutgoingMessageMirror,
    buildHydratedChatMessage,
    recordMessageHydrationDiagnostic,
    decryptMessage,
    rememberOutgoingMessageMirror,
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
    readArchivedDecryptedMessageRecord,
    readOutgoingMessageMirror,
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
  participants: Participant[],
  conversationBundles?: ConversationDeviceBundleResolution
) {
  return encryptDirectDeviceMessageInternal<
    RegisteredDeviceEncryptionMaterial,
    DeviceSessionRecord
  >({
    token,
    currentUserId,
    content,
    participants,
    conversationBundles,
    createInitializingError: () =>
      new ApiError("Encrypted chat is still initializing on this device. Try again.", 409),
    createIdentityChangedError: (displayNames) =>
      new ApiError(ENCRYPTION_IDENTITY_CHANGED_MESSAGE, 409, displayNames),
    createMissingParticipantsError: (displayNames) =>
      new ApiError(
        "Encrypted chat is unavailable because some participants do not have an available encryption device yet",
        409,
        displayNames
      ),
    createUnavailableError: () => new ApiError("Encrypted chat is unavailable", 409),
    messageSchemeDevice: MESSAGE_SCHEME_DEVICE,
    readOwnMaterial: async (userId) => {
      const material = await readEncryptionDeviceMaterial(userId);
      return isRegisteredEncryptionDeviceMaterialAvailable(material) ? material : null;
    },
    resolveConversationDeviceBundles,
    buildSelfDeviceBundle,
    getDeviceBundleMapKey,
    readCurrentDeviceSessions,
    shouldEstablishDeviceSession,
    wasCurrentDeviceSessionRestoredFromPersistent,
    establishInitiatorDeviceSession,
    setCurrentDeviceSessionRecord,
    markCurrentDeviceSessionAsReactivated,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
    createDirectRecipientEnvelope,
    writeDeviceSessions,
    rememberDeviceSessions,
  });
}

async function encryptGroupMessage(
  token: string,
  chatId: string,
  currentUserId: string,
  content: string,
  participants: Participant[],
  conversationBundles?: ConversationDeviceBundleResolution
) {
  return encryptGroupMessageInternal<RegisteredDeviceEncryptionMaterial, DeviceSessionRecord>({
    token,
    chatId,
    currentUserId,
    content,
    participants,
    conversationBundles,
    prepareGroupRecipientEncryptionContext,
    readGroupSenderChainState,
    wasOutboundGroupSenderChainRestoredFromPersistent,
    buildRecipientDeviceSetHash,
    isGroupSenderChainRotationDue: (senderChain) =>
      isGroupSenderChainRotationDue(senderChain, GROUP_SENDER_KEY_MAX_AGE_MS),
    createGroupSenderChain,
    base64ToBytes,
    bytesToBase64,
    deriveMessageRatchetStep,
    createGroupSharedEnvelope,
    ensureGroupHistoryKeyRecord,
    createGroupHistoryEnvelope,
    groupSenderDistributionAadVersion: GROUP_SENDER_DISTRIBUTION_AAD_VERSION,
    getDeviceSessionMapKey,
    establishInitiatorDeviceSession,
    setCurrentDeviceSessionRecord,
    createDirectRecipientEnvelopeContent,
    writeDeviceSessions,
    rememberDeviceSessions,
    writeGroupSenderChainState,
    rememberGroupSenderChainState,
    markOutboundGroupSenderChainAsReactivated,
    messageSchemeGroupSenderKey: MESSAGE_SCHEME_GROUP_SENDER_KEY,
  });
}

async function prepareGroupRecipientEncryptionContext(
  token: string,
  currentUserId: string,
  participants: Participant[],
  conversationBundles?: ConversationDeviceBundleResolution
): Promise<{
  ownMaterial: RegisteredDeviceEncryptionMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, DeviceSessionRecord>;
}> {
  return prepareGroupRecipientEncryptionContextInternal<
    RegisteredDeviceEncryptionMaterial,
    DeviceSessionRecord
  >({
    token,
    currentUserId,
    participants,
    conversationBundles,
    readOwnMaterial: async (userId) => {
      const material = await readEncryptionDeviceMaterial(userId);
      return isRegisteredEncryptionDeviceMaterialAvailable(material) ? material : null;
    },
    resolveConversationDeviceBundles,
    buildSelfDeviceBundle,
    getDeviceBundleMapKey,
    readCurrentDeviceSessions,
    shouldEstablishDeviceSession,
    wasCurrentDeviceSessionRestoredFromPersistent,
    establishInitiatorDeviceSession,
    setCurrentDeviceSessionRecord,
    markCurrentDeviceSessionAsReactivated,
    resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle,
  });
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
  return ensureGroupHistoryKeyRecordInternal({
    token,
    chatId,
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    readCurrentGroupHistoryKeyRecord,
    resolveGroupHistoryKeyRecordFromServer,
    createLocalGroupHistoryKeyRecord,
    upsertGroupHistoryKeyAccessForTargets,
    persistGroupHistoryKeyRecord,
  });
}

function createLocalGroupHistoryKeyRecord(chatId: string): GroupHistoryKeyRecord {
  return createLocalGroupHistoryKeyRecordInternal(chatId, {
    createHistoryKeyId: () => window.crypto.randomUUID(),
    createKeyMaterial: () => bytesToBase64(randomBytes(32)),
    now: () => new Date().toISOString(),
  });
}

async function resolveGroupHistoryKeyRecordFromServer(
  token: string,
  userId: string,
  chatId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial
) {
  return resolveGroupHistoryKeyRecordFromServerInternal({
    token,
    userId,
    chatId,
    ownMaterial,
    getOwnGroupHistoryKeys,
    decryptDirectRecipientEnvelopeContent,
    parseGroupHistoryKeyGrantPayload: (value) =>
      parseGroupHistoryKeyGrantPayload(value, GROUP_HISTORY_KEY_GRANT_AAD_VERSION),
    persistGroupHistoryKeyRecord,
  });
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
  await upsertGroupHistoryKeyAccessForTargetsInternal({
    token,
    chatId,
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    historyKeyRecord,
    buildGroupHistoryKeyAccessEnvelopes: (args) =>
      buildGroupHistoryKeyAccessEnvelopes(
        args.currentUserId,
        args.ownMaterial,
        args.targetBundles,
        args.nextSessions,
        args.historyKeyRecord
      ),
    writeDeviceSessions,
    rememberDeviceSessions,
    upsertGroupHistoryKey,
    persistGroupHistoryKeyRecord,
    now: () => new Date().toISOString(),
  });
}

async function buildGroupHistoryKeyAccessEnvelopes(
  currentUserId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  targetBundles: UserEncryptionDeviceBundle[],
  nextSessions: Record<string, DeviceSessionRecord>,
  historyKeyRecord: GroupHistoryKeyRecord
) {
  return buildGroupHistoryKeyAccessEnvelopesInternal({
    currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions,
    historyKeyRecord,
    serializeGrantPayload: (record) =>
      JSON.stringify({
        aadVersion: GROUP_HISTORY_KEY_GRANT_AAD_VERSION,
        chatId: record.chatId,
        historyKeyId: record.historyKeyId,
        historyKey: record.keyMaterial,
        createdAt: record.createdAt,
      } satisfies GroupHistoryKeyGrantPayload),
    getDeviceSessionMapKey,
    establishInitiatorDeviceSession,
    setCurrentDeviceSessionRecord,
    createDirectRecipientEnvelopeContent,
  });
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
    deviceVersion: null,
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

async function decryptGroupMessage(message: ApiChatMessage, userId: string) {
  return decryptGroupMessageInternal<
    RegisteredDeviceEncryptionMaterial,
    GroupInboundSenderChainRecord,
    DirectDeviceEnvelope
  >({
    message,
    userId,
    readOwnMaterial: async (currentUserId) => {
      const material = await readEncryptionDeviceMaterial(currentUserId);
      return isRegisteredEncryptionDeviceMaterialAvailable(material) ? material : null;
    },
    parseGroupSharedEnvelope: (value) =>
      parseGroupSharedEnvelope(value, GROUP_SHARED_ENVELOPE_AAD_VERSION),
    decryptGroupHistoryMessage,
    parseDirectDeviceEnvelope,
    assertGroupDistributionSenderMatchesSharedEnvelope,
    readGroupSenderChainState,
    resolveInboundGroupSenderChainRecord,
    assertValidGroupEnvelopeSignature,
    resolveInboundGroupMessageKey,
    writeGroupSenderChainState,
    rememberGroupSenderChainState,
    decryptGroupSharedEnvelopeContent,
    decryptDirectRecipientEnvelope,
    isRecoverableGroupHistoryFallbackError,
    parseGroupSenderKeyDistribution: (value) =>
      parseGroupSenderKeyDistribution(value, GROUP_SENDER_DISTRIBUTION_AAD_VERSION),
    base64ToBytes,
    deriveMessageRatchetStep,
    upsertInboundGroupSenderChainRecord,
  });
}

async function decryptGroupHistoryMessage(
  message: ApiChatMessage,
  userId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial,
  sharedEnvelope: GroupSharedEnvelope
) {
  return decryptGroupHistoryMessageInternal({
    message,
    userId,
    ownMaterial,
    sharedEnvelope,
    parseGroupHistoryEnvelope: (value) =>
      parseGroupHistoryEnvelope(value, GROUP_HISTORY_ENVELOPE_AAD_VERSION),
    resolveLocalGroupHistoryKeyRecord,
    getRecoverySyncSession: async (currentUserId) =>
      recoverySyncSessionByUserId.get(currentUserId) ??
      (await waitForRecoverySyncSession(currentUserId)),
    resolveGroupHistoryKeyRecordFromServer,
    decryptGroupHistoryEnvelopeContent,
  });
}

async function decryptDirectRecipientEnvelopeContent(
  serializedEnvelope: string,
  userId: string,
  ownMaterial: RegisteredDeviceEncryptionMaterial
) {
  const { content } = await decryptDirectRecipientEnvelope(serializedEnvelope, userId, ownMaterial);
  return content;
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
  return waitForEncryptionDeviceRegistrationInternal({
    session,
    rememberRecoverySyncSession,
    getInFlightRegistration: (registrationKey) =>
      inFlightEncryptionDeviceRegistration.get(registrationKey),
    readEncryptionDeviceMaterial,
    discardUnusableRegisteredEncryptionDeviceMaterial: (userId, material) =>
      discardUnusableRegisteredEncryptionDeviceMaterial(userId, material),
    hasFreshCompletedEncryptionDeviceRegistration,
    ensureRegisteredEncryptionDevice,
    recoverRegisteredEncryptionDeviceMaterial: (session, material) =>
      recoverRegisteredEncryptionDeviceMaterial(session, material),
    forceRegisterEncryptionDevice,
    initializationErrorMessage:
      "Encrypted chat is still initializing on this device. Try again.",
  });
}

async function ensureRegisteredEncryptionDeviceInternal(session: AuthResponse) {
  return ensureRegisteredEncryptionDeviceInternalExternal({
    session,
    isSecureContextAvailable: () =>
      typeof window !== "undefined" && window.isSecureContext,
    listOwnEncryptionDevices,
    readEncryptionDeviceMaterial,
    discardUnusableRegisteredEncryptionDeviceMaterial: (userId, material) =>
      discardUnusableRegisteredEncryptionDeviceMaterial(userId, material),
    isSignedPrekeyRotationDue,
    minOneTimePrekeys: DEVICE_MIN_ONE_TIME_PREKEYS,
    refreshEncryptionDeviceMaterial,
    createEncryptionDeviceMaterial,
    upsertOwnEncryptionDevice,
    writeEncryptionDeviceMaterial,
    rememberEncryptionDeviceMaterial,
    markRegistrationCompleted: (userId) =>
      completedEncryptionDeviceRegistration.set(userId, Date.now()),
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedDevicePreparation,
  });
}

async function recoverRegisteredEncryptionDeviceMaterial(
  session: AuthResponse,
  material?: DeviceEncryptionMaterial | null
) {
  return recoverRegisteredEncryptionDeviceMaterialInternal({
    session,
    material,
    readEncryptionDeviceMaterial,
    listOwnEncryptionDevices,
    writeEncryptionDeviceMaterial,
    rememberEncryptionDeviceMaterial,
    markRegistrationCompleted: (userId) =>
      completedEncryptionDeviceRegistration.set(userId, Date.now()),
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedDevicePreparation,
  });
}

async function forceRegisterEncryptionDevice(session: AuthResponse) {
  return forceRegisterEncryptionDeviceInternal({
    session,
    isSecureContextAvailable: () =>
      typeof window !== "undefined" && window.isSecureContext,
    readEncryptionDeviceMaterial,
    removeEncryptionDeviceMaterial,
    removeRememberedEncryptionDeviceMaterial,
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedEncryptionDeviceRegistration,
    clearCompletedDevicePreparation,
    createEncryptionDeviceMaterial,
    upsertOwnEncryptionDevice,
    writeEncryptionDeviceMaterial,
    rememberEncryptionDeviceMaterial,
    markRegistrationCompleted: (userId) =>
      completedEncryptionDeviceRegistration.set(userId, Date.now()),
  });
}

function isSignedPrekeyRotationDue(
  material: DeviceEncryptionMaterial | null,
  existingDevice: UserEncryptionDevice | null
) {
  return isSignedPrekeyRotationDueInternal(
    material,
    existingDevice,
    DEVICE_SIGNED_PREKEY_MAX_AGE_MS
  );
}

function findOwnEncryptionDevice(devices: UserEncryptionDevice[], material: DeviceEncryptionMaterial | null) {
  return findOwnEncryptionDeviceInternal(devices, material);
}

function isRegisteredEncryptionDeviceMaterialAvailable(
  material: DeviceEncryptionMaterial | null
): material is RegisteredDeviceEncryptionMaterial {
  return isRegisteredEncryptionDeviceMaterialAvailableInternal(material);
}

async function isRegisteredEncryptionDeviceMaterialUsable(material: DeviceEncryptionMaterial | null) {
  return isRegisteredEncryptionDeviceMaterialUsableInternal({
    material,
    importDevicePrivateKey,
  });
}

async function discardUnusableRegisteredEncryptionDeviceMaterial(
  userId: string,
  material: DeviceEncryptionMaterial | null
) {
  return discardUnusableRegisteredEncryptionDeviceMaterialInternal({
    userId,
    material,
    isRegisteredEncryptionDeviceMaterialUsable,
    removeEncryptionDeviceMaterial,
    removeRememberedEncryptionDeviceMaterial,
    removeDeviceSessions,
    removeRememberedDeviceSessions,
    removeGroupSenderChains,
    removeGroupHistoryKeys,
    clearCompletedEncryptionDeviceRegistration,
    clearCompletedDevicePreparation,
  });
}

function isRegistrationSyncFresh(material: DeviceEncryptionMaterial | null) {
  return isRegistrationSyncFreshInternal(
    material,
    DEVICE_MIN_ONE_TIME_PREKEYS,
    (candidate) => isSignedPrekeyRotationDue(candidate, null)
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

function pruneRetiredSignedPrekeys(
  prekeys: RetiredSignedPrekeyMaterial[] | undefined,
  now = Date.now()
) {
  return pruneRetiredSignedPrekeysInternal(prekeys, now);
}

function pruneRetiredOneTimePrekeys(
  prekeys: RetiredDeviceOneTimePrekeyMaterial[] | undefined,
  now = Date.now()
) {
  return pruneRetiredOneTimePrekeysInternal(prekeys, now);
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
  return normalizeDeviceEncryptionMaterialInternal(value) as DeviceEncryptionMaterial | null;
}

async function readEncryptionDeviceMaterial(userId: string): Promise<DeviceEncryptionMaterial | null> {
  return readEncryptionDeviceMaterialInternal({
    userId,
    getEncryptionDeviceStorageKey,
    normalizeDeviceEncryptionMaterial: (value) =>
      normalizeDeviceEncryptionMaterial(value) as DeviceEncryptionMaterial | null,
    removeEncryptionDeviceMaterial,
    writeEncryptionDeviceMaterial: (targetUserId, material) =>
      writeEncryptionDeviceMaterial(targetUserId, material),
    readRememberedEncryptionDeviceMaterial: (targetUserId) =>
      readRememberedEncryptionDeviceMaterial(targetUserId),
  });
}

function writeEncryptionDeviceMaterial(userId: string, material: DeviceEncryptionMaterial) {
  return writeEncryptionDeviceMaterialInternal({
    userId,
    material,
    getEncryptionDeviceStorageKey,
  });
}

function removeEncryptionDeviceMaterial(userId: string) {
  return removeEncryptionDeviceMaterialInternal({
    userId,
    getEncryptionDeviceStorageKey,
  });
}

async function readRememberedEncryptionDeviceMaterial(userId: string): Promise<DeviceEncryptionMaterial | null> {
  return readRememberedEncryptionDeviceMaterialInternal({
    userId,
    readUnlockedIdentity,
    getRememberedEncryptionDeviceStorageKey,
    decryptRememberedEncryptionDeviceMaterial: (privateKey, record) =>
      decryptRememberedEncryptionDeviceMaterial(privateKey, record),
    normalizeDeviceEncryptionMaterial: (value) =>
      normalizeDeviceEncryptionMaterial(value) as DeviceEncryptionMaterial | null,
    removeRememberedEncryptionDeviceMaterial,
  });
}

async function rememberEncryptionDeviceMaterial(userId: string, material: DeviceEncryptionMaterial) {
  return rememberEncryptionDeviceMaterialInternal({
    userId,
    material,
    readUnlockedIdentity,
    encryptRememberedEncryptionDeviceMaterial: (privateKey, targetMaterial) =>
      encryptRememberedEncryptionDeviceMaterial(privateKey, targetMaterial),
    getRememberedEncryptionDeviceStorageKey,
  });
}

async function encryptRememberedEncryptionDeviceMaterial(
  privateKey: string,
  material: DeviceEncryptionMaterial
) {
  return encryptRememberedEncryptionDeviceMaterialInternal({
    privateKey,
    material,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    textEncoder,
    kdfIterations: KDF_ITERATIONS,
  });
}

async function decryptRememberedEncryptionDeviceMaterial(
  privateKey: string,
  record: { salt: string; iv: string; ciphertext: string; createdAt: string }
) {
  return decryptRememberedEncryptionDeviceMaterialInternal({
    privateKey,
    record,
    base64ToBytes,
    deriveWrappingKey,
    textDecoder,
    kdfIterations: KDF_ITERATIONS,
  });
}

function removeRememberedEncryptionDeviceMaterial(userId: string) {
  return removeRememberedEncryptionDeviceMaterialInternal({
    userId,
    getRememberedEncryptionDeviceStorageKey,
  });
}

async function readGroupSenderChainState(userId: string): Promise<GroupSenderChainState> {
  return readGroupSenderChainStateInternal({
    userId,
    getGroupSenderChainStorageKey,
    readRememberedGroupSenderChainState,
    writeGroupSenderChainState: (targetUserId, state) =>
      writeGroupSenderChainState(targetUserId, state),
    markPersistentRestoredOutboundGroupChats,
    removeGroupSenderChains,
  });
}

async function readGroupSenderChains(userId: string): Promise<Record<string, GroupSenderChainRecord>> {
  return (await readGroupSenderChainState(userId)).outboundChains;
}

function writeGroupSenderChainState(userId: string, state: GroupSenderChainState) {
  return writeGroupSenderChainStateInternal({
    userId,
    state,
    getGroupSenderChainStorageKey,
  });
}

function writeGroupSenderChains(userId: string, chains: Record<string, GroupSenderChainRecord>) {
  void writeGroupSenderChainsInternal({
    userId,
    chains,
    readGroupSenderChainState,
    writeGroupSenderChainState: (targetUserId, state) =>
      writeGroupSenderChainState(targetUserId, state),
    rememberGroupSenderChainState: (targetUserId, state) =>
      rememberGroupSenderChainState(targetUserId, state),
  });
}

function removeGroupSenderChains(userId: string) {
  return removeGroupSenderChainsInternal({
    userId,
    clearPersistentRestoredOutboundGroupChats,
    getGroupSenderChainStorageKey,
    getRememberedGroupSenderChainStorageKey,
  });
}

async function readRememberedGroupSenderChainState(
  userId: string
): Promise<GroupSenderChainState | null> {
  return readRememberedGroupSenderChainStateInternal({
    userId,
    readUnlockedIdentity,
    getRememberedGroupSenderChainStorageKey,
    decryptRememberedGroupSenderChainState: (privateKey, record) =>
      decryptRememberedGroupSenderChainState(privateKey, record),
    removeRememberedGroupSenderChainState: (targetUserId) =>
      removeRememberedGroupSenderChainStateInternal({
        userId: targetUserId,
        getRememberedGroupSenderChainStorageKey,
      }),
  });
}

async function rememberGroupSenderChainState(userId: string, state: GroupSenderChainState) {
  return rememberGroupSenderChainStateInternal({
    userId,
    state,
    readUnlockedIdentity,
    encryptRememberedGroupSenderChainState: (privateKey, targetState) =>
      encryptRememberedGroupSenderChainState(privateKey, targetState),
    getRememberedGroupSenderChainStorageKey,
  });
}

async function encryptRememberedGroupSenderChainState(
  privateKey: string,
  state: GroupSenderChainState
) {
  return encryptRememberedGroupSenderChainStateInternal({
    privateKey,
    state,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    textEncoder,
    kdfIterations: KDF_ITERATIONS,
  });
}

async function decryptRememberedGroupSenderChainState(
  privateKey: string,
  record: { salt: string; iv: string; ciphertext: string; createdAt: string }
) {
  return decryptRememberedGroupSenderChainStateInternal({
    privateKey,
    record,
    base64ToBytes,
    deriveWrappingKey,
    textDecoder,
    kdfIterations: KDF_ITERATIONS,
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

async function persistGroupHistoryKeyRecord(userId: string, record: GroupHistoryKeyRecord) {
  return persistGroupHistoryKeyRecordInternal({
    userId,
    record,
    readGroupHistoryKeyState,
    writeGroupHistoryKeyState: (targetUserId, state) =>
      writeGroupHistoryKeyState(targetUserId, state),
  });
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
      if (!hydratedRuntimeDeviceSessionsByUserId.has(userId)) {
        if (!runtimeWrittenDeviceSessionsByUserId.has(userId)) {
          markPersistentRestoredCurrentDeviceSessions(userId, sanitizedSessions);
        }
        hydratedRuntimeDeviceSessionsByUserId.add(userId);
      }
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
      markPersistentRestoredCurrentDeviceSessions(userId, sanitizedSessions);
      hydratedRuntimeDeviceSessionsByUserId.add(userId);
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

function writeDeviceSessions(userId: string, sessions: Record<string, DeviceSessionRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    runtimeWrittenDeviceSessionsByUserId.add(userId);
    window.sessionStorage.setItem(getDeviceSessionStorageKey(userId), JSON.stringify(sessions));
  } catch {
    return;
  }
}

function removeDeviceSessions(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    clearPersistentRestoredCurrentDeviceSessions(userId);
    hydratedRuntimeDeviceSessionsByUserId.delete(userId);
    runtimeWrittenDeviceSessionsByUserId.delete(userId);
    window.sessionStorage.removeItem(getDeviceSessionStorageKey(userId));
  } catch {
    return;
  }
}

async function readRememberedDeviceSessions(
  userId: string
): Promise<Record<string, DeviceSessionRecord> | null> {
  return readRememberedDeviceSessionsInternal({
    userId,
    readUnlockedIdentity,
    getRememberedDeviceSessionStorageKey,
    decryptRememberedDeviceSessions,
    validateSessionCollection: (
      value
    ): value is Record<string, DeviceSessionRecord> => isValidDeviceSessionCollection(value),
    removeRememberedDeviceSessions,
  });
}

async function rememberDeviceSessions(userId: string, sessions: Record<string, DeviceSessionRecord>) {
  return rememberDeviceSessionsInternal({
    userId,
    sessions,
    readUnlockedIdentity,
    sanitizeStoredDeviceSessions,
    encryptRememberedDeviceSessions,
    getRememberedDeviceSessionStorageKey,
  });
}

async function encryptRememberedDeviceSessions(
  privateKey: string,
  sessions: Record<string, DeviceSessionRecord>
): Promise<RememberedDeviceSessionRecord> {
  return encryptRememberedDeviceSessionsInternal({
    privateKey,
    sessions,
    kdfIterations: KDF_ITERATIONS,
    randomBytes,
    deriveWrappingKey,
    bytesToBase64,
    textEncoder,
  });
}

async function decryptRememberedDeviceSessions(
  privateKey: string,
  record: RememberedDeviceSessionRecord
) {
  return decryptRememberedDeviceSessionsInternal({
    privateKey,
    record,
    kdfIterations: KDF_ITERATIONS,
    deriveWrappingKey,
    base64ToBytes,
    textDecoder,
  });
}

function removeRememberedDeviceSessions(userId: string) {
  return removeRememberedDeviceSessionsInternal({
    userId,
    getRememberedDeviceSessionStorageKey,
  });
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

function readTrustedDeviceUnlockRecord(userId: string): TrustedDeviceUnlockRecord | null {
  return readTrustedDeviceUnlockRecordInternal(userId);
}

function writeTrustedDeviceUnlockRecord(userId: string, record: TrustedDeviceUnlockRecord) {
  return writeTrustedDeviceUnlockRecordInternal(userId, record);
}

function removeTrustedDeviceUnlockRecord(userId: string) {
  return removeTrustedDeviceUnlockRecordInternal(userId);
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

function markPersistentRestoredOutboundGroupChats(userId: string, state: GroupSenderChainState) {
  const restoredChatIds = Object.keys(state.outboundChains);
  if (restoredChatIds.length === 0) {
    restoredPersistentOutboundGroupChatsByUserId.delete(userId);
    return;
  }

  restoredPersistentOutboundGroupChatsByUserId.set(userId, new Set(restoredChatIds));
}

function wasOutboundGroupSenderChainRestoredFromPersistent(userId: string, chatId: string) {
  return restoredPersistentOutboundGroupChatsByUserId.get(userId)?.has(chatId) ?? false;
}

function markOutboundGroupSenderChainAsReactivated(userId: string, chatId: string) {
  const restoredChatIds = restoredPersistentOutboundGroupChatsByUserId.get(userId);
  if (!restoredChatIds) {
    return;
  }

  restoredChatIds.delete(chatId);
  if (restoredChatIds.size === 0) {
    restoredPersistentOutboundGroupChatsByUserId.delete(userId);
  }
}

function clearPersistentRestoredOutboundGroupChats(userId: string) {
  restoredPersistentOutboundGroupChatsByUserId.delete(userId);
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

    return {
      ...parsedRecord,
      deviceVersion:
        typeof parsedRecord.deviceVersion === "string" ? parsedRecord.deviceVersion : null,
    } as PinnedDeviceBundleRecord;
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
  return createTrustedDeviceCredentialInternal({
    session,
    randomBytes,
    toArrayBuffer,
    rpId: getTrustedDeviceRpId(),
    rpName: TRUSTED_DEVICE_RP_NAME,
    textEncoder,
  });
}

async function deriveTrustedDeviceKey(credentialId: Uint8Array, prfSalt: Uint8Array) {
  return deriveTrustedDeviceKeyInternal({
    credentialId,
    prfSalt,
    rpId: getTrustedDeviceRpId(),
    randomBytes,
    toArrayBuffer,
    bytesToBase64Url,
  });
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
