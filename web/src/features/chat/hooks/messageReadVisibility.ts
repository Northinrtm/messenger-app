import { isUnavailableEncryptedMessage } from "../../../lib/e2eeShared";
import type { ChatMessage } from "../../../lib/types";

type OpenChatReadOptions = {
  isActiveChatOpen: boolean;
  isDocumentVisible: boolean;
  hasDocumentFocus: boolean;
};

type IncomingMessageReadOptions = OpenChatReadOptions & {
  activeChatId: string | null;
  messageChatId: string;
};

export function canAcknowledgeVisibleMessagesAsRead(options: OpenChatReadOptions) {
  return options.isActiveChatOpen && options.isDocumentVisible && options.hasDocumentFocus;
}

export function shouldAcknowledgeIncomingMessageAsRead(options: IncomingMessageReadOptions) {
  return (
    options.messageChatId === options.activeChatId &&
    canAcknowledgeVisibleMessagesAsRead(options)
  );
}

export function buildReadableIncomingMessageIdsKey(
  messages: ChatMessage[],
  currentUserId: string
) {
  return messages
    .filter(
      (message) =>
        message.sender.id !== currentUserId &&
        !isUnavailableEncryptedMessage(message.content)
    )
    .map((message) => message.id)
    .join(",");
}
