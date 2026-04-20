import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettingsCard } from "./ProfileSettingsCard";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function profile(overrides: Partial<Parameters<typeof ProfileSettingsCard>[0]["profile"]> = {}) {
  return {
    id: "user-1",
    username: "north",
    displayName: "North",
    profession: null,
    createdAt: "2026-04-18T08:00:00Z",
    avatarUrl: null,
    online: true,
    email: "north@example.com",
    emailVerified: false,
    emailVerificationEnabled: true,
    ...overrides,
  };
}

describe("ProfileSettingsCard email verification section", () => {
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
    vi.clearAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("shows unverified email state and triggers resend action", async () => {
    const resendSpy = vi.fn();

    await act(async () => {
      root!.render(
        <ProfileSettingsCard
          profile={profile()}
          profileDisplayName="North"
          profileProfession=""
          passwordChangeCurrent=""
          passwordChangeNext=""
          passwordChangeConfirm=""
          deleteAccountConfirmation=""
          deleteAccountRequiresMatch={false}
          updateProfilePending={false}
          changePasswordPending={false}
          avatarPending={false}
          deleteAccountPending={false}
          emailVerificationPending={false}
          emailVerificationInfo={null}
          emailVerificationError={null}
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
          onResendEmailVerification={resendSpy}
        />
      );
    });

    expect(container.textContent).toContain("north@example.com");
    expect(container.textContent).toContain("Почта не подтверждена.");

    const button = Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Верифицировать почту")
    );
    if (!button) {
      throw new Error("Verification button is missing");
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(resendSpy).toHaveBeenCalledTimes(1);
  });

  it("shows verified email state without resend button", async () => {
    await act(async () => {
      root!.render(
        <ProfileSettingsCard
          profile={profile({ emailVerified: true })}
          profileDisplayName="North"
          profileProfession=""
          passwordChangeCurrent=""
          passwordChangeNext=""
          passwordChangeConfirm=""
          deleteAccountConfirmation=""
          deleteAccountRequiresMatch={false}
          updateProfilePending={false}
          changePasswordPending={false}
          avatarPending={false}
          deleteAccountPending={false}
          emailVerificationPending={false}
          emailVerificationInfo={null}
          emailVerificationError={null}
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

    expect(container.textContent).toContain("Почта подтверждена.");
    expect(container.textContent).not.toContain("Верифицировать почту");
  });
});
