const CHAT_PREVIEW_STORAGE_PREFIX = "north-messenger-chat-previews:";

export type StoredChatPreviewEntry = {
  lastMessage: string;
  lastMessageAt: string;
};

export function readLocalChatPreviews(userId: string): Record<string, StoredChatPreviewEntry> {
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, StoredChatPreviewEntry>;
  } catch {
    return {};
  }
}

export function writeLocalChatPreviews(
  userId: string,
  previews: Record<string, StoredChatPreviewEntry>
) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(previews));
}

function storageKey(userId: string) {
  return `${CHAT_PREVIEW_STORAGE_PREFIX}${userId}`;
}
