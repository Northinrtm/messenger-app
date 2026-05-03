import type {
  GroupHistoryKeyRecord,
  GroupHistoryKeyState,
} from "./e2eeGroupEngine";

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

export async function readGroupHistoryKeyState(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
  removeGroupHistoryKeys: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return {
      currentKeyIdsByChatId: {},
      syncCursorByChatId: {},
      fullySyncedChatIds: [],
      keysById: {},
    } satisfies GroupHistoryKeyState;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      options.getGroupHistoryKeyStorageKey(options.userId)
    );
    if (!rawValue) {
      return {
        currentKeyIdsByChatId: {},
        syncCursorByChatId: {},
        fullySyncedChatIds: [],
        keysById: {},
      } satisfies GroupHistoryKeyState;
    }

    const parsedState = normalizeGroupHistoryKeyState(
      JSON.parse(rawValue) as unknown
    );
    if (parsedState) {
      return parsedState;
    }
  } catch {
    // Fall through to cleanup.
  }

  options.removeGroupHistoryKeys(options.userId);
  return {
    currentKeyIdsByChatId: {},
    syncCursorByChatId: {},
    fullySyncedChatIds: [],
    keysById: {},
  } satisfies GroupHistoryKeyState;
}

export function writeGroupHistoryKeyState(options: {
  userId: string;
  state: GroupHistoryKeyState;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      options.getGroupHistoryKeyStorageKey(options.userId),
      JSON.stringify(options.state)
    );
  } catch {
    return;
  }
}

export function removeGroupHistoryKeys(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      options.getGroupHistoryKeyStorageKey(options.userId)
    );
  } catch {
    return;
  }
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
