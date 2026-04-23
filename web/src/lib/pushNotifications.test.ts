import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getPushNotificationConfig: vi.fn(),
  upsertPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

vi.mock("./api", () => ({
  getPushNotificationConfig: apiMocks.getPushNotificationConfig,
  upsertPushSubscription: apiMocks.upsertPushSubscription,
  deletePushSubscription: apiMocks.deletePushSubscription,
}));

import { syncPushSubscription } from "./pushNotifications";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function vapidPublicKey(bytes: Uint8Array) {
  return toBase64Url(bytes);
}

describe("pushNotifications", () => {
  beforeEach(() => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted" },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: class PushManager {},
    });
    apiMocks.deletePushSubscription.mockResolvedValue(undefined);
    apiMocks.upsertPushSubscription.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("re-subscribes when the server VAPID key changed", async () => {
    const oldKey = new Uint8Array(65).fill(1);
    oldKey[0] = 4;
    const newKey = new Uint8Array(65).fill(2);
    newKey[0] = 4;

    apiMocks.getPushNotificationConfig.mockResolvedValue({
      enabled: true,
      publicKey: vapidPublicKey(newKey),
    });

    let currentSubscription: PushSubscription | null = null;
    const oldSubscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/old",
      expirationTime: null,
      options: {
        applicationServerKey: oldKey.buffer,
      },
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/old",
        expirationTime: null,
        keys: {
          p256dh: "old-p256dh",
          auth: "old-auth",
        },
      }),
      unsubscribe: vi.fn(async () => {
        currentSubscription = null;
        return true;
      }),
    } as unknown as PushSubscription;

    const newSubscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/new",
      expirationTime: null,
      options: {
        applicationServerKey: newKey.buffer,
      },
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/new",
        expirationTime: null,
        keys: {
          p256dh: "new-p256dh",
          auth: "new-auth",
        },
      }),
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;

    currentSubscription = oldSubscription;

    const subscribe = vi.fn(async () => {
      currentSubscription = newSubscription;
      return newSubscription;
    });
    const getSubscription = vi.fn(async () => currentSubscription);
    const registration = {
      pushManager: {
        getSubscription,
        subscribe,
      },
    } as unknown as ServiceWorkerRegistration;

    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: vi.fn(async () => registration),
        getRegistration: vi.fn(async () => registration),
      },
    });

    await expect(syncPushSubscription("access-token")).resolves.toEqual({
      supported: true,
      serverEnabled: true,
      subscribed: true,
      permission: "granted",
    });

    expect(apiMocks.deletePushSubscription).toHaveBeenCalledWith(
      "access-token",
      "https://fcm.googleapis.com/fcm/send/old"
    );
    expect(oldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(apiMocks.upsertPushSubscription).toHaveBeenCalledWith("access-token", {
      endpoint: "https://fcm.googleapis.com/fcm/send/new",
      expirationTime: null,
      keys: {
        p256dh: "new-p256dh",
        auth: "new-auth",
      },
    });
  });

  it("keeps the existing subscription when the VAPID key matches", async () => {
    const currentKey = new Uint8Array(65).fill(3);
    currentKey[0] = 4;

    apiMocks.getPushNotificationConfig.mockResolvedValue({
      enabled: true,
      publicKey: vapidPublicKey(currentKey),
    });

    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/current",
      expirationTime: null,
      options: {
        applicationServerKey: currentKey.buffer,
      },
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/current",
        expirationTime: null,
        keys: {
          p256dh: "current-p256dh",
          auth: "current-auth",
        },
      }),
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;

    const subscribe = vi.fn();
    const registration = {
      pushManager: {
        getSubscription: vi.fn(async () => subscription),
        subscribe,
      },
    } as unknown as ServiceWorkerRegistration;

    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: vi.fn(async () => registration),
        getRegistration: vi.fn(async () => registration),
      },
    });

    await syncPushSubscription("access-token");

    expect(apiMocks.deletePushSubscription).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(apiMocks.upsertPushSubscription).toHaveBeenCalledWith("access-token", {
      endpoint: "https://fcm.googleapis.com/fcm/send/current",
      expirationTime: null,
      keys: {
        p256dh: "current-p256dh",
        auth: "current-auth",
      },
    });
  });
});
