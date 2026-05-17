import type { InfiniteData } from "@tanstack/react-query";
import type {
  ChatMessage,
  MessageSnippet,
  ChatSummary,
  MessageReactionEvent,
  MessageStatusEvent,
} from "../../lib/types";
import { buildMessageContentPreview } from "./messagePresentation";

export const MESSAGE_PAGE_SIZE = 50;
export type ChatPreviewOverride = {
  lastMessage: string;
  lastMessageAt: string;
};
export type ChatMessageActivityMode = "keep" | "clear";

export function buildMessagesQueryKey(userId: string, chatId: string | null | undefined) {
  return ["messages", userId, chatId ?? null] as const;
}

export function getMessageIdentityKey(message: Pick<ChatMessage, "id" | "clientMessageId">) {
  return message.clientMessageId ?? message.id;
}

export function upsertChat(current: ChatSummary[] | undefined, nextChat: ChatSummary) {
  const list = current ?? [];
  const existingChat = list.find((chat) => chat.id === nextChat.id);
  if (existingChat && existingChat.chatVersion === nextChat.chatVersion) {
    return current ?? [nextChat];
  }
  const withoutCurrent = list.filter((chat) => chat.id !== nextChat.id);
  return [nextChat, ...withoutCurrent].sort(compareChatActivity);
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
      lastMessageHasReactions: false,
      reactionAttention: chat.reactionAttention,
      updatedAt,
    };
  });
}

export function upsertChatPreviewOverride(
  current: Record<string, ChatPreviewOverride>,
  message: Pick<ChatMessage, "chatId" | "content" | "createdAt" | "attachments">
) {
  const preview = buildMessageContentPreview(message, 88);
  const existing = current[message.chatId];
  if (existing && existing.lastMessageAt.localeCompare(message.createdAt) > 0) {
    return current;
  }

  if (
    existing &&
    existing.lastMessageAt === message.createdAt &&
    existing.lastMessage === preview
  ) {
    return current;
  }

  return {
    ...current,
    [message.chatId]: {
      lastMessage: preview,
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
        lastMessage: buildMessageContentPreview(message, 88),
        lastMessageAt: message.createdAt,
        lastMessageHasReactions: message.reactions.length > 0,
        reactionAttention: chat.reactionAttention,
        lastMessageServerOrder: message.serverOrder ?? chat.lastMessageServerOrder,
        updatedAt: message.createdAt,
        unreadCount: unreadMode === "clear" ? 0 : chat.unreadCount,
      };
    })
    .sort(compareChatActivity);

  return changed ? next : current;
}

