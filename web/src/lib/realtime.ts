import {
  Client,
  ReconnectionTimeMode,
  TickerStrategy,
  type IFrame,
  type StompSubscription,
} from "@stomp/stompjs";
import { ApiError, createMessage } from "./api";
import { WS_URL } from "./config";
import type {
  ApiChatMessage,
  ChatRemovalEvent,
  ChatMessage,
  ChatSummary,
  MessageDeletionEvent,
  MessageReactionEvent,
  MessageSendErrorEvent,
  MessageStatusEvent,
  SessionEvent,
  TypingEvent,
} from "./types";

type SubscriptionOptions = {
  chatIds: string[];
  token: string;
  currentUserId: string;
  onChat: (chat: ChatSummary) => void;
  onChatRemoval?: (event: ChatRemovalEvent) => void;
  onMessage: (message: ChatMessage) => void;
  onMessageDeletion?: (event: MessageDeletionEvent) => void;
  onMessageReaction?: (event: MessageReactionEvent) => void;
  onMessageStatus?: (event: MessageStatusEvent) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onAuthFailure?: () => void;
  onConnect?: () => void;
  onConnectionChange?: (connected: boolean) => void;
};

type RealtimeConnection = {
  chatIds: string[];
  client: Client;
  currentUserId: string;
  onChat: (chat: ChatSummary) => void;
  onChatRemoval?: (event: ChatRemovalEvent) => void;
  onConnect?: () => void;
  onMessage: (message: ChatMessage) => void;
  onMessageDeletion?: (event: MessageDeletionEvent) => void;
  onMessageReaction?: (event: MessageReactionEvent) => void;
  onMessageStatus?: (event: MessageStatusEvent) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onAuthFailure?: () => void;
  typingSubscriptions: Map<string, StompSubscription>;
  userSubscriptions: StompSubscription[];
  onConnectionChange?: (connected: boolean) => void;
  connected: boolean;
  destroyed: boolean;
  failedReconnectAt: number[];
  reconnectCooldownTimerId: number | null;
  lastRecordedFailureAt: number;
  pausedByLifecycle: boolean;
  visibilityPauseTimerId: number | null;
  disposeLifecycleHandlers: (() => void) | null;
};

type PendingSendRequest = {
  timeoutId: number;
  resolve: (message: ApiChatMessage) => void;
  reject: (error: ApiError) => void;
};

const REALTIME_CONNECTION_TIMEOUT_MS = 10_000;
const REALTIME_HEARTBEAT_INTERVAL_MS = 10_000;
const REALTIME_RECONNECT_INITIAL_DELAY_MS = 2_000;
const REALTIME_RECONNECT_MAX_DELAY_MS = 30_000;
const REALTIME_RECONNECT_FAILURE_WINDOW_MS = 30_000;
const REALTIME_RECONNECT_FAILURE_DEDUP_MS = 250;
const REALTIME_RECONNECT_FAILURE_THRESHOLD = 5;
const REALTIME_RECONNECT_COOLDOWN_MS = 60_000;
const REALTIME_VISIBILITY_PAUSE_DELAY_MS = 15_000;
const REALTIME_SEND_ACK_TIMEOUT_MS = 12_000;
const WEB_SOCKET_OPEN_STATE = 1;
const WEB_SOCKET_CLOSING_STATE = 2;
const WEB_SOCKET_CLOSED_STATE = 3;
let activeConnection: RealtimeConnection | null = null;
const pendingSendRequests = new Map<string, PendingSendRequest>();

