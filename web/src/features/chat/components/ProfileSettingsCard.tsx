import { useEffect, useState } from "react";

import type { PushNotificationPermission } from "../../../lib/pushNotifications";
import type { UserProfile } from "../../../lib/types";
import {
  AUTH_PASSWORD_HELP,
  validatePasswordConfirmation,
  validateRegistrationPassword,
  validateRequiredField,
} from "../../auth/authValidation";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  profile: UserProfile;
  profileDisplayName: string;
  profileProfession: string;
  passwordChangeCurrent: string;
  passwordChangeNext: string;
  passwordChangeConfirm: string;
  deleteAccountConfirmation: string;
  deleteAccountRequiresMatch: boolean;
  updateProfilePending: boolean;
  changePasswordPending: boolean;
  changePasswordError: string | null;
  avatarPending: boolean;
  deleteAccountPending: boolean;
  emailVerificationPending: boolean;
  emailVerificationInfo: string | null;
  emailVerificationError: string | null;
  pushNotificationsSupported: boolean;
  pushNotificationsServerEnabled: boolean;
  pushNotificationsEnabled: boolean;
  pushNotificationsPermission: PushNotificationPermission;
  pushNotificationsPending: boolean;
  pushNotificationsInfo: string | null;
  pushNotificationsError: string | null;
  onClose: () => void;
  onProfileDisplayNameChange: (value: string) => void;
  onProfileProfessionChange: (value: string) => void;
  onSubmitProfileDisplayName: () => void;
  onPasswordChangeCurrentChange: (value: string) => void;
  onPasswordChangeNextChange: (value: string) => void;
  onPasswordChangeConfirmChange: (value: string) => void;
  onSubmitPasswordChange: () => void;
  onDeleteAccountConfirmationChange: (value: string) => void;
  onDeleteAccount: () => void;
  onAvatarSelected: (file: File) => void;
  onResendEmailVerification: () => void;
  onEnablePushNotifications: () => void;
  onDisablePushNotifications: () => void;
  onSetMailEnabled: (value: boolean) => void;
};

type PasswordField = "current" | "next" | "confirm";

