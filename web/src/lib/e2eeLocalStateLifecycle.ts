type StoredLocalIdentity = {
  publicKey: string;
  privateKey: string;
};

export function createLocalVaultIdentity(options: {
  bytesToBase64: (bytes: Uint8Array) => string;
  randomBytes: (length: number) => Uint8Array;
}) {
  return {
    publicKey: "local-device-vault",
    privateKey: options.bytesToBase64(options.randomBytes(32)),
  } satisfies StoredLocalIdentity;
}

export function clearUnlockedEncryptionState(options: {
  userId?: string;
  unlockedIdentityByUserId: Map<string, StoredLocalIdentity>;
  clearInFlightMessageHydration: (userId?: string) => void;
  removeUnlockedIdentityFromSession: (userId: string) => void;
  removeUnlockedIdentityFromPersistentStorage: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearRecoverySnapshotSyncState: (userId?: string) => void;
}) {
  if (options.userId) {
    options.unlockedIdentityByUserId.delete(options.userId);
    options.clearInFlightMessageHydration(options.userId);
    options.removeUnlockedIdentityFromSession(options.userId);
    options.removeUnlockedIdentityFromPersistentStorage(options.userId);
    options.removeGroupHistoryKeys(options.userId);
    options.clearRecoverySnapshotSyncState(options.userId);
    return;
  }

  for (const currentUserId of options.unlockedIdentityByUserId.keys()) {
    options.clearInFlightMessageHydration(currentUserId);
    options.removeUnlockedIdentityFromSession(currentUserId);
    options.removeUnlockedIdentityFromPersistentStorage(currentUserId);
    options.removeGroupHistoryKeys(currentUserId);
  }

  options.unlockedIdentityByUserId.clear();
  options.clearRecoverySnapshotSyncState();
  options.clearInFlightMessageHydration();
}

export function lockUnlockedEncryptionState(options: {
  userId?: string;
  unlockedIdentityByUserId: Map<string, StoredLocalIdentity>;
  clearInFlightMessageHydration: (userId?: string) => void;
  removeUnlockedIdentityFromSession: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearRecoverySnapshotSyncState: (userId?: string) => void;
}) {
  if (options.userId) {
    options.unlockedIdentityByUserId.delete(options.userId);
    options.clearInFlightMessageHydration(options.userId);
    options.removeUnlockedIdentityFromSession(options.userId);
    options.removeGroupHistoryKeys(options.userId);
    options.clearRecoverySnapshotSyncState(options.userId);
    return;
  }

  for (const currentUserId of options.unlockedIdentityByUserId.keys()) {
    options.clearInFlightMessageHydration(currentUserId);
    options.removeUnlockedIdentityFromSession(currentUserId);
    options.removeGroupHistoryKeys(currentUserId);
  }

  options.unlockedIdentityByUserId.clear();
  options.clearRecoverySnapshotSyncState();
  options.clearInFlightMessageHydration();
}
