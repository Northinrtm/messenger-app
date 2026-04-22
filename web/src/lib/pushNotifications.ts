import {
  deletePushSubscription,
  getPushNotificationConfig,
  upsertPushSubscription,
} from "./api";
import { isDesktopRuntime } from "./platform";
import type { PushSubscriptionPayload } from "./types";

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
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }

  await upsertPushSubscription(token, toPushSubscriptionPayload(subscription));
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
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }

  await upsertPushSubscription(token, toPushSubscriptionPayload(subscription));
  return getPushNotificationState(token);
}

function ensurePushSupported() {
  if (!isPushNotificationSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }
}

function toPushSubscriptionPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const payload = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime
      ? new Date(subscription.expirationTime).toISOString()
      : null,
    keys: {
      p256dh: payload.keys?.p256dh ?? "",
      auth: payload.keys?.auth ?? "",
    },
  };
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
