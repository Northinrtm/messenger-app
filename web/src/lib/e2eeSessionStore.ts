type SessionRecordLike = {
  sessionId: string;
  peerUserId: string;
  peerDeviceId: string;
  ownMaterialId: string;
  establishedAt: string;
};

type CompatibleSessionRecordLike = SessionRecordLike & {
  remoteIdentityKey: string;
  remoteIdentitySignatureKey: string;
  remoteSignedPrekeyId: number;
  remoteOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  cachedMessageKeys?: Record<string, string>;
};

type DirectEnvelopeLike = {
  senderUserId: string;
  senderDeviceId: string;
  senderIdentityKey: string;
  senderIdentitySignatureKey: string;
  recipientSignedPrekeyId: number;
  recipientOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  ratchetPublicKey: string;
  messageCounter: number;
};

export function getDeviceSessionMapKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

export function getDeviceSessionArchivePrefix(userId: string, deviceId: string) {
  return `${getDeviceSessionMapKey(userId, deviceId)}:archive:`;
}

export function getDeviceSessionArchiveKey(userId: string, deviceId: string, sessionId: string) {
  return `${getDeviceSessionArchivePrefix(userId, deviceId)}${sessionId}`;
}

export function listCurrentDeviceSessionKeys<SessionRecord>(
  sessions: Record<string, SessionRecord>
) {
  return Object.keys(sessions).filter((key) => !key.includes(":archive:"));
}

export function markPersistentRestoredCurrentDeviceSessions<SessionRecord>(
  restoredPersistentKeys: Map<string, Set<string>>,
  userId: string,
  sessions: Record<string, SessionRecord>
) {
  const restoredKeys = listCurrentDeviceSessionKeys(sessions);
  if (restoredKeys.length === 0) {
    restoredPersistentKeys.delete(userId);
    return;
  }

  restoredPersistentKeys.set(userId, new Set(restoredKeys));
}

export function wasCurrentDeviceSessionRestoredFromPersistent(
  restoredPersistentKeys: Map<string, Set<string>>,
  userId: string,
  peerUserId: string,
  peerDeviceId: string
) {
  return (
    restoredPersistentKeys
      .get(userId)
      ?.has(getDeviceSessionMapKey(peerUserId, peerDeviceId)) ?? false
  );
}

export function markCurrentDeviceSessionAsReactivated(
  restoredPersistentKeys: Map<string, Set<string>>,
  userId: string,
  peerUserId: string,
  peerDeviceId: string
) {
  const restoredKeys = restoredPersistentKeys.get(userId);
  if (!restoredKeys) {
    return;
  }

  restoredKeys.delete(getDeviceSessionMapKey(peerUserId, peerDeviceId));
  if (restoredKeys.size === 0) {
    restoredPersistentKeys.delete(userId);
  }
}

export function clearPersistentRestoredCurrentDeviceSessions(
  restoredPersistentKeys: Map<string, Set<string>>,
  userId: string
) {
  restoredPersistentKeys.delete(userId);
}

export function filterDeviceSessionsForOwnMaterial<
  SessionRecord extends Pick<SessionRecordLike, "ownMaterialId">
>(sessions: Record<string, SessionRecord>, ownMaterialId: string) {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => session.ownMaterialId === ownMaterialId)
  );
}

export function pruneArchivedDeviceSessions<
  SessionRecord extends Pick<SessionRecordLike, "establishedAt">
>(
  sessions: Record<string, SessionRecord>,
  userId: string,
  deviceId: string,
  maxArchivedSessionsPerPeerDevice: number
) {
  const archivePrefix = getDeviceSessionArchivePrefix(userId, deviceId);
  const archivedEntries = Object.entries(sessions)
    .filter(([key]) => key.startsWith(archivePrefix))
    .sort((left, right) => right[1].establishedAt.localeCompare(left[1].establishedAt));

  archivedEntries
    .slice(maxArchivedSessionsPerPeerDevice)
    .forEach(([key]) => {
      delete sessions[key];
    });
}

export function setCurrentDeviceSessionRecord<
  SessionRecord extends Pick<
    SessionRecordLike,
    "sessionId" | "peerUserId" | "peerDeviceId" | "establishedAt"
  >,
>(
  sessions: Record<string, SessionRecord>,
  sessionRecord: SessionRecord,
  maxArchivedSessionsPerPeerDevice: number
) {
  const currentKey = getDeviceSessionMapKey(sessionRecord.peerUserId, sessionRecord.peerDeviceId);
  const existingCurrent = sessions[currentKey];
  if (existingCurrent && existingCurrent.sessionId !== sessionRecord.sessionId) {
    sessions[
      getDeviceSessionArchiveKey(
        existingCurrent.peerUserId,
        existingCurrent.peerDeviceId,
        existingCurrent.sessionId
      )
    ] = existingCurrent;
  }

  sessions[currentKey] = sessionRecord;
  pruneArchivedDeviceSessions(
    sessions,
    sessionRecord.peerUserId,
    sessionRecord.peerDeviceId,
    maxArchivedSessionsPerPeerDevice
  );
}

