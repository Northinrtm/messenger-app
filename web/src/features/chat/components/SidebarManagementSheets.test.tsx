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
      mailEnabled: true,
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
      mailEnabled: true,
    },
    mailServerEnabled: true,
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
    bannedGroupParticipants: [],
    groupBansLoading: false,
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
    unbanGroupParticipantPending: false,
    createChatPending: false,
    updateProfilePending: false,
    changePasswordPending: false,
    changePasswordError: null,
    changePasswordSuccess: false,
    avatarPending: false,
    deleteAccountPending: false,
    emailVerificationPending: false,
    emailVerificationInfo: null,
    emailVerificationError: null,
    emailChangePending: false,
    emailChangeInfo: null,
    emailChangeError: null,
    emailChangeInput: "",
    onEmailChangeInputChange: () => undefined,
    onRequestEmailChange: () => undefined,
    usernameChangePending: false,
    usernameChangeInfo: null,
    usernameChangeError: null,
    usernameChangeInput: "",
    onUsernameChangeInputChange: noop,
    onSubmitUsernameChange: noop,
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
    onUnbanParticipant: noop,
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

  it("explains that repeated sign-ins may create multiple browser sessions", async () => {
    await act(async () => {
      root!.render(<SidebarManagementSheets {...buildProps()} />);
    });

    expect(container.textContent).toContain(
      "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0435\u0441\u0441\u0438\u0438"
    );
    expect(container.textContent).toContain(
      "\u0412\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D: 2026-04-28T12:00:00Z"
    );
    expect(container.textContent).toContain(
      "\u041E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437"
    );
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

describe("SidebarManagementSheets contacts search", () => {
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

  it("closes the contact search dropdown on blur but keeps it open when focus moves to a result action", async () => {
    await act(async () => {
      root!.render(
        <SidebarManagementSheets
          {...buildProps({
            sheet: "contacts",
            contactSearch: "north",
            showContactSearchResults: true,
            contactSearchResults: [
              {
                id: "user-2",
                username: "northwind",
                displayName: "Northwind",
                profession: null,
                createdAt: "2026-04-18T08:00:00Z",
                avatarUrl: null,
                online: true,
              },
            ],
          })}
        />
      );
    });

    const input = container.querySelector(".contact-search-shell input") as HTMLInputElement | null;
    if (!input) {
      throw new Error("Contact search input is missing");
    }

    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(container.querySelector(".contact-search-dropdown")).not.toBeNull();

    const addButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Добавить")
    ) as HTMLButtonElement | undefined;
    if (!addButton) {
      throw new Error("Contact result action is missing");
    }

    await act(async () => {
      input.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: addButton,
        })
      );
    });

    expect(container.querySelector(".contact-search-dropdown")).not.toBeNull();

    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    try {
      await act(async () => {
        input.dispatchEvent(
          new FocusEvent("focusout", {
            bubbles: true,
            relatedTarget: outsideButton,
          })
        );
      });
    } finally {
      outsideButton.remove();
    }

    expect(container.querySelector(".contact-search-dropdown")).toBeNull();
  });
});

describe("SidebarManagementSheets group members bans", () => {
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

  it("renders banned participants and unbans them from the group members sheet", async () => {
    const onUnbanParticipant = vi.fn();

    await act(async () => {
      root!.render(
        <SidebarManagementSheets
          {...buildProps({
            sheet: "groupMembers",
            activeChat: {
              id: "chat-1",
              direct: false,
              title: "Team",
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
              ],
              lastMessage: null,
              lastMessageAt: null,
              updatedAt: "2026-04-29T10:00:00Z",
              unreadCount: 0,
              membershipVersion: 1,
              pinnedMessage: null,
              prejoinHistoryPolicy: "JOIN_ONLY",
            },
            bannedGroupParticipants: [
              {
                id: "user-2",
                username: "alice",
                displayName: "Alice",
                profession: null,
                avatarUrl: null,
                online: false,
              },
            ],
            onUnbanParticipant,
          })}
        />
      );
    });

    expect(container.textContent).toContain("Alice");
    const unbanButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Разбанить")
    );
    if (!unbanButton) {
      throw new Error("Unban button is missing");
    }

    await act(async () => {
      unbanButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onUnbanParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-2",
        username: "alice",
      })
    );
  });
});
