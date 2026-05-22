import {
  type QueryClient,
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import {
  ApiError,
  createDirectChat,
  deleteChatDraft,
  deleteChat as deleteChatRequest,
  deleteMessage as deleteMessageRequest,
  deleteMessages as deleteMessagesRequest,
  deletePendingOutgoingMessage,
  describeError,
  isAbortError,
  type UploadProgress as ApiUploadProgress,
  toggleMessageReaction as toggleMessageReactionRequest,
  uploadChatAttachment,
  upsertPendingOutgoingMessage,
  updatePinnedMessage as updatePinnedMessageRequest,
} from "../../../lib/api";
import {
  finishSendDiagnostic,
  recordSendDiagnosticStep,
  readSendDiagnosticRecord,
  startSendDiagnostic,
} from "../../../lib/sendDiagnostics";
import { buildNormalizedSendFailure } from "../../../lib/sendFailureDiagnostics";
import type {
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
  ChatSummary,
  PendingOutgoingMessage,
  MessageReaction,
  MessageSnippet,
  Participant,
  UserProfile,
} from "../../../lib/types";
import {
  buildMessagesQueryKey,
  mergeMessagePages,
  removeMessageByClientMessageId,
  removeMessageById,
  upsertChat,
  updateMessageByClientMessageId,
  updateMessageById,
  updateMessageReactionsPages,
} from "../chatState";
import type { ContextMenuState, ConversationListTab } from "../chatUi";
import {
  createOptimisticOutgoingMessage,
  ensureOwnMessageStatus,
  isOwnMessage,
  toMessageSnippet,
} from "../messagePresentation";

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const TRANSIENT_SEND_FAILURE_STATUSES = new Set([0, 502, 503, 504]);
const RETRYABLE_SEND_FAILURE_MESSAGES = new Set(["Message send is already pending"]);

export type AttachmentUploadProgress = ApiUploadProgress & {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  phase: "uploading";
};

export type SubmitDraftOptions = {
  signal?: AbortSignal;
  onAttachmentProgress?: (progress: AttachmentUploadProgress) => void;
};

type SendMessageInput = {
  chatId: string;
  clientMessageId: string;
  clearDraftOnMutate?: boolean;
  content: string;
  localOrder: number;
  participants: Participant[];
  replyTo?: MessageSnippet | null;
  attachments?: ChatMessageAttachment[];
};

type SendMessageMutationContext = {
  previousChats: ChatSummary[] | undefined;
};

type UseMessageActionsOptions = {
  activeChat: ChatSummary | null;
  activePinnedMessageIdSet: ReadonlySet<string>;
  chats: ChatSummary[];
  currentUser: UserProfile;
  session: AuthResponse;
  editingMessage: ChatMessage | null;
  forwardingMessages: ChatMessage[];
  replyingToMessage: ChatMessage | null;
  sessionToken: string;
  applyChatPreviewMessage: (message: ChatMessage) => void;
  applyServerChatPreviewMessage: (
    message: ChatMessage,
    unreadMode: "clear" | "keep",
  ) => void;
  clearComposerContext: (mode?: "all" | "reply" | "edit" | "forward") => void;
  clearDraftForChat: (chatId: string) => void;
  deleteChatLocally: (chatId: string) => void;
  focusComposer: () => void;
  incrementPendingOutgoing: (chatId: string) => void;
  decrementPendingOutgoing: (chatId: string) => void;
  isRealtimeConnected: boolean;
  onOpenChat: (chatId: string, preferredTab?: ConversationListTab) => void;
  onOpenForwardSheet: () => void;
  pendingOutgoingMessages: PendingOutgoingMessage[];
  refreshChatPreviewFromServer: (chatId: string) => Promise<unknown> | void;
  rememberRealtimeMessage: (messageId: string) => void;
  scheduleDraftSave: (chatId: string, value: string) => void;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setDraftsByChatId: Dispatch<SetStateAction<Record<string, string>>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setForwardingMessageIds: Dispatch<SetStateAction<string[]>>;
  setReplyingToMessageId: Dispatch<SetStateAction<string | null>>;
  stopTyping: (chatId: string) => void;
  removeChatPinnedMessage: (chatId: string, messageId: string) => void;
  syncChatPinnedMessage: (chatId: string, snippet: MessageSnippet) => void;
  syncChatPreviewFromCache: (chatId: string) => void;
};

export function useMessageActions({
  activeChat,
  activePinnedMessageIdSet,
  applyChatPreviewMessage,
  applyServerChatPreviewMessage,
  chats,
  clearComposerContext,
  clearDraftForChat,
  currentUser,
  session,
  deleteChatLocally,
  editingMessage,
  focusComposer,
  forwardingMessages,
  incrementPendingOutgoing,
  decrementPendingOutgoing,
  isRealtimeConnected,
  onOpenChat,
  onOpenForwardSheet,
  pendingOutgoingMessages,
  refreshChatPreviewFromServer,
  rememberRealtimeMessage,
  replyingToMessage,
  scheduleDraftSave,
  sessionToken,
  setContextMenu,
  setDraftsByChatId,
  setEditingMessageId,
  setForwardingMessageIds,
  setReplyingToMessageId,
  stopTyping,
  removeChatPinnedMessage,
  syncChatPinnedMessage,
  syncChatPreviewFromCache,
}: UseMessageActionsOptions) {
  const queryClient = useQueryClient();
  const nextLocalMessageOrderRef = useRef(0);
  const inFlightSendClientMessageIdsRef = useRef(new Set<string>());
  const discardedLocalClientMessageIdsRef = useRef(new Set<string>());
  const getMessagesKey = (chatId: string) => buildMessagesQueryKey(currentUser.id, chatId);
  const SEND_ATTEMPT_TIMEOUT_MS = 90_000;

  const sendMessageMutation = useMutation<
    ChatMessage,
    unknown,
    SendMessageInput,
    SendMessageMutationContext
  >({
    mutationFn: async (input: SendMessageInput) => {
      recordSendDiagnosticStep(input.clientMessageId, "mutationFn:start");
      const { sendPlainMessage } = await import("../../../lib/plainMessages");
      const targetChat = chats.find((chat) => chat.id === input.chatId) ?? activeChat;
      void upsertPendingOutgoingMessage(sessionToken, input.clientMessageId, {
        chatId: input.chatId,
        content: input.content,
        createdAt: new Date().toISOString(),
        localOrder: input.localOrder,
        recipientCount: Math.max(0, input.participants.length - 1),
        replyTo: input.replyTo ?? null,
        status: "SENDING",
        attachments: input.attachments ?? [],
      }).catch(() => undefined);
      if (input.clearDraftOnMutate) {
        void deleteChatDraft(sessionToken, input.chatId).catch(() => undefined);
      }
      void targetChat;
      void session;
      return withSendAttemptTimeout(sendPlainMessage(
        sessionToken,
        currentUser.id,
        input.chatId,
        input.content,
        input.participants,
        input.clientMessageId,
        input.replyTo?.id ?? null,
        {
          attachments: input.attachments ?? [],
        },
      ), SEND_ATTEMPT_TIMEOUT_MS);
    },
    onMutate: (input) => {
      incrementPendingOutgoing(input.chatId);
      recordSendDiagnosticStep(input.clientMessageId, "onMutate:start");
      void queryClient.cancelQueries({ queryKey: getMessagesKey(input.chatId) });
      const previousChats = queryClient.getQueryData<ChatSummary[]>(["chats", sessionToken]);
      const optimisticMessage = createOptimisticOutgoingMessage(currentUser, input);
      const nextPendingMessages = upsertPendingMessagesCache(queryClient, currentUser.id, {
        chatId: input.chatId,
        clientMessageId: input.clientMessageId,
        content: input.content,
        createdAt: optimisticMessage.createdAt,
        localOrder: input.localOrder,
        recipientCount: Math.max(0, input.participants.length - 1),
        replyTo: input.replyTo ?? null,
        status: "SENDING",
        attachments: input.attachments ?? [],
      });
      recordSendDiagnosticStep(input.clientMessageId, "onMutate:pendingPersisted", {
        pendingCount: nextPendingMessages.length,
      });
      applyServerChatPreviewMessage(optimisticMessage, "clear");
      if (input.clearDraftOnMutate) {
        setDraftsByChatId((current) => {
          const next = { ...current };
          delete next[input.chatId];
          return next;
        });
        recordSendDiagnosticStep(input.clientMessageId, "onMutate:draftCleared");
      }
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(input.chatId),
        (current) => mergeMessagePages(current, optimisticMessage),
      );
      recordSendDiagnosticStep(input.clientMessageId, "onMutate:end");
      return {
        previousChats,
      };
    },
    onSuccess: (message, input) => {
      if (discardedLocalClientMessageIdsRef.current.has(input.clientMessageId)) {
        removePendingMessagesFromCache(queryClient, currentUser.id, input.clientMessageId);
        return;
      }
      const nextMessage = ensureOwnMessageStatus(message, currentUser);
      removePendingMessagesFromCache(queryClient, currentUser.id, input.clientMessageId);
      rememberRealtimeMessage(nextMessage.id);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(input.chatId),
        (current) => mergeMessagePages(current, nextMessage),
      );
      applyChatPreviewMessage(nextMessage);
      applyServerChatPreviewMessage(nextMessage, "clear");
      if (input.replyTo) {
        clearComposerContext("reply");
      }
      finishSendDiagnostic(input.clientMessageId, "SUCCESS", {
        messageId: nextMessage.id,
        serverOrder: nextMessage.serverOrder ?? null,
        finalState: nextMessage.status?.state ?? null,
      });
    },
    onError: (error, input, context) => {
      if (discardedLocalClientMessageIdsRef.current.has(input.clientMessageId)) {
        removePendingMessagesFromCache(queryClient, currentUser.id, input.clientMessageId);
        queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
          getMessagesKey(input.chatId),
          (current) => removeMessageByClientMessageId(current, input.clientMessageId),
        );
        return;
      }
      const transientFailure = isTransientSendFailure(error);
      const normalizedFailure = buildNormalizedSendFailure(
        error,
        readSendDiagnosticRecord(input.clientMessageId),
        transientFailure
      );
      recordSendDiagnosticStep(input.clientMessageId, "onError", {
        transientFailure,
        message: describeError(error),
        status: error instanceof ApiError ? error.status : null,
        failureCode: normalizedFailure.code,
        failureCategory: normalizedFailure.category,
        transport: normalizedFailure.transport,
        stage: normalizedFailure.stage,
        details: error instanceof ApiError ? error.details : [],
      });
      const nextPendingStatus = "FAILED";
      upsertPendingMessagesCache(queryClient, currentUser.id, {
        chatId: input.chatId,
        clientMessageId: input.clientMessageId,
        content: input.content,
        createdAt: new Date().toISOString(),
        localOrder: input.localOrder,
        recipientCount: Math.max(0, input.participants.length - 1),
        replyTo: input.replyTo ?? null,
        status: nextPendingStatus,
        attachments: input.attachments ?? [],
      });
      void upsertPendingOutgoingMessage(sessionToken, input.clientMessageId, {
        chatId: input.chatId,
        content: input.content,
        createdAt: new Date().toISOString(),
        localOrder: input.localOrder,
        recipientCount: Math.max(0, input.participants.length - 1),
        replyTo: input.replyTo ?? null,
        status: nextPendingStatus,
        attachments: input.attachments ?? [],
      }).catch(() => undefined);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(input.chatId),
        (current) =>
          updateMessageByClientMessageId(current, input.clientMessageId, (message) => ({
            ...(message.serverOrder != null || message.id !== input.clientMessageId
              ? message
              : {
                  ...message,
                  status: {
                    ...(message.status ?? {
                      recipientCount: Math.max(0, input.participants.length - 1),
                      deliveredCount: 0,
                      readCount: 0,
                    }),
                    state: "FAILED",
                  },
                }),
          })),
      );
      if (context?.previousChats) {
        queryClient.setQueryData(["chats", sessionToken], context.previousChats);
      }
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
      finishSendDiagnostic(input.clientMessageId, "ERROR", {
        ...normalizedFailure,
        transientFailure,
        describedMessage: describeError(error),
        pendingStatus: nextPendingStatus,
      });
    },
    onSettled: (_result, _error, input) => {
      inFlightSendClientMessageIdsRef.current.delete(input.clientMessageId);
      decrementPendingOutgoing(input.chatId);
    },
  });

  const sendOutgoingMessage = (input: SendMessageInput) => {
    if (inFlightSendClientMessageIdsRef.current.has(input.clientMessageId)) {
      return false;
    }

    startSendDiagnostic({
      clientMessageId: input.clientMessageId,
      chatId: input.chatId,
      contentLength: input.content.length,
      attachmentCount: input.attachments?.length ?? 0,
      participantCount: input.participants.length,
    });
    recordSendDiagnosticStep(input.clientMessageId, "sendOutgoingMessage:accepted");
    inFlightSendClientMessageIdsRef.current.add(input.clientMessageId);
    sendMessageMutation.mutate(input);
    return true;
  };

  useEffect(() => {
    if (pendingOutgoingMessages.length === 0) {
      return;
    }

    const staleSendingMessages = pendingOutgoingMessages.filter(
      (message) =>
        message.status === "SENDING" &&
        !inFlightSendClientMessageIdsRef.current.has(message.clientMessageId)
    );
    if (staleSendingMessages.length === 0) {
      return;
    }

    staleSendingMessages.forEach((message) => {
      upsertPendingMessagesCache(queryClient, currentUser.id, {
        ...message,
        status: "FAILED",
      });
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(message.chatId),
        (current) =>
          updateMessageByClientMessageId(current, message.clientMessageId, (chatMessage) => ({
            ...(chatMessage.serverOrder != null || chatMessage.id !== message.clientMessageId
              ? chatMessage
              : {
                  ...chatMessage,
                  status: {
                    ...(chatMessage.status ?? {
                      recipientCount: message.recipientCount,
                      deliveredCount: 0,
                      readCount: 0,
                    }),
                    state: "FAILED",
                  },
                }),
          })),
      );
      void upsertPendingOutgoingMessage(sessionToken, message.clientMessageId, {
        chatId: message.chatId,
        content: message.content,
        createdAt: message.createdAt,
        localOrder: message.localOrder,
        recipientCount: message.recipientCount,
        replyTo: message.replyTo ?? null,
        status: "FAILED",
        attachments: message.attachments ?? [],
      }).catch(() => undefined);
    });
  }, [currentUser.id, pendingOutgoingMessages, queryClient, sessionToken]);

  const wasRealtimeConnectedRef = useRef(isRealtimeConnected);
  // Track which client IDs have been auto-retried to avoid loops on permanent failures
  const autoRetriedClientMessageIdsRef = useRef(new Set<string>());
  useEffect(() => {
    wasRealtimeConnectedRef.current = isRealtimeConnected;
    if (!isRealtimeConnected) {
      autoRetriedClientMessageIdsRef.current.clear();
      return;
    }
    const failedMessages = pendingOutgoingMessages.filter(
      (message) => message.status === "FAILED"
    );
    failedMessages.forEach((message) => {
      if (autoRetriedClientMessageIdsRef.current.has(message.clientMessageId)) {
        return;
      }
      const chat = chats.find((c) => c.id === message.chatId);
      if (!chat) {
        return;
      }
      autoRetriedClientMessageIdsRef.current.add(message.clientMessageId);
      sendOutgoingMessage({
        chatId: message.chatId,
        clientMessageId: message.clientMessageId,
        content: message.content,
        localOrder: message.localOrder ?? 0,
        participants: chat.members,
        replyTo: message.replyTo ?? null,
        attachments: message.attachments ?? [],
      });
    });
  }, [isRealtimeConnected, pendingOutgoingMessages]);

  const deleteChatMutation = useMutation({
    mutationFn: (chatId: string) => deleteChatRequest(sessionToken, chatId),
    onMutate: async (chatId) => {
      const chatsKey = ["chats", sessionToken] as const;
      const archivedKey = ["archived-chats", sessionToken] as const;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: chatsKey }),
        queryClient.cancelQueries({ queryKey: archivedKey }),
      ]);

      const previousChats = queryClient.getQueryData<ChatSummary[]>(chatsKey);
      const previousArchived = queryClient.getQueryData<string[]>(archivedKey);
      deleteChatLocally(chatId);
      return {
        chatId,
        previousChats,
        previousArchived,
      };
    },
    onError: (_error, _chatId, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(["chats", sessionToken], context.previousChats);
      }
      if (context?.previousArchived) {
        queryClient.setQueryData(["archived-chats", sessionToken], context.previousArchived);
      }
      void queryClient.invalidateQueries({ queryKey: ["drafts", sessionToken] });
    },
    onSuccess: (_result, chatId) => {
      clearDraftForChat(chatId);
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
      void queryClient.invalidateQueries({ queryKey: ["archived-chats", sessionToken] });
      void queryClient.invalidateQueries({ queryKey: ["drafts", sessionToken] });
    },
  });

  const applyDeletedMessagesLocally = (chatId: string, messageIds: string[]) => {
    const uniqueMessageIds = [...new Set(messageIds)];
    if (uniqueMessageIds.length === 0) {
      return;
    }

    const deletedMessageIdSet = new Set(uniqueMessageIds);
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(getMessagesKey(chatId), (current) =>
      uniqueMessageIds.reduce(
        (pages, deletedMessageId) => removeMessageById(pages, deletedMessageId),
        current,
      ),
    );
    deletedMessageIdSet.forEach((deletedMessageId) => {
      if (activePinnedMessageIdSet.has(deletedMessageId)) {
        removeChatPinnedMessage(chatId, deletedMessageId);
      }
    });
    if (replyingToMessage && deletedMessageIdSet.has(replyingToMessage.id)) {
      setReplyingToMessageId(null);
    }
    if (editingMessage && deletedMessageIdSet.has(editingMessage.id)) {
      setEditingMessageId(null);
    }
    if (forwardingMessages.some((message) => deletedMessageIdSet.has(message.id))) {
      setForwardingMessageIds((current) =>
        current.filter((forwardingMessageId) => !deletedMessageIdSet.has(forwardingMessageId)),
      );
    }
    syncChatPreviewFromCache(chatId);
  };

  const deleteMessageMutation = useMutation({
    mutationFn: ({
      chatId,
      messageId,
      scope,
    }: {
      chatId: string;
      messageId: string;
      scope: "SELF" | "EVERYONE";
    }) => deleteMessageRequest(sessionToken, chatId, messageId, scope),
    onMutate: async ({ chatId, messageId }) => {
      const messageKey = getMessagesKey(chatId);
      await queryClient.cancelQueries({ queryKey: messageKey });
      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(messageKey);
      applyDeletedMessagesLocally(chatId, [messageId]);
      return {
        chatId,
        previousMessages,
      };
    },
    onError: (_error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(getMessagesKey(variables.chatId), context.previousMessages);
      }
      void queryClient.invalidateQueries({ queryKey: getMessagesKey(variables.chatId) });
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    },
    onSuccess: (_result, variables) => {
      syncChatPreviewFromCache(variables.chatId);
      void refreshChatPreviewFromServer(variables.chatId);
    },
  });

  const deleteMessagesMutation = useMutation({
    mutationFn: ({
      chatId,
      messageIds,
      scope,
    }: {
      chatId: string;
      messageIds: string[];
      scope: "SELF" | "EVERYONE";
    }) => deleteMessagesRequest(sessionToken, chatId, messageIds, scope),
    onMutate: async ({ chatId, messageIds }) => {
      const messageKey = getMessagesKey(chatId);
      await queryClient.cancelQueries({ queryKey: messageKey });
      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(messageKey);
      applyDeletedMessagesLocally(chatId, messageIds);
      return {
        chatId,
        previousMessages,
      };
    },
    onError: (_error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(getMessagesKey(variables.chatId), context.previousMessages);
      }
      void queryClient.invalidateQueries({ queryKey: getMessagesKey(variables.chatId) });
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
    },
    onSuccess: (_result, variables) => {
      syncChatPreviewFromCache(variables.chatId);
      void refreshChatPreviewFromServer(variables.chatId);
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({
      chatId,
      messageId,
      content,
      attachments,
    }: {
      chatId: string;
      messageId: string;
      content: string;
      attachments?: ChatMessageAttachment[];
    }) => {
      const { updatePlainMessage } = await import("../../../lib/plainMessages");
      return updatePlainMessage(
        sessionToken,
        currentUser.id,
        chatId,
        messageId,
        content,
        {
          attachments: attachments ?? [],
        }
      );
    },
    onSuccess: (message, variables) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(variables.chatId),
        (current) => updateMessageById(current, variables.messageId, () => message),
      );
      if (activePinnedMessageIdSet.has(message.id)) {
        syncChatPinnedMessage(variables.chatId, toMessageSnippet(message));
      }
      syncChatPreviewFromCache(variables.chatId);
      clearComposerContext("edit");
      setDraftsByChatId((current) => ({
        ...current,
        [variables.chatId]: "",
      }));
      scheduleDraftSave(variables.chatId, "");
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string | null }) =>
      updatePinnedMessageRequest(sessionToken, chatId, messageId),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
        upsertChat(current, chat),
      );
    },
  });

  const forwardMessageMutation = useMutation({
    mutationFn: async ({
      messages,
      targetChatId,
      targetUsername,
    }: {
      messages: ChatMessage[];
      targetChatId?: string;
      targetUsername?: string;
    }) => {
      const { sendPlainMessage } = await import("../../../lib/plainMessages");
      let targetChat = targetChatId ? chats.find((chat) => chat.id === targetChatId) ?? null : null;
      if (!targetChat) {
        if (!targetUsername) {
          throw new ApiError("Forward target is required", 400);
        }
        targetChat = await createDirectChat(sessionToken, targetUsername);
      }

      const sentMessages: ChatMessage[] = [];
      for (const message of messages) {
        const sentMessage = await sendPlainMessage(
          sessionToken,
          currentUser.id,
          targetChat.id,
          message.content,
          targetChat.members,
          crypto.randomUUID(),
          null,
          {
            forwardedFromMessageId: message.id,
          }
        );
        sentMessages.push(sentMessage);
      }

      return { sentMessages, targetChat };
    },
    onSuccess: ({ sentMessages, targetChat }, variables) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
        upsertChat(current, targetChat),
      );
      variables.messages.forEach((message) => {
        queryClient.setQueryData<InfiniteData<ChatMessage[]>>(getMessagesKey(message.chatId), (current) =>
          updateMessageById(current, message.id, (currentMessage) => ({
            ...currentMessage,
            forwarded: true,
          })),
        );
      });
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(getMessagesKey(targetChat.id), (current) =>
        sentMessages.reduce(
          (pages, sentMessage) =>
            mergeMessagePages(pages, ensureOwnMessageStatus(sentMessage, currentUser)),
          current,
        ),
      );
      const latestSentMessage = sentMessages[sentMessages.length - 1] ?? null;
      if (latestSentMessage) {
        applyChatPreviewMessage(latestSentMessage);
        applyServerChatPreviewMessage(latestSentMessage, "clear");
      }
      clearComposerContext("forward");
      onOpenChat(targetChat.id, "chats");
    },
  });

  const toggleMessageReactionMutation = useMutation({
    mutationFn: ({
      chatId,
      messageId,
      key,
    }: {
      chatId: string;
      messageId: string;
      key: MessageReaction["key"];
    }) => toggleMessageReactionRequest(sessionToken, chatId, messageId, key),
    onSuccess: (event) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(event.chatId),
        (current) => updateMessageReactionsPages(current, event),
      );
    },
  });

  const deleteChatForSelf = (chatId: string) => {
    setContextMenu(null);
    const chat = chats.find((item) => item.id === chatId);
    const title = chat?.title ?? "\u044d\u0442\u043e\u0442 \u0447\u0430\u0442";
    if (!window.confirm(`\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0447\u0430\u0442 "${title}" \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0432\u0430\u0441?`)) {
      return;
    }

    deleteChatMutation.mutate(chatId);
  };

  const deleteMessageForEveryoneInternal = async (
    chatId: string,
    messageId: string,
    skipConfirm = false,
  ) => {
    setContextMenu(null);
    if (
      !skipConfirm &&
      !window.confirm(
        "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u0447\u0430\u0442\u0430?"
      )
    ) {
      return false;
    }

    await deleteMessageMutation.mutateAsync({ chatId, messageId, scope: "EVERYONE" });
    return true;
  };

  const deleteMessageForSelfInternal = async (
    chatId: string,
    messageId: string,
    skipConfirm = false,
  ) => {
    setContextMenu(null);
    const pendingMessages =
      queryClient.getQueryData<PendingOutgoingMessage[]>(["pending-outgoing-messages", currentUser.id]) ??
      pendingOutgoingMessages;
    const pendingMessage = pendingMessages.find((message) => message.clientMessageId === messageId);
    if (pendingMessage) {
      if (
        !skipConfirm &&
        !window.confirm(
          "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0435\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0432\u0430\u0441?"
        )
      ) {
        return false;
      }

      discardedLocalClientMessageIdsRef.current.add(messageId);
      removePendingMessagesFromCache(queryClient, currentUser.id, messageId);
      void deletePendingOutgoingMessage(sessionToken, messageId).catch(() => undefined);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(chatId),
        (current) => removeMessageByClientMessageId(current, messageId),
      );
      syncChatPreviewFromCache(chatId);
      return true;
    }

    if (
      !skipConfirm &&
      !window.confirm(
        "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0432\u0430\u0441?"
      )
    ) {
      return false;
    }

    await deleteMessageMutation.mutateAsync({ chatId, messageId, scope: "SELF" });
    return true;
  };

  const deleteMessageForEveryone = (chatId: string, messageId: string) => {
    if (
      !window.confirm(
        "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u0447\u0430\u0442\u0430?"
      )
    ) {
      return;
    }
    void deleteMessageForEveryoneInternal(chatId, messageId, true);
  };

  const deleteMessageForSelf = (chatId: string, messageId: string) => {
    const localPendingMessages =
      queryClient.getQueryData<PendingOutgoingMessage[]>(["pending-outgoing-messages", currentUser.id]) ??
      pendingOutgoingMessages;
    const localPendingMessage = localPendingMessages.find(
      (message) => message.clientMessageId === messageId
    );
    const confirmationText = localPendingMessage
      ? "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0435\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0432\u0430\u0441?"
      : "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0443 \u0432\u0430\u0441?";
    if (!window.confirm(confirmationText)) {
      return;
    }
    void deleteMessageForSelfInternal(chatId, messageId, true);
  };

  const deleteMessagesForEveryone = async (chatId: string, messageIds: string[]) => {
    const uniqueMessageIds = [...new Set(messageIds)];
    if (uniqueMessageIds.length === 0) {
      return;
    }

    setContextMenu(null);
    await deleteMessagesMutation.mutateAsync({
      chatId,
      messageIds: uniqueMessageIds,
      scope: "EVERYONE",
    });
  };

  const deleteMessagesForSelf = async (chatId: string, messageIds: string[]) => {
    const uniqueMessageIds = [...new Set(messageIds)];
    if (uniqueMessageIds.length === 0) {
      return;
    }

    setContextMenu(null);
    const pendingMessages =
      queryClient.getQueryData<PendingOutgoingMessage[]>(["pending-outgoing-messages", currentUser.id]) ??
      pendingOutgoingMessages;
    const pendingMessageIdSet = new Set(
      pendingMessages.map((pendingMessage) => pendingMessage.clientMessageId),
    );
    const localPendingMessageIds = uniqueMessageIds.filter((messageId) =>
      pendingMessageIdSet.has(messageId),
    );
    const persistedMessageIds = uniqueMessageIds.filter(
      (messageId) => !pendingMessageIdSet.has(messageId),
    );

    for (const pendingMessageId of localPendingMessageIds) {
      await deleteMessageForSelfInternal(chatId, pendingMessageId, true);
    }

    if (persistedMessageIds.length === 0) {
      return;
    }

    await deleteMessagesMutation.mutateAsync({
      chatId,
      messageIds: persistedMessageIds,
      scope: "SELF",
    });
  };

  const toggleReactionForMessage = (
    chatId: string,
    messageId: string,
    key: MessageReaction["key"],
  ) => {
    toggleMessageReactionMutation.mutate({ chatId, messageId, key });
  };

  const toggleReactionFromContextMenu = (
    chatId: string,
    messageId: string,
    key: MessageReaction["key"],
  ) => {
    setContextMenu(null);
    toggleMessageReactionMutation.mutate({ chatId, messageId, key });
  };

  const replyToMessage = (message: ChatMessage) => {
    setContextMenu(null);
    setEditingMessageId(null);
    setReplyingToMessageId(message.id);
    focusComposer();
  };

  const editMessageAction = (message: ChatMessage) => {
    setContextMenu(null);
    setReplyingToMessageId(null);
    setEditingMessageId(message.id);
    setDraftsByChatId((current) => ({
      ...current,
      [message.chatId]: message.content,
    }));
    scheduleDraftSave(message.chatId, message.content);
    focusComposer();
  };

  const forwardMessageAction = (message: ChatMessage) => {
    setContextMenu(null);
    setForwardingMessageIds([message.id]);
    onOpenForwardSheet();
  };

  const forwardMessagesAction = (messages: ChatMessage[]) => {
    if (messages.length === 0) {
      return;
    }

    setContextMenu(null);
    setForwardingMessageIds(messages.map((message) => message.id));
    onOpenForwardSheet();
  };

  const togglePinnedMessageAction = (message: ChatMessage) => {
    setContextMenu(null);
    pinMessageMutation.mutate({
      chatId: message.chatId,
      messageId: message.id,
    });
  };

  const copyMessageText = (message: ChatMessage) => {
    setContextMenu(null);
    void navigator.clipboard.writeText(message.content).catch(() => {
      window.alert("\u041d\u0435 \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f.");
    });
  };

  const forwardMessageToChat = (chatId: string) => {
    if (forwardingMessages.length === 0) {
      return;
    }

    forwardMessageMutation.mutate({
      messages: forwardingMessages,
      targetChatId: chatId,
    });
  };

  const forwardMessageToContact = (username: string) => {
    if (forwardingMessages.length === 0) {
      return;
    }

    forwardMessageMutation.mutate({
      messages: forwardingMessages,
      targetUsername: username,
    });
  };

  const submitActiveDraft = async (
    draft: string,
    files: File[] = [],
    options: SubmitDraftOptions = {}
  ) => {
    const trimmed = draft.trim();
    if ((!trimmed && files.length === 0) || !activeChat) {
      return false;
    }

    stopTyping(activeChat.id);
    if (editingMessage) {
      editMessageMutation.mutate({
        chatId: activeChat.id,
        messageId: editingMessage.id,
        content: trimmed,
        attachments: editingMessage.attachments ?? [],
      });
      return true;
    }

    let attachments: ChatMessageAttachment[] = [];
    if (files.length > 0) {
      const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
      if (oversizedFile) {
        window.alert(
          `\u0424\u0430\u0439\u043b "${oversizedFile.name}" \u0431\u043e\u043b\u044c\u0448\u0435 25 MB. \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u043c\u0435\u043d\u044c\u0448\u0435\u0433\u043e \u0440\u0430\u0437\u043c\u0435\u0440\u0430.`
        );
        return false;
      }

      try {
        attachments = await Promise.all(
          files.map(async (file, fileIndex) => {
            const upload = await uploadChatAttachment(
              sessionToken,
              activeChat.id,
              file,
              file.name,
              {
                signal: options.signal,
                onProgress: (progress) =>
                  options.onAttachmentProgress?.({
                    ...progress,
                    fileIndex,
                    fileCount: files.length,
                    fileName: file.name,
                    phase: "uploading",
                  }),
              }
            );
            return {
              id: upload.id,
              fileName: upload.fileName,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
            } satisfies ChatMessageAttachment;
          })
        );
      } catch (error) {
        if (isAbortError(error)) {
          return false;
        }
        window.alert(describeError(error));
        return false;
      }
      if (options.signal?.aborted) {
        return false;
      }
    }
    const content = trimmed;

    return sendOutgoingMessage({
      chatId: activeChat.id,
      clientMessageId: `client-${window.crypto.randomUUID()}`,
      clearDraftOnMutate: true,
      content,
      localOrder: ++nextLocalMessageOrderRef.current,
      participants: activeChat.members,
      replyTo: replyingToMessage ? toMessageSnippet(replyingToMessage) : null,
      attachments,
    });
  };

  const retryFailedMessage = (message: ChatMessage) => {
    if (!activeChat || !message.clientMessageId || message.sender.id !== currentUser.id) {
      return;
    }

    sendOutgoingMessage({
      chatId: activeChat.id,
      clientMessageId: message.clientMessageId,
      content: message.content,
      localOrder: message.localOrder ?? ++nextLocalMessageOrderRef.current,
      participants: activeChat.members,
      replyTo: message.replyTo,
      attachments: message.attachments ?? [],
    });
  };

  return {
    deleteChatMutation,
    deleteChatForSelf,
    deleteMessageForEveryone,
    deleteMessagesForEveryone,
    deleteMessageForSelf,
    deleteMessagesForSelf,
    deleteMessageMutation,
    editMessageAction,
    editMessageMutation,
    forwardMessageAction,
    forwardMessagesAction,
    forwardMessageMutation,
    forwardMessageToChat,
    forwardMessageToContact,
    pinMessageMutation,
    replyToMessage,
    retryFailedMessage,
    sendMessageMutation,
    submitActiveDraft,
    toggleMessageReactionMutation,
    togglePinnedMessageAction,
    toggleReactionForMessage,
    toggleReactionFromContextMenu,
    copyMessageText,
  };
}