export function subscribeToChats({
  chatIds,
  token,
  currentUserId,
  onChat,
  onChatRemoval,
  onMessage,
  onMessageDeletion,
  onMessageReaction,
  onMessageStatus,
  onSessionEvent,
  onTyping,
  onAuthFailure,
  onConnect,
  onConnectionChange,
}: SubscriptionOptions) {
  if (activeConnection) {
    retireConnection(activeConnection);
    activeConnection = null;
  }

  const connection: RealtimeConnection = {
    chatIds: normalizeChatIds(chatIds),
    client: null as unknown as Client,
    currentUserId,
    onChat,
    onChatRemoval,
    onConnect,
    onMessage,
    onMessageDeletion,
    onMessageReaction,
    onMessageStatus,
    onSessionEvent,
    onTyping,
    onAuthFailure,
    typingSubscriptions: new Map(),
    userSubscriptions: [],
    onConnectionChange,
    connected: false,
    destroyed: false,
    failedReconnectAt: [],
    reconnectCooldownTimerId: null,
    lastRecordedFailureAt: 0,
    pausedByLifecycle: false,
    visibilityPauseTimerId: null,
    disposeLifecycleHandlers: null,
  };

  const client = new Client({
    brokerURL: `${resolveWebSocketBaseUrl()}/ws`,
    connectHeaders: {
      Authorization: `Bearer ${token}`,
    },
    connectionTimeout: REALTIME_CONNECTION_TIMEOUT_MS,
    heartbeatIncoming: REALTIME_HEARTBEAT_INTERVAL_MS,
    heartbeatOutgoing: REALTIME_HEARTBEAT_INTERVAL_MS,
    heartbeatStrategy: TickerStrategy.Worker,
    reconnectDelay: REALTIME_RECONNECT_INITIAL_DELAY_MS,
    maxReconnectDelay: REALTIME_RECONNECT_MAX_DELAY_MS,
    reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
    debug: () => undefined,
  });
  connection.client = client;
  activeConnection = connection;
  connection.disposeLifecycleHandlers = registerLifecycleHandlers(connection);

  client.onConnect = () => {
    if (!isActiveConnection(connection) || connection.pausedByLifecycle) {
      deactivateRealtimeClient(client);
      return;
    }

    clearVisibilityPause(connection);
    connection.failedReconnectAt = [];
    connection.lastRecordedFailureAt = 0;
    setConnectionState(connection, true);
    clearSubscriptions(connection);

    connection.userSubscriptions.push(
      client.subscribe("/user/queue/chats", (frame) => {
        connection.onChat(JSON.parse(frame.body) as ChatSummary);
      })
    );

    if (connection.onChatRemoval) {
      connection.userSubscriptions.push(
        client.subscribe("/user/queue/chat-removals", (frame) => {
          connection.onChatRemoval?.(JSON.parse(frame.body) as ChatRemovalEvent);
        })
      );
    }

    connection.userSubscriptions.push(
      client.subscribe("/user/queue/message-acks", (frame) => {
        resolvePendingSendRequest(JSON.parse(frame.body) as ApiChatMessage);
      })
    );

    connection.userSubscriptions.push(
      client.subscribe("/user/queue/message-errors", (frame) => {
        rejectPendingSendRequest(JSON.parse(frame.body) as MessageSendErrorEvent);
      })
    );

    connection.userSubscriptions.push(
      client.subscribe("/user/queue/messages", (frame) => {
        const payload = JSON.parse(frame.body) as ApiChatMessage;
        void import("./e2ee").then(({ hydrateChatMessage }) =>
          hydrateChatMessage(payload, connection.currentUserId).then((message) => {
            connection.onMessage(message);
          })
        );
      })
    );

    if (connection.onMessageStatus) {
      connection.userSubscriptions.push(
        client.subscribe("/user/queue/message-statuses", (frame) => {
          connection.onMessageStatus?.(JSON.parse(frame.body) as MessageStatusEvent);
        })
      );
    }

    if (connection.onMessageReaction) {
      connection.userSubscriptions.push(
        client.subscribe("/user/queue/message-reactions", (frame) => {
          connection.onMessageReaction?.(JSON.parse(frame.body) as MessageReactionEvent);
        })
      );
    }

    if (connection.onMessageDeletion) {
      connection.userSubscriptions.push(
        client.subscribe("/user/queue/message-deletions", (frame) => {
          connection.onMessageDeletion?.(JSON.parse(frame.body) as MessageDeletionEvent);
        })
      );
    }

    connection.userSubscriptions.push(
      client.subscribe("/user/queue/sessions", (frame) => {
        connection.onSessionEvent(JSON.parse(frame.body) as SessionEvent);
      })
    );

    syncTypingSubscriptions(connection);
    connection.onConnect?.();
  };

  client.onStompError = (frame) => {
    if (isAuthenticationFailureFrame(frame)) {
      handleAuthenticationFailure(connection);
      return;
    }

    handleConnectionFailure(connection);
  };

  client.onWebSocketError = () => {
    handleConnectionFailure(connection);
  };

  client.onWebSocketClose = () => {
    handleConnectionFailure(connection);
  };

  client.activate();

  return () => {
    const shouldNotifyDisconnected = isActiveConnection(connection);
    connection.destroyed = true;
    connection.disposeLifecycleHandlers?.();
    connection.disposeLifecycleHandlers = null;
    clearReconnectCooldown(connection);
    clearVisibilityPause(connection);
    clearSubscriptions(connection);
    if (shouldNotifyDisconnected) {
      setConnectionState(connection, false);
      activeConnection = null;
    }
    deactivateRealtimeClient(client);
  };
}

