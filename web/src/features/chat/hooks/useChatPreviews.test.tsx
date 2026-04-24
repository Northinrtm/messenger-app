import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSummary, UserProfile } from "../../../lib/types";
import { useChatPreviews } from "./useChatPreviews";

vi.mock("../../../lib/e2ee", () => ({
  readLatestArchivedDecryptedChatMessage: vi.fn(),
}));

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
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

function emptyGroupChat(): ChatSummary {
  return {
    id: "chat-1",
    direct: false,
    title: "Group",
    avatarUrl: null,
    ownerUserId: "user-1",
    moderatorUserIds: [],
    members: [
      currentUser(),
      {
        id: "user-2",
        username: "remote",
        displayName: "Remote",
        profession: null,
        avatarUrl: null,
        online: false,
      },
    ],
    lastMessage: null,
    lastMessageAt: null,
    lastMessageServerOrder: null,
    updatedAt: "2026-04-18T12:00:00.000Z",
    unreadCount: 0,
    pinnedMessage: null,
  };
}

function Harness({ queryClient }: { queryClient: QueryClient }) {
  useChatPreviews({
    archivedChatIds: [],
    formatPreviewText: (message) => message.content,
    previewHydrationChats: [emptyGroupChat()],
    queryClient,
    token: "session-token",
    userId: "user-1",
  });

  return null;
}

async function flushMicrotasks(iterations = 8) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("useChatPreviews stale preview cleanup", () => {
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
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("removes a persisted local preview when the server reports no last message for the chat", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData(["chats", "session-token"], [emptyGroupChat()]);
    window.localStorage.setItem(
      "north-messenger-chat-previews:user-1",
      JSON.stringify({
        "chat-1": {
          lastMessage: "qwe",
          lastMessageAt: "2026-04-24T16:42:28.848563Z",
        },
      })
    );

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness queryClient={queryClient} />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      await flushMicrotasks(12);
    });

    expect(
      JSON.parse(window.localStorage.getItem("north-messenger-chat-previews:user-1") ?? "{}")
    ).toEqual({});
    expect(queryClient.getQueryData(["chats", "session-token"])).toEqual([emptyGroupChat()]);
  });
});
