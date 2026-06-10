import { useMemo } from "react";

import type { ChatPrejoinHistoryPolicy, ChatSummary, Participant, UserProfile, VideoConference } from "../../../lib/types";
import { useI18n } from "../../../i18n/I18nProvider";
import { tpActive } from "../../../i18n";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  activeChat: ChatSummary;
  activeDirectParticipant: Participant | null;
  activeDirectInContacts: boolean;
  isDirectBlocked: boolean;
  activeGroupConference: VideoConference | null;
  groupDetailsTitle: string;
  groupDetailsAvatarUrl: string | null;
  groupDetailsPrejoinHistoryPolicy: ChatPrejoinHistoryPolicy;
  groupInviteLinkUrl: string | null;
  availableGroupInviteContacts: UserProfile[];
  selectedGroupInviteContacts: UserProfile[];
  isGroupInvitePickerOpen: boolean;
  groupInviteLinkPending: boolean;
  addGroupParticipantsPending: boolean;
  updateGroupPending: boolean;
  createChatPending: boolean;
  leaveGroupPending: boolean;
  deleteGroupPending: boolean;
  banGroupParticipantPending: boolean;
  removeGroupParticipantPending: boolean;
  assignModeratorPending: boolean;
  revokeModeratorPending: boolean;
  toggleBlockPending: boolean;
  canDeleteGroup: boolean;
  canEditGroup: boolean;
  canManageInviteLink: boolean;
  onClose: () => void;
  onOpenMembers: () => void;
  onOpenMediaBrowser: () => void;
  onGroupDetailsTitleChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onRemoveGroupAvatar: () => void;
  onGroupDetailsPrejoinHistoryPolicyChange: (value: ChatPrejoinHistoryPolicy) => void;
  onSubmitUpdateGroup: () => void;
  onGenerateGroupInviteLink: () => void;
  onCopyGroupInviteLink: (value: string) => void;
  onToggleGroupInvitePicker: () => void;
  onToggleGroupInviteParticipant: (username: string) => void;
  onSubmitAddGroupParticipants: () => void;
  onOpenGroupConferenceComposer: (mode: "instant" | "scheduled") => void;
  onStartOrJoinGroupConference: () => void;
  onCreateChat: (username: string) => void;
  onLeaveGroup: () => void;
  onDeleteGroup: () => void;
  onBanParticipant: (participant: Participant) => void;
  onRemoveParticipant: (participant: Participant) => void;
  onAssignModerator: (participant: Participant) => void;
  onRevokeModerator: (participant: Participant) => void;
  onAddToContacts: () => void;
  onStartDirectConference: () => void;
  onToggleBlocked: () => void;
};

function renderMemberCount(count: number) {
  return tpActive("members.count", count);
}

