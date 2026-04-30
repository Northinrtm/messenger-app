export const E2EE_DEVICE_STATE_SYNCED_EVENT = "north-messenger:e2ee-device-state-synced";

export type E2eeDeviceStateSyncedDetail = {
  userId: string;
};

export function dispatchE2eeDeviceStateSynced(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<E2eeDeviceStateSyncedDetail>(E2EE_DEVICE_STATE_SYNCED_EVENT, {
      detail: { userId },
    })
  );
}
