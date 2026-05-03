import { ApiError } from "./api";

export const ENCRYPTED_MESSAGE_UNAVAILABLE = "[Encrypted message unavailable]";
export const ENCRYPTION_INITIALIZING_MESSAGE =
  "Encrypted chat is still initializing in this browser session. Try again.";
export const ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE =
  "Current password could not restore encrypted chats in this browser session";
export const ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE =
  "Encrypted chats are still protected by a previous account password. Try the password you used before changing it";
export const ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE =
  "Encrypted chats already exist for this account, but this browser session could not restore their keys";
export const ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE = "Encryption recovery snapshot is invalid";
export const ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE =
  "Encryption recovery snapshot could not be decrypted in this browser session";

const RESETTABLE_ENCRYPTION_RECOVERY_MESSAGES = new Set([
  ENCRYPTION_RECOVERY_EXISTING_CHATS_MESSAGE,
  ENCRYPTION_RECOVERY_PASSWORD_RESTORE_FAILED_MESSAGE,
  ENCRYPTION_RECOVERY_PREVIOUS_PASSWORD_REQUIRED_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_INVALID_MESSAGE,
  ENCRYPTION_RECOVERY_SNAPSHOT_DECRYPT_FAILED_MESSAGE,
]);

export function isUnavailableEncryptedMessage(content: string) {
  return content === ENCRYPTED_MESSAGE_UNAVAILABLE;
}

export function isResettableEncryptionRecoveryError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    RESETTABLE_ENCRYPTION_RECOVERY_MESSAGES.has(error.message)
  );
}

export function isRetryableEncryptedSendError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === ENCRYPTION_INITIALIZING_MESSAGE
  );
}
