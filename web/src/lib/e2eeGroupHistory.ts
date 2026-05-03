import type { GroupHistoryKeyAccess } from "./types";
import type {
  GroupHistoryKeyGrantPayload,
  GroupHistoryKeyRecord,
} from "./e2eeGroupEngine";

export function createLocalGroupHistoryKeyRecord(
  chatId: string,
  options: {
    membershipVersion: number;
    historyPolicy: GroupHistoryKeyGrantPayload["historyPolicy"];
    createHistoryKeyId: () => string;
    createKeyMaterial: () => string;
    now: () => string;
  }
): GroupHistoryKeyRecord {
  const createdAt = options.now();
  return {
    historyKeyId: options.createHistoryKeyId(),
    chatId,
    keyMaterial: options.createKeyMaterial(),
    membershipVersion: options.membershipVersion,
    historyPolicy: options.historyPolicy,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function resolveGroupHistoryKeyRecordFromServer(options: {
  token: string;
  userId: string;
  chatId: string;
  getOwnGroupHistoryKeys: (
    token: string,
    chatId: string,
    cursor?: string | null
  ) => Promise<GroupHistoryKeyAccess[]>;
  decryptHistoryKeyGrantPayload: (
    wrappedKeyPayloadJson: string,
    userId: string
  ) => Promise<string>;
  parseGroupHistoryKeyGrantPayload: (
    value: string
  ) => GroupHistoryKeyGrantPayload;
  persistGroupHistoryKeyRecord: (
    userId: string,
    record: GroupHistoryKeyRecord
  ) => Promise<void>;
  readGroupHistorySyncState?: (
    userId: string,
    chatId: string
  ) => Promise<{ cursor: string | null; fullySynced: boolean }>;
  writeGroupHistorySyncState?: (
    userId: string,
    chatId: string,
    state: { cursor: string | null; fullySynced: boolean }
  ) => Promise<void> | void;
}) {
  const currentSyncState = options.readGroupHistorySyncState
    ? await options.readGroupHistorySyncState(options.userId, options.chatId)
    : { cursor: null, fullySynced: false };
  const requestedCursor = currentSyncState.fullySynced
    ? currentSyncState.cursor
    : null;
  const accesses = await options.getOwnGroupHistoryKeys(
    options.token,
    options.chatId,
    requestedCursor
  );
  const resolvedRecord = await resolveGroupHistoryKeyRecordsFromAccesses(options, accesses);
  const nextCursor = buildGroupHistoryAccessCursor(accesses) ?? currentSyncState.cursor;
  const nextSyncState = {
    cursor: nextCursor ?? null,
    fullySynced: currentSyncState.fullySynced || requestedCursor === null,
  };
  if (
    options.writeGroupHistorySyncState &&
    (nextSyncState.cursor !== currentSyncState.cursor ||
      nextSyncState.fullySynced !== currentSyncState.fullySynced)
  ) {
    await options.writeGroupHistorySyncState(
      options.userId,
      options.chatId,
      nextSyncState
    );
  }
  return resolvedRecord;
}

export async function resolveActiveGroupHistoryKeyRecordFromServer(options: {
  token: string;
  userId: string;
  chatId: string;
  getOwnActiveGroupHistoryKey: (
    token: string,
    chatId: string
  ) => Promise<GroupHistoryKeyAccess>;
  decryptHistoryKeyGrantPayload: (
    wrappedKeyPayloadJson: string,
    userId: string
  ) => Promise<string>;
  parseGroupHistoryKeyGrantPayload: (
    value: string
  ) => GroupHistoryKeyGrantPayload;
  persistGroupHistoryKeyRecord: (
    userId: string,
    record: GroupHistoryKeyRecord
  ) => Promise<void>;
}) {
  const access = await options.getOwnActiveGroupHistoryKey(options.token, options.chatId);
  return resolveGroupHistoryKeyRecordsFromAccesses(options, access ? [access] : []);
}

export async function resolveGroupHistoryKeyRecordsFromAccesses(
  options: {
    userId: string;
    chatId: string;
    decryptHistoryKeyGrantPayload: (
      wrappedKeyPayloadJson: string,
      userId: string
    ) => Promise<string>;
    parseGroupHistoryKeyGrantPayload: (
      value: string
    ) => GroupHistoryKeyGrantPayload;
    persistGroupHistoryKeyRecord: (
      userId: string,
      record: GroupHistoryKeyRecord
    ) => Promise<void>;
  },
  accesses: GroupHistoryKeyAccess[]
) {
  const resolvedRecords: GroupHistoryKeyRecord[] = [];

  for (const access of accesses) {
    try {
      const decryptedPayload =
        access.serverGrantPayloadJson && access.serverGrantPayloadJson.trim()
          ? access.serverGrantPayloadJson
          : await options.decryptHistoryKeyGrantPayload(
              access.wrappedKeyPayloadJson,
              options.userId
            );
      const grantPayload = options.parseGroupHistoryKeyGrantPayload(
        decryptedPayload
      );
      if (
        grantPayload.chatId !== options.chatId ||
        grantPayload.historyKeyId !== access.historyKeyId
      ) {
        continue;
      }

      const record: GroupHistoryKeyRecord = {
        historyKeyId: grantPayload.historyKeyId,
        chatId: grantPayload.chatId,
        keyMaterial: grantPayload.historyKey,
        membershipVersion: grantPayload.membershipVersion,
        historyPolicy: grantPayload.historyPolicy,
        createdAt: grantPayload.createdAt,
        updatedAt: access.updatedAt,
      };
      resolvedRecords.push(record);
    } catch {
      // Ignore malformed or undecryptable grants and keep checking others.
    }
  }

  resolvedRecords.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.historyKeyId.localeCompare(right.historyKeyId);
  });
  for (const record of resolvedRecords) {
    await options.persistGroupHistoryKeyRecord(options.userId, record);
  }

  return resolvedRecords.at(-1) ?? null;
}

function buildGroupHistoryAccessCursor(accesses: GroupHistoryKeyAccess[]) {
  if (!accesses.length) {
    return null;
  }

  const latestAccess = accesses.reduce((latest, access) => {
    if (!latest) {
      return access;
    }
    if (access.updatedAt !== latest.updatedAt) {
      return access.updatedAt.localeCompare(latest.updatedAt) > 0 ? access : latest;
    }
    return access.historyKeyId.localeCompare(latest.historyKeyId) > 0
      ? access
      : latest;
  }, null as GroupHistoryKeyAccess | null);

  if (!latestAccess) {
    return null;
  }

  return `${latestAccess.updatedAt}|${latestAccess.historyKeyId}`;
}
