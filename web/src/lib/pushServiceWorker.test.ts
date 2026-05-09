// @vitest-environment node

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type MockWindowClient = {
  focused?: boolean;
  focus?: () => Promise<unknown>;
  url: string;
  visibilityState?: string;
};

type ServiceWorkerHandler = (event: {
  notification?: { close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

function loadPushServiceWorker(windowClients: MockWindowClient[] = []) {
  const handlers: Record<string, ServiceWorkerHandler | undefined> = {};
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const self = {
    addEventListener: (type: string, handler: ServiceWorkerHandler) => {
      handlers[type] = handler;
    },
    clients: {
      matchAll: vi.fn(async () => windowClients),
      openWindow,
    },
    location: {
      origin: "https://north.example",
    },
    registration: {
      showNotification,
    },
  };

  const scriptSource = readFileSync(new URL("../../public/push-sw.js", import.meta.url), "utf8");
  const context = vm.createContext({
    Promise,
    URL,
    self,
  });
  new vm.Script(scriptSource).runInContext(context);

  return {
    handlers,
    openWindow,
    showNotification,
  };
}

async function dispatchPush(handlers: Record<string, ServiceWorkerHandler | undefined>) {
  let pendingWork: Promise<unknown> | null = null;
  handlers.push?.({
    waitUntil: (promise) => {
      pendingWork = promise;
    },
  });
  await pendingWork;
}

describe("push service worker", () => {
  it("shows a notification when the messenger tab exists but stays hidden", async () => {
    const { handlers, showNotification } = loadPushServiceWorker([
      {
        focused: false,
        url: "https://north.example/",
        visibilityState: "hidden",
      },
    ]);

    await dispatchPush(handlers);

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("suppresses the generic notification when a visible messenger tab is open", async () => {
    const { handlers, showNotification } = loadPushServiceWorker([
      {
        focused: false,
        url: "https://north.example/chats/general",
        visibilityState: "visible",
      },
    ]);

    await dispatchPush(handlers);

    expect(showNotification).not.toHaveBeenCalled();
  });
});
