import { useEffect, useState } from "react";

import type { UserProfile } from "../../../lib/types";
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
  avatarPending: boolean;
  deleteAccountPending: boolean;
  emailVerificationPending: boolean;
  emailVerificationInfo: string | null;
  emailVerificationError: string | null;
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
};

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
  avatarPending,
  deleteAccountPending,
  emailVerificationPending,
  emailVerificationInfo,
  emailVerificationError,
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
}: Props) {
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const passwordChangeMatches = passwordChangeNext === passwordChangeConfirm;
  const passwordChangeReady =
    passwordChangeCurrent.length > 0 &&
    passwordChangeNext.length >= 8 &&
    passwordChangeMatches &&
    passwordChangeCurrent !== passwordChangeNext;
  const normalizedProfileDisplayName = profileDisplayName.trim();
  const normalizedProfileProfession = profileProfession.trim();
  const profileChanged =
    normalizedProfileDisplayName !== profile.displayName ||
    normalizedProfileProfession !== (profile.profession ?? "");
  const displayedProfileName =
    normalizedProfileDisplayName.length > 0 ? normalizedProfileDisplayName : profile.displayName;
  const displayedProfileProfession =
    normalizedProfileProfession.length > 0
      ? normalizedProfileProfession
      : (profile.profession ?? "");
  const emailValue = profile.email ?? null;
  const emailVerified = Boolean(profile.emailVerified);
  const emailVerificationEnabled = Boolean(profile.emailVerificationEnabled);
  const showUnverifiedEmailStatus = !emailVerified && !emailVerificationEnabled;

  useEffect(() => {
    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
  }, [profile.id]);

  const closePasswordForm = () => {
    setIsPasswordFormOpen(false);
    onPasswordChangeCurrentChange("");
    onPasswordChangeNextChange("");
    onPasswordChangeConfirmChange("");
  };

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false);
    onDeleteAccountConfirmationChange("");
  };

  return (
    <div className="sheet-card">
      <div className="sheet-head">
        <div>
          <div className="section-title">Мой профиль</div>
        </div>
        <button type="button" className="ghost-button compact" onClick={onClose}>
          Закрыть
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
              {avatarPending ? "Загружаем..." : "Изменить фото"}
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
          <span className="profile-label">Имя</span>
          <div className="profile-inline-row">
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder="Ваше имя"
              maxLength={40}
            />
            {profileChanged ? (
              <button
                type="submit"
                className="ghost-button compact profile-inline-save"
                disabled={updateProfilePending || normalizedProfileDisplayName.length < 2}
              >
                {updateProfilePending ? "Сохраняем..." : "Сохранить"}
              </button>
            ) : null}
          </div>

          <span className="profile-label">О себе</span>
          <textarea
            className="profile-about-input"
            value={profileProfession}
            onChange={(event) => onProfileProfessionChange(event.target.value)}
            placeholder="Любые подробности, например род занятий, интересы или город."
            maxLength={160}
            rows={3}
          />
        </form>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">Почта</span>
              <strong>{emailValue ?? "Email недоступен"}</strong>
              <span>
                {emailVerified
                  ? "Почта подтверждена."
                  : emailVerificationEnabled
                    ? "Почта не подтверждена. Можно отправить письмо со ссылкой для подтверждения."
                    : "Верификация почты отключена в этой среде."}
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
                {emailVerificationPending ? "Отправляем..." : "Верифицировать почту"}
              </button>
            ) : null}
          </div>
          {emailVerificationInfo ? <div className="form-note">{emailVerificationInfo}</div> : null}
          {emailVerificationError ? <div className="form-error">{emailVerificationError}</div> : null}
        </div>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">Безопасность</span>
              <strong>Пароль</strong>
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
              {isPasswordFormOpen ? "Скрыть" : "Сменить пароль"}
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
              <input
                value={passwordChangeCurrent}
                onChange={(event) => onPasswordChangeCurrentChange(event.target.value)}
                placeholder="Текущий пароль"
                type="password"
                autoComplete="current-password"
              />
              <input
                value={passwordChangeNext}
                onChange={(event) => onPasswordChangeNextChange(event.target.value)}
                placeholder="Новый пароль"
                type="password"
                autoComplete="new-password"
              />
              <input
                value={passwordChangeConfirm}
                onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
                placeholder="Повторите новый пароль"
                type="password"
                autoComplete="new-password"
              />
              {!passwordChangeMatches && passwordChangeConfirm.length > 0 ? (
                <div className="form-error">Пароли не совпадают.</div>
              ) : null}
              <div className="profile-inline-row">
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || !passwordChangeReady}
                >
                  {changePasswordPending ? "Меняем пароль..." : "Сменить пароль"}
                </button>
                <button type="button" className="ghost-button compact" onClick={closePasswordForm}>
                  Отмена
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="profile-line profile-action-panel profile-danger-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">Аккаунт</span>
              <strong>Удаление аккаунта</strong>
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
              {isDeleteConfirmOpen ? "Скрыть" : "Удалить аккаунт"}
            </button>
          </div>

          {isDeleteConfirmOpen ? (
            <div className="profile-delete-confirm">
              <p>
                Это действие необратимо. Введите <strong>{profile.username}</strong>, чтобы
                подтвердить удаление.
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
                  {deleteAccountPending ? "Удаляем аккаунт..." : "Подтвердить удаление"}
                </button>
                <button type="button" className="ghost-button compact" onClick={closeDeleteConfirm}>
                  Отмена
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
