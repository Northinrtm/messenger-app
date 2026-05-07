import type { ApiChatMessage, ChatMessage, ChatMessageAttachment } from "./types";

export function hydrateApiChatMessage(message: ApiChatMessage): ChatMessage {
  return buildHydratedChatMessage(message, message.plainPayload?.content ?? "");
}

export function normalizeChatMessageAttachments(value: unknown): ChatMessageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((attachment) => normalizeChatMessageAttachment(attachment))
    .filter((attachment): attachment is ChatMessageAttachment => attachment !== null);
}

export function normalizeChatMessageAttachment(value: unknown): ChatMessageAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ChatMessageAttachment>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.sizeBytes !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fileName: normalizeAttachmentFileName(candidate.fileName),
    mimeType: normalizeAttachmentMimeType(candidate.mimeType),
    sizeBytes: Math.max(0, Math.trunc(candidate.sizeBytes)),
  };
}

export function normalizeAttachmentFileName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return normalized.slice(0, 180) || "attachment";
}

export function normalizeAttachmentMimeType(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "application/octet-stream";
}

export function buildHydratedChatMessage(
  message: ApiChatMessage,
  content: string,
  editedAt = message.editedAt,
  archivedAttachments?: ChatMessageAttachment[]
): ChatMessage {
  const attachments = archivedAttachments ?? normalizeChatMessageAttachments(message.attachments ?? []);
  return {
    id: message.id,
    chatId: message.chatId,
    serverOrder: message.serverOrder ?? null,
    sender: message.sender,
    content,
    createdAt: message.createdAt,
    editedAt,
    status: message.status,
    clientMessageId: message.clientMessageId ?? null,
    replyTo: message.replyTo,
    reactions: message.reactions ?? [],
    attachments,
  };
}
