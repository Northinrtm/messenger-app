import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { WS_URL } from "./config";
import { hydrateChatMessage } from "./e2ee";
import type {
  ApiChatMessage,
  ChatMessage,
  ChatSummary,
  MessageStatusEvent,
  SessionEvent,
  TypingEvent,
} from "./types";

let activeClient: Client | null = null;

type SubscriptionOptions = {
  chatIds: string[];
  token: string;
  currentUserId: string;
  onChat: (chat: ChatSummary) => void;
  onMessage: (message: ChatMessage) => void;
  onMessageStatus?: (event: MessageStatusEvent) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onTyping?: (event: TypingEvent) => void;
};

export function subscribeToChats({
  chatIds,
  token,
  currentUserId,
  onChat,
  onMessage,
  onMessageStatus,
  onSessionEvent,
  onTyping,
}: SubscriptionOptions) {
  const client = new Client({
    webSocketFactory: () => new SockJS(`${WS_URL}/ws`),
    connectHeaders: {
      Authorization: `Bearer ${token}`,
    },
    reconnectDelay: 5000,
    debug: () => undefined,
  });

  client.onConnect = () => {
    client.subscribe("/user/queue/chats", (frame) => {
      onChat(JSON.parse(frame.body) as ChatSummary);
    });

    client.subscribe("/user/queue/messages", (frame) => {
      void hydrateChatMessage(JSON.parse(frame.body) as ApiChatMessage, currentUserId).then(onMessage);
    });

    if (onMessageStatus) {
      client.subscribe("/user/queue/message-statuses", (frame) => {
        onMessageStatus(JSON.parse(frame.body) as MessageStatusEvent);
      });
    }

    client.subscribe("/user/queue/sessions", (frame) => {
      onSessionEvent(JSON.parse(frame.body) as SessionEvent);
    });

    chatIds.forEach((chatId) => {
      if (onTyping) {
        client.subscribe(`/topic/chats.${chatId}.typing`, (frame) => {
          onTyping(JSON.parse(frame.body) as TypingEvent);
        });
      }
    });
  };

  activeClient = client;
  client.activate();

  return () => {
    if (activeClient === client) {
      activeClient = null;
    }
    void client.deactivate();
  };
}
