import { Client, type StompSubscription } from "@stomp/stompjs";
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
};

type OutgoingEncryptedMessagePayload = {
  scheme: string;
  ciphertext: string;
  iv: string;
  encryptedKeysByUserId: Record<string, string>;
};

type PendingOutgoingMessage = {
  reject: (error: Error) => void;
  resolve: (message: ChatMessage) => void;
  timeoutId: number;
};

const OUTGOING_MESSAGE_ACK_TIMEOUT_MS = 1_500;
let activeConnection: RealtimeConnection | null = null;
const pendingOutgoingMessages = new Map<string, PendingOutgoingMessage>();

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
  };

  const client = new Client({
    brokerURL: `${resolveWebSocketBaseUrl()}/ws`,
    connectHeaders: {
      Authorization: `Bearer ${token}`,
    },
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    reconnectDelay: 1000,
    debug: () => undefined,
  });
  connection.client = client;

  client.onConnect = () => {
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
          resolvePendingOutgoingMessage(message);
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
    clearSubscriptions(connection);
    setConnectionState(connection, false);
  };

  client.onWebSocketError = () => {
    setConnectionState(connection, false);
  };

  client.onWebSocketClose = () => {
    clearSubscriptions(connection);
    setConnectionState(connection, false);
  };

  activeConnection = connection;
  client.activate();

  return () => {
    clearSubscriptions(connection);
    setConnectionState(connection, false);
    if (activeConnection === connection) {
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

export function publishOutgoingMessage(
  chatId: string,
  request: {
    clientMessageId?: string;
    replyToMessageId?: string | null;
    encryptedPayload: OutgoingEncryptedMessagePayload;
  }
) {
  const client = activeConnection?.client;
  const clientMessageId = request.clientMessageId?.trim();
  if (!client?.connected || !clientMessageId) {
    return null;
  }

  return new Promise<ChatMessage>((resolve, reject) => {
    const existing = pendingOutgoingMessages.get(clientMessageId);
    if (existing) {
      window.clearTimeout(existing.timeoutId);
      existing.reject(new Error("Superseded outgoing message acknowledgement"));
      pendingOutgoingMessages.delete(clientMessageId);
    }

    const timeoutId = window.setTimeout(() => {
      pendingOutgoingMessages.delete(clientMessageId);
      reject(new Error("Outgoing message acknowledgement timed out"));
    }, OUTGOING_MESSAGE_ACK_TIMEOUT_MS);

    pendingOutgoingMessages.set(clientMessageId, {
      resolve,
      reject,
      timeoutId,
    });

    client.publish({
      destination: `/app/chats/${chatId}/messages`,
      body: JSON.stringify(request),
    });
  });
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

  rejectPendingOutgoingMessages();
}

function setConnectionState(connection: RealtimeConnection, connected: boolean) {
  if (connection.connected === connected) {
    return;
  }

  connection.connected = connected;
  connection.onConnectionChange?.(connected);
}

function resolvePendingOutgoingMessage(message: ChatMessage) {
  const clientMessageId = message.clientMessageId ?? null;
  if (!clientMessageId) {
    return;
  }

  const pending = pendingOutgoingMessages.get(clientMessageId);
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeoutId);
  pendingOutgoingMessages.delete(clientMessageId);
  pending.resolve(message);
}

function rejectPendingOutgoingMessages() {
  pendingOutgoingMessages.forEach((pending) => {
    window.clearTimeout(pending.timeoutId);
    pending.reject(new Error("Realtime connection is unavailable"));
  });
  pendingOutgoingMessages.clear();
}

function normalizeChatIds(chatIds: string[]) {
  return Array.from(new Set(chatIds)).sort();
}

function resolveWebSocketBaseUrl() {
  const baseUrl = WS_URL.trim().length > 0 ? WS_URL : window.location.origin;
  const url = new URL(baseUrl, window.location.origin);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  return url.toString().replace(/\/+$/, "");
}
