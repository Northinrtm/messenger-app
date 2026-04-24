import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { readLocalChatPreviews, writeLocalChatPreviews } from "../../../lib/chatPreviewCache";
import { isUnavailableEncryptedMessage } from "../../../lib/e2eeShared";
import type { ChatMessage, ChatSummary, MessageSnippet } from "../../../lib/types";
import {
  applyChatMessageActivity,
  buildMessagesQueryKey,
  clearChatMessageActivity,
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
  previewHydrationChats: ChatSummary[];
  queryClient: QueryClient;
  token: string;
  userId: string;
};

export function useChatPreviews({
  archivedChatIds,
  formatPreviewText,
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
  const previewHydrationInFlightRef = useRef(new Set<string>());

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
    const cachedPages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
      buildMessagesQueryKey(userId, chatId)
    );
    if (cachedPages === undefined) {
      void refreshChatPreviewFromServer(chatId);
      return;
    }

    const latestMessage = getLatestMessageFromPages(cachedPages);
    if (!latestMessage) {
      clearChatPreviewOverride(chatId);
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
        clearChatMessageActivity(current, chatId)
      );
      return;
    }

    if (
      !latestMessage.content.trim() ||
      isUnavailableEncryptedMessage(latestMessage.content)
    ) {
      void refreshChatPreviewFromServer(chatId);
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
    const localOverride = chatPreviewOverridesRef.current[chat.id];
    if (!chat.lastMessageAt) {
      return Boolean(localOverride);
    }

    if (localOverride?.lastMessageAt === chat.lastMessageAt) {
      return false;
    }

    const currentPreview = chat.lastMessage?.trim() ?? "";
    return (
      currentPreview.length === 0 ||
      currentPreview === "Encrypted message" ||
      isUnavailableEncryptedMessage(currentPreview)
    );
  });

  const refreshChatPreviewFromServer = useEffectEvent(async (chatId: string) => {
    const currentChatSummary =
      (queryClient.getQueryData<ChatSummary[]>(["chats", token]) ?? []).find((chat) => chat.id === chatId) ??
      null;
    const cachedPages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
      buildMessagesQueryKey(userId, chatId)
    );
    const latestMessage = getLatestMessageFromPages(cachedPages) ?? null;
    if (
      !latestMessage ||
      !latestMessage.content.trim() ||
      isUnavailableEncryptedMessage(latestMessage.content)
    ) {
      if (previewHydrationInFlightRef.current.has(chatId)) {
        return;
      }

      previewHydrationInFlightRef.current.add(chatId);
      try {
        const { readLatestArchivedDecryptedChatMessage } = await import("../../../lib/e2ee");
        const archivedMessage = await readLatestArchivedDecryptedChatMessage(userId, chatId);
        if (
          !archivedMessage ||
          !archivedMessage.content.trim() ||
          isUnavailableEncryptedMessage(archivedMessage.content) ||
          (currentChatSummary?.lastMessageAt &&
            archivedMessage.createdAt.localeCompare(currentChatSummary.lastMessageAt) < 0)
        ) {
          if (!currentChatSummary?.lastMessageAt) {
            clearChatPreviewOverride(chatId);
            queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
              clearChatMessageActivity(current, chatId)
            );
          }
          return;
        }

        applyChatPreviewMessage(archivedMessage);
        queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) =>
          applyChatMessageActivity(
            current,
            {
              ...archivedMessage,
              sender: currentChatSummary?.members[0] ?? {
                id: userId,
                username: "",
                displayName: "",
                profession: null,
                avatarUrl: null,
                online: false,
              },
              reactions: [],
              status: null,
              clientMessageId: null,
            },
            "keep"
          )
        );
      } finally {
        previewHydrationInFlightRef.current.delete(chatId);
      }

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

    const cachedPages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
      buildMessagesQueryKey(userId, chat.id)
    );
    const latestMessage = getLatestMessageFromPages(cachedPages);
    if (
      latestMessage &&
      latestMessage.content.trim() &&
      !isUnavailableEncryptedMessage(latestMessage.content)
    ) {
      applyChatPreviewMessage(latestMessage);
      return;
    }

    await refreshChatPreviewFromServer(chat.id);
  });

  useEffect(() => {
    let cancelled = false;
    const archivedChatIdsLookup = new Set(archivedChatIds);

    const hydrateVisibleChatPreviews = async () => {
      for (const chat of previewHydrationChats) {
        const hasLocalOverride = Boolean(chatPreviewOverridesRef.current[chat.id]);
        if (
          cancelled ||
          archivedChatIdsLookup.has(chat.id) ||
          (!chat.lastMessageAt && !hasLocalOverride)
        ) {
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
