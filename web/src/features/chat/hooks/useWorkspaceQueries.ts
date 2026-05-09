import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getArchivedChats,
  getArchivedVideoConferences,
  getBlockedUsers,
  getChatOpen,
  getChats,
  getOwnMailboxes,
  getContacts,
  getMessagesPage,
  getPendingOutgoingMessages,
  getProfile,
  getSessions,
  getTypingParticipants,
  getVideoConferences,
  searchWorkspace,
} from "../../../lib/api";
import { deletePendingOutgoingMessage } from "../../../lib/api";
import { hydrateApiChatMessage } from "../../../lib/messagePayload";
import { toRecoveredPendingChatMessage } from "../../../lib/pendingOutgoingMessages";
import type {
  ChatMessage,
  ChatSummary,
  PendingOutgoingMessage,
  UserProfile,
  WorkspaceBootstrap,
} from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import {
  buildMessagesQueryKey,
  flattenMessagePages,
  MESSAGE_PAGE_SIZE,
  reconcileMessageInfiniteData,
  upsertChat,
} from "../chatState";

type UseWorkspaceQueriesOptions = {
  activeChatId: string | null;
  activeConferenceId: string | null;
  isActiveChatOpen: boolean;
  activeListTab: ConversationListTab;
  activePendingOutgoingCount: number;
  bootstrapReady: boolean;
  contactSearchText: string;
  currentUser: UserProfile;
  initialWorkspaceBootstrap: WorkspaceBootstrap | undefined;
  initialWorkspaceBootstrapUpdatedAt: number | undefined;
  isRealtimeConnected: boolean;
  messageQueryGcTimeMs: number;
  messageNavigationSeed: MessageNavigationSeed | null;
  searchQueryGcTimeMs: number;
  searchText: string;
  sessionToken: string;
  sidebarSheet: SidebarSheet;
  typingQueryGcTimeMs: number;
  userId: string;
};

const INITIAL_MESSAGE_PAGE_SIZE = 30;
const CONNECTED_CHATS_REFETCH_INTERVAL_MS = 60_000;
const FALLBACK_CHATS_REFETCH_INTERVAL_MS = 15_000;
const FALLBACK_TYPING_REFETCH_INTERVAL_MS = 5_000;
const FALLBACK_MESSAGES_REFETCH_INTERVAL_MS = 10_000;
const CHATS_QUERY_STALE_TIME_MS = 15_000;

function isDocumentVisibleNow() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export type MessagePageCursor = {
  cursor: string | null;
  limit: number;
};

export type MessageNavigationSeed = {
  chatId: string;
  cursor: string | null;
};

export function createInitialMessagePageCursor(): MessagePageCursor {
  return {
    cursor: null,
    limit: INITIAL_MESSAGE_PAGE_SIZE,
  };
}

export function getChatsQueryRefreshStrategy(options: {
  isRealtimeConnected: boolean;
  isDocumentVisible: boolean;
}) {
  return {
    refetchInterval: options.isRealtimeConnected
      ? CONNECTED_CHATS_REFETCH_INTERVAL_MS
      : options.isDocumentVisible
        ? FALLBACK_CHATS_REFETCH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  } as const;
}

export function getTypingQueryRefetchInterval(options: {
  activeChatId: string | null;
  isActiveChatOpen: boolean;
  isDocumentVisible: boolean;
  isRealtimeConnected: boolean;
}) {
  if (
    options.isRealtimeConnected ||
    !options.activeChatId ||
    !options.isActiveChatOpen ||
    !options.isDocumentVisible
  ) {
    return false;
  }

  return FALLBACK_TYPING_REFETCH_INTERVAL_MS;
}

export function getMessagesQueryRefetchInterval(options: {
  activeChatId: string | null;
  activePendingOutgoingCount: number;
  isActiveChatOpen: boolean;
  isDocumentVisible: boolean;
  isRealtimeConnected: boolean;
}) {
  if (
    options.isRealtimeConnected ||
    !options.activeChatId ||
    options.activePendingOutgoingCount > 0 ||
    !options.isActiveChatOpen ||
    !options.isDocumentVisible
  ) {
    return false;
  }

  return FALLBACK_MESSAGES_REFETCH_INTERVAL_MS;
}

export function getConferenceQueryRefreshStrategy(isAggressiveRefresh: boolean) {
  return {
    refetchInterval: isAggressiveRefresh ? 5_000 : 60_000,
    refetchIntervalInBackground: false,
    staleTime: isAggressiveRefresh ? 5_000 : 60_000,
    refetchOnWindowFocus: true,
  } as const;
}

export function getNextMessagePageCursor(nextCursor: string | null | undefined) {
  if (!nextCursor) {
    return undefined;
  }

  return {
    cursor: nextCursor,
    limit: MESSAGE_PAGE_SIZE,
  } satisfies MessagePageCursor;
}

function buildMessagePageRequestKey(pageParam: MessagePageCursor | null | undefined) {
  return `${pageParam?.cursor ?? "initial"}|${pageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE}`;
}

