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
  importedDevicePublicKeyCache: Map<string, Promise<CryptoKey>>;
  completedEncryptionDeviceRegistration: Map<string, number>;
  completedDevicePreparation: Map<string, number>;
  preparedConversationDeviceStates: Map<string, unknown>;
  completedOwnSiblingDevicePreparation: Map<string, number>;
  preparedOwnSiblingDeviceStates: Map<string, unknown>;
  clearInFlightMessageHydration: (userId?: string) => void;
  removeUnlockedIdentityFromSession: (userId: string) => void;
  removeUnlockedIdentityFromPersistentStorage: (userId: string) => void;
  removeEncryptionDeviceMaterial: (userId: string) => void;
  removeRememberedEncryptionDeviceMaterial: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedEncryptionDeviceRegistration: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
  clearRecoverySnapshotSyncState: (userId?: string) => void;
}) {
  if (options.userId) {
    options.unlockedIdentityByUserId.delete(options.userId);
    options.clearInFlightMessageHydration(options.userId);
    options.removeUnlockedIdentityFromSession(options.userId);
    options.removeUnlockedIdentityFromPersistentStorage(options.userId);
    options.removeEncryptionDeviceMaterial(options.userId);
    options.removeRememberedEncryptionDeviceMaterial(options.userId);
    options.removeDeviceSessions(options.userId);
    options.removeRememberedDeviceSessions(options.userId);
    options.removeGroupSenderChains(options.userId);
    options.removeGroupHistoryKeys(options.userId);
    options.clearCompletedEncryptionDeviceRegistration(options.userId);
    options.clearCompletedDevicePreparation(options.userId);
    options.clearRecoverySnapshotSyncState(options.userId);
    return;
  }

  for (const currentUserId of options.unlockedIdentityByUserId.keys()) {
    options.clearInFlightMessageHydration(currentUserId);
    options.removeUnlockedIdentityFromSession(currentUserId);
    options.removeUnlockedIdentityFromPersistentStorage(currentUserId);
    options.removeEncryptionDeviceMaterial(currentUserId);
    options.removeRememberedEncryptionDeviceMaterial(currentUserId);
    options.removeDeviceSessions(currentUserId);
    options.removeRememberedDeviceSessions(currentUserId);
    options.removeGroupSenderChains(currentUserId);
    options.removeGroupHistoryKeys(currentUserId);
    options.clearCompletedEncryptionDeviceRegistration(currentUserId);
  }

  options.unlockedIdentityByUserId.clear();
  options.importedDevicePublicKeyCache.clear();
  options.completedEncryptionDeviceRegistration.clear();
  options.completedDevicePreparation.clear();
  options.preparedConversationDeviceStates.clear();
  options.completedOwnSiblingDevicePreparation.clear();
  options.preparedOwnSiblingDeviceStates.clear();
  options.clearRecoverySnapshotSyncState();
  options.clearInFlightMessageHydration();
}

export function lockUnlockedEncryptionState(options: {
  userId?: string;
  unlockedIdentityByUserId: Map<string, StoredLocalIdentity>;
  completedEncryptionDeviceRegistration: Map<string, number>;
  completedDevicePreparation: Map<string, number>;
  preparedConversationDeviceStates: Map<string, unknown>;
  completedOwnSiblingDevicePreparation: Map<string, number>;
  preparedOwnSiblingDeviceStates: Map<string, unknown>;
  clearInFlightMessageHydration: (userId?: string) => void;
  removeUnlockedIdentityFromSession: (userId: string) => void;
  removeEncryptionDeviceMaterial: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedEncryptionDeviceRegistration: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
  clearRecoverySnapshotSyncState: (userId?: string) => void;
}) {
  if (options.userId) {
    options.unlockedIdentityByUserId.delete(options.userId);
    options.clearInFlightMessageHydration(options.userId);
    options.removeUnlockedIdentityFromSession(options.userId);
    options.removeEncryptionDeviceMaterial(options.userId);
    options.removeDeviceSessions(options.userId);
    options.removeRememberedDeviceSessions(options.userId);
    options.removeGroupSenderChains(options.userId);
    options.removeGroupHistoryKeys(options.userId);
    options.clearCompletedEncryptionDeviceRegistration(options.userId);
    options.clearCompletedDevicePreparation(options.userId);
    options.clearRecoverySnapshotSyncState(options.userId);
    return;
  }

  for (const currentUserId of options.unlockedIdentityByUserId.keys()) {
    options.clearInFlightMessageHydration(currentUserId);
    options.removeUnlockedIdentityFromSession(currentUserId);
    options.removeEncryptionDeviceMaterial(currentUserId);
    options.removeDeviceSessions(currentUserId);
    options.removeRememberedDeviceSessions(currentUserId);
    options.removeGroupSenderChains(currentUserId);
    options.removeGroupHistoryKeys(currentUserId);
    options.clearCompletedEncryptionDeviceRegistration(currentUserId);
  }

  options.unlockedIdentityByUserId.clear();
  options.completedEncryptionDeviceRegistration.clear();
  options.completedDevicePreparation.clear();
  options.preparedConversationDeviceStates.clear();
  options.completedOwnSiblingDevicePreparation.clear();
  options.preparedOwnSiblingDeviceStates.clear();
  options.clearRecoverySnapshotSyncState();
  options.clearInFlightMessageHydration();
}
