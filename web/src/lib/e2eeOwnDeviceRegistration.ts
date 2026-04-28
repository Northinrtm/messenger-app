import { ApiError } from "./api";
import type { AuthResponse, UserEncryptionDevice } from "./types";

type DeviceOneTimePrekeyLike = {
  keyId: number;
  publicKey: string;
};

export type DeviceEncryptionMaterialLike = {
  deviceId: string | null;
  identityKey: string;
  identityPrivateKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignaturePrivateKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeyPrivateKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekeys: DeviceOneTimePrekeyLike[];
  createdAt: string;
  signedPrekeyCreatedAt?: string;
};

type PersistedOwnEncryptionDeviceLike = Pick<
  UserEncryptionDevice,
  | "deviceId"
  | "identityKey"
  | "identitySignatureKey"
  | "signedPrekeyPublicKey"
  | "availableOneTimePrekeys"
  | "registeredAt"
>;

type UpsertOwnEncryptionDeviceRequest = {
  deviceId?: string;
  identityKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
};

function buildOwnEncryptionDeviceUpsertRequest(
  material: DeviceEncryptionMaterialLike
): UpsertOwnEncryptionDeviceRequest {
  return {
    deviceId: material.deviceId ?? undefined,
    identityKey: material.identityKey,
    identityKeyAlgorithm: material.identityKeyAlgorithm,
    identitySignatureKey: material.identitySignatureKey,
    identitySignatureKeyAlgorithm: material.identitySignatureKeyAlgorithm,
    signedPrekeyId: material.signedPrekeyId,
    signedPrekeyPublicKey: material.signedPrekeyPublicKey,
    signedPrekeySignature: material.signedPrekeySignature,
    signedPrekeyAlgorithm: material.signedPrekeyAlgorithm,
    oneTimePrekeys: material.oneTimePrekeys.map((prekey) => ({
      keyId: prekey.keyId,
      publicKey: prekey.publicKey,
    })),
  };
}

export function findOwnEncryptionDevice<Material extends DeviceEncryptionMaterialLike>(
  devices: UserEncryptionDevice[],
  material: Material | null
) {
  if (material?.deviceId) {
    const deviceById = devices.find((device) => device.deviceId === material.deviceId);
    if (deviceById) {
      return deviceById;
    }
  }

  if (material) {
    const deviceByKeys =
      devices.find(
        (device) =>
          device.identityKey === material.identityKey &&
          device.identitySignatureKey === material.identitySignatureKey &&
          device.signedPrekeyPublicKey === material.signedPrekeyPublicKey
      ) ?? null;
    if (deviceByKeys) {
      return deviceByKeys;
    }
  }

  return null;
}

export function isRegisteredEncryptionDeviceMaterialAvailable<
  Material extends { deviceId: string | null | undefined },
>(material: Material | null): material is Material & { deviceId: string } {
  return typeof material?.deviceId === "string" && material.deviceId.length > 0;
}

export async function isRegisteredEncryptionDeviceMaterialUsable<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  material: Material | null;
  importDevicePrivateKey: (
    serializedPrivateKey: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
}) {
  const { material } = options;
  if (!isRegisteredEncryptionDeviceMaterialAvailable(material)) {
    return false;
  }

  try {
    await options.importDevicePrivateKey(
      material.identityPrivateKey,
      material.identityKeyAlgorithm,
      ["deriveBits"]
    );
    await options.importDevicePrivateKey(
      material.signedPrekeyPrivateKey,
      material.signedPrekeyAlgorithm,
      ["deriveBits"]
    );
    await options.importDevicePrivateKey(
      material.identitySignaturePrivateKey,
      material.identitySignatureKeyAlgorithm,
      ["sign"]
    );
    return true;
  } catch {
    return false;
  }
}

export async function discardUnusableRegisteredEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  userId: string;
  material: Material | null;
  isRegisteredEncryptionDeviceMaterialUsable: (
    material: Material | null
  ) => Promise<boolean>;
  removeEncryptionDeviceMaterial: (userId: string) => void;
  removeRememberedEncryptionDeviceMaterial: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedEncryptionDeviceRegistration: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
}) {
  if (
    !options.material ||
    (await options.isRegisteredEncryptionDeviceMaterialUsable(options.material))
  ) {
    return options.material;
  }

  options.removeEncryptionDeviceMaterial(options.userId);
  options.removeRememberedEncryptionDeviceMaterial(options.userId);
  options.removeDeviceSessions(options.userId);
  options.removeRememberedDeviceSessions(options.userId);
  options.removeGroupSenderChains(options.userId);
  options.removeGroupHistoryKeys(options.userId);
  options.clearCompletedEncryptionDeviceRegistration(options.userId);
  options.clearCompletedDevicePreparation(options.userId);
  return null;
}

