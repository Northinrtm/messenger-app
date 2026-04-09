import type { ChatMessage } from "../../../lib/types";
import { useEffect, useEffectEvent, useRef } from "react";

type UseMessageStreamNavigationOptions = {
  activeChatId: string | null;
  currentChatId: string | null;
  lastMessageId: string | null;
  messages: ChatMessage[];
  currentUserId: string;
  pendingInitialAnchor: {
    chatId: string;
    unreadCount: number;
  } | null;
  clearPendingInitialAnchor: (chatId: string) => void;
  openChat: (chatId: string) => void;
};

export function resolveInitialMessageAnchorId(
  messages: ChatMessage[],
  currentUserId: string,
  unreadCount: number
) {
  if (messages.length === 0) {
    return null;
  }

  if (unreadCount <= 0) {
    return messages[messages.length - 1]?.id ?? null;
  }

  const unreadIncomingMessages = [...messages]
    .reverse()
    .filter((message) => message.sender.id !== currentUserId)
    .slice(0, unreadCount)
    .reverse();

  return unreadIncomingMessages[0]?.id ?? messages[messages.length - 1]?.id ?? null;
}

export function useMessageStreamNavigation({
  activeChatId,
  currentChatId,
  lastMessageId,
  messages,
  currentUserId,
  pendingInitialAnchor,
  clearPendingInitialAnchor,
  openChat,
}: UseMessageStreamNavigationOptions) {
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageId: string | null }>({
    chatId: null,
    lastMessageId: null,
  });

  const scrollMessageIntoStream = useEffectEvent((messageId: string, behavior: ScrollBehavior = "smooth") => {
    const container = messageStreamRef.current;
    if (!container) {
      return false;
    }

    const messageNode = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!messageNode) {
      return false;
    }

    const targetTop =
      messageNode.offsetTop - container.clientHeight / 2 + messageNode.offsetHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior,
    });

    return true;
  });

  const scrollToStreamBottom = useEffectEvent((behavior: ScrollBehavior = "auto") => {
    const container = messageStreamRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  });

  const scheduleInitialViewportPosition = useEffectEvent((messageId: string | null) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (messageId && scrollMessageIntoStream(messageId, "auto")) {
          return;
        }

        scrollToStreamBottom("auto");
      });
    });
  });

  const scrollToMessage = useEffectEvent((chatId: string, messageId: string) => {
    if (activeChatId !== chatId) {
      openChat(chatId);
      window.setTimeout(() => {
        scrollMessageIntoStream(messageId);
      }, 120);
      return;
    }

    scrollMessageIntoStream(messageId);
  });

  const preserveOlderMessagesOffset = () => {
    const container = messageStreamRef.current;
    pendingOlderScrollOffsetRef.current = container
      ? container.scrollHeight - container.scrollTop
      : 0;
  };

  useEffect(() => {
    const container = messageStreamRef.current;
    if (!container) {
      return;
    }

    const pendingOlderOffset = pendingOlderScrollOffsetRef.current;
    if (pendingOlderOffset !== null) {
      container.scrollTop = container.scrollHeight - pendingOlderOffset;
      pendingOlderScrollOffsetRef.current = null;
      viewportSnapshotRef.current = {
        chatId: currentChatId,
        lastMessageId,
      };
      return;
    }

    const pendingAnchorForCurrentChat =
      currentChatId && pendingInitialAnchor?.chatId === currentChatId
        ? pendingInitialAnchor
        : null;
    if (currentChatId && pendingAnchorForCurrentChat) {
      const targetMessageId = resolveInitialMessageAnchorId(
        messages,
        currentUserId,
        pendingAnchorForCurrentChat.unreadCount
      );
      scheduleInitialViewportPosition(targetMessageId);
      clearPendingInitialAnchor(currentChatId);
      viewportSnapshotRef.current = {
        chatId: currentChatId,
        lastMessageId,
      };
      return;
    }

    const previous = viewportSnapshotRef.current;
    const chatChanged = previous.chatId !== currentChatId;
    const tailChanged = previous.lastMessageId !== lastMessageId;
    if (chatChanged || tailChanged) {
      scheduleInitialViewportPosition(lastMessageId);
    }

    viewportSnapshotRef.current = {
      chatId: currentChatId,
      lastMessageId,
    };
  }, [
    clearPendingInitialAnchor,
    currentChatId,
    currentUserId,
    lastMessageId,
    messages,
    pendingInitialAnchor,
  ]);

  return {
    messageStreamRef,
    preserveOlderMessagesOffset,
    scrollToMessage,
  };
}
