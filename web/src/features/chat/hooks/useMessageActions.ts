import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import {
  ApiError,
  createDirectChat,
  deleteChat as deleteChatRequest,
  deleteMessage as deleteMessageRequest,
  describeError,
  toggleMessageReaction as toggleMessageReactionRequest,
  updatePinnedMessage as updatePinnedMessageRequest,
} from "../../../lib/api";
import {
  type LocalPendingMessage,
  removeLocalPendingMessage,
  upsertLocalPendingMessage,
} from "../../../lib/localPendingMessages";
import type {
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
  ChatSummary,
  MessageReaction,
  MessageSnippet,
  Participant,
  UserProfile,
} from "../../../lib/types";
import {
  buildMessagesQueryKey,
  mergeMessagePages,
  removeMessageById,
  upsertChat,
  updateMessageByClientMessageId,
  updateMessageById,
  updateMessageReactionsPages,
} from "../chatState";
import type { ContextMenuState, ConversationListTab } from "../chatUi";
import {
  createOptimisticOutgoingMessage,
  buildAttachmentOnlyMessageText,
  ensureOwnMessageStatus,
  isOwnMessage,
  toMessageSnippet,
} from "../messagePresentation";

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

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

type UseMessageActionsOptions = {
  activeChat: ChatSummary | null;
  activePinnedMessageId: string | null;
  chats: ChatSummary[];
  currentUser: UserProfile;
  session: AuthResponse;
  editingMessage: ChatMessage | null;
  forwardingMessage: ChatMessage | null;
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
  pendingOutgoingMessages: LocalPendingMessage[];
  refreshChatPreviewFromServer: (chatId: string) => Promise<unknown> | void;
  rememberRealtimeMessage: (messageId: string) => void;
  scheduleDraftSave: (chatId: string, value: string) => void;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setDraftsByChatId: Dispatch<SetStateAction<Record<string, string>>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setForwardingMessageId: Dispatch<SetStateAction<string | null>>;
  setReplyingToMessageId: Dispatch<SetStateAction<string | null>>;
  stopTyping: (chatId: string) => void;
  syncChatPinnedSummary: (chatId: string, snippet: MessageSnippet | null) => void;
  syncChatPreviewFromCache: (chatId: string) => void;
};

