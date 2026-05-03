import type { ApiChatMessage, ChatMessage, ChatMessageAttachment } from "./types";

export type RememberedDecryptedMessageArchiveRecord = {
  messageId: string;
  chatId: string;
  createdAt: string;
  editedAt: string | null;
  salt: string;
  iv: string;
  ciphertext: string;
  archivedAt: string;
};

export function createE2eeMessageReadbackStore(options: {
  decryptedMessageArchiveStoragePrefix: string;
  decryptedMessageArchiveDbName: string;
  decryptedMessageArchiveDbVersion: number;
  decryptedMessageArchiveStoreName: string;
  decryptedMessageArchiveChatIndexName: string;
}) {
  let decryptedMessageArchiveDbPromise: Promise<IDBDatabase> | null = null;

  function getDecryptedMessageArchiveStorageKey(userId: string) {
    return `${options.decryptedMessageArchiveStoragePrefix}${userId}`;
  }

  function normalizeArchivedDecryptedMessageRecord(
    value: unknown
  ): RememberedDecryptedMessageArchiveRecord | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Partial<RememberedDecryptedMessageArchiveRecord>;
    if (
      typeof candidate.messageId !== "string" ||
      typeof candidate.chatId !== "string" ||
      typeof candidate.createdAt !== "string" ||
      !(typeof candidate.editedAt === "string" || candidate.editedAt === null) ||
      typeof candidate.salt !== "string" ||
      typeof candidate.iv !== "string" ||
      typeof candidate.ciphertext !== "string"
    ) {
      return null;
    }

    return {
      messageId: candidate.messageId,
      chatId: candidate.chatId,
      createdAt: candidate.createdAt,
      editedAt: candidate.editedAt ?? null,
      salt: candidate.salt,
      iv: candidate.iv,
      ciphertext: candidate.ciphertext,
      archivedAt: typeof candidate.archivedAt === "string" ? candidate.archivedAt : candidate.createdAt,
    };
  }

  function sortArchivedDecryptedMessageRecords(records: RememberedDecryptedMessageArchiveRecord[]) {
    return [...records].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.messageId.localeCompare(right.messageId)
    );
  }

  function supportsIndexedDbDecryptedMessageArchive() {
    return typeof window !== "undefined" && typeof window.indexedDB?.open === "function";
  }

  async function openDecryptedMessageArchiveDb() {
    if (decryptedMessageArchiveDbPromise) {
      return decryptedMessageArchiveDbPromise;
    }

    decryptedMessageArchiveDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(
        options.decryptedMessageArchiveDbName,
        options.decryptedMessageArchiveDbVersion
      );

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(options.decryptedMessageArchiveStoreName)
          ? request.transaction?.objectStore(options.decryptedMessageArchiveStoreName) ?? null
          : db.createObjectStore(options.decryptedMessageArchiveStoreName, {
              keyPath: ["userId", "messageId"],
            });
        if (store && !store.indexNames.contains(options.decryptedMessageArchiveChatIndexName)) {
          store.createIndex(
            options.decryptedMessageArchiveChatIndexName,
            ["userId", "chatId", "createdAt"]
          );
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to open decrypted message archive"));
      request.onblocked = () => reject(new Error("Decrypted message archive is blocked"));
    }).catch((error) => {
      decryptedMessageArchiveDbPromise = null;
      throw error;
    });

    return decryptedMessageArchiveDbPromise;
  }

  function readLocalArchivedDecryptedMessageRecord(userId: string, messageId: string) {
    return readLocalArchivedDecryptedMessageMap(userId)[messageId] ?? null;
  }

  function readLocalArchivedDecryptedMessageRecords(userId: string) {
    return sortArchivedDecryptedMessageRecords(
      Object.values(readLocalArchivedDecryptedMessageMap(userId))
    );
  }

  function readLatestLocalArchivedDecryptedMessageRecord(userId: string, chatId: string) {
    const records = Object.values(readLocalArchivedDecryptedMessageMap(userId))
      .filter((record) => record.chatId === chatId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return records[0] ?? null;
  }

  function writeLocalArchivedDecryptedMessageRecords(
    userId: string,
    records: RememberedDecryptedMessageArchiveRecord[]
  ) {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const nextRecords = {
        ...readLocalArchivedDecryptedMessageMap(userId),
        ...Object.fromEntries(records.map((record) => [record.messageId, record])),
      };
      window.localStorage.setItem(
        getDecryptedMessageArchiveStorageKey(userId),
        JSON.stringify(nextRecords)
      );
    } catch {
      return;
    }
  }

  function clearLocalArchivedDecryptedMessageRecords(userId: string) {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.removeItem(getDecryptedMessageArchiveStorageKey(userId));
    } catch {
      return;
    }
  }

  function readLocalArchivedDecryptedMessageMap(userId: string) {
    if (typeof window === "undefined") {
      return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
    }

    try {
      const rawValue = window.localStorage.getItem(getDecryptedMessageArchiveStorageKey(userId));
      if (!rawValue) {
        return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
      }

      const parsedRecords = JSON.parse(rawValue) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsedRecords)
          .map(([messageId, value]) => {
            const normalizedRecord = normalizeArchivedDecryptedMessageRecord(value);
            return normalizedRecord ? [messageId, normalizedRecord] : null;
          })
          .filter((entry): entry is [string, RememberedDecryptedMessageArchiveRecord] => entry !== null)
      );
    } catch {
      return {} as Record<string, RememberedDecryptedMessageArchiveRecord>;
    }
  }

  async function writeArchivedDecryptedMessageRecord(
    userId: string,
    record: RememberedDecryptedMessageArchiveRecord
  ) {
    await writeArchivedDecryptedMessageRecords(userId, [record]);
  }

  async function writeArchivedDecryptedMessageRecords(
    userId: string,
    records: RememberedDecryptedMessageArchiveRecord[]
  ) {
    if (records.length === 0) {
      return;
    }

    if (supportsIndexedDbDecryptedMessageArchive()) {
      try {
        const db = await openDecryptedMessageArchiveDb();
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(options.decryptedMessageArchiveStoreName, "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Failed to write decrypted message archive entry"));
          const store = transaction.objectStore(options.decryptedMessageArchiveStoreName);
          records.forEach((record) => {
            store.put({
              userId,
              ...record,
            });
          });
        });
        return;
      } catch {
        // Fall back to localStorage below when IndexedDB is unavailable or blocked.
      }
    }

    writeLocalArchivedDecryptedMessageRecords(userId, records);
  }

  async function readStoredArchivedDecryptedMessageRecord(userId: string, messageId: string) {
    if (supportsIndexedDbDecryptedMessageArchive()) {
      try {
        const db = await openDecryptedMessageArchiveDb();
        const record = await new Promise<RememberedDecryptedMessageArchiveRecord | null>(
          (resolve, reject) => {
            const transaction = db.transaction(options.decryptedMessageArchiveStoreName, "readonly");
            transaction.onerror = () =>
              reject(transaction.error ?? new Error("Failed to read decrypted message archive entry"));
            const request = transaction
              .objectStore(options.decryptedMessageArchiveStoreName)
              .get([userId, messageId]);
            request.onsuccess = () => resolve(normalizeArchivedDecryptedMessageRecord(request.result));
            request.onerror = () =>
              reject(request.error ?? new Error("Failed to read decrypted message archive entry"));
          }
        );
        if (record) {
          return record;
        }
      } catch {
        // Fall back to localStorage below when IndexedDB is unavailable or blocked.
      }
    }

    return readLocalArchivedDecryptedMessageRecord(userId, messageId);
  }

  async function readAllStoredArchivedDecryptedMessageRecords(userId: string) {
    if (supportsIndexedDbDecryptedMessageArchive()) {
      try {
        const db = await openDecryptedMessageArchiveDb();
        return await new Promise<RememberedDecryptedMessageArchiveRecord[]>((resolve, reject) => {
          const transaction = db.transaction(options.decryptedMessageArchiveStoreName, "readonly");
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Failed to read decrypted message archive snapshot"));
          const store = transaction.objectStore(options.decryptedMessageArchiveStoreName);
          const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
          const request = store.openCursor(range);
          const records: RememberedDecryptedMessageArchiveRecord[] = [];
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              resolve(sortArchivedDecryptedMessageRecords(records));
              return;
            }

            const normalizedRecord = normalizeArchivedDecryptedMessageRecord(cursor.value);
            if (normalizedRecord) {
              records.push(normalizedRecord);
            }
            cursor.continue();
          };
          request.onerror = () =>
            reject(request.error ?? new Error("Failed to read decrypted message archive snapshot"));
        });
      } catch {
        // Fall back to localStorage below when IndexedDB is unavailable or blocked.
      }
    }

    return readLocalArchivedDecryptedMessageRecords(userId);
  }

  async function clearStoredArchivedDecryptedMessageRecords(userId: string) {
    if (supportsIndexedDbDecryptedMessageArchive()) {
      try {
        const db = await openDecryptedMessageArchiveDb();
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(options.decryptedMessageArchiveStoreName, "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Failed to clear decrypted message archive"));
          const store = transaction.objectStore(options.decryptedMessageArchiveStoreName);
          const range = IDBKeyRange.bound([userId, ""], [userId, "\uffff"]);
          const request = store.openCursor(range);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              return;
            }

            cursor.delete();
            cursor.continue();
          };
          request.onerror = () =>
            reject(request.error ?? new Error("Failed to clear decrypted message archive"));
        });
      } catch {
        // Fall back to clearing the localStorage mirror below.
      }
    }

    clearLocalArchivedDecryptedMessageRecords(userId);
  }

  async function readLatestStoredArchivedDecryptedMessageRecord(userId: string, chatId: string) {
    if (supportsIndexedDbDecryptedMessageArchive()) {
      try {
        const db = await openDecryptedMessageArchiveDb();
        const record = await new Promise<RememberedDecryptedMessageArchiveRecord | null>(
          (resolve, reject) => {
            const transaction = db.transaction(options.decryptedMessageArchiveStoreName, "readonly");
            transaction.onerror = () =>
              reject(transaction.error ?? new Error("Failed to read decrypted message archive preview"));
            const index = transaction
              .objectStore(options.decryptedMessageArchiveStoreName)
              .index(options.decryptedMessageArchiveChatIndexName);
            const range = IDBKeyRange.bound([userId, chatId, ""], [userId, chatId, "\uffff"]);
            const request = index.openCursor(range, "prev");
            request.onsuccess = () =>
              resolve(normalizeArchivedDecryptedMessageRecord(request.result?.value));
            request.onerror = () =>
              reject(request.error ?? new Error("Failed to read decrypted message archive preview"));
          }
        );
        if (record) {
          return record;
        }
      } catch {
        // Fall back to localStorage below when IndexedDB is unavailable or blocked.
      }
    }

    return readLatestLocalArchivedDecryptedMessageRecord(userId, chatId);
  }

  return {
    writeArchivedDecryptedMessageRecord,
    writeArchivedDecryptedMessageRecords,
    readStoredArchivedDecryptedMessageRecord,
    readAllStoredArchivedDecryptedMessageRecords,
    clearStoredArchivedDecryptedMessageRecords,
    readLatestStoredArchivedDecryptedMessageRecord,
    normalizeArchivedDecryptedMessageRecord,
    sortArchivedDecryptedMessageRecords,
  };
}
