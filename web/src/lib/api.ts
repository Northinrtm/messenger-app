import { API_URL } from "./config";
import { recordSendDiagnosticStep } from "./sendDiagnostics";
import type {
  ApiErrorResponse,
  ApiChatMessage,
  AuthResponse,
  ChatAttachmentBrowserKind,
  ChatAttachmentBrowserPage,
  ChatLinkBrowserPage,
  ChatOpen,
  MessagePage,
  ChatSummary,
  ChatDraft,
  InviteAcceptance,
  InviteLink,
  MessageReactionEvent,
  PendingOutgoingMessage,
  Participant,
  PushNotificationConfig,
  PushSubscriptionPayload,
  VideoConference,
  UserProfile,
  UserMailbox,
  UserSessionInfo,
  WorkspaceBootstrap,
  WorkspaceSearch,
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

export function describeError(error: unknown) {
  if (error instanceof ApiError) {
    return [error.message, ...error.details].filter(Boolean).join(". ");
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unexpected error";
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  keepalive?: boolean;
  timeoutMs?: number;
};

type ChatAttachmentUploadResponse = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type ChatAttachmentUploadTargetResponse = ChatAttachmentUploadResponse & {
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

export type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  ratio: number;
};

type UploadChatAttachmentOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
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
  const controller = options.timeoutMs ? new AbortController() : null;
  const timeout =
    controller && options.timeoutMs
      ? window.setTimeout(() => {
          controller.abort("request-timeout");
        }, options.timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      credentials: "include",
      keepalive: options.keepalive,
      signal: controller?.signal,
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Backend did not respond in time. Try again.", 0);
    }
    throw new ApiError("Cannot reach backend. Check that API and proxy are running.", 0);
  } finally {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;
    let fallbackMessage = "";
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        payload = (await response.json()) as ApiErrorResponse;
      } catch {
        payload = null;
      }
    } else {
      try {
        fallbackMessage = normalizeErrorText(await response.text());
      } catch {
        fallbackMessage = "";
      }
    }

    throw new ApiError(
      payload?.error ?? resolveHttpErrorMessage(response.status, response.statusText, fallbackMessage),
      response.status,
      payload?.details ?? []
    );
  }

  return parseSuccessResponse<T>(response);
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
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

function normalizeErrorText(value: string) {
  const normalized = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 220) {
    return "";
  }
  return normalized;
}

function resolveHttpErrorMessage(status: number, statusText: string, fallbackMessage: string) {
  if (status === 502 || status === 503 || status === 504) {
    return "Backend is unavailable";
  }
  if (status === 404) {
    return "API endpoint was not found";
  }
  if (status === 401) {
    return "Authentication failed";
  }
  if (status === 403) {
    return "Access denied";
  }
  if (fallbackMessage) {
    return fallbackMessage;
  }
  if (statusText.trim()) {
    return `${status} ${statusText}`;
  }
  return `Request failed (${status})`;
}

