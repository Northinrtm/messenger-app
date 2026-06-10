import { tActive } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import type {
  ChatMessage,
  ChatMessageAttachment,
  MessageReaction,
  MessageSnippet,
  MessageStatus,
  Participant,
  UserProfile,
} from "../../lib/types";

export const MESSAGE_REACTION_OPTIONS: Array<{
  key: MessageReaction["key"];
  emoji: string;
  labelKey: TranslationKey;
}> = [
  { key: "LIKE", emoji: "\uD83D\uDC4D", labelKey: "reaction.like" },
  { key: "DISLIKE", emoji: "\uD83D\uDC4E", labelKey: "reaction.dislike" },
  { key: "EYES", emoji: "\uD83D\uDC40", labelKey: "reaction.eyes" },
  { key: "OK", emoji: "\uD83D\uDC4C", labelKey: "reaction.ok" },
];

type SendMessageInput = {
  chatId: string;
  clientMessageId: string;
  content: string;
  localOrder: number;
  participants: Participant[];
  replyTo?: MessageSnippet | null;
  attachments?: ChatMessageAttachment[];
};

export function createOptimisticOutgoingMessage(
  currentUser: UserProfile,
  input: SendMessageInput,
): ChatMessage {
  return {
    id: input.clientMessageId,
    chatId: input.chatId,
    serverOrder: null,
    sender: currentUser,
    content: input.content,
    createdAt: new Date().toISOString(),
    editedAt: null,
    clientMessageId: input.clientMessageId,
    localOrder: input.localOrder,
    replyTo: input.replyTo ?? null,
    reactions: [],
    forwarded: false,
    forwardedFrom: null,
    attachments: input.attachments ?? [],
    status: {
      state: "SENDING",
      recipientCount: Math.max(0, input.participants.length - 1),
      deliveredCount: 0,
      readCount: 0,
    },
  };
}

export function ensureOwnMessageStatus(message: ChatMessage, currentUser: UserProfile): ChatMessage {
  if (!isOwnMessage(message, currentUser) || message.status !== null) {
    return message;
  }

  return {
    ...message,
    status: {
      state: "SENT",
      recipientCount: 0,
      deliveredCount: 0,
      readCount: 0,
    },
  };
}

export function getMessageReaction(message: ChatMessage, key: MessageReaction["key"]) {
  return message.reactions.find((reaction) => reaction.key === key) ?? null;
}

export function getReactionOption(key: MessageReaction["key"]) {
  return MESSAGE_REACTION_OPTIONS.find((reaction) => reaction.key === key) ?? null;
}

export function buildMessagePreview(content: string, maxLength = 96) {
  const collapsedText = content.trim().replace(/\s+/g, " ");
  if (collapsedText.length <= maxLength) {
    return collapsedText;
  }

  return `${collapsedText.slice(0, maxLength - 3)}...`;
}

export function buildAttachmentOnlyMessageText(attachments: ChatMessageAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    return tActive("preview.file", { name: attachments[0].fileName });
  }

  return tActive("preview.files", { count: attachments.length });
}

export function buildMessageContentPreview(
  message: Pick<ChatMessage, "content" | "attachments">,
  maxLength = 88,
) {
  const collapsedText = message.content.trim().replace(/\s+/g, " ");
  if (collapsedText) {
    return buildMessagePreview(collapsedText, maxLength);
  }

  return buildMessagePreview(buildAttachmentOnlyMessageText(message.attachments ?? []), maxLength);
}

export function buildChatListPreviewText(
  message: Pick<ChatMessage, "content" | "replyTo" | "attachments">,
) {
  if (message.replyTo) {
    // Show the reply's own text (prefixed with a reply arrow), not the quoted message \u2014 the chat
    // list should reflect the latest activity, not the message that was replied to.
    return `\u21AA ${buildMessageContentPreview(message, 86)}`;
  }

  return buildMessageContentPreview(message, 88);
}

export function toMessageSnippet(
  message: Pick<
    ChatMessage,
    "id" | "sender" | "createdAt" | "content" | "attachments" | "serverOrder"
  >,
): MessageSnippet {
  return {
    id: message.id,
    sender: message.sender,
    createdAt: message.createdAt,
    preview: buildMessageContentPreview(message, 88),
    serverOrder: message.serverOrder ?? null,
  };
}

export function isOwnMessage(message: ChatMessage, currentUser: UserProfile) {
  return message.sender.username === currentUser.username;
}

export function getMessageStatusClassName(status: MessageStatus | null) {
  switch (status?.state) {
    case "FAILED":
      return "message-status is-failed";
    case "SENDING":
    case "SENT":
      return "message-status is-sent";
    case "READ":
      return "message-status is-read";
    case "DELIVERED":
      return "message-status is-delivered";
    default:
      return "message-status is-sent";
  }
}

export function getMessageStatusGlyph(status: MessageStatus | null) {
  switch (status?.state) {
    case "FAILED":
      return "!";
    case "SENDING":
      return "\u2026";
    case "READ":
      return "\u2713\u2713";
    case "DELIVERED":
      return "\u2713";
    case "SENT":
    default:
      return "\u2713";
  }
}

export function getMessageStatusLabelKey(status: MessageStatus | null): TranslationKey {
  switch (status?.state) {
    case "FAILED":
      return "msgstatus.failed";
    case "SENDING":
      return "msgstatus.sending";
    case "READ":
      return "msgstatus.read";
    case "DELIVERED":
      return "msgstatus.delivered";
    case "SENT":
    default:
      return "msgstatus.sent";
  }
}
