import { ApiError } from "./api";
import type {
  KnownEncryptionDeviceManifestEntry,
  Participant,
  UserEncryptionDeviceBundle,
  UserEncryptionDeviceManifest,
} from "./types";
import {
  buildConversationDeviceBundleResolution,
  buildDeviceManifestPreparationKey,
  mergePreparedConversationDeviceBundles,
  mergeResolvedDeviceManifestBundles,
  type ConversationDeviceBundleResolution,
  type PreparedConversationDeviceState,
  type PreparedDeviceManifestState,
} from "./e2eeDeviceDirectory";

type DeviceBundlePreparationDependencies = {
  token: string;
  requesterDeviceId?: string | null;
  currentUserId?: string | null;
  readPreparedDeviceManifestState: (
    preparationKey: string
  ) => PreparedDeviceManifestState | null;
  rememberPreparedDeviceManifestState: (
    preparationKey: string,
    preparedState: PreparedDeviceManifestState
  ) => void;
  resolveEncryptionDeviceManifest: (
    token: string,
    userIds: string[],
    options?: {
      knownVersion?: string;
      knownDevices?: KnownEncryptionDeviceManifestEntry[];
    }
  ) => Promise<unknown>;
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
};

export type PrimeDeviceBundlesOptions = DeviceBundlePreparationDependencies & {
  userIds: string[];
};

export type ResolveConversationDeviceBundlesOptions =
  DeviceBundlePreparationDependencies & {
  participants: Participant[];
};

export type PrepareSendConversationDeviceBundlesOptions<
  OwnMaterial extends { deviceId: string | null },
> = ResolveConversationDeviceBundlesOptions & {
  currentUserId: string;
  inFlightDevicePreparation: Map<string, Promise<void>>;
  readPreparedConversationDeviceState: (
    preparationKey: string
  ) => PreparedConversationDeviceState | null;
  readEncryptionDeviceMaterial: (
    userId: string
  ) => Promise<OwnMaterial | null | undefined>;
  listPreparedOwnSiblingDeviceBundles: (
    token: string,
    currentUserId: string,
    currentDeviceId: string
  ) => Promise<PreparedConversationDeviceState | null>;
  bootstrapDeviceSessions: (
    token: string,
    currentUserId: string,
    previewBundles: UserEncryptionDeviceBundle[]
  ) => Promise<boolean>;
  rememberPreparedConversationDeviceState: (
    preparationKey: string,
    preparedState: PreparedConversationDeviceState
  ) => void;
  encryptionIdentityChangedMessage: string;
};

export function buildDevicePreparationKey(
  currentUserId: string | null,
  remoteParticipantIds: string[]
) {
  return `${currentUserId ?? "anonymous"}:${Array.from(new Set(remoteParticipantIds.filter(Boolean)))
    .sort()
    .join(",")}`;
}

