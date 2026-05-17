type MockFrame = {
  body: string;
  headers?: Record<string, string | undefined>;
};

type MockSubscriptionCallback = (frame: MockFrame) => void;

const createdClients: MockClient[] = [];
const createdClientConfigs: Array<Record<string, unknown>> = [];

class MockClient {
  active = false;
  connected = false;
  webSocket: {readyState: number} = {readyState: 0};
  onConnect?: (() => void) | undefined;
  onStompError?: ((frame: MockFrame) => void) | undefined;
  onWebSocketError?: (() => void) | undefined;
  onWebSocketClose?: (() => void) | undefined;
  publish = jest.fn();
  subscribe = jest.fn(
    (destination: string, callback: MockSubscriptionCallback) => {
      this.subscriptions.set(destination, callback);
      return {
        unsubscribe: () => {
          this.subscriptions.delete(destination);
        },
      };
    },
  );

  private readonly subscriptions = new Map<string, MockSubscriptionCallback>();

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
    this.connected = false;
    this.webSocket = {readyState: 3};
    return Promise.resolve();
  }

  triggerConnect() {
    this.connected = true;
    this.webSocket = {readyState: 1};
    this.onConnect?.();
  }

  triggerClose() {
    this.connected = false;
    this.webSocket = {readyState: 3};
    this.onWebSocketClose?.();
  }

  emit(destination: string, body: unknown) {
    const callback = this.subscriptions.get(destination);
    if (!callback) {
      throw new Error(`No subscription registered for ${destination}`);
    }

    callback({
      body: JSON.stringify(body),
      headers: {},
    });
  }
}

jest.mock('@stomp/stompjs', () => ({
  Client: jest.fn().mockImplementation((config: Record<string, unknown>) => {
    createdClientConfigs.push(config);
    const client = new MockClient();
    createdClients.push(client);
    return client;
  }),
  ReconnectionTimeMode: {
    EXPONENTIAL: 'EXPONENTIAL',
  },
  TickerStrategy: {
    Interval: 'Interval',
  },
}));

jest.mock('../config', () => ({
  WS_URL: 'https://pishi.ktsf.ru',
}));

jest.mock('./messagePayload', () => ({
  hydrateApiChatMessage: <T,>(message: T) => message,
}));

import {sendMessageRealtime, subscribeToChats} from './realtime';

describe('realtime send queue', () => {
  beforeEach(() => {
    createdClients.length = 0;
    createdClientConfigs.length = 0;
    jest.clearAllMocks();
  });

  it('queues outgoing messages until websocket connect succeeds', async () => {
    const unsubscribe = subscribeToChats({
      chatIds: [],
      token: 'token-1',
      currentUserId: 'user-1',
      onChat: () => undefined,
      onMessage: () => undefined,
      onSessionEvent: () => undefined,
    });
    const client = createdClients[0];
    if (!client) {
      throw new Error('Mock STOMP client was not created');
    }

    const sendPromise = sendMessageRealtime({
      chatId: 'chat-1',
      clientMessageId: 'client-1',
      plainPayload: {
        content: 'Queued hello',
      },
    });

    let settled = 'pending';
    sendPromise.then(
      () => {
        settled = 'resolved';
      },
      () => {
        settled = 'rejected';
      },
    );
    await Promise.resolve();

    expect(settled).toBe('pending');
    expect(client.publish).not.toHaveBeenCalled();
    expect(createdClientConfigs[0]).toEqual(
      expect.objectContaining({
        forceBinaryWSFrames: true,
      }),
    );

    client.triggerConnect();

    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/chats/chat-1/messages',
      body: JSON.stringify({
        clientMessageId: 'client-1',
        replyToMessageId: null,
        forwardedFromMessageId: null,
        attachmentIds: [],
        plainPayload: {
          content: 'Queued hello',
        },
      }),
    });

    const ack = {
      id: 'message-1',
      chatId: 'chat-1',
      serverOrder: 1,
      sender: {
        id: 'user-1',
        username: 'north',
        displayName: 'North',
        profession: null,
        avatarUrl: null,
        online: true,
      },
      createdAt: '2026-05-18T00:00:00.000Z',
      editedAt: null,
      status: null,
      clientMessageId: 'client-1',
      replyTo: null,
      reactions: [],
      plainPayload: {
        content: 'Queued hello',
      },
      attachments: [],
    };
    client.emit('/user/queue/message-acks', ack);

    await expect(sendPromise).resolves.toEqual(ack);
    unsubscribe();
  });

  it('replays an unacknowledged message after reconnect instead of failing it immediately', async () => {
    const unsubscribe = subscribeToChats({
      chatIds: [],
      token: 'token-1',
      currentUserId: 'user-1',
      onChat: () => undefined,
      onMessage: () => undefined,
      onSessionEvent: () => undefined,
    });
    const client = createdClients[0];
    if (!client) {
      throw new Error('Mock STOMP client was not created');
    }

    client.triggerConnect();

    const sendPromise = sendMessageRealtime({
      chatId: 'chat-1',
      clientMessageId: 'client-reconnect-1',
      plainPayload: {
        content: 'Reconnect hello',
      },
    });

    expect(client.publish).toHaveBeenCalledTimes(1);

    client.triggerClose();

    let settled = 'pending';
    sendPromise.then(
      () => {
        settled = 'resolved';
      },
      () => {
        settled = 'rejected';
      },
    );
    await Promise.resolve();

    expect(settled).toBe('pending');

    client.triggerConnect();

    expect(client.publish).toHaveBeenCalledTimes(2);
    expect(client.publish).toHaveBeenLastCalledWith({
      destination: '/app/chats/chat-1/messages',
      body: JSON.stringify({
        clientMessageId: 'client-reconnect-1',
        replyToMessageId: null,
        forwardedFromMessageId: null,
        attachmentIds: [],
        plainPayload: {
          content: 'Reconnect hello',
        },
      }),
    });

    const ack = {
      id: 'message-2',
      chatId: 'chat-1',
      serverOrder: 2,
      sender: {
        id: 'user-1',
        username: 'north',
        displayName: 'North',
        profession: null,
        avatarUrl: null,
        online: true,
      },
      createdAt: '2026-05-18T00:00:01.000Z',
      editedAt: null,
      status: null,
      clientMessageId: 'client-reconnect-1',
      replyTo: null,
      reactions: [],
      plainPayload: {
        content: 'Reconnect hello',
      },
      attachments: [],
    };
    client.emit('/user/queue/message-acks', ack);

    await expect(sendPromise).resolves.toEqual(ack);
    unsubscribe();
  });
});
