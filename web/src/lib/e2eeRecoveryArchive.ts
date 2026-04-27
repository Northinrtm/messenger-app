import type { ChatMessage, ChatMessageAttachment } from "./types";
import type { RememberedDecryptedMessageArchiveRecord } from "./e2eeMessageReadbackStore";

export type EncryptedRecoverySnapshotPayloadRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export type RecoverySnapshotPayload = {
  version: number;
  archivedMessages: RememberedDecryptedMessageArchiveRecord[];
};

type ArchivedDecryptedMessagePayload = {
  content: string;
  attachments?: ChatMessageAttachment[];
};

export async function encryptArchivedDecryptedMessage(options: {
  privateKey: string;
  message: Pick<ChatMessage, "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments">;
  kdfIterations: number;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (privateKey: string, salt: Uint8Array, iterations: number) => Promise<CryptoKey>;
  bytesToBase64: (value: Uint8Array) => string;
  normalizeAttachments: (value: unknown) => ChatMessageAttachment[];
  textEncoder: TextEncoder;
}) {
  const salt = options.randomBytes(16);
  const iv = options.randomBytes(12);
  const wrappingKey = await options.deriveWrappingKey(
    options.privateKey,
    salt,
    options.kdfIterations
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    wrappingKey,
    options.textEncoder.encode(
      JSON.stringify({
        content: options.message.content,
        attachments: options.normalizeAttachments(options.message.attachments ?? []),
      } satisfies ArchivedDecryptedMessagePayload)
    )
  );

  return {
    messageId: options.message.id,
    chatId: options.message.chatId,
    createdAt: options.message.createdAt,
    editedAt: options.message.editedAt,
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    archivedAt: new Date().toISOString(),
  } satisfies RememberedDecryptedMessageArchiveRecord;
}

export async function decryptArchivedDecryptedMessage(options: {
  privateKey: string;
  record: RememberedDecryptedMessageArchiveRecord;
  kdfIterations: number;
  deriveWrappingKey: (privateKey: string, salt: Uint8Array, iterations: number) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  normalizeAttachments: (value: unknown) => ChatMessageAttachment[];
  textDecoder: TextDecoder;
}) {
  try {
    const wrappingKey = await options.deriveWrappingKey(
      options.privateKey,
      options.base64ToBytes(options.record.salt),
      options.kdfIterations
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: options.base64ToBytes(options.record.iv) as BufferSource,
      },
      wrappingKey,
      options.base64ToBytes(options.record.ciphertext) as BufferSource
    );
    const payload = JSON.parse(options.textDecoder.decode(plaintext)) as Partial<ArchivedDecryptedMessagePayload>;
    if (typeof payload.content !== "string" || payload.content.length === 0) {
      return null;
    }

    return {
      content: payload.content,
      attachments: options.normalizeAttachments(payload.attachments ?? []),
    };
  } catch {
    return null;
  }
}

export function normalizeEncryptedRecoverySnapshotPayloadRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EncryptedRecoverySnapshotPayloadRecord>;
  if (
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
  } satisfies EncryptedRecoverySnapshotPayloadRecord;
}

export function normalizeRecoverySnapshotPayload(options: {
  value: unknown;
  normalizeArchivedDecryptedMessageRecord: (
    value: unknown
  ) => RememberedDecryptedMessageArchiveRecord | null;
}) {
  if (!options.value || typeof options.value !== "object") {
    return null;
  }

  const candidate = options.value as Partial<RecoverySnapshotPayload>;
  if (typeof candidate.version !== "number" || !Array.isArray(candidate.archivedMessages)) {
    return null;
  }

  const archivedMessages = candidate.archivedMessages
    .map((record) => options.normalizeArchivedDecryptedMessageRecord(record))
    .filter((record): record is RememberedDecryptedMessageArchiveRecord => record !== null);
  if (archivedMessages.length !== candidate.archivedMessages.length) {
    return null;
  }

  return {
    version: candidate.version,
    archivedMessages,
  } satisfies RecoverySnapshotPayload;
}

export async function encryptRecoverySnapshotPayload(options: {
  privateKey: string;
  archivedMessages: RememberedDecryptedMessageArchiveRecord[];
  recoverySnapshotPayloadVersion: number;
  kdfIterations: number;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (privateKey: string, salt: Uint8Array, iterations: number) => Promise<CryptoKey>;
  bytesToBase64: (value: Uint8Array) => string;
  sortArchivedDecryptedMessageRecords: (
    records: RememberedDecryptedMessageArchiveRecord[]
  ) => RememberedDecryptedMessageArchiveRecord[];
  textEncoder: TextEncoder;
}) {
  const salt = options.randomBytes(16);
  const iv = options.randomBytes(12);
  const wrappingKey = await options.deriveWrappingKey(
    options.privateKey,
    salt,
    options.kdfIterations
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    wrappingKey,
    options.textEncoder.encode(
      JSON.stringify({
        version: options.recoverySnapshotPayloadVersion,
        archivedMessages: options.sortArchivedDecryptedMessageRecords(options.archivedMessages),
      } satisfies RecoverySnapshotPayload)
    )
  );

  return {
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  } satisfies EncryptedRecoverySnapshotPayloadRecord;
}

export async function decryptRecoverySnapshotPayload(options: {
  privateKey: string;
  record: EncryptedRecoverySnapshotPayloadRecord;
  recoverySnapshotPayloadVersion: number;
  kdfIterations: number;
  deriveWrappingKey: (privateKey: string, salt: Uint8Array, iterations: number) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  normalizeArchivedDecryptedMessageRecord: (
    value: unknown
  ) => RememberedDecryptedMessageArchiveRecord | null;
  textDecoder: TextDecoder;
}) {
  try {
    const wrappingKey = await options.deriveWrappingKey(
      options.privateKey,
      options.base64ToBytes(options.record.salt),
      options.kdfIterations
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: options.base64ToBytes(options.record.iv) as BufferSource,
      },
      wrappingKey,
      options.base64ToBytes(options.record.ciphertext) as BufferSource
    );
    const payload = normalizeRecoverySnapshotPayload({
      value: JSON.parse(options.textDecoder.decode(plaintext)) as unknown,
      normalizeArchivedDecryptedMessageRecord: options.normalizeArchivedDecryptedMessageRecord,
    });
    if (!payload || payload.version !== options.recoverySnapshotPayloadVersion) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
