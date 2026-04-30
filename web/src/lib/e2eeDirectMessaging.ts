import type {
  ApiChatMessage,
  EncryptedMessagePayload,
  Participant,
  UserEncryptionDeviceBundle,
} from "./types";
import type { ConversationDeviceBundleResolution } from "./e2eeDeviceDirectory";

export type DirectDeviceEnvelope = {
  aadVersion: number;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  senderIdentityKey: string;
  senderIdentitySignatureKey: string;
  initiatorEphemeralPublicKey: string;
  ratchetPublicKey: string;
  recipientSignedPrekeyId: number;
  recipientOneTimePrekeyId: number | null;
  messageCounter: number;
  ciphertext: string;
  iv: string;
};

type DirectEnvelopeOwnMaterialLike = {
  deviceId: string | null;
  identityKey: string;
  identitySignatureKey: string;
};

type DirectSessionRecordLike = {
  peerDeviceId: string;
  remoteSignedPrekeyId: number;
  remoteOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  sendingRatchetPublicKey: string;
  sendingCounter: number;
  remoteRatchetPublicKey: string | null;
  pendingSendingRatchetStep: boolean;
  sendingRatchetUsed: boolean;
};

type DirectDecryptOwnMaterialLike = {
  deviceId: string;
};

type DirectDecryptSessionLike = {
  remoteRatchetPublicKey: string | null;
};

export function shouldIncludeBootstrapOneTimePrekey<
  SessionRecord extends Pick<
    DirectSessionRecordLike,
    | "remoteOneTimePrekeyId"
    | "sendingCounter"
    | "remoteRatchetPublicKey"
    | "pendingSendingRatchetStep"
    | "sendingRatchetUsed"
  >,
>(sessionRecord: SessionRecord, messageCounter: number) {
  return (
    sessionRecord.remoteOneTimePrekeyId !== null &&
    messageCounter === 0 &&
    sessionRecord.sendingCounter === 1 &&
    sessionRecord.remoteRatchetPublicKey === null &&
    !sessionRecord.pendingSendingRatchetStep &&
    !sessionRecord.sendingRatchetUsed
  );
}

export function buildDirectEnvelopeAdditionalData(
  envelope: Omit<DirectDeviceEnvelope, "ciphertext">,
  textEncoder: TextEncoder
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      recipientDeviceId: envelope.recipientDeviceId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderIdentityKey: envelope.senderIdentityKey,
      senderIdentitySignatureKey: envelope.senderIdentitySignatureKey,
      initiatorEphemeralPublicKey: envelope.initiatorEphemeralPublicKey,
      ratchetPublicKey: envelope.ratchetPublicKey,
      recipientSignedPrekeyId: envelope.recipientSignedPrekeyId,
      recipientOneTimePrekeyId: envelope.recipientOneTimePrekeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
    })
  );
}

export function parseDirectDeviceEnvelope(
  value: string,
  directEnvelopeAadVersion: number
): DirectDeviceEnvelope {
  const parsed = JSON.parse(value) as Partial<DirectDeviceEnvelope>;
  if (
    parsed.aadVersion !== directEnvelopeAadVersion ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.recipientDeviceId !== "string" ||
    typeof parsed.senderIdentityKey !== "string" ||
    typeof parsed.senderIdentitySignatureKey !== "string" ||
    typeof parsed.initiatorEphemeralPublicKey !== "string" ||
    typeof parsed.ratchetPublicKey !== "string" ||
    typeof parsed.recipientSignedPrekeyId !== "number" ||
    !(typeof parsed.recipientOneTimePrekeyId === "number" || parsed.recipientOneTimePrekeyId === null) ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string"
  ) {
    throw new Error("Malformed direct encrypted envelope");
  }

  return parsed as DirectDeviceEnvelope;
}

export function shouldReestablishResponderDeviceSession<
  SessionRecord extends Pick<
    DirectSessionRecordLike & {
      remoteIdentityKey: string;
      remoteIdentitySignatureKey: string;
      initiatorEphemeralPublicKey: string;
    },
    | "remoteIdentityKey"
    | "remoteIdentitySignatureKey"
    | "remoteSignedPrekeyId"
    | "remoteOneTimePrekeyId"
    | "initiatorEphemeralPublicKey"
  >,
