import type { ChatDraft } from "./types";

const DRAFT_STORAGE_PREFIX = "north-messenger-local-drafts:";

type StoredDraftEntry = {
  content: string;
  updatedAt: string;
};

export function readLocalDrafts(userId: string): ChatDraft[] {
  const entries = readDraftMap(userId);
  return Object.entries(entries)
    .map(([chatId, entry]) => ({
      chatId,
      content: entry.content,
      updatedAt: entry.updatedAt,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function writeLocalDraft(userId: string, chatId: string, content: string) {
  const drafts = readDraftMap(userId);

  if (content.trim()) {
    drafts[chatId] = {
      content,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete drafts[chatId];
  }

  window.localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
  return readLocalDrafts(userId);
}

function readDraftMap(userId: string): Record<string, StoredDraftEntry> {
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, StoredDraftEntry>;
  } catch {
    return {};
  }
}

function storageKey(userId: string) {
  return `${DRAFT_STORAGE_PREFIX}${userId}`;
}
