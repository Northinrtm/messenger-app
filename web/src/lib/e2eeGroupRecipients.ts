import { ApiError } from "./api";
import type { Participant, UserEncryptionDeviceBundle } from "./types";
import type { ConversationDeviceBundleResolution } from "./e2eeDeviceDirectory";

const ENCRYPTION_IDENTITY_CHANGED_MESSAGE =
  "Encryption identity changed for this account in this browser. Re-establish trust before continuing";
const ENCRYPTION_INITIALIZING_MESSAGE =
  "Encrypted chat is still initializing on this device. Try again.";
const ENCRYPTION_MISSING_DEVICE_MESSAGE =
  "Encrypted chat is unavailable because some participants do not have an available encryption device yet";

export type GroupRecipientEncryptionContext<OwnMaterial, SessionRecord> = {
  ownMaterial: OwnMaterial;
  targetBundles: UserEncryptionDeviceBundle[];
  nextSessions: Record<string, SessionRecord>;
};

export async function prepareGroupRecipientEncryptionContext<
  OwnMaterial extends { deviceId: string; materialId: string },
  SessionRecord,
>(options: {
  token: string;
  currentUserId: string;
  participants: Participant[];
  conversationBundles?: ConversationDeviceBundleResolution;
  readOwnMaterial: (currentUserId: string) => Promise<OwnMaterial | null>;
  resolveConversationDeviceBundles: (
    token: string,
    participants: Participant[],
    requesterDeviceId: string,
    currentUserId: string
  ) => Promise<ConversationDeviceBundleResolution>;
  buildSelfDeviceBundle: (ownMaterial: OwnMaterial, currentUserId: string) => UserEncryptionDeviceBundle;
  getDeviceBundleMapKey: (userId: string, deviceId: string) => string;
  readCurrentDeviceSessions: (
    currentUserId: string,
    ownMaterialId: string
  ) => Promise<Record<string, SessionRecord>>;
  shouldEstablishDeviceSession: (
    existingSessions: Record<string, SessionRecord>,
    bundle: UserEncryptionDeviceBundle
  ) => boolean;
  wasCurrentDeviceSessionRestoredFromPersistent: (
    currentUserId: string,
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
    currentUserId: string,
    peerUserId: string,
    peerDeviceId: string
  ) => void;
  resolveEncryptionDeviceBundles: (
    token: string,
    userIds: string[],
    options: {
      consumeOneTimePrekeys: boolean;
      deviceIds: string[];
      requesterDeviceId: string;
    }
  ) => Promise<UserEncryptionDeviceBundle[]>;
  validateAndPinDeviceBundle: (bundle: UserEncryptionDeviceBundle) => Promise<boolean>;
}) {
  const ownMaterial = await options.readOwnMaterial(options.currentUserId);
  if (!ownMaterial) {
    throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
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
  const currentSelfBundle = options.buildSelfDeviceBundle(ownMaterial, options.currentUserId);
  const currentSelfBundleKey = options.getDeviceBundleMapKey(
    options.currentUserId,
    ownMaterial.deviceId
  );
  if (participantsWithUntrustedDevices.length > 0) {
    throw new ApiError(
      ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
      409,
      participantsWithUntrustedDevices.map((participant) => participant.displayName)
    );
  }
  if (missingParticipants.length > 0) {
    throw new ApiError(
      ENCRYPTION_MISSING_DEVICE_MESSAGE,
      409,
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
        options.getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey
    ),
    currentSelfBundle,
  ];
  const shouldRefreshRestoredSelfSession = options.wasCurrentDeviceSessionRestoredFromPersistent(
    options.currentUserId,
    currentSelfBundle.userId,
    currentSelfBundle.deviceId
  );
  const unresolvedRemoteBundles = targetBundles
    .filter((bundle) => options.getDeviceBundleMapKey(bundle.userId, bundle.deviceId) !== currentSelfBundleKey)
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
        Array.from(new Set(unresolvedRemoteBundles.map((bundle) => bundle.userId))),
        {
          consumeOneTimePrekeys: true,
          deviceIds: unresolvedRemoteBundles.map((bundle) => bundle.deviceId),
          requesterDeviceId: ownMaterial.deviceId,
        }
      );
    } catch {
      throw new ApiError(ENCRYPTION_INITIALIZING_MESSAGE, 409);
    }

    for (const bundle of consumableBundles) {
      if (!(await options.validateAndPinDeviceBundle(bundle))) {
        const affectedParticipant = options.participants.find(
          (participant) => participant.id === bundle.userId
        );
        throw new ApiError(
          ENCRYPTION_IDENTITY_CHANGED_MESSAGE,
          409,
          affectedParticipant ? [affectedParticipant.displayName] : []
        );
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

  return {
    ownMaterial,
    targetBundles,
    nextSessions,
  } satisfies GroupRecipientEncryptionContext<OwnMaterial, SessionRecord>;
}
