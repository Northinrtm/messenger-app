import { API_URL } from "./config";
import type { ApiErrorResponse, AuthResponse, ChatMessage, ChatSummary } from "./types";

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
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
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

export function getMessages(token: string, chatId: string) {
  return request<ChatMessage[]>(`/api/chats/${chatId}/messages`, { token });
}

export function sendMessage(token: string, chatId: string, content: string) {
  return request<ChatMessage>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    token,
    body: { content },
  });
}

