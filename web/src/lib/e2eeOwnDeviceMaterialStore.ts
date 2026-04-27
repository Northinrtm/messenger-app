import type { DeviceEncryptionMaterialLike } from "./e2eeOwnDeviceRegistration";

type DeviceOneTimePrekeyMaterialLike = {
  keyId: number;
  publicKey: string;
  privateKey: string;
};

type RetiredDeviceOneTimePrekeyMaterialLike = DeviceOneTimePrekeyMaterialLike & {
  retiredAt: string;
  expiresAt: string;
};

type RetiredSignedPrekeyMaterialLike = {
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeyPrivateKey: string;
  signedPrekeyAlgorithm: string;
  retiredAt: string;
  expiresAt: string;
};

export type DeviceEncryptionMaterialStoreLike = DeviceEncryptionMaterialLike & {
  materialId: string;
  retiredOneTimePrekeys?: RetiredDeviceOneTimePrekeyMaterialLike[];
  retiredSignedPrekeys?: RetiredSignedPrekeyMaterialLike[];
  signedPrekeyCreatedAt: string;
};

type RememberedDeviceEncryptionMaterialRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type UnlockedIdentityLike = {
  privateKey: string;
};

export function normalizeRetiredSignedPrekey(
  value: unknown
): RetiredSignedPrekeyMaterialLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<RetiredSignedPrekeyMaterialLike>;
  if (
    typeof parsed.signedPrekeyId !== "number" ||
    typeof parsed.signedPrekeyPublicKey !== "string" ||
    typeof parsed.signedPrekeyPrivateKey !== "string" ||
    typeof parsed.signedPrekeyAlgorithm !== "string" ||
    typeof parsed.retiredAt !== "string" ||
    typeof parsed.expiresAt !== "string"
  ) {
    return null;
  }

  return parsed as RetiredSignedPrekeyMaterialLike;
}

export function normalizeRetiredOneTimePrekey(
  value: unknown
): RetiredDeviceOneTimePrekeyMaterialLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<RetiredDeviceOneTimePrekeyMaterialLike>;
  if (
    typeof parsed.keyId !== "number" ||
    typeof parsed.publicKey !== "string" ||
    typeof parsed.privateKey !== "string" ||
    typeof parsed.retiredAt !== "string" ||
    typeof parsed.expiresAt !== "string"
  ) {
    return null;
  }

  return parsed as RetiredDeviceOneTimePrekeyMaterialLike;
}

