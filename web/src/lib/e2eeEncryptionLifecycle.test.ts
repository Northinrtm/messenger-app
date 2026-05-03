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
    const syncEncryptionRecoverySnapshot = vi.fn(async () => {});
    const ensureAccountKeyPair = vi.fn(async (_userId, identity) => identity);

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
      syncEncryptionRecoverySnapshot,
      ensureAccountKeyPair,
      readRememberedUnlockedIdentity: vi.fn(async () => null),
      writeUnlockedIdentity: vi.fn(),
      restoreEncryptionRecoverySnapshot: vi.fn(async () => null),
      createLocalVaultIdentity: vi.fn(() => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      })),
    });

    expect(ensureE2eeTransportStorageSchema).toHaveBeenCalled();
    expect(rememberRecoverySyncSession).toHaveBeenCalledWith(session);
    expect(rememberUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "password");
    expect(ensureAccountKeyPair).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "password");
    expect(syncEncryptionRecoverySnapshot).toHaveBeenCalledWith(session);
  });

  it("creates a new local vault identity when nothing can be restored", async () => {
    const createLocalVaultIdentity = vi.fn(() => ({
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }));
    const writeUnlockedIdentity = vi.fn();
    const rememberUnlockedIdentity = vi.fn(async () => {});

    await ensureEncryptionReady({
      session: session as never,
      password: "password",
      ensureE2eeTransportStorageSchema: vi.fn(),
      rememberRecoverySyncSession: vi.fn(),
      readUnlockedIdentity: () => null,
      rememberUnlockedIdentity,
      syncEncryptionRecoverySnapshot: vi.fn(async () => {}),
      ensureAccountKeyPair: vi.fn(async (_userId, identity) => identity),
      readRememberedUnlockedIdentity: vi.fn(async () => null),
      writeUnlockedIdentity,
      restoreEncryptionRecoverySnapshot: vi.fn(async () => null),
      createLocalVaultIdentity,
    });

    expect(createLocalVaultIdentity).toHaveBeenCalled();
    expect(writeUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(rememberUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "password");
  });

  it("rejects empty password on reset", async () => {
    await expect(
      resetEncryptionAfterPasswordReset({
        session: session as never,
        password: "   ",
        ensureE2eeTransportStorageSchema: vi.fn(),
        clearUnlockedEncryptionState: vi.fn(),
        removeTrustedBrowserUnlockRecord: vi.fn(),
        clearStoredArchivedDecryptedMessageRecords: vi.fn(async () => {}),
        rememberRecoverySyncSession: vi.fn(),
        createLocalVaultIdentity: vi.fn(() => ({
          publicKey: "local-device-vault",
          privateKey: "vault-private",
        })),
        ensureAccountKeyPair: vi.fn(async (_userId, identity) => identity),
        writeUnlockedIdentity: vi.fn(),
        rememberUnlockedIdentity: vi.fn(async () => {}),
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
    const ensureAccountKeyPair = vi.fn(async (_userId, identity) => identity);

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
      ensureAccountKeyPair,
    });

    expect(writeUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    });
    expect(rememberUnlockedIdentity).toHaveBeenCalledWith("self", {
      publicKey: "local-device-vault",
      privateKey: "vault-private",
    }, "next");
    expect(ensureAccountKeyPair).toHaveBeenCalled();
  });
});
