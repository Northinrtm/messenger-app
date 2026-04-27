import type { UserEncryptionDevice, UserEncryptionDeviceBundle } from "./types";
import type { PreparedConversationDeviceState } from "./e2eeDeviceDirectory";

export function buildOwnSiblingDeviceBundle(
  device: UserEncryptionDevice,
  currentUserId: string
): UserEncryptionDeviceBundle {
  return {
    userId: currentUserId,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    identityKey: device.identityKey,
    identityKeyAlgorithm: device.identityKeyAlgorithm,
    identitySignatureKey: device.identitySignatureKey,
    identitySignatureKeyAlgorithm: device.identitySignatureKeyAlgorithm,
    signedPrekeyId: device.signedPrekeyId,
    signedPrekeyPublicKey: device.signedPrekeyPublicKey,
    signedPrekeySignature: device.signedPrekeySignature,
    signedPrekeyAlgorithm: device.signedPrekeyAlgorithm,
    deviceVersion: device.deviceVersion ?? null,
    oneTimePrekey: null,
    registeredAt: device.registeredAt,
    lastSeenAt: device.lastSeenAt,
  };
}

export function buildOwnSiblingDevicePreparationKey(
  currentUserId: string,
  currentDeviceId: string
) {
  return `${currentUserId}:${currentDeviceId}`;
}

export type ListPreparedOwnSiblingDeviceBundlesOptions = {
  token: string;
  currentUserId: string;
  currentDeviceId: string;
  forceRefresh?: boolean;
  inFlightOwnSiblingDevicePreparation: Map<
    string,
    Promise<PreparedConversationDeviceState | null>
  >;
  readPreparedOwnSiblingDeviceState: (
    preparationKey: string
  ) => PreparedConversationDeviceState | null;
  rememberPreparedOwnSiblingDeviceState: (
    preparationKey: string,
    preparedState: PreparedConversationDeviceState
  ) => void;
  clearPreparedOwnSiblingDeviceState: (preparationKey: string) => void;
  listOwnEncryptionDevices: (token: string) => Promise<UserEncryptionDevice[]>;
  validateAndPinDeviceBundle: (
    bundle: UserEncryptionDeviceBundle
  ) => Promise<boolean>;
};

export async function listPreparedOwnSiblingDeviceBundles(
  options: ListPreparedOwnSiblingDeviceBundlesOptions
) {
  const preparationKey = buildOwnSiblingDevicePreparationKey(
    options.currentUserId,
    options.currentDeviceId
  );
  if (!options.forceRefresh) {
    const cachedPreparedState =
      options.readPreparedOwnSiblingDeviceState(preparationKey);
    if (cachedPreparedState) {
      return cachedPreparedState;
    }

    const inFlightPreparation =
      options.inFlightOwnSiblingDevicePreparation.get(preparationKey);
    if (inFlightPreparation) {
      return inFlightPreparation;
    }
  } else {
    options.clearPreparedOwnSiblingDeviceState(preparationKey);
    options.inFlightOwnSiblingDevicePreparation.delete(preparationKey);
  }

  const preparationPromise = (async () => {
    let ownDevices: UserEncryptionDevice[] = [];
    try {
      ownDevices = await options.listOwnEncryptionDevices(options.token);
    } catch {
      return null;
    }

    const rawBundles = ownDevices
      .filter((device) => device.deviceId !== options.currentDeviceId)
      .map((device) =>
        buildOwnSiblingDeviceBundle(device, options.currentUserId)
      );
    const trustedBundles = await Promise.all(
      rawBundles.map(async (bundle) => {
        try {
          return (await options.validateAndPinDeviceBundle(bundle))
            ? bundle
            : null;
        } catch {
          return null;
        }
      })
    );

    const preparedState = {
      rawBundles,
      trustedBundles: trustedBundles.filter(
        (bundle): bundle is UserEncryptionDeviceBundle => bundle !== null
      ),
    };
    options.rememberPreparedOwnSiblingDeviceState(
      preparationKey,
      preparedState
    );
    return preparedState;
  })();
  options.inFlightOwnSiblingDevicePreparation.set(
    preparationKey,
    preparationPromise
  );

  try {
    return await preparationPromise;
  } finally {
    if (
      options.inFlightOwnSiblingDevicePreparation.get(preparationKey) ===
      preparationPromise
    ) {
      options.inFlightOwnSiblingDevicePreparation.delete(preparationKey);
    }
  }
}
