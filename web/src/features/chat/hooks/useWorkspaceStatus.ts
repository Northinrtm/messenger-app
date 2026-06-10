import { useEffect, useState } from "react";

import { ApiError } from "../../../lib/api";
import type { TranslationKey } from "../../../i18n";
import type { ChatSummary } from "../../../lib/types";
import type { ConversationListTab } from "../chatUi";

type UseWorkspaceStatusOptions = {
  activeListTab: ConversationListTab;
  contactSearch: string;
  draftActivityByChatId: Record<string, string>;
  errorContextKey: string;
  errors: unknown[];
  normalizedSearch: string;
  onUnauthorized: () => void;
  visibleChats: ChatSummary[];
};

export function resolveTabChats(activeListTab: ConversationListTab, visibleChats: ChatSummary[]) {
  return activeListTab === "chats" ? visibleChats : [];
}

export function shouldListChat(
  chat: Pick<ChatSummary, "id" | "direct" | "lastMessageAt">,
  draftActivityByChatId: Record<string, string>
) {
  return !chat.direct || chat.lastMessageAt !== null || Boolean(draftActivityByChatId[chat.id]);
}

export function sortChatsByDraftActivity(
  chats: ChatSummary[],
  draftActivityByChatId: Record<string, string>
) {
  return [...chats].sort((left, right) => {
    const leftActivityAt =
      draftActivityByChatId[left.id] &&
      draftActivityByChatId[left.id]!.localeCompare(left.updatedAt) > 0
        ? draftActivityByChatId[left.id]!
        : left.updatedAt;
    const rightActivityAt =
      draftActivityByChatId[right.id] &&
      draftActivityByChatId[right.id]!.localeCompare(right.updatedAt) > 0
        ? draftActivityByChatId[right.id]!
        : right.updatedAt;
    const activityComparison = rightActivityAt.localeCompare(leftActivityAt);
    if (activityComparison !== 0) {
      return activityComparison;
    }

    const leftOrder =
      typeof left.lastMessageServerOrder === "number"
        ? left.lastMessageServerOrder
        : Number.MIN_SAFE_INTEGER;
    const rightOrder =
      typeof right.lastMessageServerOrder === "number"
        ? right.lastMessageServerOrder
        : Number.MIN_SAFE_INTEGER;
    if (rightOrder !== leftOrder) {
      return rightOrder - leftOrder;
    }

    return right.id.localeCompare(left.id);
  });
}

export function resolveTabChatsEmptyText(
  activeListTab: ConversationListTab,
  normalizedSearch: string
): TranslationKey {
  if (activeListTab === "conferences") {
    return normalizedSearch ? "list.notFound" : "list.emptyConferences";
  }

  if (activeListTab === "mail") {
    return normalizedSearch ? "list.notFound" : "list.emptyMail";
  }

  return normalizedSearch ? "list.notFound" : "list.emptyChats";
}

export function useWorkspaceStatus({
  activeListTab,
  contactSearch,
  draftActivityByChatId,
  errorContextKey,
  errors,
  normalizedSearch,
  onUnauthorized,
  visibleChats,
}: UseWorkspaceStatusOptions) {
  const requestError = errors.find(Boolean) ?? null;
  const [visibleRequestError, setVisibleRequestError] = useState<unknown>(null);

  useEffect(() => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onUnauthorized();
    }
  }, [onUnauthorized, requestError]);

  useEffect(() => {
    setVisibleRequestError(null);
  }, [errorContextKey]);

  useEffect(() => {
    if (!requestError) {
      setVisibleRequestError(null);
      return;
    }

    setVisibleRequestError(requestError);
    const timeoutId = window.setTimeout(() => {
      setVisibleRequestError((current: unknown) => (current === requestError ? null : current));
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [requestError]);

  const errorText =
    visibleRequestError instanceof ApiError
      ? [visibleRequestError.message, ...visibleRequestError.details].filter(Boolean).join(". ")
      : null;

  const showContactSearchResults = contactSearch.trim().length > 0;
  const orderedVisibleChats = normalizedSearch
    ? visibleChats
    : sortChatsByDraftActivity(visibleChats, draftActivityByChatId);
  const tabChats = resolveTabChats(
    activeListTab,
    orderedVisibleChats
  );
  const tabChatsEmptyText = resolveTabChatsEmptyText(activeListTab, normalizedSearch);

  return {
    errorText,
    requestError,
    showContactSearchResults,
    tabChats,
    tabChatsEmptyText,
  };
}
