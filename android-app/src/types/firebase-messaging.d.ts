/**
 * Type shim for @react-native-firebase/messaging.
 * Replace with the real package after running:
 *   npm install
 *   cd android && ./gradlew assembleDebug
 * (requires google-services.json to be in place)
 */
declare module '@react-native-firebase/messaging' {
  type AuthorizationStatus = -1 | 0 | 1 | 2;

  interface RemoteMessage {
    data?: Record<string, string>;
    notification?: {
      title?: string;
      body?: string;
    };
  }

  interface FirebaseMessagingTypes {
    requestPermission(): Promise<AuthorizationStatus>;
    getToken(): Promise<string>;
    onTokenRefresh(callback: (token: string) => void): () => void;
    onMessage(callback: (message: RemoteMessage) => Promise<void>): () => void;
    setBackgroundMessageHandler(
      handler: (message: RemoteMessage) => Promise<void>,
    ): void;
    AuthorizationStatus: {
      NOT_DETERMINED: -1;
      DENIED: 0;
      AUTHORIZED: 1;
      PROVISIONAL: 2;
    };
  }

  function messaging(): FirebaseMessagingTypes;
  namespace messaging {
    const AuthorizationStatus: {
      NOT_DETERMINED: -1;
      DENIED: 0;
      AUTHORIZED: 1;
      PROVISIONAL: 2;
    };
  }

  export default messaging;
}
