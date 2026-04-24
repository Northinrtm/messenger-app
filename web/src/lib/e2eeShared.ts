import { ApiError } from "./api";

export const ENCRYPTED_MESSAGE_UNAVAILABLE = "[Encrypted message unavailable]";
export const ENCRYPTION_IDENTITY_CHANGED_MESSAGE =
  "Encryption identity changed for this account in this browser. Re-establish trust before continuing";
export const ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE =
  "Current password could not restore encrypted chats on this device";
export const ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE =
  "Encrypted chats already exist for this account, but this device could not restore their keys";
export const ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE = "Encryption recovery snapshot is invalid";
export const ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE =
  "Encryption recovery snapshot could not be decrypted on this device";
export const PINNED_DEVICE_BUNDLE_STORAGE_PREFIX = "north-messenger:pinned-device-e2ee:";

const RESETTABLE_ENCRYPTION_RECOVERY_MESSAGES = new Set([
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
]);

function clearPinnedIdentityKeys(prefix: string) {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const currentKey = window.localStorage.key(index);
    if (currentKey?.startsWith(prefix)) {
      keysToRemove.push(currentKey);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

export function clearPinnedEncryptionIdentity(userId?: string) {
  clearPinnedIdentityKeys(
    userId ? `${PINNED_DEVICE_BUNDLE_STORAGE_PREFIX}${userId}:` : PINNED_DEVICE_BUNDLE_STORAGE_PREFIX
  );
}

export function isUnavailableEncryptedMessage(content: string) {
  return content === ENCRYPTED_MESSAGE_UNAVAILABLE;
}

export function isEncryptionIdentityChangedError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === ENCRYPTION_IDENTITY_CHANGED_MESSAGE
  );
}

export function isResettableEncryptionRecoveryError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    RESETTABLE_ENCRYPTION_RECOVERY_MESSAGES.has(error.message)
  );
}
