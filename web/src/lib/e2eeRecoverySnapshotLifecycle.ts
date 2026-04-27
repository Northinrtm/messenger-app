import { ApiError } from "./api";
import type { AuthResponse, UserEncryptionRecoverySnapshot } from "./types";

type StoredLocalIdentity = {
  publicKey: string;
  privateKey: string;
};

type RememberedUnlockedIdentityRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type RecoverySnapshotUpload = {
  snapshotPayloadJson: string;
  wrappedIdentityRecordJson: string;
};

type ArchivedRecordLike = {
  messageId: string;
  archivedAt: string;
  editedAt?: string | null;
};

export function shouldReplaceArchivedDecryptedMessageRecord<T extends ArchivedRecordLike>(
  currentRecord: T | null | undefined,
  nextRecord: T
) {
  if (!currentRecord) {
    return true;
  }

  if (nextRecord.archivedAt !== currentRecord.archivedAt) {
    return nextRecord.archivedAt > currentRecord.archivedAt;
  }

  return (nextRecord.editedAt ?? "") > (currentRecord.editedAt ?? "");
}

export function mergeArchivedDecryptedMessageRecords<T extends ArchivedRecordLike>(
  baseRecords: T[],
  nextRecords: T[]
) {
  const mergedRecordsByMessageId = new Map(
    baseRecords.map((record) => [record.messageId, record] as const)
  );
  nextRecords.forEach((record) => {
    if (
      shouldReplaceArchivedDecryptedMessageRecord(
        mergedRecordsByMessageId.get(record.messageId),
        record
      )
    ) {
      mergedRecordsByMessageId.set(record.messageId, record);
    }
  });

  return Array.from(mergedRecordsByMessageId.values()).sort((left, right) => {
    if (left.archivedAt !== right.archivedAt) {
      return left.archivedAt.localeCompare(right.archivedAt);
    }

    return left.messageId.localeCompare(right.messageId);
  });
}

export async function syncEncryptionRecoverySnapshotInternal<T extends ArchivedRecordLike>(
  options: {
    session: AuthResponse;
    isBrowserEnvironment: () => boolean;
    hasUnlockedPrivateEncryptionKey: (userId: string) => boolean;
    readUnlockedIdentity: (userId: string) => StoredLocalIdentity | null;
    readRememberedUnlockedIdentityRecord: (
      userId: string
    ) => RememberedUnlockedIdentityRecord | null;
    readAllStoredArchivedDecryptedMessageRecords: (userId: string) => Promise<T[]>;
    readRemoteRecoverySnapshotArchivedMessages: (
      token: string,
      privateKey: string
    ) => Promise<T[]>;
    writeArchivedDecryptedMessageRecords: (userId: string, records: T[]) => Promise<void>;
    encryptRecoverySnapshotPayload: (
      privateKey: string,
      archivedMessages: T[]
    ) => Promise<unknown>;
    upsertOwnEncryptionRecoverySnapshot: (token: string, payload: RecoverySnapshotUpload) => Promise<unknown>;
  }
) {
  const userId = options.session.user.id;
  if (
    !options.isBrowserEnvironment() ||
    !options.hasUnlockedPrivateEncryptionKey(userId)
  ) {
    return;
  }

  const identity = options.readUnlockedIdentity(userId);
  const rememberedIdentityRecord = options.readRememberedUnlockedIdentityRecord(userId);
  if (!identity || !rememberedIdentityRecord) {
    return;
  }

  let archivedMessages = await options.readAllStoredArchivedDecryptedMessageRecords(userId);
  const remoteArchivedMessages = await options.readRemoteRecoverySnapshotArchivedMessages(
    options.session.token,
    identity.privateKey
  );
  if (remoteArchivedMessages.length > 0) {
    const localArchivedMessagesById = new Map(
      archivedMessages.map((record) => [record.messageId, record] as const)
    );
    const remoteUpdatesForLocalArchive = remoteArchivedMessages.filter((record) =>
      shouldReplaceArchivedDecryptedMessageRecord(
        localArchivedMessagesById.get(record.messageId),
        record
      )
    );
    if (remoteUpdatesForLocalArchive.length > 0) {
      await options.writeArchivedDecryptedMessageRecords(
        userId,
        remoteUpdatesForLocalArchive
      );
    }
    archivedMessages = mergeArchivedDecryptedMessageRecords(
      remoteArchivedMessages,
      archivedMessages
    );
  }

  const snapshotPayloadRecord = await options.encryptRecoverySnapshotPayload(
    identity.privateKey,
    archivedMessages
  );
  await options.upsertOwnEncryptionRecoverySnapshot(
    options.session.token,
    buildRecoverySnapshotUploadPayload({
      snapshotPayloadRecord,
      wrappedIdentityRecord: rememberedIdentityRecord,
    })
  );
}

export function buildRecoverySnapshotUploadPayload<SnapshotRecord>(options: {
  snapshotPayloadRecord: SnapshotRecord;
  wrappedIdentityRecord: RememberedUnlockedIdentityRecord;
}): RecoverySnapshotUpload {
  return {
    snapshotPayloadJson: JSON.stringify(options.snapshotPayloadRecord),
    wrappedIdentityRecordJson: JSON.stringify(options.wrappedIdentityRecord),
  };
}