export function replaceSubscribedChatIds(chatIds: string[]) {
  const connection = activeConnection;
  if (!connection) {
    return;
  }

  connection.chatIds = normalizeChatIds(chatIds);
  syncTypingSubscriptions(connection);
}

export function publishTypingEvent(chatId: string, typing: boolean) {
  const connection = activeConnection;
  if (!connection || !isRealtimeClientReady(connection.client)) {
    if (connection && shouldReportRealtimeClientFailure(connection)) {
      handleConnectionFailure(connection);
    }
    return false;
  }

  try {
    connection.client.publish({
      destination: `/app/chats/${chatId}/typing`,
      body: JSON.stringify({ typing }),
    });
  } catch {
    handleConnectionFailure(connection);
    return false;
  }
  return true;
}

function syncTypingSubscriptions(connection: RealtimeConnection) {
  if (!isRealtimeClientReady(connection.client)) {
    return;
  }

  const desiredChatIds = new Set(connection.chatIds);
  for (const [chatId, subscription] of connection.typingSubscriptions) {
    if (desiredChatIds.has(chatId)) {
      continue;
    }

    subscription.unsubscribe();
    connection.typingSubscriptions.delete(chatId);
  }

  if (!connection.onTyping) {
    return;
  }

  connection.chatIds.forEach((chatId) => {
    if (connection.typingSubscriptions.has(chatId)) {
      return;
    }

    const subscription = connection.client.subscribe(`/topic/chats.${chatId}.typing`, (frame) => {
      connection.onTyping?.(JSON.parse(frame.body) as TypingEvent);
    });
    connection.typingSubscriptions.set(chatId, subscription);
  });
}

function clearSubscriptions(connection: RealtimeConnection) {
  const shouldUnsubscribe = isRealtimeClientReady(connection.client);
  connection.userSubscriptions.forEach((subscription) => {
    if (!shouldUnsubscribe) {
      return;
    }

    try {
      subscription.unsubscribe();
    } catch {
      return;
    }
  });
  connection.userSubscriptions = [];

  connection.typingSubscriptions.forEach((subscription) => {
    if (!shouldUnsubscribe) {
      return;
    }

    try {
      subscription.unsubscribe();
    } catch {
      return;
    }
  });
  connection.typingSubscriptions.clear();
}

function handleConnectionFailure(connection: RealtimeConnection) {
  if (!isActiveConnection(connection)) {
    return;
  }

  clearSubscriptions(connection);
  failPendingSendRequests("Realtime connection was interrupted before the message was confirmed.", 503);
  setConnectionState(connection, false);

  if (connection.pausedByLifecycle) {
    return;
  }

  const now = Date.now();
  if (now - connection.lastRecordedFailureAt < REALTIME_RECONNECT_FAILURE_DEDUP_MS) {
    return;
  }

  connection.lastRecordedFailureAt = now;
  connection.failedReconnectAt = connection.failedReconnectAt.filter(
    (timestamp) => now - timestamp <= REALTIME_RECONNECT_FAILURE_WINDOW_MS
  );
  connection.failedReconnectAt.push(now);

  if (
    connection.reconnectCooldownTimerId !== null ||
    connection.failedReconnectAt.length < REALTIME_RECONNECT_FAILURE_THRESHOLD
  ) {
    return;
  }

  connection.failedReconnectAt = [];
  connection.reconnectCooldownTimerId = window.setTimeout(() => {
    connection.reconnectCooldownTimerId = null;
    if (connection.destroyed) {
      return;
    }

    connection.client.activate();
  }, REALTIME_RECONNECT_COOLDOWN_MS);

  deactivateRealtimeClient(connection.client, {
    force: isWebSocketClosingOrClosed(connection.client),
  });
}

function clearReconnectCooldown(connection: RealtimeConnection) {
  if (connection.reconnectCooldownTimerId === null) {
    return;
  }

  window.clearTimeout(connection.reconnectCooldownTimerId);
  connection.reconnectCooldownTimerId = null;
}

function clearVisibilityPause(connection: RealtimeConnection) {
  if (connection.visibilityPauseTimerId === null) {
    return;
  }

  window.clearTimeout(connection.visibilityPauseTimerId);
  connection.visibilityPauseTimerId = null;
}

function isActiveConnection(connection: RealtimeConnection) {
  return activeConnection === connection && !connection.destroyed;
}

