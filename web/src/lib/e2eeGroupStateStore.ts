import type {
  GroupHistoryKeyRecord,
  GroupHistoryKeyState,
} from "./e2eeGroupEngine";

const GROUP_HISTORY_KEY_DB_NAME = "north-messenger-e2ee-group-history";
const GROUP_HISTORY_KEY_DB_VERSION = 1;
const GROUP_HISTORY_KEY_STORE_NAME = "states";
const groupHistoryKeyStateMemoryByUserId = new Map<string, GroupHistoryKeyState>();
const groupHistoryKeyPersistenceQueueByUserId = new Map<string, Promise<void>>();
let groupHistoryKeyDatabasePromise: Promise<IDBDatabase> | null = null;

export type EncryptedGroupHistoryKeyStateRecord = {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type PersistedGroupHistoryKeyStateRecord = {
  userId?: string;
  state?: unknown;
  encryptedState?: unknown;
};

function emptyGroupHistoryKeyState(): GroupHistoryKeyState {
  return {
    currentKeyIdsByChatId: {},
    syncCursorByChatId: {},
    fullySyncedChatIds: [],
    keysById: {},
  };
}

function normalizeGroupHistoryKeyRecord(
  value: unknown
): GroupHistoryKeyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyRecord>;
  if (
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.keyMaterial !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return parsed as GroupHistoryKeyRecord;
}

function normalizeGroupHistoryKeyState(
  value: unknown
): GroupHistoryKeyState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyState>;
  if (
    !parsed.currentKeyIdsByChatId ||
    typeof parsed.currentKeyIdsByChatId !== "object" ||
    Array.isArray(parsed.currentKeyIdsByChatId) ||
    !parsed.keysById ||
    typeof parsed.keysById !== "object" ||
    Array.isArray(parsed.keysById)
  ) {
    return null;
  }

  const currentKeyIdsByChatId = Object.fromEntries(
    Object.entries(parsed.currentKeyIdsByChatId).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
  const keysById = Object.fromEntries(
    Object.entries(parsed.keysById)
      .map(
        ([keyId, entry]) =>
          [keyId, normalizeGroupHistoryKeyRecord(entry)] as const
      )
      .filter(
        (entry): entry is [string, GroupHistoryKeyRecord] => entry[1] !== null
      )
  );
  const syncCursorByChatId =
    parsed.syncCursorByChatId &&
    typeof parsed.syncCursorByChatId === "object" &&
    !Array.isArray(parsed.syncCursorByChatId)
      ? Object.fromEntries(
          Object.entries(parsed.syncCursorByChatId).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string"
          )
        )
      : {};
  const fullySyncedChatIds = Array.isArray(parsed.fullySyncedChatIds)
    ? parsed.fullySyncedChatIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];

  return {
    currentKeyIdsByChatId: Object.fromEntries(
      Object.entries(currentKeyIdsByChatId).filter(([, keyId]) =>
        Boolean(keysById[keyId])
      )
    ),
    syncCursorByChatId,
    fullySyncedChatIds,
    keysById,
  };
}

function normalizeEncryptedGroupHistoryKeyStateRecord(
  value: unknown
): EncryptedGroupHistoryKeyStateRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<EncryptedGroupHistoryKeyStateRecord>;
  if (
    typeof candidate.version !== "number" ||
    !Number.isFinite(candidate.version) ||
    candidate.version < 1 ||
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    version: candidate.version,
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
  };
}

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof window.indexedDB?.open === "function";
}

function openGroupHistoryKeyDatabase() {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  if (!groupHistoryKeyDatabasePromise) {
    groupHistoryKeyDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(
        GROUP_HISTORY_KEY_DB_NAME,
        GROUP_HISTORY_KEY_DB_VERSION
      );

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(GROUP_HISTORY_KEY_STORE_NAME)) {
          database.createObjectStore(GROUP_HISTORY_KEY_STORE_NAME, {
            keyPath: "userId",
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to open group history key database"));
    }).catch((error) => {
      groupHistoryKeyDatabasePromise = null;
      throw error;
    });
  }

  return groupHistoryKeyDatabasePromise;
}

