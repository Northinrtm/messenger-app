import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getArchivedChats,
  getArchivedVideoConferences,
  getChats,
  getContacts,
  getProfile,
  getSessions,
  getTypingParticipants,
  getVideoConferences,
  searchUsers,
} from "../../../lib/api";
import { getEncryptedMessages } from "../../../lib/e2ee";
import type { ChatSummary } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import { flattenMessagePages, MESSAGE_PAGE_SIZE } from "../chatState";

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
  const shouldFetchConferences =
    shouldAggressivelyRefreshConferences ||
    sidebarSheet === "conference" ||
    sidebarSheet === "conferenceMembers";
  const shouldFetchArchivedConferences = sidebarSheet === "archive" || Boolean(activeConferenceId);

  const chatsQuery = useQuery({
    queryKey: ["chats", sessionToken],
    queryFn: () => getChats(sessionToken),
    refetchInterval: isRealtimeConnected ? false : 2_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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

  const conferencesQuery = useQuery({
    queryKey: ["video-conferences", sessionToken],
    queryFn: () => getVideoConferences(sessionToken),
    enabled: shouldFetchConferences,
    refetchInterval: shouldAggressivelyRefreshConferences ? 5_000 : false,
    refetchIntervalInBackground: false,
    staleTime: shouldAggressivelyRefreshConferences ? 5_000 : 60_000,
    refetchOnWindowFocus: shouldFetchConferences,
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
    queryKey: ["messages", sessionToken, activeChat?.id],
    queryFn: ({ pageParam }) =>
      getEncryptedMessages(sessionToken, userId, activeChat!.id, {
        before: pageParam,
        limit: MESSAGE_PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === MESSAGE_PAGE_SIZE ? lastPage[0]?.createdAt ?? undefined : undefined,
    maxPages: 4,
    refetchInterval:
      !isRealtimeConnected && activeChat?.id && activePendingOutgoingCount === 0 ? 1_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: messageQueryGcTimeMs,
  });

  const messages = flattenMessagePages(messagesQuery.data?.pages);

  return {
    activeTypingQuery,
    archivedChatsQuery,
    archivedConferencesQuery,
    chatsQuery,
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
