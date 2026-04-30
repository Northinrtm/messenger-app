import { ApiError } from "./api";
import type { AuthResponse } from "./types";

type StoredLocalIdentity = {
  publicKey: string;
  privateKey: string;
  accountPublicKey?: string;
  accountPrivateKey?: string;
};

type EnsureEncryptionReadyOptions = {
  session: AuthResponse;
  password: string;
  ensureE2eeTransportStorageSchema: () => void;
  rememberRecoverySyncSession: (session: AuthResponse) => void;
  readUnlockedIdentity: (userId: string) => StoredLocalIdentity | null;
  rememberUnlockedIdentity: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<void>;
  ensureRegisteredEncryptionDevice: (session: AuthResponse) => Promise<void>;
  syncEncryptionRecoverySnapshot: (session: AuthResponse) => Promise<void>;
  readRememberedUnlockedIdentity: (
    userId: string,
    password: string
  ) => Promise<StoredLocalIdentity | null>;
  writeUnlockedIdentity: (userId: string, identity: StoredLocalIdentity) => void;
  ensureAccountKeyPair: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<StoredLocalIdentity>;
  restoreEncryptionRecoverySnapshot: (
    session: AuthResponse,
    password: string
  ) => Promise<StoredLocalIdentity | null>;
  listOwnEncryptionDevices: (token: string) => Promise<Array<unknown>>;
  createLocalVaultIdentity: () => StoredLocalIdentity;
  encryptionRecoveryExistingChatsMessage: string;
};

async function syncRecoverySnapshotBestEffort(
  session: AuthResponse,
  syncEncryptionRecoverySnapshot: (session: AuthResponse) => Promise<void>
) {
  try {
    await syncEncryptionRecoverySnapshot(session);
  } catch {
    return;
  }
}

export async function ensureEncryptionReady(
  options: EnsureEncryptionReadyOptions
) {
  options.ensureE2eeTransportStorageSchema();
  options.rememberRecoverySyncSession(options.session);

  const userId = options.session.user.id;
  const unlockedIdentity = options.readUnlockedIdentity(userId);
  if (unlockedIdentity) {
    const ensuredIdentity = await options.ensureAccountKeyPair(
      userId,
      unlockedIdentity,
      options.password
    );
    options.writeUnlockedIdentity(userId, ensuredIdentity);
    await options.rememberUnlockedIdentity(userId, ensuredIdentity, options.password);
    await options.ensureRegisteredEncryptionDevice(options.session);
    await syncRecoverySnapshotBestEffort(
      options.session,
      options.syncEncryptionRecoverySnapshot
    );
    return;
  }

  const rememberedIdentity = await options.readRememberedUnlockedIdentity(
    userId,
    options.password
  );
  if (rememberedIdentity) {
    const ensuredIdentity = await options.ensureAccountKeyPair(
      userId,
      rememberedIdentity,
      options.password
    );
    options.writeUnlockedIdentity(userId, ensuredIdentity);
    await options.rememberUnlockedIdentity(userId, ensuredIdentity, options.password);
    await options.ensureRegisteredEncryptionDevice(options.session);
    await syncRecoverySnapshotBestEffort(
      options.session,
      options.syncEncryptionRecoverySnapshot
    );
    return;
  }

  const restoredIdentity = await options.restoreEncryptionRecoverySnapshot(
    options.session,
    options.password
  );
  if (restoredIdentity) {
    const ensuredIdentity = await options.ensureAccountKeyPair(
      userId,
      restoredIdentity,
      options.password
    );
    options.writeUnlockedIdentity(userId, ensuredIdentity);
    await options.rememberUnlockedIdentity(userId, ensuredIdentity, options.password);
    await options.ensureRegisteredEncryptionDevice(options.session);
    await syncRecoverySnapshotBestEffort(
      options.session,
      options.syncEncryptionRecoverySnapshot
    );
    return;
  }

  const existingDevices = await options.listOwnEncryptionDevices(options.session.token);
  if (existingDevices.length > 0) {
    throw new ApiError(options.encryptionRecoveryExistingChatsMessage, 409);
  }

  const localVaultIdentity = options.createLocalVaultIdentity();
  const ensuredIdentity = await options.ensureAccountKeyPair(
    userId,
    localVaultIdentity,
    options.password
  );
  options.writeUnlockedIdentity(userId, ensuredIdentity);
  await options.rememberUnlockedIdentity(userId, ensuredIdentity, options.password);
  await options.ensureRegisteredEncryptionDevice(options.session);
  await syncRecoverySnapshotBestEffort(
    options.session,
    options.syncEncryptionRecoverySnapshot
  );
}

