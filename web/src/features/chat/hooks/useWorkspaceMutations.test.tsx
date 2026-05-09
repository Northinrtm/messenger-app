import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type Dispatch, type SetStateAction } from "react";

import { createGroupChat } from "../../../lib/api";
import type { AuthResponse, ChatSummary, Participant, UserProfile } from "../../../lib/types";
import type { SidebarSheet } from "../chatUi";
import { useWorkspaceMutations } from "./useWorkspaceMutations";

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api");
  return {
    ...actual,
    createGroupChat: vi.fn(
      async (
        _token: string,
        input: { title: string; participantUsernames: string[] }
      ): Promise<ChatSummary> => ({
        id: "group-1",
        direct: false,
        title: input.title,
        avatarUrl: null,
        chatVersion: "chat-version-1",
        capabilities: {
          canEditGroup: true,
          canDeleteGroup: true,
          canManageInviteLink: true,
          canAddMembers: true,
          canManageRoles: true,
          canModerateMembers: true,
          canTogglePrejoinHistory: true,
          canLeaveGroup: false,
        },
        ownerUserId: "user-1",
        moderatorUserIds: [],
        members: [currentParticipant()],
        lastMessage: null,
        lastMessageAt: null,
        updatedAt: "2026-05-09T10:00:00.000Z",
        unreadCount: 0,
        pinnedMessage: null,
        prejoinHistoryPolicy: "FULL_HISTORY",
      })
    ),
  };
});

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type HarnessState = {
  submitCreateGroup: () => void;
};

type HarnessProps = {
  onGroupCreated: (chat: ChatSummary) => void;
  onReady: (value: HarnessState) => void;
  openChat: (chatId: string, preferredTab?: "chats" | "mail" | "conferences") => void;
  queryClient: QueryClient;
  setSidebarSheet: Dispatch<SetStateAction<SidebarSheet>>;
};

function currentParticipant(): Participant {
  return {
    id: "user-1",
    username: "north",
    displayName: "North",
    profession: null,
    avatarUrl: null,
    online: true,
  };
}

function currentUser(): UserProfile {
  return {
    ...currentParticipant(),
    createdAt: "2026-05-09T09:00:00.000Z",
    email: "north@example.com",
    emailVerified: true,
    emailVerificationEnabled: true,
    mailEnabled: true,
  };
}

function currentSession(): AuthResponse {
  return {
    token: "session-token",
    tokenExpiresAt: "2026-05-09T12:00:00.000Z",
    sessionId: "session-1",
    user: currentUser(),
  };
}

function Harness({
  onGroupCreated,
  onReady,
  openChat,
  queryClient,
  setSidebarSheet,
}: HarnessProps) {
  const mutations = useWorkspaceMutations({
    activeChat: null,
    activeChatId: null,
    activeConference: null,
    activeConferenceId: null,
    activeConferenceIsArchived: false,
    conferenceChatId: null,
    conferenceEditingId: null,
    conferenceInviteUsernames: [],
    conferenceParticipantUsernames: [],
    conferenceScheduledAt: "2026-05-09T10:00:00.000Z",
    conferenceTitle: "",
    currentSession: currentSession(),
    passwordChangeConfirm: "",
    passwordChangeCurrent: "",
    passwordChangeNext: "",
    groupInviteUsernames: [],
    groupDetailsAvatarUrl: null,
    groupDetailsPrejoinHistoryPolicy: "FULL_HISTORY",
    groupDetailsTitle: "",
    groupParticipantUsernames: [],
    groupTitle: "New Group",
    removeChatLocally: () => undefined,
    onGroupCreated,
    onSessionChange: () => undefined,
    openChat,
    openConference: () => undefined,
    profile: currentUser(),
    profileDisplayName: "North",
    profileProfession: "",
    resetConferenceComposer: () => undefined,
    setActiveListTab: () => undefined,
    setConferenceInviteUsernames: () => undefined,
    setGroupDetailsAvatarUrl: () => undefined,
    setGroupDetailsPrejoinHistoryPolicy: () => undefined,
    setGroupDetailsTitle: () => undefined,
    setGroupInviteUsernames: () => undefined,
    setGroupParticipantUsernames: () => undefined,
    setGroupTitle: () => undefined,
    setIsGroupCreatePickerOpen: () => undefined,
    setIsGroupInvitePickerOpen: () => undefined,
    setMobilePane: () => undefined,
    setProfileProfession: () => undefined,
    setSidebarSheet,
  });

  useEffect(() => {
    onReady({
      submitCreateGroup: mutations.submitCreateGroup,
    });
  }, [mutations, onReady]);

  return null;
}

async function flushMicrotasks(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("useWorkspaceMutations create group flow", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.clearAllMocks();
  });

  it("opens the new group chat without passing menu-open follow-up state", async () => {
    const latestStateRef: { current: HarnessState | null } = { current: null };
    const onGroupCreated = vi.fn();
    const openChat = vi.fn();
    const setSidebarSheet = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false,
        },
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
            onGroupCreated={onGroupCreated}
            onReady={(value) => {
              latestStateRef.current = value;
            }}
            openChat={openChat}
            queryClient={queryClient}
            setSidebarSheet={setSidebarSheet}
          />
        </QueryClientProvider>
      );
      await flushMicrotasks();
    });

    if (!latestStateRef.current) {
      throw new Error("Mutation harness was not initialized");
    }

    await act(async () => {
      latestStateRef.current?.submitCreateGroup();
      await flushMicrotasks();
    });

    expect(createGroupChat).toHaveBeenCalledWith("session-token", {
      title: "New Group",
      participantUsernames: [],
    });
    expect(openChat).toHaveBeenCalledWith("group-1", "chats");
    expect(onGroupCreated).toHaveBeenCalledTimes(1);
    expect(onGroupCreated.mock.calls[0]).toHaveLength(1);
    expect(onGroupCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "group-1",
        title: "New Group",
      })
    );
    expect(setSidebarSheet).toHaveBeenCalledWith(null);
  });
});