export function pruneRetiredSignedPrekeys(
  prekeys: RetiredSignedPrekeyMaterialLike[] | undefined,
  now = Date.now()
) {
  return (prekeys ?? []).filter((prekey) => {
    const expiresAt = Date.parse(prekey.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

export function pruneRetiredOneTimePrekeys(
  prekeys: RetiredDeviceOneTimePrekeyMaterialLike[] | undefined,
  now = Date.now()
) {
  return (prekeys ?? []).filter((prekey) => {
    const expiresAt = Date.parse(prekey.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

export function normalizeDeviceEncryptionMaterial(
  value: unknown
): DeviceEncryptionMaterialStoreLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsedMaterial = value as Partial<DeviceEncryptionMaterialStoreLike>;
  if (
    typeof parsedMaterial.materialId !== "string" ||
    !(
      typeof parsedMaterial.deviceId === "string" ||
      parsedMaterial.deviceId === null ||
      typeof parsedMaterial.deviceId === "undefined"
    ) ||
    typeof parsedMaterial.identityKey !== "string" ||
    typeof parsedMaterial.identityPrivateKey !== "string" ||
    typeof parsedMaterial.identitySignatureKey !== "string" ||
    typeof parsedMaterial.identitySignaturePrivateKey !== "string" ||
    typeof parsedMaterial.signedPrekeyPublicKey !== "string" ||
    typeof parsedMaterial.signedPrekeyPrivateKey !== "string" ||
    typeof parsedMaterial.signedPrekeySignature !== "string" ||
    typeof parsedMaterial.signedPrekeyCreatedAt !== "string" ||
    !Array.isArray(parsedMaterial.oneTimePrekeys)
  ) {
    return null;
  }

  const retiredSignedPrekeys = Array.isArray(parsedMaterial.retiredSignedPrekeys)
    ? parsedMaterial.retiredSignedPrekeys
        .map((prekey) => normalizeRetiredSignedPrekey(prekey))
        .filter(
          (prekey): prekey is RetiredSignedPrekeyMaterialLike => prekey !== null
        )
    : [];
  const retiredOneTimePrekeys = Array.isArray(parsedMaterial.retiredOneTimePrekeys)
    ? parsedMaterial.retiredOneTimePrekeys
        .map((prekey) => normalizeRetiredOneTimePrekey(prekey))
        .filter(
          (prekey): prekey is RetiredDeviceOneTimePrekeyMaterialLike =>
            prekey !== null
        )
    : [];

  return {
    ...(parsedMaterial as DeviceEncryptionMaterialStoreLike),
    retiredSignedPrekeys: pruneRetiredSignedPrekeys(retiredSignedPrekeys),
    retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(retiredOneTimePrekeys),
  };
}

export async function encryptRememberedEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialStoreLike,
>(options: {
  privateKey: string;
  material: Material;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  bytesToBase64: (bytes: Uint8Array) => string;
  textEncoder: TextEncoder;
  kdfIterations: number;
}) {
  const salt = options.randomBytes(16);
  const iv = options.randomBytes(12);
  const wrappingKey = await options.deriveWrappingKey(
    options.privateKey,
    salt,
    options.kdfIterations
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    wrappingKey,
    options.textEncoder.encode(JSON.stringify(options.material))
  );

  return {
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  } satisfies RememberedDeviceEncryptionMaterialRecord;
}

export async function decryptRememberedEncryptionDeviceMaterial(options: {
  privateKey: string;
  record: RememberedDeviceEncryptionMaterialRecord;
  base64ToBytes: (value: string) => Uint8Array;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  textDecoder: TextDecoder;
  kdfIterations: number;
}) {
  try {
    const salt = options.base64ToBytes(options.record.salt);
    const iv = options.base64ToBytes(options.record.iv);
    const ciphertext = options.base64ToBytes(options.record.ciphertext);
    const wrappingKey = await options.deriveWrappingKey(
      options.privateKey,
      salt,
      options.kdfIterations
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
      },
      wrappingKey,
      ciphertext as BufferSource
    );
    return options.textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

export function writeEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialStoreLike,
>(options: {
  userId: string;
  material: Material;
  getEncryptionDeviceStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      options.getEncryptionDeviceStorageKey(options.userId),
      JSON.stringify({
        ...options.material,
        retiredSignedPrekeys: pruneRetiredSignedPrekeys(
          options.material.retiredSignedPrekeys
        ),
        retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(
          options.material.retiredOneTimePrekeys
        ),
      })
    );
  } catch {
    return;
  }
}

export function removeEncryptionDeviceMaterial(options: {
  userId: string;
  getEncryptionDeviceStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      options.getEncryptionDeviceStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export function removeRememberedEncryptionDeviceMaterial(options: {
  userId: string;
  getRememberedEncryptionDeviceStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(
      options.getRememberedEncryptionDeviceStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export async function readRememberedEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialStoreLike,
>(options: {
  userId: string;
  readUnlockedIdentity: (userId: string) => UnlockedIdentityLike | null;
  getRememberedEncryptionDeviceStorageKey: (userId: string) => string;
  decryptRememberedEncryptionDeviceMaterial: (
    privateKey: string,
    record: RememberedDeviceEncryptionMaterialRecord
  ) => Promise<string | null>;
  normalizeDeviceEncryptionMaterial: (value: unknown) => Material | null;
  removeRememberedEncryptionDeviceMaterial: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = options.readUnlockedIdentity(options.userId);
  if (!identity) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      options.getRememberedEncryptionDeviceStorageKey(options.userId)
    );
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<RememberedDeviceEncryptionMaterialRecord>;
    if (
      typeof parsedRecord.salt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      options.removeRememberedEncryptionDeviceMaterial(options.userId);
      return null;
    }

    const materialJson = await options.decryptRememberedEncryptionDeviceMaterial(
      identity.privateKey,
      parsedRecord as RememberedDeviceEncryptionMaterialRecord
    );
    if (!materialJson) {
      options.removeRememberedEncryptionDeviceMaterial(options.userId);
      return null;
    }

    const normalizedMaterial = options.normalizeDeviceEncryptionMaterial(
      JSON.parse(materialJson) as unknown
    );
    if (!normalizedMaterial) {
      options.removeRememberedEncryptionDeviceMaterial(options.userId);
      return null;
    }

    return normalizedMaterial;
  } catch {
    options.removeRememberedEncryptionDeviceMaterial(options.userId);
    return null;
  }
}

export async function rememberEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialStoreLike,
>(options: {
  userId: string;
  material: Material;
  readUnlockedIdentity: (userId: string) => UnlockedIdentityLike | null;
  encryptRememberedEncryptionDeviceMaterial: (
    privateKey: string,
    material: Material
  ) => Promise<RememberedDeviceEncryptionMaterialRecord>;
  getRememberedEncryptionDeviceStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = options.readUnlockedIdentity(options.userId);
  if (!identity) {
    return;
  }

  try {
    const record = await options.encryptRememberedEncryptionDeviceMaterial(
      identity.privateKey,
      {
        ...options.material,
        retiredSignedPrekeys: pruneRetiredSignedPrekeys(
          options.material.retiredSignedPrekeys
        ),
        retiredOneTimePrekeys: pruneRetiredOneTimePrekeys(
          options.material.retiredOneTimePrekeys
        ),
      }
    );
    window.localStorage.setItem(
      options.getRememberedEncryptionDeviceStorageKey(options.userId),
      JSON.stringify(record)
    );
  } catch {
    return;
  }
}

export async function readEncryptionDeviceMaterial<
  Material extends DeviceEncryptionMaterialStoreLike,
>(options: {
  userId: string;
  getEncryptionDeviceStorageKey: (userId: string) => string;
  normalizeDeviceEncryptionMaterial: (value: unknown) => Material | null;
  removeEncryptionDeviceMaterial: (userId: string) => void;
  writeEncryptionDeviceMaterial: (userId: string, material: Material) => void;
  readRememberedEncryptionDeviceMaterial: (
    userId: string
  ) => Promise<Material | null>;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      options.getEncryptionDeviceStorageKey(options.userId)
    );
    if (rawValue) {
      const parsedMaterial = options.normalizeDeviceEncryptionMaterial(
        JSON.parse(rawValue) as unknown
      );
      if (!parsedMaterial) {
        options.removeEncryptionDeviceMaterial(options.userId);
        return null;
      }

      options.writeEncryptionDeviceMaterial(options.userId, parsedMaterial);
      return parsedMaterial;
    }

    const rememberedMaterial = await options.readRememberedEncryptionDeviceMaterial(
      options.userId
    );
    if (rememberedMaterial) {
      options.writeEncryptionDeviceMaterial(options.userId, rememberedMaterial);
      return rememberedMaterial;
    }
  } catch {
    options.removeEncryptionDeviceMaterial(options.userId);
    return null;
  }

  return null;
}