export function register(input: {
  username: string;
  email: string;
  displayName: string;
  password: string;
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function login(input: { username: string; password: string }) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function requestPasswordReset(input: { email: string }) {
  return request<void>("/api/auth/password-reset/request", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function confirmEmailVerification(input: { token: string }) {
  return request<void>("/api/auth/email-verification/confirm", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function resendEmailVerification(input: { email: string }) {
  return request<void>("/api/auth/email-verification/resend", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function resendOwnEmailVerification(token: string) {
  return request<void>("/api/auth/me/email-verification", {
    method: "POST",
    token,
    timeoutMs: 10000,
  });
}

export function requestEmailChange(token: string, newEmail: string) {
  return request<void>("/api/auth/me/email-change/request", {
    method: "POST",
    token,
    body: { newEmail },
    timeoutMs: 10000,
  });
}

export function confirmEmailChange(input: { token: string }) {
  return request<void>("/api/auth/email-change/confirm", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function confirmPasswordReset(input: { token: string; newPassword: string }) {
  return request<void>("/api/auth/password-reset/confirm", {
    method: "POST",
    body: input,
    timeoutMs: 10000,
  });
}

export function refreshSession() {
  return request<AuthResponse>("/api/auth/refresh", {
    method: "POST",
    timeoutMs: 6000,
  });
}

export function logout() {
  return request<void>("/api/auth/logout", {
    method: "POST",
    timeoutMs: 8000,
  });
}

export function getSessions(token: string) {
  return request<UserSessionInfo[]>("/api/auth/sessions", { token });
}

export function getProfile(token: string) {
  return request<UserProfile>("/api/auth/me", { token });
}

export function updateProfile(
  token: string,
  input: { displayName: string; profession: string | null; mailEnabled: boolean }
) {
  return request<UserProfile>("/api/auth/me", {
    method: "PUT",
    token,
    body: input,
  });
}

export function getOwnMailboxes(token: string) {
  return request<UserMailbox[]>("/api/auth/me/mailboxes", { token });
}

export function addOwnMailbox(token: string, email: string) {
  return request<UserMailbox>("/api/auth/me/mailboxes", {
    method: "POST",
    token,
    body: { email },
  });
}

export function removeOwnMailbox(token: string, mailboxId: string) {
  return request<void>(`/api/auth/me/mailboxes/${encodeURIComponent(mailboxId)}`, {
    method: "DELETE",
    token,
  });
}

export function changeUsername(token: string, newUsername: string) {
  return request<AuthResponse>("/api/auth/me/username", {
    method: "PUT",
    token,
    body: { newUsername },
    timeoutMs: 10000,
  });
}

export function changePassword(
  token: string,
  input: {
    currentPassword: string;
    newPassword: string;
  }
) {
  return request<void>("/api/auth/password", {
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

export function deleteOwnAccount(token: string) {
  return request<void>("/api/auth/me", {
    method: "DELETE",
    token,
    timeoutMs: 10000,
  });
}

export function revokeSession(token: string, sessionId: string) {
  return request<void>(`/api/auth/sessions/${sessionId}`, {
    method: "DELETE",
    token,
  });
}

export function getPushNotificationConfig(token: string) {
  return request<PushNotificationConfig>("/api/push/config", { token });
}

export function upsertPushSubscription(token: string, subscription: PushSubscriptionPayload) {
  return request<void>("/api/push/subscriptions", {
    method: "POST",
    token,
    body: subscription,
  });
}

export function deletePushSubscription(token: string, endpoint: string) {
  return request<void>("/api/push/subscriptions", {
    method: "DELETE",
    token,
    body: { endpoint },
  });
}

export function getChats(token: string) {
  return request<ChatSummary[]>("/api/chats", { token });
}

export function getWorkspaceBootstrap(token: string) {
  return request<WorkspaceBootstrap>("/api/workspace/bootstrap", { token });
}

export function getArchivedChats(token: string) {
  return request<string[]>("/api/chats/archive", { token });
}

export function getChatDrafts(token: string) {
  return request<ChatDraft[]>("/api/chats/drafts", { token });
}

export function getPendingOutgoingMessages(token: string) {
  return request<PendingOutgoingMessage[]>("/api/messages/pending-outgoing", { token });
}

export function getVideoConferences(token: string) {
  return request<VideoConference[]>("/api/conferences", { token });
}

export function getArchivedVideoConferences(token: string) {
  return request<VideoConference[]>("/api/conferences/archive", { token });
}

export function createVideoConference(
  token: string,
  input: {
    title: string;
    scheduledAt: string;
    participantUsernames: string[];
    chatId?: string | null;
  }
) {
  return request<VideoConference>("/api/conferences", {
    method: "POST",
    token,
    body: input,
  });
}

export function updateVideoConference(
  token: string,
  conferenceId: string,
  input: { title: string; scheduledAt: string }
) {
  return request<VideoConference>(`/api/conferences/${conferenceId}`, {
    method: "PUT",
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

export function startGroupConferenceCall(token: string, chatId: string) {
  return request<VideoConference>(`/api/chats/${chatId}/conference-call`, {
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

export async function uploadChatAttachment(
  token: string,
  chatId: string,
  file: Blob,
  fileName = "attachment.bin",
  options: UploadChatAttachmentOptions = {}
) {
  const uploadTarget = await request<ChatAttachmentUploadTargetResponse>(
    `/api/chats/${chatId}/attachments/initiate`,
    {
      method: "POST",
      token,
      body: {
        fileName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      },
    }
  );

  if (options.onProgress) {
    await uploadWithProgress(uploadTarget, file, options);
  } else {
    await uploadWithoutProgress(uploadTarget, file, options.signal);
  }

  return {
    id: uploadTarget.id,
    fileName: uploadTarget.fileName,
    mimeType: uploadTarget.mimeType,
    sizeBytes: uploadTarget.sizeBytes,
    createdAt: uploadTarget.createdAt,
  } satisfies ChatAttachmentUploadResponse;
}

async function uploadWithoutProgress(
  uploadTarget: ChatAttachmentUploadTargetResponse,
  file: Blob,
  signal?: AbortSignal
) {
  const response = await fetch(uploadTarget.uploadUrl, {
    method: uploadTarget.uploadMethod,
    cache: "no-store",
    signal,
    headers: uploadTarget.uploadHeaders,
    body: file,
  });

  if (!response.ok) {
    throw new ApiError(
      resolveHttpErrorMessage(response.status, response.statusText, "Attachment upload failed"),
      response.status
    );
  }
}

function uploadWithProgress(
  uploadTarget: ChatAttachmentUploadTargetResponse,
  file: Blob,
  options: UploadChatAttachmentOptions
) {
  return new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const request = new XMLHttpRequest();
    const cleanup = () => {
      options.signal?.removeEventListener("abort", abortUpload);
    };
    const abortUpload = () => {
      request.abort();
    };

    request.open(uploadTarget.uploadMethod, uploadTarget.uploadUrl);
    Object.entries(uploadTarget.uploadHeaders ?? {}).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });
    request.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size;
      const loadedBytes = event.loaded;
      const ratio = totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0;
      options.onProgress?.({ loadedBytes, totalBytes, ratio });
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(
        new ApiError(
          resolveHttpErrorMessage(request.status, request.statusText, "Attachment upload failed"),
          request.status
        )
      );
    };
    request.onerror = () => {
      cleanup();
      reject(new ApiError("Network error", 0));
    };
    request.onabort = () => {
      cleanup();
      reject(createAbortError());
    };

    options.signal?.addEventListener("abort", abortUpload, { once: true });
    request.send(file);
  });
}

function createAbortError() {
  const error = new Error("Attachment upload cancelled");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export async function downloadChatAttachment(
  token: string,
  chatId: string,
  attachmentId: string
) {
  const downloadTarget = await request<ChatAttachmentDownloadUrlResponse>(
    `/api/chats/${chatId}/attachments/${attachmentId}/download-url`,
    {
      token,
    }
  );

  const response = await fetch(downloadTarget.url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(
      resolveHttpErrorMessage(response.status, response.statusText, "Attachment download failed"),
      response.status
    );
  }

  return {
    blob: await response.blob(),
    fileName: downloadTarget.fileName || "attachment",
    mimeType: response.headers.get("content-type") ?? downloadTarget.mimeType,
  };
}

export function endVideoConference(token: string, conferenceId: string) {
  return request<VideoConference>(`/api/conferences/${conferenceId}`, {
    method: "DELETE",
    token,
  });
}

export function cancelVideoConference(token: string, conferenceId: string) {
  return request<void>(`/api/conferences/${conferenceId}/schedule`, {
    method: "DELETE",
    token,
  });
}

export function touchConferencePresence(token: string, conferenceId: string) {
  return request<void>(`/api/conferences/${conferenceId}/presence`, {
    method: "POST",
    token,
  });
}

export function clearConferencePresence(
  token: string,
  conferenceId: string,
  options?: { keepalive?: boolean }
) {
  return request<void>(`/api/conferences/${conferenceId}/presence`, {
    method: "DELETE",
    token,
    keepalive: options?.keepalive,
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
  options: {
    beforeServerOrder?: number | null;
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {}
) {
  return request<ApiChatMessage[]>(`/api/chats/${chatId}/messages`, {
    token,
    query: {
      acknowledgeDelivered:
        options.acknowledgeDelivered === undefined ? undefined : options.acknowledgeDelivered ? 1 : 0,
      beforeServerOrder: options.beforeServerOrder,
      limit: options.limit,
    },
  });
}

export function getChatOpen(
  token: string,
  chatId: string,
  options: {
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {}
) {
  return request<ChatOpen>(`/api/chats/${chatId}/open`, {
    token,
    query: {
      acknowledgeDelivered:
        options.acknowledgeDelivered === undefined ? undefined : options.acknowledgeDelivered ? 1 : 0,
      limit: options.limit,
    },
  });
}

export function clearChatReactionAttention(token: string, chatId: string) {
  return request<void>(`/api/chats/${chatId}/reaction-attention`, {
    method: "DELETE",
    token,
  });
}

export function getMessagesPage(
  token: string,
  chatId: string,
  options: {
    cursor?: string | null;
    limit?: number;
    acknowledgeDelivered?: boolean;
  } = {}
) {
  return request<MessagePage>(`/api/chats/${chatId}/messages/page`, {
    token,
    query: {
      acknowledgeDelivered:
        options.acknowledgeDelivered === undefined ? undefined : options.acknowledgeDelivered ? 1 : 0,
      cursor: options.cursor,
      limit: options.limit,
    },
  });
}

export function getChatAttachmentBrowserPage(
  token: string,
  chatId: string,
  options: {
    kind?: ChatAttachmentBrowserKind;
    cursor?: string | null;
    limit?: number;
  } = {}
) {
  return request<ChatAttachmentBrowserPage>(`/api/chats/${chatId}/attachments/browser`, {
    token,
    query: {
      kind: options.kind,
      cursor: options.cursor,
      limit: options.limit,
    },
  });
}

export function getChatLinkBrowserPage(
  token: string,
  chatId: string,
  options: {
    cursor?: string | null;
    limit?: number;
  } = {}
) {
  return request<ChatLinkBrowserPage>(`/api/chats/${chatId}/links/browser`, {
    token,
    query: {
      cursor: options.cursor,
      limit: options.limit,
    },
  });
}

export function updateMessage(
  token: string,
  chatId: string,
  messageId: string,
  body: {
    plainPayload: {
      content: string;
    };
  }
) {
  return request<ApiChatMessage>(`/api/chats/${chatId}/messages/${messageId}`, {
    method: "PUT",
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

export function deleteMessage(
  token: string,
  chatId: string,
  messageId: string,
  scope: "SELF" | "EVERYONE" = "EVERYONE"
) {
  return request<void>(`/api/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
    token,
    query: { scope },
  });
}

export function deleteMessages(
  token: string,
  chatId: string,
  messageIds: string[],
  scope: "SELF" | "EVERYONE" = "EVERYONE"
) {
  return request<void>(`/api/chats/${chatId}/messages/delete-batch`, {
    method: "POST",
    token,
    body: { messageIds },
    query: { scope },
  });
}

export function toggleMessageReaction(
  token: string,
  chatId: string,
  messageId: string,
  key: "LIKE" | "DISLIKE" | "EYES" | "OK"
) {
  return request<MessageReactionEvent>(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
    method: "PUT",
    token,
    body: { key },
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

export function updateGroupChat(
  token: string,
  chatId: string,
  input: { title: string; avatarUrl: string | null; prejoinHistoryPolicy: "JOIN_ONLY" | "FULL_HISTORY" }
) {
  return request<ChatSummary>(`/api/chats/${chatId}`, {
    method: "PUT",
    token,
    body: input,
  });
}

export function createGroupInviteLink(
  token: string,
  chatId: string,
  options?: { refresh?: boolean }
) {
  return request<InviteLink>(`/api/invite-links/groups/${chatId}`, {
    method: "POST",
    token,
    query: { refresh: options?.refresh === true ? 1 : undefined },
  });
}

export function createConferenceInviteLink(
  token: string,
  conferenceId: string,
  options?: { refresh?: boolean }
) {
  return request<InviteLink>(`/api/invite-links/conferences/${conferenceId}`, {
    method: "POST",
    token,
    query: { refresh: options?.refresh === true ? 1 : undefined },
  });
}

export function acceptInviteLink(token: string, code: string) {
  return request<InviteAcceptance>(`/api/invite-links/${encodeURIComponent(code)}/accept`, {
    method: "POST",
    token,
  });
}

export function updateArchivedChat(token: string, chatId: string, archived: boolean) {
  return request<void>(`/api/chats/${chatId}/archive`, {
    method: "PUT",
    token,
    body: { archived },
  });
}

export function upsertChatDraft(
  token: string,
  chatId: string,
  content: string,
  options?: { keepalive?: boolean }
) {
  return request<ChatDraft>(`/api/chats/${chatId}/draft`, {
    method: "PUT",
    token,
    body: { content },
    keepalive: options?.keepalive,
  });
}

export function deleteChatDraft(
  token: string,
  chatId: string,
  options?: { keepalive?: boolean }
) {
  return request<void>(`/api/chats/${chatId}/draft`, {
    method: "DELETE",
    token,
    keepalive: options?.keepalive,
  });
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
      sender: Participant;
      createdAt: string;
      preview: string;
    } | null;
    status: "SENDING" | "FAILED";
    attachments?: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }
) {
  return request<PendingOutgoingMessage>(
    `/api/messages/pending-outgoing/${encodeURIComponent(clientMessageId)}`,
    {
      method: "PUT",
      token,
      body,
    }
  );
}

export function deletePendingOutgoingMessage(token: string, clientMessageId: string) {
  return request<void>(`/api/messages/pending-outgoing/${encodeURIComponent(clientMessageId)}`, {
    method: "DELETE",
    token,
  });
}

export function deleteChat(token: string, chatId: string) {
  return request<void>(`/api/chats/${chatId}`, {
    method: "DELETE",
    token,
  });
}

export function updatePinnedMessage(
  token: string,
  chatId: string,
  messageId: string | null
) {
  return request<ChatSummary>(`/api/chats/${chatId}/pin`, {
    method: "PUT",
    token,
    body: { messageId },
  });
}

export function searchUsers(token: string, query: string) {
  return request<UserProfile[]>("/api/users/search", {
    token,
    query: { query },
  });
}

export function searchWorkspace(token: string, query: string) {
  return request<WorkspaceSearch>("/api/search", {
    token,
    query: { query },
  });
}

export function getContacts(token: string) {
  return request<UserProfile[]>("/api/users/contacts", { token });
}

export function getBlockedUsers(token: string) {
  return request<UserProfile[]>("/api/users/blocks", { token });
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

export function blockUser(token: string, username: string) {
  return request<UserProfile>("/api/users/blocks", {
    method: "POST",
    token,
    body: { username },
  });
}

export function unblockUser(token: string, username: string) {
  return request<void>(`/api/users/blocks/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token,
  });
}

export function leaveGroup(token: string, chatId: string) {
  return request<void>(`/api/chats/${chatId}/leave`, {
    method: "POST",
    token,
  });
}

export function deleteGroup(token: string, chatId: string) {
  return request<void>(`/api/chats/${chatId}/group`, {
    method: "DELETE",
    token,
  });
}

export function banGroupParticipant(token: string, chatId: string, username: string) {
  return request<void>(`/api/chats/${chatId}/bans`, {
    method: "POST",
    token,
    body: { username },
  });
}

export function listGroupBans(token: string, chatId: string) {
  return request<Participant[]>(`/api/chats/${chatId}/bans`, {
    token,
  });
}

export function unbanGroupParticipant(token: string, chatId: string, username: string) {
  return request<void>(`/api/chats/${chatId}/bans/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token,
  });
}

export function assignGroupModerator(token: string, chatId: string, username: string) {
  return request<void>(`/api/chats/${chatId}/moderators`, {
    method: "POST",
    token,
    body: { username },
  });
}

export function transferGroupOwnership(token: string, chatId: string, username: string) {
  return request<ChatSummary>(`/api/chats/${chatId}/owner`, {
    method: "PUT",
    token,
    body: { username },
  });
}

export function revokeGroupModerator(token: string, chatId: string, username: string) {
  return request<void>(`/api/chats/${chatId}/moderators/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token,
  });
}

export function removeGroupParticipant(token: string, chatId: string, username: string) {
  return request<void>(`/api/chats/${chatId}/participants/${encodeURIComponent(username)}`, {
    method: "DELETE",
    token,
  });
}
