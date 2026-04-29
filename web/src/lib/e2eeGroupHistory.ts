import { ApiError } from "./api";
import type { ApiChatMessage, GroupHistoryKeyAccess, UserEncryptionDeviceBundle } from "./types";
import type {
  GroupHistoryEnvelope,
  GroupHistoryKeyGrantPayload,
  GroupHistoryKeyRecord,
  GroupSharedEnvelope,
} from "./e2eeGroupEngine";

export function createLocalGroupHistoryKeyRecord(
  chatId: string,
  options: {
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
    createdAt,
    updatedAt: createdAt,
  };
}

export async function resolveGroupHistoryKeyRecordFromServer<OwnMaterial extends { deviceId: string }>(options: {
  token: string;
  userId: string;
  chatId: string;
  ownMaterial: OwnMaterial;
  getOwnGroupHistoryKeys: (
    token: string,
    chatId: string,
    deviceId: string
  ) => Promise<GroupHistoryKeyAccess[]>;
  decryptDirectRecipientEnvelopeContent: (
    wrappedKeyPayloadJson: string,
    userId: string,
    ownMaterial: OwnMaterial
  ) => Promise<string>;
  parseGroupHistoryKeyGrantPayload: (value: string) => GroupHistoryKeyGrantPayload;
  persistGroupHistoryKeyRecord: (userId: string, record: GroupHistoryKeyRecord) => Promise<void>;
}) {
  let latestRecord: GroupHistoryKeyRecord | null = null;
  const accesses = await options.getOwnGroupHistoryKeys(
    options.token,
    options.chatId,
    options.ownMaterial.deviceId
  );
  for (const access of accesses) {
    try {
      const decryptedPayload = await options.decryptDirectRecipientEnvelopeContent(
        access.wrappedKeyPayloadJson,
        options.userId,
        options.ownMaterial
      );
      const grantPayload = options.parseGroupHistoryKeyGrantPayload(decryptedPayload);
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
        createdAt: access.createdAt,
        updatedAt: access.updatedAt,
      };
      await options.persistGroupHistoryKeyRecord(options.userId, record);
      if (!latestRecord || Date.parse(record.updatedAt) >= Date.parse(latestRecord.updatedAt)) {
        latestRecord = record;
      }
    } catch {
      // Ignore malformed or undecryptable grants and keep checking other records.
    }
  }

  return latestRecord;
}

export async function buildGroupHistoryKeyAccessEnvelopes<OwnMaterial, SessionRecord>(options: {
  currentUserId: string;
  ownMaterial: OwnMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, SessionRecord>;
  historyKeyRecord: GroupHistoryKeyRecord;
  serializeGrantPayload: (record: GroupHistoryKeyRecord) => string;
  getDeviceSessionMapKey: (userId: string, deviceId: string) => string;
  establishInitiatorDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    bundle: UserEncryptionDeviceBundle
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  createDirectRecipientEnvelopeContent: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    sessionRecord: SessionRecord,
    content: string
  ) => Promise<unknown>;
}) {
  const serializedGrantPayload = options.serializeGrantPayload(options.historyKeyRecord);
  const wrappedEnvelopes = await Promise.all(
    options.targetBundles.map(async (bundle) => {
      const sessionRecord =
        options.nextSessions[options.getDeviceSessionMapKey(bundle.userId, bundle.deviceId)] ??
        (await options.establishInitiatorDeviceSession(
          options.currentUserId,
          options.ownMaterial,
          bundle
        ));
      options.setCurrentDeviceSessionRecord(options.nextSessions, sessionRecord);
      return [
        bundle.deviceId,
        JSON.stringify(
          await options.createDirectRecipientEnvelopeContent(
            options.currentUserId,
            options.ownMaterial,
            sessionRecord,
            serializedGrantPayload
          )
        ),
      ] as const;
    })
  );

  return Object.fromEntries(wrappedEnvelopes);
}

export async function upsertGroupHistoryKeyAccessForTargets<OwnMaterial, SessionRecord>(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  ownMaterial: OwnMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, SessionRecord>;
  historyKeyRecord: GroupHistoryKeyRecord;
  buildGroupHistoryKeyAccessEnvelopes: (
    args: {
      currentUserId: string;
      ownMaterial: OwnMaterial;
      targetBundles: UserEncryptionDeviceBundle[];
      nextSessions: Record<string, SessionRecord>;
      historyKeyRecord: GroupHistoryKeyRecord;
    }
  ) => Promise<Record<string, string>>;
  writeDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => void;
  rememberDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => Promise<void>;
  upsertGroupHistoryKey: (
    token: string,
    chatId: string,
    body: {
      historyKeyId: string;
      wrappedKeysByRecipientDeviceId: Record<string, string>;
    }
  ) => Promise<unknown>;
  persistGroupHistoryKeyRecord: (userId: string, record: GroupHistoryKeyRecord) => Promise<void>;
  now: () => string;
}) {
  const wrappedKeysByRecipientDeviceId = await options.buildGroupHistoryKeyAccessEnvelopes({
    currentUserId: options.currentUserId,
    ownMaterial: options.ownMaterial,
    targetBundles: options.targetBundles,
    nextSessions: options.nextSessions,
    historyKeyRecord: options.historyKeyRecord,
  });
  if (Object.keys(wrappedKeysByRecipientDeviceId).length === 0) {
    throw new ApiError("Encrypted chat is unavailable", 409);
  }

  options.writeDeviceSessions(options.currentUserId, options.nextSessions);
  await options.rememberDeviceSessions(options.currentUserId, options.nextSessions);
  await options.upsertGroupHistoryKey(options.token, options.chatId, {
    historyKeyId: options.historyKeyRecord.historyKeyId,
    wrappedKeysByRecipientDeviceId,
  });
  await options.persistGroupHistoryKeyRecord(options.currentUserId, {
    ...options.historyKeyRecord,
    updatedAt: options.now(),
  });
}

