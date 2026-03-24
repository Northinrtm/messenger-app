export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  avatarUrl: string | null;
  online: boolean;
};

export type Participant = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
};

export type AuthResponse = {
  token: string;
  tokenExpiresAt: string;
  sessionId: string;
  user: UserProfile;
};

export type MessageStatus = {
  state: "SENT" | "DELIVERED" | "READ";
  recipientCount: number;
  deliveredCount: number;
  readCount: number;
};

export type ChatSummary = {
  id: string;
  direct: boolean;
  title: string;
  members: Participant[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  unreadCount: number;
};

export type ChatDraft = {
  chatId: string;
  content: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  content: string;
  createdAt: string;
  status: MessageStatus | null;
};

export type UserSessionInfo = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  deviceName: string;
};

export type SessionEvent = {
  type: "SESSION_REVOKED";
  sessionId: string;
};

export type TypingEvent = {
  chatId: string;
  participant: Participant;
  typing: boolean;
  createdAt: string;
};

export type MessageStatusEvent = {
  messageId: string;
  chatId: string;
  status: MessageStatus;
};

export type ApiErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  path: string;
  details: string[];
};
