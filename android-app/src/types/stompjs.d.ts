declare module '@stomp/stompjs' {
  export class Client {
    constructor(config?: Record<string, unknown>);
    active: boolean;
    connected: boolean;
    webSocket?: {
      readyState: number;
    };
    onConnect?: (() => void) | undefined;
    onStompError?: ((frame: IFrame) => void) | undefined;
    onWebSocketError?: (() => void) | undefined;
    onWebSocketClose?: (() => void) | undefined;
    activate(): void;
    deactivate(): Promise<void>;
    publish(input: {destination: string; body: string}): void;
    subscribe(destination: string, callback: (frame: IFrame) => void): StompSubscription;
  }

  export const ReconnectionTimeMode: {
    EXPONENTIAL: unknown;
  };

  export const TickerStrategy: {
    Interval: unknown;
  };

  export type IFrame = {
    body: string;
    headers?: Record<string, string | undefined>;
  };

  export type StompSubscription = {
    unsubscribe(): void;
  };
}