>(sessionRecord: SessionRecord, envelope: DirectDeviceEnvelope) {
  return (
    sessionRecord.remoteIdentityKey !== envelope.senderIdentityKey ||
    sessionRecord.remoteIdentitySignatureKey !== envelope.senderIdentitySignatureKey ||
    sessionRecord.remoteSignedPrekeyId !== envelope.recipientSignedPrekeyId ||
    (envelope.recipientOneTimePrekeyId !== null &&
      sessionRecord.remoteOneTimePrekeyId !== envelope.recipientOneTimePrekeyId) ||
    sessionRecord.initiatorEphemeralPublicKey !== envelope.initiatorEphemeralPublicKey
  );
}

export async function createDirectRecipientEnvelopeContent<
  OwnMaterial extends DirectEnvelopeOwnMaterialLike,
  SessionRecord extends DirectSessionRecordLike,
>(options: {
  senderUserId: string;
  ownMaterial: OwnMaterial;
  sessionRecord: SessionRecord;
  content: string;
  directEnvelopeAadVersion: number;
  createInitializingError: () => Error;
  randomBytes: (length: number) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
  applyOutgoingDhRatchet: (sessionRecord: SessionRecord) => Promise<void>;
  advanceSendingChain: (
    sessionRecord: SessionRecord
  ) => Promise<{ messageCounter: number; messageKey: Uint8Array }>;
  encryptEnvelopeCiphertext: (
    envelopeMetadata: Omit<DirectDeviceEnvelope, "ciphertext">,
    messageKeyBytes: Uint8Array,
    content: string,
    iv: Uint8Array
  ) => Promise<string>;
}) {
  if (!options.ownMaterial.deviceId) {
    throw options.createInitializingError();
  }

  if (
    options.sessionRecord.pendingSendingRatchetStep &&
    options.sessionRecord.remoteRatchetPublicKey
  ) {
    await options.applyOutgoingDhRatchet(options.sessionRecord);
  }

  const ratchetStep = await options.advanceSendingChain(options.sessionRecord);
  const iv = options.randomBytes(12);
  const envelopeMetadata: Omit<DirectDeviceEnvelope, "ciphertext"> = {
    aadVersion: options.directEnvelopeAadVersion,
    senderUserId: options.senderUserId,
    senderDeviceId: options.ownMaterial.deviceId,
    recipientDeviceId: options.sessionRecord.peerDeviceId,
    senderIdentityKey: options.ownMaterial.identityKey,
    senderIdentitySignatureKey: options.ownMaterial.identitySignatureKey,
    initiatorEphemeralPublicKey: options.sessionRecord.initiatorEphemeralPublicKey,
    ratchetPublicKey: options.sessionRecord.sendingRatchetPublicKey,
    recipientSignedPrekeyId: options.sessionRecord.remoteSignedPrekeyId,
    recipientOneTimePrekeyId: shouldIncludeBootstrapOneTimePrekey(
      options.sessionRecord,
      ratchetStep.messageCounter
    )
      ? options.sessionRecord.remoteOneTimePrekeyId
      : null,
    messageCounter: ratchetStep.messageCounter,
    iv: options.bytesToBase64(iv),
  };

  return {
    ...envelopeMetadata,
    ciphertext: await options.encryptEnvelopeCiphertext(
      envelopeMetadata,
      ratchetStep.messageKey,
      options.content,
      iv
    ),
  } satisfies DirectDeviceEnvelope;
}

export async function decryptDirectRecipientEnvelope<
  OwnMaterial extends DirectDecryptOwnMaterialLike,
  SessionRecord extends DirectDecryptSessionLike,
