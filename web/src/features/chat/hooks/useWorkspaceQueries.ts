import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getArchivedChats,
  getArchivedVideoConferences,
  getBlockedUsers,
  getChatOpen,
  getChats,
  getContacts,
  getMessagesPage,
  getPendingOutgoingMessages,
  getProfile,
  getSessions,
  getTypingParticipants,
  getVideoConferences,
  searchWorkspace,
} from "../../../lib/api";
import {
  isUnavailableEncryptedMessage,
} from "../../../lib/e2eeShared";
import {
  E2EE_ENCRYPTION_STATE_SYNCED_EVENT,
  type E2eeEncryptionStateSyncedDetail,
} from "../../../lib/e2eeEvents";
import { deletePendingOutgoingMessage } from "../../../lib/api";
import { toRecoveredPendingChatMessage } from "../../../lib/pendingOutgoingMessages";
import type {
  ApiChatMessage,
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
  updateMessageById,
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
  searchQueryGcTimeMs: number;
  searchText: string;
  sessionToken: string;
  sidebarSheet: SidebarSheet;
  typingQueryGcTimeMs: number;
  userId: string;
};

const INITIAL_MESSAGE_PAGE_SIZE = 30;
const MESSAGE_HYDRATION_RETRY_DELAYS_MS = [250, 1_000, 3_000] as const;
const CONNECTED_CHATS_REFETCH_INTERVAL_MS = 60_000;
const FALLBACK_CHATS_REFETCH_INTERVAL_MS = 15_000;
const FALLBACK_TYPING_REFETCH_INTERVAL_MS = 5_000;
const FALLBACK_MESSAGES_REFETCH_INTERVAL_MS = 10_000;
const CHATS_QUERY_STALE_TIME_MS = 15_000;

function isDocumentVisibleNow() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function buildMessageHydrationKey(
  chatId: string,
  message: Pick<ApiChatMessage, "id" | "editedAt">
) {
  return `${chatId}:${message.id}:${message.editedAt ?? ""}`;
}

export function resetMessageHydrationStateForChat(options: {
  chatId: string;
  queuedHydrationKeys: Set<string>;
  hydrationQueue: Map<string, { chatId: string; rawMessage: ApiChatMessage }>;
  hydrationRetryCounts: Map<string, number>;
  hydrationRetryTimeoutIds: Map<string, number>;
  clearTimeout: (timeoutId: number) => void;
}) {
  const prefix = `${options.chatId}:`;
  [...options.queuedHydrationKeys].forEach((hydrationKey) => {
    if (hydrationKey.startsWith(prefix)) {
      options.queuedHydrationKeys.delete(hydrationKey);
    }
  });
  [...options.hydrationQueue.keys()].forEach((hydrationKey) => {
    if (hydrationKey.startsWith(prefix)) {
      options.hydrationQueue.delete(hydrationKey);
    }
  });
  [...options.hydrationRetryCounts.keys()].forEach((hydrationKey) => {
    if (hydrationKey.startsWith(prefix)) {
      options.hydrationRetryCounts.delete(hydrationKey);
    }
  });
  [...options.hydrationRetryTimeoutIds.entries()].forEach(([hydrationKey, timeoutId]) => {
    if (!hydrationKey.startsWith(prefix)) {
      return;
    }
    options.clearTimeout(timeoutId);
    options.hydrationRetryTimeoutIds.delete(hydrationKey);
  });
}

export type MessagePageCursor = {
  cursor: string | null;
  limit: number;
};

export function createInitialMessagePageCursor(): MessagePageCursor {
  return {
    cursor: null,
    limit: INITIAL_MESSAGE_PAGE_SIZE,
  };
}