export function listDeviceSessionEntriesForPeer<
  SessionRecord extends Pick<SessionRecordLike, "establishedAt">
>(sessions: Record<string, SessionRecord>, userId: string, deviceId: string) {
  const currentKey = getDeviceSessionMapKey(userId, deviceId);
  const archivePrefix = getDeviceSessionArchivePrefix(userId, deviceId);
  return Object.entries(sessions)
    .filter(([key]) => key === currentKey || key.startsWith(archivePrefix))
    .sort((left, right) => {
      if (left[0] === currentKey && right[0] !== currentKey) {
        return -1;
      }
      if (right[0] === currentKey && left[0] !== currentKey) {
        return 1;
      }
      return right[1].establishedAt.localeCompare(left[1].establishedAt);
    });
}

export function isDeviceSessionCompatibleWithDirectEnvelope<
  SessionRecord extends CompatibleSessionRecordLike,
  DirectEnvelope extends DirectEnvelopeLike,
>(sessionRecord: SessionRecord, envelope: DirectEnvelope) {
  return (
    sessionRecord.remoteIdentityKey === envelope.senderIdentityKey &&
    sessionRecord.remoteIdentitySignatureKey === envelope.senderIdentitySignatureKey &&
    sessionRecord.remoteSignedPrekeyId === envelope.recipientSignedPrekeyId &&
    (envelope.recipientOneTimePrekeyId === null ||
      sessionRecord.remoteOneTimePrekeyId === envelope.recipientOneTimePrekeyId) &&
    sessionRecord.initiatorEphemeralPublicKey === envelope.initiatorEphemeralPublicKey
  );
}

export function findDeviceSessionEntryForEnvelope<
  SessionRecord extends CompatibleSessionRecordLike,
  DirectEnvelope extends DirectEnvelopeLike,
>(
  sessions: Record<string, SessionRecord>,
  envelope: DirectEnvelope,
  options: {
    currentUserId: string;
    currentDeviceId: string;
    buildSessionMessageCacheKey: (
      direction: "send" | "recv",
      ratchetPublicKey: string,
      messageCounter: number
    ) => string;
    resolveReceivingChain: (sessionRecord: SessionRecord, ratchetPublicKey: string) => unknown | null;
  }
) {
  const sessionEntries = listDeviceSessionEntriesForPeer(
    sessions,
    envelope.senderUserId,
    envelope.senderDeviceId
  );
  if (sessionEntries.length === 0) {
    return null;
  }

  const isOwnEnvelope =
    envelope.senderUserId === options.currentUserId &&
    envelope.senderDeviceId === options.currentDeviceId;
  if (isOwnEnvelope) {
    const cachedOwnSendMessageKey = options.buildSessionMessageCacheKey(
      "send",
      envelope.ratchetPublicKey,
      envelope.messageCounter
    );
    const archivedOwnSession = sessionEntries.find(([, session]) =>
      Boolean(session.cachedMessageKeys?.[cachedOwnSendMessageKey])
    );
    if (archivedOwnSession) {
      return archivedOwnSession;
    }

    return sessionEntries[0] ?? null;
  }

  const compatibleSessionEntries = sessionEntries.filter(([, session]) =>
    isDeviceSessionCompatibleWithDirectEnvelope(session, envelope)
  );
  if (compatibleSessionEntries.length === 0) {
    return null;
  }

  const cachedIncomingMessageKey = options.buildSessionMessageCacheKey(
    "recv",
    envelope.ratchetPublicKey,
    envelope.messageCounter
  );
  return (
    compatibleSessionEntries.find(([, session]) =>
      Boolean(session.cachedMessageKeys?.[cachedIncomingMessageKey])
    ) ??
    compatibleSessionEntries.find(([, session]) =>
      Boolean(options.resolveReceivingChain(session, envelope.ratchetPublicKey))
    ) ??
    compatibleSessionEntries[0] ??
    null
  );
}

export function sanitizeStoredDeviceSessions<
  SessionRecord extends Pick<SessionRecordLike, "peerUserId" | "peerDeviceId" | "establishedAt">
>(sessions: Record<string, SessionRecord>, maxArchivedSessionsPerPeerDevice: number) {
  let changed = false;
  const nextSessions = { ...sessions };
  const peerDeviceKeys = new Set(
    Object.values(nextSessions).map((session) => `${session.peerUserId}\u0000${session.peerDeviceId}`)
  );

  peerDeviceKeys.forEach((peerDeviceKey) => {
    const [peerUserId, peerDeviceId] = peerDeviceKey.split("\u0000");
    const beforeCount = Object.keys(nextSessions).length;
    pruneArchivedDeviceSessions(
      nextSessions,
      peerUserId ?? "",
      peerDeviceId ?? "",
      maxArchivedSessionsPerPeerDevice
    );
    if (Object.keys(nextSessions).length !== beforeCount) {
      changed = true;
    }
  });

  return changed ? nextSessions : sessions;
}
