import {
  Client,
  ReconnectionTimeMode,
  TickerStrategy,
  type StompSubscription,
} from "@stomp/stompjs";
import { WS_URL } from "./config";
import { hydrateChatMessage } from "./e2ee";
import type {
  ApiChatMessage,
  ChatRemovalEvent,
  ChatMessage,
  ChatSummary,
  MessageDeletionEvent,
  MessageReactionEvent,
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

const REALTIME_CONNECTION_TIMEOUT_MS = 10_000;
const REALTIME_HEARTBEAT_INTERVAL_MS = 10_000;
const REALTIME_RECONNECT_INITIAL_DELAY_MS = 2_000;
const REALTIME_RECONNECT_MAX_DELAY_MS = 30_000;
const REALTIME_RECONNECT_FAILURE_WINDOW_MS = 30_000;
const REALTIME_RECONNECT_FAILURE_DEDUP_MS = 250;
const REALTIME_RECONNECT_FAILURE_THRESHOLD = 5;
const REALTIME_RECONNECT_COOLDOWN_MS = 60_000;
const REALTIME_VISIBILITY_PAUSE_DELAY_MS = 15_000;
let activeConnection: RealtimeConnection | null = null;

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
      void client.deactivate();
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
      client.subscribe("/user/queue/messages", (frame) => {
        void hydrateChatMessage(
          JSON.parse(frame.body) as ApiChatMessage,
          connection.currentUserId
        ).then((message) => {
          connection.onMessage(message);
        });
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

  client.onStompError = () => {
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
    void client.deactivate();
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
  const client = activeConnection?.client;
  if (!client?.connected) {
    return false;
  }

  client.publish({
    destination: `/app/chats/${chatId}/typing`,
    body: JSON.stringify({ typing }),
  });
  return true;
}

function syncTypingSubscriptions(connection: RealtimeConnection) {
  if (!connection.client.connected) {
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
  connection.userSubscriptions.forEach((subscription) => {
    try {
      subscription.unsubscribe();
    } catch {
      return;
    }
  });
  connection.userSubscriptions = [];

  connection.typingSubscriptions.forEach((subscription) => {
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

  void connection.client.deactivate();
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
  connection.connected = false;
  void connection.client.deactivate();
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
  setConnectionState(connection, false);
  void connection.client.deactivate();
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

function resolveWebSocketBaseUrl() {
  const baseUrl = WS_URL.trim().length > 0 ? WS_URL : window.location.origin;
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  return url.toString().replace(/\/+$/, "");
}