export function buildRawMessagesQueryKey(userId: string, chatId: string | null | undefined) {
  return ["messages-raw", userId, chatId ?? null] as const;
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

export function upsertRawMessagePage(
  current: InfiniteData<ApiChatMessage[]> | undefined,
  nextPage: ApiChatMessage[],
  pageParam: MessagePageCursor
): InfiniteData<ApiChatMessage[]> {
  const normalizedPageParam = {
    cursor: pageParam.cursor ?? null,
    limit: pageParam.limit,
  } satisfies MessagePageCursor;

  if (!current) {
    return {
      pages: [nextPage],
      pageParams: [normalizedPageParam],
    };
  }

  const pageIndex = current.pageParams.findIndex((currentPageParam) => {
    const candidate = (currentPageParam ?? null) as MessagePageCursor | null;
    return (
      (candidate?.cursor ?? null) === normalizedPageParam.cursor &&
      (candidate?.limit ?? INITIAL_MESSAGE_PAGE_SIZE) === normalizedPageParam.limit
    );
  });

  if (pageIndex < 0) {
    return {
      pages: [...current.pages, nextPage],
      pageParams: [...current.pageParams, normalizedPageParam],
    };
  }

  return {
    pages: current.pages.map((page, index) => (index === pageIndex ? nextPage : page)),
    pageParams: current.pageParams.map((currentPageParam, index) =>
      index === pageIndex ? normalizedPageParam : currentPageParam
    ),
  };
}

function buildMessagePageRequestKey(pageParam: MessagePageCursor | null | undefined) {
  return `${pageParam?.cursor ?? "initial"}|${pageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE}`;
}

export function mergeHydratedMessageSnapshot(
  currentMessage: ChatMessage,
  hydratedMessage: ChatMessage
) {
  const nextContent =
    isUnavailableEncryptedMessage(hydratedMessage.content) &&
    !isUnavailableEncryptedMessage(currentMessage.content)
      ? currentMessage.content
      : hydratedMessage.content;
  const nextClientMessageId =
    hydratedMessage.clientMessageId ?? currentMessage.clientMessageId ?? null;
  const nextServerOrder = hydratedMessage.serverOrder ?? currentMessage.serverOrder ?? null;
  const nextEditedAt = hydratedMessage.editedAt ?? currentMessage.editedAt ?? null;
  const nextStatus = hydratedMessage.status ?? currentMessage.status;
  const nextReplyTo = hydratedMessage.replyTo ?? currentMessage.replyTo;
  const nextLocalOrder = currentMessage.localOrder ?? hydratedMessage.localOrder ?? null;

  if (
    nextContent === currentMessage.content &&
    nextClientMessageId === (currentMessage.clientMessageId ?? null) &&
    nextServerOrder === (currentMessage.serverOrder ?? null) &&
    nextEditedAt === currentMessage.editedAt &&
    nextStatus === currentMessage.status &&
    nextReplyTo === currentMessage.replyTo &&
    nextLocalOrder === (currentMessage.localOrder ?? null)
  ) {
    return currentMessage;
  }

  return {
    ...currentMessage,
    ...hydratedMessage,
    content: nextContent,
    clientMessageId: nextClientMessageId,
    serverOrder: nextServerOrder,
    editedAt: nextEditedAt,
    status: nextStatus,
    replyTo: nextReplyTo,
    localOrder: nextLocalOrder,
  } satisfies ChatMessage;
}

export function shouldRetryUnavailableHydration(
  currentMessage: Pick<ChatMessage, "content">,
  hydratedMessage: Pick<ChatMessage, "content">
) {
  return (
    isUnavailableEncryptedMessage(currentMessage.content) &&
    isUnavailableEncryptedMessage(hydratedMessage.content)
  );
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
  searchQueryGcTimeMs,
  searchText,
  sessionToken,
  sidebarSheet,
  typingQueryGcTimeMs,
  userId,
}: UseWorkspaceQueriesOptions) {
  const queryClient = useQueryClient();
  const [isDocumentVisible, setIsDocumentVisible] = useState(isDocumentVisibleNow);
  const queuedMessageHydrationKeysRef = useRef(new Set<string>());
  const messageHydrationQueueRef = useRef(
    new Map<string, { chatId: string; rawMessage: ApiChatMessage }>()
  );
  const messageHydrationWorkerRunningRef = useRef(false);
  const messageHydrationRetryCountRef = useRef(new Map<string, number>());
  const messageHydrationRetryTimeoutIdRef = useRef(new Map<string, number>());
  const nextMessageCursorByRequestKeyRef = useRef(new Map<string, string | null>());
  const shouldFetchSessions = sidebarSheet === "sessions";
  const shouldAggressivelyRefreshConferences =
    activeListTab === "conferences" || Boolean(activeConferenceId);
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
  }, [activeChatId]);

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
      const { getEncryptedMessagesSnapshot } = await import("../../../lib/e2ee");
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
      const { hydratedMessages, rawMessages } = await getEncryptedMessagesSnapshot(
        sessionToken,
        userId,
        activeChat!.id,
        {
          limit: resolvedPageParam.limit,
          prefetchedRawMessages: chatOpen?.initialMessages ?? messagePage?.messages,
          prefetchedActiveGroupHistoryKeyAccess: chatOpen?.activeHistoryKeyAccess ?? null,
        }
      );

      queryClient.setQueryData<InfiniteData<ApiChatMessage[]>>(
        buildRawMessagesQueryKey(userId, activeChat!.id),
        (current) => upsertRawMessagePage(current, rawMessages, resolvedPageParam)
      );

      return hydratedMessages;
    },
    enabled: Boolean(activeChat?.id),
    initialPageParam: createInitialMessagePageCursor(),
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

  useEffect(() => {
    if (!activeChat?.id || typeof window === "undefined") {
      return;
    }

    const handleEncryptionStateSync = (event: Event) => {
      const detail = (event as CustomEvent<E2eeEncryptionStateSyncedDetail>).detail;
      if (detail?.userId !== userId) {
        return;
      }

      resetMessageHydrationStateForChat({
        chatId: activeChat.id,
        queuedHydrationKeys: queuedMessageHydrationKeysRef.current,
        hydrationQueue: messageHydrationQueueRef.current,
        hydrationRetryCounts: messageHydrationRetryCountRef.current,
        hydrationRetryTimeoutIds: messageHydrationRetryTimeoutIdRef.current,
        clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
      });
      void queryClient.invalidateQueries({
        queryKey: buildMessagesQueryKey(userId, activeChat.id),
      });
    };

    window.addEventListener(E2EE_ENCRYPTION_STATE_SYNCED_EVENT, handleEncryptionStateSync);
    return () => {
      window.removeEventListener(E2EE_ENCRYPTION_STATE_SYNCED_EVENT, handleEncryptionStateSync);
    };
  }, [activeChat?.id, queryClient, userId]);

  useEffect(() => {
    const drainMessageHydrationQueue = async () => {
      const clearHydrationRetry = (hydrationKey: string) => {
        const timeoutId = messageHydrationRetryTimeoutIdRef.current.get(hydrationKey);
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          messageHydrationRetryTimeoutIdRef.current.delete(hydrationKey);
        }
        messageHydrationRetryCountRef.current.delete(hydrationKey);
      };

      const scheduleHydrationRetry = (
        hydrationKey: string,
        queuedMessage: { chatId: string; rawMessage: ApiChatMessage }
      ) => {
        if (messageHydrationRetryTimeoutIdRef.current.has(hydrationKey)) {
          return;
        }

        const currentAttempt = messageHydrationRetryCountRef.current.get(hydrationKey) ?? 0;
        const retryDelay = MESSAGE_HYDRATION_RETRY_DELAYS_MS[currentAttempt];
        if (retryDelay === undefined) {
          return;
        }

        messageHydrationRetryCountRef.current.set(hydrationKey, currentAttempt + 1);
        queuedMessageHydrationKeysRef.current.delete(hydrationKey);
        const timeoutId = window.setTimeout(() => {
          messageHydrationRetryTimeoutIdRef.current.delete(hydrationKey);
          queuedMessageHydrationKeysRef.current.add(hydrationKey);
          messageHydrationQueueRef.current.set(hydrationKey, queuedMessage);
          void drainMessageHydrationQueue();
        }, retryDelay);
        messageHydrationRetryTimeoutIdRef.current.set(hydrationKey, timeoutId);
      };

      if (messageHydrationWorkerRunningRef.current) {
        return;
      }

      messageHydrationWorkerRunningRef.current = true;
      try {
        const { hydrateChatMessage } = await import("../../../lib/e2ee");
        while (messageHydrationQueueRef.current.size > 0) {
          const nextQueuedMessage = messageHydrationQueueRef.current.entries().next().value as
            | [string, { chatId: string; rawMessage: ApiChatMessage }]
            | undefined;
          if (!nextQueuedMessage) {
            break;
          }

          const [hydrationKey, queuedMessage] = nextQueuedMessage;
          messageHydrationQueueRef.current.delete(hydrationKey);

          try {
            const hydratedMessage = await hydrateChatMessage(queuedMessage.rawMessage, userId);
            let shouldRetry = false;
            queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
              buildMessagesQueryKey(userId, queuedMessage.chatId),
              (current) =>
                updateMessageById(current, hydratedMessage.id, (currentMessage) =>
                  {
                    shouldRetry = shouldRetryUnavailableHydration(
                      currentMessage,
                      hydratedMessage
                    );
                    return mergeHydratedMessageSnapshot(currentMessage, hydratedMessage);
                  }
                )
            );
            if (shouldRetry) {
              scheduleHydrationRetry(hydrationKey, queuedMessage);
            } else {
              clearHydrationRetry(hydrationKey);
            }
          } catch {
            scheduleHydrationRetry(hydrationKey, queuedMessage);
          }
        }
      } finally {
        messageHydrationWorkerRunningRef.current = false;
        if (messageHydrationQueueRef.current.size > 0) {
          void drainMessageHydrationQueue();
        }
      }
    };

    if (!activeChat?.id) {
      return;
    }

    const rawMessages = queryClient.getQueryData<InfiniteData<ApiChatMessage[]>>(
      buildRawMessagesQueryKey(userId, activeChat.id)
    );
    if (!rawMessages?.pages.length) {
      return;
    }

    rawMessages.pages.forEach((page) => {
      page.forEach((rawMessage) => {
        const hydrationKey = buildMessageHydrationKey(activeChat.id, rawMessage);
        if (queuedMessageHydrationKeysRef.current.has(hydrationKey)) {
          return;
        }

        queuedMessageHydrationKeysRef.current.add(hydrationKey);
        messageHydrationQueueRef.current.set(hydrationKey, {
          chatId: activeChat.id,
          rawMessage,
        });
      });
    });

    void drainMessageHydrationQueue();
  }, [activeChat?.id, messagesQuery.data?.pages, queryClient, userId]);

  useEffect(() => {
    return () => {
      messageHydrationRetryTimeoutIdRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      messageHydrationRetryTimeoutIdRef.current.clear();
      messageHydrationRetryCountRef.current.clear();
    };
  }, []);

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
    pendingOutgoingMessagesQuery,
    profileQuery,
    sessionsQuery,
    userSearchQuery,
  };
}
