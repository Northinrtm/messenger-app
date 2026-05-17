import type {
  ApiChatMessage,
  ChatMessage,
  ChatMessageAttachment,
} from '@north/shared';

export function hydrateApiChatMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    chatId: message.chatId,
    serverOrder: message.serverOrder ?? null,
    sender: message.sender,
    content: message.plainPayload?.content ?? '',
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    status: message.status,
    clientMessageId: message.clientMessageId ?? null,
    replyTo: message.replyTo,
    reactions: message.reactions ?? [],
    forwarded: message.forwarded ?? false,
    forwardedFrom: message.forwardedFrom ?? null,
    forwardedFromMessageId: null,
    attachments: normalizeChatMessageAttachments(message.attachments),
  };
}

function normalizeChatMessageAttachments(
  attachments: ChatMessageAttachment[] | undefined,
) {
  if (!Array.isArray(attachments)) {
    return [] as ChatMessageAttachment[];
  }

  return attachments.map(attachment => ({
    id: attachment.id,
    fileName: normalizeAttachmentFileName(attachment.fileName),
    mimeType: normalizeAttachmentMimeType(attachment.mimeType),
    sizeBytes: Math.max(0, Math.trunc(attachment.sizeBytes)),
  }));
}

function normalizeAttachmentFileName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.slice(0, 180) || 'attachment';
}

function normalizeAttachmentMimeType(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || 'application/octet-stream';
}
