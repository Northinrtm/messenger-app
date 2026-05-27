/**
 * FCM push token management for Android.
 *
 * Setup required before this works:
 *  1. Copy android/app/google-services.json.example → google-services.json and fill in values
 *     from Firebase Console (Project Settings → General → Your apps → Android app).
 *  2. Set APP_PUSH_FCM_ENABLED=true and APP_PUSH_FCM_SERVICE_ACCOUNT_JSON on the server
 *     (Firebase Console → Project Settings → Service accounts → Generate new private key).
 *  3. Run `npm install` — @react-native-firebase/app and @react-native-firebase/messaging
 *     are already listed in package.json.
 *  4. Rebuild the native APK: cd android && ./gradlew assembleDebug
 */

import messaging from '@react-native-firebase/messaging';
import {API_URL} from '../config';

async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

async function getFcmToken(): Promise<string | null> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return null;
    }
    return await messaging().getToken();
  } catch {
    return null;
  }
}

async function registerTokenWithBackend(
  token: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/mobile/push/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({token, platform: 'ANDROID'}),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`FCM token registration failed: ${response.status}`);
  }
}

async function unregisterTokenFromBackend(
  token: string,
  accessToken: string,
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/mobile/push/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({token}),
    });
  } catch {
    // Best-effort — logout should still proceed
  }
}

/**
 * Called after a successful login/register/session-restore.
 * Gets the FCM token and registers it with the backend.
 * Returns a cleanup function that unsubscribes from token-refresh events.
 */
export function initFcmForSession(
  accessToken: string,
  getLatestToken: () => string,
): () => void {
  let currentToken: string | null = null;

  getFcmToken()
    .then(token => {
      if (!token) return;
      currentToken = token;
      return registerTokenWithBackend(token, accessToken);
    })
    .catch(() => undefined);

  const unsubscribeRefresh = messaging().onTokenRefresh(newToken => {
    currentToken = newToken;
    registerTokenWithBackend(newToken, getLatestToken()).catch(() => undefined);
  });

  return () => {
    unsubscribeRefresh();
  };
}

/**
 * Called before logout. Unregisters the FCM token from the backend.
 */
export async function cleanupFcmForSession(accessToken: string): Promise<void> {
  try {
    const token = await messaging().getToken();
    if (token) {
      await unregisterTokenFromBackend(token, accessToken);
    }
  } catch {
    // Best-effort
  }
}

/**
 * Sets up foreground message handler.
 * Background/killed-state messages are delivered natively by FCM without any code.
 * Returns an unsubscribe function.
 */
export function setupFcmForegroundHandler(
  onMessage: (chatId: string) => void,
): () => void {
  return messaging().onMessage(async remoteMessage => {
    const chatId = remoteMessage.data?.chatId as string | undefined;
    if (chatId) {
      onMessage(chatId);
    }
  });
}
