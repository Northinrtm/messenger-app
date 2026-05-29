import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatSummary, Participant, UserProfile } from "../../../lib/types";
import { ChatListPanel } from "./ChatListPanel";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const sessionUser: UserProfile = {
  id: "user-1",
  username: "north",
  displayName: "North",
  profession: null,
  createdAt: "2026-05-09T08:00:00Z",
  avatarUrl: null,
  online: true,
};

const peerParticipant: Participant = {
  id: "user-2",
  username: "peer",
  displayName: "Peer",
  profession: null,
  avatarUrl: null,
  online: false,
};

function directChat(): ChatSummary {
  return {
    id: "chat-1",
    direct: true,
    title: "Peer",
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
    members: [sessionUser, peerParticipant],
    lastMessage: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e",
    lastMessageAt: "2026-05-09T08:10:00Z",
    lastMessageServerOrder: 11,
    updatedAt: "2026-05-09T08:10:00Z",
    unreadCount: 0,
    membershipVersion: 1,
    pinnedMessage: null,
    prejoinHistoryPolicy: null,
  };
}

function renderPanel(root: Root, chat: ChatSummary, failedChatIds: ReadonlySet<string>) {
  return act(async () => {
    root.render(
      <ChatListPanel
        activeListTab="chats"
        conferenceViewMode="list"
        onToggleConferenceViewMode={() => {}}
        onOpenScheduleConference={() => {}}
        onOpenStartConferenceNow={() => {}}
        normalizedSearch=""
        conferencesLoading={false}
        visibleConferences={[]}
        activeConferenceId={null}
        conferenceListScrollRef={{ current: null }}
        sessionUser={sessionUser}
        chatsLoading={false}
        mailInbox={[]}
        mailSent={[]}
        mailLoading={false}
        mailFolder="inbox"
        activeMailMessageId={null}
        mailComposing={false}
        userMailAddress="north@ktsf.ru"
        tabChats={[chat]}
        tabChatsEmptyText="Empty"
        activeChatId={null}
        liveGroupConferencesByChatId={new Map()}
        typingByChatId={{}}
        draftsByChatId={{}}
        failedChatIds={failedChatIds}
        openConference={() => {}}
        openChat={() => {}}
        openChatAtMessage={() => {}}
        openChatAtFailedMessage={() => {}}
        openChatContextMenu={() => {}}
        onMailSwitchFolder={() => {}}
        onMailOpenMessage={() => {}}
        onMailCompose={() => {}}
        formatConferenceListPreview={() => ""}
        formatConferenceTileTime={() => ""}
        formatConferenceSchedule={() => ""}
        formatMailTimestamp={() => "08:10"}
        trimPreview={(content) => content}
        getDirectParticipant={() => peerParticipant}
        formatTypingParticipants={() => ""}
        formatChatTimestamp={() => "08:10"}
        describeChat={() => "Direct chat"}
        formatMemberCount={(count) => `${count}`}
      />
    );
  });
}

describe("ChatListPanel", () => {
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

  it("shows a failed-send indicator for chats with failed outgoing messages", async () => {
    await renderPanel(root!, directChat(), new Set(["chat-1"]));

    const errorIndicator = container.querySelector(".chat-preview-error");
    expect(errorIndicator?.textContent).toBe("!");
    expect(errorIndicator?.getAttribute("aria-label")).toBe(
      "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043d\u0435\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u043e\u043c\u0443 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044e"
    );
  });

  it("shows a reaction indicator when the last message has reactions", async () => {
    await renderPanel(
      root!,
      {
        ...directChat(),
        lastMessageHasReactions: true,
      },
      new Set()
    );

    const reactionIndicator = container.querySelector(".chat-preview-reaction");
    expect(reactionIndicator?.textContent).toBe("\u263A");
    expect(reactionIndicator?.getAttribute("aria-label")).toBe(
      "\u041d\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0435\u0441\u0442\u044c \u0440\u0435\u0430\u043a\u0446\u0438\u0438"
    );
  });

  it("shows a stronger reaction indicator when reaction attention is pending on an older message", async () => {
    await renderPanel(
      root!,
      {
        ...directChat(),
        reactionAttention: true,
        lastMessageHasReactions: false,
      },
      new Set()
    );

    const reactionIndicator = container.querySelector(".chat-preview-reaction");
    expect(reactionIndicator?.textContent).toBe("\u263A");
    expect(reactionIndicator?.getAttribute("aria-label")).toBe(
      "\u0415\u0441\u0442\u044c \u043d\u043e\u0432\u0430\u044f \u0440\u0435\u0430\u043a\u0446\u0438\u044f \u043d\u0430 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"
    );
  });
});
