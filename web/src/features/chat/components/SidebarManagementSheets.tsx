import { useEffect, useState } from "react";
import type { UserProfile, UserSessionInfo, ChatSummary, VideoConference } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

type SidebarManagementSheet =
  | "profile"
  | "group"
  | "groupInfo"
  | "groupMembers"
  | "conferenceMembers"
  | "contacts"
  | "sessions"
  | null;

type GroupMembersOptions = {
  openInvitePicker?: boolean;
};

type Props = {
  sheet: SidebarManagementSheet;
  profile: UserProfile;
  sessionUser: UserProfile;
  profileDisplayName: string;
  profileProfession: string;
  passwordChangeCurrent: string;
  passwordChangeNext: string;
  passwordChangeConfirm: string;
  deleteAccountConfirmation: string;
  deleteAccountRequiresMatch: boolean;
  groupTitle: string;
  groupDetailsTitle: string;
  groupDetailsAvatarUrl: string | null;
  contactSearch: string;
  showContactSearchResults: boolean;
  contactSearchResults: UserProfile[];
  contacts: UserProfile[];
  contactsLoading: boolean;
  sessions: UserSessionInfo[];
  sessionsLoading: boolean;
  currentSessionId: string;
  activeChat: ChatSummary | null;
  activeConference: VideoConference | null;
  groupInviteLinkUrl: string | null;
  groupInviteLinkVisible: boolean;
  groupContacts: UserProfile[];
  selectedGroupContacts: UserProfile[];
  isGroupCreatePickerOpen: boolean;
  groupParticipantUsernames: string[];
  availableGroupInviteContacts: UserProfile[];
  selectedGroupInviteContacts: UserProfile[];
  isGroupInvitePickerOpen: boolean;
  groupInviteUsernames: string[];
  availableConferenceInviteContacts: UserProfile[];
  conferenceInviteUsernames: string[];
  createGroupPending: boolean;
  groupInviteLinkPending: boolean;
  addGroupParticipantsPending: boolean;
  addConferenceParticipantsPending: boolean;
  updateGroupPending: boolean;
  createChatPending: boolean;
  updateProfilePending: boolean;
  changePasswordPending: boolean;
  avatarPending: boolean;
  deleteAccountPending: boolean;
  revokeSessionPending: boolean;
  contactSearchFetching: boolean;
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
  onRemoveAvatar: () => void;
  onAvatarSelected: (file: File) => void;
  onGroupTitleChange: (value: string) => void;
  onGroupDetailsTitleChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onRemoveGroupAvatar: () => void;
  onToggleGroupCreatePicker: () => void;
  onToggleGroupParticipant: (username: string) => void;
  onSubmitCreateGroup: () => void;
  onSubmitUpdateGroup: () => void;
  onOpenGroupMembers: (options?: GroupMembersOptions) => void;
  onToggleGroupInvitePicker: () => void;
  onToggleGroupInviteParticipant: (username: string) => void;
  onSubmitAddGroupParticipants: () => void;
  onGenerateGroupInviteLink: () => void;
  onCopyGroupInviteLink: (value: string) => void;
  onToggleConferenceInviteParticipant: (username: string) => void;
  onSubmitAddConferenceParticipants: () => void;
  onContactSearchChange: (value: string) => void;
  onAddContact: (user: UserProfile) => void;
  onRemoveContact: (username: string) => void;
  onCreateChat: (username: string) => void;
  onRevokeSession: (sessionId: string) => void;
  formatProfileDate: (value: string) => string;
  formatSessionTime: (value: string) => string;
};