export function useWorkspaceQueries({
  activeChatId,
  activeConferenceId,
  isActiveChatOpen,
  activeListTab,
  activePendingOutgoingCount,
  bootstrapReady,
  contactSearchText,
  currentUser,
  initialWorkspaceBootstrap,
  initialWorkspaceBootstrapUpdatedAt,
  isRealtimeConnected,
  messageQueryGcTimeMs,
  messageNavigationSeed,
  searchQueryGcTimeMs,
  searchText,
  sessionToken,
  sidebarSheet,
  typingQueryGcTimeMs,
  userId,
}: UseWorkspaceQueriesOptions) {
  const queryClient = useQueryClient();
  const [isDocumentVisible, setIsDocumentVisible] = useState(isDocumentVisibleNow);
  const nextMessageCursorByRequestKeyRef = useRef(new Map<string, string | null>());
  const shouldFetchSessions = sidebarSheet === "sessions";
  const shouldAggressivelyRefreshConferences =
    activeListTab === "conferences" || Boolean(activeConferenceId) || Boolean(activeChatId);
  const shouldFetchArchivedConferences = sidebarSheet === "archive" || Boolean(activeConferenceId);
  const normalizedSearchText = searchText.trim();
  const normalizedContactSearchText = contactSearchText.trim();

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsDocumentVisible(isDocumentVisibleNow());
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    nextMessageCursorByRequestKeyRef.current.clear();
  }, [activeChatId, messageNavigationSeed?.chatId, messageNavigationSeed?.cursor]);

  const chatsQuery = useQuery({
    queryKey: ["chats", sessionToken],
    queryFn: () => getChats(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.chats,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: CHATS_QUERY_STALE_TIME_MS,
    ...getChatsQueryRefreshStrategy({
      isRealtimeConnected,
      isDocumentVisible,
    }),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", sessionToken],
    queryFn: () => getSessions(sessionToken),
    enabled: bootstrapReady && shouldFetchSessions,
    refetchInterval: shouldFetchSessions ? 60_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", sessionToken],
    queryFn: () => getProfile(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.profile,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 60_000,
  });

  const archivedChatsQuery = useQuery({
    queryKey: ["archived-chats", sessionToken],
    queryFn: () => getArchivedChats(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.archivedChatIds,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 60_000,
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts", sessionToken],
    queryFn: () => getContacts(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.contacts,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 60_000,
  });

  const blockedUsersQuery = useQuery({
    queryKey: ["blocked-users", sessionToken],
    queryFn: () => getBlockedUsers(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.blockedUsers,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 60_000,
  });

  const conferencesQuery = useQuery({
    queryKey: ["video-conferences", sessionToken],
    queryFn: () => getVideoConferences(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.conferences,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    ...getConferenceQueryRefreshStrategy(shouldAggressivelyRefreshConferences),
  });

  const mailboxesQuery = useQuery({
    queryKey: ["mailboxes", sessionToken],
    queryFn: () => getOwnMailboxes(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.mailboxes,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 60_000,
  });

  const archivedConferencesQuery = useQuery({
    queryKey: ["video-conferences-archive", sessionToken],
    queryFn: () => getArchivedVideoConferences(sessionToken),
    enabled: bootstrapReady && shouldFetchArchivedConferences,
    initialData: initialWorkspaceBootstrap?.archivedConferences,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    refetchInterval: sidebarSheet === "archive" ? 60_000 : false,
    refetchIntervalInBackground: sidebarSheet === "archive",
    staleTime: 60_000,
  });

  const userSearchQuery = useQuery({
    queryKey: ["workspace-search", sessionToken, normalizedSearchText],
    queryFn: () => searchWorkspace(sessionToken, normalizedSearchText),
    enabled: normalizedSearchText.length > 0,
    staleTime: 15_000,
    gcTime: searchQueryGcTimeMs,
    placeholderData: (previous) => previous,
  });

  const contactsSearchQuery = useQuery({
    queryKey: ["workspace-search", sessionToken, "contacts", normalizedContactSearchText],
    queryFn: () => searchWorkspace(sessionToken, normalizedContactSearchText),
    enabled: normalizedContactSearchText.length > 0,
    staleTime: 15_000,
    gcTime: searchQueryGcTimeMs,
    placeholderData: (previous) => previous,
  });

  const activeTypingQuery = useQuery({
    queryKey: ["typing", sessionToken, activeChatId],
    queryFn: () => getTypingParticipants(sessionToken, activeChatId!),
    enabled: Boolean(activeChatId) && !isRealtimeConnected && isActiveChatOpen && isDocumentVisible,
    refetchInterval: getTypingQueryRefetchInterval({
      activeChatId,
      isActiveChatOpen,
      isDocumentVisible,
      isRealtimeConnected,
    }),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: typingQueryGcTimeMs,
  });

  const activeChat = (chatsQuery.data ?? []).find((chat) => chat.id === activeChatId) ?? null;
  const initialMessagePageCursor =
    activeChat?.id && messageNavigationSeed?.chatId === activeChat.id
      ? ({
          cursor: messageNavigationSeed.cursor,
          limit: MESSAGE_PAGE_SIZE,
        } satisfies MessagePageCursor)
      : createInitialMessagePageCursor();
  const pendingOutgoingMessagesQuery = useQuery({
    queryKey: ["pending-outgoing-messages", userId],
    queryFn: () => getPendingOutgoingMessages(sessionToken),
    enabled: bootstrapReady,
    initialData: initialWorkspaceBootstrap?.pendingOutgoingMessages,
    initialDataUpdatedAt: initialWorkspaceBootstrap
      ? initialWorkspaceBootstrapUpdatedAt
      : undefined,
    staleTime: 15_000,
  });

  const applyConfirmedPendingOutgoingClientMessageIds = (clientMessageIds: string[]) => {
    if (!clientMessageIds.length) {
      return;
    }

    const recoveredMessages =
      queryClient.getQueryData<PendingOutgoingMessage[]>([
        "pending-outgoing-messages",
        userId,
      ]) ?? [];
    const confirmedClientMessageIds = new Set(clientMessageIds);
    const staleRecoveredMessages = recoveredMessages.filter((message) =>
      confirmedClientMessageIds.has(message.clientMessageId)
    );
    if (!staleRecoveredMessages.length) {
      return;
    }

    const staleClientMessageIds = new Set(
      staleRecoveredMessages.map((message) => message.clientMessageId)
    );
    const nextRecoveredMessages = recoveredMessages.filter(
      (message) => !staleClientMessageIds.has(message.clientMessageId)
    );
    queryClient.setQueryData(["pending-outgoing-messages", userId], nextRecoveredMessages);
    staleRecoveredMessages.forEach((message) => {
      void deletePendingOutgoingMessage(sessionToken, message.clientMessageId).catch(() => undefined);
    });
  };

  const messagesQuery = useInfiniteQuery({
    queryKey: buildMessagesQueryKey(userId, activeChat?.id),
    queryFn: async ({ pageParam }) => {
      const resolvedPageParam = {
        cursor: pageParam?.cursor ?? null,
        limit: pageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE,
      } satisfies MessagePageCursor;
      const pageRequestKey = buildMessagePageRequestKey(resolvedPageParam);
      const chatOpen =
        resolvedPageParam.cursor == null
          ? await getChatOpen(sessionToken, activeChat!.id, {
              acknowledgeDelivered: false,
              limit: resolvedPageParam.limit,
            })
          : null;
      const messagePage =
        chatOpen == null
          ? await getMessagesPage(sessionToken, activeChat!.id, {
              acknowledgeDelivered: false,
              cursor: resolvedPageParam.cursor,
              limit: resolvedPageParam.limit,
            })
          : null;
      if (chatOpen) {
        queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
          upsertChat(current, chatOpen.chat)
        );
      }
      nextMessageCursorByRequestKeyRef.current.set(
        pageRequestKey,
        chatOpen?.initialMessagesNextCursor ?? messagePage?.nextCursor ?? null
      );
      applyConfirmedPendingOutgoingClientMessageIds(
        chatOpen?.confirmedPendingOutgoingClientMessageIds ??
          messagePage?.confirmedPendingOutgoingClientMessageIds ??
          []
      );
      return (chatOpen?.initialMessages ?? messagePage?.messages ?? []).map(hydrateApiChatMessage);
    },
    enabled: Boolean(activeChat?.id),
    initialPageParam: initialMessagePageCursor,
    getNextPageParam: (_lastPage, _allPages, lastPageParam) =>
      getNextMessagePageCursor(
        nextMessageCursorByRequestKeyRef.current.get(
          buildMessagePageRequestKey(lastPageParam)
        )
      ),
    maxPages: 4,
    refetchInterval: getMessagesQueryRefetchInterval({
      activeChatId: activeChat?.id ?? null,
      activePendingOutgoingCount,
      isActiveChatOpen,
      isDocumentVisible,
      isRealtimeConnected,
    }),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: messageQueryGcTimeMs,
    structuralSharing: (current, incoming) =>
      reconcileMessageInfiniteData(
        current as InfiniteData<ChatMessage[]> | undefined,
        incoming as InfiniteData<ChatMessage[]> | undefined
      ),
  });

  const recoveredPendingMessages = useMemo(
    () =>
      (pendingOutgoingMessagesQuery.data ?? [])
        .filter((message) => message.chatId === activeChat?.id)
        .map((message) => toRecoveredPendingChatMessage(currentUser, message)),
    [activeChat?.id, currentUser, pendingOutgoingMessagesQuery.data]
  );

  const mergedMessagePages = useMemo(() => {
    if (!recoveredPendingMessages.length) {
      return messagesQuery.data;
    }

    return {
      pages: [...(messagesQuery.data?.pages ?? []), recoveredPendingMessages],
      pageParams: [...(messagesQuery.data?.pageParams ?? []), null],
    } satisfies InfiniteData<ChatMessage[]>;
  }, [messagesQuery.data, recoveredPendingMessages]);

  const messages = useMemo(
    () => flattenMessagePages(mergedMessagePages?.pages),
    [mergedMessagePages?.pages]
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
    mailboxesQuery,
    messages,
    messagesQuery,
    pendingOutgoingMessagesQuery,
    profileQuery,
    sessionsQuery,
    userSearchQuery,
  };
}
