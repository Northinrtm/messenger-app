import type {
  ChatMessage,
  MessageReaction,
  MessageSnippet,
  MessageStatus,
  Participant,
  UserProfile,
} from "../../lib/types";

export const MESSAGE_REACTION_OPTIONS: Array<{
  key: MessageReaction["key"];
  emoji: string;
  label: string;
}> = [
  { key: "LIKE", emoji: "\uD83D\uDC4D", label: "\u041B\u0430\u0439\u043A" },
  { key: "DISLIKE", emoji: "\uD83D\uDC4E", label: "\u0414\u0438\u0437\u043B\u0430\u0439\u043A" },
  { key: "EYES", emoji: "\uD83D\uDC40", label: "\u0413\u043B\u0430\u0437\u0430" },
  { key: "OK", emoji: "\uD83D\uDC4C", label: "\u041E\u043A\u0435\u0439" },
];

type SendMessageInput = {
  chatId: string;
  clientMessageId: string;
  content: string;
  localOrder: number;
  participants: Participant[];
  replyTo?: MessageSnippet | null;
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

export function buildChatListPreviewText(message: Pick<ChatMessage, "content" | "replyTo">) {
  if (message.replyTo) {
    return `\u21AA ${message.replyTo.sender.displayName}: ${buildMessagePreview(message.replyTo.preview, 56)}`;
  }

  return buildMessagePreview(message.content, 88);
}

export function toMessageSnippet(
  message: Pick<ChatMessage, "id" | "sender" | "createdAt" | "content">,
): MessageSnippet {
  return {
    id: message.id,
    sender: message.sender,
    createdAt: message.createdAt,
    preview: buildMessagePreview(message.content, 88),
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
    case "DELIVERED":
      return "\u2713\u2713";
    case "SENT":
    default:
      return "\u2713";
  }
}

export function getMessageStatusLabel(status: MessageStatus | null) {
  switch (status?.state) {
    case "FAILED":
      return "\u041D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E";
    case "SENDING":
      return "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F";
    case "READ":
      return "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E";
    case "DELIVERED":
      return "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E";
    case "SENT":
    default:
      return "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E";
  }
}
