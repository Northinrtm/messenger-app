import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./e2ee", () => ({
  hydrateChatMessage: vi.fn(async (message: Record<string, unknown>) => ({
    id: message.id,
    chatId: message.chatId,
    sender: message.sender,
    content: "hydrated from realtime",
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    status: message.status ?? null,
    clientMessageId: message.clientMessageId ?? null,
    replyTo: message.replyTo ?? null,
    reactions: message.reactions ?? [],
  })),
}));

import { hydrateChatMessage } from "./e2ee";
import { subscribeToChats } from "./realtime";

const stompClients: MockClient[] = [];

vi.mock("@stomp/stompjs", () => {
  class Client {
    active = false;
    connected = false;
    activateCalls = 0;
    deactivateCalls = 0;
    publishCalls: Array<{ destination: string; body: string }> = [];
    subscriptions = new Map<string, (frame: { body: string }) => void>();
    onConnect = () => undefined;
    onStompError = () => undefined;
    onWebSocketClose = () => undefined;
    onWebSocketError = () => undefined;

    constructor(readonly config: { brokerURL: string }) {
      stompClients.push(this as unknown as MockClient);
    }

    activate() {
      this.active = true;
      this.activateCalls += 1;
    }

    deactivate() {
      this.active = false;
      this.deactivateCalls += 1;
      return Promise.resolve();
    }

    subscribe(destination: string, callback: (frame: { body: string }) => void) {
      this.subscriptions.set(destination, callback);
      return {
        unsubscribe: () => {
          this.subscriptions.delete(destination);
        },
      };
    }

    publish(frame: { destination: string; body: string }) {
      this.publishCalls.push(frame);
    }
  }

  return {
    Client,
    ReconnectionTimeMode: {
      EXPONENTIAL: "EXPONENTIAL",
    },
    TickerStrategy: {
      Worker: "Worker",
    },
  };
});

type MockClient = {
  active: boolean;
  connected: boolean;
  activateCalls: number;
  deactivateCalls: number;
  publishCalls: Array<{ destination: string; body: string }>;
  subscriptions: Map<string, (frame: { body: string }) => void>;
  config: {
    brokerURL: string;
  };
  onConnect: () => void;
  onStompError: () => void;
  onWebSocketClose: () => void;
  onWebSocketError: () => void;
  activate: () => void;
  deactivate: () => Promise<void>;
};

function emitFrame(
  client: MockClient,
  destination: string,
  body: Record<string, unknown>
) {
  client.subscriptions.get(destination)?.({
    body: JSON.stringify(body),
  });
}

function setDocumentVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function createSubscription(options?: {
  onConnectionChange?: (connected: boolean) => void;
}) {
  return subscribeToChats({
    chatIds: [],
    token: "test-token",
    currentUserId: "user-1",
    onChat: () => undefined,
    onMessage: () => undefined,
    onSessionEvent: () => undefined,
    onConnectionChange: options?.onConnectionChange,
  });
}

describe("realtime reconnect protection", () => {
  beforeEach(() => {
    stompClients.length = 0;
    vi.useFakeTimers();
    setDocumentVisibilityState("visible");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("pauses websocket reconnects after repeated rapid failures", () => {
    const dispose = createSubscription();
    const client = stompClients[0];

    expect(client.config.brokerURL).toBe("ws://localhost:8080/ws");
    expect(client.activateCalls).toBe(1);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      client.onWebSocketClose();
      vi.advanceTimersByTime(300);
    }

    expect(client.deactivateCalls).toBe(0);

    client.onWebSocketClose();

    expect(client.deactivateCalls).toBe(1);
    expect(client.active).toBe(false);

    vi.advanceTimersByTime(59_999);
    expect(client.activateCalls).toBe(1);

    vi.advanceTimersByTime(1);
    expect(client.activateCalls).toBe(2);

    dispose();
  });

  it("cancels the delayed reconnect when the subscription is disposed", () => {
    const dispose = createSubscription();
    const client = stompClients[0];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      client.onWebSocketClose();
      vi.advanceTimersByTime(300);
    }

    expect(client.deactivateCalls).toBe(1);

    dispose();
    vi.advanceTimersByTime(60_000);

    expect(client.activateCalls).toBe(1);
  });

  it("retires an older websocket client when a new subscription starts", () => {
    const firstConnectionChange = vi.fn();
    const secondConnectionChange = vi.fn();

    const disposeFirst = createSubscription({
      onConnectionChange: firstConnectionChange,
    });
    const firstClient = stompClients[0];

    firstClient.onConnect();
    expect(firstConnectionChange).toHaveBeenCalledWith(true);

    const disposeSecond = createSubscription({
      onConnectionChange: secondConnectionChange,
    });
    const secondClient = stompClients[1];

    expect(firstClient.deactivateCalls).toBe(1);

    firstClient.onWebSocketClose();
    expect(firstConnectionChange).toHaveBeenCalledTimes(1);

    secondClient.onConnect();
    expect(secondConnectionChange).toHaveBeenCalledWith(true);

    disposeSecond();
    disposeFirst();
  });

  it("keeps realtime active while the tab is hidden", () => {
    const connectionChange = vi.fn();
    const dispose = createSubscription({
      onConnectionChange: connectionChange,
    });
    const client = stompClients[0];

    client.connected = true;
    client.onConnect();
    expect(connectionChange).toHaveBeenCalledWith(true);

    setDocumentVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    vi.advanceTimersByTime(15_000);
    expect(client.deactivateCalls).toBe(0);

    setDocumentVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(client.activateCalls).toBe(1);
    expect(connectionChange).toHaveBeenCalledTimes(1);

    dispose();
  });

  it("does not treat pagehide shutdown as a reconnect failure", () => {
    const dispose = createSubscription();
    const client = stompClients[0];

    client.connected = true;
    client.onConnect();

    window.dispatchEvent(new Event("pagehide"));
    expect(client.deactivateCalls).toBe(1);

    client.onWebSocketClose();
    vi.advanceTimersByTime(60_000);

    expect(client.activateCalls).toBe(1);

    dispose();
  });

  it("hydrates incoming websocket messages and forwards them to onMessage", async () => {
    const onMessage = vi.fn();
    const dispose = subscribeToChats({
      chatIds: [],
      token: "test-token",
      currentUserId: "user-1",
      onChat: () => undefined,
      onMessage,
      onSessionEvent: () => undefined,
    });
    const client = stompClients[0];
    client.connected = true;
    client.onConnect();

    const incomingPayload = {
      id: "message-id",
      chatId: "chat-id",
      sender: {
        id: "user-2",
        username: "remote",
        displayName: "Remote",
        profession: null,
        avatarUrl: null,
        online: true,
      },
      content: null,
      createdAt: "2026-04-13T12:00:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      encryptedPayload: {
        scheme: "X3DH-DEVICE-AES-GCM",
        encryptedKeysByRecipientId: {},
      },
    };

    emitFrame(client, "/user/queue/messages", incomingPayload);
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.mocked(hydrateChatMessage)).toHaveBeenCalledWith(incomingPayload, "user-1");
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "message-id",
        chatId: "chat-id",
        content: "hydrated from realtime",
      })
    );

    dispose();
  });

});
