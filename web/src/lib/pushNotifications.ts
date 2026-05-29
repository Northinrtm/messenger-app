import {
  ApiError,
  deletePushSubscription,
  getPushNotificationConfig,
  upsertPushSubscription,
} from "./api";
import { isDesktopRuntime } from "./platform";
import type { PushSubscriptionPayload } from "./types";

const MAX_SUBSCRIPTION_SYNC_RETRIES = 3;

export type PushNotificationPermission = NotificationPermission | "unsupported";

export type PushNotificationClientState = {
  supported: boolean;
  serverEnabled: boolean;
  subscribed: boolean;
  permission: PushNotificationPermission;
};

const PUSH_SERVICE_WORKER_URL = "/push-sw.js";
const PUSH_SERVICE_WORKER_SCOPE = "/";

export function isPushNotificationSupported() {
  return (
    !isDesktopRuntime() &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getPushNotificationState(token: string): Promise<PushNotificationClientState> {
  if (!isPushNotificationSupported()) {
    return {
      supported: false,
      serverEnabled: false,
      subscribed: false,
      permission: "unsupported",
    };
  }

  const config = await getPushNotificationConfig(token);
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  return {
    supported: true,
    serverEnabled: config.enabled && Boolean(config.publicKey),
    subscribed: Notification.permission === "granted" && Boolean(subscription),
    permission: Notification.permission,
  };
}

export async function enablePushNotifications(token: string) {
  ensurePushSupported();
  const config = await getPushNotificationConfig(token);
  if (!config.enabled || !config.publicKey) {
    throw new Error("Push notifications are disabled on this server");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_URL, {
    scope: PUSH_SERVICE_WORKER_SCOPE,
  });
  let subscription = await ensureCompatiblePushSubscription(
    token,
    registration,
    config.publicKey
  );
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }

  await upsertPushSubscriptionWithRetry(token, toPushSubscriptionPayload(subscription));
  return getPushNotificationState(token);
}

export async function disablePushNotifications(token: string) {
  if (!isPushNotificationSupported()) {
    return getPushNotificationState(token);
  }

  const registration = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await deletePushSubscription(token, subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  }
  return getPushNotificationState(token);
}

export async function syncPushSubscription(token: string) {
  if (!isPushNotificationSupported() || Notification.permission !== "granted") {
    return getPushNotificationState(token);
  }

  const config = await getPushNotificationConfig(token);
  if (!config.enabled || !config.publicKey) {
    return getPushNotificationState(token);
  }

  const registration = await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_URL, {
    scope: PUSH_SERVICE_WORKER_SCOPE,
  });
  let subscription = await ensureCompatiblePushSubscription(
    token,
    registration,
    config.publicKey
  );
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }

  await upsertPushSubscriptionWithRetry(token, toPushSubscriptionPayload(subscription));
  return getPushNotificationState(token);
}

async function ensureCompatiblePushSubscription(
  token: string,
  registration: ServiceWorkerRegistration,
  publicKey: string
) {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription || hasMatchingApplicationServerKey(subscription, publicKey)) {
    return subscription;
  }

  await deletePushSubscription(token, subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
  return null;
}

function ensurePushSupported() {
  if (!isPushNotificationSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }
}

function toPushSubscriptionPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const payload = subscription.toJSON();
  const p256dh = payload.keys?.p256dh ?? "";
  const auth = payload.keys?.auth ?? "";
  if (!p256dh || !auth) {
    throw new Error("Push subscription is missing required encryption keys (p256dh/auth)");
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime
      ? new Date(subscription.expirationTime).toISOString()
      : null,
    keys: { p256dh, auth },
  };
}

async function upsertPushSubscriptionWithRetry(
  token: string,
  payload: PushSubscriptionPayload
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SUBSCRIPTION_SYNC_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
    try {
      await upsertPushSubscription(token, payload);
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        throw err;
      }
    }
  }
  throw lastError;
}

function hasMatchingApplicationServerKey(subscription: PushSubscription, publicKey: string) {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) {
    return false;
  }

  const currentBytes = new Uint8Array(currentKey);
  const expectedBytes = base64UrlToUint8Array(publicKey);
  if (currentBytes.length !== expectedBytes.length) {
    return false;
  }

  for (let index = 0; index < currentBytes.length; index += 1) {
    if (currentBytes[index] !== expectedBytes[index]) {
      return false;
    }
  }
  return true;
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}
