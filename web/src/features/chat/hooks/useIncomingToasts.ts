import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ChatMessage, ChatSummary } from "../../../lib/types";
import { extractMentionUsernames } from "../messageMentions";

export type IncomingToast = {
  id: string;
  chatId: string;
  title: string;
  senderName: string;
  preview: string;
};

type UseIncomingToastsOptions = {
  activeChatId: string | null;
  browserNotificationsEnabled: boolean;
  currentUserId: string;
  currentUsername: string;
  formatPreview: (message: ChatMessage) => string;
  queryClient: QueryClient;
  token: string;
};

export function useIncomingToasts({
  activeChatId,
  browserNotificationsEnabled,
  currentUserId,
  currentUsername,
  formatPreview,
  queryClient,
  token,
}: UseIncomingToastsOptions) {
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const toastTimeoutsRef = useRef(new Map<string, number>());

  const dismissIncomingToast = useEffectEvent((toastId: string) => {
    const timeoutId = toastTimeoutsRef.current.get(toastId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }

    setIncomingToasts((current) => current.filter((toast) => toast.id !== toastId));
  });

  const clearChatAttention = useEffectEvent((chatId: string) => {
    const toastIds = incomingToasts
      .filter((toast) => toast.chatId === chatId)
      .map((toast) => toast.id);
    if (!toastIds.length) {
      return;
    }

    toastIds.forEach((toastId) => {
      const timeoutId = toastTimeoutsRef.current.get(toastId);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        toastTimeoutsRef.current.delete(toastId);
      }
    });

    setIncomingToasts((current) => current.filter((toast) => toast.chatId !== chatId));
  });

  const showIncomingToast = useEffectEvent((message: ChatMessage) => {
    const mentionedCurrentUser = extractMentionUsernames(message.content).includes(
      currentUsername.toLowerCase()
    );
    if (
      message.sender.id === currentUserId ||
      (message.chatId === activeChatId && !mentionedCurrentUser)
    ) {
      return;
    }

    const chatsSnapshot = queryClient.getQueryData<ChatSummary[]>(["chats", token]) ?? [];
    const chat = chatsSnapshot.find((item) => item.id === message.chatId);
    const toastId = message.id;
    const nextToast: IncomingToast = {
      id: toastId,
      chatId: message.chatId,
      title: mentionedCurrentUser
        ? "\u0412\u0430\u0441 \u0443\u043F\u043E\u043C\u044F\u043D\u0443\u043B\u0438"
        : chat?.title ?? "\u041D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
      senderName: message.sender.displayName,
      preview: formatPreview(message),
    };
    showBrowserNotification(nextToast, browserNotificationsEnabled);

    const existingTimeoutId = toastTimeoutsRef.current.get(toastId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    setIncomingToasts((current) =>
      [...current.filter((toast) => toast.id !== toastId), nextToast].slice(-3)
    );

    const timeoutId = window.setTimeout(() => {
      dismissIncomingToast(toastId);
    }, 3000);
    toastTimeoutsRef.current.set(toastId, timeoutId);
  });

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current.clear();
    };
  }, []);

  return {
    clearChatAttention,
    dismissIncomingToast,
    incomingToasts,
    showIncomingToast,
  };
}

function showBrowserNotification(toast: IncomingToast, enabled: boolean) {
  if (
    !enabled ||
    typeof window === "undefined" ||
    !("Notification" in window) ||
    window.Notification.permission !== "granted" ||
    document.visibilityState === "visible"
  ) {
    return;
  }

  try {
    const notification = new window.Notification(toast.title, {
      body: `${toast.senderName}: ${toast.preview}`,
      icon: "/icon-192.png",
      tag: `north-messenger-chat-${toast.chatId}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers expose Notification but still reject direct construction.
  }
}
