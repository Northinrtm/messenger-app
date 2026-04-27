import type { UserEncryptionDeviceBundle } from "./types";

type SessionRecordLike = {
  remoteIdentityKey: string;
  remoteIdentitySignatureKey: string;
  remoteSignedPrekeyId: number;
  remoteSignedPrekeyPublicKey: string;
};

type PinnedDeviceBundleRecordLike = {
  identityFingerprint: string;
  identitySignatureFingerprint: string;
  signedPrekeyId: number;
  deviceVersion?: string | null;
};

export function shouldEstablishDeviceSession<SessionRecord extends SessionRecordLike>(options: {
  existingSessions: Record<string, SessionRecord>;
  bundle: UserEncryptionDeviceBundle;
  getDeviceSessionMapKey: (userId: string, deviceId: string) => string;
}) {
  const existingSession =
    options.existingSessions[
      options.getDeviceSessionMapKey(options.bundle.userId, options.bundle.deviceId)
    ];
  if (!existingSession) {
    return true;
  }

  if (
    existingSession.remoteIdentityKey !== options.bundle.identityKey ||
    existingSession.remoteIdentitySignatureKey !== options.bundle.identitySignatureKey
  ) {
    return true;
  }

  return (
    existingSession.remoteSignedPrekeyId !== options.bundle.signedPrekeyId ||
    existingSession.remoteSignedPrekeyPublicKey !== options.bundle.signedPrekeyPublicKey
  );
}

export async function validateAndPinDeviceBundle<
  PinnedRecord extends PinnedDeviceBundleRecordLike,
>(options: {
  bundle: UserEncryptionDeviceBundle;
  deviceAgreementKeyAlgorithm: string;
  deviceSignatureKeyAlgorithm: string;
  readPinnedDeviceBundleRecord: (
    userId: string,
    deviceId: string
  ) => PinnedRecord | null;
  verifySignedPrekeySignature: (
    bundle: UserEncryptionDeviceBundle
  ) => Promise<boolean>;
  fingerprintPublicKey: (serializedPublicKey: string) => Promise<string>;
  writePinnedDeviceBundleRecord: (
    userId: string,
    deviceId: string,
    record: {
      userId: string;
      deviceId: string;
      identityFingerprint: string;
      identitySignatureFingerprint: string;
      signedPrekeyFingerprint: string;
      signedPrekeyId: number;
      deviceVersion?: string | null;
      updatedAt: string;
    }
  ) => void;
  now: () => string;
}) {
  try {
    const { bundle } = options;
    if (
      bundle.identityKeyAlgorithm !== options.deviceAgreementKeyAlgorithm ||
      bundle.identitySignatureKeyAlgorithm !== options.deviceSignatureKeyAlgorithm ||
      bundle.signedPrekeyAlgorithm !== options.deviceAgreementKeyAlgorithm
    ) {
      return false;
    }

    const currentRecord = options.readPinnedDeviceBundleRecord(
      bundle.userId,
      bundle.deviceId
    );
    if (
      currentRecord &&
      typeof bundle.deviceVersion === "string" &&
      bundle.deviceVersion.length > 0 &&
      currentRecord.deviceVersion === bundle.deviceVersion &&
      currentRecord.signedPrekeyId === bundle.signedPrekeyId
    ) {
      return true;
    }

    const signatureValid = await options.verifySignedPrekeySignature(bundle);
    if (!signatureValid) {
      return false;
    }

    const identityFingerprint = await options.fingerprintPublicKey(bundle.identityKey);
    const identitySignatureFingerprint = await options.fingerprintPublicKey(
      bundle.identitySignatureKey
    );
    const signedPrekeyFingerprint = await options.fingerprintPublicKey(
      bundle.signedPrekeyPublicKey
    );

    if (
      currentRecord &&
      (currentRecord.identityFingerprint !== identityFingerprint ||
        currentRecord.identitySignatureFingerprint !== identitySignatureFingerprint)
    ) {
      return false;
    }

    options.writePinnedDeviceBundleRecord(bundle.userId, bundle.deviceId, {
      userId: bundle.userId,
      deviceId: bundle.deviceId,
      identityFingerprint,
      identitySignatureFingerprint,
      signedPrekeyFingerprint,
      signedPrekeyId: bundle.signedPrekeyId,
      deviceVersion: bundle.deviceVersion ?? null,
      updatedAt: options.now(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapDeviceSessions<
  OwnMaterial extends { deviceId: string | null; materialId: string },
  SessionRecord,
>(options: {
  token: string;
  currentUserId: string | null;
  previewBundles: UserEncryptionDeviceBundle[];
  readOwnMaterial: (userId: string) => Promise<OwnMaterial | null>;
  readCurrentDeviceSessions: (
    userId: string,
    ownMaterialId: string
  ) => Promise<Record<string, SessionRecord>>;
  shouldEstablishDeviceSession: (
    sessions: Record<string, SessionRecord>,
    bundle: UserEncryptionDeviceBundle
  ) => boolean;
  resolveEncryptionDeviceBundles: (
    token: string,
    userIds: string[],
    request?: {
      consumeOneTimePrekeys?: boolean;
      requesterDeviceId?: string;
      deviceIds?: string[];
    }
  ) => Promise<UserEncryptionDeviceBundle[]>;
  validateAndPinDeviceBundle: (
    bundle: UserEncryptionDeviceBundle
  ) => Promise<boolean>;
  establishInitiatorDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    bundle: UserEncryptionDeviceBundle
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  writeDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => void;
  rememberDeviceSessions: (
    userId: string,
    sessions: Record<string, SessionRecord>
  ) => Promise<void>;
}) {
  if (!options.currentUserId || options.previewBundles.length === 0) {
    return true;
  }

  const ownMaterial = await options.readOwnMaterial(options.currentUserId);
  if (!ownMaterial) {
    return false;
  }

  const existingSessions = await options.readCurrentDeviceSessions(
    options.currentUserId,
    ownMaterial.materialId
  );
  const unresolvedBundles = options.previewBundles.filter((bundle) =>
    options.shouldEstablishDeviceSession(existingSessions, bundle)
  );

  if (unresolvedBundles.length === 0) {
    return true;
  }

  let consumableBundles: UserEncryptionDeviceBundle[] = [];
  try {
    consumableBundles = await options.resolveEncryptionDeviceBundles(
      options.token,
      Array.from(new Set(unresolvedBundles.map((bundle) => bundle.userId))),
      {
        consumeOneTimePrekeys: true,
        deviceIds: unresolvedBundles.map((bundle) => bundle.deviceId),
        requesterDeviceId: ownMaterial.deviceId ?? undefined,
      }
    );
  } catch {
    return false;
  }

  const nextSessions = { ...existingSessions };
  for (const bundle of consumableBundles) {
    if (!unresolvedBundles.some((candidate) => candidate.deviceId === bundle.deviceId)) {
      continue;
    }

    if (!(await options.validateAndPinDeviceBundle(bundle))) {
      continue;
    }

    options.setCurrentDeviceSessionRecord(
      nextSessions,
      await options.establishInitiatorDeviceSession(
        options.currentUserId,
        ownMaterial,
        bundle
      )
    );
  }

  options.writeDeviceSessions(options.currentUserId, nextSessions);
  await options.rememberDeviceSessions(options.currentUserId, nextSessions);
  return true;
}
