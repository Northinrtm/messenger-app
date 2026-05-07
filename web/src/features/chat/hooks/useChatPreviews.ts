import type { QueryClient } from "@tanstack/react-query";
import { useEffectEvent } from "react";
import type { ChatMessage, ChatSummary, MessageSnippet } from "../../../lib/types";
import {
  applyChatMessageActivity,
  updateChatPinnedMessage,
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

  const syncChatPinnedSummary = useEffectEvent((chatId: string, pinnedMessage: MessageSnippet | null) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      updateChatPinnedMessage(current, chatId, pinnedMessage)
    );
  });

  return {
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    refreshChatPreviewFromServer,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  };
}
