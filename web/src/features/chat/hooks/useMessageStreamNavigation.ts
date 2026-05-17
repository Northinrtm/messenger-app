import type { ChatMessage } from "../../../lib/types";
import { useEffect, useEffectEvent, useRef } from "react";

const MESSAGE_JUMP_HIGHLIGHT_CLASS = "is-jump-highlight";
const MESSAGE_JUMP_HIGHLIGHT_MS = 2200;

type UseMessageStreamNavigationOptions = {
  activeChatId: string | null;
  currentChatId: string | null;
  lastMessageAnchorKey: string | null;
  lastMessageId: string | null;
  messages: ChatMessage[];
  currentUserId: string;
  pendingMessageJump: {
    chatId: string;
    messageId: string;
  } | null;
  clearPendingMessageJump: (chatId: string, messageId: string) => void;
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
  lastMessageAnchorKey,
  lastMessageId,
  messages,
  currentUserId,
  pendingMessageJump,
  clearPendingMessageJump,
  pendingInitialAnchor,
  clearPendingInitialAnchor,
  openChat,
}: UseMessageStreamNavigationOptions) {
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageAnchorKey: string | null }>({
    chatId: null,
    lastMessageAnchorKey: null,
  });

  const highlightMessageNode = useEffectEvent((messageNode: HTMLElement) => {
    highlightTimeoutRef.current && window.clearTimeout(highlightTimeoutRef.current);
    const container = messageStreamRef.current;
    container?.querySelectorAll<HTMLElement>(`.${MESSAGE_JUMP_HIGHLIGHT_CLASS}`).forEach((node) => {
      node.classList.remove(MESSAGE_JUMP_HIGHLIGHT_CLASS);
    });
    messageNode.classList.add(MESSAGE_JUMP_HIGHLIGHT_CLASS);
    highlightTimeoutRef.current = window.setTimeout(() => {
      messageNode.classList.remove(MESSAGE_JUMP_HIGHLIGHT_CLASS);
      highlightTimeoutRef.current = null;
    }, MESSAGE_JUMP_HIGHLIGHT_MS);
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
    highlightMessageNode(messageNode);

    return true;
  });

  const scrollAnchorIntoStream = useEffectEvent(
    (anchorKey: string, behavior: ScrollBehavior = "smooth") => {
      const container = messageStreamRef.current;
      if (!container) {
        return false;
      }

      const messageNode = container.querySelector<HTMLElement>(
        `[data-message-anchor-key="${anchorKey}"]`
      );
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
    }
  );

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

  const scheduleInitialViewportPosition = useEffectEvent(
    (messageId: string | null, anchorKey: string | null) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (messageId && scrollMessageIntoStream(messageId, "auto")) {
          return;
        }

        if (anchorKey && scrollAnchorIntoStream(anchorKey, "auto")) {
          return;
        }

        scrollToStreamBottom("auto");
      });
    });
    }
  );

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
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

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
        lastMessageAnchorKey,
      };
      return;
    }

    const pendingMessageJumpForCurrentChat =
      currentChatId && pendingMessageJump?.chatId === currentChatId
        ? pendingMessageJump
        : null;
    if (currentChatId && pendingMessageJumpForCurrentChat) {
      const targetMessageLoaded = messages.some(
        (message) => message.id === pendingMessageJumpForCurrentChat.messageId
      );
      if (targetMessageLoaded) {
        scheduleInitialViewportPosition(pendingMessageJumpForCurrentChat.messageId, null);
        clearPendingMessageJump(
          currentChatId,
          pendingMessageJumpForCurrentChat.messageId
        );
        viewportSnapshotRef.current = {
          chatId: currentChatId,
          lastMessageAnchorKey,
        };
      }
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
      scheduleInitialViewportPosition(targetMessageId, lastMessageAnchorKey);
      clearPendingInitialAnchor(currentChatId);
      viewportSnapshotRef.current = {
        chatId: currentChatId,
        lastMessageAnchorKey,
      };
      return;
    }

    const previous = viewportSnapshotRef.current;
    const chatChanged = previous.chatId !== currentChatId;
    const tailChanged = previous.lastMessageAnchorKey !== lastMessageAnchorKey;
    if (chatChanged || tailChanged) {
      scheduleInitialViewportPosition(null, lastMessageAnchorKey);
    }

    viewportSnapshotRef.current = {
      chatId: currentChatId,
      lastMessageAnchorKey,
    };
  }, [
    clearPendingMessageJump,
    clearPendingInitialAnchor,
    currentChatId,
    currentUserId,
    lastMessageAnchorKey,
    lastMessageId,
    messages,
    pendingMessageJump,
    pendingInitialAnchor,
  ]);

  return {
    messageStreamRef,
    preserveOlderMessagesOffset,
    scrollToMessage,
  };
}
