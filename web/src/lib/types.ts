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

export type ApiErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  path: string;
  details: string[];
};

