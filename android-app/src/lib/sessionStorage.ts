import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.north.messenger.android.refresh-token';
const ACCOUNT = 'north-messenger-mobile-auth';

export async function loadStoredRefreshToken() {
  try {
    const credentials = await Keychain.getGenericPassword({service: SERVICE});
    if (!credentials) {
      return null;
    }

    return credentials.password.trim() || null;
  } catch {
    return null;
  }
}

export async function saveStoredRefreshToken(refreshToken: string) {
  await Keychain.setGenericPassword(ACCOUNT, refreshToken, {service: SERVICE});
}

export async function clearStoredRefreshToken() {
  await Keychain.resetGenericPassword({service: SERVICE});
}
