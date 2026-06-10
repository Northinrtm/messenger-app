// Jest mock for react-native-callkeep (native ConnectionService/CallKit module).

const RNCallKeep = {
  setup: () => Promise.resolve(true),
  setAvailable() {},
  registerAndroidEvents() {},
  unregisterAndroidEvents() {},
  registerPhoneAccount() {},
  displayIncomingCall() {},
  endCall() {},
  endAllCalls() {},
  setCurrentCallActive() {},
  backToForeground() {},
  setReachable() {},
  addEventListener() {},
  removeEventListener() {},
};

module.exports = {__esModule: true, default: RNCallKeep};
