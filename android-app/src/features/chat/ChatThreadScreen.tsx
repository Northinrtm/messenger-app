import type {
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
  MessageSnippet,
  MessageReaction,
  MessageReactionEvent,
  MessageStatusEvent,
  TypingEvent,
  Participant,
  ChatSummary,
  PendingOutgoingMessage,
  UserProfile,
} from '@north/shared';
import type {Dispatch, SetStateAction} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  errorCodes as documentPickerErrorCodes,
  isErrorWithCode as isDocumentPickerErrorWithCode,
  keepLocalCopy,
  pick,
  types as documentPickerTypes,
} from '@react-native-documents/picker';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  acknowledgeRead,
  deleteMessage,
  deleteMessages,
  downloadChatAttachment,
  describeError,
  getChatOpen,
  getMessagesPage,
  pinMessage,
  toggleMessageReaction,
  uploadChatAttachment,
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
import {androidTheme} from '../../theme';
import {API_URL} from '../../config';

const MESSAGE_PAGE_SIZE = 30;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 4_000;
const TYPING_REMOTE_TTL_MS = 10_000;
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

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

type RealtimeStatusEnvelope = {
  event: MessageStatusEvent;
  receivedAt: number;
};

type Props = {
  session: AuthResponse;
  chatId: string;
  initialChat: ChatSummary | null;
  availableChats: ChatSummary[];
  pendingOutgoingMessages: PendingOutgoingMessage[];
  realtimeConnected: boolean;
  realtimeMessage: RealtimeMessageEnvelope | null;
  realtimeReaction: RealtimeReactionEnvelope | null;
  realtimeTyping: RealtimeTypingEnvelope | null;
  realtimeStatus?: RealtimeStatusEnvelope | null;
  runAuthorized: RunAuthorized;
  preferences?: {fontSize: 'small' | 'medium' | 'large'; chatBackground: string};
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
  onChatSummaryChange: (chat: ChatSummary) => void;
  onChatRead: (chatId: string) => void;
  onPersistPendingOutgoingMessage: (
    message: PendingOutgoingMessage,
  ) => Promise<PendingOutgoingMessage>;
  onDeletePendingOutgoingMessages: (clientMessageIds: string[]) => Promise<void>;
  contacts?: UserProfile[];
  blockedUsers?: UserProfile[];
  onAddContact?: (username: string) => Promise<UserProfile>;
  onRemoveContact?: (username: string) => Promise<void>;
  onBlockUser?: (username: string) => Promise<UserProfile>;
  onUnblockUser?: (username: string) => Promise<void>;
};

type ComposerAttachmentDraft = {
  localId: string;
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
};

type ImagePreviewState = {
  attachmentId: string;
  fileName: string;
  url: string;
};

const FONT_SIZE_MAP = {small: 13, medium: 15, large: 18} as const;

