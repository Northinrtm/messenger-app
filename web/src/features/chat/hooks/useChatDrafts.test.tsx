import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

import type { ChatDraft } from "../../../lib/types";
import { useChatDrafts } from "./useChatDrafts";

const draftsStore = new Map<string, ChatDraft>();

vi.mock("../../../lib/api", () => ({
  getChatDrafts: vi.fn(async () =>
    [...draftsStore.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  ),
  upsertChatDraft: vi.fn(async (_token: string, chatId: string, content: string) => {
    const nextDraft = {
      chatId,
      content,
      updatedAt: new Date().toISOString(),
    } satisfies ChatDraft;
    draftsStore.set(chatId, nextDraft);
    return nextDraft;
  }),
  deleteChatDraft: vi.fn(async (_token: string, chatId: string) => {
    draftsStore.delete(chatId);
  }),
}));

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type DraftHarnessState = {
  activeDraft: string;
  clearDraftForChat: (chatId: string) => void;
  handleComposerChange: (chatId: string | null, nextValue: string) => void;
};

type HarnessProps = {
  activeChatId: string | null;
  onReady: (value: DraftHarnessState) => void;
  queryClient: QueryClient;
};

function Harness({ activeChatId, onReady, queryClient }: HarnessProps) {
  const draftState = useChatDrafts({
    activeChatId,
    bootstrapReady: true,
    queryClient,
    token: "session-token",
  });

  useEffect(() => {
    onReady(draftState);
  }, [draftState, onReady]);

  return null;
}

async function flushMicrotasks(iterations = 3) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("useChatDrafts reload recovery", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    draftsStore.clear();
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
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
    vi.clearAllTimers();
    vi.useRealTimers();
    draftsStore.clear();
  });

  it("persists the exact per-chat draft on pagehide before the debounce fires", async () => {
    const latestDraftStateRef: { current: DraftHarnessState | null } = { current: null };
    const firstClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={firstClient}>
          <Harness
            activeChatId="chat-1"
            queryClient={firstClient}
            onReady={(value) => {
              latestDraftStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestDraftStateRef.current?.handleComposerChange("chat-1", "reload-safe draft");
      latestDraftStateRef.current?.handleComposerChange("chat-2", "other chat draft");
      await flushMicrotasks();
    });

    if (!latestDraftStateRef.current) {
      throw new Error("Draft state was not initialized");
    }

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await flushMicrotasks();
      root?.unmount();
      await flushMicrotasks();
    });
    root = null;
    const persistedDrafts = Object.fromEntries(
      [...draftsStore.values()].map((draft) => [draft.chatId, draft.content])
    );
    expect(persistedDrafts).toEqual({
      "chat-1": "reload-safe draft",
      "chat-2": "other chat draft",
    });
  });

  it("lets the composer stay empty after a draft is fully cleared", async () => {
    const latestDraftStateRef: { current: DraftHarnessState | null } = { current: null };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            activeChatId="chat-1"
            queryClient={queryClient}
            onReady={(value) => {
              latestDraftStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestDraftStateRef.current?.handleComposerChange("chat-1", "stale draft");
      await flushMicrotasks();
    });

    await act(async () => {
      latestDraftStateRef.current?.handleComposerChange("chat-1", "");
      await flushMicrotasks();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    });

    expect([...draftsStore.values()]).toEqual([]);
  });

  it("does not restore a cleared draft on pagehide while an older debounce was still pending", async () => {
    const latestDraftStateRef: { current: DraftHarnessState | null } = { current: null };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness
            activeChatId="chat-1"
            queryClient={queryClient}
            onReady={(value) => {
              latestDraftStateRef.current = value;
            }}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    await act(async () => {
      latestDraftStateRef.current?.handleComposerChange("chat-1", "stale draft");
      await flushMicrotasks();
    });

    act(() => {
      latestDraftStateRef.current?.clearDraftForChat("chat-1");
      window.dispatchEvent(new Event("pagehide"));
      root?.unmount();
    });
    root = null;

    expect([...draftsStore.values()]).toEqual([]);
  });
});
