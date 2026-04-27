import { describe, expect, it, vi } from "vitest";

import {
  clearUnlockedEncryptionState,
  createLocalVaultIdentity,
  lockUnlockedEncryptionState,
} from "./e2eeLocalStateLifecycle";

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

describe("e2eeLocalStateLifecycle", () => {
  it("creates a local vault identity", () => {
    expect(
      createLocalVaultIdentity({
        bytesToBase64,
        randomBytes: (length) => new Uint8Array(length).fill(7),
      })
    ).toEqual({
      publicKey: "local-device-vault",
      privateKey: bytesToBase64(new Uint8Array(32).fill(7)),
    });
  });

  it("clears all local encrypted state for a single user", () => {
    const unlockedIdentityByUserId = new Map([
      ["self", { publicKey: "pub", privateKey: "priv" }],
      ["other", { publicKey: "pub2", privateKey: "priv2" }],
    ]);
    const importedDevicePublicKeyCache = new Map<string, Promise<CryptoKey>>();
    importedDevicePublicKeyCache.set("device", Promise.resolve({} as CryptoKey));
    const completedEncryptionDeviceRegistration = new Map([
      ["self", 1],
      ["other", 2],
    ]);
    const completedDevicePreparation = new Map([
      ["self:chat", 1],
      ["other:chat", 2],
    ]);
    const preparedConversationDeviceStates = new Map([["self:chat", {}]]);
    const completedOwnSiblingDevicePreparation = new Map([["self:sibling", 1]]);
    const preparedOwnSiblingDeviceStates = new Map([["self:sibling", {}]]);
    const clearInFlightMessageHydration = vi.fn();
    const removeUnlockedIdentityFromSession = vi.fn();
    const removeUnlockedIdentityFromPersistentStorage = vi.fn();
    const removeEncryptionDeviceMaterial = vi.fn();
    const removeRememberedEncryptionDeviceMaterial = vi.fn();
    const removeDeviceSessions = vi.fn();
    const removeRememberedDeviceSessions = vi.fn();
    const removeGroupSenderChains = vi.fn();
    const removeGroupHistoryKeys = vi.fn();
    const clearCompletedEncryptionDeviceRegistration = vi.fn();
    const clearCompletedDevicePreparation = vi.fn();
    const clearRecoverySnapshotSyncState = vi.fn();

    clearUnlockedEncryptionState({
      userId: "self",
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

    expect(unlockedIdentityByUserId.has("self")).toBe(false);
    expect(unlockedIdentityByUserId.has("other")).toBe(true);
    expect(removeUnlockedIdentityFromSession).toHaveBeenCalledWith("self");
    expect(removeUnlockedIdentityFromPersistentStorage).toHaveBeenCalledWith("self");
    expect(removeRememberedEncryptionDeviceMaterial).toHaveBeenCalledWith("self");
    expect(clearRecoverySnapshotSyncState).toHaveBeenCalledWith("self");
    expect(importedDevicePublicKeyCache.size).toBe(1);
  });

  it("locks all in-memory encrypted state without clearing persistent unlocked identity storage", () => {
    const unlockedIdentityByUserId = new Map([
      ["self", { publicKey: "pub", privateKey: "priv" }],
      ["other", { publicKey: "pub2", privateKey: "priv2" }],
    ]);
    const completedEncryptionDeviceRegistration = new Map([
      ["self", 1],
      ["other", 2],
    ]);
    const completedDevicePreparation = new Map([["self:chat", 1]]);
    const preparedConversationDeviceStates = new Map([["self:chat", {}]]);
    const completedOwnSiblingDevicePreparation = new Map([["self:sibling", 1]]);
    const preparedOwnSiblingDeviceStates = new Map([["self:sibling", {}]]);
    const clearInFlightMessageHydration = vi.fn();
    const removeUnlockedIdentityFromSession = vi.fn();
    const removeEncryptionDeviceMaterial = vi.fn();
    const removeDeviceSessions = vi.fn();
    const removeRememberedDeviceSessions = vi.fn();
    const removeGroupSenderChains = vi.fn();
    const removeGroupHistoryKeys = vi.fn();
    const clearCompletedEncryptionDeviceRegistration = vi.fn();
    const clearCompletedDevicePreparation = vi.fn();
    const clearRecoverySnapshotSyncState = vi.fn();

    lockUnlockedEncryptionState({
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

    expect(unlockedIdentityByUserId.size).toBe(0);
    expect(completedEncryptionDeviceRegistration.size).toBe(0);
    expect(completedDevicePreparation.size).toBe(0);
    expect(preparedConversationDeviceStates.size).toBe(0);
    expect(completedOwnSiblingDevicePreparation.size).toBe(0);
    expect(preparedOwnSiblingDeviceStates.size).toBe(0);
    expect(removeUnlockedIdentityFromSession).toHaveBeenCalledTimes(2);
    expect(removeEncryptionDeviceMaterial).toHaveBeenCalledTimes(2);
    expect(clearRecoverySnapshotSyncState).toHaveBeenCalledWith();
    expect(clearInFlightMessageHydration).toHaveBeenCalledWith();
  });
});
