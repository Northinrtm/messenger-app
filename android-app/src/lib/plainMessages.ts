import type {ChatMessageAttachment} from '@north/shared';
import {ApiError, updateMessage} from './api';
import {hydrateApiChatMessage} from './messagePayload';
import {sendMessageRealtime} from './realtime';

export async function sendPlainMessage(input: {
  chatId: string;
  clientMessageId: string;
  content: string;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  attachments?: ChatMessageAttachment[];
}) {
  if (!input.clientMessageId.trim()) {
    throw new ApiError('Client message id is required', 400);
  }

  const normalizedContent = input.content.trim();
  const attachments = input.attachments ?? [];
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError('Message content cannot be blank', 400);
  }

  const response = await sendMessageRealtime({
    chatId: input.chatId,
    clientMessageId: input.clientMessageId,
    replyToMessageId: input.replyToMessageId ?? null,
    forwardedFromMessageId: input.forwardedFromMessageId ?? null,
    attachmentIds: attachments.map(attachment => attachment.id),
    plainPayload: {
      content: normalizedContent,
    },
  });

  return hydrateApiChatMessage(response);
}

export async function updatePlainMessage(
  token: string,
  _currentUserId: string,
  chatId: string,
  messageId: string,
  content: string,
  options?: {
    attachments?: ChatMessageAttachment[];
  },
) {
  const normalizedContent = content.trim();
  const attachments = options?.attachments ?? [];
  if (!normalizedContent && attachments.length === 0) {
    throw new ApiError('Message content cannot be blank', 400);
  }

  const response = await updateMessage(token, chatId, messageId, {
    plainPayload: {
      content: normalizedContent,
    },
  });
  return hydrateApiChatMessage(response);
}