export async function buildOwnRecoverySnapshotUpload<
  T extends ArchivedRecordLike,
  SnapshotRecord
>(options: {
  userId: string;
  readUnlockedIdentity: (userId: string) => StoredLocalIdentity | null;
  readRememberedUnlockedIdentityRecord: (
    userId: string
  ) => RememberedUnlockedIdentityRecord | null;
  readAllStoredArchivedDecryptedMessageRecords: (userId: string) => Promise<T[]>;
  encryptRecoverySnapshotPayload: (
    privateKey: string,
    archivedMessages: T[]
  ) => Promise<SnapshotRecord>;
}) {
  const identity = options.readUnlockedIdentity(options.userId);
  const rememberedIdentityRecord = options.readRememberedUnlockedIdentityRecord(options.userId);
  if (!identity || !rememberedIdentityRecord) {
    return null;
  }

  const archivedMessages = await options.readAllStoredArchivedDecryptedMessageRecords(
    options.userId
  );
  const snapshotPayloadRecord = await options.encryptRecoverySnapshotPayload(
    identity.privateKey,
    archivedMessages
  );
  return buildRecoverySnapshotUploadPayload({
    snapshotPayloadRecord,
    wrappedIdentityRecord: rememberedIdentityRecord,
  });
}

export async function restoreEncryptionRecoverySnapshot<
  T extends ArchivedRecordLike,
  SnapshotRecord
>(options: {
  session: AuthResponse;
  password: string;
  getOwnEncryptionRecoverySnapshot: (
    token: string
  ) => Promise<UserEncryptionRecoverySnapshot>;
  normalizeRememberedUnlockedIdentityRecord: (
    value: unknown
  ) => RememberedUnlockedIdentityRecord | null;
  normalizeEncryptedRecoverySnapshotPayloadRecord: (value: unknown) => SnapshotRecord | null;
  decryptRememberedUnlockedIdentityRecord: (
    record: RememberedUnlockedIdentityRecord,
    password: string
  ) => Promise<StoredLocalIdentity | null>;
  decryptRecoverySnapshotPayload: (
    privateKey: string,
    record: SnapshotRecord
  ) => Promise<{ archivedMessages: T[] } | null>;
  writeUnlockedIdentity: (userId: string, identity: StoredLocalIdentity) => void;
  writeRememberedUnlockedIdentityRecord: (
    userId: string,
    record: RememberedUnlockedIdentityRecord
  ) => void;
  writeArchivedDecryptedMessageRecords: (userId: string, records: T[]) => Promise<void>;
  encryptionRecoverySnapshotInvalidMessage: string;
  encryptionRecoveryPasswordRestoreFailedMessage: string;
  encryptionRecoveryPreviousPasswordRequiredMessage: string;
  encryptionRecoverySnapshotDecryptFailedMessage: string;
}) {
  let remoteSnapshot: UserEncryptionRecoverySnapshot;
  try {
    remoteSnapshot = await options.getOwnEncryptionRecoverySnapshot(options.session.token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  let wrappedIdentityRecord: RememberedUnlockedIdentityRecord | null = null;
  let snapshotPayloadRecord: SnapshotRecord | null = null;
  try {
    wrappedIdentityRecord = options.normalizeRememberedUnlockedIdentityRecord(
      JSON.parse(remoteSnapshot.wrappedIdentityRecordJson) as unknown
    );
    snapshotPayloadRecord = options.normalizeEncryptedRecoverySnapshotPayloadRecord(
      JSON.parse(remoteSnapshot.snapshotPayloadJson) as unknown
    );
  } catch {
    wrappedIdentityRecord = null;
    snapshotPayloadRecord = null;
  }

  if (!wrappedIdentityRecord || !snapshotPayloadRecord) {
    throw new ApiError(options.encryptionRecoverySnapshotInvalidMessage, 409);
  }

  const restoredIdentity = await options.decryptRememberedUnlockedIdentityRecord(
    wrappedIdentityRecord,
    options.password
  );
  if (!restoredIdentity) {
    const passwordVersion = Math.max(1, options.session.user.passwordVersion ?? 1);
    const wrappedPasswordVersion = Math.max(1, remoteSnapshot.wrappedPasswordVersion ?? 1);
    throw new ApiError(
      wrappedPasswordVersion < passwordVersion
        ? options.encryptionRecoveryPreviousPasswordRequiredMessage
        : options.encryptionRecoveryPasswordRestoreFailedMessage,
      409
    );
  }

  const snapshotPayload = await options.decryptRecoverySnapshotPayload(
    restoredIdentity.privateKey,
    snapshotPayloadRecord
  );
  if (!snapshotPayload) {
    throw new ApiError(options.encryptionRecoverySnapshotDecryptFailedMessage, 409);
  }

  options.writeUnlockedIdentity(options.session.user.id, restoredIdentity);
  options.writeRememberedUnlockedIdentityRecord(
    options.session.user.id,
    wrappedIdentityRecord
  );
  await options.writeArchivedDecryptedMessageRecords(
    options.session.user.id,
    snapshotPayload.archivedMessages
  );
  return restoredIdentity;
}
