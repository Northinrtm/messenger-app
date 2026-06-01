import { ApiError, updateMessage } from "./api";
import { sendMessageRaw } from "./realtime";
import {
  hydrateApiChatMessage,
  normalizeChatMessageAttachments,
} from "./messagePayload";
import type { ChatMessageAttachment, Participant } from "./types";

const TRANSIENT_SEND_STATUSES = new Set([0, 502, 503, 504]);
const MAX_SEND_RETRIES = 3;
const SEND_RETRY_BASE_DELAY_MS = 1_000;

function isTransientSendError(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_SEND_STATUSES.has(error.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  if (!normalizedContent && attachments.length === 0 && !options?.forwardedFromMessageId) {
    throw new ApiError("Message content cannot be blank", 400);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SEND_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(SEND_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), 8_000));
    }
    try {
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
    } catch (error) {
      lastError = error;
      if (!isTransientSendError(error)) {
        throw error;
      }
    }
  }
  throw lastError;
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
