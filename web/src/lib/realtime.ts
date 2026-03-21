import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { WS_URL } from "./config";
import type { ChatMessage } from "./types";

type SubscriptionOptions = {
  chatIds: string[];
  token: string;
  onMessage: (message: ChatMessage) => void;
};

export function subscribeToChats({
  chatIds,
  token,
  onMessage,
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
