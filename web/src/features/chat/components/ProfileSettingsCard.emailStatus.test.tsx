import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileSettingsCard } from "./ProfileSettingsCard";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const defaultPushNotificationProps = {
  pushNotificationsSupported: true,
  pushNotificationsServerEnabled: true,
  pushNotificationsEnabled: false,
  pushNotificationsPermission: "default" as const,
  pushNotificationsPending: false,
  pushNotificationsInfo: null,
  pushNotificationsError: null,
  onEnablePushNotifications: () => {},
  onDisablePushNotifications: () => {},
  onSetMailEnabled: () => {},
};

describe("ProfileSettingsCard email status", () => {
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

  it("shows the email as unverified when verification is disabled", async () => {
    await act(async () => {
      root!.render(
        <ProfileSettingsCard
          profile={{
            id: "user-1",
            username: "north",
            displayName: "North",
            profession: null,
            createdAt: "2026-04-18T08:00:00Z",
            avatarUrl: null,
            online: true,
            email: "north@example.com",
            emailVerified: false,
            emailVerificationEnabled: false,
            mailEnabled: true,
          }}
          profileDisplayName="North"
          profileProfession=""
          passwordChangeCurrent=""
          passwordChangeNext=""
          passwordChangeConfirm=""
          deleteAccountConfirmation=""
          deleteAccountRequiresMatch={false}
          updateProfilePending={false}
          changePasswordPending={false}
          changePasswordError={null}
          avatarPending={false}
          deleteAccountPending={false}
          emailVerificationPending={false}
          emailVerificationInfo={null}
          emailVerificationError={null}
          {...defaultPushNotificationProps}
          onClose={() => {}}
          onProfileDisplayNameChange={() => {}}
          onProfileProfessionChange={() => {}}
          onSubmitProfileDisplayName={() => {}}
          onPasswordChangeCurrentChange={() => {}}
          onPasswordChangeNextChange={() => {}}
          onPasswordChangeConfirmChange={() => {}}
          onSubmitPasswordChange={() => {}}
          onDeleteAccountConfirmationChange={() => {}}
          onDeleteAccount={() => {}}
          onAvatarSelected={() => {}}
          onResendEmailVerification={() => {}}
        />
      );
    });

    expect(container.textContent).toContain("north@example.com");
    expect(container.textContent).toContain("Почта не подтверждена.");
    expect(container.textContent).toContain("Верификация почты отключена");
    expect(container.textContent).not.toContain("Почта подтверждена.");
  });
});
