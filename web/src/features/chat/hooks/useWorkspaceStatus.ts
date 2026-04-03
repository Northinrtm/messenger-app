import { useEffect } from "react";

import { ApiError } from "../../../lib/api";
import type { ChatSummary } from "../../../lib/types";
import type { ConversationListTab } from "../chatUi";

type UseWorkspaceStatusOptions = {
  activeListTab: ConversationListTab;
  deferredContactSearch: string;
  errors: unknown[];
  normalizedSearch: string;
  onUnauthorized: () => void;
  visibleDirectChats: ChatSummary[];
  visibleGroupChats: ChatSummary[];
};

export function useWorkspaceStatus({
  activeListTab,
  deferredContactSearch,
  errors,
  normalizedSearch,
  onUnauthorized,
  visibleDirectChats,
  visibleGroupChats,
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

  const showContactSearchResults = deferredContactSearch.trim().length > 0;
  const tabChats = activeListTab === "dialogs" ? visibleDirectChats : visibleGroupChats;
  const tabChatsEmptyText =
    activeListTab === "dialogs"
      ? normalizedSearch
        ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
        : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u0432."
      : normalizedSearch
        ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."
        : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0433\u0440\u0443\u043F\u043F.";

  return {
    errorText,
    requestError,
    showContactSearchResults,
    tabChats,
    tabChatsEmptyText,
  };
}