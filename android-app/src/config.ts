import {Platform} from 'react-native';

const androidDevHost = '10.0.2.2';
const defaultDevHost = 'localhost';
const publicBaseUrl = 'https://pishi.ktsf.ru';
const devTarget = 'remote' as const;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

const localApiUrl = `http://${Platform.OS === 'android' ? androidDevHost : defaultDevHost}:8080`;
const localWsUrl = `ws://${Platform.OS === 'android' ? androidDevHost : defaultDevHost}:8080`;
const localJitsiBaseUrl = `http://${Platform.OS === 'android' ? androidDevHost : defaultDevHost}:8090`;

const remoteApiUrl = trimTrailingSlash(publicBaseUrl);
const remoteWsUrl = trimTrailingSlash(publicBaseUrl);
const remoteJitsiBaseUrl = `${trimTrailingSlash(publicBaseUrl)}/meet`;

const devApiUrl = devTarget === 'remote' ? remoteApiUrl : localApiUrl;
const devWsUrl = devTarget === 'remote' ? remoteWsUrl : localWsUrl;
const devJitsiBaseUrl =
  devTarget === 'remote' ? remoteJitsiBaseUrl : localJitsiBaseUrl;

export const API_URL = __DEV__
  ? devApiUrl
  : remoteApiUrl;

export const WS_URL = __DEV__
  ? devWsUrl
  : remoteWsUrl;

export const JITSI_BASE_URL = __DEV__
  ? devJitsiBaseUrl
  : remoteJitsiBaseUrl;

export const APP_CONFIG_NOTE = __DEV__
  ? devTarget === 'remote'
    ? 'Dev mode is pointed at the shared server https://pishi.ktsf.ru so you can sign in with real accounts.'
    : 'Dev mode uses the local backend, WebSocket, and Jitsi endpoints on the Android emulator host 10.0.2.2.'
  : 'Release mode uses the shared server https://pishi.ktsf.ru.';