function isResolvedDeviceManifestResponse(
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

export async function primeDeviceBundles(
  options: PrimeDeviceBundlesOptions
): Promise<PreparedConversationDeviceState> {
  const uniqueUserIds = Array.from(new Set(options.userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return {
      rawBundles: [],
      trustedBundles: [],
    };
  }

  let rawBundles: UserEncryptionDeviceBundle[] = [];
  try {
    const manifestPreparationKey = buildDeviceManifestPreparationKey(
      options.currentUserId,
      uniqueUserIds
    );
    const cachedManifestState =
      options.readPreparedDeviceManifestState(manifestPreparationKey);
    const knownDevices: KnownEncryptionDeviceManifestEntry[] | undefined =
      cachedManifestState
        ? cachedManifestState.rawBundles
            .filter(
              (bundle): bundle is UserEncryptionDeviceBundle & { deviceVersion: string } =>
                typeof bundle.deviceVersion === "string" &&
                bundle.deviceVersion.length > 0
            )
            .map((bundle) => ({
              deviceId: bundle.deviceId,
              version: bundle.deviceVersion,
            }))
        : undefined;
    const manifestResponse = await options.resolveEncryptionDeviceManifest(
      options.token,
      uniqueUserIds,
      {
        knownVersion: cachedManifestState?.version,
        knownDevices,
      }
    );
    if (!isResolvedDeviceManifestResponse(manifestResponse)) {
      throw new Error("Invalid encryption device manifest response");
    }

    rawBundles = manifestResponse.fullSync
      ? manifestResponse.bundles
      : cachedManifestState
        ? mergeResolvedDeviceManifestBundles(
            cachedManifestState.rawBundles,
            manifestResponse.bundles,
            manifestResponse.removedDeviceIds
          )
        : manifestResponse.bundles;

    options.rememberPreparedDeviceManifestState(manifestPreparationKey, {
      version: manifestResponse.version,
      rawBundles,
    });
  } catch {
    try {
      rawBundles = await options.resolveEncryptionDeviceBundles(
        options.token,
        uniqueUserIds,
        {
          consumeOneTimePrekeys: false,
          requesterDeviceId: options.requesterDeviceId ?? undefined,
        }
      );
    } catch {
      return {
        rawBundles: [],
        trustedBundles: [],
      };
    }
  }

  const trustedBundles = await Promise.all(
    rawBundles.map(async (bundle) => {
      try {
        return (await options.validateAndPinDeviceBundle(bundle)) ? bundle : null;
      } catch {
        return null;
      }
    })
  );

  return {
    rawBundles,
    trustedBundles: trustedBundles.filter(
      (bundle): bundle is UserEncryptionDeviceBundle => bundle !== null
    ),
  };
}

export async function resolveConversationDeviceBundles(
  options: ResolveConversationDeviceBundlesOptions
): Promise<ConversationDeviceBundleResolution> {
  const { rawBundles, trustedBundles } = await primeDeviceBundles({
    token: options.token,
    userIds: options.participants.map((participant) => participant.id),
    requesterDeviceId: options.requesterDeviceId,
    currentUserId: options.currentUserId,
    readPreparedDeviceManifestState: options.readPreparedDeviceManifestState,
    rememberPreparedDeviceManifestState:
      options.rememberPreparedDeviceManifestState,
    resolveEncryptionDeviceManifest: options.resolveEncryptionDeviceManifest,
    resolveEncryptionDeviceBundles: options.resolveEncryptionDeviceBundles,
    validateAndPinDeviceBundle: options.validateAndPinDeviceBundle,
  });
  return buildConversationDeviceBundleResolution(
    options.participants,
    rawBundles,
    trustedBundles,
    options.currentUserId
  );
}

export async function prepareSendConversationDeviceBundles<
  OwnMaterial extends { deviceId: string | null },
>(
  options: PrepareSendConversationDeviceBundlesOptions<OwnMaterial>
): Promise<ConversationDeviceBundleResolution> {
  const remoteParticipantIds = options.participants
    .map((participant) => participant.id)
    .filter((participantId) => participantId !== options.currentUserId);
  const preparationKey = buildDevicePreparationKey(
    options.currentUserId,
    remoteParticipantIds
  );
  const cachedPreparedState =
    options.readPreparedConversationDeviceState(preparationKey);
  if (cachedPreparedState) {
    return buildConversationDeviceBundleResolution(
      options.participants,
      cachedPreparedState.rawBundles,
      cachedPreparedState.trustedBundles,
      options.currentUserId
    );
  }

  const inFlightPreparation =
    options.inFlightDevicePreparation.get(preparationKey);
  if (inFlightPreparation) {
    await inFlightPreparation.catch(() => undefined);
    const preparedStateAfterWait =
      options.readPreparedConversationDeviceState(preparationKey);
    if (preparedStateAfterWait) {
      return buildConversationDeviceBundleResolution(
        options.participants,
        preparedStateAfterWait.rawBundles,
        preparedStateAfterWait.trustedBundles,
        options.currentUserId
      );
    }
  }

  const preparationPromise = (async () => {
    const ownMaterial = await options.readEncryptionDeviceMaterial(
      options.currentUserId
    );
    let resolvedBundles: ConversationDeviceBundleResolution;
    let cachePreparedState = true;

    if (ownMaterial?.deviceId) {
      const remoteParticipants = options.participants.filter(
        (participant) => participant.id !== options.currentUserId
      );
      const [remoteResolvedBundles, preparedOwnDeviceBundles] =
        await Promise.all([
          resolveConversationDeviceBundles({
            token: options.token,
            participants: remoteParticipants,
            requesterDeviceId: ownMaterial.deviceId,
            currentUserId: options.currentUserId,
            readPreparedDeviceManifestState:
              options.readPreparedDeviceManifestState,
            rememberPreparedDeviceManifestState:
              options.rememberPreparedDeviceManifestState,
            resolveEncryptionDeviceManifest:
              options.resolveEncryptionDeviceManifest,
            resolveEncryptionDeviceBundles:
              options.resolveEncryptionDeviceBundles,
            validateAndPinDeviceBundle: options.validateAndPinDeviceBundle,
          }),
          options.listPreparedOwnSiblingDeviceBundles(
            options.token,
            options.currentUserId,
            ownMaterial.deviceId
          ),
        ]);

      if (preparedOwnDeviceBundles) {
        resolvedBundles = buildConversationDeviceBundleResolution(
          options.participants,
          mergePreparedConversationDeviceBundles(
            remoteResolvedBundles.rawBundles,
            preparedOwnDeviceBundles.rawBundles
          ),
          mergePreparedConversationDeviceBundles(
            remoteResolvedBundles.trustedBundles,
            preparedOwnDeviceBundles.trustedBundles
          ),
          options.currentUserId
        );
      } else {
        cachePreparedState = false;
        resolvedBundles = await resolveConversationDeviceBundles({
          token: options.token,
          participants: options.participants,
          requesterDeviceId: ownMaterial.deviceId,
          currentUserId: options.currentUserId,
          readPreparedDeviceManifestState:
            options.readPreparedDeviceManifestState,
          rememberPreparedDeviceManifestState:
            options.rememberPreparedDeviceManifestState,
          resolveEncryptionDeviceManifest:
            options.resolveEncryptionDeviceManifest,
          resolveEncryptionDeviceBundles:
            options.resolveEncryptionDeviceBundles,
          validateAndPinDeviceBundle: options.validateAndPinDeviceBundle,
        });
      }
    } else {
      resolvedBundles = await resolveConversationDeviceBundles({
        token: options.token,
        participants: options.participants,
        requesterDeviceId: null,
        currentUserId: options.currentUserId,
        readPreparedDeviceManifestState: options.readPreparedDeviceManifestState,
        rememberPreparedDeviceManifestState:
          options.rememberPreparedDeviceManifestState,
        resolveEncryptionDeviceManifest: options.resolveEncryptionDeviceManifest,
        resolveEncryptionDeviceBundles: options.resolveEncryptionDeviceBundles,
        validateAndPinDeviceBundle: options.validateAndPinDeviceBundle,
      });
    }

    if (resolvedBundles.participantsWithUntrustedDevices.length > 0) {
      throw new ApiError(
        options.encryptionIdentityChangedMessage,
        409,
        resolvedBundles.participantsWithUntrustedDevices.map(
          (participant) => participant.displayName
        )
      );
    }

    const bootstrapped = await options.bootstrapDeviceSessions(
      options.token,
      options.currentUserId,
      resolvedBundles.trustedBundles
    );
    if (bootstrapped && cachePreparedState) {
      options.rememberPreparedConversationDeviceState(
        preparationKey,
        resolvedBundles
      );
    }

    return resolvedBundles;
  })();
  const trackedPreparation = preparationPromise.then(
    () => undefined,
    () => undefined
  );
  options.inFlightDevicePreparation.set(preparationKey, trackedPreparation);

  try {
    return await preparationPromise;
  } finally {
    if (
      options.inFlightDevicePreparation.get(preparationKey) ===
      trackedPreparation
    ) {
      options.inFlightDevicePreparation.delete(preparationKey);
    }
  }
}
