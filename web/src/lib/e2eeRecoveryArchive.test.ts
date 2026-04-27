import { describe, expect, it, vi } from "vitest";

import {
  decryptArchivedDecryptedMessage,
  decryptRecoverySnapshotPayload,
  encryptArchivedDecryptedMessage,
  encryptRecoverySnapshotPayload,
  normalizeEncryptedRecoverySnapshotPayloadRecord,
} from "./e2eeRecoveryArchive";
import type { ChatMessageAttachment } from "./types";

const normalizeAttachments = (value: unknown): ChatMessageAttachment[] =>
  Array.isArray(value) ? (value as ChatMessageAttachment[]) : [];

const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

describe("e2eeRecoveryArchive", () => {
  it("round-trips archived decrypted messages", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );

    const record = await encryptArchivedDecryptedMessage({
      privateKey: "private-key",
      message: {
        id: "message-id",
        chatId: "chat-id",
        content: "hello",
        createdAt: "2026-04-27T10:00:00.000Z",
        editedAt: null,
        attachments: [],
      },
      kdfIterations: 10,
      randomBytes: (length) => new Uint8Array(length).fill(1),
      deriveWrappingKey: async () => ({ } as CryptoKey),
      bytesToBase64,
      normalizeAttachments,
      textEncoder: new TextEncoder(),
    });

    await expect(
      decryptArchivedDecryptedMessage({
        privateKey: "private-key",
        record,
        kdfIterations: 10,
        deriveWrappingKey: async () => ({ } as CryptoKey),
        base64ToBytes,
        normalizeAttachments,
        textDecoder: new TextDecoder(),
      })
    ).resolves.toEqual({
      content: "hello",
      attachments: [],
    });
  });

  it("normalizes encrypted recovery snapshot payload records", () => {
    expect(
      normalizeEncryptedRecoverySnapshotPayloadRecord({
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
      })
    ).toEqual({
      salt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      createdAt: "",
    });
    expect(normalizeEncryptedRecoverySnapshotPayloadRecord({ salt: "salt" })).toBeNull();
  });

  it("round-trips encrypted recovery snapshots", async () => {
    vi.spyOn(window.crypto.subtle, "encrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );
    vi.spyOn(window.crypto.subtle, "decrypt").mockImplementation(
      async (_algorithm, _key, data) =>
        data instanceof Uint8Array ? data.buffer.slice(0) : new Uint8Array(data as ArrayBuffer).buffer
    );

    const snapshotRecord = await encryptRecoverySnapshotPayload({
      privateKey: "private-key",
      archivedMessages: [
        {
          messageId: "m1",
          chatId: "chat-id",
          createdAt: "2026-04-27T10:00:00.000Z",
          editedAt: null,
          salt: "s",
          iv: "i",
          ciphertext: "c",
          archivedAt: "2026-04-27T10:00:01.000Z",
        },
      ],
      recoverySnapshotPayloadVersion: 1,
      kdfIterations: 10,
      randomBytes: (length) => new Uint8Array(length).fill(2),
      deriveWrappingKey: async () => ({ } as CryptoKey),
      bytesToBase64,
      sortArchivedDecryptedMessageRecords: (records) => records,
      textEncoder: new TextEncoder(),
    });

    await expect(
      decryptRecoverySnapshotPayload({
        privateKey: "private-key",
        record: snapshotRecord,
        recoverySnapshotPayloadVersion: 1,
        kdfIterations: 10,
        deriveWrappingKey: async () => ({ } as CryptoKey),
        base64ToBytes,
        normalizeArchivedDecryptedMessageRecord: (value) =>
          value && typeof value === "object"
            ? (value as {
                messageId: string;
                chatId: string;
                createdAt: string;
                editedAt: string | null;
                salt: string;
                iv: string;
                ciphertext: string;
                archivedAt: string;
              })
            : null,
        textDecoder: new TextDecoder(),
      })
    ).resolves.toMatchObject({
      version: 1,
      archivedMessages: [{ messageId: "m1" }],
    });
  });
});
