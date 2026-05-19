import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettingsCard } from "./ProfileSettingsCard";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const defaultProps: Parameters<typeof ProfileSettingsCard>[0] = {
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
  profileDisplayName: "North",
  profileProfession: "",
  passwordChangeCurrent: "",
  passwordChangeNext: "",
  passwordChangeConfirm: "",
  deleteAccountConfirmation: "",
  deleteAccountRequiresMatch: false,
  updateProfilePending: false,
  changePasswordPending: false,
  changePasswordError: null,
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
  pushNotificationsSupported: true,
  pushNotificationsServerEnabled: true,
  pushNotificationsEnabled: false,
  pushNotificationsPermission: "default",
  pushNotificationsPending: false,
  pushNotificationsInfo: null,
  pushNotificationsError: null,
  onClose: () => {},
  onProfileDisplayNameChange: () => {},
  onProfileProfessionChange: () => {},
  onSubmitProfileDisplayName: () => {},
  onPasswordChangeCurrentChange: () => {},
  onPasswordChangeNextChange: () => {},
  onPasswordChangeConfirmChange: () => {},
  onSubmitPasswordChange: () => {},
  onDeleteAccountConfirmationChange: () => {},
  onDeleteAccount: () => {},
  onAvatarSelected: () => {},
  onResendEmailVerification: () => {},
  onEnablePushNotifications: () => {},
  onDisablePushNotifications: () => {},
  onSetMailEnabled: () => {},
};

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function blurInput(input: HTMLInputElement) {
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

describe("ProfileSettingsCard password change form", () => {
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

  it("keeps password visibility toggles active and disables submit for invalid passwords", async () => {
    function PasswordStateWrapper() {
      const [current, setCurrent] = useState("");
      const [next, setNext] = useState("");
      const [confirm, setConfirm] = useState("");

      return (
        <ProfileSettingsCard
          {...defaultProps}
          passwordChangeCurrent={current}
          passwordChangeNext={next}
          passwordChangeConfirm={confirm}
          onPasswordChangeCurrentChange={setCurrent}
          onPasswordChangeNextChange={setNext}
          onPasswordChangeConfirmChange={setConfirm}
        />
      );
    }

    await act(async () => {
      root!.render(<PasswordStateWrapper />);
      await Promise.resolve();
    });

    const openButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Сменить пароль")
    );
    if (!openButton) {
      throw new Error("Open password form button is missing");
    }

    await act(async () => {
      openButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const inputs = container.querySelectorAll(".profile-expand-form input");
    const currentPasswordInput = inputs[0] as HTMLInputElement;
    const newPasswordInput = inputs[1] as HTMLInputElement;
    const confirmPasswordInput = inputs[2] as HTMLInputElement;
    const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Сменить пароль")
    ) as HTMLButtonElement | undefined;

    if (!submitButton) {
      throw new Error("Submit password change button is missing");
    }

    expect(submitButton.disabled).toBe(true);
    expect(container.textContent).toContain("Минимум 8 символов, хотя бы одна буква.");

    await act(async () => {
      blurInput(currentPasswordInput);
      blurInput(newPasswordInput);
      blurInput(confirmPasswordInput);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Поле обязательное для заполнения");

    await act(async () => {
      setInputValue(newPasswordInput, "12345678");
      blurInput(newPasswordInput);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Пароль должен содержать хотя бы одну букву");
    expect(submitButton.disabled).toBe(true);

    const showNewPasswordButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Show new password"
    );
    if (!showNewPasswordButton) {
      throw new Error("New password visibility button is missing");
    }

    await act(async () => {
      showNewPasswordButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      currentPasswordInput.focus();
      await Promise.resolve();
    });

    expect(newPasswordInput.type).toBe("text");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.getAttribute("aria-label") === "Hide new password"
      )
    ).toBe(true);

    await act(async () => {
      setInputValue(currentPasswordInput, "oldsecret");
      setInputValue(newPasswordInput, "riverlantern");
      setInputValue(confirmPasswordInput, "riverlantern");
      await Promise.resolve();
    });

    expect(submitButton.disabled).toBe(false);
  });
});
