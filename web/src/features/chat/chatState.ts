import type { InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ChatSummary, MessageStatusEvent } from "../../lib/types";

export const MESSAGE_PAGE_SIZE = 50;
export type ChatPreviewOverride = {
  lastMessage: string;
  lastMessageAt: string;
};

export function upsertChat(current: ChatSummary[] | undefined, nextChat: ChatSummary) {
  const list = current ?? [];
  const withoutCurrent = list.filter((chat) => chat.id !== nextChat.id);
  return [nextChat, ...withoutCurrent].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function applyChatPreviewOverrides(
  chats: ChatSummary[] | undefined,
  overrides: Record<string, ChatPreviewOverride>
) {
  if (!chats?.length) {
    return [];
  }

  return chats.map((chat) => {
    const override = overrides[chat.id];
    if (!override) {
      return chat;
    }

    if (chat.lastMessageAt && override.lastMessageAt.localeCompare(chat.lastMessageAt) < 0) {
      return chat;
    }

    const updatedAt =
      override.lastMessageAt.localeCompare(chat.updatedAt) > 0
        ? override.lastMessageAt
        : chat.updatedAt;

    return {
      ...chat,
      lastMessage: override.lastMessage,
      lastMessageAt: override.lastMessageAt,
      updatedAt,
    };
  });
}

export function upsertChatPreviewOverride(
  current: Record<string, ChatPreviewOverride>,
  message: Pick<ChatMessage, "chatId" | "content" | "createdAt">
) {
  const existing = current[message.chatId];
  if (existing && existing.lastMessageAt.localeCompare(message.createdAt) > 0) {
    return current;
  }

  if (
    existing &&
    existing.lastMessageAt === message.createdAt &&
    existing.lastMessage === message.content
  ) {
    return current;
  }

  return {
    ...current,
    [message.chatId]: {
      lastMessage: message.content,
      lastMessageAt: message.createdAt,
    },
  };
}

export function updateChatPreview(
  current: ChatSummary[] | undefined,
  message: ChatMessage
) {
  if (!current) {
    return current;
  }

  return current
    .map((chat) =>
      chat.id === message.chatId
        ? {
            ...chat,
            lastMessage: message.content,
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
          }
        : chat
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mergeMessagePages(
  current: InfiniteData<ChatMessage[]> | undefined,
  incoming: ChatMessage
): InfiniteData<ChatMessage[]> {
  if (!current) {
    return {
      pages: [[incoming]],
      pageParams: [null],
    };
  }

  const alreadyExists = current.pages.some((page) =>
    page.some((message) => message.id === incoming.id)
  );
  if (alreadyExists) {
    return current;
  }

  const pages = current.pages.map((page, index) =>
    index === 0 ? [...page, incoming].sort(compareMessages) : page
  );
  return {
    ...current,
    pages,
  };
}

export function updateMessageStatusPages(
  current: InfiniteData<ChatMessage[]> | undefined,
  event: MessageStatusEvent
): InfiniteData<ChatMessage[]> | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) =>
    page.map((message) => {
      if (message.id !== event.messageId) {
        return message;
      }

      changed = true;
      return {
        ...message,
        status: event.status,
      };
    })
  );

  return changed
    ? {
        ...current,
        pages,
      }
    : current;
}

export function flattenMessagePages(pages: ChatMessage[][] | undefined) {
  if (!pages?.length) {
    return [];
  }

  const seen = new Set<string>();
  return [...pages]
    .reverse()
    .flatMap((page: ChatMessage[]) => page)
    .filter((message: ChatMessage) => {
      if (seen.has(message.id)) {
        return false;
      }

      seen.add(message.id);
      return true;
    })
    .sort(compareMessages);
}

export function initials(title: string) {
  return title
    .split(" ")
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

export function parseUsernames(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map(normalizeUsername)
        .filter(Boolean)
    )
  );
}

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  return left.createdAt.localeCompare(right.createdAt);
}
