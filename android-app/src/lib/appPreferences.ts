import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_SIZE_KEY = 'app_pref_font_size';
const CHAT_BG_KEY = 'app_pref_chat_bg';
const NOTIFICATIONS_ENABLED_KEY = 'app_pref_notifications_enabled';
const MUTED_CHAT_IDS_KEY = 'app_pref_muted_chat_ids';
const SILENT_CHAT_IDS_KEY = 'app_pref_silent_chat_ids';

export type FontSize = 'small' | 'medium' | 'large';

export type AppPreferences = {
  fontSize: FontSize;
  chatBackground: string;
  /**
   * When false the FCM token is unregistered from the server — no push
   * deliveries at all. Default: true.
   */
  notificationsEnabled: boolean;
  /** Chat IDs for which all notifications and in-app sounds are suppressed. */
  mutedChatIds: string[];
  /**
   * Chat IDs for which push notifications still arrive but in-app sound
   * is suppressed (notification badge still shows).
   */
  silentChatIds: string[];
};

const DEFAULT_PREFERENCES: AppPreferences = {
  fontSize: 'medium',
  chatBackground: '#0f1720',
  notificationsEnabled: true,
  mutedChatIds: [],
  silentChatIds: [],
};

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const [fontSize, chatBackground, notifEnabled, mutedChats, silentChats] =
      await Promise.all([
        AsyncStorage.getItem(FONT_SIZE_KEY),
        AsyncStorage.getItem(CHAT_BG_KEY),
        AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
        AsyncStorage.getItem(MUTED_CHAT_IDS_KEY),
        AsyncStorage.getItem(SILENT_CHAT_IDS_KEY),
      ]);
    return {
      fontSize: (fontSize as FontSize | null) ?? DEFAULT_PREFERENCES.fontSize,
      chatBackground: chatBackground ?? DEFAULT_PREFERENCES.chatBackground,
      notificationsEnabled:
        notifEnabled !== null
          ? notifEnabled === 'true'
          : DEFAULT_PREFERENCES.notificationsEnabled,
      mutedChatIds: mutedChats
        ? (JSON.parse(mutedChats) as string[])
        : DEFAULT_PREFERENCES.mutedChatIds,
      silentChatIds: silentChats
        ? (JSON.parse(silentChats) as string[])
        : DEFAULT_PREFERENCES.silentChatIds,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveFontSize(size: FontSize): Promise<void> {
  await AsyncStorage.setItem(FONT_SIZE_KEY, size);
}

export async function saveChatBackground(color: string): Promise<void> {
  await AsyncStorage.setItem(CHAT_BG_KEY, color);
}

export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

export async function saveMutedChatIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(MUTED_CHAT_IDS_KEY, JSON.stringify(ids));
}

export async function saveSilentChatIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(SILENT_CHAT_IDS_KEY, JSON.stringify(ids));
}

export async function clearAppCache(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(FONT_SIZE_KEY),
    AsyncStorage.removeItem(CHAT_BG_KEY),
  ]);
}

export const FONT_SIZE_VALUES: Record<FontSize, number> = {
  small: 13,
  medium: 15,
  large: 18,
};

export const CHAT_BACKGROUND_OPTIONS: {label: string; value: string}[] = [
  {label: 'Тёмный', value: '#0f1720'},
  {label: 'Чёрный', value: '#000000'},
  {label: 'Синий', value: '#0d1f3c'},
  {label: 'Зелёный', value: '#0d2118'},
  {label: 'Фиолетовый', value: '#1a0d2e'},
  {label: 'Серый', value: '#1a1a1a'},
];
