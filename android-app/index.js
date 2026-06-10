/**
 * @format
 */

import 'fast-text-encoding';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import RNCallKeep from 'react-native-callkeep';
import App from './App';
import { name as appName } from './app.json';

// Raise the native full-screen incoming-call UI when a call wake-up push arrives
// while the app is backgrounded or killed. The live SDP offer follows over the
// realtime channel once the app is foregrounded by answering.
messaging().setBackgroundMessageHandler(async remoteMessage => {
  const data = remoteMessage?.data;
  if (data?.type === 'webrtc-call' && data.callId) {
    const caller = data.caller || 'Incoming call';
    try {
      RNCallKeep.displayIncomingCall(data.callId, caller, caller, 'generic', false);
    } catch {
      // ConnectionService not available — nothing else to do from the headless task.
    }
  }
});

AppRegistry.registerComponent(appName, () => App);
