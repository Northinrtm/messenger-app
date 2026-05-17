import {
  Client,
  ReconnectionTimeMode,
  TickerStrategy,
  type IFrame,
  type StompSubscription,
} from '@stomp/stompjs';
import type {
  ApiChatMessage,
  ChatMessage,
  ChatSummary,
  MessageReactionEvent,
  MessageSendErrorEvent,
  SessionEvent,
  TypingEvent,
} from '@north/shared';
import {WS_URL} from '../config';
import {ApiError} from './api';
import {hydrateApiChatMessage} from './messagePayload';

type SubscriptionOptions = {
  chatIds: string[];
  token: string;
  currentUserId: string;
  onChat: (chat: ChatSummary) => void;
  onMessage: (message: ChatMessage) => void;
  onMessageReaction?: (event: MessageReactionEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onAuthFailure?: () => void;
  onConnectionChange?: (connected: boolean) => void;
};

type RealtimeConnection = {
  chatIds: string[];
  client: Client;
  onChat: (chat: ChatSummary) => void;
  onMessage: (message: ChatMessage) => void;
  onMessageReaction?: (event: MessageReactionEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onAuthFailure?: () => void;
  onConnectionChange?: (connected: boolean) => void;
  userSubscriptions: StompSubscription[];
  typingSubscriptions: Map<string, StompSubscription>;
  connected: boolean;
  destroyed: boolean;
};

type PendingSendRequest = {
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (message: ApiChatMessage) => void;
  reject: (error: ApiError) => void;
  destination: string;
  body: string;
  published: boolean;
};

const REALTIME_CONNECTION_TIMEOUT_MS = 10_000;
const REALTIME_HEARTBEAT_INTERVAL_MS = 10_000;
const REALTIME_RECONNECT_INITIAL_DELAY_MS = 2_000;
const REALTIME_RECONNECT_MAX_DELAY_MS = 30_000;
const REALTIME_SEND_ACK_TIMEOUT_MS = 4_000;
const REALTIME_SEND_QUEUE_TIMEOUT_MS =
  REALTIME_RECONNECT_MAX_DELAY_MS +
  REALTIME_CONNECTION_TIMEOUT_MS +
  REALTIME_SEND_ACK_TIMEOUT_MS +
  5_000;
const WEB_SOCKET_OPEN_STATE = 1;
const STOMP_SUBPROTOCOLS = ['v12.stomp', 'v11.stomp', 'v10.stomp'];

let activeConnection: RealtimeConnection | null = null;
const pendingSendRequests = new Map<string, PendingSendRequest>();

export function subscribeToChats({
  chatIds,
  token,
  onChat,
  onMessage,
  onMessageReaction,
  onTyping,
  onSessionEvent,
  onAuthFailure,
  onConnectionChange,
}: SubscriptionOptions) {
  if (activeConnection) {
    retireConnection(activeConnection);
    activeConnection = null;
  }

  const connection: RealtimeConnection = {
    chatIds: normalizeChatIds(chatIds),
    client: null as unknown as Client,
    onChat,
    onMessage,
    onMessageReaction,
    onTyping,
    onSessionEvent,
    onAuthFailure,
    onConnectionChange,
    userSubscriptions: [],
    typingSubscriptions: new Map(),
    connected: false,
    destroyed: false,
  };

  const brokerURL = `${resolveWebSocketBaseUrl()}/ws`;
  const authorizationHeader = `Bearer ${token}`;
  const client = new Client({
    brokerURL,
    webSocketFactory: () =>
      createAuthorizedWebSocket(brokerURL, authorizationHeader),
    connectHeaders: {
      Authorization: authorizationHeader,
    },
    connectionTimeout: REALTIME_CONNECTION_TIMEOUT_MS,
    heartbeatIncoming: REALTIME_HEARTBEAT_INTERVAL_MS,
    heartbeatOutgoing: REALTIME_HEARTBEAT_INTERVAL_MS,
    heartbeatStrategy: TickerStrategy.Interval,
    reconnectDelay: REALTIME_RECONNECT_INITIAL_DELAY_MS,
    maxReconnectDelay: REALTIME_RECONNECT_MAX_DELAY_MS,
    reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
    debug: () => undefined,
  });
  connection.client = client;
  activeConnection = connection;

  client.onConnect = () => {
    if (!isActiveConnection(connection)) {
      deactivateRealtimeClient(client);
      return;
    }

    setConnectionState(connection, true);
    clearSubscriptions(connection);

    connection.userSubscriptions.push(
      client.subscribe('/user/queue/chats', (frame: IFrame) => {
        connection.onChat(JSON.parse(frame.body) as ChatSummary);
      }),
    );

    connection.userSubscriptions.push(
      client.subscribe('/user/queue/message-acks', (frame: IFrame) => {
        resolvePendingSendRequest(JSON.parse(frame.body) as ApiChatMessage);
      }),
    );

    connection.userSubscriptions.push(
      client.subscribe('/user/queue/message-errors', (frame: IFrame) => {
        rejectPendingSendRequest(JSON.parse(frame.body) as MessageSendErrorEvent);
      }),
    );

    connection.userSubscriptions.push(
      client.subscribe('/user/queue/messages', (frame: IFrame) => {
        const payload = JSON.parse(frame.body) as ApiChatMessage;
        connection.onMessage(hydrateApiChatMessage(payload));
      }),
    );

    if (connection.onMessageReaction) {
      connection.userSubscriptions.push(
        client.subscribe('/user/queue/message-reactions', (frame: IFrame) => {
          connection.onMessageReaction?.(
            JSON.parse(frame.body) as MessageReactionEvent,
          );
        }),
      );
    }

    connection.userSubscriptions.push(
      client.subscribe('/user/queue/sessions', (frame: IFrame) => {
        connection.onSessionEvent(JSON.parse(frame.body) as SessionEvent);
      }),
    );

    syncTypingSubscriptions(connection);
    flushPendingSendRequests(connection);
  };

  client.onStompError = (frame: IFrame) => {
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
    return false;
  }

  try {
    connection.client.publish({
      destination: `/app/chats/${chatId}/typing`,
      body: JSON.stringify({typing}),
    });
  } catch {
    handleConnectionFailure(connection);
    return false;
  }

  return true;
}

export function sendMessageRealtime(input: {
  chatId: string;
  clientMessageId: string;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  plainPayload: {
    content: string;
  };
  attachmentIds?: string[];
  timeoutMs?: number;
}) {
  const connection = activeConnection;
  if (!connection) {
    return Promise.reject(
      new ApiError('Realtime connection is unavailable. Retry after reconnect.', 503),
    );
  }

  if (!input.clientMessageId.trim()) {
    return Promise.reject(new ApiError('Client message id is required', 400));
  }

  if (pendingSendRequests.has(input.clientMessageId)) {
    return Promise.reject(new ApiError('Message send is already pending', 409));
  }

  return new Promise<ApiChatMessage>((resolve, reject) => {
    const destination = `/app/chats/${input.chatId}/messages`;
    const body = JSON.stringify({
      clientMessageId: input.clientMessageId,
      replyToMessageId: input.replyToMessageId ?? null,
      forwardedFromMessageId: input.forwardedFromMessageId ?? null,
      attachmentIds: input.attachmentIds ?? [],
      plainPayload: input.plainPayload,
    });
    const timeoutId = setTimeout(() => {
      const pendingRequest = pendingSendRequests.get(input.clientMessageId);
      if (!pendingRequest) {
        return;
      }

      pendingSendRequests.delete(input.clientMessageId);
      reject(
        new ApiError(
          pendingRequest.published
            ? 'Message send confirmation timed out. Retry the same message.'
            : 'Realtime reconnect timed out before the message could be sent. Retry the same message.',
          504,
        ),
      );
    }, input.timeoutMs ?? REALTIME_SEND_QUEUE_TIMEOUT_MS);

    pendingSendRequests.set(input.clientMessageId, {
      timeoutId,
      resolve,
      reject,
      destination,
      body,
      published: false,
    });
    publishPendingSendRequest(connection, input.clientMessageId);
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
  clearTimeout(pendingRequest.timeoutId);
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
  clearTimeout(pendingRequest.timeoutId);
  pendingRequest.reject(new ApiError(error.error, error.status, error.details));
}

function clearSubscriptions(connection: RealtimeConnection) {
  const shouldUnsubscribe = isRealtimeClientReady(connection.client);
  connection.userSubscriptions.forEach(subscription => {
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

  connection.typingSubscriptions.forEach(subscription => {
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

function retireConnection(connection: RealtimeConnection) {
  connection.destroyed = true;
  clearSubscriptions(connection);
  failPendingSendRequests(
    'Realtime connection closed before the message was confirmed.',
    503,
  );
  connection.connected = false;
  deactivateRealtimeClient(connection.client);
}

function handleAuthenticationFailure(connection: RealtimeConnection) {
  if (!isActiveConnection(connection)) {
    return;
  }

  clearSubscriptions(connection);
  failPendingSendRequests('Realtime session ended. Sign in again.', 401);
  setConnectionState(connection, false);
  deactivateRealtimeClient(connection.client);
  connection.onAuthFailure?.();
}

function handleConnectionFailure(connection: RealtimeConnection) {
  if (!isActiveConnection(connection)) {
    return;
  }

  clearSubscriptions(connection);
  requeuePendingSendRequests();
  setConnectionState(connection, false);
}

function publishPendingSendRequest(
  connection: RealtimeConnection,
  clientMessageId: string,
) {
  const pendingRequest = pendingSendRequests.get(clientMessageId);
  if (!pendingRequest || pendingRequest.published) {
    return;
  }

  if (!isRealtimeClientReady(connection.client)) {
    return;
  }

  try {
    connection.client.publish({
      destination: pendingRequest.destination,
      body: pendingRequest.body,
    });
    pendingRequest.published = true;
  } catch {
    pendingRequest.published = false;
    handleConnectionFailure(connection);
  }
}

function flushPendingSendRequests(connection: RealtimeConnection) {
  pendingSendRequests.forEach((_pendingRequest, clientMessageId) => {
    publishPendingSendRequest(connection, clientMessageId);
  });
}

function requeuePendingSendRequests() {
  pendingSendRequests.forEach(pendingRequest => {
    pendingRequest.published = false;
  });
}

function failPendingSendRequests(message: string, status: number) {
  pendingSendRequests.forEach(pendingRequest => {
    clearTimeout(pendingRequest.timeoutId);
    pendingRequest.reject(new ApiError(message, status));
  });
  pendingSendRequests.clear();
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

function syncTypingSubscriptions(connection: RealtimeConnection) {
  if (!isRealtimeClientReady(connection.client)) {
    return;
  }

  const desiredChatIds = new Set(connection.chatIds);
  for (const [chatId, subscription] of connection.typingSubscriptions) {
    if (desiredChatIds.has(chatId)) {
      continue;
    }

    try {
      subscription.unsubscribe();
    } catch {
      return;
    }
    connection.typingSubscriptions.delete(chatId);
  }

  if (!connection.onTyping) {
    return;
  }

  connection.chatIds.forEach(chatId => {
    if (connection.typingSubscriptions.has(chatId)) {
      return;
    }

    const subscription = connection.client.subscribe(
      `/topic/chats.${chatId}.typing`,
      (frame: IFrame) => {
        connection.onTyping?.(JSON.parse(frame.body) as TypingEvent);
      },
    );
    connection.typingSubscriptions.set(chatId, subscription);
  });
}

function isActiveConnection(connection: RealtimeConnection) {
  return activeConnection === connection && !connection.destroyed;
}

function isRealtimeClientReady(client: Client | undefined) {
  return Boolean(
    client?.connected &&
      client.webSocket &&
      client.webSocket.readyState === WEB_SOCKET_OPEN_STATE,
  );
}

function isAuthenticationFailureFrame(frame: IFrame | undefined) {
  const details = [frame?.headers?.message, frame?.body]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();

  if (!details) {
    return false;
  }

  return (
    details.includes('websocket authentication required') ||
    details.includes('authenticated session') ||
    details.includes('session is inactive') ||
    details.includes('session revoked') ||
    details.includes('expired or revoked')
  );
}

function deactivateRealtimeClient(client: Client) {
  if (!client.active && !client.connected) {
    return;
  }

  client.deactivate().catch(() => undefined);
}

function createAuthorizedWebSocket(url: string, authorization: string) {
  const ReactNativeWebSocket = globalThis.WebSocket as unknown as new (
    socketUrl: string,
    protocols?: string | string[],
    options?: {
      headers?: Record<string, string>;
    },
  ) => WebSocket;

  return new ReactNativeWebSocket(url, STOMP_SUBPROTOCOLS, {
    headers: {
      Authorization: authorization,
    },
  });
}

function resolveWebSocketBaseUrl() {
  const url = new URL(WS_URL);
  const protocol =
    url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
}
