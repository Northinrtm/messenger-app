import type {
  ApiChatMessage,
  ApiErrorResponse,
  AuthResponse,
  ChatMessageAttachment,
  ChatOpen,
  ChatSummary,
  InviteLink,
  VideoConference,
  MessagePage,
  MessageReactionEvent,
  MobileAuthResponse,
  MobileRefreshRequest,
  PendingOutgoingMessage,
  Participant,
  UserProfile,
  UserSessionInfo,
  WorkspaceBootstrap,
  WorkspaceSearch,
} from '@north/shared';
import {API_URL} from '../config';

type QueryValue = string | number | undefined | null;

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(message: string, status = 500, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
};

type ChatAttachmentUploadTargetResponse = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadUrl: string;
  uploadMethod: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
};

type ChatAttachmentDownloadUrlResponse = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
  expiresAt: string;
};

function buildRequestUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedBaseUrl = API_URL.endsWith('/')
    ? API_URL.slice(0, -1)
    : API_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? 10000);

  let response: Response;
  try {
    response = await fetch(buildRequestUrl(path, options.query), {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? {'Content-Type': 'application/json'} : {}),
        ...(options.token ? {Authorization: `Bearer ${options.token}`} : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out', 0);
    }
    throw new ApiError('Cannot reach backend. Check API URL and device connectivity.', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}

async function parseApiError(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as ApiErrorResponse;
      return new ApiError(payload.error, response.status, payload.details ?? []);
    } catch {
      return new ApiError(`Request failed (${response.status})`, response.status);
    }
  }

  try {
    const text = (await response.text()).trim();
    return new ApiError(text || `Request failed (${response.status})`, response.status);
  } catch {
    return new ApiError(`Request failed (${response.status})`, response.status);
  }
}

