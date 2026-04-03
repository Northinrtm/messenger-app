import { useEffect, useEffectEvent, useRef } from "react";

type UseMessageStreamNavigationOptions = {
  activeChatId: string | null;
  currentChatId: string | null;
  lastMessageId: string | null;
  openChat: (chatId: string) => void;
};

export function useMessageStreamNavigation({
  activeChatId,
  currentChatId,
  lastMessageId,
  openChat,
}: UseMessageStreamNavigationOptions) {
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageId: string | null }>({
    chatId: null,
    lastMessageId: null,
  });

  const scrollMessageIntoStream = useEffectEvent((messageId: string) => {
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
      behavior: "smooth",
    });

    return true;
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

    const previous = viewportSnapshotRef.current;
    const chatChanged = previous.chatId !== currentChatId;
    const tailChanged = previous.lastMessageId !== lastMessageId;
    if (chatChanged || tailChanged) {
      container.scrollTop = container.scrollHeight;
    }

    viewportSnapshotRef.current = {
      chatId: currentChatId,
      lastMessageId,
    };
  }, [currentChatId, lastMessageId]);

  return {
    messageStreamRef,
    preserveOlderMessagesOffset,
    scrollToMessage,
  };
}
