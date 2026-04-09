import { useEffect, useState } from "react";

import type { UserProfile } from "../../../lib/types";
import {
  clearPinnedEncryptionIdentity,
  getOwnEncryptionIdentitySummary,
  type EncryptionIdentitySummary,
} from "../../../lib/e2ee";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  sessionToken: string;
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
};

export function ProfileSettingsCard({
  sessionToken,
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
}: Props) {
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [identitySummary, setIdentitySummary] = useState<EncryptionIdentitySummary | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

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

  useEffect(() => {
    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
  }, [profile.id]);

  useEffect(() => {
    let cancelled = false;

    const loadIdentity = async () => {
      try {
        const nextSummary = await getOwnEncryptionIdentitySummary(sessionToken, profile.id);
        if (!cancelled) {
          setIdentitySummary(nextSummary);
          setIdentityError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setIdentitySummary(null);
          setIdentityError(error instanceof Error ? error.message : "Не удалось загрузить fingerprint");
        }
      }
    };

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, profile.id]);

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
          <p className="sheet-copy">Настройки текущего аккаунта.</p>
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
          <span className="profile-field-help">Короткое описание о себе.</span>
        </form>

        <div className="profile-line profile-action-panel">
          <div className="profile-action-row">
            <div className="profile-action-copy">
              <span className="profile-label">Шифрование</span>
              <strong>Identity key</strong>
            </div>
            {identitySummary?.pinned ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={async () => {
                  clearPinnedEncryptionIdentity();
                  setIdentitySummary(await getOwnEncryptionIdentitySummary(sessionToken, profile.id));
                }}
              >
                Сбросить доверие
              </button>
            ) : null}
          </div>
          <div className="profile-inline-stack">
            {identitySummary?.fingerprint ? (
              <>
                <strong className="profile-code-value">{identitySummary.fingerprint}</strong>
                <span className="profile-field-help">
                  {identitySummary.pinned
                    ? "Fingerprint закреплён в этом браузере."
                    : "Fingerprint ещё не закреплён в этом браузере."}
                </span>
                {identitySummary.trustedDeviceEnabled ? (
                  <span className="profile-field-help">Разблокировка доверенным устройством включена.</span>
                ) : null}
              </>
            ) : (
              <span className="profile-field-help">
                {identityError ?? "Ключ шифрования появится после настройки или разблокировки зашифрованных чатов."}
              </span>
            )}
          </div>
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