function upsertPendingMessagesCache(
  queryClient: QueryClient,
  userId: string,
  message: Omit<PendingOutgoingMessage, "updatedAt"> &
    Partial<Pick<PendingOutgoingMessage, "updatedAt">>
) {
  const queryKey = ["pending-outgoing-messages", userId] as const;
  const current =
    queryClient.getQueryData<PendingOutgoingMessage[]>(queryKey) ?? [];
  const currentByClientMessageId = new Map(
    current.map((pendingMessage) => [pendingMessage.clientMessageId, pendingMessage] as const)
  );
  const existingMessage = currentByClientMessageId.get(message.clientMessageId);
  currentByClientMessageId.set(message.clientMessageId, {
    ...existingMessage,
    ...message,
    createdAt: existingMessage?.createdAt ?? message.createdAt,
    localOrder: message.localOrder ?? existingMessage?.localOrder ?? null,
    attachments: message.attachments ?? existingMessage?.attachments ?? [],
    updatedAt: new Date().toISOString(),
  });
  const nextPendingMessages = [...currentByClientMessageId.values()].sort((left, right) => {
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }
    if (left.localOrder !== right.localOrder) {
      return (left.localOrder ?? 0) - (right.localOrder ?? 0);
    }
    return left.clientMessageId.localeCompare(right.clientMessageId);
  });
  queryClient.setQueryData(queryKey, nextPendingMessages);
  return nextPendingMessages;
}

function removePendingMessagesFromCache(
  queryClient: QueryClient,
  userId: string,
  clientMessageId: string
) {
  const queryKey = ["pending-outgoing-messages", userId] as const;
  const current =
    queryClient.getQueryData<PendingOutgoingMessage[]>(queryKey) ?? [];
  const nextPendingMessages = current.filter(
    (message) => message.clientMessageId !== clientMessageId
  );
  queryClient.setQueryData(queryKey, nextPendingMessages);
  return nextPendingMessages;
}

function isTransientSendFailure(error: unknown) {
  return (
    (error instanceof ApiError &&
      TRANSIENT_SEND_FAILURE_STATUSES.has(error.status)) ||
    (error instanceof ApiError &&
      error.status === 409 &&
      RETRYABLE_SEND_FAILURE_MESSAGES.has(error.message))
  );
}

function withSendAttemptTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeoutId: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new ApiError("Message send preparation timed out. Retry the same message.", 504));
    }, timeoutMs);
  });

  operation.catch(() => undefined);

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  });
}
