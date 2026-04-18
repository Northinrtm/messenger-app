import { type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { isUnavailableEncryptedMessage } from "../../../lib/e2ee";
import { replaceSubscribedChatIds, subscribeToChats } from "../../../lib/realtime";
import type {
  ChatMessage,
  ChatRemovalEvent,
  ChatSummary,
  MessageDeletionEvent,
  MessageReactionEvent,
  MessageSnippet,
  MessageStatusEvent,
  Participant,
  SessionEvent,
  TypingEvent,
  UserProfile,
} from "../../../lib/types";
import {
  buildMessagesQueryKey,
  mergeMessagePages,
  removeMessageById,
  updateMessageReactionsPages,
  updateMessageStatusPages,
  upsertChat,
} from "../chatState";
import { applyTypingEvent } from "../typingState";

type UseRealtimeChatSubscriptionOptions = {
  activeChatId: string | null;
  activeDraft: string;
  activePinnedMessageId: string | null;
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
  onUnauthorized: () => void;
  queryClient: QueryClient;
  refreshChatPreviewFromServer: (chatId: string) => Promise<unknown> | void;
  scheduleTypingTimeout: (chatId: string, participantId: string) => void;
  sendTypingHeartbeat: (chatId: string) => void;
  sessionToken: string;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setForwardingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setReplyingToMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setTypingByChatId: React.Dispatch<React.SetStateAction<Record<string, Participant[]>>>;
  showIncomingToast: (message: ChatMessage) => void;
  syncChatPinnedSummary: (chatId: string, snippet: MessageSnippet | null) => void;
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

export function useRealtimeChatSubscription({
  acknowledgeDelivered,
  acknowledgeRead,
  activeChatId,
  activeDraft,
  activePinnedMessageId,
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
  onUnauthorized,
  queryClient,
  refreshChatPreviewFromServer,
  scheduleTypingTimeout,
  sendTypingHeartbeat,
  sessionToken,
  setEditingMessageId,
  setForwardingMessageId,
  setReplyingToMessageId,
  setTypingByChatId,
  showIncomingToast,
  syncChatPinnedSummary,
  syncChatPreviewFromCache,
}: UseRealtimeChatSubscriptionOptions) {
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const hasEstablishedRealtimeConnectionRef = useRef(false);
  const activeChatReconnectSnapshotRef = useRef<ActiveChatReconnectSnapshot | null>(null);
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
    const ownMessage = isOwnMessage(nextMessage);
    const isVisibleActiveChat =
      nextMessage.chatId === activeChatId &&
      document.visibilityState === "visible" &&
      (typeof document.hasFocus !== "function" || document.hasFocus());
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
      if (isVisibleActiveChat && !isUnavailableEncryptedMessage(nextMessage.content)) {
        clearChatUnreadIndicator(nextMessage.chatId);
        void acknowledgeRead(nextMessage.chatId, [nextMessage.id]);
      } else {
        void acknowledgeDelivered(nextMessage.chatId, [nextMessage.id]);
      }
    }

    showIncomingToast(nextMessage);
  });

  const handleRealtimeChat = useEffectEvent((chat: ChatSummary) => {
    const isNewChat = !(
      queryClient.getQueryData<ChatSummary[]>(["chats", sessionToken]) ?? []
    ).some((currentChat) => currentChat.id === chat.id);

    queryClient.setQueryData<ChatSummary[]>(
      ["chats", sessionToken],
      (current) => upsertChat(current, chat)
    );

    if (isNewChat) {
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    }

    if (chat.lastMessageAt && chat.lastMessage === "Encrypted message") {
      void refreshChatPreviewFromServer(chat.id);
    }
  });

  const handleRealtimeSession = useEffectEvent((event: SessionEvent) => {
    if (event.type === "SESSION_REVOKED" && event.sessionId === currentSessionId) {
      onUnauthorized();
    }
  });

  const handleRealtimeConnect = useEffectEvent(() => {
    const currentActiveChatId = activeChatId;
    const shouldRefreshActiveChat = shouldRefreshActiveChatOnRealtimeConnect(
      hasEstablishedRealtimeConnectionRef.current,
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
    void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    if (!currentActiveChatId) {
      return;
    }

    if (shouldRefreshActiveChat) {
      void queryClient.invalidateQueries({ queryKey: getMessagesKey(currentActiveChatId) });
    }
    if (activeDraft.trim()) {
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
    if (activePinnedMessageId === event.messageId) {
      syncChatPinnedSummary(event.chatId, null);
    }
    setReplyingToMessageId((current) => (current === event.messageId ? null : current));
    setEditingMessageId((current) => (current === event.messageId ? null : current));
    if (event.messageId) {
      setForwardingMessageId((current) => {
        if (current === event.messageId) {
          clearComposerContext("forward");
          return null;
        }
        return current;
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

    if (!event.typing) {
      clearTypingParticipant(event.chatId, event.participant.id);
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
      onChatRemoval: handleRealtimeChatRemoval,
      onConnectionChange,
      onConnect: handleRealtimeConnect,
      onMessage: handleRealtimeMessage,
      onMessageDeletion: handleRealtimeMessageDeletion,
      onMessageReaction: handleRealtimeMessageReaction,
      onMessageStatus: handleRealtimeMessageStatus,
      onSessionEvent: handleRealtimeSession,
      onTyping: handleRealtimeTyping,
    });
  }, [currentUser.id, onConnectionChange, sessionToken]);

  useEffect(() => {
    replaceSubscribedChatIds(chatIdsKey ? chatIdsKey.split(",") : []);
  }, [chatIdsKey]);

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
