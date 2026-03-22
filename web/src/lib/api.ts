import { API_URL } from "./config";
import type {
  ApiErrorResponse,
  AuthResponse,
  ChatMessage,
  ChatSummary,
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const normalizedBaseUrl =
    API_URL === "/"
      ? ""
      : API_URL.endsWith("/")
        ? API_URL.slice(0, -1)
        : API_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`, window.location.origin);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
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

export function refreshSession(refreshToken: string) {
  return request<AuthResponse>("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
}

export function logout(refreshToken: string) {
  return request<void>("/api/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

export function getSessions(token: string) {
  return request<UserSessionInfo[]>("/api/auth/sessions", { token });
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

export function getMessages(
  token: string,
  chatId: string,
  options: { before?: string | null; limit?: number } = {}
) {
  return request<ChatMessage[]>(`/api/chats/${chatId}/messages`, {
    token,
    query: {
      before: options.before,
      limit: options.limit,
    },
  });
}

export function sendMessage(token: string, chatId: string, content: string) {
  return request<ChatMessage>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    token,
    body: { content },
  });
}