export function clearChatMessageActivity(
  current: ChatSummary[] | undefined,
  chatId: string
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current.map((chat) => {
    if (
      chat.id !== chatId ||
      (chat.lastMessage === null &&
        chat.lastMessageAt === null &&
        chat.lastMessageServerOrder == null)
    ) {
      return chat;
    }

    changed = true;
    return {
      ...chat,
      lastMessage: null,
      lastMessageAt: null,
      lastMessageHasReactions: false,
      reactionAttention: chat.reactionAttention,
      lastMessageServerOrder: null,
    };
  });

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

export function getChatPinnedMessages(chat: Pick<ChatSummary, "pinnedMessage" | "pinnedMessages"> | null | undefined) {
  if (!chat) {
    return [];
  }

  if (chat.pinnedMessages?.length) {
    return chat.pinnedMessages;
  }

  return chat.pinnedMessage ? [chat.pinnedMessage] : [];
}

export function setChatPinnedMessages(
  current: ChatSummary[] | undefined,
  chatId: string,
  pinnedMessages: MessageSnippet[]
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current.map((chat) => {
    if (chat.id !== chatId) {
      return chat;
    }

    const existingPinnedMessages = getChatPinnedMessages(chat);
    if (
      existingPinnedMessages.length === pinnedMessages.length &&
      existingPinnedMessages.every((message, index) => {
        const nextMessage = pinnedMessages[index];
        return (
          nextMessage &&
          message.id === nextMessage.id &&
          message.preview === nextMessage.preview &&
          (message.serverOrder ?? null) === (nextMessage.serverOrder ?? null)
        );
      })
    ) {
      return chat;
    }

    changed = true;
    return {
      ...chat,
      pinnedMessage: pinnedMessages[0] ?? null,
      pinnedMessages,
    };
  });

  return changed ? next : current;
}

export function replaceChatPinnedMessage(
  current: ChatSummary[] | undefined,
  chatId: string,
  pinnedMessage: MessageSnippet
) {
  if (!current) {
    return current;
  }

  const chat = current.find((item) => item.id === chatId);
  if (!chat) {
    return current;
  }

  const nextPinnedMessages = getChatPinnedMessages(chat).map((message) =>
    message.id === pinnedMessage.id ? pinnedMessage : message
  );
  return setChatPinnedMessages(current, chatId, nextPinnedMessages);
}

export function removeChatPinnedMessage(
  current: ChatSummary[] | undefined,
  chatId: string,
  messageId: string
) {
  if (!current) {
    return current;
  }

  const chat = current.find((item) => item.id === chatId);
  if (!chat) {
    return current;
  }

  const nextPinnedMessages = getChatPinnedMessages(chat).filter(
    (message) => message.id !== messageId
  );
  return setChatPinnedMessages(current, chatId, nextPinnedMessages);
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
      const reconciledMessage = reconcileChatMessage(page[existingIndex]!, incoming);
      return page
        .map((message, messageIndex) =>
          messageIndex === existingIndex ? reconciledMessage : message
        )
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

export function reconcileMessageInfiniteData(
  current: InfiniteData<ChatMessage[]> | undefined,
  incoming: InfiniteData<ChatMessage[]> | undefined
): InfiniteData<ChatMessage[]> | undefined {
  if (!current || !incoming) {
    return incoming;
  }

  const currentMessages = new Map<string, ChatMessage>();
  current.pages.forEach((page) => {
    page.forEach((message) => {
      currentMessages.set(`id:${message.id}`, message);
      if (message.clientMessageId) {
        currentMessages.set(`client:${message.clientMessageId}`, message);
      }
    });
  });

  let changed = false;
  const pages = incoming.pages.map((page) =>
    page.map((message) => {
      const existing =
        currentMessages.get(`id:${message.id}`) ??
        (message.clientMessageId
          ? currentMessages.get(`client:${message.clientMessageId}`)
          : undefined);
      if (!existing) {
        return message;
      }

      const reconciled = reconcileChatMessage(existing, message);
      changed = changed || reconciled !== message;
      return reconciled;
    })
  );

  return changed ? { ...incoming, pages } : incoming;
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

export function setChatReactionAttention(
  current: ChatSummary[] | undefined,
  chatId: string,
  reactionAttention: boolean
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const next = current.map((chat) => {
    if (chat.id !== chatId || Boolean(chat.reactionAttention) === reactionAttention) {
      return chat;
    }

    changed = true;
    return {
      ...chat,
      reactionAttention,
    };
  });

  return changed ? next : current;
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

export function updateMessageByClientMessageId(
  current: InfiniteData<ChatMessage[]> | undefined,
  clientMessageId: string,
  updater: (message: ChatMessage) => ChatMessage
): InfiniteData<ChatMessage[]> | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) =>
    page.map((message) => {
      if (message.clientMessageId !== clientMessageId) {
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
      if (!existing) {
        deduped.set(dedupeKey, message);
        return;
      }

      if (shouldPreferMessage(existing, message)) {
        deduped.set(dedupeKey, reconcileChatMessage(existing, message));
        return;
      }

      deduped.set(dedupeKey, reconcileChatMessage(message, existing));
    });

  return hydrateReplySnippetPreviews([...deduped.values()].sort(compareMessages));
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

function hydrateReplySnippetPreviews(messages: ChatMessage[]) {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  let changed = false;

  const nextMessages = messages.map((message) => {
    if (!message.replyTo) {
      return message;
    }

    const replyTarget = messagesById.get(message.replyTo.id);
    if (!replyTarget) {
      return message;
    }

    const nextPreview = buildMessageContentPreview(replyTarget, 88);
    const nextSender = replyTarget.sender;

    if (
      message.replyTo.preview === nextPreview &&
      message.replyTo.sender.id === nextSender.id &&
      message.replyTo.sender.displayName === nextSender.displayName &&
      message.replyTo.sender.avatarUrl === nextSender.avatarUrl &&
      message.replyTo.sender.online === nextSender.online
    ) {
      return message;
    }

    changed = true;
    return {
      ...message,
      replyTo: {
        ...message.replyTo,
        sender: nextSender,
        preview: nextPreview,
      },
    };
  });

  return changed ? nextMessages : messages;
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
  const localOrderComparison = compareLocalMessageOrder(left, right);
  if (localOrderComparison !== 0 && shouldPreferLocalOrder(left, right)) {
    return localOrderComparison;
  }

  const serverOrderComparison = compareServerMessageOrder(left, right);
  if (serverOrderComparison !== 0) {
    return serverOrderComparison;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return getMessageSortTieBreaker(left).localeCompare(getMessageSortTieBreaker(right));
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

  if (
    typeof incoming.serverOrder === "number" &&
    typeof current.serverOrder === "number" &&
    incoming.serverOrder > current.serverOrder
  ) {
    return true;
  }

  return isOptimisticClientMessage(current) && !isOptimisticClientMessage(incoming);
}

function isOptimisticClientMessage(message: ChatMessage) {
  return Boolean(message.clientMessageId && message.id === message.clientMessageId);
}

function getMessageSortTieBreaker(message: Pick<ChatMessage, "id" | "clientMessageId">) {
  if (message.clientMessageId && message.id === message.clientMessageId) {
    return message.clientMessageId;
  }

  return message.id;
}

function reconcileChatMessage(current: ChatMessage, incoming: ChatMessage): ChatMessage {
  const nextReplyTo = reconcileMessageSnippet(current.replyTo, incoming.replyTo);
  const nextStatus = pickPreferredMessageStatus(current.status, incoming.status);
  const nextEditedAt = pickLatestTimestamp(current.editedAt, incoming.editedAt);
  const nextClientMessageId = incoming.clientMessageId ?? current.clientMessageId ?? null;
  const nextServerOrder = incoming.serverOrder ?? current.serverOrder ?? null;
  const nextLocalOrder = incoming.localOrder ?? current.localOrder ?? null;

  if (
    nextReplyTo === incoming.replyTo &&
    nextStatus === incoming.status &&
    nextEditedAt === incoming.editedAt &&
    nextClientMessageId === (incoming.clientMessageId ?? null) &&
    nextServerOrder === (incoming.serverOrder ?? null) &&
    nextLocalOrder === (incoming.localOrder ?? null)
  ) {
    return incoming;
  }

  return {
    ...incoming,
    replyTo: nextReplyTo,
    status: nextStatus,
    editedAt: nextEditedAt,
    clientMessageId: nextClientMessageId,
    serverOrder: nextServerOrder,
    localOrder: nextLocalOrder,
    attachments: incoming.attachments,
  };
}

function compareLocalMessageOrder(
  left: Pick<ChatMessage, "localOrder">,
  right: Pick<ChatMessage, "localOrder">
) {
  if (typeof left.localOrder !== "number" || typeof right.localOrder !== "number") {
    return 0;
  }

  return left.localOrder - right.localOrder;
}

function shouldPreferLocalOrder(
  left: Pick<ChatMessage, "localOrder" | "serverOrder">,
  right: Pick<ChatMessage, "localOrder" | "serverOrder">
) {
  return (
    typeof left.localOrder === "number" &&
    typeof right.localOrder === "number" &&
    (typeof left.serverOrder !== "number" || typeof right.serverOrder !== "number")
  );
}

function compareServerMessageOrder(
  left: Pick<ChatMessage, "serverOrder">,
  right: Pick<ChatMessage, "serverOrder">
) {
  if (typeof left.serverOrder !== "number" || typeof right.serverOrder !== "number") {
    return 0;
  }

  return left.serverOrder - right.serverOrder;
}

function reconcileMessageSnippet(current: MessageSnippet | null, incoming: MessageSnippet | null) {
  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  return incoming;
}

function pickPreferredMessageStatus(current: ChatMessage["status"], incoming: ChatMessage["status"]) {
  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  if (getMessageStatusRank(incoming.state) >= getMessageStatusRank(current.state)) {
    return incoming;
  }

  return current;
}

function compareChatActivity(left: ChatSummary, right: ChatSummary) {
  const updatedAtComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedAtComparison !== 0) {
    return updatedAtComparison;
  }

  const leftOrder =
    typeof left.lastMessageServerOrder === "number" ? left.lastMessageServerOrder : Number.MIN_SAFE_INTEGER;
  const rightOrder =
    typeof right.lastMessageServerOrder === "number" ? right.lastMessageServerOrder : Number.MIN_SAFE_INTEGER;
  if (rightOrder !== leftOrder) {
    return rightOrder - leftOrder;
  }

  return right.id.localeCompare(left.id);
}

function getMessageStatusRank(state: NonNullable<ChatMessage["status"]>["state"]) {
  switch (state) {
    case "READ":
      return 3;
    case "DELIVERED":
      return 2;
    case "SENT":
      return 1;
    default:
      return 0;
  }
}

function pickLatestTimestamp(current: string | null, incoming: string | null) {
  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  return incoming.localeCompare(current) >= 0 ? incoming : current;
}
