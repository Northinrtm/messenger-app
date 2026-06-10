import { useEffect, useState } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import type { Locale, TranslationKey } from "../../../i18n";
import type { PushNotificationPermission } from "../../../lib/pushNotifications";
import type { UserProfile } from "../../../lib/types";
import {
  AUTH_PASSWORD_HELP,
  validatePasswordConfirmation,
  validateRegistrationPassword,
  validateRequiredField,
} from "../../auth/authValidation";
import { AvatarCircle } from "./AvatarCircle";

const LOCALE_OPTIONS: Array<{ value: Locale; labelKey: TranslationKey }> = [
  { value: "ru", labelKey: "settings.language.ru" },
  { value: "en", labelKey: "settings.language.en" },
];

type Props = {
  profile: UserProfile;
  mailServerEnabled: boolean;
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
  changePasswordSuccess: boolean;
  avatarPending: boolean;
  deleteAccountPending: boolean;
  emailVerificationPending: boolean;
  emailVerificationInfo: string | null;
  emailVerificationError: string | null;
  emailChangePending: boolean;
  emailChangeInfo: string | null;
  emailChangeError: string | null;
  emailChangeInput: string;
  onEmailChangeInputChange: (value: string) => void;
  onRequestEmailChange: () => void;
  usernameChangePending: boolean;
  usernameChangeInfo: string | null;
  usernameChangeError: string | null;
  usernameChangeInput: string;
  onUsernameChangeInputChange: (value: string) => void;
  onSubmitUsernameChange: () => void;
  onSubmitProfileDisplayName: (mailEnabled?: boolean) => void;
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
};

type PasswordField = "current" | "next" | "confirm";

