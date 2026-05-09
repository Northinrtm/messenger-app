import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import {
  ApiError,
  deletePendingOutgoingMessage,
  upsertPendingOutgoingMessage,
} from "../../../lib/api";
import type { PendingOutgoingMessage } from "../../../lib/types";
vi.mock("../../../lib/plainMessages", () => ({
  sendPlainMessage: vi.fn(),
  updatePlainMessage: vi.fn(),
}));
vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api");
  return {
    ...actual,
    upsertPendingOutgoingMessage: vi.fn(
      async (
        _token: string,
        clientMessageId: string,
        body: Omit<PendingOutgoingMessage, "clientMessageId" | "updatedAt">
      ) => ({
        ...body,
        clientMessageId,
        updatedAt: new Date().toISOString(),
      })
    ),
    deletePendingOutgoingMessage: vi.fn(async () => undefined),
    deleteChatDraft: vi.fn(async () => undefined),
  };
});

import { sendPlainMessage } from "../../../lib/plainMessages";
import type { AuthResponse, ChatSummary, UserProfile } from "../../../lib/types";
import { useMessageActions } from "./useMessageActions";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type HarnessState = {
  draftsByChatId: Record<string, string>;
  deleteMessageForSelf: (chatId: string, messageId: string) => void;
  submitActiveDraft: (draft: string) => boolean | Promise<boolean>;
  queryClient: QueryClient;
};

type HarnessProps = {
  isRealtimeConnected?: boolean;
  onApplyChatPreviewMessage?: (message: unknown) => void;
  onApplyServerChatPreviewMessage?: (message: unknown, mode: "clear" | "keep") => void;
  onReady: (value: HarnessState) => void;
  queryClient: QueryClient;
};

function currentUser(): UserProfile {
  return {
    id: "user-1",
    username: "north",
    displayName: "North",
    createdAt: "2026-04-18T12:00:00.000Z",
    profession: null,
    avatarUrl: null,
    online: true,
  };
}

function session(): AuthResponse {
  return {
    token: "session-token",
    tokenExpiresAt: "2026-04-18T13:00:00.000Z",
    sessionId: "session-1",
    user: currentUser(),
  };
}

function activeChat(): ChatSummary {
  const self = currentUser();
  return {
    id: "chat-1",
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
    members: [
      self,
      {
        id: "user-2",
        username: "remote",
        displayName: "Remote",
        profession: null,
        avatarUrl: null,
        online: true,
      },
    ],
    lastMessage: null,
    lastMessageAt: null,
    updatedAt: "2026-04-18T12:00:00.000Z",
    unreadCount: 0,
    pinnedMessage: null,
  };
}

