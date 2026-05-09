import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatMessage, ChatSummary, Participant, UserProfile } from "../../../lib/types";
import { SidebarUtilitySheets } from "./SidebarUtilitySheets";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const noop = () => {};

const sessionUser: UserProfile = {
  id: "user-1",
  username: "north",
  displayName: "North",
  profession: null,
  createdAt: "2026-05-09T08:00:00Z",
  avatarUrl: null,
  online: true,
  email: "north@example.com",
  emailVerified: true,
  emailVerificationEnabled: true,
  mailEnabled: true,
};

const sender: Participant = {
  id: "user-2",
  username: "alice",
  displayName: "Alice",
  profession: null,
  avatarUrl: null,
  online: true,
};

function forwardingMessage(): ChatMessage {
  return {
    id: "message-1",
    chatId: "chat-active",
    sender,
    content: "Forward me",
    createdAt: "2026-05-09T08:10:00Z",
    editedAt: null,
    status: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    serverOrder: 1,
    clientMessageId: null,
  };
}

function targetChat(): ChatSummary {
  return {
    id: "chat-target",
    direct: false,
    title: "Target group",
    avatarUrl: null,
    chatVersion: "1",
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
    members: [sessionUser],
    lastMessage: null,
    lastMessageAt: null,
    lastMessageHasReactions: false,
    lastMessageServerOrder: null,
    updatedAt: "2026-05-09T08:10:00Z",
    unreadCount: 0,
    membershipVersion: 0,
    pinnedMessage: null,
    prejoinHistoryPolicy: "JOIN_ONLY",
  };
}

function buildProps(
  overrides: Partial<Parameters<typeof SidebarUtilitySheets>[0]> = {}
): Parameters<typeof SidebarUtilitySheets>[0] {
  return {
    sheet: "forward",
    activeChat: targetChat(),
    sessionUser,
    sessionToken: "token",
    conferenceComposerMode: null,
    conferenceChatId: null,
    conferenceEditingId: null,
    conferenceTitle: "",
    conferenceScheduledAt: "",
    conferenceCandidates: [],
    conferenceParticipantUsernames: [],
    contactsLoading: false,
    createConferencePending: false,
    updateConferencePending: false,
    archivedChatsLoading: false,
    archivedChats: [],
    forwardingMessages: [forwardingMessage()],
    forwardableChats: [targetChat()],
    forwardContactOptions: [],
    forwardPending: false,
    forwardErrorText: null,
    onClose: noop,
    onCloseConferenceComposer: noop,
    onOpenConferenceComposer: noop,
    onConferenceTitleChange: noop,
    onConferenceScheduledAtChange: noop,
    onToggleConferenceParticipant: noop,
    onSubmitCreateConferenceNow: noop,
    onSubmitCreateConference: noop,
    onSubmitUpdateConference: noop,
    onOpenChatContextMenu: noop,
    onOpenChat: noop,
    onToggleArchiveChat: noop,
    onCloseForward: noop,
    onJumpToReplyTarget: noop,
    onForwardToChat: noop,
    onForwardToContact: noop,
    onDownloadAttachment: noop,
    onLoadAttachmentPreview: async () => new Blob(),
    onJumpToAttachmentSourceMessage: noop,
    createMinimumConferenceDateTime: () => "2026-05-09T10:00",
    buildMessagePreview: (content) => content,
    describeChat: (chat) => chat.title,
    formatMemberCount: (count) => `${count} members`,
    getDirectParticipant: () => null,
    ...overrides,
  };
}

describe("SidebarUtilitySheets forward sheet", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("shows a pending status and disables targets while forwarding", async () => {
    await act(async () => {
      root!.render(
        <SidebarUtilitySheets
          {...buildProps({
            forwardPending: true,
          })}
        />
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Пересылаем сообщения..."
    );
    const targetButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Target group")
    );
    expect(targetButton).toBeTruthy();
    expect(targetButton?.hasAttribute("disabled")).toBe(true);
  });

  it("shows an inline error for forwarding failures", async () => {
    await act(async () => {
      root!.render(
        <SidebarUtilitySheets
          {...buildProps({
            forwardErrorText: "Не удалось переслать сообщение.",
          })}
        />
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Не удалось переслать сообщение."
    );
  });
});