function resetLocalEncryptionStateForReboundDeviceId(options: {
  userId: string;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
}) {
  options.removeDeviceSessions(options.userId);
  options.removeRememberedDeviceSessions(options.userId);
  options.removeGroupSenderChains(options.userId);
  options.removeGroupHistoryKeys(options.userId);
  options.clearCompletedDevicePreparation(options.userId);
}

export function isSignedPrekeyRotationDue<
  Material extends Pick<
    DeviceEncryptionMaterialLike,
    "signedPrekeyCreatedAt" | "createdAt"
  >,
>(
  material: Material | null,
  existingDevice: PersistedOwnEncryptionDeviceLike | null,
  maxAgeMs: number,
  now = Date.now()
) {
  const candidateTimestamp =
    material?.signedPrekeyCreatedAt ??
    existingDevice?.registeredAt ??
    material?.createdAt ??
    null;
  if (!candidateTimestamp) {
    return true;
  }

  const createdAt = Date.parse(candidateTimestamp);
  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return now - createdAt >= maxAgeMs;
}

export function isRegistrationSyncFresh<
  Material extends Pick<DeviceEncryptionMaterialLike, "deviceId" | "oneTimePrekeys">,
>(
  material: Material | null,
  minOneTimePrekeys: number,
  isSignedPrekeyRotationDue: (material: Material | null) => boolean
) {
  if (!material || !isRegisteredEncryptionDeviceMaterialAvailable(material)) {
    return false;
  }

  return (
    material.oneTimePrekeys.length >= minOneTimePrekeys &&
    !isSignedPrekeyRotationDue(material)
  );
}

export async function recoverRegisteredEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  session: AuthResponse;
  material?: Material | null;
  readEncryptionDeviceMaterial: (userId: string) => Promise<Material | null>;
  listOwnEncryptionDevices: (token: string) => Promise<UserEncryptionDevice[]>;
  writeEncryptionDeviceMaterial: (userId: string, material: Material) => void;
  rememberEncryptionDeviceMaterial: (
    userId: string,
    material: Material
  ) => Promise<void>;
  markRegistrationCompleted: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
}) {
  let currentMaterial =
    options.material ??
    (await options.readEncryptionDeviceMaterial(options.session.user.id));
  if (!currentMaterial) {
    return currentMaterial;
  }
  if (currentMaterial.deviceId) {
    return currentMaterial;
  }

  try {
    const existingDevice = findOwnEncryptionDevice(
      await options.listOwnEncryptionDevices(options.session.token),
      currentMaterial
    );
    if (
      !existingDevice ||
      existingDevice.identityKey !== currentMaterial.identityKey ||
      existingDevice.identitySignatureKey !== currentMaterial.identitySignatureKey ||
      existingDevice.signedPrekeyPublicKey !==
        currentMaterial.signedPrekeyPublicKey
    ) {
      return currentMaterial;
    }

    const hydratedMaterial = {
      ...currentMaterial,
      deviceId: existingDevice.deviceId,
    };
    if (
      currentMaterial.deviceId &&
      currentMaterial.deviceId !== existingDevice.deviceId
    ) {
      resetLocalEncryptionStateForReboundDeviceId({
        userId: options.session.user.id,
        removeDeviceSessions: options.removeDeviceSessions,
        removeRememberedDeviceSessions: options.removeRememberedDeviceSessions,
        removeGroupSenderChains: options.removeGroupSenderChains,
        removeGroupHistoryKeys: options.removeGroupHistoryKeys,
        clearCompletedDevicePreparation: options.clearCompletedDevicePreparation,
      });
    }
    options.writeEncryptionDeviceMaterial(
      options.session.user.id,
      hydratedMaterial
    );
    await options.rememberEncryptionDeviceMaterial(
      options.session.user.id,
      hydratedMaterial
    );
    options.markRegistrationCompleted(options.session.user.id);
    return hydratedMaterial;
  } catch {
    return currentMaterial;
  }
}

