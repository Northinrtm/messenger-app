import { useEffect, useState } from "react";
import type { PushNotificationPermission } from "../../../lib/pushNotifications";
import type {
  UserEncryptionDevice,
  UserProfile,
  UserSessionInfo,
  ChatSummary,
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
  contactSearch: string;
  showContactSearchResults: boolean;
  contactSearchResults: UserProfile[];
  contacts: UserProfile[];
  contactsLoading: boolean;
  currentEncryptionDeviceId: string | null;
  encryptionDevices: UserEncryptionDevice[];
  encryptionDevicesLoading: boolean;
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
  revokeSessionPending: boolean;
  retireEncryptionDevicePending: boolean;
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
  onRetireEncryptionDevice: (deviceId: string) => void;
  onRevokeSession: (sessionId: string) => void;
  formatProfileDate: (value: string) => string;
  formatSessionTime: (value: string) => string;
};

function formatEncryptionDeviceCountLabel(count: number) {
  if (count === 1) {
    return "1 E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E";
  }

  return `${count} E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432`;
}

function isStaleEncryptionDevice(lastSeenAt: string) {
  const lastSeenAtTimestamp = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenAtTimestamp)) {
    return false;
  }

  return Date.now() - lastSeenAtTimestamp >= 30 * 24 * 60 * 60 * 1000;
}

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
  currentEncryptionDeviceId,
  encryptionDevices,
  encryptionDevicesLoading,
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
  revokeSessionPending,
  retireEncryptionDevicePending,
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
  onRetireEncryptionDevice,
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
        avatarPending={avatarPending}
        deleteAccountPending={deleteAccountPending}
        emailVerificationPending={emailVerificationPending}
        emailVerificationInfo={emailVerificationInfo}
        emailVerificationError={emailVerificationError}
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
            <div className="section-title">РњРѕР№ РїСЂРѕС„РёР»СЊ</div>
            <p className="sheet-copy">РќР°СЃС‚СЂРѕР№РєРё С‚РµРєСѓС‰РµРіРѕ Р°РєРєР°СѓРЅС‚Р°.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
                {avatarPending ? "Р—Р°РіСЂСѓР¶Р°РµРј..." : "РР·РјРµРЅРёС‚СЊ С„РѕС‚Рѕ"}
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
            <span className="profile-label">РРјСЏ</span>
            <div className="profile-inline-row">
              <input
                value={profileDisplayName}
                onChange={(event) => onProfileDisplayNameChange(event.target.value)}
                placeholder="Р’Р°С€Рµ РёРјСЏ"
                maxLength={40}
              />
              {profileChanged ? (
                <button
                  type="submit"
                  className="ghost-button compact profile-inline-save"
                  disabled={updateProfilePending || normalizedProfileDisplayName.length < 2}
                >
                  {updateProfilePending ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
                </button>
              ) : null}
            </div>

            <span className="profile-label">РџСЂРѕС„РµСЃСЃРёСЏ</span>
            <input
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder="РќР°РїСЂРёРјРµСЂ: РїСЂРѕРґСѓРєС‚РѕРІС‹Р№ РјРµРЅРµРґР¶РµСЂ"
              maxLength={80}
            />
          </form>

          <div className="profile-line profile-action-panel">
            <div className="profile-action-row">
              <div className="profile-action-copy">
                <span className="profile-label">Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ</span>
                <strong>РџР°СЂРѕР»СЊ</strong>
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
                {isPasswordFormOpen ? "РЎРєСЂС‹С‚СЊ" : "РЎРјРµРЅРёС‚СЊ РїР°СЂРѕР»СЊ"}
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
                  placeholder="РўРµРєСѓС‰РёР№ РїР°СЂРѕР»СЊ"
                  type="password"
                  autoComplete="current-password"
                />
                <input
                  value={passwordChangeNext}
                  onChange={(event) => onPasswordChangeNextChange(event.target.value)}
                  placeholder="РќРѕРІС‹Р№ РїР°СЂРѕР»СЊ"
                  type="password"
                  autoComplete="new-password"
                />
                <input
                  value={passwordChangeConfirm}
                  onChange={(event) => onPasswordChangeConfirmChange(event.target.value)}
                  placeholder="РџРѕРІС‚РѕСЂРёС‚Рµ РЅРѕРІС‹Р№ РїР°СЂРѕР»СЊ"
                  type="password"
                  autoComplete="new-password"
                />
                {!passwordChangeMatches && passwordChangeConfirm.length > 0 ? (
                  <div className="form-error">РџР°СЂРѕР»Рё РЅРµ СЃРѕРІРїР°РґР°СЋС‚.</div>
                ) : null}
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={changePasswordPending || !passwordChangeReady}
                >
                  {changePasswordPending ? "РњРµРЅСЏРµРј РїР°СЂРѕР»СЊ..." : "РћР±РЅРѕРІРёС‚СЊ РїР°СЂРѕР»СЊ"}
                </button>
              </form>
            ) : null}
          </div>

          <div className="profile-line">
            <span className="profile-label">РЎРѕР·РґР°РЅ</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
          </div>

          <div className="profile-line profile-action-panel profile-danger-panel">
            <div className="profile-action-row">
              <div className="profile-action-copy">
                <span className="profile-label">РђРєРєР°СѓРЅС‚</span>
                <strong>РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°</strong>
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
                РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚
              </button>
            </div>

            {isDeleteConfirmOpen ? (
              <div className="profile-delete-confirm">
                <p>
                  Р’РІРµРґРёС‚Рµ username <strong>{profile.username}</strong>, С‡С‚РѕР±С‹ РїРѕРґС‚РІРµСЂРґРёС‚СЊ СѓРґР°Р»РµРЅРёРµ
                  Р°РєРєР°СѓРЅС‚Р°.
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
                  {deleteAccountPending ? "РЈРґР°Р»СЏРµРј Р°РєРєР°СѓРЅС‚..." : "РџРѕРґС‚РІРµСЂРґРёС‚СЊ СѓРґР°Р»РµРЅРёРµ"}
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
            <div className="section-title">РњРѕР№ РїСЂРѕС„РёР»СЊ</div>
            <p className="sheet-copy">РРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РµРєСѓС‰РµРј Р°РєРєР°СѓРЅС‚Рµ.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
              Р’СЃС‚Р°РІСЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РёР· Р±СѓС„РµСЂР° РѕР±РјРµРЅР° С‡РµСЂРµР· Ctrl+V, РєРѕРіРґР° РѕС‚РєСЂС‹С‚ РїСЂРѕС„РёР»СЊ.
            </p>
            <div className="profile-avatar-actions">
              {profile.avatarUrl ? (
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled={avatarPending}
                  onClick={onRemoveAvatar}
                >
                  РЈР±СЂР°С‚СЊ С„РѕС‚Рѕ
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
            <span className="profile-label">РРјСЏ</span>
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder="РќРѕРІРѕРµ РёРјСЏ"
              maxLength={40}
            />
            <span className="profile-label">РџСЂРѕС„РµСЃСЃРёСЏ</span>
            <input
              value={profileProfession}
              onChange={(event) => onProfileProfessionChange(event.target.value)}
              placeholder="РќР°РїСЂРёРјРµСЂ: РїСЂРѕРґСѓРєС‚РѕРІС‹Р№ РјРµРЅРµРґР¶РµСЂ"
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
              {updateProfilePending ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ"}
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
              <span className="profile-label">РџСЂРѕС„РµСЃСЃРёСЏ</span>
              <strong>{profile.profession}</strong>
            </div>
          ) : null}
          <div className="profile-line">
            <span className="profile-label">ID Р°РєРєР°СѓРЅС‚Р°</span>
            <span>{profile.id}</span>
          </div>
          <div className="profile-line">
            <span className="profile-label">РЎРѕР·РґР°РЅ</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
          </div>
          <div className="profile-danger-card">
            <div className="profile-danger-copy">
              <span className="profile-label">РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°</span>
              <strong>Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµРѕР±СЂР°С‚РёРјРѕ.</strong>
              <p>
                Р’СЃРµ СЃРµСЃСЃРёРё Р±СѓРґСѓС‚ Р·Р°РІРµСЂС€РµРЅС‹, Р° РїСЂРѕС„РёР»СЊ Рё СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹.
                Р’РІРµРґРёС‚Рµ @{profile.username}, С‡С‚РѕР±С‹ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РѕРїРµСЂР°С†РёСЋ.
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
              {deleteAccountPending ? "РЈРґР°Р»СЏРµРј Р°РєРєР°СѓРЅС‚..." : "РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚"}
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
            <div className="section-title">Р“СЂСѓРїРїС‹</div>
            <p className="sheet-copy">РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІСѓСЋ РіСЂСѓРїРїСѓ Рё РґРѕР±Р°РІР»СЏР№С‚Рµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїРѕ РєРЅРѕРїРєРµ.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
            placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹"
          />
          <div className="sheet-section">
            <button type="button" className="ghost-button" onClick={onToggleGroupCreatePicker}>
              {isGroupCreatePickerOpen ? "РЎРєСЂС‹С‚СЊ СЃРїРёСЃРѕРє РєРѕРЅС‚Р°РєС‚РѕРІ" : "Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°"}
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
                  <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
                ) : groupContacts.length === 0 ? (
                  <div className="empty-list">
                    Р”РѕР±Р°РІСЊ СЃРЅР°С‡Р°Р»Р° РєРѕРЅС‚Р°РєС‚С‹, С‡С‚РѕР±С‹ СЃРѕР±СЂР°С‚СЊ РіСЂСѓРїРїСѓ.
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
                        <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
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
            {createGroupPending ? "РЎРѕР·РґР°РµРј..." : "РЎРѕР·РґР°С‚СЊ"}
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
            <div className="section-title">РРЅС„Рѕ</div>
            <p className="sheet-copy">РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РіСЂСѓРїРїРµ Рё СѓРїСЂР°РІР»РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєР°РјРё.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
            <span>{activeChat.members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ</span>
          </div>
        </div>

        <div className="profile-line">
          <span className="profile-label">РђРІР°С‚Р°СЂ РіСЂСѓРїРїС‹</span>
          <p className="profile-avatar-hint">
            РЎРјРµРЅРё РЅР°Р·РІР°РЅРёРµ Рё Р°РІР°С‚Р°СЂ РіСЂСѓРїРїС‹, Р·Р°С‚РµРј СЃРѕС…СЂР°РЅРё РёР·РјРµРЅРµРЅРёСЏ.
          </p>
          <div className="profile-avatar-actions">
            <label htmlFor="group-avatar-input" className="ghost-button compact">
              Р’С‹Р±СЂР°С‚СЊ С„РѕС‚Рѕ
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
                РЈР±СЂР°С‚СЊ С„РѕС‚Рѕ
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
          <span className="profile-label">РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹</span>
          <input
            value={groupDetailsTitle}
            onChange={(event) => onGroupDetailsTitleChange(event.target.value)}
            placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹"
            maxLength={120}
          />
          <button
            type="submit"
            className="secondary-button"
            disabled={updateGroupPending || normalizedGroupTitle.length < 2 || !groupDetailsChanged}
          >
            {updateGroupPending ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ"}
          </button>
        </form>

        <div className="sheet-actions-stack">
          <button
            type="button"
            className="sheet-row sheet-row-button"
            onClick={() => onOpenGroupMembers()}
          >
            <div className="sheet-row-copy">
              <strong>РЈС‡Р°СЃС‚РЅРёРєРё</strong>
              <span>РћС‚РєСЂС‹С‚СЊ СЃРїРёСЃРѕРє СѓС‡Р°СЃС‚РЅРёРєРѕРІ РіСЂСѓРїРїС‹.</span>
            </div>
            <span className="member-pill">{activeChat.members.length}</span>
          </button>
          <button
            type="button"
            className="sheet-row sheet-row-button"
            onClick={() => onOpenGroupMembers({ openInvitePicker: true })}
          >
            <div className="sheet-row-copy">
              <strong>Р”РѕР±Р°РІРёС‚СЊ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ</strong>
              <span>
                {availableGroupInviteContacts.length > 0
                  ? "Р’С‹Р±РµСЂРё Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ Рё РґРѕР±Р°РІСЊ РёС… РІ РіСЂСѓРїРїСѓ."
                  : "Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РґРѕР±Р°РІР»РµРЅС‹ РІ СЌС‚Сѓ РіСЂСѓРїРїСѓ."}
              </span>
            </div>
            <span className="member-pill">
              {availableGroupInviteContacts.length > 0 ? "Р”РѕР±Р°РІРёС‚СЊ" : "Р“РѕС‚РѕРІРѕ"}
            </span>
          </button>
        </div>

        {groupInviteLinkVisible ? (
          <div className="invite-link-panel">
          <div className="invite-link-copy">
            <strong>РЎСЃС‹Р»РєР°-РїСЂРёРіР»Р°С€РµРЅРёРµ</strong>
            <span>РћС‚РєСЂС‹РІР°РµС‚ РіСЂСѓРїРїСѓ Рё СЃСЂР°Р·Сѓ РґРѕР±Р°РІР»СЏРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ РєРѕСЂРѕС‚РєРѕРјСѓ Р°РґСЂРµСЃСѓ.</span>
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
                РљРѕРїРёСЂРѕРІР°С‚СЊ
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
              ? "Р“РµРЅРµСЂРёСЂСѓРµРј СЃСЃС‹Р»РєСѓ..."
              : groupInviteLinkUrl
                ? "РћР±РЅРѕРІРёС‚СЊ СЃСЃС‹Р»РєСѓ"
                : "РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ"}
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
            <div className="section-title">РЈС‡Р°СЃС‚РЅРёРєРё РіСЂСѓРїРїС‹</div>
            <p className="sheet-copy">
              РџРѕСЃРјРѕС‚СЂРё РєС‚Рѕ СѓР¶Рµ РІ {activeChat.title} Рё РґРѕР±Р°РІСЊ РЅРѕРІС‹С… Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
            <div className="section-title">Р’ СЌС‚РѕР№ РіСЂСѓРїРїРµ</div>
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
                      <strong>{member.displayName}{current ? " (Р’С‹)" : ""}</strong>
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
                      <span className="member-pill">{current ? "Р’С‹" : "Р’ РіСЂСѓРїРїРµ"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sheet-section">
            <button type="button" className="ghost-button" onClick={onToggleGroupInvitePicker}>
              {isGroupInvitePickerOpen ? "РЎРєСЂС‹С‚СЊ СЃРїРёСЃРѕРє РєРѕРЅС‚Р°РєС‚РѕРІ" : "Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°"}
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
                      Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ РёР»Рё СЃРїРёСЃРѕРє РїСѓСЃС‚.
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
                          <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
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
                  {addGroupParticipantsPending ? "Р”РѕР±Р°РІР»СЏРµРј..." : "Р”РѕР±Р°РІРёС‚СЊ РІ РіСЂСѓРїРїСѓ"}
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
            <div className="section-title">Р”РѕР±Р°РІРёС‚СЊ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ</div>
            <p className="sheet-copy">
              Р’С‹Р±РµСЂРё Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ РґР»СЏ {activeConference?.title ?? "РІСЃС‚СЂРµС‡Рё"}.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
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
                Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РїСЂРёРіР»Р°С€РµРЅС‹ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ РёР»Рё СЃРїРёСЃРѕРє РїСѓСЃС‚.
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
                    <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
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
            {addConferenceParticipantsPending ? "Р”РѕР±Р°РІР»СЏРµРј..." : "Р”РѕР±Р°РІРёС‚СЊ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ"}
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
            <div className="section-title">РљРѕРЅС‚Р°РєС‚С‹</div>
            <p className="sheet-copy">Р”РѕР±Р°РІР»СЏР№ РєРѕРЅС‚Р°РєС‚С‹ Рё РѕС‚РєСЂС‹РІР°Р№ СЃ РЅРёРјРё Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
          </button>
        </div>

        <div className="sheet-form contact-search-form">
          <div className="contact-search-shell">
            <input
              value={contactSearch}
              onChange={(event) => onContactSearchChange(event.target.value)}
              placeholder="Username РёР»Рё display name"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {showContactSearchResults ? (
              <div className="search-dropdown contact-search-dropdown">
                {contactSearchFetching ? (
                  <div className="search-result-empty">РС‰РµРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№...</div>
                ) : contactSearchResults.length === 0 ? (
                  <div className="search-result-empty">РџРѕР»СЊР·РѕРІР°С‚РµР»Рё РЅРµ РЅР°Р№РґРµРЅС‹.</div>
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
                        Р”РѕР±Р°РІРёС‚СЊ
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
            <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
          ) : contacts.length === 0 ? (
            <div className="empty-list">РљРѕРЅС‚Р°РєС‚РѕРІ РїРѕРєР° РЅРµС‚.</div>
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
                    Р§Р°С‚
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => onRemoveContact(contact.username)}
                  >
                    РЈРґР°Р»РёС‚СЊ
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
    const encryptionDeviceSummary =
      encryptionDevices.length > 0
        ? `\u041D\u0430 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435 ${formatEncryptionDeviceCountLabel(
            encryptionDevices.length
          )}. \u0418\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u0438 \u043A\u043B\u044E\u0447\u0438 \u043D\u0443\u0436\u043D\u044B \u0434\u043B\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F encrypted chats \u043D\u0430 \u0434\u0440\u0443\u0433\u0438\u0445 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\u0445.`
        : "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432. \u041F\u043E\u0441\u043B\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0439 \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438 encrypted chats \u043D\u043E\u0432\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C.";

    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">
              {"\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430"}
            </div>
            <p className="sheet-copy">
              {
                "\u041E\u0431\u044B\u0447\u043D\u044B\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 \u0432\u0445\u043E\u0434\u0430 \u0438 E2EE-\u043A\u043B\u044E\u0447\u0438 \u0434\u043B\u044F \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0447\u0430\u0442\u043E\u0432."
              }
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            {"\u0417\u0430\u043A\u0440\u044B\u0442\u044C"}
          </button>
        </div>

        <div className="session-sheet-grid">
          <section className="sheet-section session-sheet-section">
            <div className="session-section-head">
              <strong>{"\u0421\u0435\u0441\u0441\u0438\u0438 \u0432\u0445\u043E\u0434\u0430"}</strong>
              <span>
                {
                  "\u042D\u0442\u043E \u043E\u0431\u044B\u0447\u043D\u044B\u0435 auth-\u0441\u0435\u0441\u0441\u0438\u0438. \u0418\u0445 \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u043B\u044E\u0447\u0430\u0442\u044C \u0431\u0435\u0437 \u0441\u0431\u0440\u043E\u0441\u0430 E2EE-\u043A\u043B\u044E\u0447\u0435\u0439."
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
                          {
                            "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C:"
                          }{" "}
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

          <section className="sheet-section session-sheet-section">
            <div className="session-section-head">
              <strong>{"E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430"}</strong>
              <span>{encryptionDeviceSummary}</span>
            </div>
            <div className="session-list menu-session-list">
              {encryptionDevicesLoading ? (
                <div className="empty-list">
                  {"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430..."}
                </div>
              ) : encryptionDevices.length === 0 ? (
                <div className="empty-list">
                  {
                    "\u0423 \u044D\u0442\u043E\u0433\u043E \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 E2EE-\u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432."
                  }
                </div>
              ) : (
                encryptionDevices.map((device) => {
                  const isCurrentDevice = device.deviceId === currentEncryptionDeviceId;
                  const isOnlyVisibleDevice = encryptionDevices.length <= 1;
                  const staleDevice = isStaleEncryptionDevice(device.lastSeenAt);

                  return (
                    <div key={device.deviceId} className="session-row">
                      <div className="session-copy">
                        <strong>{device.deviceName}</strong>
                        <span>
                          {"\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 seen:"}{" "}
                          {formatSessionTime(device.lastSeenAt)}
                        </span>
                        <span>
                          {"\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E:"}{" "}
                          {formatSessionTime(device.registeredAt)}
                        </span>
                        <span>
                          {"OTP prekeys:"} {device.availableOneTimePrekeys}
                          {device.deviceVersion ? ` · v${device.deviceVersion}` : ""}
                        </span>
                      </div>
                      <div className="member-pill-stack">
                        {isCurrentDevice ? (
                          <span className="member-pill">{"\u042D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E"}</span>
                        ) : null}
                        {staleDevice ? (
                          <span className="member-pill">
                            {"\u0414\u0430\u0432\u043D\u043E \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u043E\u0441\u044C"}
                          </span>
                        ) : null}
                        {isOnlyVisibleDevice ? (
                          <span className="member-pill">{"\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 E2EE"}</span>
                        ) : !isCurrentDevice ? (
                          <button
                            type="button"
                            className="ghost-button compact"
                            disabled={retireEncryptionDevicePending}
                            onClick={() => onRetireEncryptionDevice(device.deviceId)}
                          >
                            {"\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C E2EE"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return null;
}
