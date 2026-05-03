import type { QueryClient } from "@tanstack/react-query";
import { useEffectEvent } from "react";
import { isUnavailableEncryptedMessage } from "../../../lib/e2eeShared";
import type { ChatMessage, ChatSummary, MessageSnippet } from "../../../lib/types";
import {
  applyChatMessageActivity,
  clearChatMessageActivity,
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
  const clearChatPreviewOverride = useEffectEvent((_chatId: string) => undefined);

  const applyChatPreviewMessage = useEffectEvent(
    (message: Pick<ChatMessage, "chatId" | "content" | "createdAt" | "replyTo">) => {
      const previewText = formatPreviewText(message);
      if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
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
      if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
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

  const refreshChatPreviewFromServer = useEffectEvent(async (chatId: string) => {
    const currentChatSummary =
      (queryClient.getQueryData<ChatSummary[]>(["chats", token]) ?? []).find((chat) => chat.id === chatId) ??
      null;
    if (!currentChatSummary?.lastMessageAt) {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        clearChatMessageActivity(current, chatId)
      );
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["chats", token] });
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
    clearChatPreviewOverride,
    refreshChatPreviewFromServer,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  };
}
