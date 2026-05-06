import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarManagementSheets } from "./SidebarManagementSheets";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const noop = () => {};

function buildProps(
  overrides: Partial<Parameters<typeof SidebarManagementSheets>[0]> = {}
): Parameters<typeof SidebarManagementSheets>[0] {
  return {
    sheet: "sessions",
    profile: {
      id: "user-1",
      username: "north",
      displayName: "North",
      profession: null,
      createdAt: "2026-04-18T08:00:00Z",
      avatarUrl: null,
      online: true,
      email: "north@example.com",
      emailVerified: true,
      emailVerificationEnabled: true,
    },
    sessionUser: {
      id: "user-1",
      username: "north",
      displayName: "North",
      profession: null,
      createdAt: "2026-04-18T08:00:00Z",
      avatarUrl: null,
      online: true,
      email: "north@example.com",
      emailVerified: true,
      emailVerificationEnabled: true,
    },
    profileDisplayName: "North",
    profileProfession: "",
    passwordChangeCurrent: "",
    passwordChangeNext: "",
    passwordChangeConfirm: "",
    deleteAccountConfirmation: "",
    deleteAccountRequiresMatch: false,
    groupTitle: "",
    groupDetailsTitle: "",
    groupDetailsAvatarUrl: null,
    groupDetailsPrejoinHistoryPolicy: "JOIN_ONLY",
    contactSearch: "",
    showContactSearchResults: false,
    contactSearchResults: [],
    contacts: [],
    contactsLoading: false,
    sessions: [
      {
        id: "session-1",
        createdAt: "2026-04-28T12:00:00Z",
        lastUsedAt: "2026-04-28T13:03:00Z",
        expiresAt: "2026-05-28T13:03:00Z",
        deviceName: "Chrome on Windows",
      },
    ],
    sessionsLoading: false,
    currentSessionId: "session-1",
    activeChat: null,
    activeConference: null,
    groupInviteLinkUrl: null,
    groupContacts: [],
    selectedGroupContacts: [],
    isGroupCreatePickerOpen: false,
    groupParticipantUsernames: [],
    availableGroupInviteContacts: [],
    selectedGroupInviteContacts: [],
    isGroupInvitePickerOpen: false,
    groupInviteUsernames: [],
    availableConferenceInviteContacts: [],
    conferenceInviteUsernames: [],
    createGroupPending: false,
    groupInviteLinkPending: false,
    addGroupParticipantsPending: false,
    addConferenceParticipantsPending: false,
    updateGroupPending: false,
    createChatPending: false,
    updateProfilePending: false,
    changePasswordPending: false,
    avatarPending: false,
    deleteAccountPending: false,
    emailVerificationPending: false,
    emailVerificationInfo: null,
    emailVerificationError: null,
    pushNotificationsSupported: true,
    pushNotificationsServerEnabled: true,
    pushNotificationsEnabled: false,
    pushNotificationsPermission: "default",
    pushNotificationsPending: false,
    pushNotificationsInfo: null,
    pushNotificationsError: null,
    revokeSessionPending: false,
    contactSearchFetching: false,
    onClose: noop,
    onProfileDisplayNameChange: noop,
    onProfileProfessionChange: noop,
    onSubmitProfileDisplayName: noop,
    onPasswordChangeCurrentChange: noop,
    onPasswordChangeNextChange: noop,
    onPasswordChangeConfirmChange: noop,
    onSubmitPasswordChange: noop,
    onDeleteAccountConfirmationChange: noop,
    onDeleteAccount: noop,
    onRemoveAvatar: noop,
    onAvatarSelected: noop,
    onResendEmailVerification: noop,
    onEnablePushNotifications: noop,
    onDisablePushNotifications: noop,
    onGroupTitleChange: noop,
    onGroupDetailsTitleChange: noop,
    onGroupDetailsPrejoinHistoryPolicyChange: noop,
    onGroupAvatarSelected: noop,
    onRemoveGroupAvatar: noop,
    onToggleGroupCreatePicker: noop,
    onToggleGroupParticipant: noop,
    onSubmitCreateGroup: noop,
    onSubmitUpdateGroup: noop,
    onOpenGroupMembers: noop,
    onToggleGroupInvitePicker: noop,
    onToggleGroupInviteParticipant: noop,
    onSubmitAddGroupParticipants: noop,
    onGenerateGroupInviteLink: noop,
    onCopyGroupInviteLink: noop,
    onToggleConferenceInviteParticipant: noop,
    onSubmitAddConferenceParticipants: noop,
    onContactSearchChange: noop,
    onAddContact: noop,
    onRemoveContact: noop,
    onCreateChat: noop,
    onRevokeSession: noop,
    formatProfileDate: (value) => value,
    formatSessionTime: (value) => value,
    ...overrides,
  };
}

describe("SidebarManagementSheets sessions sheet", () => {
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

  it("renders auth sessions only", async () => {
    await act(async () => {
      root!.render(<SidebarManagementSheets {...buildProps()} />);
    });

    expect(container.textContent).toContain("Chrome on Windows");
    expect(container.textContent).toContain("Сессии входа");
    expect(container.textContent).not.toContain("Pixel 8");
  });
});

describe("SidebarManagementSheets group info sheet", () => {
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

  it("renders the prejoin history switch and calls change handler", async () => {
    const onGroupDetailsPrejoinHistoryPolicyChange = vi.fn();
    await act(async () => {
      root!.render(
        <SidebarManagementSheets
          {...buildProps({
            sheet: "groupInfo",
            groupDetailsTitle: "Тест",
            activeChat: {
              id: "chat-1",
              direct: false,
              title: "Тест",
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
              members: [
                {
                  id: "user-1",
                  username: "north",
                  displayName: "North",
                  profession: null,
                  avatarUrl: null,
                  online: true,
                },
                {
                  id: "user-2",
                  username: "alice",
                  displayName: "Alice",
                  profession: null,
                  avatarUrl: null,
                  online: true,
                },
              ],
              lastMessage: null,
              lastMessageAt: null,
              updatedAt: "2026-04-29T10:00:00Z",
              unreadCount: 0,
              pinnedMessage: null,
              historyAccessStatus: null,
              prejoinHistoryPolicy: "JOIN_ONLY",
            },
            onGroupDetailsPrejoinHistoryPolicyChange,
          })}
        />
      );
    });

    expect(container.textContent).toContain(
      "Разрешить новым участникам группы видеть старую историю сообщений"
    );

    const historySwitch = container.querySelector('[role="switch"]') as HTMLButtonElement | null;
    expect(historySwitch).toBeTruthy();
    expect(historySwitch?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      historySwitch?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onGroupDetailsPrejoinHistoryPolicyChange).toHaveBeenCalledWith("FULL_HISTORY");
  });
});
