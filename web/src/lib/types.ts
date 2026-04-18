export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
  createdAt: string;
  avatarUrl: string | null;
  online: boolean;
};

export type Participant = {
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
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

export type MessageReaction = {
  key: "LIKE" | "DISLIKE" | "EYES" | "OK";
  count: number;
  reactedByCurrentUser: boolean;
};

export type MessageSnippet = {
  id: string;
  sender: Participant;
  createdAt: string;
  preview: string;
};

export type EncryptedMessagePayload = {
  scheme: string;
  encryptedKeysByRecipientId: Record<string, string>;
  sharedEnvelope?: string | null;
};

export type ChatSummary = {
  id: string;
  direct: boolean;
  title: string;
  avatarUrl: string | null;
  ownerUserId: string | null;
  moderatorUserIds: string[];
  members: Participant[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  unreadCount: number;
  pinnedMessage: MessageSnippet | null;
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

export type InviteLink = {
  code: string;
};

export type InviteAcceptance = {
  targetType: "GROUP" | "CONFERENCE";
  chat: ChatSummary | null;
  conference: VideoConference | null;
};

export type ApiChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  createdAt: string;
  editedAt: string | null;
  status: MessageStatus | null;
  clientMessageId?: string | null;
  replyTo: MessageSnippet | null;
  reactions: MessageReaction[];
  encryptedPayload: EncryptedMessagePayload | null;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  content: string;
  createdAt: string;
  editedAt: string | null;
  status: MessageStatus | null;
  clientMessageId?: string | null;
  localOrder?: number | null;
  replyTo: MessageSnippet | null;
  reactions: MessageReaction[];
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

export type MessageReactionEvent = {
  messageId: string;
  chatId: string;
  reactions: MessageReaction[];
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

export type UserEncryptionDevicePrekey = {
  keyId: number;
  publicKey: string;
};

export type UserEncryptionDevice = {
  deviceId: string;
  deviceName: string;
  identityKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  availableOneTimePrekeys: number;
  registeredAt: string;
  lastSeenAt: string;
};

export type UserEncryptionDeviceBundle = {
  userId: string;
  deviceId: string;
  deviceName: string;
  identityKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekey: UserEncryptionDevicePrekey | null;
  registeredAt: string;
  lastSeenAt: string;
};