export function ProfileSettingsCard({
  profile,
  profileDisplayName,
  profileProfession,
  passwordChangeCurrent,
  passwordChangeNext,
  passwordChangeConfirm,
  deleteAccountConfirmation,
  deleteAccountRequiresMatch,
  updateProfilePending,
  changePasswordPending,
  changePasswordError,
  avatarPending,
  deleteAccountPending,
  emailVerificationPending,
  emailVerificationInfo,
  emailVerificationError,
  pushNotificationsSupported,
  pushNotificationsServerEnabled,
  pushNotificationsEnabled,
  pushNotificationsPermission,
  pushNotificationsPending,
  pushNotificationsInfo,
  pushNotificationsError,
  onClose,
  onProfileDisplayNameChange,
  onProfileProfessionChange,
  onSubmitProfileDisplayName,
  onPasswordChangeCurrentChange,
  onPasswordChangeNextChange,
  onPasswordChangeConfirmChange,
  onSubmitPasswordChange,
  onDeleteAccountConfirmationChange,
  onDeleteAccount,
  onAvatarSelected,
  onResendEmailVerification,
  onEnablePushNotifications,
  onDisablePushNotifications,
  onSetMailEnabled,
}: Props) {
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [passwordFieldTouched, setPasswordFieldTouched] = useState<
    Partial<Record<PasswordField, boolean>>
  >({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const normalizedProfileDisplayName = profileDisplayName.trim();
  const normalizedProfileProfession = profileProfession.trim();
  const profileDisplayNameError =
    normalizedProfileDisplayName.length > 0 && normalizedProfileDisplayName.length < 2
      ? "Имя должно содержать от 2 до 40 символов."
      : null;
  const profileChanged =
    normalizedProfileDisplayName !== profile.displayName ||
    normalizedProfileProfession !== (profile.profession ?? "");
  const displayedProfileName =
    normalizedProfileDisplayName.length > 0 ? normalizedProfileDisplayName : profile.displayName;
  const displayedProfileProfession =
    normalizedProfileProfession.length > 0
      ? normalizedProfileProfession
      : (profile.profession ?? "");

  const rawPasswordChangeCurrentError = validateRequiredField(passwordChangeCurrent);
  const rawPasswordChangeNextError = validateRegistrationPassword({
    username: profile.username,
    displayName: displayedProfileName,
    password: passwordChangeNext,
  });
  const rawPasswordChangeConfirmError = validatePasswordConfirmation(
    passwordChangeNext,
    passwordChangeConfirm
  );
  const passwordChangeSameAsCurrentError =
    passwordChangeCurrent &&
    passwordChangeNext &&
    passwordChangeCurrent === passwordChangeNext
      ? "\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u043e\u0442\u043b\u0438\u0447\u0430\u0442\u044c\u0441\u044f \u043e\u0442 \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e"
      : null;
  const passwordChangeCurrentError = passwordFieldTouched.current
    ? rawPasswordChangeCurrentError
    : null;
  const passwordChangeNextError = passwordFieldTouched.next
    ? rawPasswordChangeNextError ?? passwordChangeSameAsCurrentError
    : null;
  const passwordChangeConfirmError = passwordFieldTouched.confirm
    ? rawPasswordChangeConfirmError
    : null;
  const passwordChangeReady =
    rawPasswordChangeCurrentError === null &&
    rawPasswordChangeNextError === null &&
    rawPasswordChangeConfirmError === null &&
    passwordChangeSameAsCurrentError === null;

  const emailValue = profile.email ?? null;
  const emailVerified = Boolean(profile.emailVerified);
  const emailVerificationEnabled = Boolean(profile.emailVerificationEnabled);
  const mailEnabled = Boolean(profile.mailEnabled);
  const showUnverifiedEmailStatus = !emailVerified && !emailVerificationEnabled;
  const pushNotificationsStatus = describePushNotificationsStatusV2({
    enabled: pushNotificationsEnabled,
    permission: pushNotificationsPermission,
    serverEnabled: pushNotificationsServerEnabled,
    supported: pushNotificationsSupported,
  });
  const canEnablePushNotifications =
    pushNotificationsSupported &&
    pushNotificationsServerEnabled &&
    !pushNotificationsEnabled;
  const canDisablePushNotifications =
    pushNotificationsSupported && pushNotificationsEnabled;

  useEffect(() => {
    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
    resetPasswordUiState();
  }, [profile.id]);

  const closePasswordForm = () => {
    setIsPasswordFormOpen(false);
    resetPasswordUiState();
    onPasswordChangeCurrentChange("");
    onPasswordChangeNextChange("");
    onPasswordChangeConfirmChange("");
  };

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false);
    onDeleteAccountConfirmationChange("");
  };

  function resetPasswordUiState() {
    setPasswordFieldTouched({});
    setShowCurrentPassword(false);
    setShowNextPassword(false);
    setShowConfirmPassword(false);
  }

  function touchPasswordField(field: PasswordField) {
    setPasswordFieldTouched((current) => ({ ...current, [field]: true }));
  }

  return (
    <div className="sheet-card">
      <div className="sheet-head">
        <div>
          <div className="section-title">
            {"\u041c\u043e\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c"}
          </div>
        </div>
        <button type="button" className="ghost-button compact" onClick={onClose}>
          {"\u0417\u0430\u043a\u0440\u044b\u0442\u044c"}
        </button>
      </div>

      <div className="sheet-list profile-sheet">
        <div className="profile-avatar-card">
          <label
            className={avatarPending ? "profile-avatar-trigger is-pending" : "profile-avatar-trigger"}
          >
            <AvatarCircle
              className="menu-profile-avatar profile-sheet-avatar"
              name={displayedProfileName}
              avatarUrl={profile.avatarUrl}
              online={profile.online}
            />
            <span className="profile-avatar-badge">
              {avatarPending
                ? "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c..."
                : "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0444\u043e\u0442\u043e"}
            </span>
            <input
              className="profile-avatar-input"
              type="file"
              accept="image/*"
              disabled={avatarPending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onAvatarSelected(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
          <div className="profile-avatar-copy">
            <span>@{profile.username}</span>
            <strong>{displayedProfileName}</strong>
            {displayedProfileProfession ? (
              <em className="profile-about-preview">{displayedProfileProfession}</em>
            ) : null}
          </div>
        </div>

        <form
          className="profile-line profile-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitProfileDisplayName();
          }}
        >
          <span className="profile-label">{"\u0418\u043c\u044f"}</span>
          <div className="profile-inline-stack">
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder={"\u0412\u0430\u0448\u0435 \u0438\u043c\u044f"}
              maxLength={40}
            />
            <span className="profile-field-meta">
              {profileDisplayName.length}/40
            </span>
          </div>
          {profileDisplayNameError ? (
            <div className="field-error-text">{profileDisplayNameError}</div>
          ) : null}

          <span className="profile-label">{"\u041e \u0441\u0435\u0431\u0435"}</span>
          <div className="profile-inline-stack">
            <textarea
              className="profile-about-input"
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder={
                "\u041b\u044e\u0431\u044b\u0435 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u043e\u0441\u0442\u0438, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 \u0440\u043e\u0434 \u0437\u0430\u043d\u044f\u0442\u0438\u0439, \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u044b \u0438\u043b\u0438 \u0433\u043e\u0440\u043e\u0434."
              }
              maxLength={160}
              rows={3}
            />
            <span className="profile-field-meta">
              {profileProfession.length}/160
            </span>
          </div>
          {profileChanged ? (
            <div className="profile-inline-row profile-edit-actions">
              <button
                type="submit"
                className="secondary-button"
                disabled={updateProfilePending || normalizedProfileDisplayName.length < 2}
              >
                {updateProfilePending
                  ? "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c..."
                  : "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c"}
              </button>
            </div>
          ) : null}
        </form>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{"\u041f\u043e\u0447\u0442\u0430"}</span>
              <strong>{emailValue ?? "Email \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d"}</strong>
              <span>
                {emailVerified
                  ? "\u041f\u043e\u0447\u0442\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430."
                  : emailVerificationEnabled
                    ? "\u041f\u043e\u0447\u0442\u0430 \u043d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430. \u041c\u043e\u0436\u043d\u043e \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043f\u0438\u0441\u044c\u043c\u043e \u0441\u043e \u0441\u0441\u044b\u043b\u043a\u043e\u0439 \u0434\u043b\u044f \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f."
                    : "\u0412\u0435\u0440\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f \u043f\u043e\u0447\u0442\u044b \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u0430 \u0432 \u044d\u0442\u043e\u0439 \u0441\u0440\u0435\u0434\u0435."}
              </span>
              {showUnverifiedEmailStatus ? (
                <span>{"\u041f\u043e\u0447\u0442\u0430 \u043d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430."}</span>
              ) : null}
            </div>
            {!emailVerified && emailVerificationEnabled && emailValue ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onResendEmailVerification}
                disabled={emailVerificationPending}
              >
                {emailVerificationPending
                  ? "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c..."
                  : "\u0412\u0435\u0440\u0438\u0444\u0438\u0446\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0447\u0442\u0443"}
              </button>
            ) : null}
          </div>
          {emailVerificationInfo ? <div className="form-note">{emailVerificationInfo}</div> : null}
          {emailVerificationError ? <div className="form-error">{emailVerificationError}</div> : null}
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">
                {"\u0412\u043a\u043b\u0430\u0434\u043a\u0430 \u043f\u043e\u0447\u0442\u044b"}
              </span>
              <strong>
                {mailEnabled
                  ? "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0432 \u0441\u043f\u0438\u0441\u043a\u0435"
                  : "\u0421\u043a\u0440\u044b\u0442\u0430"}
              </strong>
              <span>
                {mailEnabled
                  ? "Раздел «Почта» виден в левой колонке и показывает ваши сохраненные почтовые ящики."
                  : "Раздел «Почта» скрыт из левой колонки. Чаты и конференции останутся доступны как раньше."}
              </span>
            </div>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => onSetMailEnabled(!mailEnabled)}
              disabled={updateProfilePending}
            >
              {updateProfilePending
                ? "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c..."
                : mailEnabled
                  ? "\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u043e\u0447\u0442\u0443"
                  : "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043f\u043e\u0447\u0442\u0443"}
            </button>
          </div>
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{"\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f"}</span>
              <strong>Push {"\u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435"}</strong>
              <span>{pushNotificationsStatus}</span>
            </div>
            {canEnablePushNotifications ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onEnablePushNotifications}
                disabled={pushNotificationsPending}
              >
                {pushNotificationsPending
                  ? "\u0412\u043a\u043b\u044e\u0447\u0430\u0435\u043c..."
                  : "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c"}
              </button>
            ) : canDisablePushNotifications ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onDisablePushNotifications}
                disabled={pushNotificationsPending}
              >
                {pushNotificationsPending
                  ? "\u0412\u044b\u043a\u043b\u044e\u0447\u0430\u0435\u043c..."
                  : "\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c"}
              </button>
            ) : null}
          </div>
          {pushNotificationsInfo ? <div className="form-note">{pushNotificationsInfo}</div> : null}
          {pushNotificationsError ? <div className="form-error">{pushNotificationsError}</div> : null}
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{"\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c"}</span>
              <strong>{"\u041f\u0430\u0440\u043e\u043b\u044c"}</strong>
            </div>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => {
                if (isPasswordFormOpen) {
                  closePasswordForm();
                  return;
                }

                closeDeleteConfirm();
                setIsPasswordFormOpen(true);
              }}
            >
              {isPasswordFormOpen
                ? "\u0421\u043a\u0440\u044b\u0442\u044c"
                : "\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c"}
            </button>
          </div>

          {isPasswordFormOpen ? (
            <form
              className="profile-expand-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitPasswordChange();
              }}
            >
              <div className={passwordChangeCurrentError ? "field is-invalid" : "field"}>
                <div className="field-input">
                  <input
                    value={passwordChangeCurrent}
                    onChange={(event) => onPasswordChangeCurrentChange(event.target.value)}
                    onBlur={() => touchPasswordField("current")}
                    placeholder={"\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"}
                    type={showCurrentPassword ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={passwordChangeCurrentError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showCurrentPassword}
                    onClick={() => setShowCurrentPassword((current) => !current)}
                    labelWhenShown="Hide current password"
                    labelWhenHidden="Show current password"
                  />
                </div>
                {passwordChangeCurrentError ? (
                  <div className="field-error-text">{passwordChangeCurrentError}</div>
                ) : null}
              </div>

              <div className={passwordChangeNextError ? "field is-invalid" : "field"}>
                <div className="field-input">
                  <input
                    value={passwordChangeNext}
                    onChange={(event) => onPasswordChangeNextChange(event.target.value)}
                    onBlur={() => touchPasswordField("next")}
                    placeholder={"\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"}
                    type={showNextPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={passwordChangeNextError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showNextPassword}
                    onClick={() => setShowNextPassword((current) => !current)}
                    labelWhenShown="Hide new password"
                    labelWhenHidden="Show new password"
                  />
                </div>
                <div className="field-help">{AUTH_PASSWORD_HELP}</div>
                {passwordChangeNextError ? (
                  <div className="field-error-text">{passwordChangeNextError}</div>
                ) : null}
              </div>

              <div className={passwordChangeConfirmError ? "field is-invalid" : "field"}>
                <div className="field-input">
                  <input
                    value={passwordChangeConfirm}
                    onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
                    onBlur={() => touchPasswordField("confirm")}
                    placeholder={
                      "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"
                    }
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={passwordChangeConfirmError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    labelWhenShown="Hide confirm password"
                    labelWhenHidden="Show confirm password"
                  />
                </div>
                {passwordChangeConfirmError ? (
                  <div className="field-error-text">{passwordChangeConfirmError}</div>
                ) : null}
              </div>
              {changePasswordError ? <div className="form-error">{changePasswordError}</div> : null}

              <div className="profile-inline-row">
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || !passwordChangeReady}
                >
                  {changePasswordPending
                    ? "\u041c\u0435\u043d\u044f\u0435\u043c \u043f\u0430\u0440\u043e\u043b\u044c..."
                    : "\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c"}
                </button>
                <button type="button" className="ghost-button compact" onClick={closePasswordForm}>
                  {"\u041e\u0442\u043c\u0435\u043d\u0430"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="profile-line profile-action-panel profile-danger-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{"\u0410\u043a\u043a\u0430\u0443\u043d\u0442"}</span>
              <strong>
                {"\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430"}
              </strong>
            </div>
            <button
              type="button"
              className="ghost-button compact danger-button"
              onClick={() => {
                if (isDeleteConfirmOpen) {
                  closeDeleteConfirm();
                  return;
                }

                closePasswordForm();
                setIsDeleteConfirmOpen(true);
              }}
            >
              {isDeleteConfirmOpen
                ? "\u0421\u043a\u0440\u044b\u0442\u044c"
                : "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442"}
            </button>
          </div>

          {isDeleteConfirmOpen ? (
            <div className="profile-delete-confirm">
              <p>
                {"\u042d\u0442\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0435\u043e\u0431\u0440\u0430\u0442\u0438\u043c\u043e. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 "}
                <strong>{profile.username}</strong>
                {" \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435."}
              </p>
              <input
                value={deleteAccountConfirmation}
                onChange={(event) => onDeleteAccountConfirmationChange(event.target.value)}
                placeholder={profile.username}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="profile-inline-row">
                <button
                  type="button"
                  className="secondary-button danger-button"
                  disabled={deleteAccountPending || !deleteAccountRequiresMatch}
                  onClick={onDeleteAccount}
                >
                  {deleteAccountPending
                    ? "\u0423\u0434\u0430\u043b\u044f\u0435\u043c \u0430\u043a\u043a\u0430\u0443\u043d\u0442..."
                    : "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435"}
                </button>
                <button type="button" className="ghost-button compact" onClick={closeDeleteConfirm}>
                  {"\u041e\u0442\u043c\u0435\u043d\u0430"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function describePushNotificationsStatusV2(args: {
  enabled: boolean;
  permission: PushNotificationPermission;
  serverEnabled: boolean;
  supported: boolean;
}) {
  if (args.supported && args.serverEnabled && args.permission !== "denied") {
    if (args.enabled) {
      return "\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u044b. \u0415\u0441\u043b\u0438 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043e\u0442\u043a\u0440\u044b\u0442\u043e \u0438 \u0440\u0430\u0437\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e, \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0435 \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u043f\u0440\u0435\u0432\u044c\u044e; \u043a\u043e\u0433\u0434\u0430 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u043e, push \u043e\u0441\u0442\u0430\u0435\u0442\u0441\u044f \u0431\u0435\u0437 \u0442\u0435\u043a\u0441\u0442\u0430.";
    }
    return "\u041c\u043e\u0436\u043d\u043e \u0432\u043a\u043b\u044e\u0447\u0438\u0442\u044c. \u0422\u0435\u043a\u0441\u0442 \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440: \u043f\u0440\u0435\u0432\u044c\u044e \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442 \u043f\u043e\u0441\u043b\u0435 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043e\u0432\u043a\u0438.";
  }

  return describePushNotificationsStatus(args);
}

function describePushNotificationsStatus({
  enabled,
  permission,
  serverEnabled,
  supported,
}: {
  enabled: boolean;
  permission: PushNotificationPermission;
  serverEnabled: boolean;
  supported: boolean;
}) {
  if (!supported) {
    return "\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043d\u0435 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 Web Push.";
  }
  if (!serverEnabled) {
    return "Push \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.";
  }
  if (permission === "denied") {
    return "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.";
  }
  if (enabled) {
    return "\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u044b. \u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0435 \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0444\u0430\u043a\u0442 \u043d\u043e\u0432\u043e\u0433\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0431\u0435\u0437 \u0442\u0435\u043a\u0441\u0442\u0430.";
  }
  return "\u041c\u043e\u0436\u043d\u043e \u0432\u043a\u043b\u044e\u0447\u0438\u0442\u044c. \u0422\u0435\u043a\u0441\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0432 push \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u0435\u0442\u0441\u044f.";
}

function PasswordVisibilityButton({
  shown,
  onClick,
  labelWhenShown,
  labelWhenHidden,
}: {
  shown: boolean;
  onClick: () => void;
  labelWhenShown: string;
  labelWhenHidden: string;
}) {
  return (
    <button
      type="button"
      className="password-visibility-button"
      aria-label={shown ? labelWhenShown : labelWhenHidden}
      onClick={onClick}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M3 4.5 19.5 21"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M10.6 6.2c.45-.12.92-.2 1.4-.2 5.24 0 9.5 5.5 9.5 6s-1.1 1.9-2.95 3.24M6.2 9.1C3.98 10.65 2.5 12.45 2.5 13c0 .5 4.26 6 9.5 6 1.58 0 3.08-.5 4.4-1.25"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M9.8 9.82A3.2 3.2 0 0 1 15 12.4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="M14.17 14.19A3.2 3.2 0 0 1 9.4 9.42"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M2.5 12c0-.5 4.26-6 9.5-6s9.5 5.5 9.5 6-4.26 6-9.5 6-9.5-5.5-9.5-6Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <circle
            cx="12"
            cy="12"
            r="3.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      )}
    </button>
  );
}
