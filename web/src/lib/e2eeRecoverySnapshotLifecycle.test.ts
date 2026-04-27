import { ApiError } from "./api";
import { describe, expect, it, vi } from "vitest";

import {
  mergeArchivedDecryptedMessageRecords,
  restoreEncryptionRecoverySnapshot,
  shouldReplaceArchivedDecryptedMessageRecord,
  syncEncryptionRecoverySnapshotInternal,
} from "./e2eeRecoverySnapshotLifecycle";

const session = {
  token: "token",
  user: {
    id: "self",
  },
} as const;

describe("e2eeRecoverySnapshotLifecycle", () => {
  it("replaces archived records only when remote is newer", () => {
    expect(
      shouldReplaceArchivedDecryptedMessageRecord(undefined, {
        messageId: "one",
        archivedAt: "2026-04-27T12:00:00.000Z",
      })
    ).toBe(true);

    expect(
      shouldReplaceArchivedDecryptedMessageRecord(
        {
          messageId: "one",
          archivedAt: "2026-04-27T12:00:00.000Z",
        },
        {
          messageId: "one",
          archivedAt: "2026-04-27T11:00:00.000Z",
        }
      )
    ).toBe(false);
  });

  it("merges archived records by message id", () => {
    expect(
      mergeArchivedDecryptedMessageRecords(
        [
          {
            messageId: "one",
            archivedAt: "2026-04-27T11:00:00.000Z",
          },
        ],
        [
          {
            messageId: "one",
            archivedAt: "2026-04-27T12:00:00.000Z",
          },
          {
            messageId: "two",
            archivedAt: "2026-04-27T13:00:00.000Z",
          },
        ]
      )
    ).toEqual([
      {
        messageId: "one",
        archivedAt: "2026-04-27T12:00:00.000Z",
      },
      {
        messageId: "two",
        archivedAt: "2026-04-27T13:00:00.000Z",
      },
    ]);
  });

  it("returns null when remote recovery snapshot is absent", async () => {
    await expect(
      restoreEncryptionRecoverySnapshot({
        session: session as never,
        password: "password",
        getOwnEncryptionRecoverySnapshot: vi.fn(async () => {
          throw new ApiError("Not found", 404);
        }),
        normalizeRememberedUnlockedIdentityRecord: vi.fn(),
        normalizeEncryptedRecoverySnapshotPayloadRecord: vi.fn(),
        decryptRememberedUnlockedIdentityRecord: vi.fn(),
        decryptRecoverySnapshotPayload: vi.fn(),
        writeUnlockedIdentity: vi.fn(),
        writeRememberedUnlockedIdentityRecord: vi.fn(),
        writeArchivedDecryptedMessageRecords: vi.fn(async () => {}),
        encryptionRecoverySnapshotInvalidMessage: "invalid",
        encryptionRecoveryPasswordRestoreFailedMessage: "password failed",
        encryptionRecoverySnapshotDecryptFailedMessage: "decrypt failed",
      })
    ).resolves.toBeNull();
  });

  it("syncs merged archived messages into remote recovery snapshot", async () => {
    const writeArchivedDecryptedMessageRecords = vi.fn(async () => {});
    const upsertOwnEncryptionRecoverySnapshot = vi.fn(async () => {});

    await syncEncryptionRecoverySnapshotInternal({
      session: session as never,
      isBrowserEnvironment: () => true,
      hasUnlockedPrivateEncryptionKey: () => true,
      readUnlockedIdentity: () => ({
        publicKey: "local-device-vault",
        privateKey: "vault-private",
      }),
      readRememberedUnlockedIdentityRecord: () => ({
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        createdAt: "2026-04-27T12:00:00.000Z",
      }),
      readAllStoredArchivedDecryptedMessageRecords: vi.fn(async () => [
        {
          messageId: "one",
          archivedAt: "2026-04-27T11:00:00.000Z",
        },
      ]),
      readRemoteRecoverySnapshotArchivedMessages: vi.fn(async () => [
        {
          messageId: "one",
          archivedAt: "2026-04-27T12:00:00.000Z",
        },
      ]),
      writeArchivedDecryptedMessageRecords,
      encryptRecoverySnapshotPayload: vi.fn(async (_privateKey, archivedMessages) => ({
        archivedMessages,
      })),
      upsertOwnEncryptionRecoverySnapshot,
    });

    expect(writeArchivedDecryptedMessageRecords).toHaveBeenCalledWith("self", [
      {
        messageId: "one",
        archivedAt: "2026-04-27T12:00:00.000Z",
      },
    ]);
    expect(upsertOwnEncryptionRecoverySnapshot).toHaveBeenCalledWith("token", {
      snapshotPayloadJson: JSON.stringify({
        archivedMessages: [
          {
            messageId: "one",
            archivedAt: "2026-04-27T12:00:00.000Z",
          },
        ],
      }),
      wrappedIdentityRecordJson: JSON.stringify({
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        createdAt: "2026-04-27T12:00:00.000Z",
      }),
    });
  });
});