>(options: {
  serializedEnvelope: string;
  userId: string;
  ownMaterial: OwnMaterial;
  directEnvelopeAadVersion: number;
  parseDirectDeviceEnvelope?: (
    value: string,
    directEnvelopeAadVersion: number
  ) => DirectDeviceEnvelope;
  assertTrustedDirectSender: (envelope: DirectDeviceEnvelope) => Promise<void>;
  readDeviceSessions: (userId: string) => Promise<Record<string, SessionRecord>>;
  getDeviceSessionMapKey: (userId: string, deviceId: string) => string;
  findDeviceSessionEntryForEnvelope: (
    sessions: Record<string, SessionRecord>,
    envelope: DirectDeviceEnvelope,
    options: { currentUserId: string; currentDeviceId: string }
  ) => [string, SessionRecord] | null;
  establishResponderDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    envelope: DirectDeviceEnvelope
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  persistOwnMaterial?: (userId: string, ownMaterial: OwnMaterial) => Promise<void>;
  resolveReceivingChain: (
    sessionRecord: SessionRecord,
    ratchetPublicKey: string
  ) => unknown | null;
  applyIncomingDhRatchet: (
    sessionRecord: SessionRecord,
    remoteRatchetPublicKey: string
  ) => Promise<void>;
  getEnvelopeMessageKey: (
    sessionRecord: SessionRecord,
    envelope: DirectDeviceEnvelope,
    currentUserId: string,
    currentDeviceId: string
  ) => Promise<Uint8Array>;
  writeDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => void;
  rememberDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => Promise<void>;
  decryptEnvelopeCiphertext: (
    envelope: DirectDeviceEnvelope,
    messageKeyBytes: Uint8Array
  ) => Promise<string>;
}) {
  const parseEnvelope = options.parseDirectDeviceEnvelope ?? parseDirectDeviceEnvelope;
  const envelope = parseEnvelope(
    options.serializedEnvelope,
    options.directEnvelopeAadVersion
  );
  if (envelope.recipientDeviceId !== options.ownMaterial.deviceId) {
    throw new Error("Encrypted device envelope is not addressed to this device");
  }
  await options.assertTrustedDirectSender(envelope);

  const sessions = await options.readDeviceSessions(options.userId);
  const sessionKey = options.getDeviceSessionMapKey(
    envelope.senderUserId,
    envelope.senderDeviceId
  );
  const selectedSessionEntry = options.findDeviceSessionEntryForEnvelope(
    sessions,
    envelope,
    {
      currentUserId: options.userId,
      currentDeviceId: options.ownMaterial.deviceId,
    }
  );
  let sessionStorageKey = selectedSessionEntry?.[0] ?? sessionKey;
  let sessionRecord = selectedSessionEntry?.[1] ?? null;
  if (!sessionRecord) {
    sessionRecord = await options.establishResponderDeviceSession(
      options.userId,
      options.ownMaterial,
      envelope
    );
    options.setCurrentDeviceSessionRecord(sessions, sessionRecord);
    sessionStorageKey = sessionKey;
    await options.persistOwnMaterial?.(options.userId, options.ownMaterial);
  }

  if (
    envelope.senderUserId !== options.userId &&
    envelope.senderDeviceId !== options.ownMaterial.deviceId &&
    sessionRecord.remoteRatchetPublicKey !== envelope.ratchetPublicKey &&
    !options.resolveReceivingChain(sessionRecord, envelope.ratchetPublicKey)
  ) {
    await options.applyIncomingDhRatchet(sessionRecord, envelope.ratchetPublicKey);
  }
  const messageKeyBytes = await options.getEnvelopeMessageKey(
    sessionRecord,
    envelope,
    options.userId,
    options.ownMaterial.deviceId
  );
  sessions[sessionStorageKey] = sessionRecord;
  options.writeDeviceSessions(options.userId, sessions);
  await options.rememberDeviceSessions(options.userId, sessions);

  return {
    content: await options.decryptEnvelopeCiphertext(envelope, messageKeyBytes),
    envelope,
  };
}

export async function decryptDirectMessage<
  OwnMaterial extends DirectDecryptOwnMaterialLike,
>(options: {
  message: Pick<ApiChatMessage, "chatId" | "sender" | "encryptedPayload">;
  userId: string;
  readOwnMaterial: (userId: string) => Promise<OwnMaterial | null>;
  isOwnMaterialAvailable: (material: OwnMaterial | null) => material is OwnMaterial;
  decryptDirectRecipientEnvelope: (
    serializedEnvelope: string,
    userId: string,
    ownMaterial: OwnMaterial
  ) => Promise<{ content: string }>;
  decryptDirectHistoryMessage?: (
    message: Pick<ApiChatMessage, "chatId" | "sender" | "encryptedPayload">,
    userId: string,
    ownMaterial: OwnMaterial
  ) => Promise<string>;
  isRecoverableHistoryFallbackError?: (error: unknown) => boolean;
}) {
  const payload = options.message.encryptedPayload;
  if (!payload) {
    throw new Error("Encrypted direct payload is not available");
  }
  const ownMaterial = await options.readOwnMaterial(options.userId);
  if (!options.isOwnMaterialAvailable(ownMaterial)) {
    throw new Error("Encrypted device session is not available in this browser");
  }

  const serializedEnvelope = payload.encryptedKeysByRecipientId[ownMaterial.deviceId];
  if (!serializedEnvelope) {
    if (payload.historyEnvelope && options.decryptDirectHistoryMessage) {
      return options.decryptDirectHistoryMessage(
        options.message,
        options.userId,
        ownMaterial
      );
    }
    throw new Error("Encrypted device envelope is not available for this device");
  }

  try {
    const { content } = await options.decryptDirectRecipientEnvelope(
      serializedEnvelope,
      options.userId,
      ownMaterial
    );
    return content;
  } catch (error) {
    if (
      payload.historyEnvelope &&
      options.decryptDirectHistoryMessage &&
      options.isRecoverableHistoryFallbackError?.(error)
    ) {
      return options.decryptDirectHistoryMessage(
        options.message,
        options.userId,
        ownMaterial
      );
    }
    throw error;
  }
}