export async function ensureGroupHistoryKeyRecord<OwnMaterial, SessionRecord>(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  ownMaterial: OwnMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, SessionRecord>;
  readCurrentGroupHistoryKeyRecord: (
    userId: string,
    chatId: string
  ) => Promise<GroupHistoryKeyRecord | null>;
  resolveGroupHistoryKeyRecordFromServer: (
    token: string,
    userId: string,
    chatId: string,
    ownMaterial: OwnMaterial
  ) => Promise<GroupHistoryKeyRecord | null>;
  createLocalGroupHistoryKeyRecord: (chatId: string) => GroupHistoryKeyRecord;
  upsertGroupHistoryKeyAccessForTargets: (
    token: string,
    chatId: string,
    currentUserId: string,
    ownMaterial: OwnMaterial,
    targetBundles: UserEncryptionDeviceBundle[],
    nextSessions: Record<string, SessionRecord>,
    historyKeyRecord: GroupHistoryKeyRecord
  ) => Promise<void>;
  persistGroupHistoryKeyRecord: (userId: string, record: GroupHistoryKeyRecord) => Promise<void>;
}) {
  const localRecord = await options.readCurrentGroupHistoryKeyRecord(
    options.currentUserId,
    options.chatId
  );
  if (localRecord) {
    return localRecord;
  }

  const remoteRecord = await options.resolveGroupHistoryKeyRecordFromServer(
    options.token,
    options.currentUserId,
    options.chatId,
    options.ownMaterial
  );
  if (remoteRecord) {
    return remoteRecord;
  }

  const createdRecord = options.createLocalGroupHistoryKeyRecord(options.chatId);
  await options.upsertGroupHistoryKeyAccessForTargets(
    options.token,
    options.chatId,
    options.currentUserId,
    options.ownMaterial,
    options.targetBundles,
    options.nextSessions,
    createdRecord
  );
  await options.persistGroupHistoryKeyRecord(options.currentUserId, createdRecord);
  return createdRecord;
}

export function isRecoverableGroupHistoryFallbackError(error: unknown) {
  if (error instanceof ApiError) {
    return false;
  }

  // Group-history envelopes are an authenticated redundant transport for the
  // same group message. If direct distribution decryption failed for any
  // non-API reason, prefer the history envelope over surfacing an
  // unavailable-message placeholder.
  return error instanceof Error;
}

export async function decryptGroupHistoryMessage<
  OwnMaterial extends { deviceId: string },
  Session extends { token: string } | null,
>(options: {
  message: ApiChatMessage;
  userId: string;
  ownMaterial: OwnMaterial;
  sharedEnvelope: GroupSharedEnvelope;
  parseGroupHistoryEnvelope: (value: string) => GroupHistoryEnvelope;
  resolveLocalGroupHistoryKeyRecord: (
    userId: string,
    chatId: string,
    historyKeyId: string
  ) => Promise<GroupHistoryKeyRecord | null>;
  getRecoverySyncSession: (userId: string) => Promise<Session>;
  resolveGroupHistoryKeyRecordFromServer: (
    token: string,
    userId: string,
    chatId: string,
    ownMaterial: OwnMaterial
  ) => Promise<GroupHistoryKeyRecord | null>;
  decryptGroupHistoryEnvelopeContent: (
    historyEnvelope: GroupHistoryEnvelope,
    sharedEnvelope: GroupSharedEnvelope,
    historyKeyRecord: GroupHistoryKeyRecord
  ) => Promise<string>;
}) {
  if (!options.message.encryptedPayload?.historyEnvelope) {
    throw new Error("Encrypted group history envelope is not available");
  }

  const historyEnvelope = options.parseGroupHistoryEnvelope(
    options.message.encryptedPayload.historyEnvelope
  );
  let historyKeyRecord = await options.resolveLocalGroupHistoryKeyRecord(
    options.userId,
    options.sharedEnvelope.chatId,
    historyEnvelope.historyKeyId
  );
  if (!historyKeyRecord) {
    const session = await options.getRecoverySyncSession(options.userId);
    if (!session) {
      throw new Error("Encrypted group history key is not available for this device");
    }

    historyKeyRecord = await options.resolveGroupHistoryKeyRecordFromServer(
      session.token,
      options.userId,
      options.sharedEnvelope.chatId,
      options.ownMaterial
    );
  }
  if (!historyKeyRecord || historyKeyRecord.historyKeyId !== historyEnvelope.historyKeyId) {
    throw new Error("Encrypted group history key is not available for this message");
  }

  return options.decryptGroupHistoryEnvelopeContent(
    historyEnvelope,
    options.sharedEnvelope,
    historyKeyRecord
  );
}