export function SidebarManagementSheets({
  sheet,
  profile,
  sessionUser,
  profileDisplayName,
  profileProfession,
  passwordChangeCurrent,
  passwordChangeNext,
  passwordChangeConfirm,
  deleteAccountConfirmation,
  deleteAccountRequiresMatch,
  groupTitle,
  groupDetailsTitle,
  groupDetailsAvatarUrl,
  contactSearch,
  showContactSearchResults,
  contactSearchResults,
  contacts,
  contactsLoading,
  sessions,
  sessionsLoading,
  currentSessionId,
  activeChat,
  activeConference,
  groupInviteLinkUrl,
  groupInviteLinkVisible,
  groupContacts,
  selectedGroupContacts,
  isGroupCreatePickerOpen,
  groupParticipantUsernames,
  availableGroupInviteContacts,
  selectedGroupInviteContacts,
  isGroupInvitePickerOpen,
  groupInviteUsernames,
  availableConferenceInviteContacts,
  conferenceInviteUsernames,
  createGroupPending,
  groupInviteLinkPending,
  addGroupParticipantsPending,
  addConferenceParticipantsPending,
  updateGroupPending,
  createChatPending,
  updateProfilePending,
  changePasswordPending,
  avatarPending,
  deleteAccountPending,
  revokeSessionPending,
  contactSearchFetching,
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
  onRemoveAvatar,
  onAvatarSelected,
  onGroupTitleChange,
  onGroupDetailsTitleChange,
  onGroupAvatarSelected,
  onRemoveGroupAvatar,
  onToggleGroupCreatePicker,
  onToggleGroupParticipant,
  onSubmitCreateGroup,
  onSubmitUpdateGroup,
  onOpenGroupMembers,
  onToggleGroupInvitePicker,
  onToggleGroupInviteParticipant,
  onSubmitAddGroupParticipants,
  onGenerateGroupInviteLink,
  onCopyGroupInviteLink,
  onToggleConferenceInviteParticipant,
  onSubmitAddConferenceParticipants,
  onContactSearchChange,
  onAddContact,
  onRemoveContact,
  onCreateChat,
  onRevokeSession,
  formatProfileDate,
  formatSessionTime,
}: Props) {
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (sheet === "profile") {
      return;
    }

    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
  }, [sheet]);

  if (!sheet) {
    return null;
  }

  if (sheet === "profile") {
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
              {displayedProfileProfession ? <em>{displayedProfileProfession}</em> : null}
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

            <span className="profile-label">Профессия</span>
            <input
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder="Например: продуктовый менеджер"
              maxLength={80}
            />
          </form>

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
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || !passwordChangeReady}
                >
                  {changePasswordPending ? "Меняем пароль..." : "Обновить пароль"}
                </button>
              </form>
            ) : null}
          </div>

          <div className="profile-line">
            <span className="profile-label">Создан</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
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
                Удалить аккаунт
              </button>
            </div>

            {isDeleteConfirmOpen ? (
              <div className="profile-delete-confirm">
                <p>
                  Введите username <strong>{profile.username}</strong>, чтобы подтвердить удаление
                  аккаунта.
                </p>
                <input
                  value={deleteAccountConfirmation}
                  onChange={(event) => onDeleteAccountConfirmationChange(event.target.value)}
                  placeholder={profile.username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="secondary-button danger-button"
                  disabled={deleteAccountPending || !deleteAccountRequiresMatch}
                  onClick={onDeleteAccount}
                >
                  {deleteAccountPending ? "Удаляем аккаунт..." : "Подтвердить удаление"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (false) {
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
            <p className="sheet-copy">Информация о текущем аккаунте.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="sheet-list profile-sheet">
          <div className="profile-avatar-card">
            <AvatarCircle
              className="menu-profile-avatar profile-sheet-avatar"
              name={profile.displayName}
              avatarUrl={profile.avatarUrl}
              online={profile.online}
            />
            <div className="profile-avatar-copy">
              <strong>{profile.displayName}</strong>
              <span>@{profile.username}</span>
            </div>
            <p className="profile-avatar-hint">
              Вставь изображение из буфера обмена через Ctrl+V, когда открыт профиль.
            </p>
            <div className="profile-avatar-actions">
              {profile.avatarUrl ? (
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled={avatarPending}
                  onClick={onRemoveAvatar}
                >
                  Убрать фото
                </button>
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
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder="Новое имя"
              maxLength={40}
            />
            <span className="profile-label">Профессия</span>
            <input
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder="Например: продуктовый менеджер"
              maxLength={80}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={
                updateProfilePending ||
                normalizedProfileDisplayName.length < 2 ||
                !profileChanged
              }
            >
              {updateProfilePending ? "Сохраняем..." : "Сохранить профиль"}
            </button>
          </form>
          <form
            className="profile-line profile-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitPasswordChange();
            }}
          >
            <span className="profile-label">{"\u0421\u043c\u0435\u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u044f"}</span>
            <p className="profile-avatar-hint">
              {"\u041c\u0438\u043d\u0438\u043c\u0443\u043c 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432. \u0418\u0437\u0431\u0435\u0433\u0430\u0439\u0442\u0435 \u043f\u0440\u043e\u0441\u0442\u044b\u0445 \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432 \u0438 \u0447\u0430\u0441\u0442\u044b\u0445 \u043f\u0430\u0440\u043e\u043b\u0435\u0439."}
            </p>
            <input
              value={passwordChangeCurrent}
              onChange={(event) => onPasswordChangeCurrentChange(event.target.value)}
              placeholder={"\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"}
              type="password"
              autoComplete="current-password"
            />
            <input
              value={passwordChangeNext}
              onChange={(event) => onPasswordChangeNextChange(event.target.value)}
              placeholder={"\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"}
              type="password"
              autoComplete="new-password"
            />
            <input
              value={passwordChangeConfirm}
              onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
              placeholder={"\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c"}
              type="password"
              autoComplete="new-password"
            />
            {!passwordChangeMatches && passwordChangeConfirm.length > 0 ? (
              <div className="form-error">{"\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442."}</div>
            ) : null}
            <button
              type="submit"
              className="secondary-button"
              disabled={changePasswordPending || !passwordChangeReady}
            >
              {changePasswordPending
                ? "\u041c\u0435\u043d\u044f\u0435\u043c \u043f\u0430\u0440\u043e\u043b\u044c..."
                : "\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c"}
            </button>
          </form>
          <div className="profile-line">
            <span className="profile-label">Username</span>
            <strong>@{profile.username}</strong>
          </div>
          {profile.profession ? (
            <div className="profile-line">
              <span className="profile-label">Профессия</span>
              <strong>{profile.profession}</strong>
            </div>
          ) : null}
          <div className="profile-line">
            <span className="profile-label">ID аккаунта</span>
            <span>{profile.id}</span>
          </div>
          <div className="profile-line">
            <span className="profile-label">Создан</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
          </div>
          <div className="profile-danger-card">
            <div className="profile-danger-copy">
              <span className="profile-label">Удаление аккаунта</span>
              <strong>Это действие необратимо.</strong>
              <p>
                Все сессии будут завершены, а профиль и связанные данные будут удалены.
                Введите @{profile.username}, чтобы подтвердить операцию.
              </p>
            </div>
            <input
              value={deleteAccountConfirmation}
              onChange={(event) => onDeleteAccountConfirmationChange(event.target.value)}
              placeholder={`@${profile.username}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="secondary-button danger-button"
              disabled={deleteAccountPending || !deleteAccountRequiresMatch}
              onClick={onDeleteAccount}
            >
              {deleteAccountPending ? "Удаляем аккаунт..." : "Удалить аккаунт"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sheet === "group") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Группы</div>
            <p className="sheet-copy">Создайте новую группу и добавляйте участников по кнопке.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form
          className="sheet-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitCreateGroup();
          }}
        >
          <input
            value={groupTitle}
            onChange={(event) => onGroupTitleChange(event.target.value)}
            placeholder="Название группы"
          />
          <div className="sheet-section">
            <button type="button" className="ghost-button" onClick={onToggleGroupCreatePicker}>
              {isGroupCreatePickerOpen ? "Скрыть список контактов" : "Добавить участника"}
            </button>
            {selectedGroupContacts.length > 0 ? (
              <div className="sheet-chip-list">
                {selectedGroupContacts.map((contact) => (
                  <span key={contact.username} className="sheet-chip">
                    {contact.displayName}
                  </span>
                ))}
              </div>
            ) : null}
            {isGroupCreatePickerOpen ? (
              <div className="group-picker-list">
                {contactsLoading ? (
                  <div className="empty-list">Загружаем контакты...</div>
                ) : groupContacts.length === 0 ? (
                  <div className="empty-list">
                    Добавь сначала контакты, чтобы собрать группу.
                  </div>
                ) : (
                  groupContacts.map((contact) => {
                    const selected = groupParticipantUsernames.includes(contact.username);
                    return (
                      <button
                        type="button"
                        key={contact.username}
                        className={
                          selected
                            ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                            : "sheet-row sheet-row-with-avatar group-picker-row"
                        }
                        onClick={() => onToggleGroupParticipant(contact.username)}
                      >
                        <AvatarCircle
                          className="menu-row-avatar sheet-contact-avatar"
                          name={contact.displayName}
                          avatarUrl={contact.avatarUrl}
                          online={contact.online}
                        />
                        <div className="sheet-row-copy">
                          <strong>{contact.displayName}</strong>
                          <span>@{contact.username}</span>
                        </div>
                        <span className="member-pill">{selected ? "Выбран" : "Выбрать"}</span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            className="secondary-button"
            disabled={createGroupPending || !groupTitle.trim()}
          >
            {createGroupPending ? "Создаем..." : "Создать"}
          </button>
        </form>
      </div>
    );
  }

  if (sheet === "groupInfo" && activeChat && !activeChat.direct) {
    const normalizedGroupTitle = groupDetailsTitle.trim();
    const groupDetailsChanged =
      normalizedGroupTitle !== activeChat.title ||
      (groupDetailsAvatarUrl ?? null) !== (activeChat.avatarUrl ?? null);

    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Инфо</div>
            <p className="sheet-copy">Информация о группе и управление участниками.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="profile-avatar-card">
          <AvatarCircle
            className="profile-sheet-avatar"
            name={normalizedGroupTitle || activeChat.title}
            avatarUrl={groupDetailsAvatarUrl}
            badge="GR"
            online={false}
          />
          <div className="profile-avatar-copy">
            <strong>{normalizedGroupTitle || activeChat.title}</strong>
            <span>{activeChat.members.length} участников</span>
          </div>
        </div>

        <div className="profile-line">
          <span className="profile-label">Аватар группы</span>
          <p className="profile-avatar-hint">
            Смени название и аватар группы, затем сохрани изменения.
          </p>
          <div className="profile-avatar-actions">
            <label htmlFor="group-avatar-input" className="ghost-button compact">
              Выбрать фото
            </label>
            <input
              id="group-avatar-input"
              type="file"
              accept="image/*"
              className="profile-avatar-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onGroupAvatarSelected(file);
                }
                event.currentTarget.value = "";
              }}
            />
            {groupDetailsAvatarUrl ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={onRemoveGroupAvatar}
              >
                Убрать фото
              </button>
            ) : null}
          </div>
        </div>

        <form
          className="profile-line profile-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitUpdateGroup();
          }}
        >
          <span className="profile-label">Название группы</span>
          <input
            value={groupDetailsTitle}
            onChange={(event) => onGroupDetailsTitleChange(event.target.value)}
            placeholder="Название группы"
            maxLength={120}
          />
          <button
            type="submit"
            className="secondary-button"
            disabled={updateGroupPending || normalizedGroupTitle.length < 2 || !groupDetailsChanged}
          >
            {updateGroupPending ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </form>

        <div className="sheet-actions-stack">
          <button
            type="button"
            className="sheet-row sheet-row-button"
            onClick={() => onOpenGroupMembers()}
          >
            <div className="sheet-row-copy">
              <strong>Участники</strong>
              <span>Открыть список участников группы.</span>
            </div>
            <span className="member-pill">{activeChat.members.length}</span>
          </button>
          <button
            type="button"
            className="sheet-row sheet-row-button"
            onClick={() => onOpenGroupMembers({ openInvitePicker: true })}
          >
            <div className="sheet-row-copy">
              <strong>Добавить из контактов</strong>
              <span>
                {availableGroupInviteContacts.length > 0
                  ? "Выбери людей из контактов и добавь их в группу."
                  : "Все контакты уже добавлены в эту группу."}
              </span>
            </div>
            <span className="member-pill">
              {availableGroupInviteContacts.length > 0 ? "Добавить" : "Готово"}
            </span>
          </button>
        </div>

        {groupInviteLinkVisible ? (
          <div className="invite-link-panel">
          <div className="invite-link-copy">
            <strong>Ссылка-приглашение</strong>
            <span>Открывает группу и сразу добавляет пользователя по короткому адресу.</span>
          </div>
          {groupInviteLinkUrl ? (
            <div className="invite-link-row">
              <input
                className="invite-link-input"
                readOnly
                value={groupInviteLinkUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className="ghost-button compact"
                onClick={() => onCopyGroupInviteLink(groupInviteLinkUrl)}
              >
                Копировать
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            disabled={groupInviteLinkPending}
            onClick={onGenerateGroupInviteLink}
          >
            {groupInviteLinkPending
              ? "Генерируем ссылку..."
              : groupInviteLinkUrl
                ? "Обновить ссылку"
                : "Сгенерировать ссылку"}
          </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (sheet === "groupMembers" && activeChat && !activeChat.direct) {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Участники группы</div>
            <p className="sheet-copy">
              Посмотри кто уже в {activeChat.title} и добавь новых людей из контактов.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form
          className="sheet-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAddGroupParticipants();
          }}
        >
          <div className="sheet-section">
            <div className="section-title">В этой группе</div>
            <div className="sheet-list">
              {activeChat.members.map((member) => {
                const current = member.id === sessionUser.id;
                return (
                  <div key={member.id} className="sheet-row sheet-row-with-avatar">
                    <AvatarCircle
                      className="menu-row-avatar sheet-contact-avatar"
                      name={member.displayName}
                      avatarUrl={member.avatarUrl}
                      online={member.online}
                    />
                    <div className="sheet-row-copy">
                      <strong>{member.displayName}{current ? " (Вы)" : ""}</strong>
                      <span>@{member.username}</span>
                    </div>
                    <div className="sheet-row-actions">
                      {!current ? (
                        <button
                          type="button"
                          className="ghost-button compact"
                          disabled={createChatPending}
                          onClick={() => onCreateChat(member.username)}
                        >
                          {"\u0427\u0430\u0442"}
                        </button>
                      ) : null}
                      <span className="member-pill">{current ? "Вы" : "В группе"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sheet-section">
            <button type="button" className="ghost-button" onClick={onToggleGroupInvitePicker}>
              {isGroupInvitePickerOpen ? "Скрыть список контактов" : "Добавить участника"}
            </button>
            {selectedGroupInviteContacts.length > 0 ? (
              <div className="sheet-chip-list">
                {selectedGroupInviteContacts.map((contact) => (
                  <span key={contact.username} className="sheet-chip">
                    {contact.displayName}
                  </span>
                ))}
              </div>
            ) : null}
            {isGroupInvitePickerOpen ? (
              <>
                <div className="group-picker-list">
                  {availableGroupInviteContacts.length === 0 ? (
                    <div className="empty-list">
                      Все контакты уже в этой группе или список пуст.
                    </div>
                  ) : (
                    availableGroupInviteContacts.map((contact) => {
                      const selected = groupInviteUsernames.includes(contact.username);
                      return (
                        <button
                          type="button"
                          key={contact.username}
                          className={
                            selected
                              ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                              : "sheet-row sheet-row-with-avatar group-picker-row"
                          }
                          onClick={() => onToggleGroupInviteParticipant(contact.username)}
                        >
                          <AvatarCircle
                            className="menu-row-avatar sheet-contact-avatar"
                            name={contact.displayName}
                            avatarUrl={contact.avatarUrl}
                            online={contact.online}
                          />
                          <div className="sheet-row-copy">
                            <strong>{contact.displayName}</strong>
                            <span>@{contact.username}</span>
                          </div>
                          <span className="member-pill">{selected ? "Выбран" : "Выбрать"}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={addGroupParticipantsPending || !groupInviteUsernames.length}
                >
                  {addGroupParticipantsPending ? "Добавляем..." : "Добавить в группу"}
                </button>
              </>
            ) : null}
          </div>
        </form>
      </div>
    );
  }

  if (sheet === "conferenceMembers") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Добавить в конференцию</div>
            <p className="sheet-copy">
              Выбери людей из контактов для {activeConference?.title ?? "встречи"}.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form
          className="sheet-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAddConferenceParticipants();
          }}
        >
          <div className="group-picker-list">
            {availableConferenceInviteContacts.length === 0 ? (
              <div className="empty-list">
                Все контакты уже приглашены в конференцию или список пуст.
              </div>
            ) : (
              availableConferenceInviteContacts.map((contact) => {
                const selected = conferenceInviteUsernames.includes(contact.username);
                return (
                  <button
                    type="button"
                    key={contact.username}
                    className={
                      selected
                        ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                        : "sheet-row sheet-row-with-avatar group-picker-row"
                    }
                    onClick={() => onToggleConferenceInviteParticipant(contact.username)}
                  >
                    <AvatarCircle
                      className="menu-row-avatar sheet-contact-avatar"
                      name={contact.displayName}
                      avatarUrl={contact.avatarUrl}
                      online={contact.online}
                    />
                    <div className="sheet-row-copy">
                      <strong>{contact.displayName}</strong>
                      <span>@{contact.username}</span>
                    </div>
                    <span className="member-pill">{selected ? "Выбран" : "Выбрать"}</span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="submit"
            className="secondary-button"
            disabled={addConferenceParticipantsPending || !conferenceInviteUsernames.length}
          >
            {addConferenceParticipantsPending ? "Добавляем..." : "Добавить в конференцию"}
          </button>
        </form>
      </div>
    );
  }

  if (sheet === "contacts") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Контакты</div>
            <p className="sheet-copy">Добавляй контакты и открывай с ними личные чаты.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="sheet-form contact-search-form">
          <div className="contact-search-shell">
            <input
              value={contactSearch}
              onChange={(event) => onContactSearchChange(event.target.value)}
              placeholder="Username или display name"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {showContactSearchResults ? (
              <div className="search-dropdown contact-search-dropdown">
                {contactSearchFetching ? (
                  <div className="search-result-empty">Ищем пользователей...</div>
                ) : contactSearchResults.length === 0 ? (
                  <div className="search-result-empty">Пользователи не найдены.</div>
                ) : (
                  contactSearchResults.map((user) => (
                    <div key={user.id} className="search-result-row with-action">
                      <AvatarCircle
                        className="menu-row-avatar"
                        name={user.displayName}
                        avatarUrl={user.avatarUrl}
                        online={user.online}
                      />
                      <div className="search-result-copy">
                        <strong>{user.displayName}</strong>
                        <span>@{user.username}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => onAddContact(user)}
                      >
                        Добавить
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="sheet-list">
          {contactsLoading ? (
            <div className="empty-list">Загружаем контакты...</div>
          ) : contacts.length === 0 ? (
            <div className="empty-list">Контактов пока нет.</div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.username} className="sheet-row sheet-row-with-avatar">
                <AvatarCircle
                  className="menu-row-avatar sheet-contact-avatar"
                  name={contact.displayName}
                  avatarUrl={contact.avatarUrl}
                  online={contact.online}
                />
                <div className="sheet-row-copy">
                  <strong>{contact.displayName}</strong>
                  <span>@{contact.username}</span>
                </div>
                <div className="sheet-row-actions">
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={createChatPending}
                    onClick={() => onCreateChat(contact.username)}
                  >
                    Чат
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => onRemoveContact(contact.username)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (sheet === "sessions") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Активные устройства</div>
            <p className="sheet-copy">Сессии и устройство, с которого выполнен вход.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="session-list menu-session-list">
          {sessionsLoading ? (
            <div className="empty-list">Загружаем список устройств...</div>
          ) : sessions.length === 0 ? (
            <div className="empty-list">Активна только текущая сессия.</div>
          ) : (
            sessions.map((item) => {
              const current = item.id === currentSessionId;
              return (
                <div key={item.id} className="session-row">
                  <div className="session-copy">
                    <strong>{item.deviceName}</strong>
                    <span>Последняя активность: {formatSessionTime(item.lastUsedAt)}</span>
                    <span>Истекает: {formatSessionTime(item.expiresAt)}</span>
                  </div>
                  {current ? (
                    <span className="member-pill">Текущее</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button compact"
                      disabled={revokeSessionPending}
                      onClick={() => onRevokeSession(item.id)}
                    >
                      Отключить
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return null;
}