export function useMessageActions({
  activeChat,
  activePinnedMessageId,
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
  forwardingMessage,
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
  setForwardingMessageId,
  setReplyingToMessageId,
  stopTyping,
  syncChatPinnedSummary,
  syncChatPreviewFromCache,
}: UseMessageActionsOptions) {
  const queryClient = useQueryClient();
  const nextLocalMessageOrderRef = useRef(0);
  const inFlightSendClientMessageIdsRef = useRef(new Set<string>());
  const getMessagesKey = (chatId: string) => buildMessagesQueryKey(currentUser.id, chatId);
  const AUTO_RESEND_DELAY_MS = 1_500;

  const sendMessageMutation = useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const { sendEncryptedMessage } = await import("../../../lib/e2ee");
      const targetChat = chats.find((chat) => chat.id === input.chatId) ?? activeChat;
      return sendEncryptedMessage(
        sessionToken,
        input.chatId,
        input.content,
        input.participants,
        input.clientMessageId,
        input.replyTo?.id ?? null,
        {
          currentUserId: currentUser.id,
          isDirectChat: targetChat?.direct,
          session,
          attachments: input.attachments ?? [],
        },
      );
    },
    onMutate: (input) => {
      incrementPendingOutgoing(input.chatId);
      void queryClient.cancelQueries({ queryKey: getMessagesKey(input.chatId) });
      const optimisticMessage = createOptimisticOutgoingMessage(currentUser, input);
      const nextPendingMessages = upsertLocalPendingMessage(currentUser.id, {
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
      queryClient.setQueryData(["pending-outgoing-messages", currentUser.id], nextPendingMessages);
      applyChatPreviewMessage(optimisticMessage);
      applyServerChatPreviewMessage(optimisticMessage, "clear");
      if (input.clearDraftOnMutate) {
        setDraftsByChatId((current) => {
          const next = { ...current };
          delete next[input.chatId];
          return next;
        });
        scheduleDraftSave(input.chatId, "");
      }
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(input.chatId),
        (current) => mergeMessagePages(current, optimisticMessage),
      );
      return input;
    },
    onSuccess: (message, input) => {
      const nextMessage = ensureOwnMessageStatus(message, currentUser);
      const nextPendingMessages = removeLocalPendingMessage(currentUser.id, input.clientMessageId);
      queryClient.setQueryData(["pending-outgoing-messages", currentUser.id], nextPendingMessages);
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
    },
    onError: (error, input) => {
      const nextPendingStatus = isTransientSendFailure(error) ? "SENDING" : "FAILED";
      const nextPendingMessages = upsertLocalPendingMessage(currentUser.id, {
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
      queryClient.setQueryData(["pending-outgoing-messages", currentUser.id], nextPendingMessages);
      if (isTransientSendFailure(error)) {
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
                      state: "SENDING",
                    },
                  }),
            })),
        );
        return;
      }
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
      void queryClient.invalidateQueries({ queryKey: ["chats", sessionToken] });
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

    inFlightSendClientMessageIdsRef.current.add(input.clientMessageId);
    sendMessageMutation.mutate(input);
    return true;
  };

  useEffect(() => {
    if (!isRealtimeConnected || pendingOutgoingMessages.length === 0) {
      return;
    }

    const now = Date.now();
    pendingOutgoingMessages.forEach((message) => {
      if (message.status !== "SENDING") {
        return;
      }

      if (inFlightSendClientMessageIdsRef.current.has(message.clientMessageId)) {
        return;
      }

      const updatedAt = Date.parse(message.updatedAt);
      if (!Number.isNaN(updatedAt) && now - updatedAt < AUTO_RESEND_DELAY_MS) {
        return;
      }

      const targetChat = chats.find((chat) => chat.id === message.chatId);
      if (!targetChat) {
        return;
      }

      sendOutgoingMessage({
        chatId: targetChat.id,
        clientMessageId: message.clientMessageId,
        content: message.content,
        localOrder: message.localOrder ?? ++nextLocalMessageOrderRef.current,
        participants: targetChat.members,
        replyTo: message.replyTo,
        attachments: message.attachments ?? [],
      });
    });
  }, [chats, isRealtimeConnected, pendingOutgoingMessages]);

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
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(messageKey, (current) =>
        removeMessageById(current, messageId),
      );
      if (activePinnedMessageId === messageId) {
        syncChatPinnedSummary(chatId, null);
      }
      if (replyingToMessage?.id === messageId) {
        setReplyingToMessageId(null);
      }
      if (editingMessage?.id === messageId) {
        setEditingMessageId(null);
      }
      if (forwardingMessage?.id === messageId) {
        clearComposerContext("forward");
      }
      syncChatPreviewFromCache(chatId);
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
      participants,
      attachments,
    }: {
      chatId: string;
      messageId: string;
      content: string;
      participants: Participant[];
      attachments?: ChatMessageAttachment[];
    }) => {
      const { updateEncryptedMessage } = await import("../../../lib/e2ee");
      return updateEncryptedMessage(
        sessionToken,
        currentUser.id,
        chatId,
        messageId,
        content,
        participants,
        {
          currentUserId: currentUser.id,
          isDirectChat: activeChat?.direct,
          session,
          attachments: attachments ?? [],
        }
      );
    },
    onSuccess: (message, variables) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(variables.chatId),
        (current) => updateMessageById(current, variables.messageId, () => message),
      );
      if (activePinnedMessageId === message.id) {
        syncChatPinnedSummary(variables.chatId, toMessageSnippet(message));
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
      message,
      targetChatId,
      targetUsername,
    }: {
      message: ChatMessage;
      targetChatId?: string;
      targetUsername?: string;
    }) => {
      const { sendEncryptedMessage } = await import("../../../lib/e2ee");
      let targetChat = targetChatId ? chats.find((chat) => chat.id === targetChatId) ?? null : null;
      if (!targetChat) {
        if (!targetUsername) {
          throw new ApiError("Forward target is required", 400);
        }
        targetChat = await createDirectChat(sessionToken, targetUsername);
      }

      const sentMessage = await sendEncryptedMessage(
        sessionToken,
        targetChat.id,
        message.content,
        targetChat.members,
        crypto.randomUUID(),
        null,
        {
          currentUserId: currentUser.id,
          isDirectChat: targetChat.direct,
          session,
        },
      );

      return { targetChat, sentMessage };
    },
    onSuccess: ({ targetChat, sentMessage }) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", sessionToken], (current) =>
        upsertChat(current, targetChat),
      );
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        getMessagesKey(targetChat.id),
        (current) => mergeMessagePages(current, ensureOwnMessageStatus(sentMessage, currentUser)),
      );
      applyChatPreviewMessage(sentMessage);
      applyServerChatPreviewMessage(sentMessage, "clear");
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
    const title = chat?.title ?? "этот чат";
    if (!window.confirm(`Удалить чат "${title}" только у вас?`)) {
      return;
    }

    deleteChatMutation.mutate(chatId);
  };

  const deleteMessageForEveryone = (chatId: string, messageId: string) => {
    setContextMenu(null);
    if (!window.confirm("Удалить сообщение для всех участников чата?")) {
      return;
    }

    deleteMessageMutation.mutate({ chatId, messageId, scope: "EVERYONE" });
  };

  const deleteMessageForSelf = (chatId: string, messageId: string) => {
    setContextMenu(null);
    if (!window.confirm("Удалить сообщение только у вас?")) {
      return;
    }

    deleteMessageMutation.mutate({ chatId, messageId, scope: "SELF" });
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
    setForwardingMessageId(message.id);
    onOpenForwardSheet();
  };

  const togglePinnedMessageAction = (message: ChatMessage) => {
    setContextMenu(null);
    pinMessageMutation.mutate({
      chatId: message.chatId,
      messageId: activePinnedMessageId === message.id ? null : message.id,
    });
  };

  const copyMessageText = (message: ChatMessage) => {
    setContextMenu(null);
    void navigator.clipboard.writeText(message.content).catch(() => {
      window.alert("Не получилось скопировать текст сообщения.");
    });
  };

  const forwardMessageToChat = (chatId: string) => {
    if (!forwardingMessage) {
      return;
    }

    forwardMessageMutation.mutate({
      message: forwardingMessage,
      targetChatId: chatId,
    });
  };

  const forwardMessageToContact = (username: string) => {
    if (!forwardingMessage) {
      return;
    }

    forwardMessageMutation.mutate({
      message: forwardingMessage,
      targetUsername: username,
    });
  };

  const submitActiveDraft = async (draft: string, files: File[] = []) => {
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
        participants: activeChat.members,
        attachments: editingMessage.attachments ?? [],
      });
      return true;
    }

    let attachments: ChatMessageAttachment[] = [];
    if (files.length > 0) {
      const oversizedFile = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
      if (oversizedFile) {
        window.alert(
          `Файл "${oversizedFile.name}" больше 25 MB. Выберите файл меньшего размера.`
        );
        return false;
      }

      try {
        const { prepareEncryptedMessageAttachments } = await import("../../../lib/e2ee");
        attachments = await prepareEncryptedMessageAttachments(sessionToken, activeChat.id, files);
      } catch (error) {
        window.alert(describeError(error));
        return false;
      }
    }
    const content = trimmed || buildAttachmentOnlyMessageText(attachments);

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
    deleteMessageForSelf,
    deleteMessageMutation,
    editMessageAction,
    editMessageMutation,
    forwardMessageAction,
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

function isTransientSendFailure(error: unknown) {
  return error instanceof ApiError && [0, 503, 504].includes(error.status);
}
