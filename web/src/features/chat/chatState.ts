import type { InfiniteData } from "@tanstack/react-query";
import type {
  ChatMessage,
  MessageSnippet,
  ChatSummary,
  MessageReactionEvent,
  MessageStatusEvent,
} from "../../lib/types";

export const MESSAGE_PAGE_SIZE = 50;
export type ChatPreviewOverride = {
  lastMessage: string;
  lastMessageAt: string;
};
export type ChatMessageActivityMode = "keep" | "increment" | "clear";

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

export function removeChatPreviewOverride(
  current: Record<string, ChatPreviewOverride>,
  chatId: string
) {
  if (!(chatId in current)) {
    return current;
  }

  const { [chatId]: _removed, ...rest } = current;
  return rest;
}

export function replaceChatPreviewOverride(
  current: Record<string, ChatPreviewOverride>,
  chatId: string,
  nextPreview: ChatPreviewOverride | null
) {
  if (!nextPreview) {
    return removeChatPreviewOverride(current, chatId);
  }

  const existing = current[chatId];
  if (
    existing &&
    existing.lastMessage === nextPreview.lastMessage &&
    existing.lastMessageAt === nextPreview.lastMessageAt
  ) {
    return current;
  }

  return {
    ...current,
    [chatId]: nextPreview,
  };
}

export function updateChatPreview(
  current: ChatSummary[] | undefined,
  message: ChatMessage
) {
  return applyChatMessageActivity(current, message, "keep");
}

export function applyChatMessageActivity(
  current: ChatSummary[] | undefined,
  message: ChatMessage,
  unreadMode: ChatMessageActivityMode
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current
    .map((chat) => {
      if (chat.id !== message.chatId) {
        return chat;
      }

      changed = true;
      return {
        ...chat,
        lastMessage: message.content,
        lastMessageAt: message.createdAt,
        updatedAt: message.createdAt,
        unreadCount:
          unreadMode === "increment"
            ? chat.unreadCount + 1
            : unreadMode === "clear"
              ? 0
              : chat.unreadCount,
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return changed ? next : current;
}

export function clearChatUnreadCount(
  current: ChatSummary[] | undefined,
  chatId: string
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current.map((chat) => {
    if (chat.id !== chatId || chat.unreadCount === 0) {
      return chat;
    }

    changed = true;
    return {
      ...chat,
      unreadCount: 0,
    };
  });

  return changed ? next : current;
}

export function updateChatPinnedMessage(
  current: ChatSummary[] | undefined,
  chatId: string,
  pinnedMessage: MessageSnippet | null
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current.map((chat) => {
    if (chat.id !== chatId) {
      return chat;
    }

    if (chat.pinnedMessage?.id === pinnedMessage?.id && chat.pinnedMessage?.preview === pinnedMessage?.preview) {
      return chat;
    }

    changed = true;
    return {
      ...chat,
      pinnedMessage,
    };
  });

  return changed ? next : current;
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

  let replaced = false;
  const pages = current.pages.map((page, index) => {
    const existingIndex = page.findIndex((message) => matchesMessageIdentity(message, incoming));
    if (existingIndex >= 0) {
      replaced = true;
      return page
        .map((message, messageIndex) => (messageIndex === existingIndex ? incoming : message))
        .sort(compareMessages);
    }

    return index === 0 ? [...page, incoming].sort(compareMessages) : page;
  });

  if (!replaced && pages[0]?.length === current.pages[0]?.length) {
    return current;
  }

  return {
    ...current,
    pages,
  };
}

export function removeMessageByClientMessageId(
  current: InfiniteData<ChatMessage[]> | undefined,
  clientMessageId: string
): InfiniteData<ChatMessage[]> | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    const nextPage = page.filter((message) => message.clientMessageId !== clientMessageId);
    changed = changed || nextPage.length !== page.length;
    return nextPage;
  });

  return changed
    ? {
        ...current,
        pages,
      }
    : current;
}

export function removeMessageById(
  current: InfiniteData<ChatMessage[]> | undefined,
  messageId: string
): InfiniteData<ChatMessage[]> | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    const nextPage = page.filter((message) => message.id !== messageId);
    changed = changed || nextPage.length !== page.length;
    return nextPage;
  });

  return changed
    ? {
        ...current,
        pages,
      }
    : current;
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

export function updateMessageById(
  current: InfiniteData<ChatMessage[]> | undefined,
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage
): InfiniteData<ChatMessage[]> | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) =>
    page.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const nextMessage = updater(message);
      changed = changed || nextMessage !== message;
      return nextMessage;
    })
  );

  return changed
    ? {
        ...current,
        pages,
      }
    : current;
}

export function updateMessageReactionsPages(
  current: InfiniteData<ChatMessage[]> | undefined,
  event: MessageReactionEvent
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
        reactions: event.reactions,
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

  const deduped = new Map<string, ChatMessage>();
  [...pages]
    .reverse()
    .flatMap((page: ChatMessage[]) => page)
    .forEach((message: ChatMessage) => {
      const dedupeKey = message.clientMessageId ? `client:${message.clientMessageId}` : `id:${message.id}`;
      const existing = deduped.get(dedupeKey);
      if (!existing || shouldPreferMessage(existing, message)) {
        deduped.set(dedupeKey, message);
      }
    });

  return [...deduped.values()].sort(compareMessages);
}

export function getLatestMessageFromPages(
  current: InfiniteData<ChatMessage[]> | undefined
) {
  const flattened = flattenMessagePages(current?.pages);
  return flattened[flattened.length - 1] ?? null;
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

export function removeChatById(current: ChatSummary[] | undefined, chatId: string) {
  if (!current) {
    return current;
  }

  const next = current.filter((chat) => chat.id !== chatId);
  return next.length === current.length ? current : next;
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  return left.createdAt.localeCompare(right.createdAt);
}

function matchesMessageIdentity(left: ChatMessage, right: ChatMessage) {
  if (left.id === right.id) {
    return true;
  }

  return Boolean(
    left.clientMessageId &&
      right.clientMessageId &&
      left.clientMessageId === right.clientMessageId
  );
}

function shouldPreferMessage(current: ChatMessage, incoming: ChatMessage) {
  if (incoming.createdAt.localeCompare(current.createdAt) > 0) {
    return true;
  }

  return isOptimisticClientMessage(current) && !isOptimisticClientMessage(incoming);
}

function isOptimisticClientMessage(message: ChatMessage) {
  return Boolean(message.clientMessageId && message.id === message.clientMessageId);
}