export function ChatThreadScreen({
  session,
  chatId,
  initialChat,
  availableChats,
  pendingOutgoingMessages,
  realtimeConnected: _realtimeConnected,
  realtimeMessage,
  realtimeReaction,
  realtimeTyping,
  realtimeStatus,
  runAuthorized,
  preferences,
  onBack,
  onOpenChat,
  onChatSummaryChange,
  onChatRead,
  onPersistPendingOutgoingMessage,
  onDeletePendingOutgoingMessages,
  contacts = [],
  blockedUsers = [],
  onAddContact,
  onRemoveContact,
  onBlockUser,
  onUnblockUser,
}: Props) {
  const msgFontSize = FONT_SIZE_MAP[preferences?.fontSize ?? 'medium'];
  const chatBg = preferences?.chatBackground ?? '#0f1720';
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<ChatSummary | null>(initialChat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<
    ComposerAttachmentDraft[]
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(
    null,
  );
  const [forwardingTargetChatId, setForwardingTargetChatId] = useState<
    string | null
  >(null);
  const [composerDraftBeforeEdit, setComposerDraftBeforeEdit] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>({});
  const [openingAttachmentKeys, setOpeningAttachmentKeys] = useState<
    Record<string, boolean>
  >({});
  const [sharingAttachmentKeys, setSharingAttachmentKeys] = useState<
    Record<string, boolean>
  >({});
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(
    null,
  );
  const [dismissedPinnedMessageId, setDismissedPinnedMessageId] = useState<
    string | null
  >(null);
  const [pendingReactionKeys, setPendingReactionKeys] = useState<
    Record<string, boolean>
  >({});
  const [contextMenuMessage, setContextMenuMessage] =
    useState<ChatMessage | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteConfirm, setDeleteConfirm] = useState<{
    messageIds: string[];
    forEveryone: boolean;
  } | null>(null);
  const [typingParticipants, setTypingParticipants] = useState<Participant[]>([]);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [profileActionPending, setProfileActionPending] = useState<'contact' | 'block' | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const acknowledgedReadIdsRef = useRef(new Set<string>());
  const shouldStickToBottomRef = useRef(true);
  const lastAutoScrolledMessageKeyRef = useRef<string | null>(null);
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
  const initialChatRef = useRef(initialChat);
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
  const forwardingMessage = useMemo(
    () =>
      forwardingMessageId
        ? messages.find(
            message =>
              message.id === forwardingMessageId && canForwardMessage(message),
          ) ?? null
        : null,
    [forwardingMessageId, messages],
  );
  const forwardTargetChats = useMemo(() => {
    const deduplicated = new Map<string, ChatSummary>();
    if (chat) {
      deduplicated.set(chat.id, chat);
    }
    availableChats.forEach(availableChat => {
      if (!deduplicated.has(availableChat.id)) {
        deduplicated.set(availableChat.id, availableChat);
      }
    });
    return [...deduplicated.values()];
  }, [availableChats, chat]);
  const typingLabel = useMemo(
    () => formatTypingParticipants(typingParticipants),
    [typingParticipants],
  );
  const visiblePinnedMessage = useMemo(() => {
    const pinnedMessage = chat?.pinnedMessage ?? chat?.pinnedMessages?.[0] ?? null;
    if (!pinnedMessage) {
      return null;
    }

    return pinnedMessage.id === dismissedPinnedMessageId ? null : pinnedMessage;
  }, [chat, dismissedPinnedMessageId]);
  const latestMessageKey = useMemo(() => {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) {
      return null;
    }

    return [
      latestMessage.id,
      latestMessage.clientMessageId ?? '',
      latestMessage.serverOrder ?? '',
      latestMessage.createdAt,
      latestMessage.status?.state ?? '',
    ].join(':');
  }, [messages]);

  useEffect(() => {
    recoveredPendingMessagesRef.current = recoveredPendingMessages;
  }, [recoveredPendingMessages]);

  useEffect(() => {
    initialChatRef.current = initialChat;
  }, [initialChat]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const replaceMessages = useCallback((nextMessages: ChatMessage[]) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  }, []);

  const applyMessagesUpdate = useCallback(
    (updater: (currentMessages: ChatMessage[]) => ChatMessage[]) => {
      const nextMessages = updater(messagesRef.current);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      return nextMessages;
    },
    [],
  );

  const rememberRealtimeMessage = useCallback((messageId: string) => {
    handledRealtimeMessageIdsRef.current.set(messageId, true);
    if (handledRealtimeMessageIdsRef.current.size > 300) {
      const oldest = handledRealtimeMessageIdsRef.current.keys().next().value;
      if (oldest) {
        handledRealtimeMessageIdsRef.current.delete(oldest);
      }
    }
  }, []);

  const scrollMessagesToEnd = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({animated});
    });
  }, []);

  const handleMessageScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      shouldStickToBottomRef.current = distanceFromBottom < 72;
    },
    [],
  );

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
    if (forwardingMessageId && !forwardingMessage) {
      setForwardingMessageId(null);
      setForwardingTargetChatId(null);
    }
  }, [forwardingMessage, forwardingMessageId]);

  useEffect(() => {
    applyMessagesUpdate(currentMessages =>
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
    applyMessagesUpdate,
    pendingOutgoingMessages,
    pendingOutgoingMessagesKey,
    recoveredPendingMessages,
    session.user,
  ]);

  useEffect(() => {
    let cancelled = false;
    acknowledgedReadIdsRef.current = new Set();
    handledRealtimeMessageIdsRef.current = new Map();
    reactionOverridesRef.current = new Map();
    clearAllTypingParticipantTimeouts();
    clearTypingIdleTimeout();
    typingSignalRef.current.active = false;
    typingSignalRef.current.lastSentAt = 0;
    shouldStickToBottomRef.current = true;
    lastAutoScrolledMessageKeyRef.current = null;
    setChat(initialChatRef.current);
    replaceMessages([]);
    setMessageErrors({});
    setOpeningAttachmentKeys({});
    setSharingAttachmentKeys({});
    setImagePreview(null);
    setDismissedPinnedMessageId(null);
    setPendingReactionKeys({});
    setTypingParticipants([]);
    setComposerText('');
    setComposerAttachments([]);
    setReplyingToMessageId(null);
    setEditingMessageId(null);
    setForwardingMessageId(null);
    setForwardingTargetChatId(null);
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
        applyMessagesUpdate(currentMessages =>
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
    applyMessagesUpdate,
    chatId,
    clearAllTypingParticipantTimeouts,
    clearTypingIdleTimeout,
    onChatRead,
    onChatSummaryChange,
    onDeletePendingOutgoingMessages,
    replaceMessages,
    runAuthorized,
    session.user.id,
    stopTypingSignal,
  ]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!latestMessageKey) {
      lastAutoScrolledMessageKeyRef.current = null;
      return;
    }

    const previousMessageKey = lastAutoScrolledMessageKeyRef.current;
    lastAutoScrolledMessageKeyRef.current = latestMessageKey;

    if (previousMessageKey === null) {
      scrollMessagesToEnd(false);
      return;
    }

    if (previousMessageKey === latestMessageKey) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (
      shouldStickToBottomRef.current ||
      latestMessage?.sender.id === session.user.id
    ) {
      scrollMessagesToEnd(true);
    }
  }, [latestMessageKey, loading, messages, scrollMessagesToEnd, session.user.id]);

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

    if (handledRealtimeMessageIdsRef.current.has(realtimeMessage.message.id)) {
      return;
    }
    rememberRealtimeMessage(realtimeMessage.message.id);

    applyMessagesUpdate(currentMessages =>
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
    applyMessagesUpdate,
    chatId,
    clearTypingParticipantTimeout,
    onChatRead,
    realtimeMessage,
    rememberRealtimeMessage,
    runAuthorized,
    session.user.id,
  ]);

  useEffect(() => {
    if (!realtimeStatus || realtimeStatus.event.chatId !== chatId) {
      return;
    }

    const {messageId, status} = realtimeStatus.event;
    applyMessagesUpdate(currentMessages =>
      currentMessages.map(message =>
        message.id === messageId ? {...message, status} : message,
      ),
    );
  }, [applyMessagesUpdate, chatId, realtimeStatus]);

  useEffect(() => {
    if (!realtimeReaction || realtimeReaction.event.chatId !== chatId) {
      return;
    }

    reactionOverridesRef.current.set(
      realtimeReaction.event.messageId,
      realtimeReaction.event.reactions,
    );
    applyMessagesUpdate(currentMessages =>
      applyReactionOverrides(
        applyReactionEvent(currentMessages, realtimeReaction.event),
        reactionOverridesRef.current,
      ),
    );
  }, [applyMessagesUpdate, chatId, realtimeReaction]);

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
      applyMessagesUpdate(currentMessages =>
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
    setForwardingMessageId(null);
    setForwardingTargetChatId(null);
    setReplyingToMessageId(message.id);
    setError(null);
  };

  const handleEditMessage = (message: ChatMessage) => {
    if (!canEditMessage(message, session.user.id)) {
      return;
    }
    if (composerAttachments.length > 0) {
      setError('Send or remove selected attachments before editing a message.');
      return;
    }

    setReplyingToMessageId(null);
    setForwardingMessageId(null);
    setForwardingTargetChatId(null);
    setComposerDraftBeforeEdit(currentDraft =>
      editingMessageId ? currentDraft : composerText,
    );
    setEditingMessageId(message.id);
    setComposerText(message.content);
    setError(null);
  };

  const handleForwardMessage = (message: ChatMessage) => {
    if (!canForwardMessage(message)) {
      return;
    }

    if (editingMessageId) {
      setComposerText(composerDraftBeforeEdit ?? '');
      setComposerDraftBeforeEdit(null);
      setEditingMessageId(null);
    }
    setReplyingToMessageId(null);
    setForwardingMessageId(message.id);
    setForwardingTargetChatId(chatId);
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

  const handleCancelForward = () => {
    setForwardingMessageId(null);
    setForwardingTargetChatId(null);
  };

  const handleDeleteMessage = (message: ChatMessage) => {
    setContextMenuMessage(null);
    setDeleteConfirm({messageIds: [message.id], forEveryone: false});
  };

  const handlePinMessage = async (message: ChatMessage) => {
    setContextMenuMessage(null);
    try {
      const updated = await runAuthorized(token =>
        pinMessage(token, chatId, message.id),
      );
      setChat(updated);
      onChatSummaryChange(updated);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const handleCopyMessage = (message: ChatMessage) => {
    setContextMenuMessage(null);
    Share.share({message: message.content});
  };

  const handleToggleSelectMessage = (messageId: string) => {
    setSelectedMessageIds(current => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleClearSelection = () => setSelectedMessageIds(new Set());

  const handleCopySelected = () => {
    const texts = messages
      .filter(m => selectedMessageIds.has(m.id))
      .map(m => m.content)
      .join('\n\n');
    handleClearSelection();
    Share.share({message: texts});
  };

  const handleForwardSelected = () => {
    const first = messages.find(m => selectedMessageIds.has(m.id));
    if (first && canForwardMessage(first)) {
      handleForwardMessage(first);
    }
    handleClearSelection();
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) {
      return;
    }
    const {messageIds, forEveryone} = deleteConfirm;
    const scope = forEveryone ? 'EVERYONE' : 'SELF';
    setDeleteConfirm(null);
    handleClearSelection();
    try {
      if (messageIds.length === 1) {
        await runAuthorized(token =>
          deleteMessage(token, chatId, messageIds[0], scope),
        );
      } else {
        await runAuthorized(token =>
          deleteMessages(token, chatId, messageIds, scope),
        );
      }
      applyMessagesUpdate(current =>
        current.filter(m => !messageIds.includes(m.id)),
      );
    } catch (err) {
      setError(describeError(err));
    }
  };

  const handlePickAttachments = async () => {
    if (editingMessage || sendingCount > 0) {
      return;
    }

    try {
      const results = await pick({
        allowMultiSelection: true,
        presentationStyle: 'fullScreen',
        type: [documentPickerTypes.allFiles],
      });
      const localCopies =
        results.length > 0
          ? await keepLocalCopy({
              destination: 'cachesDirectory',
              files: results.map(result => ({
                uri: result.uri,
                fileName: result.name?.trim() || 'attachment',
              })) as [
                {uri: string; fileName: string},
                ...Array<{uri: string; fileName: string}>,
              ],
            })
          : [];
      const localCopyBySourceUri = new Map<string, string>();
      localCopies.forEach(copyResult => {
        if (copyResult.status === 'success') {
          localCopyBySourceUri.set(copyResult.sourceUri, copyResult.localUri);
        }
      });
      const nextAttachments = results
        .map(result => ({
          localId: createLocalAttachmentId(),
          uri: localCopyBySourceUri.get(result.uri) ?? result.uri,
          fileName: result.name?.trim() || 'attachment',
          mimeType: result.type?.trim() || 'application/octet-stream',
          sizeBytes:
            typeof result.size === 'number' && result.size > 0 ? result.size : null,
        }))
        .filter(attachment => attachment.uri.trim().length > 0);

      if (nextAttachments.length === 0) {
        return;
      }

      const oversizedAttachment = nextAttachments.find(
        attachment =>
          typeof attachment.sizeBytes === 'number' &&
          attachment.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES,
      );
      if (oversizedAttachment) {
        setError(
          `"${oversizedAttachment.fileName}" exceeds 25 MB. Pick a smaller file.`,
        );
        return;
      }

      setComposerAttachments(currentAttachments => [
        ...currentAttachments,
        ...nextAttachments,
      ]);
      setError(null);
    } catch (pickError) {
      if (
        isDocumentPickerErrorWithCode(pickError) &&
        pickError.code === documentPickerErrorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      setError(describeError(pickError));
    }
  };

  const handleRemoveComposerAttachment = (localId: string) => {
    setComposerAttachments(currentAttachments =>
      currentAttachments.filter(attachment => attachment.localId !== localId),
    );
  };

  const handleOpenAttachment = async (
    message: ChatMessage,
    attachment: ChatMessageAttachment,
  ) => {
    const attachmentKey = buildAttachmentKey(message.id, attachment.id);
    if (openingAttachmentKeys[attachmentKey]) {
      return;
    }

    setOpeningAttachmentKeys(currentKeys => ({
      ...currentKeys,
      [attachmentKey]: true,
    }));
    setError(null);

    try {
      const download = await runAuthorized(token =>
        downloadChatAttachment(token, message.chatId, attachment.id),
      );
      if (isImageAttachment(attachment)) {
        setImagePreview({
          attachmentId: attachment.id,
          fileName: attachment.fileName,
          url: download.url,
        });
      } else {
        await Linking.openURL(download.url);
      }
    } catch (downloadError) {
      setError(describeError(downloadError));
    } finally {
      setOpeningAttachmentKeys(currentKeys => {
        if (!currentKeys[attachmentKey]) {
          return currentKeys;
        }
        const nextKeys = {...currentKeys};
        delete nextKeys[attachmentKey];
        return nextKeys;
      });
    }
  };

  const handleOpenPreviewExternally = async () => {
    if (!imagePreview) {
      return;
    }

    try {
      await Linking.openURL(imagePreview.url);
    } catch (nextError) {
      setError(describeError(nextError));
    }
  };

  const handleShareAttachment = async (
    message: ChatMessage,
    attachment: ChatMessageAttachment,
  ) => {
    const attachmentKey = buildAttachmentKey(message.id, attachment.id);
    if (sharingAttachmentKeys[attachmentKey]) {
      return;
    }

    setSharingAttachmentKeys(currentKeys => ({
      ...currentKeys,
      [attachmentKey]: true,
    }));
    setError(null);

    try {
      const download = await runAuthorized(token =>
        downloadChatAttachment(token, message.chatId, attachment.id),
      );
      await Share.share({
        title: attachment.fileName,
        message: download.url,
        url: download.url,
      });
    } catch (downloadError) {
      setError(describeError(downloadError));
    } finally {
      setSharingAttachmentKeys(currentKeys => {
        if (!currentKeys[attachmentKey]) {
          return currentKeys;
        }
        const nextKeys = {...currentKeys};
        delete nextKeys[attachmentKey];
        return nextKeys;
      });
    }
  };

  const handleSend = async () => {
    const trimmedContent = composerText.trim();
    const selectedComposerAttachments = composerAttachments;
    const editingAttachments = editingMessage?.attachments ?? [];
    if (
      !trimmedContent &&
      selectedComposerAttachments.length === 0 &&
      !(editingMessage && editingAttachments.length > 0)
    ) {
      return;
    }

    stopTypingSignal();

    if (editingMessage) {
      setForwardingMessageId(null);
      setForwardingTargetChatId(null);
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
        applyMessagesUpdate(currentMessages =>
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

    setError(null);
    setSendingCount(currentCount => currentCount + 1);

    let uploadedAttachments: ChatMessageAttachment[] = [];
    if (selectedComposerAttachments.length > 0) {
      try {
        uploadedAttachments = await uploadComposerAttachments(
          runAuthorized,
          chatId,
          selectedComposerAttachments,
        );
      } catch (uploadError) {
        setError(describeError(uploadError));
        setSendingCount(currentCount => Math.max(0, currentCount - 1));
        return;
      }
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
      attachments: uploadedAttachments,
    });

    setComposerText('');
    setComposerAttachments([]);
    setError(null);
    clearMessageError(setMessageErrors, clientMessageId);
    setForwardingMessageId(null);
    setForwardingTargetChatId(null);
    applyMessagesUpdate(currentMessages =>
      sortMessagesForDisplay([...currentMessages, optimisticMessage]),
    );
    onPersistPendingOutgoingMessage(
      toPendingOutgoingMessage(optimisticMessage),
    ).catch(() => undefined);

    try {
      const confirmedMessage = await sendPlainMessage({
        chatId,
        clientMessageId,
        content: trimmedContent,
        replyToMessageId: replyingToMessage?.id ?? null,
        attachments: uploadedAttachments,
      });
      onDeletePendingOutgoingMessages([clientMessageId]).catch(() => undefined);
      rememberRealtimeMessage(confirmedMessage.id);
      applyMessagesUpdate(currentMessages =>
        applyReactionOverrides(
          mergeConfirmedMessage(currentMessages, confirmedMessage),
          reactionOverridesRef.current,
        ),
      );
      setReplyingToMessageId(null);
    } catch (sendError) {
      const nextError = describeError(sendError);
      setMessageErrors(currentErrors => ({
        ...currentErrors,
        [clientMessageId]: nextError,
      }));
      const nextMessages = applyMessagesUpdate(currentMessages => {
        const failedMessages = markMessageSendFailed(
          currentMessages,
          clientMessageId,
        );
        return failedMessages;
      });
      const failedMessage = nextMessages.find(
        currentMessage => currentMessage.clientMessageId === clientMessageId,
      );
      if (failedMessage) {
        onPersistPendingOutgoingMessage(
          toPendingOutgoingMessage(failedMessage),
        ).catch(() => undefined);
      }
    } finally {
      setSendingCount(currentCount => Math.max(0, currentCount - 1));
    }
  };

  const handleForwardToChat = async (targetChatId: string) => {
    if (!forwardingMessage) {
      return;
    }

    const targetChat = forwardTargetChats.find(
      currentChat => currentChat.id === targetChatId,
    );
    if (!targetChat) {
      setError('Forward target is unavailable.');
      return;
    }

    const clientMessageId = createClientMessageId();
    const optimisticMessage = createOptimisticOutgoingMessage({
      currentUser: session.user,
      chatId: targetChatId,
      content: forwardingMessage.content,
      clientMessageId,
      recipientCount: Math.max(0, targetChat.members.length - 1),
      localOrder: ++nextLocalOrderRef.current,
      forwardedFrom: {
        sender: forwardingMessage.sender,
      },
      forwardedFromMessageId: forwardingMessage.id,
    });
    const shouldOpenTargetChat = targetChatId !== chatId;

    setForwardingTargetChatId(targetChatId);
    setError(null);
    clearMessageError(setMessageErrors, clientMessageId);
    if (!shouldOpenTargetChat) {
      applyMessagesUpdate(currentMessages =>
        sortMessagesForDisplay([...currentMessages, optimisticMessage]),
      );
    }
    setSendingCount(currentCount => currentCount + 1);
    await onPersistPendingOutgoingMessage(
      toPendingOutgoingMessage(optimisticMessage),
    ).catch(() => undefined);

    try {
      const confirmedMessage = await sendPlainMessage({
        chatId: targetChatId,
        clientMessageId,
        content: forwardingMessage.content,
        forwardedFromMessageId: forwardingMessage.id,
      });
      await onDeletePendingOutgoingMessages([clientMessageId]).catch(
        () => undefined,
      );
      rememberRealtimeMessage(confirmedMessage.id);
      if (!shouldOpenTargetChat) {
        applyMessagesUpdate(currentMessages =>
          applyReactionOverrides(
            mergeConfirmedMessage(currentMessages, confirmedMessage),
            reactionOverridesRef.current,
          ),
        );
      }
      setForwardingMessageId(null);
      setForwardingTargetChatId(null);
    } catch (sendError) {
      const nextError = describeError(sendError);
      setMessageErrors(currentErrors => ({
        ...currentErrors,
        [clientMessageId]: nextError,
      }));
      if (!shouldOpenTargetChat) {
        const nextMessages = applyMessagesUpdate(currentMessages => {
          const failedMessages = markMessageSendFailed(
            currentMessages,
            clientMessageId,
          );
          return failedMessages;
        });
        const failedMessage = nextMessages.find(
          currentMessage => currentMessage.clientMessageId === clientMessageId,
        );
        if (failedMessage) {
          onPersistPendingOutgoingMessage(
            toPendingOutgoingMessage(failedMessage),
          ).catch(() => undefined);
        }
      }
    } finally {
      setSendingCount(currentCount => Math.max(0, currentCount - 1));
      if (shouldOpenTargetChat) {
        onOpenChat(targetChatId);
      }
    }
  };

  const handleRetryMessage = async (message: ChatMessage) => {
    const clientMessageId = message.clientMessageId?.trim();
    if (!clientMessageId || message.sender.id !== session.user.id) {
      return;
    }

    clearMessageError(setMessageErrors, clientMessageId);
    setError(null);
    const sendingMessages = applyMessagesUpdate(currentMessages => {
      const nextMessages = markMessageSending(currentMessages, clientMessageId);
      return nextMessages;
    });
    const sendingMessage = sendingMessages.find(
      currentMessage => currentMessage.clientMessageId === clientMessageId,
    );
    if (sendingMessage) {
      onPersistPendingOutgoingMessage(
        toPendingOutgoingMessage(sendingMessage),
      ).catch(() => undefined);
    }
    setSendingCount(currentCount => currentCount + 1);

    try {
      const confirmedMessage = await sendPlainMessage({
        chatId,
        clientMessageId,
        content: message.content,
        replyToMessageId: message.replyTo?.id ?? null,
        forwardedFromMessageId: message.forwardedFromMessageId ?? null,
        attachments: message.attachments ?? [],
      });
      onDeletePendingOutgoingMessages([clientMessageId]).catch(() => undefined);
      rememberRealtimeMessage(confirmedMessage.id);
      applyMessagesUpdate(currentMessages =>
        applyReactionOverrides(
          mergeConfirmedMessage(currentMessages, confirmedMessage),
          reactionOverridesRef.current,
        ),
      );
    } catch (sendError) {
      const nextError = describeError(sendError);
      setMessageErrors(currentErrors => ({
        ...currentErrors,
        [clientMessageId]: nextError,
      }));
      const nextMessages = applyMessagesUpdate(currentMessages => {
        const failedMessages = markMessageSendFailed(
          currentMessages,
          clientMessageId,
        );
        return failedMessages;
      });
      const failedMessage = nextMessages.find(
        currentMessage => currentMessage.clientMessageId === clientMessageId,
      );
      if (failedMessage) {
        onPersistPendingOutgoingMessage(
          toPendingOutgoingMessage(failedMessage),
        ).catch(() => undefined);
      }
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
      applyMessagesUpdate(currentMessages =>
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
      : composerText.trim() || composerAttachments.length > 0,
  );
  const activeConversationMember =
    chat?.direct && chat.members.length > 1
      ? chat.members.find(member => member.id !== session.user.id) ?? null
      : null;
  const headerStatusText = typingParticipants.length
    ? typingLabel
    : chat?.direct
      ? null
      : chat
        ? `${chat.members.length} members`
        : 'Opening chat';
  const headerMemberOnline = activeConversationMember?.online ?? false;
  const isSelectionMode = selectedMessageIds.size > 0;
  const peerName =
    activeConversationMember?.displayName ?? chat?.title ?? 'собеседника';
  const isContact = activeConversationMember
    ? contacts.some(c => c.username === activeConversationMember.username)
    : false;
  const isBlocked = activeConversationMember
    ? blockedUsers.some(b => b.username === activeConversationMember.username)
    : false;

  const handleProfileAddContact = async () => {
    if (!activeConversationMember || !onAddContact) return;
    setProfileActionPending('contact');
    try { await onAddContact(activeConversationMember.username); } catch {} finally { setProfileActionPending(null); }
  };
  const handleProfileRemoveContact = async () => {
    if (!activeConversationMember || !onRemoveContact) return;
    setProfileActionPending('contact');
    try { await onRemoveContact(activeConversationMember.username); } catch {} finally { setProfileActionPending(null); }
  };
  const handleProfileBlock = async () => {
    if (!activeConversationMember || !onBlockUser) return;
    setProfileActionPending('block');
    try { await onBlockUser(activeConversationMember.username); } catch {} finally { setProfileActionPending(null); }
  };
  const handleProfileUnblock = async () => {
    if (!activeConversationMember || !onUnblockUser) return;
    setProfileActionPending('block');
    try { await onUnblockUser(activeConversationMember.username); } catch {} finally { setProfileActionPending(null); }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ios: 'padding', android: 'height'})}
      style={[styles.screen, {backgroundColor: chatBg}]}>
      <View style={[styles.screen, {backgroundColor: chatBg}]}>
        <View style={styles.threadBackdrop} pointerEvents="none">
          <View style={styles.threadGlowPrimary} />
          <View style={styles.threadGlowSecondary} />
        </View>
        {isSelectionMode ? (
          <View style={styles.header}>
            <Pressable onPress={handleClearSelection} style={styles.headerButton}>
              <Text style={styles.headerButtonLabel}>✕</Text>
            </Pressable>
            <Text style={styles.selectionCount}>{selectedMessageIds.size}</Text>
            <View style={styles.headerSpacer} />
            <Pressable onPress={handleCopySelected} style={styles.headerButton}>
              <Text style={styles.headerButtonLabel}>⎘</Text>
            </Pressable>
            <Pressable onPress={handleForwardSelected} style={styles.headerButton}>
              <Text style={styles.headerButtonLabel}>↪</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setDeleteConfirm({
                  messageIds: Array.from(selectedMessageIds),
                  forEveryone: false,
                })
              }
              style={styles.headerButton}>
              <Text style={[styles.headerButtonLabel, {color: androidTheme.colors.danger}]}>🗑</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.header}>
            <Pressable onPress={onBack} style={styles.headerButton}>
              <Text style={styles.headerButtonLabel}>{'<'}</Text>
            </Pressable>
            <Pressable
              style={styles.headerPressable}
              onPress={() => chat && setProfileSheetOpen(true)}>
              <AvatarBadge
                name={chat?.title ?? 'Chat'}
                avatarUrl={chat?.avatarUrl ?? activeConversationMember?.avatarUrl ?? null}
                size={44}
                online={headerMemberOnline}
              />
              <View style={styles.headerCopy}>
                <Text style={styles.headerTitle}>{chat?.title ?? 'Loading chat'}</Text>
                {headerStatusText ? (
                  <Text style={styles.headerSubtitle}>{headerStatusText}</Text>
                ) : null}
              </View>
            </Pressable>
            <View style={styles.headerSpacer}>
              {chat?.unreadCount ? (
                <View style={styles.headerUnreadBadge}>
                  <Text style={styles.headerUnreadBadgeLabel}>
                    {String(chat.unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {visiblePinnedMessage ? (
        <View style={styles.pinnedBanner} testID="pinned-banner">
          <View style={styles.pinnedAccent} />
          <View style={styles.pinnedCopy}>
            <Text style={styles.pinnedLabel}>Pinned message</Text>
            <Text numberOfLines={1} style={styles.pinnedPreview}>
              {visiblePinnedMessage.preview || 'Open pinned message'}
            </Text>
          </View>
          <Text style={styles.pinnedMeta}>
            {formatRelativeMessageTime(visiblePinnedMessage.createdAt)}
          </Text>
          <Pressable
            onPress={() => setDismissedPinnedMessageId(visiblePinnedMessage.id)}
            style={styles.pinnedClose}
            testID="dismiss-pinned-button">
            <Text style={styles.pinnedCloseLabel}>x</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        ref={messageScrollRef}
        style={styles.messageScroll}
        contentContainerStyle={styles.messageContent}
        onScroll={handleMessageScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled">
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
            <Text style={styles.emptyLabel}>Loading conversation...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyLabel}>No messages yet.</Text>
          </View>
        ) : (
          messages.map((message, msgIndex) => {
            const ownMessage = message.sender.id === session.user.id;
            const prevMessage = messages[msgIndex - 1];
            const nextMessage = messages[msgIndex + 1];
            const isFirstInGroup =
              !prevMessage || prevMessage.sender.id !== message.sender.id;
            const isLastInGroup =
              !nextMessage || nextMessage.sender.id !== message.sender.id;
            const senderColor = getSenderColor(message.sender.id);
            const attachments = message.attachments ?? [];
            const clientMessageId = message.clientMessageId ?? '';
            const sendFailure =
              clientMessageId.trim().length > 0
                ? messageErrors[clientMessageId] ??
                  (ownMessage && message.status?.state === 'FAILED'
                    ? 'Message was not delivered. Retry.'
                    : null)
                : null;
            const forwardedLabel = message.forwardedFrom
              ? `Forwarded from ${message.forwardedFrom.sender.displayName}`
              : message.forwarded
                ? 'Forwarded'
                : null;

            const isSelected = selectedMessageIds.has(message.id);

            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  isSelected && styles.messageRowSelected,
                ]}>
                {isSelectionMode ? (
                  <Pressable
                    style={styles.selectionCircleWrap}
                    onPress={() => handleToggleSelectMessage(message.id)}>
                    <View
                      style={[
                        styles.selectionCircle,
                        isSelected && styles.selectionCircleActive,
                      ]}>
                      {isSelected ? (
                        <Text style={styles.selectionCheck}>✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                ) : null}
                {ownMessage ? <View style={{flex: 1}} /> : null}
                <Pressable
                  testID={`message-bubble-${message.id}`}
                  onPress={() => {
                    if (isSelectionMode) {
                      handleToggleSelectMessage(message.id);
                    } else {
                      setContextMenuMessage(message);
                    }
                  }}
                  onLongPress={() => handleToggleSelectMessage(message.id)}
                  style={[
                    ownMessage ? styles.ownBubble : styles.peerBubble,
                    {
                      marginTop: isFirstInGroup ? 10 : 2,
                      borderTopRightRadius:
                        ownMessage && !isFirstInGroup ? 6 : 18,
                      borderBottomRightRadius: ownMessage
                        ? isLastInGroup
                          ? 4
                          : 18
                        : 18,
                      borderTopLeftRadius:
                        !ownMessage && !isFirstInGroup ? 6 : 18,
                      borderBottomLeftRadius: !ownMessage
                        ? isLastInGroup
                          ? 4
                          : 18
                        : 18,
                    },
                  ]}>
                {!ownMessage && isFirstInGroup && !chat?.direct ? (
                  <Text style={[styles.messageSender, {color: senderColor}]}>
                    {message.sender.displayName}
                  </Text>
                ) : null}
                {message.replyTo ? (
                  <View style={styles.replyCard}>
                    <Text style={styles.replyLabel}>
                      Reply to {message.replyTo.sender.displayName}
                    </Text>
                    <Text style={styles.replySnippet}>{message.replyTo.preview}</Text>
                  </View>
                ) : null}
                {forwardedLabel ? (
                  <Text style={styles.forwardedLabel}>{forwardedLabel}</Text>
                ) : null}
                <Text style={[styles.messageBody, {fontSize: msgFontSize}]}>
                  {message.content || 'Attachment-only message'}
                </Text>
                {attachments.length > 0 ? (
                  <View style={styles.messageAttachmentList}>
                    {attachments.map(attachment => {
                      const attachmentKey = buildAttachmentKey(
                        message.id,
                        attachment.id,
                      );
                      const openingAttachment = Boolean(
                        openingAttachmentKeys[attachmentKey],
                      );
                      const sharingAttachment = Boolean(
                        sharingAttachmentKeys[attachmentKey],
                      );
                      const attachmentBusy =
                        openingAttachment || sharingAttachment;
                      return (
                        <View
                          key={attachment.id}
                          style={
                            attachmentBusy
                              ? styles.messageAttachmentButtonDisabled
                              : styles.messageAttachmentButton
                          }
                          testID={`attachment-${message.id}-${attachment.id}`}>
                          <View style={styles.messageAttachmentCopy}>
                            <Text
                              numberOfLines={1}
                              style={styles.messageAttachmentName}>
                              {attachment.fileName}
                            </Text>
                            <Text style={styles.messageAttachmentMeta}>
                              {formatFileSize(attachment.sizeBytes)}
                            </Text>
                          </View>
                          <View style={styles.messageAttachmentActions}>
                            <Pressable
                              onPress={() => {
                                handleOpenAttachment(message, attachment).catch(
                                  () => undefined,
                                );
                              }}
                              disabled={attachmentBusy}
                              style={
                                attachmentBusy
                                  ? styles.messageAttachmentActionButtonDisabled
                                  : styles.messageAttachmentActionButton
                              }
                              testID={`open-attachment-${message.id}-${attachment.id}`}>
                              <Text style={styles.messageAttachmentAction}>
                                {openingAttachment
                                  ? isImageAttachment(attachment)
                                    ? 'Previewing...'
                                    : 'Opening...'
                                  : isImageAttachment(attachment)
                                    ? 'Preview'
                                    : 'Open'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                handleShareAttachment(message, attachment).catch(
                                  () => undefined,
                                );
                              }}
                              disabled={attachmentBusy}
                              style={
                                attachmentBusy
                                  ? styles.messageAttachmentActionButtonDisabled
                                  : styles.messageAttachmentActionButton
                              }
                              testID={`share-attachment-${message.id}-${attachment.id}`}>
                              <Text style={styles.messageAttachmentAction}>
                                {sharingAttachment ? 'Sharing...' : 'Share'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.messageMetaRow}>
                  {message.editedAt ? (
                    <Text style={styles.messageMetaEdited}>edited</Text>
                  ) : null}
                  <Text style={styles.messageMeta}>
                    {formatTimestamp(message.editedAt ?? message.createdAt)}
                  </Text>
                  {ownMessage && message.status ? (
                    <Text style={styles.messageStatusTick}>
                      {message.status.state === 'READ'
                        ? '✓✓'
                        : message.status.state === 'DELIVERED' ||
                            message.status.state === 'SENT'
                          ? '✓'
                          : message.status.state === 'FAILED'
                            ? '✗'
                            : '○'}
                    </Text>
                  ) : null}
                </View>
                {message.reactions.length > 0 ? (
                  <View style={styles.reactionRow}>
                    {message.reactions.map(reaction => {
                      const emoji = REACTION_OPTIONS.find(o => o.key === reaction.key)?.emoji ?? '';
                      return (
                        <Pressable
                          key={reaction.key}
                          testID={`reaction-toggle-${message.id}-${reaction.key}`}
                          style={reaction.reactedByCurrentUser ? styles.reactionButtonActive : styles.reactionButton}
                          onPress={() => { handleToggleReaction(message, reaction.key).catch(() => undefined); }}>
                          <Text style={reaction.reactedByCurrentUser ? styles.reactionButtonLabelActive : styles.reactionButtonLabel}>
                            {`${emoji} ${reaction.count}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
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
              </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {paddingBottom: 12 + Math.max(insets.bottom, 8)},
        ]}>
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
        {forwardingMessage ? (
          <View style={styles.forwardContext} testID="forward-context">
            <View style={styles.composerContext}>
              <View style={styles.composerContextCopy}>
                <Text style={styles.composerContextLabel}>Forward</Text>
                <Text style={styles.composerContextTitle}>
                  {forwardingMessage.sender.displayName}
                </Text>
                <Text style={styles.composerContextPreview}>
                  {buildMessageContentPreview(forwardingMessage)}
                </Text>
              </View>
              <Pressable
                onPress={handleCancelForward}
                style={styles.composerContextClose}
                testID="cancel-forward-button">
                <Text style={styles.composerContextCloseLabel}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.forwardTargetList}>
              {forwardTargetChats.map(targetChat => {
                const selected = forwardingTargetChatId === targetChat.id;
                return (
                  <Pressable
                    key={targetChat.id}
                    onPress={() => handleForwardToChat(targetChat.id)}
                    disabled={sendingCount > 0}
                    style={
                      selected
                        ? styles.forwardTargetButtonActive
                        : sendingCount > 0
                          ? styles.forwardTargetButtonDisabled
                          : styles.forwardTargetButton
                    }
                    testID={`forward-target-${targetChat.id}`}>
                    <Text
                      style={
                        selected
                          ? styles.forwardTargetTitleActive
                          : styles.forwardTargetTitle
                      }>
                      {targetChat.id === chatId ? 'This chat' : targetChat.title}
                    </Text>
                    <Text
                      style={
                        selected
                          ? styles.forwardTargetMetaActive
                          : styles.forwardTargetMeta
                      }>
                      {targetChat.direct
                        ? 'Direct chat'
                        : `${targetChat.members.length} members`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        {composerAttachments.length > 0 ? (
          <View style={styles.composerAttachmentList}>
            {composerAttachments.map(attachment => (
              <View
                key={attachment.localId}
                style={styles.composerAttachmentChip}
                testID={`composer-attachment-${attachment.localId}`}>
                <View style={styles.composerAttachmentCopy}>
                  <Text
                    numberOfLines={1}
                    style={styles.composerAttachmentName}>
                    {attachment.fileName}
                  </Text>
                  <Text style={styles.composerAttachmentMeta}>
                    {attachment.sizeBytes != null
                      ? formatFileSize(attachment.sizeBytes)
                      : 'Ready to upload'}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    handleRemoveComposerAttachment(attachment.localId)
                  }
                  disabled={sendingCount > 0}
                  style={styles.composerAttachmentRemove}
                  testID={`remove-attachment-${attachment.localId}`}>
                  <Text style={styles.composerAttachmentRemoveLabel}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.composerInputRow}>
          <View style={styles.composerDock}>
            <Pressable
              onPress={handlePickAttachments}
              disabled={Boolean(editingMessage) || sendingCount > 0 || loading}
              style={
                Boolean(editingMessage) || sendingCount > 0 || loading
                  ? styles.attachmentButtonDisabled
                  : styles.attachmentButton
              }
              testID="attach-button">
              <Text style={styles.attachmentButtonLabel}>+</Text>
            </Pressable>
            <TextInput
              value={composerText}
              onChangeText={nextValue => {
                setComposerText(nextValue);
                signalTypingActivity(nextValue);
              }}
              onFocus={() => scrollMessagesToEnd(false)}
              placeholder={
                editingMessage
                  ? 'Edit your message'
                  : replyingToMessage
                    ? 'Write a reply'
                    : 'Write a message'
              }
              placeholderTextColor={androidTheme.colors.textMuted}
              selectionColor={androidTheme.colors.blue}
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
                    ? '...'
                    : 'Save'
                  : sendingCount > 0
                    ? '...'
                    : 'Send'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      {imagePreview ? (
        <View style={styles.imagePreviewOverlay} testID="image-preview-overlay">
          <View style={styles.imagePreviewCard}>
            <Text
              numberOfLines={1}
              style={styles.imagePreviewTitle}
              testID="image-preview-title">
              {imagePreview.fileName}
            </Text>
            <Image
              source={{uri: imagePreview.url}}
              style={styles.imagePreviewImage}
              resizeMode="contain"
              testID="image-preview-image"
            />
            <View style={styles.imagePreviewActions}>
              <Pressable
                onPress={() => {
                  handleOpenPreviewExternally().catch(() => undefined);
                }}
                style={styles.imagePreviewActionButton}
                testID="image-preview-open-external">
                <Text style={styles.imagePreviewActionLabel}>Open externally</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setImagePreview(null);
                }}
                style={styles.imagePreviewCloseButton}
                testID="image-preview-close">
                <Text style={styles.imagePreviewCloseLabel}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Modal
        visible={deleteConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirm(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Удалить сообщение</Text>
            <Text style={styles.confirmBody}>
              Вы точно хотите удалить{' '}
              {deleteConfirm && deleteConfirm.messageIds.length > 1
                ? `эти ${deleteConfirm.messageIds.length} сообщения`
                : 'это сообщение'}
              ?
            </Text>
            {chat?.direct ? (
              <Pressable
                style={styles.confirmCheckRow}
                onPress={() =>
                  setDeleteConfirm(c =>
                    c ? {...c, forEveryone: !c.forEveryone} : c,
                  )
                }>
                <View
                  style={[
                    styles.confirmCheckbox,
                    deleteConfirm?.forEveryone && styles.confirmCheckboxActive,
                  ]}>
                  {deleteConfirm?.forEveryone ? (
                    <Text style={styles.confirmCheckmark}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.confirmCheckLabel}>
                  Также удалить для {peerName}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setDeleteConfirm(null)}
                style={styles.confirmCancel}>
                <Text style={styles.confirmCancelLabel}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDelete}
                style={styles.confirmDelete}>
                <Text style={styles.confirmDeleteLabel}>Удалить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={contextMenuMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuMessage(null)}>
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setContextMenuMessage(null)}>
          <View
            style={styles.menuPopup}
            onStartShouldSetResponder={() => true}>
            {/* Emoji reactions pill */}
            <View style={styles.menuReactionsPill}>
              {REACTION_OPTIONS.map(option => {
                const reaction = contextMenuMessage
                  ? getMessageReaction(contextMenuMessage, option.key)
                  : null;
                const active = reaction?.reactedByCurrentUser ?? false;
                return (
                  <Pressable
                    key={option.key}
                    testID={`reaction-toggle-${contextMenuMessage?.id}-${option.key}`}
                    style={[
                      styles.menuReactionBtn,
                      active && styles.menuReactionBtnActive,
                    ]}
                    onPress={() => {
                      if (contextMenuMessage) {
                        handleToggleReaction(contextMenuMessage, option.key);
                        setContextMenuMessage(null);
                      }
                    }}>
                    <Text style={styles.menuReactionEmoji}>{option.emoji}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Actions card */}
            <View style={styles.menuCard}>
              {contextMenuMessage && canReplyToMessage(contextMenuMessage) ? (
                <>
                  <Pressable
                    testID={`reply-action-${contextMenuMessage.id}`}
                    style={styles.menuItem}
                    onPress={() => {
                      handleReplyMessage(contextMenuMessage);
                      setContextMenuMessage(null);
                    }}>
                    <Text style={styles.menuItemIcon}>↩</Text>
                    <Text style={styles.menuItemLabel}>Ответить</Text>
                  </Pressable>
                  <View style={styles.menuDivider} />
                </>
              ) : null}
              <Pressable
                style={styles.menuItem}
                onPress={() => handleCopyMessage(contextMenuMessage!)}>
                <Text style={styles.menuItemIcon}>⎘</Text>
                <Text style={styles.menuItemLabel}>Копировать</Text>
              </Pressable>
              {contextMenuMessage && canForwardMessage(contextMenuMessage) ? (
                <>
                  <View style={styles.menuDivider} />
                  <Pressable
                    testID={`forward-action-${contextMenuMessage.id}`}
                    style={styles.menuItem}
                    onPress={() => {
                      handleForwardMessage(contextMenuMessage);
                      setContextMenuMessage(null);
                    }}>
                    <Text style={styles.menuItemIcon}>↪</Text>
                    <Text style={styles.menuItemLabel}>Переслать</Text>
                  </Pressable>
                </>
              ) : null}
              {contextMenuMessage &&
              canEditMessage(contextMenuMessage, session.user.id) ? (
                <>
                  <View style={styles.menuDivider} />
                  <Pressable
                    testID={`edit-action-${contextMenuMessage.id}`}
                    style={styles.menuItem}
                    onPress={() => {
                      handleEditMessage(contextMenuMessage);
                      setContextMenuMessage(null);
                    }}>
                    <Text style={styles.menuItemIcon}>✎</Text>
                    <Text style={styles.menuItemLabel}>Редактировать</Text>
                  </Pressable>
                </>
              ) : null}
              <View style={styles.menuDivider} />
              <Pressable
                style={styles.menuItem}
                onPress={() => handlePinMessage(contextMenuMessage!)}>
                <Text style={styles.menuItemIcon}>📌</Text>
                <Text style={styles.menuItemLabel}>Закрепить</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={styles.menuItem}
                onPress={() => handleDeleteMessage(contextMenuMessage!)}>
                <Text style={[styles.menuItemIcon, styles.menuItemIconDanger]}>🗑</Text>
                <Text style={[styles.menuItemLabel, styles.menuItemLabelDanger]}>
                  Удалить
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={profileSheetOpen}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setProfileSheetOpen(false)}>
        <View style={styles.profileScreen}>
          {/* Шапка с кнопкой назад */}
          <View style={styles.profileTopBar}>
            <Pressable
              style={styles.profileBackBtn}
              onPress={() => setProfileSheetOpen(false)}>
              <Text style={styles.profileBackLabel}>{'<'}</Text>
            </Pressable>
          </View>

          {/* Герой: аватар на тёмном фоне */}
          <View style={styles.profileHero}>
            <AvatarBadge
              name={chat?.title ?? '?'}
              avatarUrl={chat?.avatarUrl ?? activeConversationMember?.avatarUrl ?? null}
              size={112}
              online={headerMemberOnline}
            />
            <Text style={styles.profileHeroName}>{chat?.title ?? ''}</Text>
            <Text style={styles.profileHeroStatus}>
              {activeConversationMember
                ? activeConversationMember.online
                  ? 'В сети'
                  : 'был(а) недавно'
                : `${chat?.members.length ?? 0} участников`}
            </Text>
          </View>

          {/* Кнопки действий */}
          <View style={styles.profileActions}>
            <Pressable
              style={styles.profileActionBtn}
              onPress={() => setProfileSheetOpen(false)}>
              <Text style={styles.profileActionIcon}>💬</Text>
              <Text style={styles.profileActionLabel}>Чат</Text>
            </Pressable>
            {(onAddContact || onRemoveContact) ? (
              <Pressable
                style={styles.profileActionBtn}
                disabled={profileActionPending === 'contact'}
                onPress={isContact ? handleProfileRemoveContact : handleProfileAddContact}>
                <Text style={styles.profileActionIcon}>
                  {profileActionPending === 'contact' ? '⏳' : isContact ? '✓' : '👤'}
                </Text>
                <Text style={styles.profileActionLabel}>
                  {profileActionPending === 'contact'
                    ? '...'
                    : isContact
                      ? 'Контакт'
                      : 'Добавить'}
                </Text>
              </Pressable>
            ) : null}
            {(onBlockUser || onUnblockUser) ? (
              <Pressable
                style={[
                  styles.profileActionBtn,
                  isBlocked ? styles.profileActionBtnDanger : null,
                ]}
                disabled={profileActionPending === 'block'}
                onPress={isBlocked ? handleProfileUnblock : handleProfileBlock}>
                <Text style={styles.profileActionIcon}>
                  {profileActionPending === 'block' ? '⏳' : isBlocked ? '🔓' : '🚫'}
                </Text>
                <Text
                  style={[
                    styles.profileActionLabel,
                    isBlocked ? styles.profileActionLabelDanger : null,
                  ]}>
                  {profileActionPending === 'block'
                    ? '...'
                    : isBlocked
                      ? 'Разблок.'
                      : 'Блок.'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Информационная карточка */}
          <View style={styles.profileInfoCard}>
            {activeConversationMember ? (
              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoValue}>
                  @{activeConversationMember.username}
                </Text>
                <Text style={styles.profileInfoLabel}>Имя пользователя</Text>
              </View>
            ) : null}
            {activeConversationMember?.profession?.trim() ? (
              <>
                <View style={styles.profileInfoDivider} />
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoValue}>
                    {activeConversationMember.profession}
                  </Text>
                  <Text style={styles.profileInfoLabel}>О себе</Text>
                </View>
              </>
            ) : null}
            {!chat?.direct && chat ? (
              <>
                {activeConversationMember ? <View style={styles.profileInfoDivider} /> : null}
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoValue}>
                    {chat.members.length} участников
                  </Text>
                  <Text style={styles.profileInfoLabel}>Участники группы</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      </View>
    </KeyboardAvoidingView>
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
  forwardedFrom?: ChatMessage['forwardedFrom'];
  forwardedFromMessageId?: string | null;
  attachments?: ChatMessageAttachment[];
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
    forwarded: Boolean(options.forwardedFromMessageId),
    forwardedFrom: options.forwardedFrom ?? null,
    forwardedFromMessageId: options.forwardedFromMessageId ?? null,
    attachments: options.attachments ?? [],
  } satisfies ChatMessage;
}

function mergeLoadedMessages(
  loadedMessages: ChatMessage[],
  currentMessages: ChatMessage[],
  recoveredPendingMessages: ChatMessage[],
) {
  const loadedIds = new Set(loadedMessages.map(message => message.id));
  const loadedClientMessageIds = new Set(
    loadedMessages
      .map(message => message.clientMessageId)
      .filter((id): id is string => Boolean(id)),
  );

  const filteredCurrentMessages = currentMessages.filter(
    message =>
      !loadedIds.has(message.id) &&
      !(
        message.clientMessageId &&
        loadedClientMessageIds.has(message.clientMessageId)
      ),
  );

  return syncRecoveredPendingMessages(
    sortMessagesForDisplay([...loadedMessages, ...filteredCurrentMessages]),
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
    forwardedFromMessageId: message.forwardedFromMessageId ?? null,
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

function canForwardMessage(message: ChatMessage) {
  return canReplyToMessage(message) && message.content.trim().length > 0;
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

function buildAttachmentKey(messageId: string, attachmentId: string) {
  return `${messageId}:${attachmentId}`;
}

function isImageAttachment(attachment: ChatMessageAttachment) {
  return attachment.mimeType.trim().toLowerCase().startsWith('image/');
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

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

async function uploadComposerAttachments(
  runAuthorized: RunAuthorized,
  chatId: string,
  attachments: ComposerAttachmentDraft[],
) {
  const uploadedAttachments: ChatMessageAttachment[] = [];
  for (const attachment of attachments) {
    if (
      typeof attachment.sizeBytes === 'number' &&
      attachment.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES
    ) {
      throw new Error(
        `"${attachment.fileName}" exceeds 25 MB. Pick a smaller file.`,
      );
    }

    const uploadedAttachment = await runAuthorized(token =>
      uploadChatAttachment(token, chatId, {
        uri: attachment.uri,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }),
    );
    uploadedAttachments.push(uploadedAttachment);
  }
  return uploadedAttachments;
}

function createLocalAttachmentId() {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveAvatarUri(avatarUrl: string): string {
  if (avatarUrl.startsWith('/')) {
    return API_URL + avatarUrl;
  }
  return avatarUrl;
}

function AvatarBadge({
  name,
  avatarUrl,
  size,
  online,
}: {
  name: string;
  avatarUrl: string | null;
  size: number;
  online?: boolean;
}) {
  return (
    <View style={{width: size, height: size}}>
      <View
        style={[
          styles.headerAvatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}>
        {avatarUrl ? (
          <Image
            source={{uri: resolveAvatarUri(avatarUrl)}}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
            }}
          />
        ) : (
          <Text style={styles.headerAvatarLabel}>{buildInitials(name)}</Text>
        )}
      </View>
      {online ? (
        <View style={styles.headerAvatarOnlineDot} />
      ) : null}
    </View>
  );
}

function buildInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return 'NM';
  }
  const first = words[0]?.slice(0, 1) ?? '';
  const second = (words[1] ?? words[0] ?? '').slice(0, 1);
  return `${first}${second}`.toUpperCase();
}

const SENDER_NAME_COLORS = [
  '#6fb6f1',
  '#7ed4a4',
  '#f4a456',
  '#e88fbb',
  '#b07ede',
  '#5dd6d6',
];

function getSenderColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = userId.charCodeAt(i) + ((h << 5) - h);
  }
  return SENDER_NAME_COLORS[Math.abs(h) % SENDER_NAME_COLORS.length];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  threadBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  threadGlowPrimary: {
    position: 'absolute',
    top: 96,
    left: -84,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(78, 161, 255, 0.08)',
  },
  threadGlowSecondary: {
    position: 'absolute',
    right: -72,
    bottom: 180,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: 'rgba(244, 146, 86, 0.06)',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(18, 29, 40, 0.92)',
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  headerButtonDisabled: {
    minWidth: 74,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerButtonLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  headerAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
    overflow: 'hidden',
  },
  headerAvatarLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  headerAvatarOnlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#4caf50',
    borderWidth: 2,
    borderColor: androidTheme.colors.background,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerSpacer: {
    minWidth: 56,
    alignItems: 'flex-end',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  headerKindPill: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: androidTheme.colors.warm,
  },
  headerUnreadBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  headerUnreadBadgeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: androidTheme.colors.textInverse,
  },
  connectionPillSuccess: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: androidTheme.colors.successSoft,
  },
  connectionPillWarning: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: androidTheme.colors.warningSoft,
  },
  connectionLive: {
    fontSize: 11,
    fontWeight: '700',
    color: androidTheme.colors.success,
  },
  connectionOffline: {
    fontSize: 11,
    fontWeight: '700',
    color: androidTheme.colors.warning,
  },
  error: {
    marginHorizontal: 18,
    marginTop: 10,
    color: androidTheme.colors.danger,
    backgroundColor: androidTheme.colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  pinnedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinnedAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: androidTheme.colors.blueStrong,
  },
  pinnedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pinnedLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  pinnedPreview: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  pinnedMeta: {
    fontSize: 11,
    color: androidTheme.colors.textMuted,
  },
  pinnedClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceAlt,
  },
  pinnedCloseLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  messageScroll: {
    flex: 1,
  },
  messageContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 24,
  },
  loadOlderButton: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  loadOlderDisabled: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  loadOlderLabel: {
    color: androidTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  ownBubble: {
    alignSelf: 'flex-end',
    maxWidth: '84%',
    backgroundColor: 'rgba(23, 33, 43, 0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 2,
    ...androidTheme.shadow,
  },
  peerBubble: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    backgroundColor: 'rgba(23, 33, 43, 0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 2,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  replyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.warm,
  },
  replySnippet: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  forwardedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.warm,
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
    color: androidTheme.colors.textPrimary,
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  messageMetaEdited: {
    fontSize: 11,
    color: 'rgba(238, 244, 251, 0.5)',
    fontStyle: 'italic',
  },
  messageStatusTick: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(238, 244, 251, 0.8)',
  },
  messageSenderOwn: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.blue,
  },
  messageAttachmentList: {
    gap: 8,
  },
  messageAttachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  messageAttachmentButtonDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  messageAttachmentCopy: {
    flex: 1,
    gap: 2,
  },
  messageAttachmentActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  messageAttachmentActionButton: {
    minWidth: 72,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  messageAttachmentActionButtonDisabled: {
    minWidth: 72,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  messageAttachmentName: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  messageAttachmentMeta: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  messageAttachmentAction: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.blue,
  },
  imagePreviewOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: androidTheme.colors.overlay,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    borderRadius: androidTheme.radius.card,
    backgroundColor: androidTheme.colors.surface,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  imagePreviewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  imagePreviewImage: {
    width: '100%',
    height: 320,
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  imagePreviewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  imagePreviewActionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  imagePreviewActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  imagePreviewCloseButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: androidTheme.colors.blueStrong,
  },
  imagePreviewCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textInverse,
  },
  messageMeta: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
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
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  reactionButtonActive: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: androidTheme.colors.orangeStrong,
  },
  reactionButtonDisabled: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  reactionButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  reactionButtonLabelActive: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textInverse,
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
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  messageActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  selectionCount: {
    fontSize: 17,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
    marginLeft: 4,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageRowSelected: {
    backgroundColor: 'rgba(100, 160, 255, 0.1)',
  },
  selectionCircleWrap: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: androidTheme.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCircleActive: {
    borderColor: androidTheme.colors.blue,
    backgroundColor: androidTheme.colors.blue,
  },
  selectionCheck: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  confirmBody: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
    lineHeight: 20,
  },
  confirmCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  confirmCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: androidTheme.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCheckboxActive: {
    backgroundColor: androidTheme.colors.blue,
    borderColor: androidTheme.colors.blue,
  },
  confirmCheckmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  confirmCheckLabel: {
    fontSize: 14,
    color: androidTheme.colors.textPrimary,
    flex: 1,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    marginTop: 4,
  },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  confirmCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.blue,
  },
  confirmDelete: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  confirmDeleteLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.danger,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  menuPopup: {
    width: '100%',
    gap: 6,
  },
  menuReactionsPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuReactionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuReactionBtnActive: {
    backgroundColor: androidTheme.colors.orangeStrong,
  },
  menuReactionEmoji: {
    fontSize: 24,
  },
  menuCard: {
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: androidTheme.colors.border,
    marginLeft: 48,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItemIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
    color: androidTheme.colors.textPrimary,
  },
  menuItemLabel: {
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
  },
  menuItemDanger: {},
  menuItemIconDanger: {
    color: androidTheme.colors.danger,
  },
  menuItemLabelDanger: {
    color: androidTheme.colors.danger,
  },
  failureCard: {
    marginTop: 4,
    backgroundColor: androidTheme.colors.dangerSoft,
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  failureText: {
    fontSize: 13,
    lineHeight: 18,
    color: androidTheme.colors.danger,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: androidTheme.colors.orangeStrong,
  },
  retryButtonLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: androidTheme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  emptyLabel: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  composer: {
    backgroundColor: 'rgba(18, 29, 40, 0.94)',
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 12,
  },
  typingIndicator: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  typingIndicatorLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.warm,
  },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
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
    color: androidTheme.colors.warm,
  },
  composerContextTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  composerContextPreview: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  composerContextClose: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: androidTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  composerContextCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  forwardContext: {
    gap: 10,
  },
  forwardTargetList: {
    gap: 10,
    paddingRight: 4,
  },
  forwardTargetButton: {
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    gap: 4,
  },
  forwardTargetButtonActive: {
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.orangeStrong,
    gap: 4,
  },
  forwardTargetButtonDisabled: {
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  forwardTargetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  forwardTargetTitleActive: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textInverse,
  },
  forwardTargetMeta: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  forwardTargetMetaActive: {
    fontSize: 12,
    color: 'rgba(8, 21, 33, 0.72)',
  },
  composerAttachmentList: {
    gap: 8,
  },
  composerAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  composerAttachmentCopy: {
    flex: 1,
    gap: 2,
  },
  composerAttachmentName: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  composerAttachmentMeta: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  composerAttachmentRemove: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceAlt,
  },
  composerAttachmentRemoveLabel: {
    fontSize: 18,
    lineHeight: 20,
    color: androidTheme.colors.textPrimary,
  },
  composerInputRow: {
    width: '100%',
  },
  composerDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  attachmentButton: {
    width: 42,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceAlt,
  },
  attachmentButtonDisabled: {
    width: 42,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  attachmentButtonLabel: {
    fontSize: 24,
    lineHeight: 26,
    color: androidTheme.colors.textPrimary,
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
    color: androidTheme.colors.textPrimary,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 54,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  sendButtonDisabled: {
    width: 54,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(95, 156, 255, 0.38)',
  },
  sendButtonLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  profileScreen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  profileTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
  },
  profileBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  profileBackLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  profileHero: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: androidTheme.colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
    gap: 8,
  },
  profileHeroName: {
    fontSize: 24,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  profileHeroStatus: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
    textAlign: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: androidTheme.colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
  },
  profileActionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: androidTheme.colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    maxWidth: 110,
  },
  profileActionBtnDanger: {
    backgroundColor: androidTheme.colors.dangerSoft,
  },
  profileActionIcon: {
    fontSize: 24,
  },
  profileActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: androidTheme.colors.textSecondary,
    textAlign: 'center',
  },
  profileActionLabelDanger: {
    color: androidTheme.colors.danger,
  },
  profileInfoCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileInfoRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 3,
  },
  profileInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: androidTheme.colors.textPrimary,
  },
  profileInfoLabel: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
  },
  profileInfoDivider: {
    height: 1,
    backgroundColor: androidTheme.colors.border,
    marginLeft: 18,
  },
});
