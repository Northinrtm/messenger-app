import {Platform} from 'react-native';

const androidDevHost = '10.0.2.2';
const defaultDevHost = 'localhost';

export const API_URL = __DEV__
  ? `http://${Platform.OS === 'android' ? androidDevHost : defaultDevHost}:8080`
  : 'https://replace-me.invalid';

export const WS_URL = __DEV__
  ? `ws://${Platform.OS === 'android' ? androidDevHost : defaultDevHost}:8080`
  : 'wss://replace-me.invalid';

export const APP_CONFIG_NOTE = __DEV__
  ? 'Dev mode uses the local backend and WebSocket endpoint on the Android emulator host 10.0.2.2.'
  : 'Release API URL is not configured yet.';
