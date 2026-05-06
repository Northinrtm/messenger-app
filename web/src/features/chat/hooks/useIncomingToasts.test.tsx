import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatMessage, ChatSummary } from "../../../lib/types";
import { useIncomingToasts } from "./useIncomingToasts";

type ToastHarnessState = ReturnType<typeof useIncomingToasts>;
type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type HarnessProps = {
  browserNotificationsEnabled?: boolean;
  onReady: (value: ToastHarnessState) => void;
  queryClient: QueryClient;
};

function incomingMessage(): ChatMessage {
  return {
    id: "message-1",
    chatId: "chat-2",
    serverOrder: 11,
    sender: {
      id: "user-2",
      username: "remote",
      displayName: "Remote",
      profession: null,
      avatarUrl: null,
      online: true,
    },
    content: "hello from toast",
    createdAt: "2026-04-18T12:01:00.000Z",
    editedAt: null,
    status: null,
    clientMessageId: null,
    localOrder: null,
    replyTo: null,
    reactions: [],
  };
}

function chatsSnapshot(): ChatSummary[] {
  return [
    {
      id: "chat-2",
      direct: true,
      title: "Remote",
      avatarUrl: null,
      chatVersion: "chat-version-1",
      capabilities: {
        canEditGroup: false,
        canDeleteGroup: false,
        canManageInviteLink: false,
        canAddMembers: false,
        canManageRoles: false,
        canModerateMembers: false,
        canTogglePrejoinHistory: false,
        canLeaveGroup: false,
      },
      ownerUserId: null,
      moderatorUserIds: [],
      members: [],
      lastMessage: "previous",
      lastMessageAt: "2026-04-18T12:00:00.000Z",
      lastMessageServerOrder: 10,
      updatedAt: "2026-04-18T12:00:00.000Z",
      unreadCount: 4,
      pinnedMessage: null,
    },
  ];
}

function Harness({ browserNotificationsEnabled = false, onReady, queryClient }: HarnessProps) {
  const toastState = useIncomingToasts({
    activeChatId: "chat-1",
    browserNotificationsEnabled,
    currentUserId: "user-1",
    formatPreview: (message) => message.content,
    queryClient,
    token: "session-token",
  });
  onReady(toastState);
  return null;
}

describe("useIncomingToasts", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let originalNotificationDescriptor: PropertyDescriptor | undefined;
  let originalVisibilityStateDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    originalNotificationDescriptor = Object.getOwnPropertyDescriptor(window, "Notification");
    originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "visibilityState"
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    if (originalNotificationDescriptor) {
      Object.defineProperty(window, "Notification", originalNotificationDescriptor);
    } else {
      delete (window as unknown as { Notification?: typeof Notification }).Notification;
    }
    if (originalVisibilityStateDescriptor) {
      Object.defineProperty(Document.prototype, "visibilityState", originalVisibilityStateDescriptor);
    }
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders an incoming toast without clearing unread state for that chat", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData<ChatSummary[]>(["chats", "session-token"], chatsSnapshot());

    const latestToastStateRef: { current: ToastHarnessState | null } = { current: null };
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestToastStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      latestToastStateRef.current?.showIncomingToast(incomingMessage());
      await Promise.resolve();
    });

    expect(latestToastStateRef.current?.incomingToasts).toHaveLength(1);
    expect(
      queryClient.getQueryData<ChatSummary[]>(["chats", "session-token"])?.[0]?.unreadCount
    ).toBe(4);
  });

  it("shows a browser notification with the decrypted preview when enabled and hidden", async () => {
    const notifications: Array<{ title: string; options?: NotificationOptions }> = [];
    class MockNotification {
      static permission = "granted" as const;
      onclick: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, options });
      }

      close() {}
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification as unknown as typeof Notification,
    });
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData<ChatSummary[]>(["chats", "session-token"], chatsSnapshot());

    const latestToastStateRef: { current: ToastHarnessState | null } = { current: null };
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            browserNotificationsEnabled={true}
            queryClient={queryClient}
            onReady={(value) => {
              latestToastStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      latestToastStateRef.current?.showIncomingToast(incomingMessage());
      await Promise.resolve();
    });

    expect(notifications).toEqual([
      {
        title: "Remote",
        options: expect.objectContaining({
          body: "Remote: hello from toast",
          tag: "north-messenger-chat-chat-2",
        }),
      },
    ]);
  });
});
