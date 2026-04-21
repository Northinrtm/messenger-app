import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

import { ApiError } from "../../../lib/api";
import { upsertLocalPendingMessage } from "../../../lib/localPendingMessages";
vi.mock("../../../lib/e2ee", () => ({
  sendEncryptedMessage: vi.fn(),
  updateEncryptedMessage: vi.fn(),
}));

import { sendEncryptedMessage } from "../../../lib/e2ee";
import type { AuthResponse, ChatSummary, UserProfile } from "../../../lib/types";
import { useMessageActions } from "./useMessageActions";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type HarnessState = {
  draftsByChatId: Record<string, string>;
  submitActiveDraft: (draft: string) => boolean | Promise<boolean>;
  queryClient: QueryClient;
};

type HarnessProps = {
  isRealtimeConnected?: boolean;
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

function Harness({ isRealtimeConnected = false, onReady, queryClient }: HarnessProps) {
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
    activePinnedMessageId: null,
    chats: [activeChat()],
    currentUser: currentUser(),
    session: session(),
    editingMessage: null,
    forwardingMessage: null,
    replyingToMessage: null,
    sessionToken: "session-token",
    applyChatPreviewMessage: () => undefined,
    applyServerChatPreviewMessage: () => undefined,
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
    setForwardingMessageId: () => undefined,
    setReplyingToMessageId: () => undefined,
    stopTyping: () => undefined,
    syncChatPinnedSummary: () => undefined,
    syncChatPreviewFromCache: () => undefined,
  });

  useEffect(() => {
    onReady({
      draftsByChatId,
      submitActiveDraft: actions.submitActiveDraft,
      queryClient,
    });
  }, [actions.submitActiveDraft, draftsByChatId, onReady, queryClient]);

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
    vi.clearAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("keeps the composer empty and relies on the failed pending bubble after send rejection", async () => {
    vi.mocked(sendEncryptedMessage).mockRejectedValueOnce(new Error("send failed"));
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

  it("keeps transient realtime send failures in sending state so reconnect can resume them invisibly", async () => {
    vi.mocked(sendEncryptedMessage).mockRejectedValueOnce(
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
        status: "SENDING",
      }),
    ]);
  });

  it("automatically resumes recovered sending messages after realtime reconnect", async () => {
    upsertLocalPendingMessage("user-1", {
      chatId: "chat-1",
      clientMessageId: "client-queued",
      content: "message after reload",
      createdAt: "2026-04-18T12:00:01.000Z",
      localOrder: 7,
      recipientCount: 1,
      replyTo: null,
      status: "SENDING",
    });

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
        clientMessageId: "client-queued",
        content: "message after reload",
        createdAt: "2026-04-18T12:00:01.000Z",
        localOrder: 7,
        recipientCount: 1,
        replyTo: null,
        status: "SENDING",
        updatedAt: "2026-04-18T12:00:00.000Z",
      },
    ]);
    vi.mocked(sendEncryptedMessage).mockResolvedValueOnce({
      id: "server-queued",
      chatId: "chat-1",
      serverOrder: 42,
      sender: currentUser(),
      content: "message after reload",
      createdAt: "2026-04-18T12:00:02.000Z",
      editedAt: null,
      status: {
        state: "SENT",
        recipientCount: 1,
        deliveredCount: 0,
        readCount: 0,
      },
      clientMessageId: "client-queued",
      replyTo: null,
      reactions: [],
      attachments: [],
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            isRealtimeConnected
            queryClient={queryClient}
            onReady={() => undefined}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    expect(vi.mocked(sendEncryptedMessage)).toHaveBeenCalledWith(
      "session-token",
      "chat-1",
      "message after reload",
      activeChat().members,
      "client-queued",
      null,
      expect.objectContaining({
        currentUserId: "user-1",
      })
    );
    expect(queryClient.getQueryData(["pending-outgoing-messages", "user-1"])).toEqual([]);
  });
});
