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
  state: "SENDING" | "SENT" | "DELIVERED" | "READ";
  recipientCount: number;
  deliveredCount: number;
  readCount: number;
};

export type EncryptedMessagePayload = {
  scheme: string;
  ciphertext: string;
  iv: string;
  encryptedKey: string;
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

export type VideoConference = {
  id: string;
  title: string;
  roomName: string | null;
  roomAccessCode: string | null;
  scheduledAt: string;
  createdAt: string;
  activatedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingCreatedAt: string | null;
  recordingSizeBytes: number | null;
  recordingMimeType: string | null;
  createdBy: Participant;
  participants: Participant[];
};

export type ApiChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  createdAt: string;
  status: MessageStatus | null;
  clientMessageId?: string | null;
  encryptedPayload: EncryptedMessagePayload;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  content: string;
  createdAt: string;
  status: MessageStatus | null;
  clientMessageId?: string | null;
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

export type MessageDeletionEvent = {
  messageId: string;
  chatId: string;
};

export type ChatRemovalEvent = {
  chatId: string;
};

export type ApiErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  path: string;
  details: string[];
};

export type UserEncryptionKeyBundle = {
  userId: string;
  publicKey: string;
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfIv: string;
  kdfIterations: number;
  createdAt: string;
  updatedAt: string;
};

export type UserEncryptionPublicKey = {
  userId: string;
  publicKey: string;
};
