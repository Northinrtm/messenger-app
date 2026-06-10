import { type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { clearChatReactionAttention } from "../../../lib/api";
import { replaceSubscribedChatIds, subscribeToChats } from "../../../lib/realtime";
import type {
  ChatMessage,
  ChatRemovalEvent,
  ChatSummary,
  MessageDeletionEvent,
  MessageReactionEvent,
  MessageStatusEvent,
  Participant,
  SessionEvent,
  TypingEvent,
  UserProfile,
  VideoConference,
} from "../../../lib/types";
import {
  buildMessagesQueryKey,
  mergeMessagePages,
  removeMessageById,
  clearChatReactionIndicators,
  setChatReactionAttention,
  updateMessageReactionsPages,
  updateMessageStatusPages,
  upsertChat,
} from "../chatState";
import { applyTypingEvent } from "../typingState";
import {
  parseRealtimeEventTimestamp,
  shouldProcessTypingEvent,
} from "../typingRealtime";
import { shouldAcknowledgeIncomingMessageAsRead } from "./messageReadVisibility";

type UseRealtimeChatSubscriptionOptions = {
  activeChatId: string | null;
  isActiveChatOpen: boolean;
  hasActiveComposerTextRef: { current: boolean };
  activePinnedMessageIdSet: ReadonlySet<string>;
  chatIdsKey: string;
  clearChatUnreadIndicator: (chatId: string) => void;
  clearComposerContext: (mode?: "all" | "reply" | "edit" | "forward") => void;
  clearDraftForChat: (chatId: string) => void;
  clearTypingParticipant: (chatId: string, participantId: string) => void;
  currentSessionId: string;
  currentUser: UserProfile;
  deleteChatLocally: (chatId: string) => void;
  isOwnMessage: (message: ChatMessage) => boolean;
  isRealtimeConnected: boolean;
  normalizeIncomingMessage: (message: ChatMessage) => ChatMessage;
  onConnectionChange: (connected: boolean) => void;
  onIncomingCall: (conference: VideoConference) => void;
  onUnauthorized: () => void;
  queryClient: QueryClient;
  refreshChatPreviewFromServer: (chatId: string) => Promise<unknown> | void;
  scheduleTypingStop: (chatId: string, participantId: string) => void;
  scheduleTypingTimeout: (chatId: string, participantId: string) => void;
  sendTypingHeartbeat: (chatId: string) => void;
  sessionToken: string;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setForwardingMessageIds: React.Dispatch<React.SetStateAction<string[]>>;
  setReplyingToMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setTypingByChatId: React.Dispatch<React.SetStateAction<Record<string, Participant[]>>>;
  showIncomingToast: (message: ChatMessage) => void;
  removeChatPinnedMessage: (chatId: string, messageId: string) => void;
  syncChatPreviewFromCache: (chatId: string) => void;
  acknowledgeDelivered: (chatId: string, messageIds: string[]) => void;
  acknowledgeRead: (chatId: string, messageIds: string[]) => void;
  applyChatPreviewMessage: (message: ChatMessage) => void;
  applyServerChatPreviewMessage: (
    message: ChatMessage,
    unreadMode: "clear" | "keep"
  ) => void;
};

type ActiveChatReconnectSnapshot = {
  chatId: string;
  dataUpdatedAt: number;
};

export function getRealtimeUnreadMode(options: {
  ownMessage: boolean;
  isVisibleActiveChat: boolean;
}) {
  return options.ownMessage || options.isVisibleActiveChat ? "clear" : "keep";
}

export function shouldRefreshChatListOnRealtimeConnect(
  hasEstablishedRealtimeConnection: boolean
) {
  return hasEstablishedRealtimeConnection;
}

export function shouldRefreshActiveChatOnRealtimeChatUpdate(
  _chat: Pick<ChatSummary, "id" | "direct">,
  _options: {
    activeChatId: string | null;
    cachedMessages: InfiniteData<Pick<ChatMessage, "content">[]> | undefined;
  }
) {
  return false;
}

export function useRealtimeChatSubscription({
  acknowledgeDelivered,
  acknowledgeRead,
  activeChatId,
  isActiveChatOpen,
  hasActiveComposerTextRef,
  activePinnedMessageIdSet,
  applyChatPreviewMessage,
  applyServerChatPreviewMessage,
  chatIdsKey,
  clearChatUnreadIndicator,
  clearComposerContext,
  clearDraftForChat,
  clearTypingParticipant,
  currentSessionId,
  currentUser,
  deleteChatLocally,
  isOwnMessage,
  isRealtimeConnected,
  normalizeIncomingMessage,
  onConnectionChange,
  onIncomingCall,
  onUnauthorized,
  queryClient,
  refreshChatPreviewFromServer,
  scheduleTypingStop,
  scheduleTypingTimeout,
  sendTypingHeartbeat,
  sessionToken,
  setEditingMessageId,
  setForwardingMessageIds,
  setReplyingToMessageId,
  setTypingByChatId,
  showIncomingToast,
  removeChatPinnedMessage,
  syncChatPreviewFromCache,
}: UseRealtimeChatSubscriptionOptions) {
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const hasEstablishedRealtimeConnectionRef = useRef(false);
  const activeChatReconnectSnapshotRef = useRef<ActiveChatReconnectSnapshot | null>(null);
  const typingEventWatermarksRef = useRef(new Map<string, number>());
  const getMessagesKey = (chatId: string) => buildMessagesQueryKey(currentUser.id, chatId);

  const rememberRealtimeMessage = (messageId: string) => {
    handledRealtimeMessageIdsRef.current.set(messageId, true);
    if (handledRealtimeMessageIdsRef.current.size > 300) {
      const oldestMessageId = handledRealtimeMessageIdsRef.current.keys().next().value;
      if (oldestMessageId) {
        handledRealtimeMessageIdsRef.current.delete(oldestMessageId);
      }
    }
  };

  const handleRealtimeMessage = useEffectEvent((message: ChatMessage) => {
    if (handledRealtimeMessageIdsRef.current.has(message.id)) {
      return;
    }

    const nextMessage = normalizeIncomingMessage(message);
    const typingMessageKey = `${message.chatId}:${message.sender.id}`;
    const messageCreatedAt = parseRealtimeEventTimestamp(message.createdAt);
    const previousTypingWatermark = typingEventWatermarksRef.current.get(typingMessageKey);
    if (previousTypingWatermark === undefined || messageCreatedAt > previousTypingWatermark) {
      typingEventWatermarksRef.current.set(typingMessageKey, messageCreatedAt);
    }
    const ownMessage = isOwnMessage(nextMessage);
    const isVisibleActiveChat = shouldAcknowledgeIncomingMessageAsRead({
      activeChatId,
      messageChatId: nextMessage.chatId,
      isActiveChatOpen,
      isDocumentVisible: document.visibilityState === "visible",
      hasDocumentFocus:
        typeof document.hasFocus !== "function" || document.hasFocus(),
    });
    clearTypingParticipant(message.chatId, message.sender.id);
    rememberRealtimeMessage(message.id);
    applyChatPreviewMessage(nextMessage);

    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      getMessagesKey(nextMessage.chatId),
      (current) => mergeMessagePages(current, nextMessage)
    );
    applyServerChatPreviewMessage(
      nextMessage,
      getRealtimeUnreadMode({ ownMessage, isVisibleActiveChat })
    );

    if (!ownMessage) {
      if (isVisibleActiveChat) {
        clearChatUnreadIndicator(nextMessage.chatId);
        void acknowledgeRead(nextMessage.chatId, [nextMessage.id]);
      } else {
        void acknowledgeDelivered(nextMessage.chatId, [nextMessage.id]);
      }
    }

    showIncomingToast(nextMessage);
  });

  const handleRealtimeChat = useEffectEvent((chat: ChatSummary) => {
    const currentChats = queryClient.getQueryData<ChatSummary[]>(["chats", sessionToken]) ?? [];
    const existingChat = currentChats.find((currentChat) => currentChat.id === chat.id) ?? null;
    if (existingChat?.chatVersion === chat.chatVersion) {
      return;
    }
    const isNewChat = existingChat === null;
    const shouldRefreshActiveChat = shouldRefreshActiveChatOnRealtimeChatUpdate(chat, {
      activeChatId,
      cachedMessages: queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(chat.id)
      ),
    });

    queryClient.setQueryData<ChatSummary[]>(
      ["chats", sessionToken],
      (current) => upsertChat(current, chat)
    );

    if (isNewChat) {
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    }

    if (shouldRefreshActiveChat) {
      void queryClient.invalidateQueries({ queryKey: getMessagesKey(chat.id) });
    }
  });

  const handleRealtimeSession = useEffectEvent((event: SessionEvent) => {
    if (event.type === "SESSION_REVOKED" && event.sessionId === currentSessionId) {
      onUnauthorized();
    }
  });

  const handleRealtimeIncomingCall = useEffectEvent((conference: VideoConference) => {
    onIncomingCall(conference);
  });

  const handleRealtimeConnect = useEffectEvent(() => {
    const currentActiveChatId = activeChatId;
    const hadPreviousRealtimeConnection = hasEstablishedRealtimeConnectionRef.current;
    const shouldRefreshActiveChat = shouldRefreshActiveChatOnRealtimeConnect(
      hadPreviousRealtimeConnection,
      {
        activeChatId: currentActiveChatId,
        disconnectedChatSnapshot: activeChatReconnectSnapshotRef.current,
        currentDataUpdatedAt: currentActiveChatId
          ? queryClient.getQueryState<InfiniteData<ChatMessage[]>>(getMessagesKey(currentActiveChatId))
              ?.dataUpdatedAt ?? 0
          : 0,
      }
    );
    hasEstablishedRealtimeConnectionRef.current = true;
    activeChatReconnectSnapshotRef.current = null;
    if (shouldRefreshChatListOnRealtimeConnect(hadPreviousRealtimeConnection)) {
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    }
    if (!currentActiveChatId) {
      return;
    }

    if (shouldRefreshActiveChat) {
      void queryClient.invalidateQueries({ queryKey: getMessagesKey(currentActiveChatId) });
    }
    if (hasActiveComposerTextRef.current) {
      sendTypingHeartbeat(currentActiveChatId);
    }
  });

  const handleRealtimeMessageStatus = useEffectEvent((event: MessageStatusEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      getMessagesKey(event.chatId),
      (current) => updateMessageStatusPages(current, event)
    );
  });

  const handleRealtimeMessageDeletion = useEffectEvent((event: MessageDeletionEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      getMessagesKey(event.chatId),
      (current) => removeMessageById(current, event.messageId)
    );
    if (activePinnedMessageIdSet.has(event.messageId)) {
      removeChatPinnedMessage(event.chatId, event.messageId);
    }
    setReplyingToMessageId((current) => (current === event.messageId ? null : current));
    setEditingMessageId((current) => (current === event.messageId ? null : current));
    if (event.messageId) {
      setForwardingMessageIds((current) => {
        if (!current.includes(event.messageId)) {
          return current;
        }
        const next = current.filter((messageId) => messageId !== event.messageId);
        if (next.length === 0) {
          clearComposerContext("forward");
        }
        return next;
      });
    }
    syncChatPreviewFromCache(event.chatId);
    void refreshChatPreviewFromServer(event.chatId);
  });

  const handleRealtimeMessageReaction = useEffectEvent((event: MessageReactionEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      getMessagesKey(event.chatId),
      (current) => updateMessageReactionsPages(current, event)
    );
    if (activeChatId === event.chatId && isActiveChatOpen) {
      queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
        setChatReactionAttention(current, event.chatId, false)
      );
      void clearChatReactionAttention(sessionToken, event.chatId).catch(() => undefined);
    } else {
      void refreshChatPreviewFromServer(event.chatId);
    }
  });

  const handleRealtimeChatRemoval = useEffectEvent((event: ChatRemovalEvent) => {
    deleteChatLocally(event.chatId);
    clearDraftForChat(event.chatId);
    void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    void queryClient.invalidateQueries({ queryKey: ["archived-chats", sessionToken] });
  });

  const handleRealtimeTyping = useEffectEvent((event: TypingEvent) => {
    if (event.participant.id === currentUser.id) {
      return;
    }

    const typingEventKey = `${event.chatId}:${event.participant.id}`;
    const typingEventTimestamp = parseRealtimeEventTimestamp(event.createdAt);
    const previousTypingWatermark = typingEventWatermarksRef.current.get(typingEventKey);
    if (!shouldProcessTypingEvent(previousTypingWatermark, typingEventTimestamp)) {
      return;
    }
    typingEventWatermarksRef.current.set(typingEventKey, typingEventTimestamp);

    if (!event.typing) {
      scheduleTypingStop(event.chatId, event.participant.id);
      return;
    }

    setTypingByChatId((current) => applyTypingEvent(current, event, currentUser.id));
    scheduleTypingTimeout(event.chatId, event.participant.id);
  });

  useEffect(() => {
    // Effect Events always read the latest render state and should not be treated as
    // reactive dependencies, otherwise ordinary rerenders churn the websocket client.
    return subscribeToChats({
      chatIds: [],
      token: sessionToken,
      currentUserId: currentUser.id,
      onChat: handleRealtimeChat,
      onAuthFailure: onUnauthorized,
      onChatRemoval: handleRealtimeChatRemoval,
      onConnectionChange,
      onConnect: handleRealtimeConnect,
      onMessage: handleRealtimeMessage,
      onMessageDeletion: handleRealtimeMessageDeletion,
      onMessageReaction: handleRealtimeMessageReaction,
      onMessageStatus: handleRealtimeMessageStatus,
      onSessionEvent: handleRealtimeSession,
      onIncomingCall: handleRealtimeIncomingCall,
      onTyping: handleRealtimeTyping,
    });
  }, [currentUser.id, onConnectionChange, sessionToken]);

  useEffect(() => {
    replaceSubscribedChatIds(chatIdsKey ? chatIdsKey.split(",") : []);
  }, [chatIdsKey]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
      clearChatReactionIndicators(current, activeChatId)
    );
  }, [activeChatId, queryClient, sessionToken]);

  useEffect(() => {
    if (isRealtimeConnected) {
      activeChatReconnectSnapshotRef.current = null;
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    if (!activeChatId) {
      return;
    }

    activeChatReconnectSnapshotRef.current = {
      chatId: activeChatId,
      dataUpdatedAt:
        queryClient.getQueryState<InfiniteData<ChatMessage[]>>(getMessagesKey(activeChatId))
          ?.dataUpdatedAt ?? 0,
    };
    void queryClient.invalidateQueries({ queryKey: ["typing", sessionToken, activeChatId] });
  }, [activeChatId, isRealtimeConnected, queryClient, sessionToken]);
}

export function shouldRefreshActiveChatOnRealtimeConnect(
  hasEstablishedRealtimeConnection: boolean,
  options?: {
    activeChatId?: string | null;
    disconnectedChatSnapshot?: ActiveChatReconnectSnapshot | null;
    currentDataUpdatedAt?: number;
  }
) {
  if (!hasEstablishedRealtimeConnection) {
    return false;
  }

  if (!options?.activeChatId) {
    return true;
  }

  const snapshot = options.disconnectedChatSnapshot;
  if (!snapshot || snapshot.chatId !== options.activeChatId) {
    return true;
  }

  return (options.currentDataUpdatedAt ?? 0) <= snapshot.dataUpdatedAt;
}