export function ChatMenuPanel({
  activeChat,
  activeDirectParticipant,
  activeDirectInContacts,
  isDirectBlocked,
  activeGroupConference,
  groupDetailsTitle,
  groupDetailsAvatarUrl,
  groupDetailsPrejoinHistoryPolicy,
  groupInviteLinkUrl,
  groupInviteLinkPending,
  updateGroupPending,
  leaveGroupPending,
  deleteGroupPending,
  toggleBlockPending,
  canDeleteGroup,
  canEditGroup,
  canManageInviteLink,
  onClose,
  onOpenMembers,
  onOpenMediaBrowser,
  onGroupDetailsTitleChange,
  onGroupAvatarSelected,
  onRemoveGroupAvatar,
  onGroupDetailsPrejoinHistoryPolicyChange,
  onSubmitUpdateGroup,
  onGenerateGroupInviteLink,
  onCopyGroupInviteLink,
  onOpenGroupConferenceComposer,
  onStartOrJoinGroupConference,
  onLeaveGroup,
  onDeleteGroup,
  onAddToContacts,
  onStartDirectConference,
  onToggleBlocked,
}: Props) {
  const { t } = useI18n();
  const COPY = useMemo(
    () => ({
      closeMenu: t("chatmenu.closeMenu"),
      addToContacts: t("chatmenu.addToContacts"),
      call: t("chatmenu.call"),
      schedule: t("sheet.scheduleBtn"),
      mediaBrowser: t("chatmenu.mediaBrowser"),
      participants: t("conf.participants"),
      inviteLink: t("sheet.inviteLink"),
      copy: t("conf.copy"),
      refreshLink: t("conf.refreshLink"),
      generateLink: t("conf.generateLink"),
      refreshingLink: t("chatmenu.refreshingLink"),
      groupAvatar: t("sheet.groupAvatar"),
      pickPhoto: t("sheet.chooseProfilePhoto"),
      removePhoto: t("sheet.removePhoto"),
      groupTitle: t("sheet.groupNamePlaceholder"),
      historyToggleLabel: t("sheet.allowHistory"),
      historyToggleOnHelp: t("sheet.historyFull"),
      historyToggleOffHelp: t("sheet.historyAfterJoin"),
      save: t("common.save"),
      saving: t("common.saving"),
      leaveGroup: t("chatmenu.leaveGroup"),
      deleteGroup: t("chatmenu.deleteGroup"),
      unblock: t("chatmenu.unblock"),
      block: t("chatmenu.block"),
      about: t("chatmenu.about"),
      selected: t("chatmenu.selected"),
    }),
    [t],
  );
  if (activeChat.direct && activeDirectParticipant) {
    return (
      <div className="chat-menu-panel">
        <div className="chat-menu-head">
          <div className="chat-menu-identity">
            <AvatarCircle
              className="menu-profile-avatar chat-menu-avatar"
              name={activeDirectParticipant.displayName}
              avatarUrl={activeDirectParticipant.avatarUrl ?? null}
              online={activeDirectParticipant.online}
            />
            <div className="chat-menu-copy">
              <strong>{activeDirectParticipant.displayName}</strong>
              <span>@{activeDirectParticipant.username}</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-menu-collapse"
            onClick={onClose}
            aria-label={COPY.closeMenu}
          >
            ×
          </button>
        </div>

        <div className="chat-menu-actions">
          {!activeDirectInContacts ? (
            <button type="button" className="ghost-button compact" onClick={onAddToContacts}>
              {COPY.addToContacts}
            </button>
          ) : null}
          <button type="button" className="ghost-button compact" onClick={onOpenMediaBrowser}>
            {COPY.mediaBrowser}
          </button>
          <button
            type="button"
            className="ghost-button compact"
            disabled={isDirectBlocked}
            onClick={onStartDirectConference}
          >
            {COPY.call}
          </button>
          <button
            type="button"
            className={isDirectBlocked ? "ghost-button compact danger-button" : "ghost-button compact"}
            disabled={toggleBlockPending}
            onClick={onToggleBlocked}
          >
            {isDirectBlocked ? COPY.unblock : COPY.block}
          </button>
        </div>

        <div className="profile-line">
          <span className="profile-label">Username</span>
          <strong>@{activeDirectParticipant.username}</strong>
        </div>
        {activeDirectParticipant.profession ? (
          <div className="profile-line">
            <span className="profile-label">{COPY.about}</span>
            <strong className="profile-about-value">{activeDirectParticipant.profession}</strong>
          </div>
        ) : null}
      </div>
    );
  }

  if (activeChat.direct) {
    return null;
  }

  const normalizedGroupTitle = groupDetailsTitle.trim();
  const groupTitle = normalizedGroupTitle || activeChat.title;
  const canLeaveGroup = activeChat.capabilities.canLeaveGroup;
  const canTogglePrejoinHistory = activeChat.capabilities.canTogglePrejoinHistory;
  const isFullHistoryEnabled = groupDetailsPrejoinHistoryPolicy === "FULL_HISTORY";
  const groupChanged =
    groupTitle !== activeChat.title ||
    (groupDetailsAvatarUrl ?? null) !== (activeChat.avatarUrl ?? null);

  return (
    <div className="chat-menu-panel">
      <div className="chat-menu-head">
        <div className="chat-menu-identity">
          <AvatarCircle
            className="menu-profile-avatar chat-menu-avatar"
            name={groupTitle}
            avatarUrl={groupDetailsAvatarUrl}
            badge="GR"
          />
          <div className="chat-menu-copy">
            <strong>{groupTitle}</strong>
            <span>{renderMemberCount(activeChat.members.length)}</span>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-menu-collapse"
          onClick={onClose}
          aria-label={COPY.closeMenu}
        >
          ×
        </button>
      </div>

      <div className="chat-menu-primary-actions">
        <div className="chat-menu-actions">
          <button type="button" className="ghost-button compact" onClick={onStartOrJoinGroupConference}>
            {activeGroupConference ? t("chatmenu.join") : COPY.call}
          </button>
          <button type="button" className="ghost-button compact" onClick={onOpenMediaBrowser}>
            {COPY.mediaBrowser}
          </button>
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => onOpenGroupConferenceComposer("scheduled")}
          >
            {COPY.schedule}
          </button>
        </div>
        <button type="button" className="ghost-button compact chat-menu-toggle" onClick={onOpenMembers}>
          {COPY.participants}
        </button>
      </div>

      {canManageInviteLink ? (
        <div className="invite-link-panel chat-menu-invite-panel">
          <div className="invite-link-copy">
            <strong>{COPY.inviteLink}</strong>
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
                {COPY.copy}
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
              ? COPY.refreshingLink
              : groupInviteLinkUrl
                ? COPY.refreshLink
                : COPY.generateLink}
          </button>
        </div>
      ) : null}

      {canEditGroup ? (
        <>
          <div className="profile-line">
            <span className="profile-label">{COPY.groupAvatar}</span>
            <div className="profile-avatar-actions">
              <label htmlFor="chat-menu-group-avatar" className="ghost-button compact">
                {COPY.pickPhoto}
              </label>
              <input
                id="chat-menu-group-avatar"
                className="profile-avatar-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    onGroupAvatarSelected(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
              {groupDetailsAvatarUrl ? (
                <button type="button" className="ghost-button compact" onClick={onRemoveGroupAvatar}>
                  {COPY.removePhoto}
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
            <span className="profile-label">{COPY.groupTitle}</span>
            <input
              value={groupDetailsTitle}
              onChange={(event) => onGroupDetailsTitleChange(event.target.value)}
              placeholder={COPY.groupTitle}
              maxLength={120}
            />

            <button
              type="submit"
              className="secondary-button"
              disabled={updateGroupPending || normalizedGroupTitle.length < 2 || !groupChanged}
            >
              {updateGroupPending ? COPY.saving : COPY.save}
            </button>

            <div className="profile-line group-history-setting">
              <div className="group-history-setting-row">
                <div className="group-history-setting-copy">
                  <strong>{COPY.historyToggleLabel}</strong>
                  <span>{isFullHistoryEnabled ? COPY.historyToggleOnHelp : COPY.historyToggleOffHelp}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isFullHistoryEnabled}
                  aria-label={COPY.historyToggleLabel}
                  className={isFullHistoryEnabled ? "group-history-switch is-on" : "group-history-switch"}
                  disabled={updateGroupPending || !canTogglePrejoinHistory}
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

      <div className="chat-menu-footer">
        {canLeaveGroup ? (
          <button
            type="button"
            className="ghost-button compact"
            disabled={leaveGroupPending || deleteGroupPending}
            onClick={onLeaveGroup}
          >
            {COPY.leaveGroup}
          </button>
        ) : null}
        {canDeleteGroup ? (
          <button
            type="button"
            className="ghost-button compact danger-button"
            disabled={deleteGroupPending}
            onClick={onDeleteGroup}
          >
            {COPY.deleteGroup}
          </button>
        ) : null}
      </div>
    </div>
  );
}
