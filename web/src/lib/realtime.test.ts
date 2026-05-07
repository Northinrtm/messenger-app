import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hydrateApiChatMessageMock } = vi.hoisted(() => ({
  hydrateApiChatMessageMock: vi.fn((message: Record<string, unknown>) => ({
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
    attachments: [],
  })),
}));

vi.mock("./messagePayload", async () => {
  const actual = await vi.importActual<typeof import("./messagePayload")>("./messagePayload");
  return {
    ...actual,
    hydrateApiChatMessage: hydrateApiChatMessageMock,
  };
});

import { ApiError } from "./api";
import { hydrateApiChatMessage } from "./messagePayload";
import { publishTypingEvent, sendMessageRaw, subscribeToChats } from "./realtime";

const stompClients: MockClient[] = [];

vi.mock("@stomp/stompjs", () => {
  class Client {
    active = false;
    connected = false;
    webSocket = { readyState: 1 };
    activateCalls = 0;
    deactivateCalls = 0;
    publishCalls: Array<{ destination: string; body: string }> = [];
    subscriptions = new Map<string, (frame: { body: string }) => void>();
    onConnect = () => undefined;
    onStompError = (_frame?: { headers?: Record<string, string>; body?: string }) => undefined;
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
  webSocket: { readyState: number };
  activateCalls: number;
  deactivateCalls: number;
  publishCalls: Array<{ destination: string; body: string }>;
  subscriptions: Map<string, (frame: { body: string }) => void>;
  config: {
    brokerURL: string;
  };
  onConnect: () => void;
  onStompError: (frame?: { headers?: Record<string, string>; body?: string }) => void;
  onWebSocketClose: () => void;
  onWebSocketError: () => void;
  activate: () => void;
  deactivate: () => Promise<void>;
};

function emitFrame(client: MockClient, destination: string, body: Record<string, unknown>) {
  client.subscriptions.get(destination)?.({
    body: JSON.stringify(body),
  });
}

function createSubscription(options?: {
  onConnectionChange?: (connected: boolean) => void;
  onAuthFailure?: () => void;
  onMessage?: (message: unknown) => void;
}) {
  return subscribeToChats({
    chatIds: [],
    token: "test-token",
    currentUserId: "user-1",
    onChat: () => undefined,
    onMessage: options?.onMessage ?? (() => undefined),
    onSessionEvent: () => undefined,
    onConnectionChange: options?.onConnectionChange,
    onAuthFailure: options?.onAuthFailure,
  });
}

describe("realtime transport", () => {
  beforeEach(() => {
    stompClients.length = 0;
    hydrateApiChatMessageMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("hydrates incoming websocket messages and forwards them to onMessage", async () => {
    const onMessage = vi.fn();
    const dispose = createSubscription({ onMessage });
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
      createdAt: "2026-04-13T12:00:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: null,
      replyTo: null,
      reactions: [],
      plainPayload: {
        content: "hello",
      },
    };

    emitFrame(client, "/user/queue/messages", incomingPayload);
    await Promise.resolve();

    expect(vi.mocked(hydrateApiChatMessage)).toHaveBeenCalledWith(incomingPayload);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "message-id",
        chatId: "chat-id",
        content: "hydrated from realtime",
      })
    );

    dispose();
  });

  it("sends plain messages over websocket and resolves from sender ack", async () => {
    const dispose = createSubscription();
    const client = stompClients[0];
    client.connected = true;
    client.onConnect();

    const sendPromise = sendMessageRaw("ignored", "chat-1", {
      clientMessageId: "client-1",
      plainPayload: {
        content: "hello",
      },
    });

    expect(client.publishCalls).toEqual([
      {
        destination: "/app/chats/chat-1/messages",
        body: JSON.stringify({
          clientMessageId: "client-1",
          replyToMessageId: null,
          attachmentIds: [],
          plainPayload: {
            content: "hello",
          },
        }),
      },
    ]);

    const ackPayload = {
      id: "server-1",
      chatId: "chat-1",
      sender: {
        id: "user-1",
        username: "north",
        displayName: "North",
        profession: null,
        avatarUrl: null,
        online: true,
      },
      createdAt: "2026-04-13T12:00:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "client-1",
      serverOrder: 42,
      replyTo: null,
      reactions: [],
      plainPayload: {
        content: "hello",
      },
    };

    emitFrame(client, "/user/queue/message-acks", ackPayload);

    await expect(sendPromise).resolves.toMatchObject({
      id: "server-1",
      clientMessageId: "client-1",
    });

    dispose();
  });

  it("rejects sends when realtime is unavailable", async () => {
    createSubscription();
    await expect(
      sendMessageRaw("token", "chat-1", {
        clientMessageId: "client-http",
        plainPayload: {
          content: "hello http",
        },
      })
    ).rejects.toMatchObject(
      new ApiError("Realtime connection is unavailable. Retry after reconnect.", 503)
    );
  });

  it("publishes typing events for active realtime connections", () => {
    const dispose = createSubscription();
    const client = stompClients[0];
    client.connected = true;
    client.onConnect();

    publishTypingEvent("chat-1", true);

    expect(client.publishCalls.at(-1)).toEqual({
      destination: "/app/chats/chat-1/typing",
      body: JSON.stringify({ typing: true }),
    });

    dispose();
  });

  it("rejects duplicate pending realtime sends", async () => {
    const dispose = createSubscription();
    const client = stompClients[0];
    client.connected = true;
    client.onConnect();

    const firstSend = sendMessageRaw("ignored", "chat-1", {
      clientMessageId: "client-dup",
      plainPayload: {
        content: "one",
      },
    });
    await expect(
      sendMessageRaw("ignored", "chat-1", {
        clientMessageId: "client-dup",
        plainPayload: {
          content: "two",
        },
      })
    ).rejects.toMatchObject(new ApiError("Message send is already pending", 409));

    emitFrame(client, "/user/queue/message-acks", {
      id: "server-dup",
      chatId: "chat-1",
      sender: {
        id: "user-1",
        username: "north",
        displayName: "North",
        profession: null,
        avatarUrl: null,
        online: true,
      },
      createdAt: "2026-04-13T12:00:00.000Z",
      editedAt: null,
      status: null,
      clientMessageId: "client-dup",
      replyTo: null,
      reactions: [],
      plainPayload: {
        content: "one",
      },
    });
    await firstSend;

    dispose();
  });
});