function retireConnection(connection: RealtimeConnection) {
  connection.destroyed = true;
  connection.disposeLifecycleHandlers?.();
  connection.disposeLifecycleHandlers = null;
  clearReconnectCooldown(connection);
  clearVisibilityPause(connection);
  clearSubscriptions(connection);
  failPendingSendRequests("Realtime connection closed before the message was confirmed.", 503);
  connection.connected = false;
  deactivateRealtimeClient(connection.client, {
    force: isWebSocketClosingOrClosed(connection.client),
  });
}

function handleAuthenticationFailure(connection: RealtimeConnection) {
  if (!isActiveConnection(connection)) {
    return;
  }

  clearSubscriptions(connection);
  clearReconnectCooldown(connection);
  clearVisibilityPause(connection);
  failPendingSendRequests("Realtime session ended. Sign in again.", 401);
  setConnectionState(connection, false);
  deactivateRealtimeClient(connection.client, {
    force: isWebSocketClosingOrClosed(connection.client),
  });
  connection.onAuthFailure?.();
}

function setConnectionState(connection: RealtimeConnection, connected: boolean) {
  if (connection.connected === connected) {
    return;
  }

  connection.connected = connected;
  connection.onConnectionChange?.(connected);
}

function normalizeChatIds(chatIds: string[]) {
  return Array.from(new Set(chatIds)).sort();
}

function registerLifecycleHandlers(connection: RealtimeConnection) {
  const handlePageHide = () => {
    if (!isActiveConnection(connection)) {
      return;
    }

    clearVisibilityPause(connection);
    pauseConnectionForLifecycle(connection);
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);

  return () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handlePageHide);
  };
}

function isRealtimeClientReady(client: Client | undefined) {
  return Boolean(
    client?.connected &&
      client.webSocket &&
      client.webSocket.readyState === WEB_SOCKET_OPEN_STATE
  );
}

function isAuthenticationFailureFrame(frame: IFrame | undefined) {
  const details = [frame?.headers?.message, frame?.body]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();

  if (!details) {
    return false;
  }

  return (
    details.includes("websocket authentication required") ||
    details.includes("authenticated session") ||
    details.includes("session is inactive") ||
    details.includes("session revoked") ||
    details.includes("expired or revoked")
  );
}

function shouldReportRealtimeClientFailure(connection: RealtimeConnection) {
  if (!isActiveConnection(connection)) {
    return false;
  }

  return connection.connected || connection.client.connected || pendingSendRequests.size > 0;
}

function scheduleVisibilityPause(connection: RealtimeConnection) {
  if (
    connection.pausedByLifecycle ||
    connection.visibilityPauseTimerId !== null ||
    (!connection.client.active && !connection.connected)
  ) {
    return;
  }

  connection.visibilityPauseTimerId = window.setTimeout(() => {
    connection.visibilityPauseTimerId = null;
    if (!isActiveConnection(connection) || document.visibilityState !== "hidden") {
      return;
    }

    pauseConnectionForLifecycle(connection);
  }, REALTIME_VISIBILITY_PAUSE_DELAY_MS);
}

function pauseConnectionForLifecycle(connection: RealtimeConnection) {
  if (!isActiveConnection(connection) || connection.destroyed || connection.pausedByLifecycle) {
    return;
  }

  connection.pausedByLifecycle = true;
  clearReconnectCooldown(connection);
  clearSubscriptions(connection);
  failPendingSendRequests("Realtime connection paused before the message was confirmed.", 503);
  setConnectionState(connection, false);
  deactivateRealtimeClient(connection.client, {
    force: isWebSocketClosingOrClosed(connection.client),
  });
}

function resumeConnectionFromLifecyclePause(connection: RealtimeConnection) {
  if (!isActiveConnection(connection) || connection.destroyed || !connection.pausedByLifecycle) {
    return;
  }

  connection.pausedByLifecycle = false;
  connection.failedReconnectAt = [];
  connection.lastRecordedFailureAt = 0;
  connection.client.activate();
}

function isWebSocketClosingOrClosed(client: Client | undefined) {
  const readyState = client?.webSocket?.readyState;
  return readyState === WEB_SOCKET_CLOSING_STATE || readyState === WEB_SOCKET_CLOSED_STATE;
}

function deactivateRealtimeClient(
  client: Client,
  options: { force?: boolean } = {}
) {
  if (!client.active && !client.connected) {
    return;
  }

  void client.deactivate({
    force: options.force || isWebSocketClosingOrClosed(client),
  });
}

function resolveWebSocketBaseUrl() {
  const baseUrl = WS_URL.trim().length > 0 ? WS_URL : window.location.origin;
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  return url.toString().replace(/\/+$/, "");
}

