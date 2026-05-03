export const TRUSTED_BROWSER_STORAGE_PREFIX = "north-messenger:trusted-browser-e2ee:";

export type TrustedBrowserUnlockRecord = {
  credentialId: string;
  prfSalt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export function getTrustedBrowserStorageKey(userId: string) {
  return `${TRUSTED_BROWSER_STORAGE_PREFIX}${userId}`;
}

export function readTrustedBrowserUnlockRecord(userId: string): TrustedBrowserUnlockRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTrustedBrowserStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as Partial<TrustedBrowserUnlockRecord>;
    if (
      typeof parsedRecord.credentialId !== "string" ||
      typeof parsedRecord.prfSalt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      window.localStorage.removeItem(getTrustedBrowserStorageKey(userId));
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
      window.localStorage.removeItem(getTrustedBrowserStorageKey(userId));
    } catch {
      return null;
    }
    return null;
  }
}

export function writeTrustedBrowserUnlockRecord(
  userId: string,
  record: TrustedBrowserUnlockRecord
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getTrustedBrowserStorageKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

export function removeTrustedBrowserUnlockRecord(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getTrustedBrowserStorageKey(userId));
  } catch {
    return;
  }
}

export function isTrustedBrowserUnlockSupported() {
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

export function hasTrustedBrowserUnlock(userId: string) {
  return readTrustedBrowserUnlockRecord(userId) !== null;
}
