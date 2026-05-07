import { describe, expect, it } from "vitest";

import {
  getChatsQueryRefreshStrategy,
  getMessagesQueryRefetchInterval,
  getTypingQueryRefetchInterval,
} from "./useWorkspaceQueries";

describe("useWorkspaceQueries polling helpers", () => {
  it("keeps chat list polling slow and only while the tab is visible", () => {
    expect(
      getChatsQueryRefreshStrategy({
        isRealtimeConnected: true,
        isDocumentVisible: true,
      })
    ).toMatchObject({
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    });

    expect(
      getChatsQueryRefreshStrategy({
        isRealtimeConnected: false,
        isDocumentVisible: true,
      })
    ).toMatchObject({
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    });

    expect(
      getChatsQueryRefreshStrategy({
        isRealtimeConnected: false,
        isDocumentVisible: false,
      }).refetchInterval
    ).toBe(false);
  });

  it("polls typing and messages only for a visible open chat in fallback mode", () => {
    expect(
      getTypingQueryRefetchInterval({
        activeChatId: "chat-1",
        isActiveChatOpen: true,
        isDocumentVisible: true,
        isRealtimeConnected: false,
      })
    ).toBe(5_000);
    expect(
      getTypingQueryRefetchInterval({
        activeChatId: "chat-1",
        isActiveChatOpen: false,
        isDocumentVisible: true,
        isRealtimeConnected: false,
      })
    ).toBe(false);
    expect(
      getMessagesQueryRefetchInterval({
        activeChatId: "chat-1",
        activePendingOutgoingCount: 0,
        isActiveChatOpen: true,
        isDocumentVisible: true,
        isRealtimeConnected: false,
      })
    ).toBe(10_000);
    expect(
      getMessagesQueryRefetchInterval({
        activeChatId: "chat-1",
        activePendingOutgoingCount: 1,
        isActiveChatOpen: true,
        isDocumentVisible: true,
        isRealtimeConnected: false,
      })
    ).toBe(false);
  });
});
