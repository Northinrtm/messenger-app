import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
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
  listOwnEncryptionDevices,
  searchUsers,
} from "../../../lib/api";
import {
  isUnavailableEncryptedMessage,
} from "../../../lib/e2eeShared";
import {
  E2EE_DEVICE_STATE_SYNCED_EVENT,
  type E2eeDeviceStateSyncedDetail,
} from "../../../lib/e2eeEvents";
import { recoverLocalPendingMessages, removeLocalPendingMessage, toRecoveredPendingChatMessage } from "../../../lib/localPendingMessages";
import type { ApiChatMessage, ChatMessage, ChatSummary, UserProfile } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import {
  buildMessagesQueryKey,
  flattenMessagePages,
  MESSAGE_PAGE_SIZE,
  reconcileMessageInfiniteData,
  updateMessageById,
} from "../chatState";

type UseWorkspaceQueriesOptions = {
  activeChatId: string | null;
  activeConferenceId: string | null;
  activeListTab: ConversationListTab;
  activePendingOutgoingCount: number;
  currentUser: UserProfile;
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
const MESSAGE_HYDRATION_RETRY_DELAYS_MS = [250, 1_000, 3_000] as const;

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
  beforeServerOrder: number | null;
  limit: number;
};

export function createInitialMessagePageCursor(): MessagePageCursor {
  return {
    beforeServerOrder: null,
    limit: INITIAL_MESSAGE_PAGE_SIZE,
  };
}

export function buildRawMessagesQueryKey(userId: string, chatId: string | null | undefined) {
  return ["messages-raw", userId, chatId ?? null] as const;
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
    beforeServerOrder: lastPage[0].serverOrder ?? null,
    limit: MESSAGE_PAGE_SIZE,
  } satisfies MessagePageCursor;
}

export function getCleanupEligiblePendingMessageClientIds(messages: ChatMessage[]) {
  return new Set(
    messages
      .filter(
        (message) =>
          message.clientMessageId &&
          message.id !== message.clientMessageId &&
          !isUnavailableEncryptedMessage(message.content)
      )
      .map((message) => message.clientMessageId as string)
  );
}

export function upsertRawMessagePage(
  current: InfiniteData<ApiChatMessage[]> | undefined,
  nextPage: ApiChatMessage[],
  pageParam: MessagePageCursor
): InfiniteData<ApiChatMessage[]> {
  const normalizedPageParam = {
    beforeServerOrder: pageParam.beforeServerOrder ?? null,
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
      (candidate?.beforeServerOrder ?? null) === normalizedPageParam.beforeServerOrder &&
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
  activeListTab,
  activePendingOutgoingCount,
  currentUser,
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
  const queryClient = useQueryClient();
  const queuedMessageHydrationKeysRef = useRef(new Set<string>());
  const messageHydrationQueueRef = useRef(
    new Map<string, { chatId: string; rawMessage: ApiChatMessage }>()
  );
  const messageHydrationWorkerRunningRef = useRef(false);
  const messageHydrationRetryCountRef = useRef(new Map<string, number>());
  const messageHydrationRetryTimeoutIdRef = useRef(new Map<string, number>());
  const shouldFetchSessions = sidebarSheet === "sessions";
  const shouldFetchEncryptionDevices = sidebarSheet === "sessions";
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

  const encryptionDevicesQuery = useQuery({
    queryKey: ["encryption-devices", sessionToken],
    queryFn: () => listOwnEncryptionDevices(sessionToken),
    enabled: shouldFetchEncryptionDevices,
    refetchInterval: shouldFetchEncryptionDevices ? 60_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const currentEncryptionDeviceQuery = useQuery({
    queryKey: ["current-encryption-device", userId],
    queryFn: async () => {
      const { getCurrentEncryptionDeviceId } = await import("../../../lib/e2ee");
      return getCurrentEncryptionDeviceId(userId);
    },
    enabled: shouldFetchEncryptionDevices,
    staleTime: 15_000,
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
  const pendingOutgoingMessagesQuery = useQuery({
    queryKey: ["pending-outgoing-messages", userId],
    queryFn: () => recoverLocalPendingMessages(userId),
    staleTime: Infinity,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: buildMessagesQueryKey(userId, activeChat?.id),
    queryFn: async ({ pageParam }) => {
      const { getEncryptedMessagesSnapshot } = await import("../../../lib/e2ee");
      const resolvedPageParam = {
        beforeServerOrder: pageParam?.beforeServerOrder ?? null,
        limit: pageParam?.limit ?? INITIAL_MESSAGE_PAGE_SIZE,
      } satisfies MessagePageCursor;
      const { hydratedMessages, rawMessages } = await getEncryptedMessagesSnapshot(
        sessionToken,
        userId,
        activeChat!.id,
        resolvedPageParam
      );

      queryClient.setQueryData<InfiniteData<ApiChatMessage[]>>(
        buildRawMessagesQueryKey(userId, activeChat!.id),
        (current) => upsertRawMessagePage(current, rawMessages, resolvedPageParam)
      );

      return hydratedMessages;
    },
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
    const confirmedClientMessageIds = getCleanupEligiblePendingMessageClientIds(
      flattenMessagePages(messagesQuery.data?.pages)
    );

    if (!confirmedClientMessageIds.size) {
      return;
    }

    const recoveredMessages = pendingOutgoingMessagesQuery.data ?? [];
    const staleRecoveredMessages = recoveredMessages.filter((message) =>
      confirmedClientMessageIds.has(message.clientMessageId)
    );
    if (!staleRecoveredMessages.length) {
      return;
    }

    let nextRecoveredMessages = recoveredMessages;
    staleRecoveredMessages.forEach((message) => {
      nextRecoveredMessages = removeLocalPendingMessage(userId, message.clientMessageId);
    });
    queryClient.setQueryData(["pending-outgoing-messages", userId], nextRecoveredMessages);
  }, [messagesQuery.data?.pages, pendingOutgoingMessagesQuery.data, queryClient, userId]);

  useEffect(() => {
    if (!activeChat?.id || typeof window === "undefined") {
      return;
    }

    const handleEncryptionDeviceSync = (event: Event) => {
      const detail = (event as CustomEvent<E2eeDeviceStateSyncedDetail>).detail;
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

    window.addEventListener(E2EE_DEVICE_STATE_SYNCED_EVENT, handleEncryptionDeviceSync);
    return () => {
      window.removeEventListener(E2EE_DEVICE_STATE_SYNCED_EVENT, handleEncryptionDeviceSync);
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
    currentEncryptionDeviceQuery,
    profileQuery,
    encryptionDevicesQuery,
    sessionsQuery,
    userSearchQuery,
  };
}