export async function forceRegisterEncryptionDevice<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  session: AuthResponse;
  isSecureContextAvailable: () => boolean;
  readEncryptionDeviceMaterial: (userId: string) => Promise<Material | null>;
  removeEncryptionDeviceMaterial: (userId: string) => void;
  removeRememberedEncryptionDeviceMaterial: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedEncryptionDeviceRegistration: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
  createEncryptionDeviceMaterial: () => Promise<Material>;
  upsertOwnEncryptionDevice: (
    token: string,
    payload: UpsertOwnEncryptionDeviceRequest
  ) => Promise<{ deviceId: string }>;
  writeEncryptionDeviceMaterial: (userId: string, material: Material) => void;
  rememberEncryptionDeviceMaterial: (
    userId: string,
    material: Material
  ) => Promise<void>;
  markRegistrationCompleted: (userId: string) => void;
}) {
  if (!options.isSecureContextAvailable()) {
    return await options.readEncryptionDeviceMaterial(options.session.user.id);
  }

  options.removeEncryptionDeviceMaterial(options.session.user.id);
  options.removeRememberedEncryptionDeviceMaterial(options.session.user.id);
  options.removeDeviceSessions(options.session.user.id);
  options.removeRememberedDeviceSessions(options.session.user.id);
  options.removeGroupSenderChains(options.session.user.id);
  options.removeGroupHistoryKeys(options.session.user.id);
  options.clearCompletedEncryptionDeviceRegistration(options.session.user.id);
  options.clearCompletedDevicePreparation(options.session.user.id);

  const nextMaterial = await options.createEncryptionDeviceMaterial();
  const persistedDevice = await options.upsertOwnEncryptionDevice(
    options.session.token,
    buildOwnEncryptionDeviceUpsertRequest(nextMaterial)
  );
  const persistedMaterial = {
    ...nextMaterial,
    deviceId: persistedDevice.deviceId,
  };
  options.writeEncryptionDeviceMaterial(
    options.session.user.id,
    persistedMaterial
  );
  await options.rememberEncryptionDeviceMaterial(
    options.session.user.id,
    persistedMaterial
  );
  options.markRegistrationCompleted(options.session.user.id);
  return persistedMaterial;
}

export async function ensureRegisteredEncryptionDeviceInternal<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  session: AuthResponse;
  isSecureContextAvailable: () => boolean;
  listOwnEncryptionDevices: (token: string) => Promise<UserEncryptionDevice[]>;
  readEncryptionDeviceMaterial: (userId: string) => Promise<Material | null>;
  discardUnusableRegisteredEncryptionDeviceMaterial: (
    userId: string,
    material: Material | null
  ) => Promise<Material | null>;
  isSignedPrekeyRotationDue: (
    material: Material | null,
    existingDevice: UserEncryptionDevice | null
  ) => boolean;
  minOneTimePrekeys: number;
  refreshEncryptionDeviceMaterial: (
    material: Material,
    options: { rotateSignedPrekey: boolean }
  ) => Promise<Material>;
  createEncryptionDeviceMaterial: () => Promise<Material>;
  upsertOwnEncryptionDevice: (
    token: string,
    payload: UpsertOwnEncryptionDeviceRequest
  ) => Promise<{ deviceId: string }>;
  writeEncryptionDeviceMaterial: (userId: string, material: Material) => void;
  rememberEncryptionDeviceMaterial: (
    userId: string,
    material: Material
  ) => Promise<void>;
  markRegistrationCompleted: (userId: string) => void;
  removeDeviceSessions: (userId: string) => void;
  removeRememberedDeviceSessions: (userId: string) => void;
  removeGroupSenderChains: (userId: string) => void;
  removeGroupHistoryKeys: (userId: string) => void;
  clearCompletedDevicePreparation: (userId: string) => void;
}) {
  if (!options.isSecureContextAvailable()) {
    return;
  }

  let ownDevices: UserEncryptionDevice[] = [];
  try {
    ownDevices = await options.listOwnEncryptionDevices(options.session.token);
  } catch {
    return;
  }

  let material =
    await options.discardUnusableRegisteredEncryptionDeviceMaterial(
      options.session.user.id,
      await options.readEncryptionDeviceMaterial(options.session.user.id)
    );
  const existingDevice = findOwnEncryptionDevice(ownDevices, material);

  const rotateSignedPrekey = options.isSignedPrekeyRotationDue(
    material,
    existingDevice
  );
  const hasMatchingExistingDeviceMaterial = Boolean(
    material &&
      existingDevice &&
      existingDevice.identityKey === material.identityKey &&
      existingDevice.identitySignatureKey === material.identitySignatureKey &&
      existingDevice.signedPrekeyPublicKey === material.signedPrekeyPublicKey
  );

  if (
    material &&
    existingDevice &&
    hasMatchingExistingDeviceMaterial &&
    material.deviceId !== existingDevice.deviceId
  ) {
    const hydratedMaterial = {
      ...material,
      deviceId: existingDevice.deviceId,
    };
    resetLocalEncryptionStateForReboundDeviceId({
      userId: options.session.user.id,
      removeDeviceSessions: options.removeDeviceSessions,
      removeRememberedDeviceSessions: options.removeRememberedDeviceSessions,
      removeGroupSenderChains: options.removeGroupSenderChains,
      removeGroupHistoryKeys: options.removeGroupHistoryKeys,
      clearCompletedDevicePreparation: options.clearCompletedDevicePreparation,
    });
    options.writeEncryptionDeviceMaterial(
      options.session.user.id,
      hydratedMaterial
    );
    await options.rememberEncryptionDeviceMaterial(
      options.session.user.id,
      hydratedMaterial
    );
    options.markRegistrationCompleted(options.session.user.id);
    options.clearCompletedDevicePreparation(options.session.user.id);
    material = hydratedMaterial;
  }

  if (
    material &&
    existingDevice &&
    hasMatchingExistingDeviceMaterial &&
    material.deviceId === existingDevice.deviceId &&
    existingDevice.availableOneTimePrekeys >= options.minOneTimePrekeys &&
    !rotateSignedPrekey
  ) {
    options.markRegistrationCompleted(options.session.user.id);
    return;
  }

  const nextMaterial = material
    ? await options.refreshEncryptionDeviceMaterial(material, {
        rotateSignedPrekey,
      })
    : await options.createEncryptionDeviceMaterial();

  try {
    const persistedDevice = await options.upsertOwnEncryptionDevice(
      options.session.token,
      buildOwnEncryptionDeviceUpsertRequest(nextMaterial)
    );
    if (
      material?.deviceId &&
      material.deviceId !== persistedDevice.deviceId
    ) {
      resetLocalEncryptionStateForReboundDeviceId({
        userId: options.session.user.id,
        removeDeviceSessions: options.removeDeviceSessions,
        removeRememberedDeviceSessions: options.removeRememberedDeviceSessions,
        removeGroupSenderChains: options.removeGroupSenderChains,
        removeGroupHistoryKeys: options.removeGroupHistoryKeys,
        clearCompletedDevicePreparation: options.clearCompletedDevicePreparation,
      });
    }
    const persistedMaterial = {
      ...nextMaterial,
      deviceId: persistedDevice.deviceId,
    };
    options.writeEncryptionDeviceMaterial(
      options.session.user.id,
      persistedMaterial
    );
    await options.rememberEncryptionDeviceMaterial(
      options.session.user.id,
      persistedMaterial
    );
    options.markRegistrationCompleted(options.session.user.id);
    options.clearCompletedDevicePreparation(options.session.user.id);
  } catch {
    return;
  }
}

