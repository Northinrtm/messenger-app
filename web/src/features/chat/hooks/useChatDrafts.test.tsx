import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";

import { readLocalDrafts } from "../../../lib/localDrafts";
import { useChatDrafts } from "./useChatDrafts";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type DraftHarnessState = {
  activeDraft: string;
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
    queryClient,
    token: "session-token",
    userId: "user-1",
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
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
    vi.clearAllTimers();
    vi.useRealTimers();
    window.localStorage.clear();
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

    const latestDraftState = latestDraftStateRef.current;
    if (!latestDraftState) {
      throw new Error("Draft state was not initialized");
    }
    expect(latestDraftState.activeDraft).toBe("reload-safe draft");

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
      root?.unmount();
    });
    root = null;
    expect(window.localStorage.getItem("north-messenger-local-drafts:user-1")).toContain(
      "reload-safe draft"
    );
    expect(window.localStorage.getItem("north-messenger-local-drafts:user-1")).toContain(
      "other chat draft"
    );
    const persistedDrafts = Object.fromEntries(
      readLocalDrafts("user-1").map((draft) => [draft.chatId, draft.content])
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

    expect(latestDraftStateRef.current?.activeDraft).toBe("stale draft");

    await act(async () => {
      latestDraftStateRef.current?.handleComposerChange("chat-1", "");
      await flushMicrotasks();
    });

    expect(latestDraftStateRef.current?.activeDraft).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    });

    expect(latestDraftStateRef.current?.activeDraft).toBe("");
    expect(readLocalDrafts("user-1")).toEqual([]);
  });
});
