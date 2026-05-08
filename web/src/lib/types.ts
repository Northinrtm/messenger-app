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

export type ChatPrejoinHistoryPolicy = "JOIN_ONLY" | "FULL_HISTORY";

export type ChatCapabilities = {
  canEditGroup: boolean;
  canDeleteGroup: boolean;
  canManageInviteLink: boolean;
  canAddMembers: boolean;
  canManageRoles: boolean;
  canModerateMembers: boolean;
  canTogglePrejoinHistory: boolean;
  canLeaveGroup: boolean;
};

export type ChatMessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChatAttachmentBrowserKind = "ALL" | "PHOTOS" | "DOCUMENTS";

export type SourceMessageJumpTarget = {
  messageId: string;
  messageServerOrder: number | null;
};

export type ChatAttachmentBrowserItem = SourceMessageJumpTarget & {
  id: string;
  createdAt: string;
  sender: Participant;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChatAttachmentBrowserPage = {
  items: ChatAttachmentBrowserItem[];
  nextCursor: string | null;
};

export type ChatLinkBrowserItem = SourceMessageJumpTarget & {
  id: string;
  createdAt: string;
  sender: Participant;
  url: string;
  host: string | null;
};

export type ChatLinkBrowserPage = {
  items: ChatLinkBrowserItem[];
  nextCursor: string | null;
};

export type PlainMessagePayload = {
  content: string;
};

export type ChatSummary = {
  id: string;
  direct: boolean;
  title: string;
  avatarUrl: string | null;
  chatVersion: string;
  capabilities: ChatCapabilities;
  ownerUserId: string | null;
  moderatorUserIds: string[];
  members: Participant[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageServerOrder?: number | null;
  updatedAt: string;
  unreadCount: number;
  membershipVersion?: number;
  pinnedMessage: MessageSnippet | null;
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
  workspaceVersion: string;
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
  chatId: string | null;
  activeParticipantCount: number;
  activeParticipantUserIds: string[];
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
  plainPayload?: PlainMessagePayload | null;
  attachments?: ChatMessageAttachment[];
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
