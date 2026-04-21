import type { ChatMessage, ChatMessageAttachment, MessageSnippet, UserProfile } from "./types";

const PENDING_MESSAGE_STORAGE_PREFIX = "north-messenger-local-pending-messages:";

export type LocalPendingMessageStatus = "SENDING" | "FAILED";

export type LocalPendingMessage = {
  chatId: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
  localOrder: number | null;
  recipientCount: number;
  replyTo: MessageSnippet | null;
  status: LocalPendingMessageStatus;
  updatedAt: string;
  attachments?: ChatMessageAttachment[];
};

type StoredPendingMessageMap = Record<string, LocalPendingMessage>;

export function readLocalPendingMessages(userId: string): LocalPendingMessage[] {
  return sortPendingMessages(Object.values(readPendingMessageMap(userId)));
}

export function upsertLocalPendingMessage(userId: string, message: {
  chatId: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
  localOrder?: number | null;
  recipientCount: number;
  replyTo?: MessageSnippet | null;
  status: LocalPendingMessageStatus;
  attachments?: ChatMessageAttachment[];
}) {
  const messages = readPendingMessageMap(userId);
  const existingMessage = messages[message.clientMessageId];
  messages[message.clientMessageId] = {
    chatId: message.chatId,
    clientMessageId: message.clientMessageId,
    content: message.content,
    createdAt: existingMessage?.createdAt ?? message.createdAt,
    localOrder: message.localOrder ?? existingMessage?.localOrder ?? null,
    recipientCount: message.recipientCount,
    replyTo: message.replyTo ?? null,
    status: message.status,
    updatedAt: new Date().toISOString(),
    attachments: message.attachments ?? existingMessage?.attachments ?? [],
  };
  writePendingMessageMap(userId, messages);
  return sortPendingMessages(Object.values(messages));
}

export function removeLocalPendingMessage(userId: string, clientMessageId: string) {
  const messages = readPendingMessageMap(userId);
  if (!(clientMessageId in messages)) {
    return sortPendingMessages(Object.values(messages));
  }

  delete messages[clientMessageId];
  writePendingMessageMap(userId, messages);
  return sortPendingMessages(Object.values(messages));
}

export function recoverLocalPendingMessages(userId: string) {
  return sortPendingMessages(Object.values(readPendingMessageMap(userId)));
}

export function toRecoveredPendingChatMessage(
  currentUser: UserProfile,
  message: LocalPendingMessage
): ChatMessage {
  return {
    id: message.clientMessageId,
    chatId: message.chatId,
    serverOrder: null,
    sender: currentUser,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: null,
    status: {
      state: message.status,
      recipientCount: message.recipientCount,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId: message.clientMessageId,
    localOrder: message.localOrder,
    replyTo: message.replyTo,
    reactions: [],
    attachments: message.attachments ?? [],
  };
}

function readPendingMessageMap(userId: string): StoredPendingMessageMap {
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as StoredPendingMessageMap;
  } catch {
    return {};
  }
}

function writePendingMessageMap(userId: string, messages: StoredPendingMessageMap) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(messages));
}

function sortPendingMessages(messages: LocalPendingMessage[]) {
  return [...messages].sort((left, right) => {
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    if (left.localOrder !== right.localOrder) {
      return (left.localOrder ?? 0) - (right.localOrder ?? 0);
    }

    return left.clientMessageId.localeCompare(right.clientMessageId);
  });
}

function storageKey(userId: string) {
  return `${PENDING_MESSAGE_STORAGE_PREFIX}${userId}`;
}