export async function waitForEncryptionDeviceRegistration<
  Material extends DeviceEncryptionMaterialLike,
>(options: {
  session: AuthResponse;
  rememberRecoverySyncSession: (session: AuthResponse) => void;
  getInFlightRegistration: (registrationKey: string) => Promise<void> | undefined;
  readEncryptionDeviceMaterial: (userId: string) => Promise<Material | null>;
  discardUnusableRegisteredEncryptionDeviceMaterial: (
    userId: string,
    material: Material | null
  ) => Promise<Material | null>;
  hasFreshCompletedEncryptionDeviceRegistration: (
    registrationKey: string
  ) => boolean;
  ensureRegisteredEncryptionDevice: (session: AuthResponse) => Promise<void>;
  recoverRegisteredEncryptionDeviceMaterial: (
    session: AuthResponse,
    material?: Material | null
  ) => Promise<Material | null>;
  forceRegisterEncryptionDevice: (
    session: AuthResponse
  ) => Promise<Material | null>;
  initializationErrorMessage: string;
}) {
  options.rememberRecoverySyncSession(options.session);
  const registrationKey = options.session.user.id;
  const inFlightRegistration =
    options.getInFlightRegistration(registrationKey);
  if (inFlightRegistration) {
    await inFlightRegistration;
    return;
  }

  const hasFreshUsableRegistration = (material: Material | null) =>
    options.hasFreshCompletedEncryptionDeviceRegistration(registrationKey) &&
    isRegisteredEncryptionDeviceMaterialAvailable(material);

  let material =
    await options.discardUnusableRegisteredEncryptionDeviceMaterial(
      options.session.user.id,
      await options.readEncryptionDeviceMaterial(options.session.user.id)
    );
  if (hasFreshUsableRegistration(material)) {
    return;
  }

  await options.ensureRegisteredEncryptionDevice(options.session);
  material =
    await options.discardUnusableRegisteredEncryptionDeviceMaterial(
      options.session.user.id,
      await options.readEncryptionDeviceMaterial(options.session.user.id)
    );
  if (hasFreshUsableRegistration(material)) {
    return;
  }

  material = await options.recoverRegisteredEncryptionDeviceMaterial(
    options.session,
    material
  );
  material =
    await options.discardUnusableRegisteredEncryptionDeviceMaterial(
      options.session.user.id,
      material
    );
  if (hasFreshUsableRegistration(material)) {
    return;
  }

  material = await options.forceRegisterEncryptionDevice(options.session);
  material =
    await options.discardUnusableRegisteredEncryptionDeviceMaterial(
      options.session.user.id,
      material
    );
  if (hasFreshUsableRegistration(material)) {
    return;
  }

  throw new ApiError(options.initializationErrorMessage, 409);
}
