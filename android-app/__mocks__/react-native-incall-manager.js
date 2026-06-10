// Jest mock for react-native-incall-manager (native audio session module).

const inCallManager = {
  start() {},
  stop() {},
  setForceSpeakerphoneOn() {},
  setSpeakerphoneOn() {},
  setKeepScreenOn() {},
  startProximitySensor() {},
  stopProximitySensor() {},
  turnScreenOn() {},
  turnScreenOff() {},
};

module.exports = {__esModule: true, default: inCallManager};
