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
    const clearInFlightMessageHydration = vi.fn();
    const removeUnlockedIdentityFromSession = vi.fn();
    const removeUnlockedIdentityFromPersistentStorage = vi.fn();
    const removeGroupHistoryKeys = vi.fn();
    const clearRecoverySnapshotSyncState = vi.fn();

    clearUnlockedEncryptionState({
      userId: "self",
      unlockedIdentityByUserId,
      clearInFlightMessageHydration,
      removeUnlockedIdentityFromSession,
      removeUnlockedIdentityFromPersistentStorage,
      removeGroupHistoryKeys,
      clearRecoverySnapshotSyncState,
    });

    expect(unlockedIdentityByUserId.has("self")).toBe(false);
    expect(unlockedIdentityByUserId.has("other")).toBe(true);
    expect(removeUnlockedIdentityFromSession).toHaveBeenCalledWith("self");
    expect(removeUnlockedIdentityFromPersistentStorage).toHaveBeenCalledWith("self");
    expect(removeGroupHistoryKeys).toHaveBeenCalledWith("self");
    expect(clearRecoverySnapshotSyncState).toHaveBeenCalledWith("self");
  });

  it("locks all in-memory encrypted state without clearing persistent unlocked identity storage", () => {
    const unlockedIdentityByUserId = new Map([
      ["self", { publicKey: "pub", privateKey: "priv" }],
      ["other", { publicKey: "pub2", privateKey: "priv2" }],
    ]);
    const clearInFlightMessageHydration = vi.fn();
    const removeUnlockedIdentityFromSession = vi.fn();
    const removeGroupHistoryKeys = vi.fn();
    const clearRecoverySnapshotSyncState = vi.fn();

    lockUnlockedEncryptionState({
      unlockedIdentityByUserId,
      clearInFlightMessageHydration,
      removeUnlockedIdentityFromSession,
      removeGroupHistoryKeys,
      clearRecoverySnapshotSyncState,
    });

    expect(unlockedIdentityByUserId.size).toBe(0);
    expect(removeUnlockedIdentityFromSession).toHaveBeenCalledTimes(2);
    expect(removeGroupHistoryKeys).toHaveBeenCalledTimes(2);
    expect(clearRecoverySnapshotSyncState).toHaveBeenCalledWith();
    expect(clearInFlightMessageHydration).toHaveBeenCalledWith();
  });
});
