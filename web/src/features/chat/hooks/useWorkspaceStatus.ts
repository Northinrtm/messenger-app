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
        ? "РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ."
        : "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… РґРёР°Р»РѕРіРѕРІ."
      : normalizedSearch
        ? "РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ."
        : "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… РіСЂСѓРїРї.";

  return {
    errorText,
    requestError,
    showContactSearchResults,
    tabChats,
    tabChatsEmptyText,
  };
}
