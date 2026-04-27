export const TRUSTED_DEVICE_STORAGE_PREFIX = "north-messenger:trusted-device-e2ee:";

export type TrustedDeviceUnlockRecord = {
  credentialId: string;
  prfSalt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export function getTrustedDeviceStorageKey(userId: string) {
  return `${TRUSTED_DEVICE_STORAGE_PREFIX}${userId}`;
}

export function readTrustedDeviceUnlockRecord(userId: string): TrustedDeviceUnlockRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTrustedDeviceStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<TrustedDeviceUnlockRecord>;
    if (
      typeof parsedRecord.credentialId !== "string" ||
      typeof parsedRecord.prfSalt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      window.localStorage.removeItem(getTrustedDeviceStorageKey(userId));
      return null;
    }

    return {
      credentialId: parsedRecord.credentialId,
      prfSalt: parsedRecord.prfSalt,
      iv: parsedRecord.iv,
      ciphertext: parsedRecord.ciphertext,
      createdAt: typeof parsedRecord.createdAt === "string" ? parsedRecord.createdAt : "",
    };
  } catch {
    try {
      window.localStorage.removeItem(getTrustedDeviceStorageKey(userId));
    } catch {
      return null;
    }
    return null;
  }
}

export function writeTrustedDeviceUnlockRecord(
  userId: string,
  record: TrustedDeviceUnlockRecord
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getTrustedDeviceStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

export function removeTrustedDeviceUnlockRecord(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getTrustedDeviceStorageKey(userId));
  } catch {
    return;
  }
}

export function isTrustedDeviceUnlockSupported() {
  if (typeof window === "undefined") {
    return false;
  }

  const credentialsContainer = navigator.credentials;
  return Boolean(
    window.isSecureContext &&
      typeof PublicKeyCredential !== "undefined" &&
      credentialsContainer &&
      typeof credentialsContainer.create === "function" &&
      typeof credentialsContainer.get === "function"
  );
}

export function hasTrustedDeviceUnlock(userId: string) {
  return readTrustedDeviceUnlockRecord(userId) !== null;
}