async function readPersistedGroupHistoryKeyState(userId: string) {
  const databasePromise = openGroupHistoryKeyDatabase();
  if (!databasePromise) {
    return null;
  }

  try {
    await groupHistoryKeyPersistenceQueueByUserId.get(userId);
    const database = await databasePromise;
    return await new Promise<PersistedGroupHistoryKeyStateRecord | null>((resolve, reject) => {
      const transaction = database.transaction(GROUP_HISTORY_KEY_STORE_NAME, "readonly");
      const request = transaction.objectStore(GROUP_HISTORY_KEY_STORE_NAME).get(userId);
      request.onsuccess = () => {
        resolve((request.result as PersistedGroupHistoryKeyStateRecord | undefined) ?? null);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read group history key state"));
    });
  } catch {
    return null;
  }
}

function enqueueGroupHistoryKeyPersistence(userId: string, operation: () => Promise<void>) {
  const previousOperation = groupHistoryKeyPersistenceQueueByUserId.get(userId) ?? Promise.resolve();
  const nextOperation = previousOperation
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      if (groupHistoryKeyPersistenceQueueByUserId.get(userId) === nextOperation) {
        groupHistoryKeyPersistenceQueueByUserId.delete(userId);
      }
    });
  groupHistoryKeyPersistenceQueueByUserId.set(userId, nextOperation);
  return nextOperation;
}

async function persistGroupHistoryKeyState(userId: string, state: GroupHistoryKeyState) {
  const databasePromise = openGroupHistoryKeyDatabase();
  if (!databasePromise) {
    return;
  }

  try {
    const database = await databasePromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GROUP_HISTORY_KEY_STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to persist group history key state"));
      transaction.objectStore(GROUP_HISTORY_KEY_STORE_NAME).put({
        userId,
        state,
      });
    });
  } catch {
    return;
  }
}

async function persistEncryptedGroupHistoryKeyState(
  userId: string,
  encryptedState: EncryptedGroupHistoryKeyStateRecord
) {
  const databasePromise = openGroupHistoryKeyDatabase();
  if (!databasePromise) {
    return;
  }

  try {
    const database = await databasePromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GROUP_HISTORY_KEY_STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("Failed to persist encrypted group history key state")
        );
      transaction.objectStore(GROUP_HISTORY_KEY_STORE_NAME).put({
        userId,
        encryptedState,
      } satisfies PersistedGroupHistoryKeyStateRecord);
    });
  } catch {
    return;
  }
}

async function removePersistedGroupHistoryKeyState(userId: string) {
  const databasePromise = openGroupHistoryKeyDatabase();
  if (!databasePromise) {
    return;
  }

  try {
    const database = await databasePromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GROUP_HISTORY_KEY_STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to remove group history key state"));
      transaction.objectStore(GROUP_HISTORY_KEY_STORE_NAME).delete(userId);
    });
  } catch {
    return;
  }
}

export async function readGroupHistoryKeyState(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
  removeGroupHistoryKeys: (userId: string) => void;
  decryptPersistedGroupHistoryKeyState?: (
    record: EncryptedGroupHistoryKeyStateRecord
  ) => Promise<unknown | null>;
}) {
  if (typeof window === "undefined") {
    return emptyGroupHistoryKeyState();
  }

  const inMemoryState = groupHistoryKeyStateMemoryByUserId.get(options.userId);
  if (inMemoryState) {
    return inMemoryState;
  }

  try {
    const persistedState = await readPersistedGroupHistoryKeyState(options.userId);
    let parsedState: GroupHistoryKeyState | null = null;
    const encryptedRecord = normalizeEncryptedGroupHistoryKeyStateRecord(
      persistedState?.encryptedState
    );
    if (encryptedRecord) {
      if (!options.decryptPersistedGroupHistoryKeyState) {
        return emptyGroupHistoryKeyState();
      }
      const decryptedState = await options.decryptPersistedGroupHistoryKeyState(
        encryptedRecord
      );
      parsedState = normalizeGroupHistoryKeyState(decryptedState);
      if (!parsedState) {
        return emptyGroupHistoryKeyState();
      }
    } else {
      parsedState = normalizeGroupHistoryKeyState(persistedState?.state ?? null);
    }
    if (parsedState) {
      groupHistoryKeyStateMemoryByUserId.set(options.userId, parsedState);
      return parsedState;
    }
  } catch {
    // Fall through to cleanup.
  }

  options.removeGroupHistoryKeys(options.userId);
  return emptyGroupHistoryKeyState();
}

export function writeGroupHistoryKeyState(options: {
  userId: string;
  state: GroupHistoryKeyState;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
  encryptPersistedGroupHistoryKeyState?: (
    state: GroupHistoryKeyState
  ) => Promise<EncryptedGroupHistoryKeyStateRecord | null>;
}) {
  void options.getGroupHistoryKeyStorageKey;
  groupHistoryKeyStateMemoryByUserId.set(options.userId, options.state);
  void enqueueGroupHistoryKeyPersistence(options.userId, async () => {
    const encryptedState = options.encryptPersistedGroupHistoryKeyState
      ? await options.encryptPersistedGroupHistoryKeyState(options.state)
      : null;
    if (encryptedState) {
      await persistEncryptedGroupHistoryKeyState(options.userId, encryptedState);
      return;
    }
    await persistGroupHistoryKeyState(options.userId, options.state);
  });
}

