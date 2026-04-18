import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  getArchivedChats,
  getArchivedVideoConferences,
  getBlockedUsers,
  getChats,
  getContacts,
  getProfile,
  getSessions,
  getTypingParticipants,
  getVideoConferences,
  searchUsers,
} from "../../../lib/api";
import { getEncryptedMessages } from "../../../lib/e2ee";
import type { ChatMessage, ChatSummary } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import {
  buildMessagesQueryKey,
  flattenMessagePages,
  MESSAGE_PAGE_SIZE,
  reconcileMessageInfiniteData,
} from "../chatState";

type UseWorkspaceQueriesOptions = {
  activeChatId: string | null;
  activeConferenceId: string | null;
  activeListTab: ConversationListTab;
  activePendingOutgoingCount: number;
  deferredContactSearch: string;
  deferredSearch: string;
  isRealtimeConnected: boolean;
  messageQueryGcTimeMs: number;
  searchQueryGcTimeMs: number;
  sessionToken: string;
  sidebarSheet: SidebarSheet;
  typingQueryGcTimeMs: number;
  userId: string;
};

const INITIAL_MESSAGE_PAGE_SIZE = 30;

export type MessagePageCursor = {
  before: string | null;
  beforeMessageId: string | null;
  limit: number;
};

export function createInitialMessagePageCursor(): MessagePageCursor {
  return {
    before: null,
    beforeMessageId: null,
    limit: INITIAL_MESSAGE_PAGE_SIZE,
  };
}

export function getChatsQueryRefreshStrategy(isRealtimeConnected: boolean) {
  return {
    refetchInterval: isRealtimeConnected ? 60_000 : 2_000,
    refetchIntervalInBackground: !isRealtimeConnected,
    refetchOnWindowFocus: false,
  } as const;
}

export function getConferenceQueryRefreshStrategy(isAggressiveRefresh: boolean) {
  return {
    refetchInterval: isAggressiveRefresh ? 5_000 : 60_000,
    refetchIntervalInBackground: false,
    staleTime: isAggressiveRefresh ? 5_000 : 60_000,
    refetchOnWindowFocus: true,
  } as const;
}

export function getNextMessagePageCursor(
  lastPage: ChatMessage[],
  lastPageParam: MessagePageCursor | null | undefined
) {
  const requestedLimit = lastPageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE;
  if (lastPage.length !== requestedLimit || !lastPage[0]) {
    return undefined;
  }

  return {
    before: lastPage[0].createdAt,
    beforeMessageId: lastPage[0].id,
    limit: MESSAGE_PAGE_SIZE,
  } satisfies MessagePageCursor;
}

export function useWorkspaceQueries({
  activeChatId,
  activeConferenceId,
  activeListTab,
  activePendingOutgoingCount,
  deferredContactSearch,
  deferredSearch,
  isRealtimeConnected,
  messageQueryGcTimeMs,
  searchQueryGcTimeMs,
  sessionToken,
  sidebarSheet,
  typingQueryGcTimeMs,
  userId,
}: UseWorkspaceQueriesOptions) {
  const shouldFetchSessions = sidebarSheet === "sessions";
  const shouldAggressivelyRefreshConferences =
    activeListTab === "conferences" || Boolean(activeConferenceId);
  const shouldFetchArchivedConferences = sidebarSheet === "archive" || Boolean(activeConferenceId);

  const chatsQuery = useQuery({
    queryKey: ["chats", sessionToken],
    queryFn: () => getChats(sessionToken),
    ...getChatsQueryRefreshStrategy(isRealtimeConnected),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", sessionToken],
    queryFn: () => getSessions(sessionToken),
    enabled: shouldFetchSessions,
    refetchInterval: shouldFetchSessions ? 60_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", sessionToken],
    queryFn: () => getProfile(sessionToken),
    staleTime: 60_000,
  });

  const archivedChatsQuery = useQuery({
    queryKey: ["archived-chats", sessionToken],
    queryFn: () => getArchivedChats(sessionToken),
    staleTime: 60_000,
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts", sessionToken],
    queryFn: () => getContacts(sessionToken),
    staleTime: 60_000,
  });

  const blockedUsersQuery = useQuery({
    queryKey: ["blocked-users", sessionToken],
    queryFn: () => getBlockedUsers(sessionToken),
    staleTime: 60_000,
  });

  const conferencesQuery = useQuery({
    queryKey: ["video-conferences", sessionToken],
    queryFn: () => getVideoConferences(sessionToken),
    ...getConferenceQueryRefreshStrategy(shouldAggressivelyRefreshConferences),
  });

  const archivedConferencesQuery = useQuery({
    queryKey: ["video-conferences-archive", sessionToken],
    queryFn: () => getArchivedVideoConferences(sessionToken),
    enabled: shouldFetchArchivedConferences,
    refetchInterval: sidebarSheet === "archive" ? 60_000 : false,
    refetchIntervalInBackground: sidebarSheet === "archive",
    staleTime: 60_000,
  });

  const userSearchQuery = useQuery({
    queryKey: ["user-search", sessionToken, deferredSearch],
    queryFn: () => searchUsers(sessionToken, deferredSearch.trim()),
    enabled: deferredSearch.trim().length > 0,
    staleTime: 15_000,
    gcTime: searchQueryGcTimeMs,
  });

  const contactsSearchQuery = useQuery({
    queryKey: ["contact-search", sessionToken, deferredContactSearch],
    queryFn: () => searchUsers(sessionToken, deferredContactSearch.trim()),
    enabled: deferredContactSearch.trim().length > 0,
    staleTime: 15_000,
    gcTime: searchQueryGcTimeMs,
  });

  const activeTypingQuery = useQuery({
    queryKey: ["typing", sessionToken, activeChatId],
    queryFn: () => getTypingParticipants(sessionToken, activeChatId!),
    enabled: Boolean(activeChatId) && !isRealtimeConnected,
    refetchInterval: !isRealtimeConnected && activeChatId ? 1_500 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: typingQueryGcTimeMs,
  });

  const activeChat = (chatsQuery.data ?? []).find((chat) => chat.id === activeChatId) ?? null;

  const messagesQuery = useInfiniteQuery({
    queryKey: buildMessagesQueryKey(userId, activeChat?.id),
    queryFn: ({ pageParam }) =>
      getEncryptedMessages(sessionToken, userId, activeChat!.id, {
        before: pageParam?.before,
        beforeMessageId: pageParam?.beforeMessageId,
        limit: pageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id),
    initialPageParam: createInitialMessagePageCursor(),
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      getNextMessagePageCursor(lastPage, lastPageParam),
    maxPages: 4,
    refetchInterval:
      activeChat?.id && activePendingOutgoingCount === 0 && !isRealtimeConnected ? 1_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: messageQueryGcTimeMs,
    structuralSharing: (current, incoming) =>
      reconcileMessageInfiniteData(
        current as InfiniteData<ChatMessage[]> | undefined,
        incoming as InfiniteData<ChatMessage[]> | undefined
      ),
  });

  const messages = useMemo(
    () => flattenMessagePages(messagesQuery.data?.pages),
    [messagesQuery.data?.pages]
  );

  return {
    activeTypingQuery,
    archivedChatsQuery,
    archivedConferencesQuery,
    chatsQuery,
    blockedUsersQuery,
    conferencesQuery,
    contactsQuery,
    contactsSearchQuery,
    messages,
    messagesQuery,
    profileQuery,
    sessionsQuery,
    userSearchQuery,
  };
}
