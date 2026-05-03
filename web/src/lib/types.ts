export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
  createdAt: string;
  avatarUrl: string | null;
  online: boolean;
  passwordVersion?: number;
  email?: string | null;
  emailVerified?: boolean;
  emailVerificationEnabled?: boolean;
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
  state: "SENDING" | "FAILED" | "SENT" | "DELIVERED" | "READ";
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

export type ChatHistoryBackfillStatus = {
  state: "PENDING" | "PARTIAL" | "COMPLETE";
  requiredHistoryKeyCount: number;
  grantedHistoryKeyCount: number;
  primaryGrantorUserId: string | null;
  joinedAt: string;
  completedAt: string | null;
};

export type ChatPrejoinHistoryPolicy = "JOIN_ONLY" | "FULL_HISTORY";

export type ChatMessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  ciphertextSizeBytes: number;
  key: string;
  iv: string;
};

export type EncryptedMessagePayload = {
  scheme: string;
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
  lastMessageServerOrder?: number | null;
  updatedAt: string;
  unreadCount: number;
  membershipVersion?: number;
  activeHistoryKeyId?: string | null;
  pinnedMessage: MessageSnippet | null;
  historyAccessStatus?: ChatHistoryBackfillStatus | null;
  prejoinHistoryPolicy?: ChatPrejoinHistoryPolicy | null;
};

export type ChatDraft = {
  chatId: string;
  content: string;
  updatedAt: string;
};

export type PendingOutgoingMessage = {
  chatId: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
  localOrder: number | null;
  recipientCount: number;
  replyTo: MessageSnippet | null;
  status: "SENDING" | "FAILED";
  updatedAt: string;
  attachments?: ChatMessageAttachment[];
};

export type WorkspaceBootstrap = {
  profile: UserProfile;
  chats: ChatSummary[];
  archivedChatIds: string[];
  contacts: UserProfile[];
  blockedUsers: UserProfile[];
  drafts: ChatDraft[];
  pendingOutgoingMessages: PendingOutgoingMessage[];
  conferences: VideoConference[];
  archivedConferences: VideoConference[];
};

export type WorkspaceSearch = {
  users: UserProfile[];
  contacts: UserProfile[];
  chats: ChatSummary[];
  conferences: VideoConference[];
};

export type ChatOpen = {
  chat: ChatSummary;
  initialMessages: ApiChatMessage[];
  initialMessagesNextCursor: string | null;
  confirmedPendingOutgoingClientMessageIds: string[];
  activeHistoryKeyAccess: GroupHistoryKeyAccess | null;
};

export type MessagePage = {
  messages: ApiChatMessage[];
  nextCursor: string | null;
  confirmedPendingOutgoingClientMessageIds: string[];
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
  serverOrder?: number | null;
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
  serverOrder?: number | null;
  sender: Participant;
  content: string;
  createdAt: string;
  editedAt: string | null;
  status: MessageStatus | null;
  clientMessageId?: string | null;
  localOrder?: number | null;
  replyTo: MessageSnippet | null;
  reactions: MessageReaction[];
  attachments?: ChatMessageAttachment[];
};

export type MessageSendErrorEvent = {
  chatId: string;
  clientMessageId: string | null;
  status: number;
  error: string;
  details: string[];
};

export type UserSessionInfo = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  deviceName: string;
};

export type PushNotificationConfig = {
  enabled: boolean;
  publicKey: string;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime: string | null;
  keys: {
    p256dh: string;
    auth: string;
  };
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

export type UserEncryptionRecoverySnapshot = {
  snapshotPayloadJson: string;
  wrappedIdentityRecordJson: string;
  wrappedPasswordVersion?: number;
  createdAt: string;
  updatedAt: string;
};

export type GroupHistoryKeyAccess = {
  historyKeyId: string;
  wrappedKeyPayloadJson: string;
  serverGrantPayloadJson?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActiveGroupHistoryKeyEvent = GroupHistoryKeyAccess & {
  chatId: string;
};

export type UserEncryptionAccountKey = {
  userId: string;
  publicKey: string;
  accountKeyVersion: number;
  identityGeneration: number;
  identitySigningPublicKey: string;
  identityKeyAlgorithm: string;
  accountKeyAlgorithm: string;
  signedAt: string;
  signature: string;
};