export function ProfileSettingsCard({
  profile,
  mailServerEnabled,
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
  changePasswordSuccess,
  avatarPending,
  deleteAccountPending,
  emailVerificationPending,
  emailVerificationInfo,
  emailVerificationError,
  emailChangePending,
  emailChangeInfo,
  emailChangeError,
  emailChangeInput,
  onEmailChangeInputChange,
  onRequestEmailChange,
  usernameChangePending,
  usernameChangeInfo,
  usernameChangeError,
  usernameChangeInput,
  onUsernameChangeInputChange,
  onSubmitUsernameChange,
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
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [passwordFieldTouched, setPasswordFieldTouched] = useState<
    Partial<Record<PasswordField, boolean>>
  >({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingMailEnabled, setPendingMailEnabled] = useState<boolean | null>(null);

  const normalizedProfileDisplayName = profileDisplayName.trim();
  const normalizedProfileProfession = profileProfession.trim();
  const profileDisplayNameError: TranslationKey | null =
    normalizedProfileDisplayName.length > 0 && normalizedProfileDisplayName.length < 2
      ? "settings.name.error"
      : null;
  const serverMailEnabled = Boolean(profile.mailEnabled);
  const effectiveMailEnabled = pendingMailEnabled ?? serverMailEnabled;
  const profileChanged =
    normalizedProfileDisplayName !== profile.displayName ||
    normalizedProfileProfession !== (profile.profession ?? "") ||
    effectiveMailEnabled !== serverMailEnabled;
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
      ? "settings.password.sameAsCurrent"
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
  const showUnverifiedEmailStatus = !emailVerified && !emailVerificationEnabled;
  const pushNotificationsStatus = t(
    describePushNotificationsStatusV2({
      enabled: pushNotificationsEnabled,
      permission: pushNotificationsPermission,
      serverEnabled: pushNotificationsServerEnabled,
      supported: pushNotificationsSupported,
    }),
  );
  const canEnablePushNotifications =
    pushNotificationsSupported &&
    pushNotificationsServerEnabled &&
    !pushNotificationsEnabled;
  const canDisablePushNotifications =
    pushNotificationsSupported && pushNotificationsEnabled;

  useEffect(() => {
    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
    setPendingMailEnabled(null);
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
          <div className="section-title">{t("settings.title")}</div>
        </div>
        <button type="button" className="ghost-button compact" onClick={onClose}>
          {t("common.close")}
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
              {avatarPending ? t("settings.avatar.uploading") : t("settings.avatar.change")}
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
            onSubmitProfileDisplayName(pendingMailEnabled ?? undefined);
            setPendingMailEnabled(null);
          }}
        >
          <span className="profile-label">{t("settings.name.label")}</span>
          <div className="profile-inline-stack">
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder={t("settings.name.placeholder")}
              maxLength={40}
            />
            <span className="profile-field-meta">
              {profileDisplayName.length}/40
            </span>
          </div>
          {profileDisplayNameError ? (
            <div className="field-error-text">{t(profileDisplayNameError)}</div>
          ) : null}

          <span className="profile-label">{t("settings.about.label")}</span>
          <div className="profile-inline-stack">
            <textarea
              className="profile-about-input"
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder={t("settings.about.placeholder")}
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
                {updateProfilePending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          ) : null}
        </form>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.email.label")}</span>
              <strong>{emailValue ?? t("settings.email.unavailable")}</strong>
              <span>
                {emailVerified
                  ? t("settings.email.verified")
                  : emailVerificationEnabled
                    ? t("settings.email.unverifiedCanSend")
                    : t("settings.email.verificationDisabled")}
              </span>
              {showUnverifiedEmailStatus ? (
                <span>{t("settings.email.unverified")}</span>
              ) : null}
            </div>
            {!emailVerified && emailVerificationEnabled && emailValue ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onResendEmailVerification}
                disabled={emailVerificationPending}
              >
                {emailVerificationPending ? t("common.sending") : t("settings.email.verifyButton")}
              </button>
            ) : null}
          </div>
          {emailVerificationInfo ? <div className="form-note">{emailVerificationInfo}</div> : null}
          {emailVerificationError ? <div className="form-error">{emailVerificationError}</div> : null}
          <form
            className="profile-expand-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRequestEmailChange();
            }}
          >
            <span className="profile-label">{t("settings.email.changeLabel")}</span>
            <input
              type="email"
              value={emailChangeInput}
              onChange={(event) => onEmailChangeInputChange(event.target.value)}
              placeholder={t("settings.email.changePlaceholder")}
              autoComplete="email"
              disabled={emailChangePending}
            />
            <div className="profile-inline-row profile-edit-actions">
              <button
                type="submit"
                className="secondary-button"
                disabled={emailChangePending || !emailChangeInput.trim()}
              >
                {emailChangePending ? t("common.sending") : t("settings.email.sendLink")}
              </button>
            </div>
            {emailChangeInfo ? <div className="form-note">{emailChangeInfo}</div> : null}
            {emailChangeError ? <div className="form-error">{emailChangeError}</div> : null}
          </form>
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.username.label")}</span>
              <strong>@{profile.username}</strong>
              <span>{t("settings.username.hint")}</span>
            </div>
          </div>
          <form
            className="profile-expand-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitUsernameChange();
            }}
          >
            <span className="profile-label">{t("settings.username.changeLabel")}</span>
            <input
              type="text"
              value={usernameChangeInput}
              onChange={(event) => onUsernameChangeInputChange(event.target.value)}
              placeholder={t("settings.username.changePlaceholder")}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={usernameChangePending}
              maxLength={24}
            />
            <div className="profile-inline-row profile-edit-actions">
              <button
                type="submit"
                className="secondary-button"
                disabled={usernameChangePending || !usernameChangeInput.trim()}
              >
                {usernameChangePending ? t("settings.username.changing") : t("common.change")}
              </button>
            </div>
            {usernameChangeInfo ? <div className="form-note">{usernameChangeInfo}</div> : null}
            {usernameChangeError ? <div className="form-error">{usernameChangeError}</div> : null}
          </form>
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.mailSection.label")}</span>
              {mailServerEnabled ? (
                <>
                  <strong>
                    {effectiveMailEnabled
                      ? t("settings.mailSection.open")
                      : t("settings.mailSection.hidden")}
                    {pendingMailEnabled !== null ? " \u2022" : null}
                  </strong>
                  <span>
                    {effectiveMailEnabled
                      ? t("settings.mailSection.openDesc")
                      : t("settings.mailSection.hiddenDesc")}
                  </span>
                </>
              ) : (
                <>
                  <strong>{t("settings.mailSection.unavailable")}</strong>
                  <span>{t("settings.mailSection.serverOff")}</span>
                </>
              )}
            </div>
            {mailServerEnabled ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={() => setPendingMailEnabled(!effectiveMailEnabled)}
                disabled={updateProfilePending}
              >
                {effectiveMailEnabled
                  ? t("settings.mailSection.hideButton")
                  : t("settings.mailSection.showButton")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.notifications.label")}</span>
              <strong>Push {t("settings.notifications.onThisDevice")}</strong>
              <span>{pushNotificationsStatus}</span>
            </div>
            {canEnablePushNotifications ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onEnablePushNotifications}
                disabled={pushNotificationsPending}
              >
                {pushNotificationsPending ? t("settings.notifications.enabling") : t("common.enable")}
              </button>
            ) : canDisablePushNotifications ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onDisablePushNotifications}
                disabled={pushNotificationsPending}
              >
                {pushNotificationsPending ? t("settings.notifications.disabling") : t("common.disable")}
              </button>
            ) : null}
          </div>
          {pushNotificationsInfo ? <div className="form-note">{pushNotificationsInfo}</div> : null}
          {pushNotificationsError ? <div className="form-error">{pushNotificationsError}</div> : null}
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.language.label")}</span>
              <span>{t("settings.language.hint")}</span>
            </div>
            <div className="profile-inline-row profile-language-options">
              {LOCALE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === locale ? "secondary-button" : "ghost-button compact"}
                  aria-pressed={option.value === locale}
                  onClick={() => setLocale(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.security.label")}</span>
              <strong>{t("settings.security.password")}</strong>
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
              {isPasswordFormOpen ? t("common.hide") : t("settings.password.changeButton")}
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
                    placeholder={t("settings.password.current")}
                    type={showCurrentPassword ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={passwordChangeCurrentError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showCurrentPassword}
                    onClick={() => setShowCurrentPassword((current) => !current)}
                    labelWhenShown={t("settings.password.hideCurrent")}
                    labelWhenHidden={t("settings.password.showCurrent")}
                  />
                </div>
                {passwordChangeCurrentError ? (
                  <div className="field-error-text">{t(passwordChangeCurrentError)}</div>
                ) : null}
              </div>

              <div className={passwordChangeNextError ? "field is-invalid" : "field"}>
                <div className="field-input">
                  <input
                    value={passwordChangeNext}
                    onChange={(event) => onPasswordChangeNextChange(event.target.value)}
                    onBlur={() => touchPasswordField("next")}
                    placeholder={t("settings.password.next")}
                    type={showNextPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={passwordChangeNextError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showNextPassword}
                    onClick={() => setShowNextPassword((current) => !current)}
                    labelWhenShown={t("settings.password.hideNext")}
                    labelWhenHidden={t("settings.password.showNext")}
                  />
                </div>
                <div className="field-help">{t(AUTH_PASSWORD_HELP)}</div>
                {passwordChangeNextError ? (
                  <div className="field-error-text">{t(passwordChangeNextError)}</div>
                ) : null}
              </div>

              <div className={passwordChangeConfirmError ? "field is-invalid" : "field"}>
                <div className="field-input">
                  <input
                    value={passwordChangeConfirm}
                    onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
                    onBlur={() => touchPasswordField("confirm")}
                    placeholder={t("settings.password.confirm")}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={passwordChangeConfirmError ? "true" : undefined}
                  />
                  <PasswordVisibilityButton
                    shown={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    labelWhenShown={t("settings.password.hideConfirm")}
                    labelWhenHidden={t("settings.password.showConfirm")}
                  />
                </div>
                {passwordChangeConfirmError ? (
                  <div className="field-error-text">{t(passwordChangeConfirmError)}</div>
                ) : null}
              </div>
              {changePasswordError ? <div className="form-error">{changePasswordError}</div> : null}
              {changePasswordSuccess ? (
                <div className="form-success">{t("settings.password.success")}</div>
              ) : null}

              <div className="profile-inline-row">
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || changePasswordSuccess || !passwordChangeReady}
                >
                  {changePasswordPending
                    ? t("settings.password.changing")
                    : t("settings.password.changeButton")}
                </button>
                <button type="button" className="ghost-button compact" onClick={closePasswordForm}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="profile-line profile-action-panel profile-danger-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">{t("settings.account.label")}</span>
              <strong>{t("settings.account.deleteTitle")}</strong>
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
              {isDeleteConfirmOpen ? t("common.hide") : t("settings.account.deleteButton")}
            </button>
          </div>

          {isDeleteConfirmOpen ? (
            <div className="profile-delete-confirm">
              <p>
                {t("settings.account.deleteConfirmPrefix")}
                <strong>{profile.username}</strong>
                {t("settings.account.deleteConfirmSuffix")}
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
                    ? t("settings.account.deleting")
                    : t("settings.account.confirmDelete")}
                </button>
                <button type="button" className="ghost-button compact" onClick={closeDeleteConfirm}>
                  {t("common.cancel")}
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
}): TranslationKey {
  if (args.supported && args.serverEnabled && args.permission !== "denied") {
    if (args.enabled) {
      return "settings.push.statusEnabledRich";
    }
    return "settings.push.statusCanEnableRich";
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
}): TranslationKey {
  if (!supported) {
    return "settings.push.unsupported";
  }
  if (!serverEnabled) {
    return "settings.push.serverOff";
  }
  if (permission === "denied") {
    return "settings.push.denied";
  }
  if (enabled) {
    return "settings.push.enabledNoText";
  }
  return "settings.push.canEnableNoText";
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
