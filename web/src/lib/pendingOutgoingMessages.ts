import type { ChatMessage, PendingOutgoingMessage, UserProfile } from "./types";

export function toRecoveredPendingChatMessage(
  currentUser: UserProfile,
  message: PendingOutgoingMessage
): ChatMessage {
  return {
    id: message.clientMessageId,
    chatId: message.chatId,
    serverOrder: null,
    sender: currentUser,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: null,
    status: {
      state: message.status,
      recipientCount: message.recipientCount,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId: message.clientMessageId,
    localOrder: message.localOrder,
    replyTo: message.replyTo ?? null,
    reactions: [],
    attachments: message.attachments ?? [],
  };
}
