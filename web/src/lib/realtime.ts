import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { WS_URL } from "./config";
import type { ChatMessage, ChatSummary, SessionEvent } from "./types";

type SubscriptionOptions = {
  chatIds: string[];
  token: string;
  onChat: (chat: ChatSummary) => void;
  onMessage: (message: ChatMessage) => void;
  onSessionEvent: (event: SessionEvent) => void;
};

export function subscribeToChats({
  chatIds,
  token,
  onChat,
  onMessage,
  onSessionEvent,
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
      onMessage(JSON.parse(frame.body) as ChatMessage);
    });

    client.subscribe("/user/queue/sessions", (frame) => {
      onSessionEvent(JSON.parse(frame.body) as SessionEvent);
    });

    chatIds.forEach((chatId) => {
      client.subscribe(`/topic/chats.${chatId}`, (frame) => {
        onMessage(JSON.parse(frame.body) as ChatMessage);
      });
    });
  };

  client.activate();

  return () => {
    void client.deactivate();
  };
}
