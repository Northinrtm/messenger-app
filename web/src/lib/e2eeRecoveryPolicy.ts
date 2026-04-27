import { ApiError } from "./api";

export type EncryptedEnvelopeRecoveryMode = "session" | "device";

const RECOVERABLE_SESSION_ERROR_MESSAGES = new Set([
  "Encrypted device envelope recipient one-time prekey is invalid",
  "Encrypted device envelope recipient one-time prekey sender is invalid",
  "Encrypted device envelope recipient one-time prekey was already used",
  "Encrypted device envelope recipient prekey is stale",
  "Encrypted device envelope message counter is stale",
  "Encrypted device envelope chain metadata is invalid",
  "Encrypted device envelope must start at counter zero",
  "Encrypted device envelope message counter advanced too far",
  "Encrypted group envelope message counter is stale",
  "Encrypted group envelope must start at counter zero",
  "Encrypted group envelope message counter advanced too far",
  "Group history key recipient prekey is stale",
  "Group history key access contains unknown recipient devices",
  "Encrypted payload contains unknown recipient devices",
  "Encrypted payload must include every active participant device",
  "Encrypted device envelope recipient device is invalid",
]);

const RECOVERABLE_DEVICE_ERROR_MESSAGES = new Set([
  "Encrypted device envelope sender device is invalid",
  "Encrypted device envelope sender identity does not match the registered device",
]);

export function getRecoverableEncryptedEnvelopeErrorMode(
  error: unknown
): EncryptedEnvelopeRecoveryMode | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }

  if (RECOVERABLE_SESSION_ERROR_MESSAGES.has(error.message)) {
    return "session";
  }

  return RECOVERABLE_DEVICE_ERROR_MESSAGES.has(error.message) ? "device" : null;
}
