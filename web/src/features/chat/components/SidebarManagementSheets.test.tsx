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
    currentEncryptionDeviceId: "device-1",
    encryptionDevices: [
      {
        deviceId: "device-1",
        deviceName: "Pixel 8",
        identityKey: "identity-key",
        identityKeyAlgorithm: "X25519",
        identitySignatureKey: "signature-key",
        identitySignatureKeyAlgorithm: "Ed25519",
        signedPrekeyId: 1,
        signedPrekeyPublicKey: "signed-prekey",
        signedPrekeySignature: "signature",
        signedPrekeyAlgorithm: "X25519",
        deviceVersion: "3",
        availableOneTimePrekeys: 12,
        registeredAt: "2026-04-28T13:00:00Z",
        lastSeenAt: "2026-04-28T13:02:00Z",
      },
    ],
    encryptionDevicesLoading: false,
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
    groupInviteLinkVisible: false,
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
    retireEncryptionDevicePending: false,
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
    onRetireEncryptionDevice: noop,
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

  it("renders auth sessions alongside encryption devices", async () => {
    await act(async () => {
      root!.render(<SidebarManagementSheets {...buildProps()} />);
    });

    expect(container.textContent).toContain("Chrome on Windows");
    expect(container.textContent).toContain("Pixel 8");
    expect(container.textContent).toContain("OTP prekeys: 12");
    expect(container.textContent).toContain("E2EE-устройства");
    expect(container.textContent).toContain("Это устройство");
    expect(container.textContent).toContain("Единственное E2EE");
    expect(container.textContent).not.toContain("v3");
  });

  it("marks a recent non-current device as backup", async () => {
    await act(async () => {
      root!.render(
        <SidebarManagementSheets
          {...buildProps({
            encryptionDevices: [
              {
                deviceId: "device-1",
                deviceName: "Chrome on Windows",
                identityKey: "identity-key-1",
                identityKeyAlgorithm: "X25519",
                identitySignatureKey: "signature-key-1",
                identitySignatureKeyAlgorithm: "Ed25519",
                signedPrekeyId: 1,
                signedPrekeyPublicKey: "signed-prekey-1",
                signedPrekeySignature: "signature-1",
                signedPrekeyAlgorithm: "X25519",
                deviceVersion: "alpha-build-hash",
                availableOneTimePrekeys: 14,
                registeredAt: "2099-04-28T13:00:00Z",
                lastSeenAt: "2099-04-28T13:02:00Z",
              },
              {
                deviceId: "device-2",
                deviceName: "Pixel 8",
                identityKey: "identity-key-2",
                identityKeyAlgorithm: "X25519",
                identitySignatureKey: "signature-key-2",
                identitySignatureKeyAlgorithm: "Ed25519",
                signedPrekeyId: 2,
                signedPrekeyPublicKey: "signed-prekey-2",
                signedPrekeySignature: "signature-2",
                signedPrekeyAlgorithm: "X25519",
                deviceVersion: "3",
                availableOneTimePrekeys: 10,
                registeredAt: "2099-04-27T13:00:00Z",
                lastSeenAt: "2099-04-27T13:02:00Z",
              },
            ],
          })}
        />
      );
    });

    expect(container.textContent).toContain(
      "Это хороший минимум: текущее и одно запасное E2EE-устройство."
    );
    expect(container.textContent).toContain("Запасное");
    expect(container.textContent).not.toContain("alpha-build-hash");
  });

  it("marks stale non-current devices", async () => {
    await act(async () => {
      root!.render(
        <SidebarManagementSheets
          {...buildProps({
            encryptionDevices: [
              {
                deviceId: "device-1",
                deviceName: "Chrome on Windows",
                identityKey: "identity-key-1",
                identityKeyAlgorithm: "X25519",
                identitySignatureKey: "signature-key-1",
                identitySignatureKeyAlgorithm: "Ed25519",
                signedPrekeyId: 1,
                signedPrekeyPublicKey: "signed-prekey-1",
                signedPrekeySignature: "signature-1",
                signedPrekeyAlgorithm: "X25519",
                deviceVersion: "3",
                availableOneTimePrekeys: 14,
                registeredAt: "2099-04-28T13:00:00Z",
                lastSeenAt: "2099-04-28T13:02:00Z",
              },
              {
                deviceId: "device-2",
                deviceName: "Old laptop",
                identityKey: "identity-key-2",
                identityKeyAlgorithm: "X25519",
                identitySignatureKey: "signature-key-2",
                identitySignatureKeyAlgorithm: "Ed25519",
                signedPrekeyId: 2,
                signedPrekeyPublicKey: "signed-prekey-2",
                signedPrekeySignature: "signature-2",
                signedPrekeyAlgorithm: "X25519",
                deviceVersion: "legacy-build",
                availableOneTimePrekeys: 2,
                registeredAt: "2020-01-01T00:00:00Z",
                lastSeenAt: "2020-01-02T00:00:00Z",
              },
            ],
          })}
        />
      );
    });

    expect(container.textContent).toContain("Давно не использовалось");
    expect(container.textContent).toContain("Давно не использовались: 1.");
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
