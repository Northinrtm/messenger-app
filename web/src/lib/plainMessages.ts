import { ApiError, updateMessage } from "./api";
import { sendMessageRaw } from "./realtime";
import {
  hydrateApiChatMessage,
  normalizeChatMessageAttachments,
} from "./messagePayload";
import type { ChatMessageAttachment, Participant } from "./types";

export async function sendPlainMessage(
  token: string,
  currentUserId: string,
  chatId: string,
  content: string,
  _participants: Participant[],
  clientMessageId?: string,
  replyToMessageId?: string | null,
  options?: {
    attachments?: ChatMessageAttachment[];
    forwardedFromMessageId?: string | null;
  }
) {
  const resolvedClientMessageId = clientMessageId?.trim() ?? "";
  if (!resolvedClientMessageId) {
    throw new ApiError("Client message id is required", 400);
  }

  const attachments = normalizeChatMessageAttachments(options?.attachments ?? []);
  const normalizedContent = content.trim();
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  const response = await sendMessageRaw(token, chatId, {
    clientMessageId: resolvedClientMessageId,
    replyToMessageId: replyToMessageId ?? null,
    forwardedFromMessageId: options?.forwardedFromMessageId ?? null,
    attachmentIds: attachments.map((attachment) => attachment.id),
    plainPayload: {
      content: normalizedContent,
    },
  });

  void currentUserId;
  return hydrateApiChatMessage(response);
}

export async function updatePlainMessage(
  token: string,
  currentUserId: string,
  chatId: string,
  messageId: string,
  content: string,
  options?: {
    attachments?: ChatMessageAttachment[];
  }
) {
  const attachments = normalizeChatMessageAttachments(options?.attachments ?? []);
  const normalizedContent = content.trim();
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  const response = await updateMessage(token, chatId, messageId, {
    plainPayload: {
      content: normalizedContent,
    },
  });

  void currentUserId;
  return hydrateApiChatMessage(response);
}
