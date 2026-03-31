import { API_URL } from "./config";
import type {
  ApiErrorResponse,
  ApiChatMessage,
  AuthResponse,
  ChatDraft,
  ChatSummary,
  Participant,
  UserEncryptionKeyBundle,
  UserEncryptionPublicKey,
  VideoConference,
  UserProfile,
  UserSessionInfo,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(message: string, status = 500, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
};

function buildRequestUrl(path: string, query?: Record<string, string | number | undefined | null>) {
  const normalizedBaseUrl =
    API_URL === "/"
      ? ""
      : API_URL.endsWith("/")
        ? API_URL.slice(0, -1)
        : API_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildRequestUrl(path, options.query);

  const response = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      payload = null;
    }

    throw new ApiError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.details ?? []
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function extractFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export function register(input: {
  username: string;
  displayName: string;
  password: string;
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: input,
  });
}

export function login(input: { username: string; password: string }) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: input,
  });
}

export function refreshSession() {
  return request<AuthResponse>("/api/auth/refresh", {
    method: "POST",
  });
}

export function logout() {
  return request<void>("/api/auth/logout", {
    method: "POST",
  });
}

export function getSessions(token: string) {
  return request<UserSessionInfo[]>("/api/auth/sessions", { token });
}

export function getProfile(token: string) {
  return request<UserProfile>("/api/auth/me", { token });
}

export function updateProfile(token: string, input: { displayName: string }) {
  return request<UserProfile>("/api/auth/me", {
    method: "PUT",
    token,
    body: input,
  });
}

export function updateProfileAvatar(token: string, avatarUrl: string | null) {
  return request<UserProfile>("/api/auth/me/avatar", {
    method: "PUT",
    token,
    body: { avatarUrl },
  });
}

export function revokeSession(token: string, sessionId: string) {
  return request<void>(`/api/auth/sessions/${sessionId}`, {
    method: "DELETE",
    token,
  });
}

export function getChats(token: string) {
  return request<ChatSummary[]>("/api/chats", { token });
}

export function getArchivedChats(token: string) {
  return request<string[]>("/api/chats/archive", { token });
}

export function getDrafts(token: string) {
  return request<ChatDraft[]>("/api/chats/drafts", { token });
}

export function getVideoConferences(token: string) {
  return request<VideoConference[]>("/api/conferences", { token });
}

export function getArchivedVideoConferences(token: string) {
  return request<VideoConference[]>("/api/conferences/archive", { token });
}

export function createVideoConference(
  token: string,
  input: { title: string; scheduledAt: string; participantUsernames: string[] }
) {
  return request<VideoConference>("/api/conferences", {
    method: "POST",
    token,
    body: input,
  });
}

export function startVideoConference(token: string, conferenceId: string) {
  return request<VideoConference>(`/api/conferences/${conferenceId}/start`, {
    method: "POST",
    token,
  });
}

export function addConferenceParticipants(
  token: string,
  conferenceId: string,
  input: { participantUsernames: string[] }
) {
  return request<VideoConference>(`/api/conferences/${conferenceId}/participants`, {
    method: "POST",
    token,
    body: input,
  });
}

export async function uploadConferenceRecording(
  token: string,
  conferenceId: string,
  file: Blob,
  fileName: string
) {
  const formData = new FormData();
  formData.append("file", file, fileName);
  const response = await fetch(buildRequestUrl(`/api/conferences/${conferenceId}/recording`), {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      payload = null;
    }

    throw new ApiError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.details ?? []
    );
  }

  return (await response.json()) as VideoConference;
}