export function removeGroupHistoryKeys(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
}) {
  void options.getGroupHistoryKeyStorageKey;
  groupHistoryKeyStateMemoryByUserId.delete(options.userId);
  void enqueueGroupHistoryKeyPersistence(options.userId, () =>
    removePersistedGroupHistoryKeyState(options.userId)
  );
}

export async function clearCurrentGroupHistoryKeyRecord(options: {
  userId: string;
  chatId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
  writeGroupHistoryKeyState: (
    userId: string,
    state: GroupHistoryKeyState
  ) => void;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  if (!state.currentKeyIdsByChatId[options.chatId]) {
    return;
  }

  const nextCurrentKeyIdsByChatId = { ...state.currentKeyIdsByChatId };
  delete nextCurrentKeyIdsByChatId[options.chatId];
  options.writeGroupHistoryKeyState(options.userId, {
    currentKeyIdsByChatId: nextCurrentKeyIdsByChatId,
    syncCursorByChatId: state.syncCursorByChatId,
    fullySyncedChatIds: state.fullySyncedChatIds,
    keysById: state.keysById,
  });
}

export async function persistGroupHistoryKeyRecord(options: {
  userId: string;
  record: GroupHistoryKeyRecord;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
  writeGroupHistoryKeyState: (
    userId: string,
    state: GroupHistoryKeyState
  ) => void;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  options.writeGroupHistoryKeyState(options.userId, {
    currentKeyIdsByChatId: {
      ...state.currentKeyIdsByChatId,
      [options.record.chatId]: options.record.historyKeyId,
    },
    syncCursorByChatId: {
      ...state.syncCursorByChatId,
      [options.record.chatId]: advanceSyncCursor(
        state.syncCursorByChatId[options.record.chatId] ?? null,
        options.record.updatedAt,
        options.record.historyKeyId
      ),
    },
    fullySyncedChatIds: state.fullySyncedChatIds,
    keysById: {
      ...state.keysById,
      [options.record.historyKeyId]: options.record,
    },
  });
}

export async function resolveLocalGroupHistoryKeyRecord(options: {
  userId: string;
  chatId: string;
  historyKeyId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  const record = state.keysById[options.historyKeyId] ?? null;
  if (record && record.chatId === options.chatId) {
    return record;
  }

  return null;
}

export async function readCurrentGroupHistoryKeyRecord(options: {
  userId: string;
  chatId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  const currentKeyId = state.currentKeyIdsByChatId[options.chatId];
  if (!currentKeyId) {
    return null;
  }

  const record = state.keysById[currentKeyId] ?? null;
  return record?.chatId === options.chatId ? record : null;
}

export async function readGroupHistorySyncState(options: {
  userId: string;
  chatId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  return {
    cursor: state.syncCursorByChatId[options.chatId] ?? null,
    fullySynced: state.fullySyncedChatIds.includes(options.chatId),
  };
}

export async function writeGroupHistorySyncState(options: {
  userId: string;
  chatId: string;
  cursor: string | null;
  fullySynced: boolean;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
  writeGroupHistoryKeyState: (
    userId: string,
    state: GroupHistoryKeyState
  ) => void;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  const nextSyncCursorByChatId = { ...state.syncCursorByChatId };
  if (options.cursor) {
    nextSyncCursorByChatId[options.chatId] = options.cursor;
  } else {
    delete nextSyncCursorByChatId[options.chatId];
  }
  const nextFullySyncedChatIds = options.fullySynced
    ? Array.from(new Set([...state.fullySyncedChatIds, options.chatId]))
    : state.fullySyncedChatIds.filter((chatId) => chatId !== options.chatId);
  options.writeGroupHistoryKeyState(options.userId, {
    currentKeyIdsByChatId: state.currentKeyIdsByChatId,
    syncCursorByChatId: nextSyncCursorByChatId,
    fullySyncedChatIds: nextFullySyncedChatIds,
    keysById: state.keysById,
  });
}

function advanceSyncCursor(
  currentCursor: string | null,
  updatedAt: string,
  historyKeyId: string
) {
  if (!currentCursor) {
    return `${updatedAt}|${historyKeyId}`;
  }

  const separatorIndex = currentCursor.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= currentCursor.length - 1) {
    return `${updatedAt}|${historyKeyId}`;
  }

  const currentUpdatedAt = currentCursor.slice(0, separatorIndex);
  const currentHistoryKeyId = currentCursor.slice(separatorIndex + 1);
  if (updatedAt !== currentUpdatedAt) {
    return updatedAt.localeCompare(currentUpdatedAt) > 0
      ? `${updatedAt}|${historyKeyId}`
      : currentCursor;
  }

  return historyKeyId.localeCompare(currentHistoryKeyId) > 0
    ? `${updatedAt}|${historyKeyId}`
    : currentCursor;
}