export function sendMessageRealtime(input: {
  chatId: string;
  clientMessageId: string;
  replyToMessageId?: string | null;
  encryptedPayload: {
    scheme: string;
    encryptedKeysByRecipientId: Record<string, string>;
    sharedEnvelope?: string | null;
    historyEnvelope?: string | null;
  };
  attachmentIds?: string[];
  timeoutMs?: number;
}) {
  const connection = activeConnection;
  if (!connection || !isRealtimeClientReady(connection.client)) {
    if (connection && shouldReportRealtimeClientFailure(connection)) {
      handleConnectionFailure(connection);
    }
    return Promise.reject(
      new ApiError("Realtime connection is unavailable. Retry after reconnect.", 503)
    );
  }

  if (!input.clientMessageId.trim()) {
    return Promise.reject(new ApiError("Client message id is required", 400));
  }

  if (pendingSendRequests.has(input.clientMessageId)) {
    return Promise.reject(new ApiError("Message send is already pending", 409));
  }

  return new Promise<ApiChatMessage>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingSendRequests.delete(input.clientMessageId);
      reject(
        new ApiError("Message send confirmation timed out. Retry the same message.", 504)
      );
    }, input.timeoutMs ?? REALTIME_SEND_ACK_TIMEOUT_MS);

    pendingSendRequests.set(input.clientMessageId, {
      timeoutId,
      resolve,
      reject,
    });

    try {
      connection.client.publish({
        destination: `/app/chats/${input.chatId}/messages`,
        body: JSON.stringify({
          clientMessageId: input.clientMessageId,
          replyToMessageId: input.replyToMessageId ?? null,
          attachmentIds: input.attachmentIds ?? [],
          encryptedPayload: input.encryptedPayload,
        }),
      });
    } catch {
      clearPendingSendRequest(input.clientMessageId);
      handleConnectionFailure(connection);
      reject(new ApiError("Realtime message send failed before it left the client.", 503));
    }
  });
}

export function sendMessageRaw(
  token: string,
  chatId: string,
  body: {
    clientMessageId?: string;
    replyToMessageId?: string | null;
    encryptedPayload: {
      scheme: string;
      encryptedKeysByRecipientId: Record<string, string>;
      sharedEnvelope?: string | null;
      historyEnvelope?: string | null;
    };
    attachmentIds?: string[];
  }
) {
  const connection = activeConnection;
  if (!connection || !isRealtimeClientReady(connection.client)) {
    if (connection && shouldReportRealtimeClientFailure(connection)) {
      handleConnectionFailure(connection);
    }

    return createMessage(token, chatId, {
      clientMessageId: body.clientMessageId ?? "",
      replyToMessageId: body.replyToMessageId ?? null,
      attachmentIds: body.attachmentIds ?? [],
      encryptedPayload: body.encryptedPayload,
    });
  }

  return sendMessageRealtime({
    chatId,
    clientMessageId: body.clientMessageId ?? "",
    replyToMessageId: body.replyToMessageId ?? null,
    encryptedPayload: body.encryptedPayload,
    attachmentIds: body.attachmentIds ?? [],
  });
}

function resolvePendingSendRequest(message: ApiChatMessage) {
  const clientMessageId = message.clientMessageId?.trim();
  if (!clientMessageId) {
    return;
  }

  const pendingRequest = pendingSendRequests.get(clientMessageId);
  if (!pendingRequest) {
    return;
  }

  pendingSendRequests.delete(clientMessageId);
  window.clearTimeout(pendingRequest.timeoutId);
  pendingRequest.resolve(message);
}

function rejectPendingSendRequest(error: MessageSendErrorEvent) {
  const clientMessageId = error.clientMessageId?.trim();
  if (!clientMessageId) {
    return;
  }

  const pendingRequest = pendingSendRequests.get(clientMessageId);
  if (!pendingRequest) {
    return;
  }

  pendingSendRequests.delete(clientMessageId);
  window.clearTimeout(pendingRequest.timeoutId);
  pendingRequest.reject(new ApiError(error.error, error.status, error.details));
}

function clearPendingSendRequest(clientMessageId: string) {
  const pendingRequest = pendingSendRequests.get(clientMessageId);
  if (!pendingRequest) {
    return;
  }

  pendingSendRequests.delete(clientMessageId);
  window.clearTimeout(pendingRequest.timeoutId);
}

function failPendingSendRequests(message: string, status: number) {
  pendingSendRequests.forEach((pendingRequest, clientMessageId) => {
    window.clearTimeout(pendingRequest.timeoutId);
    pendingRequest.reject(new ApiError(message, status));
    pendingSendRequests.delete(clientMessageId);
  });
}
