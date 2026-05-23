import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_SIZE_KEY = 'app_pref_font_size';
const CHAT_BG_KEY = 'app_pref_chat_bg';

export type FontSize = 'small' | 'medium' | 'large';

export type AppPreferences = {
  fontSize: FontSize;
  chatBackground: string;
};

const DEFAULT_PREFERENCES: AppPreferences = {
  fontSize: 'medium',
  chatBackground: '#0f1720',
};

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const [fontSize, chatBackground] = await Promise.all([
      AsyncStorage.getItem(FONT_SIZE_KEY),
      AsyncStorage.getItem(CHAT_BG_KEY),
    ]);
    return {
      fontSize: (fontSize as FontSize | null) ?? DEFAULT_PREFERENCES.fontSize,
      chatBackground: chatBackground ?? DEFAULT_PREFERENCES.chatBackground,
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
