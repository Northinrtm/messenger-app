import { describe, expect, it } from "vitest";

import type { ChatSummary } from "../../../lib/types";
import {
  resolveTabChats,
  resolveTabChatsEmptyText,
  shouldListChat,
  sortChatsByDraftActivity,
} from "./useWorkspaceStatus";

function chat(overrides: Partial<ChatSummary>): ChatSummary {
  return {
    id: overrides.id ?? "chat-1",
    direct: overrides.direct ?? true,
    title: overrides.title ?? "Chat",
    avatarUrl: null,
    chatVersion: overrides.chatVersion ?? "chat-version-1",
    capabilities:
      overrides.capabilities ?? {
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
    members: overrides.members ?? [],
    lastMessage: overrides.lastMessage ?? "Latest",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-18T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-18T10:00:00.000Z",
    unreadCount: overrides.unreadCount ?? 0,
    pinnedMessage: null,
  };
}

describe("useWorkspaceStatus helpers", () => {
  it("keeps direct and group chats in one merged list without changing their order", () => {
    const visibleChats = [
      chat({ id: "group-1", direct: false, updatedAt: "2026-04-18T10:05:00.000Z" }),
      chat({ id: "direct-1", direct: true, updatedAt: "2026-04-18T10:04:00.000Z" }),
    ];

    expect(resolveTabChats("chats", visibleChats).map((item) => item.id)).toEqual([
      "group-1",
      "direct-1",
    ]);
  });

  it("returns an empty chat list for the conferences section", () => {
    expect(resolveTabChats("conferences", [chat({ id: "chat-1" })])).toEqual([]);
  });

  it("returns an empty chat list for the mail section", () => {
    expect(resolveTabChats("mail", [chat({ id: "chat-1" })])).toEqual([]);
  });

  it("keeps direct chats with drafts visible even before the first sent message", () => {
    expect(
      shouldListChat(
        chat({
          id: "direct-draft",
          direct: true,
          lastMessage: null,
          lastMessageAt: null,
        }),
        { "direct-draft": "2026-04-18T10:06:00.000Z" }
      )
    ).toBe(true);
  });

  it("raises chats with newer drafts above older chat activity", () => {
    const chats = [
      chat({ id: "group-1", direct: false, updatedAt: "2026-04-18T10:05:00.000Z" }),
      chat({
        id: "direct-draft",
        direct: true,
        lastMessage: null,
        lastMessageAt: null,
        updatedAt: "2026-04-18T10:00:00.000Z",
      }),
    ];

    expect(
      sortChatsByDraftActivity(chats, {
        "direct-draft": "2026-04-18T10:07:00.000Z",
      }).map((item) => item.id)
    ).toEqual(["direct-draft", "group-1"]);
  });

  it("uses merged chat empty text for the chats section", () => {
    expect(resolveTabChatsEmptyText("chats", "")).toBe("list.emptyChats");
    expect(resolveTabChatsEmptyText("chats", "north")).toBe("list.notFound");
  });

  it("uses mailbox empty text for the mail section", () => {
    expect(resolveTabChatsEmptyText("mail", "")).toBe("list.emptyMail");
    expect(resolveTabChatsEmptyText("mail", "north")).toBe("list.notFound");
  });
});