function sentMessage(clientMessageId: string) {
  return {
    id: `server-${clientMessageId}`,
    chatId: "chat-1",
    serverOrder: 43,
    sender: currentUser(),
    content: "stuck message",
    createdAt: "2026-04-18T12:00:02.000Z",
    editedAt: null,
    status: {
      state: "SENT" as const,
      recipientCount: 1,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId,
    replyTo: null,
    reactions: [],
    attachments: [],
  };
}

function Harness({
  isRealtimeConnected = false,
  onApplyChatPreviewMessage,
  onApplyServerChatPreviewMessage,
  onReady,
  queryClient,
}: HarnessProps) {
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({
    "chat-1": "message that must not come back",
  });
  const pendingOutgoingMessagesQuery = useQuery({
    queryKey: ["pending-outgoing-messages", "user-1"],
    queryFn: () => [],
    staleTime: Infinity,
  });
  const actions = useMessageActions({
    activeChat: activeChat(),
    activePinnedMessageIdSet: new Set<string>(),
    chats: [activeChat()],
    currentUser: currentUser(),
    session: session(),
    editingMessage: null,
    forwardingMessages: [],
    replyingToMessage: null,
    sessionToken: "session-token",
    applyChatPreviewMessage: (message) => onApplyChatPreviewMessage?.(message),
    applyServerChatPreviewMessage: (message, mode) =>
      onApplyServerChatPreviewMessage?.(message, mode),
    clearComposerContext: () => undefined,
    clearDraftForChat: () => undefined,
    deleteChatLocally: () => undefined,
    focusComposer: () => undefined,
    incrementPendingOutgoing: () => undefined,
    decrementPendingOutgoing: () => undefined,
    isRealtimeConnected,
    onOpenChat: () => undefined,
    onOpenForwardSheet: () => undefined,
    pendingOutgoingMessages: pendingOutgoingMessagesQuery.data ?? [],
    refreshChatPreviewFromServer: () => undefined,
    rememberRealtimeMessage: () => undefined,
    scheduleDraftSave: () => undefined,
    setContextMenu: () => undefined,
    setDraftsByChatId,
    setEditingMessageId: () => undefined,
    setForwardingMessageIds: () => undefined,
    setReplyingToMessageId: () => undefined,
    stopTyping: () => undefined,
    removeChatPinnedMessage: () => undefined,
    syncChatPinnedMessage: () => undefined,
    syncChatPreviewFromCache: () => undefined,
  });

  useEffect(() => {
    onReady({
      draftsByChatId,
      deleteMessageForSelf: actions.deleteMessageForSelf,
      submitActiveDraft: actions.submitActiveDraft,
      queryClient,
    });
  }, [actions.deleteMessageForSelf, actions.submitActiveDraft, draftsByChatId, onReady, queryClient]);

  return null;
}

async function flushMicrotasks(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("useMessageActions send failure recovery", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
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
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("keeps the composer empty and relies on the failed pending bubble after send rejection", async () => {
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(new Error("send failed"));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    expect(latestStateRef.current?.draftsByChatId["chat-1"]).toBe(
      "message that must not come back"
    );

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("message that must not come back");
      await flushMicrotasks();
    });

    expect(latestStateRef.current?.draftsByChatId["chat-1"] ?? "").toBe("");
    const pendingMessages = queryClient.getQueryData([
      "pending-outgoing-messages",
      "user-1",
    ]) as Array<{ clientMessageId: string; status: string }> | undefined;

    expect(pendingMessages).toEqual([
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
        status: "FAILED",
      }),
    ]);
  });

  it("clears the draft even when parent draft state lags behind the submitted textarea", async () => {
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(new Error("send failed"));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    expect(latestStateRef.current?.draftsByChatId["chat-1"]).toBe(
      "message that must not come back"
    );

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("latest textarea value");
      await flushMicrotasks();
    });

    expect(latestStateRef.current?.draftsByChatId["chat-1"] ?? "").toBe("");
  });

  it("still starts the send attempt when pending message persistence hits storage quota", async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === "north-messenger-local-pending-messages:user-1") {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }

      return originalSetItem.call(this, key, value);
    });
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(new Error("send failed"));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("message despite quota");
      await flushMicrotasks(10);
    });

    expect(vi.mocked(sendPlainMessage)).toHaveBeenCalledTimes(1);
    expect(latestStateRef.current?.draftsByChatId["chat-1"] ?? "").toBe("");
    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
        status: "FAILED",
      }),
    ]);
  });

  it("does not persist an optimistic chat preview before the server confirms the send", async () => {
    const applyChatPreviewMessage = vi.fn();
    const applyServerChatPreviewMessage = vi.fn();
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(new Error("send failed"));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onApplyChatPreviewMessage={applyChatPreviewMessage}
            onApplyServerChatPreviewMessage={applyServerChatPreviewMessage}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("preview should stay optimistic only");
      await flushMicrotasks();
    });

    expect(applyChatPreviewMessage).not.toHaveBeenCalled();
    expect(applyServerChatPreviewMessage).toHaveBeenCalledTimes(1);
    expect(applyServerChatPreviewMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
      }),
      "clear"
    );
  });

  it("marks transient realtime send failures as failed for explicit retry", async () => {
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(
      new ApiError("Realtime connection was interrupted before the message was confirmed.", 503)
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("message keeps sending");
      await flushMicrotasks();
    });

    const pendingMessages = queryClient.getQueryData([
      "pending-outgoing-messages",
      "user-1",
    ]) as Array<{ clientMessageId: string; status: string }> | undefined;

    expect(pendingMessages).toEqual([
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
        status: "FAILED",
      }),
    ]);
  });

  it("marks request conflicts as failed for explicit retry", async () => {
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(
      new ApiError("Message send is already pending", 409)
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            isRealtimeConnected
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("message hits a request conflict");
      await flushMicrotasks();
    });

    const pendingMessages = queryClient.getQueryData([
      "pending-outgoing-messages",
      "user-1",
    ]) as Array<{ clientMessageId: string; status: string }> | undefined;

    expect(pendingMessages).toEqual([
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
        status: "FAILED",
      }),
    ]);
  });

  it("marks gateway transport failures as failed for explicit retry", async () => {
    vi.mocked(sendPlainMessage).mockRejectedValueOnce(
      new ApiError("Backend is unavailable", 502)
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            isRealtimeConnected
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("message waits for backend");
      await flushMicrotasks();
    });

    const pendingMessages = queryClient.getQueryData([
      "pending-outgoing-messages",
      "user-1",
    ]) as Array<{ clientMessageId: string; status: string }> | undefined;

    expect(pendingMessages).toEqual([
      expect.objectContaining({
        clientMessageId: expect.stringMatching(/^client-/),
        status: "FAILED",
      }),
    ]);
  });

  it("marks a timed out send attempt as failed without auto retrying it", async () => {
    vi.useFakeTimers();
    vi.mocked(sendPlainMessage)
      .mockImplementationOnce(() => new Promise(() => undefined));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            isRealtimeConnected
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestStateRef.current?.submitActiveDraft("stuck message");
      await flushMicrotasks();
    });

    const firstClientMessageId = vi.mocked(sendPlainMessage).mock.calls[0]?.[5] as string;
    expect(vi.mocked(sendPlainMessage)).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(90_000);
      await flushMicrotasks(10);
    });

    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([
      expect.objectContaining({
        clientMessageId: firstClientMessageId,
        status: "FAILED",
      }),
    ]);
    expect(vi.mocked(sendPlainMessage)).toHaveBeenCalledTimes(1);
  });

  it("marks recovered sending messages as failed on startup without auto resending them", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData(["pending-outgoing-messages", "user-1"], [
      {
        chatId: "chat-1",
        clientMessageId: "client-recovered",
        content: "recovered message",
        createdAt: "2026-04-18T12:00:01.000Z",
        localOrder: 8,
        recipientCount: 1,
        replyTo: null,
        status: "SENDING",
        updatedAt: "2026-04-18T12:00:00.000Z",
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={() => undefined}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks(10);
    });

    expect(vi.mocked(sendPlainMessage)).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([
      expect.objectContaining({
        clientMessageId: "client-recovered",
        status: "FAILED",
      }),
    ]);
  });

  it("deletes a recovered local pending message without calling the server", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData<PendingOutgoingMessage[]>(["pending-outgoing-messages", "user-1"], [
      {
        chatId: "chat-1",
        clientMessageId: "client-recovered",
        content: "recovered message",
        createdAt: "2026-04-18T12:00:01.000Z",
        localOrder: 8,
        recipientCount: 1,
        replyTo: null,
        status: "SENDING",
        updatedAt: "2026-04-18T12:00:01.000Z",
        attachments: [],
      },
    ]);
    queryClient.setQueryData(["messages", "user-1", "chat-1"], {
      pages: [
        [
          {
            id: "client-recovered",
            chatId: "chat-1",
            serverOrder: null,
            sender: currentUser(),
            content: "recovered message",
            createdAt: "2026-04-18T12:00:01.000Z",
            editedAt: null,
            status: {
              state: "SENDING",
              recipientCount: 1,
              deliveredCount: 0,
              readCount: 0,
            },
            clientMessageId: "client-recovered",
            localOrder: 8,
            replyTo: null,
            reactions: [],
            attachments: [],
          },
        ],
      ],
      pageParams: [undefined],
    });
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks(10);
    });

    await act(async () => {
      latestStateRef.current?.deleteMessageForSelf("chat-1", "client-recovered");
      await flushMicrotasks();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([]);
    expect(queryClient.getQueryData(["messages", "user-1", "chat-1"])).toEqual({
      pages: [[]],
      pageParams: [undefined],
    });
    expect(vi.mocked(sendPlainMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(deletePendingOutgoingMessage)).toHaveBeenCalledWith(
      "session-token",
      "client-recovered"
    );
    confirmSpy.mockRestore();
  });

  it("allows sending a new message after deleting a recovered local pending bubble", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData<PendingOutgoingMessage[]>(["pending-outgoing-messages", "user-1"], [
      {
        chatId: "chat-1",
        clientMessageId: "client-recovered",
        content: "recovered message",
        createdAt: "2026-04-18T12:00:01.000Z",
        localOrder: 8,
        recipientCount: 1,
        replyTo: null,
        status: "SENDING",
        updatedAt: "2026-04-18T12:00:01.000Z",
        attachments: [],
      },
    ]);
    queryClient.setQueryData(["messages", "user-1", "chat-1"], {
      pages: [
        [
          {
            id: "client-recovered",
            chatId: "chat-1",
            serverOrder: null,
            sender: currentUser(),
            content: "recovered message",
            createdAt: "2026-04-18T12:00:01.000Z",
            editedAt: null,
            status: {
              state: "SENDING",
              recipientCount: 1,
              deliveredCount: 0,
              readCount: 0,
            },
            clientMessageId: "client-recovered",
            localOrder: 8,
            replyTo: null,
            reactions: [],
            attachments: [],
          },
        ],
      ],
      pageParams: [undefined],
    });
    vi.mocked(sendPlainMessage).mockResolvedValueOnce(sentMessage("client-new"));
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            queryClient={queryClient}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks(10);
    });

    await act(async () => {
      latestStateRef.current?.deleteMessageForSelf("chat-1", "client-recovered");
      await flushMicrotasks();
    });

    await act(async () => {
      await latestStateRef.current?.submitActiveDraft("fresh message after delete");
      await flushMicrotasks(10);
    });

    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([]);
    expect(vi.mocked(sendPlainMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPlainMessage).mock.calls[0]?.[3]).toBe("fresh message after delete");
    expect(vi.mocked(sendPlainMessage).mock.calls[0]?.[5]).not.toBe("client-recovered");
    confirmSpy.mockRestore();
  });

});
