import type {
  ApiChatMessage,
  ApiErrorResponse,
  AuthResponse,
  ChatOpen,
  MessagePage,
  MessageReactionEvent,
  MobileAuthResponse,
  MobileRefreshRequest,
  PendingOutgoingMessage,
  Participant,
  WorkspaceBootstrap,
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

export function getWorkspaceBootstrap(token: string) {
  return request<WorkspaceBootstrap>('/api/workspace/bootstrap', {
    token,
  });
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

export function toAuthResponse(response: MobileAuthResponse): AuthResponse {
  return {
    token: response.token,
    tokenExpiresAt: response.tokenExpiresAt,
    sessionId: response.sessionId,
    user: response.user,
  };
}
