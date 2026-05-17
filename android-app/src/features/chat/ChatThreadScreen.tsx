import type {
  AuthResponse,
  ChatMessage,
  MessageSnippet,
  MessageReaction,
  MessageReactionEvent,
  TypingEvent,
  Participant,
  ChatSummary,
  PendingOutgoingMessage,
} from '@north/shared';
import type {Dispatch, SetStateAction} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  acknowledgeRead,
  describeError,
  getChatOpen,
  getMessagesPage,
  toggleMessageReaction,
} from '../../lib/api';
import {hydrateApiChatMessage} from '../../lib/messagePayload';
import {toRecoveredPendingChatMessage} from '../../lib/pendingOutgoingMessages';
import {sendPlainMessage, updatePlainMessage} from '../../lib/plainMessages';
import {publishTypingEvent} from '../../lib/realtime';
import {
  applyTypingEvent,
  formatTypingParticipants,
  removeTypingParticipant,
} from './typingState';

const MESSAGE_PAGE_SIZE = 30;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 4_000;
const TYPING_REMOTE_TTL_MS = 10_000;

const REACTION_OPTIONS: Array<{
  key: MessageReaction['key'];
  emoji: string;
}> = [
  {key: 'LIKE', emoji: '\u{1F44D}'},
  {key: 'DISLIKE', emoji: '\u{1F44E}'},
  {key: 'EYES', emoji: '\u{1F440}'},
  {key: 'OK', emoji: '\u{1F44C}'},
];

export type RunAuthorized = <T>(
  operation: (token: string) => Promise<T>,
) => Promise<T>;

type RealtimeMessageEnvelope = {
  message: ChatMessage;
  receivedAt: number;
};

type RealtimeReactionEnvelope = {
  event: MessageReactionEvent;
  receivedAt: number;
};

type RealtimeTypingEnvelope = {
  event: TypingEvent;
  receivedAt: number;
};

type Props = {
  session: AuthResponse;
  chatId: string;
  initialChat: ChatSummary | null;
  pendingOutgoingMessages: PendingOutgoingMessage[];
  realtimeConnected: boolean;
  realtimeMessage: RealtimeMessageEnvelope | null;
  realtimeReaction: RealtimeReactionEnvelope | null;
  realtimeTyping: RealtimeTypingEnvelope | null;
  runAuthorized: RunAuthorized;
  onBack: () => void;
  onChatSummaryChange: (chat: ChatSummary) => void;
  onChatRead: (chatId: string) => void;
  onPersistPendingOutgoingMessage: (
    message: PendingOutgoingMessage,
  ) => Promise<PendingOutgoingMessage>;
  onDeletePendingOutgoingMessages: (clientMessageIds: string[]) => Promise<void>;
};

