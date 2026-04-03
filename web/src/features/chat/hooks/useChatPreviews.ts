import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError } from "../../../lib/api";
import {
  getEncryptedMessages,
  isUnavailableEncryptedMessage,
} from "../../../lib/e2ee";
import { readLocalChatPreviews, writeLocalChatPreviews } from "../../../lib/chatPreviewCache";
import type { ChatMessage, ChatSummary, MessageSnippet } from "../../../lib/types";
import {
  applyChatMessageActivity,
  getLatestMessageFromPages,
  removeChatPreviewOverride,
  replaceChatPreviewOverride,
  type ChatMessageActivityMode,
  updateChatPinnedMessage,
  upsertChatPreviewOverride,
} from "../chatState";

type UseChatPreviewsOptions = {
  archivedChatIds: string[];
  formatPreviewText: (message: Pick<ChatMessage, "content" | "replyTo">) => string;
  onUnauthorized: () => void;
  previewHydrationChats: ChatSummary[];
  queryClient: QueryClient;
  token: string;
  userId: string;
};

export function useChatPreviews({
  archivedChatIds,
  formatPreviewText,
  onUnauthorized,
  previewHydrationChats,
  queryClient,
  token,
  userId,
}: UseChatPreviewsOptions) {
  const [chatPreviewOverrides, setChatPreviewOverrides] = useState<
    Record<string, { lastMessage: string; lastMessageAt: string }>
  >(() => readLocalChatPreviews(userId));
  const chatPreviewOverridesRef = useRef<
    Record<string, { lastMessage: string; lastMessageAt: string }>
  >({});
  const chatPreviewHydrationRef = useRef(new Map<string, string>());

  const clearChatPreviewOverride = useEffectEvent((chatId: string) => {
    setChatPreviewOverrides((current) => removeChatPreviewOverride(current, chatId));
  });

  const applyChatPreviewMessage = useEffectEvent(
    (message: Pick<ChatMessage, "chatId" | "content" | "createdAt" | "replyTo">) => {
      const previewText = formatPreviewText(message);
      if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
        return;
      }

      setChatPreviewOverrides((current) =>
        upsertChatPreviewOverride(current, {
          chatId: message.chatId,
          content: previewText,
          createdAt: message.createdAt,
        })
      );
    }
  );

  const applyServerChatPreviewMessage = useEffectEvent(
    (message: ChatMessage, unreadMode: ChatMessageActivityMode = "keep") => {
      const previewText = formatPreviewText(message);
      if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
        return;
      }

      const hasChat = (queryClient.getQueryData<ChatSummary[]>(["chats", token]) ?? []).some(
        (chat) => chat.id === message.chatId
      );
      if (!hasChat) {
        void queryClient.invalidateQueries({ queryKey: ["chats", token] });
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

  const syncChatPreviewFromCache = useEffectEvent((chatId: string) => {
    const cachedPages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>([
      "messages",
      token,
      chatId,
    ]);
    if (cachedPages === undefined) {
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
      return;
    }

    const latestMessage = getLatestMessageFromPages(cachedPages);
    if (
      !latestMessage ||
      !latestMessage.content.trim() ||
      isUnavailableEncryptedMessage(latestMessage.content)
    ) {
      clearChatPreviewOverride(chatId);
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        current?.map((chat) =>
          chat.id !== chatId
            ? chat
            : {
                ...chat,
                lastMessage: null,
                lastMessageAt: null,
              }
        ) ?? []
      );
      return;
    }

    const previewText = formatPreviewText(latestMessage);
    setChatPreviewOverrides((current) =>
      replaceChatPreviewOverride(current, chatId, {
        lastMessage: previewText,
        lastMessageAt: latestMessage.createdAt,
      })
    );
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      applyChatMessageActivity(
        current,
        {
          ...latestMessage,
          content: previewText,
        },
        "keep"
      )
    );
  });

  const shouldHydrateChatListPreview = useEffectEvent((chat: ChatSummary) => {
    if (!chat.lastMessageAt) {
      return false;
    }

    if (chatPreviewOverridesRef.current[chat.id]?.lastMessageAt === chat.lastMessageAt) {
      return false;
    }

    const currentPreview = chat.lastMessage?.trim() ?? "";
    return currentPreview.length === 0 || isUnavailableEncryptedMessage(currentPreview);
  });

  const refreshChatPreviewFromServer = useEffectEvent(async (chatId: string) => {
    try {
      const messages = await getEncryptedMessages(token, userId, chatId, {
        limit: 1,
      });
      const latestMessage = messages[messages.length - 1] ?? null;

      if (
        !latestMessage ||
        !latestMessage.content.trim() ||
        isUnavailableEncryptedMessage(latestMessage.content)
      ) {
        clearChatPreviewOverride(chatId);
        queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
          current?.map((chat) =>
            chat.id !== chatId
              ? chat
              : {
                  ...chat,
                  lastMessage: null,
                  lastMessageAt: null,
                }
          ) ?? []
        );
        return;
      }

      const previewText = formatPreviewText(latestMessage);
      setChatPreviewOverrides((current) =>
        replaceChatPreviewOverride(current, chatId, {
          lastMessage: previewText,
          lastMessageAt: latestMessage.createdAt,
        })
      );
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        applyChatMessageActivity(
          current,
          {
            ...latestMessage,
            content: previewText,
          },
          "keep"
        )
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
      }
    }
  });

  const syncChatPinnedSummary = useEffectEvent((chatId: string, pinnedMessage: MessageSnippet | null) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
      updateChatPinnedMessage(current, chatId, pinnedMessage)
    );
  });

  useEffect(() => {
    chatPreviewOverridesRef.current = chatPreviewOverrides;
    writeLocalChatPreviews(
      userId,
      Object.fromEntries(
        Object.entries(chatPreviewOverrides).filter(
          ([, preview]) =>
            preview.lastMessage.trim().length > 0 &&
            !isUnavailableEncryptedMessage(preview.lastMessage)
        )
      )
    );
  }, [chatPreviewOverrides, userId]);

  const hydrateChatListPreview = useEffectEvent(async (chat: ChatSummary) => {
    if (!shouldHydrateChatListPreview(chat)) {
      return;
    }

    const targetVersion = chat.lastMessageAt!;

    if (chatPreviewHydrationRef.current.get(chat.id) === targetVersion) {
      return;
    }

    chatPreviewHydrationRef.current.set(chat.id, targetVersion);
    try {
      const messages = await getEncryptedMessages(token, userId, chat.id, {
        limit: 1,
      });
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        applyChatPreviewMessage(latestMessage);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
      }
    } finally {
      if (chatPreviewHydrationRef.current.get(chat.id) === targetVersion) {
        chatPreviewHydrationRef.current.delete(chat.id);
      }
    }
  });

  useEffect(() => {
    let cancelled = false;
    const archivedChatIdsLookup = new Set(archivedChatIds);

    const hydrateVisibleChatPreviews = async () => {
      for (const chat of previewHydrationChats) {
        if (cancelled || archivedChatIdsLookup.has(chat.id) || !chat.lastMessageAt) {
          continue;
        }

        await hydrateChatListPreview(chat);
      }
    };

    if (previewHydrationChats.length > 0) {
      void hydrateVisibleChatPreviews();
    }

    return () => {
      cancelled = true;
    };
  }, [archivedChatIds, hydrateChatListPreview, previewHydrationChats]);

  return {
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    chatPreviewOverrides,
    clearChatPreviewOverride,
    refreshChatPreviewFromServer,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  };
}
