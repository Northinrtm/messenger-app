import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
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
  pushNotificationsSupported: boolean;
  pushNotificationsServerEnabled: boolean;
  pushNotificationsEnabled: boolean;
  pushNotificationsPermission: PushNotificationPermission;
  pushNotificationsPending: boolean;
  pushNotificationsInfo: string | null;
  pushNotificationsError: string | null;
  mailServerEnabled: boolean;
  revokeSessionPending: boolean;
  contactSearchFetching: boolean;
  onClose: () => void;
  onProfileDisplayNameChange: (value: string) => void;
  onProfileProfessionChange: (value: string) => void;
  onSubmitProfileDisplayName: (mailEnabled?: boolean) => void;
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
  mailServerEnabled,
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
  const { t, tp } = useI18n();
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
        mailServerEnabled={mailServerEnabled}
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
        changePasswordSuccess={changePasswordSuccess}
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
        usernameChangePending={usernameChangePending}
        usernameChangeInfo={usernameChangeInfo}
        usernameChangeError={usernameChangeError}
        usernameChangeInput={usernameChangeInput}
        onUsernameChangeInputChange={onUsernameChangeInputChange}
        onSubmitUsernameChange={onSubmitUsernameChange}
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
            <div className="section-title">{t("settings.title")}</div>
            <p className="sheet-copy">{t("sheet.accountSettings")}</p>
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
                {avatarPending ? t("chat.loadingShort") : t("settings.avatar.change")}
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
            <span className="profile-label">{t("settings.name.label")}</span>
            <div className="profile-inline-row">
              <input
                value={profileDisplayName}
                onChange={(event) => onProfileDisplayNameChange(event.target.value)}
                placeholder={t("settings.name.placeholder")}
                maxLength={40}
              />
              {profileChanged ? (
                <button
                  type="submit"
                  className="ghost-button compact profile-inline-save"
                  disabled={updateProfilePending || normalizedProfileDisplayName.length < 2}
                >
                  {updateProfilePending ? t("common.saving") : t("common.save")}
                </button>
              ) : null}
            </div>

            <span className="profile-label">{t("sheet.profession")}</span>
            <input
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder={t("sheet.professionPlaceholder")}
              maxLength={80}
            />
          </form>

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
                <input
                  value={passwordChangeCurrent}
                  onChange={(event) => onPasswordChangeCurrentChange(event.target.value)}
                  placeholder={t("settings.password.current")}
                  type="password"
                  autoComplete="current-password"
                />
                <input
                  value={passwordChangeNext}
                  onChange={(event) => onPasswordChangeNextChange(event.target.value)}
                  placeholder={t("settings.password.next")}
                  type="password"
                  autoComplete="new-password"
                />
                <input
                  value={passwordChangeConfirm}
                  onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
                  placeholder={t("settings.password.confirm")}
                  type="password"
                  autoComplete="new-password"
                />
                {!passwordChangeMatches && passwordChangeConfirm.length > 0 ? (
                  <div className="form-error">{t("auth.validation.passwordMismatch")}</div>
                ) : null}
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || !passwordChangeReady}
                >
                  {changePasswordPending ? t("settings.password.changing") : t("sheet.updatePassword")}
                </button>
              </form>
            ) : null}
          </div>

          <div className="profile-line">
            <span className="profile-label">{t("sheet.created")}</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
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
                {t("settings.account.deleteButton")}
              </button>
            </div>

            {isDeleteConfirmOpen ? (
              <div className="profile-delete-confirm">
                <p>
                  {t("sheet.deleteConfirmPrefix")}<strong>{profile.username}</strong>{t("sheet.deleteConfirmSuffix")}
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
                  {deleteAccountPending ? t("settings.account.deleting") : t("settings.account.confirmDelete")}
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
            <div className="section-title">{t("menu.groups")}</div>
            <p className="sheet-copy">{t("sheet.groupsDesc")}</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
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
            placeholder={t("sheet.groupNamePlaceholder")}
          />
          <div className="sheet-section">
            <button type="button" className="ghost-button" onClick={onToggleGroupCreatePicker}>
              {isGroupCreatePickerOpen ? t("sheet.hideContactList") : t("sheet.addParticipant")}
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
                  <div className="empty-list">{t("sheet.loadingContacts")}</div>
                ) : groupContacts.length === 0 ? (
                  <div className="empty-list">
                    {t("sheet.addContactsFirst")}
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
                        <span className="member-pill">{selected ? t("sheet.selected") : t("sheet.select")}</span>
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
            {createGroupPending ? t("sheet.creating") : t("sheet.create")}
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
            <div className="section-title">{t("sheet.group")}</div>
            <p className="sheet-copy">{t("sheet.groupInfoDesc")}</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
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
            <span>{tp("members.count", activeChat.members.length)}</span>
          </div>
        </div>

        {groupCapabilities.canEditGroup ? (
          <>
            <div className="profile-line">
              <span className="profile-label">{t("sheet.groupAvatar")}</span>
              <p className="profile-avatar-hint">{t("sheet.groupAvatarDesc")}</p>
              <div className="profile-avatar-actions">
                <label htmlFor="group-avatar-input" className="ghost-button compact">
                  {t("sheet.chooseProfilePhoto")}
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
                    {t("sheet.removePhoto")}
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
              <span className="profile-label">{t("sheet.groupNamePlaceholder")}</span>
              <input
                value={groupDetailsTitle}
                onChange={(event) => onGroupDetailsTitleChange(event.target.value)}
                placeholder={t("sheet.groupNamePlaceholder")}
                maxLength={120}
              />
              <button
                type="submit"
                className="secondary-button"
                disabled={updateGroupPending || normalizedGroupTitle.length < 2 || !groupDetailsChanged}
              >
                {updateGroupPending ? t("common.saving") : t("common.save")}
              </button>
              <div className="profile-line group-history-setting">
                <div className="group-history-setting-row">
                  <div className="group-history-setting-copy">
                    <strong>{t("sheet.allowHistory")}</strong>
                    <span>
                      {isFullHistoryEnabled
                        ? t("sheet.historyFull")
                        : t("sheet.historyAfterJoin")}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFullHistoryEnabled}
                    aria-label={t("sheet.allowHistory")}
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
              <strong>{t("conf.participants")}</strong>
              <span>{t("sheet.openMembersList")}</span>
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
                <strong>{t("sheet.addFromContacts")}</strong>
                <span>
                  {availableGroupInviteContacts.length > 0
                    ? t("sheet.pickFromContacts")
                    : t("sheet.allContactsAdded")}
                </span>
              </div>
              <span className="member-pill">
                {availableGroupInviteContacts.length > 0 ? t("sheet.add") : t("sheet.done")}
              </span>
            </button>
          ) : null}
        </div>

        {groupCapabilities.canManageInviteLink ? (
          <div className="invite-link-panel">
          <div className="invite-link-copy">
            <strong>{t("sheet.inviteLink")}</strong>
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
                {t("conf.copy")}
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
              ? t("conf.generatingLink")
              : groupInviteLinkUrl
                ? t("conf.refreshLink")
                : t("conf.generateLink")}
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
            <div className="section-title">{t("sheet.groupMembers")}</div>
            <p className="sheet-copy">{t("sheet.groupMembersDesc", { title: activeChat.title })}</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
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
            <div className="section-title">{t("sheet.inThisGroup")}</div>
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
                      <strong>{member.displayName}{current ? t("sheet.youSuffix") : ""}</strong>
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
                          {t("sheet.chat")}
                        </button>
                      ) : null}
                      <span className="member-pill">{current ? t("chat.you") : t("sheet.inGroup")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sheet-section">
            {groupCapabilities.canAddMembers ? (
              <button type="button" className="ghost-button" onClick={onToggleGroupInvitePicker}>
                {isGroupInvitePickerOpen ? t("sheet.hideContactList") : t("sheet.addParticipant")}
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
                      {t("sheet.allContactsInGroupOrEmpty")}
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
                          <span className="member-pill">{selected ? t("sheet.selected") : t("sheet.select")}</span>
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
                  {addGroupParticipantsPending ? t("sheet.adding") : t("sheet.addToGroup")}
                </button>
              </>
            ) : null}
          </div>
          {groupCapabilities.canModerateMembers ? (
            <div className="sheet-section">
              <div className="section-title">{t("sheet.bannedMembers")}</div>
              {groupBansLoading ? (
                <div className="empty-list">{t("sheet.loadingBans")}</div>
              ) : bannedGroupParticipants.length === 0 ? (
                <div className="empty-list">{t("sheet.bansEmpty")}</div>
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
                          {t("sheet.unban")}
                        </button>
                        <span className="member-pill">{t("sheet.banned")}</span>
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
            <div className="section-title">{t("sheet.addToConference")}</div>
            <p className="sheet-copy">
              {t("sheet.addToConferenceDesc", {
                title: activeConference?.title ?? t("sheet.meetingFallback"),
              })}
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
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
                {t("sheet.allContactsInvitedOrEmpty")}
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
                    <span className="member-pill">{selected ? t("sheet.selected") : t("sheet.select")}</span>
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
            {addConferenceParticipantsPending ? t("sheet.adding") : t("sheet.addToConference")}
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
            <div className="section-title">{t("menu.contacts")}</div>
            <p className="sheet-copy">{t("sheet.contactsDesc")}</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
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
              placeholder={t("sheet.usernameOrDisplayName")}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {showContactSearchResults && isContactSearchFocused ? (
              <div className="search-dropdown contact-search-dropdown">
                {contactSearchFetching ? (
                  <div className="search-result-empty">{t("sidebar.searchLoading")}</div>
                ) : contactSearchResults.length === 0 ? (
                  <div className="search-result-empty">{t("sheet.usersNotFound")}</div>
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
                        {t("sheet.add")}
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
            <div className="empty-list">{t("sheet.loadingContacts")}</div>
          ) : contacts.length === 0 ? (
            <div className="empty-list">{t("sheet.noContacts")}</div>
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
                    {t("sheet.chat")}
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => onRemoveContact(contact.username)}
                  >
                    {t("sheet.delete")}
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
            <div className="section-title">{t("sheet.activeSessions")}</div>
            <p className="sheet-copy">{t("sheet.sessionsHeaderDesc")}</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <section className="sheet-section session-sheet-section">
          <div className="session-section-head">
            <strong>{t("sheet.loginSessions")}</strong>
            <span>{t("sheet.sessionsDesc")}</span>
          </div>
          <div className="session-list menu-session-list">
            {sessionsLoading ? (
              <div className="empty-list">{t("sheet.loadingSessions")}</div>
            ) : sessions.length === 0 ? (
              <div className="empty-list">{t("sheet.onlyCurrentSession")}</div>
            ) : (
              sessions.map((item) => {
                const current = item.id === currentSessionId;
                return (
                  <div key={item.id} className="session-row">
                    <div className="session-copy">
                      <strong>{item.deviceName}</strong>
                      <span>
                        {t("sheet.loggedIn")}{" "}
                        {formatSessionTime(item.createdAt)}
                      </span>
                      <span>
                        {t("sheet.lastActivity")}{" "}
                        {formatSessionTime(item.lastUsedAt)}
                      </span>
                      <span>
                        {t("sheet.expires")} {formatSessionTime(item.expiresAt)}
                      </span>
                    </div>
                    {current ? (
                      <span className="member-pill">{t("sheet.current")}</span>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button compact"
                        disabled={revokeSessionPending}
                        onClick={() => onRevokeSession(item.id)}
                      >
                        {t("sheet.disconnect")}
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
