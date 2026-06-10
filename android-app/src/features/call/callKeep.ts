import {Platform} from 'react-native';
import RNCallKeep from 'react-native-callkeep';
import {tActive} from '../../i18n';

/**
 * Thin wrapper around react-native-callkeep so the rest of the app deals with a
 * small, platform-guarded surface. Uses self-managed ConnectionService on Android
 * to show the system full-screen incoming-call UI (over the lock screen).
 */

let configured = false;

export async function setupCallKeep(): Promise<boolean> {
  if (Platform.OS !== 'android' || configured) {
    return configured;
  }
  try {
    await RNCallKeep.setup({
      ios: {appName: 'Акатосфера ИИ'},
      android: {
        alertTitle: tActive('call.permTitle'),
        alertDescription: tActive('call.permDesc'),
        cancelButton: tActive('call.cancel'),
        okButton: 'OK',
        additionalPermissions: [],
        selfManaged: true,
        foregroundService: {
          channelId: 'north_calls',
          channelName: tActive('call.activeCall'),
          notificationTitle: tActive('call.activeCall'),
        },
      },
    });
    RNCallKeep.setAvailable(true);
    RNCallKeep.registerAndroidEvents();
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export function displayIncomingCallUi(callId: string, name: string): void {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    RNCallKeep.displayIncomingCall(callId, name, name, 'generic', false);
  } catch {
    // ignore
  }
}

export function endCallKeepCall(callId: string): void {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    RNCallKeep.endCall(callId);
  } catch {
    // ignore
  }
}

export function setCallKeepActive(callId: string): void {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    RNCallKeep.setCurrentCallActive(callId);
  } catch {
    // ignore
  }
}

export function registerCallKeepHandlers(handlers: {
  onAnswer: (callId: string) => void;
  onEnd: (callId: string) => void;
  onMuteChange: (muted: boolean) => void;
}): () => void {
  if (Platform.OS !== 'android') {
    return () => undefined;
  }

  const onAnswer = ({callUUID}: {callUUID: string}) => {
    try {
      RNCallKeep.backToForeground();
    } catch {
      // ignore
    }
    handlers.onAnswer(callUUID);
  };
  const onEnd = ({callUUID}: {callUUID: string}) => handlers.onEnd(callUUID);
  const onMute = ({muted}: {muted: boolean}) => handlers.onMuteChange(muted);

  RNCallKeep.addEventListener('answerCall', onAnswer);
  RNCallKeep.addEventListener('endCall', onEnd);
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', onMute);

  return () => {
    RNCallKeep.removeEventListener('answerCall');
    RNCallKeep.removeEventListener('endCall');
    RNCallKeep.removeEventListener('didPerformSetMutedCallAction');
  };
}
