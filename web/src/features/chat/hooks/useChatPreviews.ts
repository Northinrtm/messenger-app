import type { QueryClient } from "@tanstack/react-query";
import { useEffectEvent } from "react";
import type { ChatMessage, ChatSummary, MessageSnippet } from "../../../lib/types";
import {
  applyChatMessageActivity,
  removeChatPinnedMessage,
  replaceChatPinnedMessage,
  setChatPinnedMessages,
  type ChatMessageActivityMode,
} from "../chatState";

type UseChatPreviewsOptions = {
  formatPreviewText: (message: Pick<ChatMessage, "content" | "replyTo">) => string;
  queryClient: QueryClient;
  token: string;
};

export function useChatPreviews({
  formatPreviewText,
  queryClient,
  token,
}: UseChatPreviewsOptions) {
  const applyChatPreviewMessage = useEffectEvent(
    (message: Pick<ChatMessage, "chatId" | "content" | "createdAt" | "replyTo">) => {
      const previewText = formatPreviewText(message);
      if (!previewText.trim()) {
        return;
      }

      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        applyChatMessageActivity(current, {
          chatId: message.chatId,
          content: previewText,
          createdAt: message.createdAt,
          replyTo: message.replyTo ?? null,
          id: "",
          sender: {
            id: "",
            username: "",
            displayName: "",
            profession: null,
            avatarUrl: null,
            online: false,
          },
          editedAt: null,
          status: null,
          reactions: [],
        }, "keep")
      );
    }
  );

  const applyServerChatPreviewMessage = useEffectEvent(
    (message: ChatMessage, unreadMode: ChatMessageActivityMode = "keep") => {
      const previewText = formatPreviewText(message);
      if (!previewText.trim()) {
        return;
      }

      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        applyChatMessageActivity(
          current,
          {
            ...message,
            content: previewText,
          },
          unreadMode
        )
      );
    }
  );

  const refreshChatPreviewFromServer = useEffectEvent((chatId: string) => {
    const currentChats = queryClient.getQueryData<ChatSummary[]>(["chats", token]) ?? [];
    if (!currentChats.some((chat) => chat.id === chatId)) {
      return;
    }

    return queryClient.invalidateQueries({ queryKey: ["chats", token] });
  });

  const syncChatPreviewFromCache = useEffectEvent((chatId: string) => {
    void refreshChatPreviewFromServer(chatId);
  });

  const syncChatPinnedMessages = useEffectEvent((chatId: string, pinnedMessages: MessageSnippet[]) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      setChatPinnedMessages(current, chatId, pinnedMessages)
    );
  });

  const syncChatPinnedMessage = useEffectEvent((chatId: string, pinnedMessage: MessageSnippet) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      replaceChatPinnedMessage(current, chatId, pinnedMessage)
    );
  });

  const removeChatPinnedMessageLocally = useEffectEvent((chatId: string, messageId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      removeChatPinnedMessage(current, chatId, messageId)
    );
  });

  return {
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    refreshChatPreviewFromServer,
    syncChatPinnedMessage,
    syncChatPinnedMessages,
    removeChatPinnedMessage: removeChatPinnedMessageLocally,
    syncChatPreviewFromCache,
  };
}
