import { useEffectEvent, useRef } from "react";
import {
  ApiError,
  acknowledgeDelivered as acknowledgeDeliveredRequest,
  acknowledgeRead as acknowledgeReadRequest,
} from "../../../lib/api";
import { isUnavailableEncryptedMessage } from "../../../lib/e2eeShared";
import type { ChatMessage, UserProfile } from "../../../lib/types";
import { canAcknowledgeVisibleMessagesAsRead } from "./messageReadVisibility";

type UseMessageReceiptsOptions = {
  activeChatId: string | null;
  isActiveChatOpen: boolean;
  currentUser: UserProfile;
  messages: ChatMessage[];
  token: string;
  clearChatUnreadIndicator: (chatId: string) => void;
  onUnauthorized: () => void;
};

export function useMessageReceipts({
  activeChatId,
  isActiveChatOpen,
  currentUser,
  messages,
  token,
  clearChatUnreadIndicator,
  onUnauthorized,
}: UseMessageReceiptsOptions) {
  const deliveredMessageIdsRef = useRef(new Set<string>());
  const deliveredMessageIdsInFlightRef = useRef(new Set<string>());
  const readMessageIdsRef = useRef(new Set<string>());
  const readMessageIdsInFlightRef = useRef(new Set<string>());

  const acknowledgeDelivered = useEffectEvent(async (chatId: string, messageIds: string[]) => {
    const pendingIds = messageIds.filter(
      (messageId) =>
        !deliveredMessageIdsRef.current.has(messageId) &&
        !readMessageIdsRef.current.has(messageId) &&
        !deliveredMessageIdsInFlightRef.current.has(messageId)
    );
    if (!pendingIds.length) {
      return;
    }

    pendingIds.forEach((messageId) => deliveredMessageIdsInFlightRef.current.add(messageId));
    try {
      await acknowledgeDeliveredRequest(token, chatId, pendingIds);
      pendingIds.forEach((messageId) => deliveredMessageIdsRef.current.add(messageId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
      }
    } finally {
      pendingIds.forEach((messageId) => deliveredMessageIdsInFlightRef.current.delete(messageId));
    }
  });

  const acknowledgeRead = useEffectEvent(async (chatId: string, messageIds: string[]) => {
    const pendingIds = messageIds.filter(
      (messageId) =>
        !readMessageIdsRef.current.has(messageId) && !readMessageIdsInFlightRef.current.has(messageId)
    );
    if (!pendingIds.length) {
      return;
    }

    clearChatUnreadIndicator(chatId);
    pendingIds.forEach((messageId) => readMessageIdsInFlightRef.current.add(messageId));
    try {
      await acknowledgeReadRequest(token, chatId, pendingIds);
      pendingIds.forEach((messageId) => {
        readMessageIdsRef.current.add(messageId);
        deliveredMessageIdsRef.current.add(messageId);
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
      }
    } finally {
      pendingIds.forEach((messageId) => readMessageIdsInFlightRef.current.delete(messageId));
    }
  });

  const acknowledgeVisibleMessagesAsRead = useEffectEvent(() => {
    if (
      !activeChatId ||
      !canAcknowledgeMessagesAsRead({
        isActiveChatOpen,
      })
    ) {
      return;
    }

    const incomingMessageIds = messages
      .filter(
        (message) =>
          message.sender.id !== currentUser.id &&
          !isUnavailableEncryptedMessage(message.content)
      )
      .map((message) => message.id);
    if (!incomingMessageIds.length) {
      return;
    }

    void acknowledgeRead(activeChatId, incomingMessageIds);
  });

  return {
    acknowledgeDelivered,
    acknowledgeRead,
    acknowledgeVisibleMessagesAsRead,
  };
}

function canAcknowledgeMessagesAsRead(options: { isActiveChatOpen: boolean }) {
  return canAcknowledgeVisibleMessagesAsRead({
    isActiveChatOpen: options.isActiveChatOpen,
    isDocumentVisible: document.visibilityState === "visible",
    hasDocumentFocus:
      typeof document.hasFocus === "function" ? document.hasFocus() : true,
  });
}