export async function downloadConferenceRecording(token: string, conferenceId: string) {
  const response = await fetch(buildRequestUrl(`/api/conferences/${conferenceId}/recording`), {
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      payload = null;
    }

    throw new ApiError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.details ?? []
    );
  }

  return {
    blob: await response.blob(),
    fileName: extractFileName(response.headers.get("content-disposition")),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

export function endVideoConference(token: string, conferenceId: string) {
  return request<VideoConference>(`/api/conferences/${conferenceId}`, {
    method: "DELETE",
    token,
  });
}

export function createDirectChat(token: string, participantUsername: string) {
  return request<ChatSummary>("/api/chats/direct", {
    method: "POST",
    token,
    body: { participantUsername },
  });
}

export function createGroupChat(
  token: string,
  input: { title: string; participantUsernames: string[] }
) {
  return request<ChatSummary>("/api/chats/group", {
    method: "POST",
    token,
    body: input,
  });
}

export function getMessagesRaw(
  token: string,
  chatId: string,
  options: { before?: string | null; limit?: number } = {}
) {
  return request<ApiChatMessage[]>(`/api/chats/${chatId}/messages`, {
    token,
    query: {
      before: options.before,
      limit: options.limit,
    },
  });
}

export function sendMessageRaw(
  token: string,
  chatId: string,
  body: {
    encryptedPayload: {
      scheme: string;
      ciphertext: string;
      iv: string;
      encryptedKeysByUserId: Record<string, string>;
    };
  }
) {
  return request<ApiChatMessage>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    token,
    body,
  });
}

export function acknowledgeDelivered(token: string, chatId: string, messageIds: string[]) {
  return request<void>(`/api/chats/${chatId}/messages/delivered`, {
    method: "POST",
    token,
    body: { messageIds },
  });
}

export function acknowledgeRead(token: string, chatId: string, messageIds: string[]) {
  return request<void>(`/api/chats/${chatId}/messages/read`, {
    method: "POST",
    token,
    body: { messageIds },
  });
}

export function sendTypingState(token: string, chatId: string, typing: boolean) {
  return request<void>(`/api/chats/${chatId}/typing`, {
    method: "POST",
    token,
    body: { typing },
  });
}

export function getTypingParticipants(token: string, chatId: string) {
  return request<Participant[]>(`/api/chats/${chatId}/typing`, {
    token,
  });
}

export function addGroupParticipants(
  token: string,
  chatId: string,
  input: { participantUsernames: string[] }
) {
  return request<ChatSummary>(`/api/chats/${chatId}/participants`, {
    method: "POST",
    token,
    body: input,
  });
}

export function updateArchivedChat(token: string, chatId: string, archived: boolean) {
  return request<void>(`/api/chats/${chatId}/archive`, {
    method: "PUT",
    token,
    body: { archived },
  });
}

export function updateDraft(token: string, chatId: string, content: string) {
  return request<void>(`/api/chats/${chatId}/draft`, {
    method: "PUT",
    token,
    body: { content },
  });
}

export function searchUsers(token: string, query: string) {
  return request<UserProfile[]>("/api/users/search", {
    token,
    query: { query },
  });
}

export function getOwnEncryptionKeyBundle(token: string) {
  return request<UserEncryptionKeyBundle>("/api/e2ee/me", { token });
}

export function upsertOwnEncryptionKeyBundle(
  token: string,
  body: {
    publicKey: string;
    encryptedPrivateKey: string;
    kdfSalt: string;
    kdfIv: string;
    kdfIterations: number;
  }
) {
  return request<UserEncryptionKeyBundle>("/api/e2ee/me", {
    method: "PUT",
    token,
    body,
  });
}

export function resolveEncryptionPublicKeys(token: string, userIds: string[]) {
  return request<UserEncryptionPublicKey[]>("/api/e2ee/keys/resolve", {
    method: "POST",
    token,
    body: { userIds },
  });
}

export function getContacts(token: string) {
  return request<UserProfile[]>("/api/users/contacts", { token });
}

export function addContact(token: string, username: string) {
  return request<UserProfile>("/api/users/contacts", {
    method: "POST",
    token,
    body: { username },
  });
}

export function removeContact(token: string, username: string) {
  return request<void>(`/api/users/contacts/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token,
  });
}
