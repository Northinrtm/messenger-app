import { useEffect, useState } from "react";
import type { PushNotificationPermission } from "../../../lib/pushNotifications";
import { useRef, type FocusEvent } from "react";
import type {
  UserProfile,
  UserSessionInfo,
  ChatPrejoinHistoryPolicy,
  ChatSummary,
  Participant,
  VideoConference,
} from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";
import { ProfileSettingsCard } from "./ProfileSettingsCard";

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
  groupDetailsPrejoinHistoryPolicy: ChatPrejoinHistoryPolicy;
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
  bannedGroupParticipants: Participant[];
  groupBansLoading: boolean;
  groupInviteLinkUrl: string | null;
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
  unbanGroupParticipantPending: boolean;
  createChatPending: boolean;
  updateProfilePending: boolean;
  changePasswordPending: boolean;
  changePasswordError: string | null;
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
  pushNotificationsSupported: boolean;
  pushNotificationsServerEnabled: boolean;
  pushNotificationsEnabled: boolean;
  pushNotificationsPermission: PushNotificationPermission;
  pushNotificationsPending: boolean;
  pushNotificationsInfo: string | null;
  pushNotificationsError: string | null;
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
  onResendEmailVerification: () => void;
  onEnablePushNotifications: () => void;
  onDisablePushNotifications: () => void;
  onSetMailEnabled: (value: boolean) => void;
  onGroupTitleChange: (value: string) => void;
  onGroupDetailsTitleChange: (value: string) => void;
  onGroupDetailsPrejoinHistoryPolicyChange: (value: ChatPrejoinHistoryPolicy) => void;
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
  onUnbanParticipant: (participant: Participant) => void;
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
  groupDetailsPrejoinHistoryPolicy,
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
  bannedGroupParticipants,
  groupBansLoading,
  groupInviteLinkUrl,
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
  unbanGroupParticipantPending,
  createChatPending,
  updateProfilePending,
  changePasswordPending,
  changePasswordError,
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
  pushNotificationsSupported,
  pushNotificationsServerEnabled,
  pushNotificationsEnabled,
  pushNotificationsPermission,
  pushNotificationsPending,
  pushNotificationsInfo,
  pushNotificationsError,
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
  onResendEmailVerification,
  onEnablePushNotifications,
  onDisablePushNotifications,
  onSetMailEnabled,
  onGroupTitleChange,
  onGroupDetailsTitleChange,
  onGroupDetailsPrejoinHistoryPolicyChange,
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
  onUnbanParticipant,
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
  const [isContactSearchFocused, setIsContactSearchFocused] = useState(false);
  const contactSearchShellRef = useRef<HTMLDivElement | null>(null);

  const handleContactSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && contactSearchShellRef.current?.contains(nextTarget)) {
      return;
    }

    setIsContactSearchFocused(false);
  };

  useEffect(() => {
    if (sheet === "profile") {
      return;
    }

    setIsPasswordFormOpen(false);
    setIsDeleteConfirmOpen(false);
    setIsContactSearchFocused(false);
  }, [sheet]);

  if (!sheet) {
    return null;
  }

  if (sheet === "profile") {
    return (
      <ProfileSettingsCard
        profile={profile}
        profileDisplayName={profileDisplayName}
        profileProfession={profileProfession}
        passwordChangeCurrent={passwordChangeCurrent}
        passwordChangeNext={passwordChangeNext}
        passwordChangeConfirm={passwordChangeConfirm}
        deleteAccountConfirmation={deleteAccountConfirmation}
        deleteAccountRequiresMatch={deleteAccountRequiresMatch}
        updateProfilePending={updateProfilePending}
        changePasswordPending={changePasswordPending}
        changePasswordError={changePasswordError}
        avatarPending={avatarPending}
        deleteAccountPending={deleteAccountPending}
        emailVerificationPending={emailVerificationPending}
        emailVerificationInfo={emailVerificationInfo}
        emailVerificationError={emailVerificationError}
        emailChangePending={emailChangePending}
        emailChangeInfo={emailChangeInfo}
        emailChangeError={emailChangeError}
        emailChangeInput={emailChangeInput}
        onEmailChangeInputChange={onEmailChangeInputChange}
        onRequestEmailChange={onRequestEmailChange}
        pushNotificationsSupported={pushNotificationsSupported}
        pushNotificationsServerEnabled={pushNotificationsServerEnabled}
        pushNotificationsEnabled={pushNotificationsEnabled}
        pushNotificationsPermission={pushNotificationsPermission}
        pushNotificationsPending={pushNotificationsPending}
        pushNotificationsInfo={pushNotificationsInfo}
        pushNotificationsError={pushNotificationsError}
        onClose={onClose}
        onProfileDisplayNameChange={onProfileDisplayNameChange}
        onProfileProfessionChange={onProfileProfessionChange}
        onSubmitProfileDisplayName={onSubmitProfileDisplayName}
        onPasswordChangeCurrentChange={onPasswordChangeCurrentChange}
        onPasswordChangeNextChange={onPasswordChangeNextChange}
        onPasswordChangeConfirmChange={onPasswordChangeConfirmChange}
        onSubmitPasswordChange={onSubmitPasswordChange}
        onDeleteAccountConfirmationChange={onDeleteAccountConfirmationChange}
        onDeleteAccount={onDeleteAccount}
        onAvatarSelected={onAvatarSelected}
        onResendEmailVerification={onResendEmailVerification}
        onEnablePushNotifications={onEnablePushNotifications}
        onDisablePushNotifications={onDisablePushNotifications}
        onSetMailEnabled={onSetMailEnabled}
      />
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
                  Введите username <strong>{profile.username}</strong>, чтобы подтвердить удаление аккаунта.
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

  if (sheet === "group") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Группы</div>
            <p className="sheet-copy">Создайте новую группу и добавляйте участников из контактов.</p>
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
                    Сначала добавьте контакты, чтобы собрать группу.
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
    const groupCapabilities = activeChat.capabilities;
    const normalizedGroupTitle = groupDetailsTitle.trim();
    const isFullHistoryEnabled = groupDetailsPrejoinHistoryPolicy === "FULL_HISTORY";
    const groupDetailsChanged =
      normalizedGroupTitle !== activeChat.title ||
      (groupDetailsAvatarUrl ?? null) !== (activeChat.avatarUrl ?? null);

    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Группа</div>
            <p className="sheet-copy">Информация о группе, история для новых участников и управление участниками.</p>
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

        {groupCapabilities.canEditGroup ? (
          <>
            <div className="profile-line">
              <span className="profile-label">Аватар группы</span>
              <p className="profile-avatar-hint">
                Измените название и аватар группы, затем сохраните изменения.
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
                {updateGroupPending ? "Сохраняем..." : "Сохранить"}
              </button>
              <div className="profile-line group-history-setting">
                <div className="group-history-setting-row">
                  <div className="group-history-setting-copy">
                    <strong>Разрешить новым участникам группы видеть старую историю сообщений</strong>
                    <span>
                      {isFullHistoryEnabled
                        ? "Новые участники увидят историю группы полностью."
                        : "Новые участники увидят только сообщения после вступления в группу."}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFullHistoryEnabled}
                    aria-label="Разрешить новым участникам группы видеть старую историю сообщений"
                    className={isFullHistoryEnabled ? "group-history-switch is-on" : "group-history-switch"}
                    disabled={updateGroupPending || !groupCapabilities.canTogglePrejoinHistory}
                    onClick={() =>
                      onGroupDetailsPrejoinHistoryPolicyChange(
                        isFullHistoryEnabled ? "JOIN_ONLY" : "FULL_HISTORY"
                      )
                    }
                  >
                    <span className="group-history-switch-thumb" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </form>
          </>
        ) : null}

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
          {groupCapabilities.canAddMembers ? (
            <button
              type="button"
              className="sheet-row sheet-row-button"
              onClick={() => onOpenGroupMembers({ openInvitePicker: true })}
            >
              <div className="sheet-row-copy">
                <strong>Добавить из контактов</strong>
                <span>
                  {availableGroupInviteContacts.length > 0
                    ? "Выберите людей из контактов и добавьте их в группу."
                    : "Все контакты уже добавлены в эту группу."}
                </span>
              </div>
              <span className="member-pill">
                {availableGroupInviteContacts.length > 0 ? "Добавить" : "Готово"}
              </span>
            </button>
          ) : null}
        </div>

        {groupCapabilities.canManageInviteLink ? (
          <div className="invite-link-panel">
          <div className="invite-link-copy">
            <strong>Ссылка-приглашение</strong>
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
    const groupCapabilities = activeChat.capabilities;
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Участники группы</div>
            <p className="sheet-copy">
              Посмотрите, кто уже состоит в {activeChat.title}, и добавьте новых людей из контактов.
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
            {groupCapabilities.canAddMembers ? (
              <button type="button" className="ghost-button" onClick={onToggleGroupInvitePicker}>
                {isGroupInvitePickerOpen ? "Скрыть список контактов" : "Добавить участника"}
              </button>
            ) : null}
            {selectedGroupInviteContacts.length > 0 ? (
              <div className="sheet-chip-list">
                {selectedGroupInviteContacts.map((contact) => (
                  <span key={contact.username} className="sheet-chip">
                    {contact.displayName}
                  </span>
                ))}
              </div>
            ) : null}
            {groupCapabilities.canAddMembers && isGroupInvitePickerOpen ? (
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
          {groupCapabilities.canModerateMembers ? (
            <div className="sheet-section">
              <div className="section-title">Заблокированные участники</div>
              {groupBansLoading ? (
                <div className="empty-list">Загружаем список банов...</div>
              ) : bannedGroupParticipants.length === 0 ? (
                <div className="empty-list">Список банов пуст.</div>
              ) : (
                <div className="sheet-list">
                  {bannedGroupParticipants.map((participant) => (
                    <div key={participant.id} className="sheet-row sheet-row-with-avatar">
                      <AvatarCircle
                        className="menu-row-avatar sheet-contact-avatar"
                        name={participant.displayName}
                        avatarUrl={participant.avatarUrl}
                        online={participant.online}
                      />
                      <div className="sheet-row-copy">
                        <strong>{participant.displayName}</strong>
                        <span>@{participant.username}</span>
                      </div>
                      <div className="sheet-row-actions">
                        <button
                          type="button"
                          className="ghost-button compact"
                          disabled={unbanGroupParticipantPending}
                          onClick={() => onUnbanParticipant(participant)}
                        >
                          Разбанить
                        </button>
                        <span className="member-pill">В бане</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
              Выберите людей из контактов для {activeConference?.title ?? "встречи"}.
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
            <p className="sheet-copy">Добавляйте контакты и открывайте с ними личные чаты.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="sheet-form contact-search-form">
          <div
            ref={contactSearchShellRef}
            className="contact-search-shell"
            onBlur={handleContactSearchBlur}
          >
            <input
              value={contactSearch}
              onChange={(event) => onContactSearchChange(event.target.value)}
              onFocus={() => setIsContactSearchFocused(true)}
              placeholder="Username или display name"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {showContactSearchResults && isContactSearchFocused ? (
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
            <div className="section-title">
              {"\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0435\u0441\u0441\u0438\u0438"}
            </div>
            <p className="sheet-copy">
              {
                "\u0417\u0434\u0435\u0441\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B auth-\u0441\u0435\u0441\u0441\u0438\u0438 \u0432\u0445\u043E\u0434\u0430, \u0430 \u043D\u0435 \u0443\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430. \u041E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0433\u043E \u0432\u0445\u043E\u0434\u0430, \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u0438\u043B\u0438 \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u0433\u043E \u043E\u043A\u043D\u0430."
              }
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {"\u0417\u0430\u043A\u0440\u044B\u0442\u044C"}
          </button>
        </div>

        <section className="sheet-section session-sheet-section">
          <div className="session-section-head">
            <strong>{"\u0421\u0435\u0441\u0441\u0438\u0438 \u0432\u0445\u043E\u0434\u0430"}</strong>
            <span>
              {
                "\u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0443\u044E auth-\u0441\u0435\u0441\u0441\u0438\u044E. \u0414\u0440\u0443\u0433\u0438\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0432\u0445\u043E\u0434\u044B \u043E\u0441\u0442\u0430\u043D\u0443\u0442\u0441\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B."
              }
            </span>
          </div>
          <div className="session-list menu-session-list">
            {sessionsLoading ? (
              <div className="empty-list">
                {"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0441\u0435\u0441\u0441\u0438\u0438..."}
              </div>
            ) : sessions.length === 0 ? (
              <div className="empty-list">
                {"\u0410\u043A\u0442\u0438\u0432\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u0435\u043A\u0443\u0449\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F."}
              </div>
            ) : (
              sessions.map((item) => {
                const current = item.id === currentSessionId;
                return (
                  <div key={item.id} className="session-row">
                    <div className="session-copy">
                      <strong>{item.deviceName}</strong>
                      <span>
                        {"\u0412\u0445\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D:"}{" "}
                        {formatSessionTime(item.createdAt)}
                      </span>
                      <span>
                        {"\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C:"}{" "}
                        {formatSessionTime(item.lastUsedAt)}
                      </span>
                      <span>
                        {"\u0418\u0441\u0442\u0435\u043A\u0430\u0435\u0442:"} {formatSessionTime(item.expiresAt)}
                      </span>
                    </div>
                    {current ? (
                      <span className="member-pill">{"\u0422\u0435\u043A\u0443\u0449\u0430\u044F"}</span>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button compact"
                        disabled={revokeSessionPending}
                        onClick={() => onRevokeSession(item.id)}
                      >
                        {"\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    );
  }

  return null;
}
