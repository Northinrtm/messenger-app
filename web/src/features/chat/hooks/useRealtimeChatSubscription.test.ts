import { describe, expect, it } from "vitest";

import {
  getRealtimeUnreadMode,
  shouldGrantRealtimeGroupHistoryAccess,
  shouldRefreshActiveChatOnRealtimeChatUpdate,
  shouldRefreshChatListOnRealtimeConnect,
  shouldRefreshActiveChatOnRealtimeConnect,
} from "./useRealtimeChatSubscription";
import type { ChatMessage, ChatSummary } from "../../../lib/types";

describe("shouldRefreshActiveChatOnRealtimeConnect", () => {
  it("skips the redundant initial active chat refetch on first websocket connect", () => {
    expect(shouldRefreshActiveChatOnRealtimeConnect(false)).toBe(false);
  });

  it("refreshes the active chat after a later reconnect", () => {
    expect(shouldRefreshActiveChatOnRealtimeConnect(true)).toBe(true);
  });

  it("keeps the reconnect refresh when the active chat did not refresh during disconnect", () => {
    expect(
      shouldRefreshActiveChatOnRealtimeConnect(true, {
        activeChatId: "chat-1",
        disconnectedChatSnapshot: {
          chatId: "chat-1",
          dataUpdatedAt: 100,
        },
        currentDataUpdatedAt: 100,
      })
    ).toBe(true);
  });

  it("skips the reconnect refresh when polling already refreshed the active chat", () => {
    expect(
      shouldRefreshActiveChatOnRealtimeConnect(true, {
        activeChatId: "chat-1",
        disconnectedChatSnapshot: {
          chatId: "chat-1",
          dataUpdatedAt: 100,
        },
        currentDataUpdatedAt: 200,
      })
    ).toBe(false);
  });

  it("refreshes when another chat becomes active during the disconnect", () => {
    expect(
      shouldRefreshActiveChatOnRealtimeConnect(true, {
        activeChatId: "chat-2",
        disconnectedChatSnapshot: {
          chatId: "chat-1",
          dataUpdatedAt: 100,
        },
        currentDataUpdatedAt: 200,
      })
    ).toBe(true);
  });
});

describe("shouldRefreshChatListOnRealtimeConnect", () => {
  it("skips the redundant initial chat list refetch on first websocket connect", () => {
    expect(shouldRefreshChatListOnRealtimeConnect(false)).toBe(false);
  });

  it("refreshes the chat list after a later reconnect", () => {
    expect(shouldRefreshChatListOnRealtimeConnect(true)).toBe(true);
  });
});

describe("getRealtimeUnreadMode", () => {
  it("keeps unread counts server-driven for inactive incoming chats", () => {
    expect(
      getRealtimeUnreadMode({
        ownMessage: false,
        isVisibleActiveChat: false,
      })
    ).toBe("keep");
  });

  it("clears unread counts for visible chats and own messages", () => {
    expect(
      getRealtimeUnreadMode({
        ownMessage: false,
        isVisibleActiveChat: true,
      })
    ).toBe("clear");
    expect(
      getRealtimeUnreadMode({
        ownMessage: true,
        isVisibleActiveChat: false,
      })
    ).toBe("clear");
  });
});

describe("shouldGrantRealtimeGroupHistoryAccess", () => {
  const groupChat = {
    id: "chat-1",
    direct: false,
    members: [
      { id: "user-1" },
      { id: "user-2" },
    ],
  } as ChatSummary;

  it("grants for group chat updates where the current user is a member", () => {
    expect(shouldGrantRealtimeGroupHistoryAccess(groupChat, "user-1")).toBe(true);
  });

  it("skips direct chats and unrelated chat updates", () => {
    expect(
      shouldGrantRealtimeGroupHistoryAccess({ ...groupChat, direct: true }, "user-1")
    ).toBe(false);
    expect(shouldGrantRealtimeGroupHistoryAccess(groupChat, "user-3")).toBe(false);
  });
});

describe("shouldRefreshActiveChatOnRealtimeChatUpdate", () => {
  const groupChat = {
    id: "chat-1",
    direct: false,
  } as ChatSummary;

  const cachedMessages = {
    pages: [
      [
        {
          content: "[Encrypted message unavailable]",
        } as ChatMessage,
      ],
    ],
    pageParams: [null],
  };

  it("refreshes the active group chat when cached messages still contain unavailable placeholders", () => {
    expect(
      shouldRefreshActiveChatOnRealtimeChatUpdate(groupChat, {
        activeChatId: "chat-1",
        cachedMessages,
      })
    ).toBe(true);
  });

  it("skips refresh for other chats, direct chats, and fully readable caches", () => {
    expect(
      shouldRefreshActiveChatOnRealtimeChatUpdate(groupChat, {
        activeChatId: "chat-2",
        cachedMessages,
      })
    ).toBe(false);
    expect(
      shouldRefreshActiveChatOnRealtimeChatUpdate(
        { ...groupChat, direct: true },
        {
          activeChatId: "chat-1",
          cachedMessages,
        }
      )
    ).toBe(false);
    expect(
      shouldRefreshActiveChatOnRealtimeChatUpdate(groupChat, {
        activeChatId: "chat-1",
        cachedMessages: {
          pages: [[{ content: "hello" } as ChatMessage]],
          pageParams: [null],
        },
      })
    ).toBe(false);
  });
});