export function describeError(error: unknown) {
  if (error instanceof ApiError) {
    return [error.message, ...error.details].filter(Boolean).join('. ');
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unexpected error';
}

export function register(input: {
  username: string;
  email: string;
  displayName: string;
  password: string;
}) {
  return request<MobileAuthResponse>('/api/mobile/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function login(input: {username: string; password: string}) {
  return request<MobileAuthResponse>('/api/mobile/auth/login', {
    method: 'POST',
    body: input,
  });
}

export function refreshSession(input: MobileRefreshRequest) {
  return request<MobileAuthResponse>('/api/mobile/auth/refresh', {
    method: 'POST',
    body: input,
  });
}

export function logout(input: MobileRefreshRequest) {
  return request<void>('/api/mobile/auth/logout', {
    method: 'POST',
    body: input,
  });
}

export function resendOwnEmailVerification(token: string) {
  return request<void>('/api/auth/me/email-verification', {
    method: 'POST',
    token,
  });
}

export function getWorkspaceBootstrap(token: string) {
  return request<WorkspaceBootstrap>('/api/workspace/bootstrap', {
    token,
  });
}

export function createDirectChat(token: string, participantUsername: string) {
  return request<ChatSummary>('/api/chats/direct', {
    method: 'POST',
    token,
    body: {participantUsername},
  });
}

export function searchWorkspace(token: string, query: string) {
  return request<WorkspaceSearch>('/api/search', {
    token,
    query: {query},
  });
}

export function updateArchivedChat(token: string, chatId: string, archived: boolean) {
  return request<void>(`/api/chats/${encodeURIComponent(chatId)}/archive`, {
    method: 'PUT',
    token,
    body: {archived},
  });
}

export function deleteChatForSelf(token: string, chatId: string) {
  return request<void>(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
    token,
  });
}

export function leaveChatGroup(token: string, chatId: string) {
  return request<void>(`/api/chats/${encodeURIComponent(chatId)}/leave`, {
    method: 'POST',
    token,
  });
}

export function createConference(
  token: string,
  input: {
    title: string;
    scheduledAt: string;
    participantUsernames?: string[];
  },
) {
  return request<VideoConference>('/api/conferences', {
    method: 'POST',
    token,
    body: {
      title: input.title,
      scheduledAt: input.scheduledAt,
      participantUsernames: input.participantUsernames ?? [],
    },
  });
}

export function startVideoConference(token: string, conferenceId: string) {
  return request<VideoConference>(
    `/api/conferences/${encodeURIComponent(conferenceId)}/start`,
    {
      method: 'POST',
      token,
    },
  );
}

export function endVideoConference(token: string, conferenceId: string) {
  return request<VideoConference>(`/api/conferences/${encodeURIComponent(conferenceId)}`, {
    method: 'DELETE',
    token,
  });
}

export function cancelVideoConference(token: string, conferenceId: string) {
  return request<void>(
    `/api/conferences/${encodeURIComponent(conferenceId)}/schedule`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function createConferenceInviteLink(
  token: string,
  conferenceId: string,
  options?: {refresh?: boolean},
) {
  return request<InviteLink>(
    `/api/invite-links/conferences/${encodeURIComponent(conferenceId)}`,
    {
      method: 'POST',
      token,
      query: {refresh: options?.refresh === true ? 1 : undefined},
    },
  );
}

export function touchConferencePresence(token: string, conferenceId: string) {
  return request<void>(
    `/api/conferences/${encodeURIComponent(conferenceId)}/presence`,
    {
      method: 'POST',
      token,
    },
  );
}

export function clearConferencePresence(token: string, conferenceId: string) {
  return request<void>(
    `/api/conferences/${encodeURIComponent(conferenceId)}/presence`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function blockUser(token: string, username: string) {
  return request<UserProfile>('/api/users/blocks', {
    method: 'POST',
    token,
    body: {username},
  });
}

export function addContact(token: string, username: string) {
  return request<UserProfile>('/api/users/contacts', {
    method: 'POST',
    token,
    body: {username},
  });
}

export function removeContact(token: string, username: string) {
  return request<void>(`/api/users/contacts/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    token,
  });
}

export function unblockUser(token: string, username: string) {
  return request<void>(`/api/users/blocks/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    token,
  });
}

export async function uploadChatAttachment(
  token: string,
  chatId: string,
  input: {
    uri: string;
    fileName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  },
) {
  const blob = await readLocalFileBlob(input.uri);
  const fileName = normalizeAttachmentFileName(input.fileName);
  const mimeType = normalizeAttachmentMimeType(input.mimeType ?? blob.type);
  const sizeBytes =
    typeof input.sizeBytes === 'number' && input.sizeBytes > 0
      ? input.sizeBytes
      : blob.size;

  const uploadTarget = await request<ChatAttachmentUploadTargetResponse>(
    `/api/chats/${encodeURIComponent(chatId)}/attachments/initiate`,
    {
      method: 'POST',
      token,
      body: {
        fileName,
        mimeType,
        sizeBytes,
      },
    },
  );

  const response = await fetch(uploadTarget.uploadUrl, {
    method: uploadTarget.uploadMethod,
    headers: uploadTarget.uploadHeaders,
    body: blob,
  });

  if (!response.ok) {
    throw new ApiError('Attachment upload failed', response.status);
  }

  return {
    id: uploadTarget.id,
    fileName: uploadTarget.fileName,
    mimeType: uploadTarget.mimeType,
    sizeBytes: uploadTarget.sizeBytes,
  } satisfies ChatMessageAttachment;
}

export function downloadChatAttachment(
  token: string,
  chatId: string,
  attachmentId: string,
) {
  return request<ChatAttachmentDownloadUrlResponse>(
    `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(
      attachmentId,
    )}/download-url`,
    {
      token,
    },
  );
}

export function getChatOpen(
  token: string,
  chatId: string,
  options: {
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {},
) {
  return request<ChatOpen>(`/api/chats/${encodeURIComponent(chatId)}/open`, {
    token,
    query: {
      acknowledgeDelivered:
        options.acknowledgeDelivered === undefined
          ? undefined
          : options.acknowledgeDelivered
            ? 1
            : 0,
      limit: options.limit,
    },
  });
}

export function getMessagesPage(
  token: string,
  chatId: string,
  options: {
    cursor?: string | null;
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {},
) {
  return request<MessagePage>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/page`,
    {
      token,
      query: {
        acknowledgeDelivered:
          options.acknowledgeDelivered === undefined
            ? undefined
            : options.acknowledgeDelivered
              ? 1
              : 0,
        cursor: options.cursor,
        limit: options.limit,
      },
    },
  );
}

export function acknowledgeRead(
  token: string,
  chatId: string,
  messageIds: string[],
) {
  return request<void>(`/api/chats/${encodeURIComponent(chatId)}/messages/read`, {
    method: 'POST',
    token,
    body: {messageIds},
  });
}

export function getTypingParticipants(token: string, chatId: string) {
  return request<Participant[]>(
    `/api/chats/${encodeURIComponent(chatId)}/typing`,
    {
      token,
    },
  );
}

export function toggleMessageReaction(
  token: string,
  chatId: string,
  messageId: string,
  key: MessageReactionEvent['reactions'][number]['key'],
) {
  return request<MessageReactionEvent>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(
      messageId,
    )}/reactions`,
    {
      method: 'PUT',
      token,
      body: {key},
    },
  );
}

export function deleteMessage(
  token: string,
  chatId: string,
  messageId: string,
  scope: 'EVERYONE' | 'SELF' = 'EVERYONE',
) {
  return request<void>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
    {method: 'DELETE', token, query: {scope}},
  );
}

export function deleteMessages(
  token: string,
  chatId: string,
  messageIds: string[],
  scope: 'EVERYONE' | 'SELF' = 'EVERYONE',
) {
  return request<void>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/delete-batch`,
    {method: 'POST', token, body: {messageIds}, query: {scope}},
  );
}

export function pinMessage(token: string, chatId: string, messageId: string | null) {
  return request<ChatSummary>(
    `/api/chats/${encodeURIComponent(chatId)}/pin`,
    {method: 'PUT', token, body: {messageId}},
  );
}

export function updateMessage(
  token: string,
  chatId: string,
  messageId: string,
  body: {
    plainPayload: {
      content: string;
    };
  },
) {
  return request<ApiChatMessage>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(
      messageId,
    )}`,
    {
      method: 'PUT',
      token,
      body,
    },
  );
}

export function upsertPendingOutgoingMessage(
  token: string,
  clientMessageId: string,
  body: {
    chatId: string;
    content: string;
    createdAt: string;
    localOrder?: number | null;
    recipientCount: number;
    replyTo?: {
      id: string;
      sender: PendingOutgoingMessage['replyTo'] extends infer ReplyTo
        ? ReplyTo extends {sender: infer Sender}
          ? Sender
          : never
        : never;
      createdAt: string;
      preview: string;
    } | null;
    forwardedFromMessageId?: string | null;
    status: 'SENDING' | 'FAILED';
    attachments?: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  },
) {
  return request<PendingOutgoingMessage>(
    `/api/messages/pending-outgoing/${encodeURIComponent(clientMessageId)}`,
    {
      method: 'PUT',
      token,
      body,
    },
  );
}

export function deletePendingOutgoingMessage(
  token: string,
  clientMessageId: string,
) {
  return request<void>(
    `/api/messages/pending-outgoing/${encodeURIComponent(clientMessageId)}`,
    {
      method: 'DELETE',
      token,
    },
  );
}

export function changeUsername(token: string, newUsername: string) {
  return request<MobileAuthResponse>('/api/mobile/auth/me/username', {
    method: 'PUT',
    token,
    body: {newUsername},
    timeoutMs: 10000,
  });
}

export function requestEmailChange(token: string, newEmail: string) {
  return request<void>('/api/auth/me/email-change/request', {
    method: 'POST',
    token,
    body: {newEmail},
    timeoutMs: 10000,
  });
}

export function updateProfile(
  token: string,
  input: {
    displayName: string;
    profession?: string | null;
    mailEnabled?: boolean | null;
  },
) {
  return request<UserProfile>('/api/auth/me', {
    method: 'PUT',
    token,
    body: {
      displayName: input.displayName,
      profession: input.profession ?? null,
      mailEnabled: input.mailEnabled ?? null,
    },
  });
}

export function updateAvatar(token: string, avatarUrl: string | null) {
  return request<UserProfile>('/api/auth/me/avatar', {
    method: 'PUT',
    token,
    body: {avatarUrl},
  });
}

export function listSessions(token: string) {
  return request<UserSessionInfo[]>('/api/auth/sessions', {
    method: 'GET',
    token,
    timeoutMs: 10000,
  });
}

export function revokeSession(token: string, sessionId: string) {
  return request<void>(`/api/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    token,
    timeoutMs: 10000,
  });
}

export function toAuthResponse(response: MobileAuthResponse): AuthResponse {
  return {
    token: response.token,
    tokenExpiresAt: response.tokenExpiresAt,
    sessionId: response.sessionId,
    user: response.user,
  };
}

function readLocalFileBlob(uri: string) {
  return new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => {
      reject(new ApiError('Attachment file could not be read on this device.', 0));
    };
    xhr.onload = () => {
      if (!xhr.response) {
        reject(new ApiError('Attachment file is empty or unavailable.', 0));
        return;
      }
      resolve(xhr.response as Blob);
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send();
  });
}

function normalizeAttachmentFileName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.slice(0, 180) || 'attachment';
}

function normalizeAttachmentMimeType(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || 'application/octet-stream';
}