export async function resetEncryptionAfterPasswordReset(options: {
  session: AuthResponse;
  password: string;
  ensureE2eeTransportStorageSchema: () => void;
  clearUnlockedEncryptionState: (userId?: string) => void;
  removeTrustedDeviceUnlockRecord: (userId: string) => void;
  clearPinnedDeviceBundleRecords: (userId: string) => void;
  clearStoredArchivedDecryptedMessageRecords: (userId: string) => Promise<void>;
  rememberRecoverySyncSession: (session: AuthResponse) => void;
  createLocalVaultIdentity: () => StoredLocalIdentity;
  ensureAccountKeyPair: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<StoredLocalIdentity>;
  writeUnlockedIdentity: (userId: string, identity: StoredLocalIdentity) => void;
  rememberUnlockedIdentity: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<void>;
  ensureRegisteredEncryptionDevice: (session: AuthResponse) => Promise<void>;
  syncEncryptionRecoverySnapshot: (session: AuthResponse) => Promise<void>;
}) {
  if (!options.password.trim()) {
    throw new ApiError(
      "Enter your account password before resetting encrypted chats",
      400
    );
  }

  options.ensureE2eeTransportStorageSchema();
  const userId = options.session.user.id;

  options.clearUnlockedEncryptionState(userId);
  options.removeTrustedDeviceUnlockRecord(userId);
  options.clearPinnedDeviceBundleRecords(userId);
  await options.clearStoredArchivedDecryptedMessageRecords(userId);
  options.rememberRecoverySyncSession(options.session);

  const localVaultIdentity = options.createLocalVaultIdentity();
  const ensuredIdentity = await options.ensureAccountKeyPair(
    userId,
    localVaultIdentity,
    options.password
  );
  options.writeUnlockedIdentity(userId, ensuredIdentity);
  await options.rememberUnlockedIdentity(userId, ensuredIdentity, options.password);
  await options.ensureRegisteredEncryptionDevice(options.session);
  await options.syncEncryptionRecoverySnapshot(options.session);
}

export async function resecureLocalEncryptionStateForPasswordChange(options: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ensureE2eeTransportStorageSchema: () => void;
  readUnlockedIdentity: (userId: string) => StoredLocalIdentity | null;
  rememberUnlockedIdentity: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<void>;
  readRememberedUnlockedIdentity: (
    userId: string,
    password: string
  ) => Promise<StoredLocalIdentity | null>;
  writeUnlockedIdentity: (userId: string, identity: StoredLocalIdentity) => void;
  ensureAccountKeyPair: (
    userId: string,
    identity: StoredLocalIdentity,
    password: string
  ) => Promise<StoredLocalIdentity>;
}) {
  options.ensureE2eeTransportStorageSchema();

  const unlockedIdentity = options.readUnlockedIdentity(options.userId);
  if (unlockedIdentity) {
    const ensuredIdentity = await options.ensureAccountKeyPair(
      options.userId,
      unlockedIdentity,
      options.newPassword
    );
    options.writeUnlockedIdentity(options.userId, ensuredIdentity);
    await options.rememberUnlockedIdentity(
      options.userId,
      ensuredIdentity,
      options.newPassword
    );
    return;
  }

  const rememberedIdentity = await options.readRememberedUnlockedIdentity(
    options.userId,
    options.currentPassword
  );
  if (!rememberedIdentity) {
    throw new ApiError("Current password could not unlock encrypted chats", 400);
  }

  const ensuredIdentity = await options.ensureAccountKeyPair(
    options.userId,
    rememberedIdentity,
    options.newPassword
  );
  options.writeUnlockedIdentity(options.userId, ensuredIdentity);
  await options.rememberUnlockedIdentity(
    options.userId,
    ensuredIdentity,
    options.newPassword
  );
}
