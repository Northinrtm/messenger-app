import { useEffect, useState } from "react";

import { ApiError } from "../../../lib/api";
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
) {
  if (activeListTab === "conferences") {
    return normalizedSearch
      ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
      : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u0438\u0434\u0435\u043E\u043A\u043E\u043D\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0439.";
  }

  if (activeListTab === "mail") {
    return normalizedSearch
      ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
      : "\u041F\u043E\u0447\u0442\u043E\u0432\u044B\u0435 \u044F\u0449\u0438\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B.";
  }

  return normalizedSearch
    ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
    : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0447\u0430\u0442\u043E\u0432.";
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
