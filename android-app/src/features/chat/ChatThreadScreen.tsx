import type {
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
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
  errorCodes as documentPickerErrorCodes,
  isErrorWithCode as isDocumentPickerErrorWithCode,
  keepLocalCopy,
  pick,
  types as documentPickerTypes,
} from '@react-native-documents/picker';
import {
  Image,
  Linking,
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
  downloadChatAttachment,
  describeError,
  getChatOpen,
  getMessagesPage,
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
  runAuthorized: RunAuthorized;
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
  onChatSummaryChange: (chat: ChatSummary) => void;
  onChatRead: (chatId: string) => void;
  onPersistPendingOutgoingMessage: (
    message: PendingOutgoingMessage,
  ) => Promise<PendingOutgoingMessage>;
  onDeletePendingOutgoingMessages: (clientMessageIds: string[]) => Promise<void>;
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

export function ChatThreadScreen({
  session,
  chatId,
  initialChat,
  availableChats,
  pendingOutgoingMessages,
  realtimeConnected,
  realtimeMessage,
  realtimeReaction,
  realtimeTyping,
  runAuthorized,
  onBack,
  onOpenChat,
  onChatSummaryChange,
  onChatRead,
  onPersistPendingOutgoingMessage,
  onDeletePendingOutgoingMessages,
}: Props) {
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
  const [pendingReactionKeys, setPendingReactionKeys] = useState<
    Record<string, boolean>
  >({});
  const [typingParticipants, setTypingParticipants] = useState<Participant[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
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

  useEffect(() => {
    recoveredPendingMessagesRef.current = recoveredPendingMessages;
  }, [recoveredPendingMessages]);

  useEffect(() => {
    initialChatRef.current = initialChat;
  }, [initialChat]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    reactionOverridesRef.current = new Map();
    clearAllTypingParticipantTimeouts();
    clearTypingIdleTimeout();
    typingSignalRef.current.active = false;
    typingSignalRef.current.lastSentAt = 0;
    setChat(initialChatRef.current);
    replaceMessages([]);
    setMessageErrors({});
    setOpeningAttachmentKeys({});
    setSharingAttachmentKeys({});
    setImagePreview(null);
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
        <View style={styles.headerSpacer} />
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
            const canForward = canForwardMessage(message);
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
                {forwardedLabel ? (
                  <Text style={styles.forwardedLabel}>{forwardedLabel}</Text>
                ) : null}
                <Text style={styles.messageBody}>
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
                  canEditMessage(message, session.user.id) ||
                  canForward) && (
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
                    {canForward ? (
                      <Pressable
                        onPress={() => handleForwardMessage(message)}
                        style={styles.messageActionButton}
                        testID={`forward-action-${message.id}`}>
                        <Text style={styles.messageActionLabel}>Forward</Text>
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
            placeholder={
              editingMessage
                ? 'Edit your message'
                : replyingToMessage
                  ? 'Write a reply'
                  : 'Write a message'
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
  headerSpacer: {
    minWidth: 74,
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
  forwardedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a5a2b',
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f1a14',
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
    backgroundColor: '#efe4d3',
  },
  messageAttachmentButtonDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#d3c8ba',
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
    backgroundColor: '#fffaf1',
  },
  messageAttachmentActionButtonDisabled: {
    minWidth: 72,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe8de',
  },
  messageAttachmentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1a14',
  },
  messageAttachmentMeta: {
    fontSize: 12,
    color: '#6f6256',
  },
  messageAttachmentAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c5c53',
  },
  imagePreviewOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(21, 18, 15, 0.86)',
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    borderRadius: 24,
    backgroundColor: '#fffaf1',
    padding: 18,
    gap: 14,
  },
  imagePreviewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f1a14',
  },
  imagePreviewImage: {
    width: '100%',
    height: 320,
    borderRadius: 18,
    backgroundColor: '#efe4d3',
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
    backgroundColor: '#efe4d3',
  },
  imagePreviewActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c5c53',
  },
  imagePreviewCloseButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#2c5c53',
  },
  imagePreviewCloseLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fffaf1',
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
    backgroundColor: '#efe4d3',
    gap: 4,
  },
  forwardTargetButtonActive: {
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#2c5c53',
    gap: 4,
  },
  forwardTargetButtonDisabled: {
    minWidth: 132,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#d3c8ba',
    gap: 4,
  },
  forwardTargetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1a14',
  },
  forwardTargetTitleActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fffaf1',
  },
  forwardTargetMeta: {
    fontSize: 12,
    color: '#6f6256',
  },
  forwardTargetMetaActive: {
    fontSize: 12,
    color: '#d6ebe6',
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
    backgroundColor: '#efe4d3',
  },
  composerAttachmentCopy: {
    flex: 1,
    gap: 2,
  },
  composerAttachmentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1a14',
  },
  composerAttachmentMeta: {
    fontSize: 12,
    color: '#6f6256',
  },
  composerAttachmentRemove: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffaf1',
  },
  composerAttachmentRemoveLabel: {
    fontSize: 18,
    lineHeight: 20,
    color: '#5b4b3c',
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  attachmentButton: {
    width: 42,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
  },
  attachmentButtonDisabled: {
    width: 42,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d3c8ba',
  },
  attachmentButtonLabel: {
    fontSize: 24,
    lineHeight: 26,
    color: '#5b4b3c',
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9ccb8',
    backgroundColor: '#fdf7ed',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
    color: '#1f1a14',
    textAlignVertical: 'top',
  },
  sendButton: {
    minWidth: 64,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
  },
  sendButtonDisabled: {
    minWidth: 64,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9aa8a3',
  },
  sendButtonLabel: {
    color: '#fffaf1',
    fontSize: 14,
    fontWeight: '800',
  },
});
