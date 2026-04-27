import { describe, expect, it, vi } from "vitest";

import {
  ensureEncryptionReady,
  resetEncryptionAfterPasswordReset,
  resecureLocalEncryptionStateForPasswordChange,
} from "./e2eeEncryptionLifecycle";

const session = {
  token: "token",
  user: {
    id: "self",
  },
} as const;

describe("e2eeEncryptionLifecycle", () => {
  it("uses unlocked identity when available", async () => {
    const ensureE2eeTransportStorageSchema = vi.fn();
    const rememberRecoverySyncSession = vi.fn();
    const rememberUnlockedIdentity = vi.fn(async () => {});
    const ensureRegisteredEncryptionDevice = vi.fn(async () => {});
    const syncEncryptionRecoverySnapshot = vi.fn(async () => {});

    await ensureEncryptionReady({
      session: session as never,
      password: "password",
      ensureE2eeTransportStorageSchema,
      rememberRecoverySyncSession,
      readUnlockedIdentity: () => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      }),
      rememberUnlockedIdentity,
      ensureRegisteredEncryptionDevice,
      syncEncryptionRecoverySnapshot,
      readRememberedUnlockedIdentity: vi.fn(async () => null),
      writeUnlockedIdentity: vi.fn(),
      restoreEncryptionRecoverySnapshot: vi.fn(async () => null),
      listOwnEncryptionDevices: vi.fn(async () => []),
      createLocalVaultIdentity: vi.fn(() => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      })),
      encryptionRecoveryExistingChatsMessage: "existing",
    });

    expect(ensureE2eeTransportStorageSchema).toHaveBeenCalled();
    expect(rememberRecoverySyncSession).toHaveBeenCalledWith(session);
    expect(rememberUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "password");
    expect(ensureRegisteredEncryptionDevice).toHaveBeenCalledWith(session);
    expect(syncEncryptionRecoverySnapshot).toHaveBeenCalledWith(session);
  });

  it("throws when existing encrypted devices are present and no identity can be restored", async () => {
    await expect(
      ensureEncryptionReady({
        session: session as never,
        password: "password",
        ensureE2eeTransportStorageSchema: vi.fn(),
        rememberRecoverySyncSession: vi.fn(),
        readUnlockedIdentity: () => null,
        rememberUnlockedIdentity: vi.fn(async () => {}),
        ensureRegisteredEncryptionDevice: vi.fn(async () => {}),
        syncEncryptionRecoverySnapshot: vi.fn(async () => {}),
        readRememberedUnlockedIdentity: vi.fn(async () => null),
        writeUnlockedIdentity: vi.fn(),
        restoreEncryptionRecoverySnapshot: vi.fn(async () => null),
        listOwnEncryptionDevices: vi.fn(async () => [{ id: "device" }]),
        createLocalVaultIdentity: vi.fn(() => ({
          publicKey: "local-device-vault",
          privateKey: "vault-private",
        })),
        encryptionRecoveryExistingChatsMessage: "existing encrypted chats",
      })
    ).rejects.toMatchObject({
      message: "existing encrypted chats",
      status: 409,
    });
  });

  it("rejects empty password on reset", async () => {
    await expect(
      resetEncryptionAfterPasswordReset({
        session: session as never,
        password: "   ",
        ensureE2eeTransportStorageSchema: vi.fn(),
        clearUnlockedEncryptionState: vi.fn(),
        removeTrustedDeviceUnlockRecord: vi.fn(),
        clearPinnedDeviceBundleRecords: vi.fn(),
        clearStoredArchivedDecryptedMessageRecords: vi.fn(async () => {}),
        rememberRecoverySyncSession: vi.fn(),
        createLocalVaultIdentity: vi.fn(() => ({
          publicKey: "local-device-vault",
          privateKey: "vault-private",
        })),
        writeUnlockedIdentity: vi.fn(),
        rememberUnlockedIdentity: vi.fn(async () => {}),
        ensureRegisteredEncryptionDevice: vi.fn(async () => {}),
        syncEncryptionRecoverySnapshot: vi.fn(async () => {}),
      })
    ).rejects.toMatchObject({
      message: "Enter your account password before resetting encrypted chats",
      status: 400,
    });
  });

  it("resecures with remembered identity when unlocked identity is absent", async () => {
    const writeUnlockedIdentity = vi.fn();
    const rememberUnlockedIdentity = vi.fn(async () => {});

    await resecureLocalEncryptionStateForPasswordChange({
      userId: "self",
      currentPassword: "current",
      newPassword: "next",
      ensureE2eeTransportStorageSchema: vi.fn(),
      readUnlockedIdentity: () => null,
      rememberUnlockedIdentity,
      readRememberedUnlockedIdentity: vi.fn(async () => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      })),
      writeUnlockedIdentity,
    });

    expect(writeUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(rememberUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "next");
  });
});
