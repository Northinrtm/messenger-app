import { useEffect } from "react";

import { ApiError } from "../../../lib/api";
import type { ChatSummary } from "../../../lib/types";
import type { ConversationListTab } from "../chatUi";

type UseWorkspaceStatusOptions = {
  activeListTab: ConversationListTab;
  contactSearch: string;
  errors: unknown[];
  normalizedSearch: string;
  onUnauthorized: () => void;
  visibleChats: ChatSummary[];
};

export function resolveTabChats(activeListTab: ConversationListTab, visibleChats: ChatSummary[]) {
  return activeListTab === "conferences" ? [] : visibleChats;
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

  return normalizedSearch
    ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
    : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0447\u0430\u0442\u043E\u0432.";
}

export function useWorkspaceStatus({
  activeListTab,
  contactSearch,
  errors,
  normalizedSearch,
  onUnauthorized,
  visibleChats,
}: UseWorkspaceStatusOptions) {
  const requestError = errors.find(Boolean) ?? null;

  useEffect(() => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onUnauthorized();
    }
  }, [onUnauthorized, requestError]);

  const errorText =
    requestError instanceof ApiError
      ? [requestError.message, ...requestError.details].filter(Boolean).join(". ")
      : null;

  const showContactSearchResults = contactSearch.trim().length > 0;
  const tabChats = resolveTabChats(activeListTab, visibleChats);
  const tabChatsEmptyText = resolveTabChatsEmptyText(activeListTab, normalizedSearch);

  return {
    errorText,
    requestError,
    showContactSearchResults,
    tabChats,
    tabChatsEmptyText,
  };
}
