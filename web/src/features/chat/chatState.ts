import type { InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ChatSummary } from "../../lib/types";

export const MESSAGE_PAGE_SIZE = 50;

export function upsertChat(current: ChatSummary[] | undefined, nextChat: ChatSummary) {
  const list = current ?? [];
  const withoutCurrent = list.filter((chat) => chat.id !== nextChat.id);
  return [nextChat, ...withoutCurrent].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
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

export function flattenMessagePages(pages: ChatMessage[][] | undefined) {
  if (!pages?.length) {
    return [];
  }

  const seen = new Set<string>();
  return pages
    .toReversed()
    .flatMap((page) => page)
    .filter((message) => {
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
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  return left.createdAt.localeCompare(right.createdAt);
}
