import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToChats } from "./realtime";

const stompClients: MockClient[] = [];

vi.mock("@stomp/stompjs", () => {
  class Client {
    active = false;
    connected = false;
    activateCalls = 0;
    deactivateCalls = 0;
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

    subscribe() {
      return {
        unsubscribe() {
          return undefined;
        },
      };
    }

    publish() {
      return undefined;
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

function createSubscription() {
  return subscribeToChats({
    chatIds: [],
    token: "test-token",
    currentUserId: "user-1",
    onChat: () => undefined,
    onMessage: () => undefined,
    onSessionEvent: () => undefined,
  });
}

describe("realtime reconnect protection", () => {
  beforeEach(() => {
    stompClients.length = 0;
    vi.useFakeTimers();
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
});
