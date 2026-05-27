/**
 * Jest manual mock for @react-native-firebase/messaging.
 * The real native module is not available in the test environment.
 */
const messaging = jest.fn(() => ({
  requestPermission: jest.fn(() => Promise.resolve(1)),
  getToken: jest.fn(() => Promise.resolve('test-fcm-token')),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  setBackgroundMessageHandler: jest.fn(),
}));

messaging.AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

export default messaging;