export function ChatThreadScreen({
  session,
  chatId,
  initialChat,
  pendingOutgoingMessages,
  realtimeConnected,
  realtimeMessage,
  realtimeReaction,
  realtimeTyping,
  runAuthorized,
  onBack,
  onChatSummaryChange,
  onChatRead,
  onPersistPendingOutgoingMessage,
  onDeletePendingOutgoingMessages,
}: Props) {
  const [chat, setChat] = useState<ChatSummary | null>(initialChat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composerDraftBeforeEdit, setComposerDraftBeforeEdit] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>({});
  const [pendingReactionKeys, setPendingReactionKeys] = useState<
    Record<string, boolean>
  >({});
  const [typingParticipants, setTypingParticipants] = useState<Participant[]>([]);
  const acknowledgedReadIdsRef = useRef(new Set<string>());
  const nextLocalOrderRef = useRef(0);
  const reactionOverridesRef = useRef<
    Map<string, MessageReactionEvent['reactions']>
  >(new Map());
  const typingParticipantTimeoutsRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const typingSignalRef = useRef<{
    active: boolean;
    lastSentAt: number;
    idleTimeoutId: ReturnType<typeof setTimeout> | null;
  }>({
    active: false,
    lastSentAt: 0,
    idleTimeoutId: null,
  });
  const recoveredPendingMessages = useMemo(
    () =>
      pendingOutgoingMessages.map(message =>
        toRecoveredPendingChatMessage(session.user, message),
      ),
    [pendingOutgoingMessages, session.user],
  );
  const recoveredPendingMessagesRef = useRef(recoveredPendingMessages);
  const pendingOutgoingMessagesKey = pendingOutgoingMessages
    .map(message => `${message.clientMessageId}:${message.status}:${message.updatedAt}`)
    .join('|');
  const replyingToMessage = useMemo(
    () =>
      replyingToMessageId
        ? messages.find(
            message =>
              message.id === replyingToMessageId && canReplyToMessage(message),
          ) ?? null
        : null,
    [messages, replyingToMessageId],
  );
  const editingMessage = useMemo(
    () =>
      editingMessageId
        ? messages.find(
            message =>
              message.id === editingMessageId &&
              canEditMessage(message, session.user.id),
          ) ?? null
        : null,
    [editingMessageId, messages, session.user.id],
  );
  const typingLabel = useMemo(
    () => formatTypingParticipants(typingParticipants),
    [typingParticipants],
  );

  useEffect(() => {
    recoveredPendingMessagesRef.current = recoveredPendingMessages;
  }, [recoveredPendingMessages]);

  const clearTypingIdleTimeout = useCallback(() => {
    if (typingSignalRef.current.idleTimeoutId === null) {
      return;
    }

    clearTimeout(typingSignalRef.current.idleTimeoutId);
    typingSignalRef.current.idleTimeoutId = null;
  }, []);

  const clearTypingParticipantTimeout = useCallback((participantId: string) => {
    const timeoutId = typingParticipantTimeoutsRef.current.get(participantId);
    if (timeoutId === undefined) {
      return;
    }

    clearTimeout(timeoutId);
    typingParticipantTimeoutsRef.current.delete(participantId);
  }, []);

  const clearAllTypingParticipantTimeouts = useCallback(() => {
    typingParticipantTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    typingParticipantTimeoutsRef.current.clear();
  }, []);

  const scheduleTypingParticipantExpiry = useCallback((participantId: string) => {
    clearTypingParticipantTimeout(participantId);
    const timeoutId = setTimeout(() => {
      typingParticipantTimeoutsRef.current.delete(participantId);
      setTypingParticipants(currentParticipants =>
        removeTypingParticipant(currentParticipants, participantId),
      );
    }, TYPING_REMOTE_TTL_MS);
    typingParticipantTimeoutsRef.current.set(participantId, timeoutId);
  }, [clearTypingParticipantTimeout]);

  const stopTypingSignal = useCallback(() => {
    clearTypingIdleTimeout();

    if (!typingSignalRef.current.active) {
      return;
    }

    publishTypingEvent(chatId, false);
    typingSignalRef.current.active = false;
    typingSignalRef.current.lastSentAt = 0;
  }, [chatId, clearTypingIdleTimeout]);

  const signalTypingActivity = useCallback((nextText: string) => {
    if (!nextText.trim()) {
      stopTypingSignal();
      return;
    }

    const now = Date.now();
    if (
      !typingSignalRef.current.active ||
      now - typingSignalRef.current.lastSentAt >= TYPING_HEARTBEAT_MS
    ) {
      const sent = publishTypingEvent(chatId, true);
      typingSignalRef.current.active = sent;
      typingSignalRef.current.lastSentAt = sent ? now : 0;
    }

    clearTypingIdleTimeout();
    typingSignalRef.current.idleTimeoutId = setTimeout(() => {
      stopTypingSignal();
    }, TYPING_IDLE_MS);
  }, [chatId, clearTypingIdleTimeout, stopTypingSignal]);

  useEffect(() => {
    if (!initialChat || initialChat.id !== chatId) {
      return;
    }

    setChat(currentChat =>
      currentChat ? {...currentChat, ...initialChat} : initialChat,
    );
  }, [chatId, initialChat]);

  useEffect(() => {
    if (replyingToMessageId && !replyingToMessage) {
      setReplyingToMessageId(null);
    }
  }, [replyingToMessage, replyingToMessageId]);

  useEffect(() => {
    if (editingMessageId && !editingMessage) {
      setEditingMessageId(null);
      setComposerDraftBeforeEdit(null);
    }
  }, [editingMessage, editingMessageId]);

  useEffect(() => {
    setMessages(currentMessages =>
      syncRecoveredPendingMessages(currentMessages, recoveredPendingMessages),
    );
    setMessageErrors(currentErrors =>
      keepOnlyRelevantMessageErrors(currentErrors, pendingOutgoingMessages),
    );

    const maxRecoveredLocalOrder = pendingOutgoingMessages.reduce(
      (maxLocalOrder, message) =>
        Math.max(maxLocalOrder, message.localOrder ?? 0),
      0,
    );
    nextLocalOrderRef.current = Math.max(
      nextLocalOrderRef.current,
      maxRecoveredLocalOrder,
    );
  }, [
    pendingOutgoingMessages,
    pendingOutgoingMessagesKey,
    recoveredPendingMessages,
    session.user,
  ]);

  useEffect(() => {
    let cancelled = false;
    acknowledgedReadIdsRef.current = new Set();
    reactionOverridesRef.current = new Map();
    clearAllTypingParticipantTimeouts();
    clearTypingIdleTimeout();
    typingSignalRef.current.active = false;
    typingSignalRef.current.lastSentAt = 0;
    setChat(initialChat);
    setMessages([]);
    setMessageErrors({});
    setPendingReactionKeys({});
    setTypingParticipants([]);
    setComposerText('');
    setReplyingToMessageId(null);
    setEditingMessageId(null);
    setComposerDraftBeforeEdit(null);
    setNextCursor(null);
    setError(null);
    setLoading(true);

    const load = async () => {
      try {
        const chatOpen = await runAuthorized(token =>
          getChatOpen(token, chatId, {
            limit: MESSAGE_PAGE_SIZE,
            acknowledgeDelivered: false,
          }),
        );
        const hydratedMessages = chatOpen.initialMessages.map(hydrateApiChatMessage);
        if (cancelled) {
          return;
        }

        setChat(chatOpen.chat);
        setMessages(currentMessages =>
          applyReactionOverrides(
            mergeLoadedMessages(
              hydratedMessages,
              currentMessages,
              recoveredPendingMessagesRef.current,
            ),
            reactionOverridesRef.current,
          ),
        );
        setNextCursor(chatOpen.initialMessagesNextCursor);
        onChatSummaryChange(chatOpen.chat);
        onDeletePendingOutgoingMessages(
          chatOpen.confirmedPendingOutgoingClientMessageIds,
        ).catch(() => undefined);
        acknowledgeMessagesAsRead({
          chatId,
          currentUserId: session.user.id,
          messages: hydratedMessages,
          acknowledgedIds: acknowledgedReadIdsRef.current,
          runAuthorized,
          onChatRead,
        }).catch(() => undefined);
      } catch (nextError) {
        if (!cancelled) {
          setError(describeError(nextError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load().catch(() => undefined);

    return () => {
      cancelled = true;
      stopTypingSignal();
    };
  }, [
    chatId,
    clearAllTypingParticipantTimeouts,
    clearTypingIdleTimeout,
    initialChat,
    onChatRead,
    onChatSummaryChange,
    onDeletePendingOutgoingMessages,
    runAuthorized,
    session.user.id,
    stopTypingSignal,
  ]);

  useEffect(() => {
    return () => {
      stopTypingSignal();
      clearAllTypingParticipantTimeouts();
      clearTypingIdleTimeout();
    };
  }, [
    chatId,
    clearAllTypingParticipantTimeouts,
    clearTypingIdleTimeout,
    stopTypingSignal,
  ]);

  useEffect(() => {
    if (!realtimeMessage || realtimeMessage.message.chatId !== chatId) {
      return;
    }

    setMessages(currentMessages =>
      applyReactionOverrides(
        mergeConfirmedMessage(currentMessages, realtimeMessage.message),
        reactionOverridesRef.current,
      ),
    );
    clearTypingParticipantTimeout(realtimeMessage.message.sender.id);
    setTypingParticipants(currentParticipants =>
      removeTypingParticipant(
        currentParticipants,
        realtimeMessage.message.sender.id,
      ),
    );
    clearMessageError(setMessageErrors, realtimeMessage.message.clientMessageId ?? null);

    if (realtimeMessage.message.sender.id === session.user.id) {
      return;
    }

    acknowledgeMessagesAsRead({
      chatId,
      currentUserId: session.user.id,
      messages: [realtimeMessage.message],
      acknowledgedIds: acknowledgedReadIdsRef.current,
      runAuthorized,
      onChatRead,
    }).catch(() => undefined);
  }, [
    chatId,
    clearTypingParticipantTimeout,
    onChatRead,
    realtimeMessage,
    runAuthorized,
    session.user.id,
  ]);

  useEffect(() => {
    if (!realtimeReaction || realtimeReaction.event.chatId !== chatId) {
      return;
    }

    reactionOverridesRef.current.set(
      realtimeReaction.event.messageId,
      realtimeReaction.event.reactions,
    );
    setMessages(currentMessages =>
      applyReactionOverrides(
        applyReactionEvent(currentMessages, realtimeReaction.event),
        reactionOverridesRef.current,
      ),
    );
  }, [chatId, realtimeReaction]);

  useEffect(() => {
    if (!realtimeTyping || realtimeTyping.event.chatId !== chatId) {
      return;
    }

    if (realtimeTyping.event.participant.id === session.user.id) {
      return;
    }

    if (realtimeTyping.event.typing) {
      scheduleTypingParticipantExpiry(realtimeTyping.event.participant.id);
    } else {
      clearTypingParticipantTimeout(realtimeTyping.event.participant.id);
    }

    setTypingParticipants(currentParticipants =>
      applyTypingEvent(
        currentParticipants,
        realtimeTyping.event,
        session.user.id,
      ),
    );
  }, [
    chatId,
    clearTypingParticipantTimeout,
    realtimeTyping,
    scheduleTypingParticipantExpiry,
    session.user.id,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const chatOpen = await runAuthorized(token =>
        getChatOpen(token, chatId, {
          limit: MESSAGE_PAGE_SIZE,
          acknowledgeDelivered: false,
        }),
      );
      const hydratedMessages = chatOpen.initialMessages.map(hydrateApiChatMessage);
      setChat(chatOpen.chat);
      setMessages(currentMessages =>
        applyReactionOverrides(
          mergeLoadedMessages(
            hydratedMessages,
            currentMessages,
            recoveredPendingMessages,
          ),
          reactionOverridesRef.current,
        ),
      );
      setNextCursor(chatOpen.initialMessagesNextCursor);
      onChatSummaryChange(chatOpen.chat);
      onDeletePendingOutgoingMessages(
        chatOpen.confirmedPendingOutgoingClientMessageIds,
      ).catch(() => undefined);
      acknowledgeMessagesAsRead({
        chatId,
        currentUserId: session.user.id,
        messages: hydratedMessages,
        acknowledgedIds: acknowledgedReadIdsRef.current,
        runAuthorized,
        onChatRead,
      }).catch(() => undefined);
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadOlder = async () => {
    if (!nextCursor || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    setError(null);

    try {
      const page = await runAuthorized(token =>
        getMessagesPage(token, chatId, {
          cursor: nextCursor,
          limit: MESSAGE_PAGE_SIZE,
          acknowledgeDelivered: false,
        }),
      );
      const olderMessages = page.messages.map(hydrateApiChatMessage);
      setMessages(currentMessages =>
        applyReactionOverrides(
          mergeOlderMessages(currentMessages, olderMessages),
          reactionOverridesRef.current,
        ),
      );
      setNextCursor(page.nextCursor);
      onDeletePendingOutgoingMessages(
        page.confirmedPendingOutgoingClientMessageIds,
      ).catch(() => undefined);
      acknowledgeMessagesAsRead({
        chatId,
        currentUserId: session.user.id,
        messages: olderMessages,
        acknowledgedIds: acknowledgedReadIdsRef.current,
        runAuthorized,
        onChatRead,
      }).catch(() => undefined);
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleReplyMessage = (message: ChatMessage) => {
    if (!canReplyToMessage(message)) {
      return;
    }

    if (editingMessageId) {
      setComposerText(composerDraftBeforeEdit ?? '');
      setComposerDraftBeforeEdit(null);
      setEditingMessageId(null);
    }
    setReplyingToMessageId(message.id);
    setError(null);
  };

  const handleEditMessage = (message: ChatMessage) => {
    if (!canEditMessage(message, session.user.id)) {
      return;
    }

    setReplyingToMessageId(null);
    setComposerDraftBeforeEdit(currentDraft =>
      editingMessageId ? currentDraft : composerText,
    );
    setEditingMessageId(message.id);
    setComposerText(message.content);
    setError(null);
  };

  const handleCancelReply = () => {
    setReplyingToMessageId(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setComposerText(composerDraftBeforeEdit ?? '');
    setComposerDraftBeforeEdit(null);
  };

  const handleSend = async () => {
    const trimmedContent = composerText.trim();
    const editingAttachments = editingMessage?.attachments ?? [];
    if (!trimmedContent && !(editingMessage && editingAttachments.length > 0)) {
      return;
    }

    stopTypingSignal();

    if (editingMessage) {
      setError(null);
      setSendingCount(currentCount => currentCount + 1);

      try {
        const updatedMessage = await runAuthorized(token =>
          updatePlainMessage(
            token,
            session.user.id,
            chatId,
            editingMessage.id,
            trimmedContent,
            {
              attachments: editingAttachments,
            },
          ),
        );
        setMessages(currentMessages =>
          applyReactionOverrides(
            mergeConfirmedMessage(currentMessages, updatedMessage),
            reactionOverridesRef.current,
          ),
        );
        setComposerText('');
        setEditingMessageId(null);
        setComposerDraftBeforeEdit(null);
      } catch (sendError) {
        setError(describeError(sendError));
      } finally {
        setSendingCount(currentCount => Math.max(0, currentCount - 1));
      }
      return;
    }

    const clientMessageId = createClientMessageId();
    const optimisticMessage = createOptimisticOutgoingMessage({
      currentUser: session.user,
      chatId,
      content: trimmedContent,
      clientMessageId,
      recipientCount: Math.max(0, (chat?.members.length ?? 1) - 1),
      localOrder: ++nextLocalOrderRef.current,
      replyTo: replyingToMessage ? toMessageSnippet(replyingToMessage) : null,
    });

    setComposerText('');
    setError(null);
    clearMessageError(setMessageErrors, clientMessageId);
    setMessages(currentMessages =>
      sortMessagesForDisplay([...currentMessages, optimisticMessage]),
    );
    setSendingCount(currentCount => currentCount + 1);
    onPersistPendingOutgoingMessage(
      toPendingOutgoingMessage(optimisticMessage),
    ).catch(() => undefined);

    try {
      const confirmedMessage = await sendPlainMessage({
        chatId,
        clientMessageId,
        content: trimmedContent,
        replyToMessageId: replyingToMessage?.id ?? null,
      });
      onDeletePendingOutgoingMessages([clientMessageId]).catch(() => undefined);
      setMessages(currentMessages =>
        applyReactionOverrides(
          mergeConfirmedMessage(currentMessages, confirmedMessage),
          reactionOverridesRef.current,
        ),
      );
      setReplyingToMessageId(null);
    } catch (sendError) {
      const nextError = describeError(sendError);
      setError(nextError);
      setMessageErrors(currentErrors => ({
        ...currentErrors,
        [clientMessageId]: nextError,
      }));
      setMessages(currentMessages => {
        const nextMessages = markMessageSendFailed(
          currentMessages,
          clientMessageId,
        );
        const failedMessage = nextMessages.find(
          currentMessage => currentMessage.clientMessageId === clientMessageId,
        );
        if (failedMessage) {
          onPersistPendingOutgoingMessage(
            toPendingOutgoingMessage(failedMessage),
          ).catch(() => undefined);
        }
        return nextMessages;
      });
    } finally {
      setSendingCount(currentCount => Math.max(0, currentCount - 1));
    }
  };

  const handleRetryMessage = async (message: ChatMessage) => {
    const clientMessageId = message.clientMessageId?.trim();
    if (!clientMessageId || message.sender.id !== session.user.id) {
      return;
    }

    clearMessageError(setMessageErrors, clientMessageId);
    setError(null);
    setMessages(currentMessages => {
      const nextMessages = markMessageSending(currentMessages, clientMessageId);
      const sendingMessage = nextMessages.find(
        currentMessage => currentMessage.clientMessageId === clientMessageId,
      );
      if (sendingMessage) {
        onPersistPendingOutgoingMessage(
          toPendingOutgoingMessage(sendingMessage),
        ).catch(() => undefined);
      }
      return nextMessages;
    });
    setSendingCount(currentCount => currentCount + 1);

    try {
      const confirmedMessage = await sendPlainMessage({
        chatId,
        clientMessageId,
        content: message.content,
        replyToMessageId: message.replyTo?.id ?? null,
        attachments: message.attachments ?? [],
      });
      onDeletePendingOutgoingMessages([clientMessageId]).catch(() => undefined);
      setMessages(currentMessages =>
        applyReactionOverrides(
          mergeConfirmedMessage(currentMessages, confirmedMessage),
          reactionOverridesRef.current,
        ),
      );
    } catch (sendError) {
      const nextError = describeError(sendError);
      setError(nextError);
      setMessageErrors(currentErrors => ({
        ...currentErrors,
        [clientMessageId]: nextError,
      }));
      setMessages(currentMessages => {
        const nextMessages = markMessageSendFailed(
          currentMessages,
          clientMessageId,
        );
        const failedMessage = nextMessages.find(
          currentMessage => currentMessage.clientMessageId === clientMessageId,
        );
        if (failedMessage) {
          onPersistPendingOutgoingMessage(
            toPendingOutgoingMessage(failedMessage),
          ).catch(() => undefined);
        }
        return nextMessages;
      });
    } finally {
      setSendingCount(currentCount => Math.max(0, currentCount - 1));
    }
  };

  const handleToggleReaction = async (
    message: ChatMessage,
    key: MessageReaction['key'],
  ) => {
    if (!canReactToMessage(message)) {
      return;
    }

    const pendingReactionKey = buildPendingReactionKey(message.id, key);
    if (pendingReactionKeys[pendingReactionKey]) {
      return;
    }

    setPendingReactionKeys(currentKeys => ({
      ...currentKeys,
      [pendingReactionKey]: true,
    }));
    setError(null);

    try {
      const event = await runAuthorized(token =>
        toggleMessageReaction(token, chatId, message.id, key),
      );
      reactionOverridesRef.current.set(event.messageId, event.reactions);
      setMessages(currentMessages =>
        applyReactionOverrides(
          applyReactionEvent(currentMessages, event),
          reactionOverridesRef.current,
        ),
      );
    } catch (reactionError) {
      setError(describeError(reactionError));
    } finally {
      setPendingReactionKeys(currentKeys => {
        if (!currentKeys[pendingReactionKey]) {
          return currentKeys;
        }

        const nextKeys = {...currentKeys};
        delete nextKeys[pendingReactionKey];
        return nextKeys;
      });
    }
  };

  const canSubmitComposer = Boolean(
    editingMessage
      ? composerText.trim() || (editingMessage.attachments?.length ?? 0) > 0
      : composerText.trim(),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonLabel}>Back</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Chat thread</Text>
          <Text style={styles.headerTitle}>{chat?.title ?? 'Loading chat'}</Text>
          <Text style={styles.headerSubtitle}>
            {chat ? (chat.direct ? 'Direct chat' : 'Group chat') : 'Opening chat'}
          </Text>
          <Text
            style={
              realtimeConnected ? styles.connectionLive : styles.connectionOffline
            }>
            {realtimeConnected ? 'Realtime live' : 'Realtime reconnecting'}
          </Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing || loading}
          style={
            refreshing || loading ? styles.headerButtonDisabled : styles.headerButton
          }>
          <Text style={styles.headerButtonLabel}>
            {refreshing ? 'Refreshing' : 'Reload'}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView
        style={styles.messageScroll}
        contentContainerStyle={styles.messageContent}>
        {nextCursor ? (
          <Pressable
            onPress={handleLoadOlder}
            disabled={loadingOlder}
            style={loadingOlder ? styles.loadOlderDisabled : styles.loadOlderButton}>
            <Text style={styles.loadOlderLabel}>
              {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
            </Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyLabel}>Loading messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyLabel}>No messages in this chat yet.</Text>
          </View>
        ) : (
          messages.map(message => {
            const ownMessage = message.sender.id === session.user.id;
            const canReact = canReactToMessage(message);
            const clientMessageId = message.clientMessageId ?? '';
            const sendFailure =
              clientMessageId.trim().length > 0
                ? messageErrors[clientMessageId] ??
                  (ownMessage && message.status?.state === 'FAILED'
                    ? 'Message was not delivered. Retry.'
                    : null)
                : null;

            return (
              <View
                key={message.id}
                style={ownMessage ? styles.ownBubble : styles.peerBubble}>
                <Text style={styles.messageSender}>
                  {ownMessage ? 'You' : message.sender.displayName}
                </Text>
                {message.replyTo ? (
                  <View style={styles.replyCard}>
                    <Text style={styles.replyLabel}>
                      Reply to {message.replyTo.sender.displayName}
                    </Text>
                    <Text style={styles.replySnippet}>{message.replyTo.preview}</Text>
                  </View>
                ) : null}
                <Text style={styles.messageBody}>
                  {message.content || 'Attachment-only message'}
                </Text>
                {message.attachments && message.attachments.length > 0 ? (
                  <Text style={styles.attachmentLabel}>
                    {describeAttachmentLine(message.attachments.length)}
                  </Text>
                ) : null}
                <Text style={styles.messageMeta}>
                  {formatTimestamp(message.editedAt ?? message.createdAt)}
                  {message.editedAt ? ' | edited' : ''}
                  {message.status ? ` | ${formatStatus(message.status.state)}` : ''}
                </Text>
                {canReact ? (
                  <View style={styles.reactionRow}>
                    {REACTION_OPTIONS.map(option => {
                      const reaction = getMessageReaction(message, option.key);
                      const pendingReactionKey = buildPendingReactionKey(
                        message.id,
                        option.key,
                      );
                      const pendingReaction = Boolean(
                        pendingReactionKeys[pendingReactionKey],
                      );
                      const active = reaction?.reactedByCurrentUser ?? false;
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => handleToggleReaction(message, option.key)}
                          disabled={pendingReaction}
                          style={
                            pendingReaction
                              ? styles.reactionButtonDisabled
                              : active
                                ? styles.reactionButtonActive
                                : styles.reactionButton
                          }
                          testID={`reaction-toggle-${message.id}-${option.key}`}>
                          <Text
                            style={
                              active
                                ? styles.reactionButtonLabelActive
                                : styles.reactionButtonLabel
                            }>
                            {formatReactionButtonLabel(option.emoji, reaction?.count ?? 0)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {(canReplyToMessage(message) ||
                  canEditMessage(message, session.user.id)) && (
                  <View style={styles.messageActions}>
                    {canReplyToMessage(message) ? (
                      <Pressable
                        onPress={() => handleReplyMessage(message)}
                        style={styles.messageActionButton}
                        testID={`reply-action-${message.id}`}>
                        <Text style={styles.messageActionLabel}>Reply</Text>
                      </Pressable>
                    ) : null}
                    {canEditMessage(message, session.user.id) ? (
                      <Pressable
                        onPress={() => handleEditMessage(message)}
                        style={styles.messageActionButton}
                        testID={`edit-action-${message.id}`}>
                        <Text style={styles.messageActionLabel}>Edit</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
                {sendFailure ? (
                  <View style={styles.failureCard}>
                    <Text style={styles.failureText}>{sendFailure}</Text>
                    <Pressable
                      onPress={() => handleRetryMessage(message)}
                      style={styles.retryButton}>
                      <Text style={styles.retryButtonLabel}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.composer}>
        {typingParticipants.length > 0 ? (
          <View style={styles.typingIndicator} testID="typing-indicator">
            <Text style={styles.typingIndicatorLabel}>{typingLabel}</Text>
          </View>
        ) : null}
        {replyingToMessage ? (
          <View style={styles.composerContext} testID="reply-context">
            <View style={styles.composerContextCopy}>
              <Text style={styles.composerContextLabel}>Reply</Text>
              <Text style={styles.composerContextTitle}>
                {replyingToMessage.sender.displayName}
              </Text>
              <Text style={styles.composerContextPreview}>
                {buildMessageContentPreview(replyingToMessage)}
              </Text>
            </View>
            <Pressable
              onPress={handleCancelReply}
              style={styles.composerContextClose}
              testID="cancel-reply-button">
              <Text style={styles.composerContextCloseLabel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        {editingMessage ? (
          <View style={styles.composerContext} testID="edit-context">
            <View style={styles.composerContextCopy}>
              <Text style={styles.composerContextLabel}>Editing</Text>
              <Text style={styles.composerContextTitle}>
                {editingMessage.sender.displayName}
              </Text>
              <Text style={styles.composerContextPreview}>
                {buildMessageContentPreview(editingMessage)}
              </Text>
            </View>
            <Pressable
              onPress={handleCancelEdit}
              style={styles.composerContextClose}
              testID="cancel-edit-button">
              <Text style={styles.composerContextCloseLabel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <TextInput
          value={composerText}
          onChangeText={nextValue => {
            setComposerText(nextValue);
            signalTypingActivity(nextValue);
          }}
          placeholder={
            editingMessage
              ? 'Edit your message'
              : replyingToMessage
                ? 'Write a reply'
                : realtimeConnected
                  ? 'Write a message'
                  : 'Write now, retry if realtime is still reconnecting'
          }
          placeholderTextColor="#8d7b67"
          multiline
          style={styles.composerInput}
          testID="composer-input"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSubmitComposer || loading}
          style={
            !canSubmitComposer || loading
              ? styles.sendButtonDisabled
              : styles.sendButton
          }
          testID="send-button">
          <Text style={styles.sendButtonLabel}>
            {editingMessage
              ? sendingCount > 0
                ? 'Saving...'
                : 'Save'
              : sendingCount > 0
                ? 'Sending...'
                : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

async function acknowledgeMessagesAsRead(options: {
  chatId: string;
  currentUserId: string;
  messages: ChatMessage[];
  acknowledgedIds: Set<string>;
  runAuthorized: RunAuthorized;
  onChatRead: (chatId: string) => void;
}) {
  const messageIds = options.messages
    .filter(
      message =>
        message.sender.id !== options.currentUserId &&
        !options.acknowledgedIds.has(message.id),
    )
    .map(message => message.id);

  if (!messageIds.length) {
    return;
  }

  await options.runAuthorized(token =>
    acknowledgeRead(token, options.chatId, messageIds),
  );
  messageIds.forEach(messageId => options.acknowledgedIds.add(messageId));
  options.onChatRead(options.chatId);
}

function createOptimisticOutgoingMessage(options: {
  currentUser: AuthResponse['user'];
  chatId: string;
  content: string;
  clientMessageId: string;
  recipientCount: number;
  localOrder: number;
  replyTo?: MessageSnippet | null;
}) {
  const createdAt = new Date().toISOString();
  return {
    id: `local:${options.clientMessageId}`,
    chatId: options.chatId,
    serverOrder: null,
    sender: {
      id: options.currentUser.id,
      username: options.currentUser.username,
      displayName: options.currentUser.displayName,
      profession: options.currentUser.profession,
      avatarUrl: options.currentUser.avatarUrl,
      online: options.currentUser.online,
    },
    content: options.content,
    createdAt,
    editedAt: null,
    status: {
      state: 'SENDING',
      recipientCount: options.recipientCount,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId: options.clientMessageId,
    localOrder: options.localOrder,
    replyTo: options.replyTo ?? null,
    reactions: [],
    attachments: [],
  } satisfies ChatMessage;
}

function mergeLoadedMessages(
  loadedMessages: ChatMessage[],
  currentMessages: ChatMessage[],
  recoveredPendingMessages: ChatMessage[],
) {
  return syncRecoveredPendingMessages(
    sortMessagesForDisplay([...loadedMessages, ...currentMessages]),
    recoveredPendingMessages,
  );
}

function mergeOlderMessages(
  currentMessages: ChatMessage[],
  olderMessages: ChatMessage[],
) {
  const existingIds = new Set(currentMessages.map(message => message.id));
  const existingClientMessageIds = new Set(
    currentMessages
      .map(message => message.clientMessageId)
      .filter((messageId): messageId is string => Boolean(messageId)),
  );

  return sortMessagesForDisplay([
    ...olderMessages.filter(
      message =>
        !existingIds.has(message.id) &&
        !(message.clientMessageId && existingClientMessageIds.has(message.clientMessageId)),
    ),
    ...currentMessages,
  ]);
}

function mergeConfirmedMessage(
  currentMessages: ChatMessage[],
  confirmedMessage: ChatMessage,
) {
  const filteredMessages = currentMessages.filter(message => {
    if (message.id === confirmedMessage.id) {
      return false;
    }

    if (
      confirmedMessage.clientMessageId &&
      message.clientMessageId === confirmedMessage.clientMessageId &&
      message.serverOrder == null
    ) {
      return false;
    }

    return true;
  });

  return sortMessagesForDisplay([...filteredMessages, confirmedMessage]);
}

function applyReactionEvent(
  currentMessages: ChatMessage[],
  event: MessageReactionEvent,
) {
  return currentMessages.map(message =>
    message.id === event.messageId
      ? {
          ...message,
          reactions: event.reactions,
        }
      : message,
  );
}

function applyReactionOverrides(
  currentMessages: ChatMessage[],
  overrides: Map<string, MessageReactionEvent['reactions']>,
) {
  if (overrides.size === 0) {
    return currentMessages;
  }

  return currentMessages.map(message => {
    const reactions = overrides.get(message.id);
    if (!reactions) {
      return message;
    }

    return {
      ...message,
      reactions,
    };
  });
}

function syncRecoveredPendingMessages(
  currentMessages: ChatMessage[],
  recoveredPendingMessages: ChatMessage[],
) {
  const recoveredByClientMessageId = new Map(
    recoveredPendingMessages
      .map(message => [message.clientMessageId, message] as const)
      .filter(
        (
          entry,
        ): entry is readonly [string, ChatMessage] => typeof entry[0] === 'string',
      ),
  );
  const confirmedClientMessageIds = new Set(
    currentMessages
      .filter(message => message.serverOrder != null)
      .map(message => message.clientMessageId)
      .filter((clientMessageId): clientMessageId is string => Boolean(clientMessageId)),
  );

  const synchronizedMessages = currentMessages
    .map(message => {
      if (!isLocalPendingMessage(message)) {
        return message;
      }

      const clientMessageId = message.clientMessageId?.trim() ?? '';
      if (!clientMessageId || confirmedClientMessageIds.has(clientMessageId)) {
        return null;
      }

      return recoveredByClientMessageId.get(clientMessageId) ?? null;
    })
    .filter((message): message is ChatMessage => message !== null);

  const existingClientMessageIds = new Set(
    synchronizedMessages
      .map(message => message.clientMessageId)
      .filter((clientMessageId): clientMessageId is string => Boolean(clientMessageId)),
  );

  recoveredPendingMessages.forEach(message => {
    const clientMessageId = message.clientMessageId?.trim() ?? '';
    if (
      !clientMessageId ||
      confirmedClientMessageIds.has(clientMessageId) ||
      existingClientMessageIds.has(clientMessageId)
    ) {
      return;
    }

    synchronizedMessages.push(message);
  });

  return sortMessagesForDisplay(synchronizedMessages);
}

function markMessageSendFailed(
  currentMessages: ChatMessage[],
  clientMessageId: string,
) {
  return currentMessages.map(message => {
    if (message.clientMessageId !== clientMessageId) {
      return message;
    }

    return {
      ...message,
      status: {
        state: 'FAILED' as const,
        recipientCount: message.status?.recipientCount ?? 0,
        deliveredCount: message.status?.deliveredCount ?? 0,
        readCount: message.status?.readCount ?? 0,
      },
    };
  });
}

function markMessageSending(
  currentMessages: ChatMessage[],
  clientMessageId: string,
) {
  return currentMessages.map(message => {
    if (message.clientMessageId !== clientMessageId) {
      return message;
    }

    return {
      ...message,
      status: {
        state: 'SENDING' as const,
        recipientCount: message.status?.recipientCount ?? 0,
        deliveredCount: message.status?.deliveredCount ?? 0,
        readCount: message.status?.readCount ?? 0,
      },
    };
  });
}

function clearMessageError(
  setMessageErrors: Dispatch<SetStateAction<Record<string, string>>>,
  clientMessageId: string | null,
) {
  if (!clientMessageId) {
    return;
  }

  setMessageErrors(currentErrors => {
    if (!(clientMessageId in currentErrors)) {
      return currentErrors;
    }

    const nextErrors = {...currentErrors};
    delete nextErrors[clientMessageId];
    return nextErrors;
  });
}

function isLocalPendingMessage(message: ChatMessage) {
  return message.serverOrder == null && Boolean(message.clientMessageId);
}

function toPendingOutgoingMessage(message: ChatMessage): PendingOutgoingMessage {
  return {
    chatId: message.chatId,
    clientMessageId: message.clientMessageId ?? message.id,
    content: message.content,
    createdAt: message.createdAt,
    localOrder: message.localOrder ?? null,
    recipientCount: message.status?.recipientCount ?? 0,
    replyTo: message.replyTo ?? null,
    status: message.status?.state === 'FAILED' ? 'FAILED' : 'SENDING',
    updatedAt: new Date().toISOString(),
    attachments: message.attachments ?? [],
  };
}

function keepOnlyRelevantMessageErrors(
  currentErrors: Record<string, string>,
  pendingMessages: PendingOutgoingMessage[],
) {
  const pendingClientMessageIds = new Set(
    pendingMessages.map(message => message.clientMessageId),
  );

  return Object.fromEntries(
    Object.entries(currentErrors).filter(([clientMessageId]) =>
      pendingClientMessageIds.has(clientMessageId),
    ),
  );
}

function canReplyToMessage(message: ChatMessage) {
  return typeof message.serverOrder === 'number';
}

function canEditMessage(message: ChatMessage, currentUserId: string) {
  return canReplyToMessage(message) && message.sender.id === currentUserId;
}

function canReactToMessage(message: ChatMessage) {
  return canReplyToMessage(message);
}

function getMessageReaction(
  message: ChatMessage,
  key: MessageReaction['key'],
) {
  return message.reactions.find(reaction => reaction.key === key) ?? null;
}

function buildPendingReactionKey(
  messageId: string,
  key: MessageReaction['key'],
) {
  return `${messageId}:${key}`;
}

function formatReactionButtonLabel(emoji: string, count: number) {
  return count > 0 ? `${emoji} ${count}` : emoji;
}

function toMessageSnippet(message: ChatMessage): MessageSnippet {
  return {
    id: message.id,
    sender: message.sender,
    createdAt: message.createdAt,
    preview: buildMessageContentPreview(message),
    serverOrder: message.serverOrder ?? null,
  };
}

function buildMessageContentPreview(
  message: Pick<ChatMessage, 'content' | 'attachments'>,
  maxLength = 88,
) {
  const collapsedText = message.content.trim().replace(/\s+/g, ' ');
  if (collapsedText) {
    return buildMessagePreview(collapsedText, maxLength);
  }

  const attachments = message.attachments ?? [];
  if (attachments.length === 1) {
    return buildMessagePreview(`Attachment: ${attachments[0].fileName}`, maxLength);
  }

  if (attachments.length > 1) {
    return buildMessagePreview(`${attachments.length} attachments`, maxLength);
  }

  return '';
}

function buildMessagePreview(content: string, maxLength: number) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength - 3)}...`;
}

function sortMessagesForDisplay(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftServerOrder = left.serverOrder ?? null;
    const rightServerOrder = right.serverOrder ?? null;

    if (leftServerOrder !== null && rightServerOrder !== null) {
      return leftServerOrder - rightServerOrder;
    }

    if (leftServerOrder !== null) {
      return -1;
    }

    if (rightServerOrder !== null) {
      return 1;
    }

    if (left.localOrder != null && right.localOrder != null) {
      return left.localOrder - right.localOrder;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function createClientMessageId() {
  return `android-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatus(value: NonNullable<ChatMessage['status']>['state']) {
  switch (value) {
    case 'FAILED':
      return 'failed';
    case 'SENDING':
      return 'sending';
    case 'DELIVERED':
      return 'delivered';
    case 'READ':
      return 'read';
    default:
      return 'sent';
  }
}

function describeAttachmentLine(count: number) {
  return count === 1
    ? '1 attachment in this message'
    : `${count} attachments in this message`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3efe7',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#fffaf1',
    borderBottomWidth: 1,
    borderBottomColor: '#e0d3bf',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    minWidth: 74,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
  },
  headerButtonDisabled: {
    minWidth: 74,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d3c8ba',
  },
  headerButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8a5a2b',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f1a14',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6f6256',
  },
  connectionLive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c5c53',
  },
  connectionOffline: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8b5a1c',
  },
  error: {
    marginHorizontal: 18,
    marginTop: 14,
    color: '#8b221c',
    backgroundColor: '#f8dfdb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  messageScroll: {
    flex: 1,
  },
  messageContent: {
    padding: 18,
    gap: 12,
  },
  loadOlderButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 12,
    backgroundColor: '#1f5149',
  },
  loadOlderDisabled: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 12,
    backgroundColor: '#8aa19b',
  },
  loadOlderLabel: {
    color: '#fffaf1',
    fontSize: 14,
    fontWeight: '700',
  },
  ownBubble: {
    marginLeft: 42,
    backgroundColor: '#dff1e5',
    borderRadius: 22,
    borderBottomRightRadius: 8,
    padding: 14,
    gap: 6,
  },
  peerBubble: {
    marginRight: 42,
    backgroundColor: '#fffaf1',
    borderRadius: 22,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 14,
    gap: 6,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  replyCard: {
    backgroundColor: '#efe4d3',
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a5a2b',
  },
  replySnippet: {
    fontSize: 13,
    color: '#5b4b3c',
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f1a14',
  },
  attachmentLabel: {
    fontSize: 13,
    color: '#2c5c53',
  },
  messageMeta: {
    fontSize: 12,
    color: '#6f6256',
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reactionButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#efe4d3',
  },
  reactionButtonActive: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2c5c53',
  },
  reactionButtonDisabled: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#d3c8ba',
  },
  reactionButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  reactionButtonLabelActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fffaf1',
  },
  messageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  messageActionButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#efe4d3',
  },
  messageActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  failureCard: {
    marginTop: 4,
    backgroundColor: '#f8dfdb',
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  failureText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8b221c',
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#8b221c',
  },
  retryButtonLabel: {
    color: '#fffaf1',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#efe4d3',
  },
  emptyLabel: {
    fontSize: 14,
    color: '#6a5d50',
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#e0d3bf',
    backgroundColor: '#fffaf1',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  typingIndicator: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#efe4d3',
  },
  typingIndicatorLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a5a2b',
  },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#efe4d3',
  },
  composerContextCopy: {
    flex: 1,
    gap: 2,
  },
  composerContextLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#8a5a2b',
  },
  composerContextTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1a14',
  },
  composerContextPreview: {
    fontSize: 13,
    color: '#5b4b3c',
  },
  composerContextClose: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fffaf1',
  },
  composerContextCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  composerInput: {
    minHeight: 52,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9ccb8',
    backgroundColor: '#fdf7ed',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#1f1a14',
    textAlignVertical: 'top',
  },
  sendButton: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
  },
  sendButtonDisabled: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9aa8a3',
  },
  sendButtonLabel: {
    color: '#fffaf1',
    fontSize: 15,
    fontWeight: '800',
  },
});
