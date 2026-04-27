import type {
  Participant,
  UserEncryptionDeviceBundle,
  UserEncryptionDeviceManifest,
} from "./types";

export type ConversationDeviceBundleResolution = {
  rawBundles: UserEncryptionDeviceBundle[];
  trustedBundles: UserEncryptionDeviceBundle[];
  missingParticipants: Participant[];
  participantsWithUntrustedDevices: Participant[];
};

export type PreparedConversationDeviceState = Pick<
  ConversationDeviceBundleResolution,
  "rawBundles" | "trustedBundles"
>;

export type PreparedDeviceManifestState = {
  version: string;
  rawBundles: UserEncryptionDeviceBundle[];
};

export function getDeviceBundleMapKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

export function mergePreparedConversationDeviceBundles(
  currentBundles: UserEncryptionDeviceBundle[],
  additionalBundles: UserEncryptionDeviceBundle[]
) {
  const mergedBundles = new Map(
    currentBundles.map((bundle) => [getDeviceBundleMapKey(bundle.userId, bundle.deviceId), bundle])
  );
  for (const bundle of additionalBundles) {
    const bundleKey = getDeviceBundleMapKey(bundle.userId, bundle.deviceId);
    if (!mergedBundles.has(bundleKey)) {
      mergedBundles.set(bundleKey, bundle);
    }
  }

  return Array.from(mergedBundles.values());
}

export function buildDeviceManifestPreparationKey(
  currentUserId: string | null | undefined,
  userIds: string[]
) {
  const normalizedUserIds = Array.from(new Set(userIds.filter(Boolean))).sort();
  return `${currentUserId ?? "anonymous"}:${normalizedUserIds.join(",")}`;
}

export function isResolvedDeviceManifestResponse(
  value: unknown
): value is UserEncryptionDeviceManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UserEncryptionDeviceManifest>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.fullSync === "boolean" &&
    Array.isArray(candidate.bundles) &&
    Array.isArray(candidate.removedDeviceIds)
  );
}

export function mergeResolvedDeviceManifestBundles(
  currentBundles: UserEncryptionDeviceBundle[],
  nextBundles: UserEncryptionDeviceBundle[],
  removedDeviceIds: string[]
) {
  const bundlesByKey = new Map(
    currentBundles.map((bundle) => [getDeviceBundleMapKey(bundle.userId, bundle.deviceId), bundle])
  );
  const removedDeviceIdSet = new Set(removedDeviceIds);

  for (const bundle of nextBundles) {
    bundlesByKey.set(getDeviceBundleMapKey(bundle.userId, bundle.deviceId), bundle);
  }

  for (const [bundleKey, bundle] of Array.from(bundlesByKey.entries())) {
    if (removedDeviceIdSet.has(bundle.deviceId)) {
      bundlesByKey.delete(bundleKey);
    }
  }

  return Array.from(bundlesByKey.values());
}

export function buildConversationDeviceBundleResolution(
  participants: Participant[],
  rawBundles: UserEncryptionDeviceBundle[],
  trustedBundles: UserEncryptionDeviceBundle[],
  currentUserId?: string | null
): ConversationDeviceBundleResolution {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const trustedBundleKeys = new Set(
    trustedBundles.map((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId))
  );
  const missingParticipants = participants.filter(
    (participant) =>
      participant.id !== currentUserId &&
      !rawBundles.some((bundle) => bundle.userId === participant.id)
  );
  const participantsWithUntrustedDevices = Array.from(
    new Set(
      rawBundles
        .filter((bundle) => !trustedBundleKeys.has(getDeviceBundleMapKey(bundle.userId, bundle.deviceId)))
        .map((bundle) => bundle.userId)
    )
  )
    .map((participantId) => participantById.get(participantId))
    .filter((participant): participant is Participant => Boolean(participant));

  return {
    rawBundles,
    trustedBundles,
    missingParticipants,
    participantsWithUntrustedDevices,
  };
}
