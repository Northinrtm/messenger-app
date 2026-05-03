export const E2EE_ENCRYPTION_STATE_SYNCED_EVENT =
  "north-messenger:e2ee-encryption-state-synced";

export type E2eeEncryptionStateSyncedDetail = {
  userId: string;
};

export function dispatchE2eeEncryptionStateSynced(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<E2eeEncryptionStateSyncedDetail>(E2EE_ENCRYPTION_STATE_SYNCED_EVENT, {
      detail: { userId },
    })
  );
}