export async function encryptDirectDeviceMessage<
  OwnMaterial extends DirectEnvelopeOwnMaterialLike & { deviceId: string; materialId: string },
  SessionRecord,
>(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  content: string;
  participants: Participant[];
  conversationBundles?: ConversationDeviceBundleResolution;
  createInitializingError: () => Error;
  createIdentityChangedError: (displayNames: string[]) => Error;
  createMissingParticipantsError: (displayNames: string[]) => Error;
  createUnavailableError: () => Error;
  messageSchemeDevice: string;
  readOwnMaterial: (userId: string) => Promise<OwnMaterial | null>;
  resolveConversationDeviceBundles: (
    token: string,
    participants: Participant[],
    requesterDeviceId?: string | null,
    currentUserId?: string | null
  ) => Promise<ConversationDeviceBundleResolution>;
  buildSelfDeviceBundle: (
    ownMaterial: OwnMaterial,
    currentUserId: string
  ) => UserEncryptionDeviceBundle;
  getDeviceBundleMapKey: (userId: string, deviceId: string) => string;
  readCurrentDeviceSessions: (
    userId: string,
    ownMaterialId: string
  ) => Promise<Record<string, SessionRecord>>;
  shouldEstablishDeviceSession: (
    sessions: Record<string, SessionRecord>,
    bundle: UserEncryptionDeviceBundle
  ) => boolean;
  wasCurrentDeviceSessionRestoredFromPersistent: (
    userId: string,
    peerUserId: string,
    peerDeviceId: string
  ) => boolean;
  establishInitiatorDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    bundle: UserEncryptionDeviceBundle
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  markCurrentDeviceSessionAsReactivated: (
    userId: string,
    peerUserId: string,
    peerDeviceId: string
  ) => void;
  resolveEncryptionDeviceBundles: (
    token: string,
    userIds: string[],
    request?: {
      consumeOneTimePrekeys?: boolean;
      requesterDeviceId?: string;
      deviceIds?: string[];
    }
  ) => Promise<UserEncryptionDeviceBundle[]>;
  validateAndPinDeviceBundle: (bundle: UserEncryptionDeviceBundle) => Promise<boolean>;
  createDirectRecipientEnvelope: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    sessionRecord: SessionRecord,
    content: string
  ) => Promise<unknown>;
  createHistoryEnvelope?: (args: {
    token: string;
    chatId: string;
    currentUserId: string;
    content: string;
    ownMaterial: OwnMaterial;
    targetBundles: UserEncryptionDeviceBundle[];
    nextSessions: Record<string, SessionRecord>;
  }) => Promise<string | null>;
  writeDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => void;
  rememberDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => Promise<void>;
}) {
  const ownMaterial = await options.readOwnMaterial(options.currentUserId);
  if (!ownMaterial?.deviceId) {
    throw options.createInitializingError();
  }

  const {
    trustedBundles: previewBundles,
    missingParticipants,
    participantsWithUntrustedDevices,
  } =
    options.conversationBundles ??
    (await options.resolveConversationDeviceBundles(
      options.token,
      options.participants,
      ownMaterial.deviceId,
      options.currentUserId
    ));
  const currentSelfBundle = options.buildSelfDeviceBundle(
    ownMaterial,
    options.currentUserId
  );
  const currentSelfBundleKey = options.getDeviceBundleMapKey(
    options.currentUserId,
    ownMaterial.deviceId
  );
  if (participantsWithUntrustedDevices.length > 0) {
    throw options.createIdentityChangedError(
      participantsWithUntrustedDevices.map((participant) => participant.displayName)
    );
  }
  if (missingParticipants.length > 0) {
    throw options.createMissingParticipantsError(
      missingParticipants.map((participant) => participant.displayName)
    );
  }

  const existingSessions = await options.readCurrentDeviceSessions(
    options.currentUserId,
    ownMaterial.materialId
  );
  const targetBundles = [
    ...previewBundles.filter(
      (bundle) =>
        options.getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !==
        currentSelfBundleKey
    ),
    currentSelfBundle,
  ];
  const shouldRefreshRestoredSelfSession =
    options.wasCurrentDeviceSessionRestoredFromPersistent(
      options.currentUserId,
      currentSelfBundle.userId,
      currentSelfBundle.deviceId
    );
  const unresolvedRemoteBundles = targetBundles
    .filter(
      (bundle) =>
        options.getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !==
        currentSelfBundleKey
    )
    .filter(
      (bundle) =>
        options.shouldEstablishDeviceSession(existingSessions, bundle) ||
        options.wasCurrentDeviceSessionRestoredFromPersistent(
          options.currentUserId,
          bundle.userId,
          bundle.deviceId
        )
    );

  const nextSessions = { ...existingSessions };
  if (
    options.shouldEstablishDeviceSession(existingSessions, currentSelfBundle) ||
    shouldRefreshRestoredSelfSession
  ) {
    const selfSession = await options.establishInitiatorDeviceSession(
      options.currentUserId,
      ownMaterial,
      currentSelfBundle
    );
    options.setCurrentDeviceSessionRecord(nextSessions, selfSession);
    options.markCurrentDeviceSessionAsReactivated(
      options.currentUserId,
      currentSelfBundle.userId,
      currentSelfBundle.deviceId
    );
  }

  if (unresolvedRemoteBundles.length > 0) {
    let consumableBundles: UserEncryptionDeviceBundle[] = [];
    try {
      consumableBundles = await options.resolveEncryptionDeviceBundles(
        options.token,
        Array.from(
          new Set(unresolvedRemoteBundles.map((bundle) => bundle.userId))
        ),
        {
          consumeOneTimePrekeys: true,
          deviceIds: unresolvedRemoteBundles.map((bundle) => bundle.deviceId),
          requesterDeviceId: ownMaterial.deviceId,
        }
      );
    } catch {
      throw options.createInitializingError();
    }

    for (const bundle of consumableBundles) {
      if (!(await options.validateAndPinDeviceBundle(bundle))) {
        continue;
      }
      const nextSession = await options.establishInitiatorDeviceSession(
        options.currentUserId,
        ownMaterial,
        bundle
      );
      options.setCurrentDeviceSessionRecord(nextSessions, nextSession);
      options.markCurrentDeviceSessionAsReactivated(
        options.currentUserId,
        bundle.userId,
        bundle.deviceId
      );
    }
  }

  const envelopes = await Promise.all(
    targetBundles.map(async (bundle) => {
      const sessionRecord =
        nextSessions[options.getDeviceBundleMapKey(bundle.userId, bundle.deviceId)] ??
        (await options.establishInitiatorDeviceSession(
          options.currentUserId,
          ownMaterial,
          bundle
        ));
      options.setCurrentDeviceSessionRecord(nextSessions, sessionRecord);
      return [
        bundle.deviceId,
        await options.createDirectRecipientEnvelope(
          options.currentUserId,
          ownMaterial,
          sessionRecord,
          options.content
        ),
      ] as const;
    })
  );

  options.writeDeviceSessions(options.currentUserId, nextSessions);
  await options.rememberDeviceSessions(options.currentUserId, nextSessions);

  const envelopeByDeviceId = Object.fromEntries(envelopes);
  if (Object.keys(envelopeByDeviceId).length === 0) {
    throw options.createUnavailableError();
  }

  const historyEnvelope =
    (await options.createHistoryEnvelope?.({
      token: options.token,
      chatId: options.chatId,
      currentUserId: options.currentUserId,
      content: options.content,
      ownMaterial,
      targetBundles,
      nextSessions,
    })) ?? null;

  return {
    scheme: options.messageSchemeDevice,
    encryptedKeysByRecipientId: Object.fromEntries(
      Object.entries(envelopeByDeviceId).map(([deviceId, envelope]) => [
        deviceId,
        JSON.stringify(envelope),
      ])
    ),
    historyEnvelope,
  } satisfies EncryptedMessagePayload;
}
