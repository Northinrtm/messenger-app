import { describe, expect, it } from "vitest";

import type { ChatSummary, Participant, VideoConference } from "../../lib/types";
import {
  buildConferenceActivitySnapshot,
  getLatestUnreadChatActivityAt,
  hasConferenceActivitySinceSeen,
  hasUnreadChatActivitySince,
  shouldPrimeEncryptionRecipientsOnChatOpen,
} from "./chatWorkspaceUtils";

function participant(id: string): Participant {
  return {
    id,
    username: id,
    displayName: id,
    profession: null,
    avatarUrl: null,
    online: false,
  };
}

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
    members: overrides.members ?? [participant("user-1"), participant("user-2")],
    lastMessage: overrides.lastMessage ?? "Latest",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-18T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? overrides.lastMessageAt ?? "2026-04-18T10:00:00.000Z",
    unreadCount: overrides.unreadCount ?? 0,
    pinnedMessage: null,
  };
}

function conference(overrides: Partial<VideoConference>): VideoConference {
  return {
    id: overrides.id ?? "conference-1",
    title: overrides.title ?? "Weekly Sync",
    roomName: overrides.roomName ?? null,
    roomAccessCode: overrides.roomAccessCode ?? null,
    scheduledAt: overrides.scheduledAt ?? "2026-04-18T12:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-04-18T09:00:00.000Z",
    activatedAt: overrides.activatedAt ?? null,
    startedAt: overrides.startedAt ?? null,
    endedAt: overrides.endedAt ?? null,
    recordingCreatedAt: overrides.recordingCreatedAt ?? null,
    recordingSizeBytes: overrides.recordingSizeBytes ?? null,
    recordingMimeType: overrides.recordingMimeType ?? null,
    createdBy: overrides.createdBy ?? participant("organizer"),
    participants: overrides.participants ?? [participant("organizer"), participant("guest")],
  };
}

describe("shouldPrimeEncryptionRecipientsOnChatOpen", () => {
  it("starts recipient priming immediately when the chat opens", () => {
    expect(shouldPrimeEncryptionRecipientsOnChatOpen(true)).toBe(true);
  });

  it("keeps recipient priming enabled after the first visible message page is ready", () => {
    expect(shouldPrimeEncryptionRecipientsOnChatOpen(false)).toBe(true);
  });
});

describe("chat tab indicators", () => {
  it("tracks the latest unread activity across direct and group chats", () => {
    const chats = [
      chat({
        id: "direct-1",
        direct: true,
        unreadCount: 2,
        lastMessageAt: "2026-04-18T10:00:00.000Z",
      }),
      chat({
        id: "group-1",
        direct: false,
        unreadCount: 1,
        lastMessageAt: "2026-04-18T10:05:00.000Z",
      }),
    ];

    expect(getLatestUnreadChatActivityAt(chats)).toBe("2026-04-18T10:05:00.000Z");
    expect(hasUnreadChatActivitySince(chats, "2026-04-18T10:02:00.000Z")).toBe(true);
    expect(hasUnreadChatActivitySince(chats, "2026-04-18T10:05:00.000Z")).toBe(false);
  });

  it("does not raise a chat indicator when all chats are already read", () => {
    expect(
      hasUnreadChatActivitySince(
        [
          chat({
            id: "direct-1",
            direct: true,
            unreadCount: 0,
            lastMessageAt: "2026-04-18T10:00:00.000Z",
          }),
        ],
        null
      )
    ).toBe(false);
  });
});

describe("conference tab indicators", () => {
  it("raises the indicator when a new relevant conference appears", () => {
    const seen = buildConferenceActivitySnapshot([conference({ id: "conference-1" })]);
    const current = buildConferenceActivitySnapshot([
      conference({ id: "conference-1" }),
      conference({ id: "conference-2", title: "Design Review" }),
    ]);

    expect(hasConferenceActivitySinceSeen(current, seen)).toBe(true);
  });

  it("raises the indicator when a relevant conference event updates the snapshot", () => {
    const seen = buildConferenceActivitySnapshot([
      conference({ id: "conference-1", startedAt: null }),
    ]);
    const current = buildConferenceActivitySnapshot([
      conference({ id: "conference-1", startedAt: "2026-04-18T12:01:00.000Z" }),
    ]);

    expect(hasConferenceActivitySinceSeen(current, seen)).toBe(true);
  });

  it("clears the indicator when the conference snapshot is unchanged", () => {
    const seen = buildConferenceActivitySnapshot([conference({ id: "conference-1" })]);

    expect(hasConferenceActivitySinceSeen(seen, seen)).toBe(false);
  });
});
