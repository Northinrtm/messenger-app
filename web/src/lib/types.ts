export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
};

export type Participant = {
  id: string;
  username: string;
  displayName: string;
};

export type AuthResponse = {
  token: string;
  tokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: UserProfile;
};

export type ChatSummary = {
  id: string;
  direct: boolean;
  title: string;
  members: Participant[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  sender: Participant;
  content: string;
  createdAt: string;
};

export type UserSessionInfo = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export type SessionEvent = {
  type: "SESSION_REVOKED";
  sessionId: string;
};

export type ApiErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  path: string;
  details: string[];
};
