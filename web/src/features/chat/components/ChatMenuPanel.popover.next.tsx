import type { ChatPrejoinHistoryPolicy, ChatSummary, Participant, UserProfile, VideoConference } from "../../../lib/types";
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

const COPY = {
  closeMenu: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E",
  addToContacts: "\u0412 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B",
  call: "\u0421\u043E\u0437\u0432\u043E\u043D",
  schedule: "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  participants: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438",
  inviteLink: "\u0421\u0441\u044B\u043B\u043A\u0430-\u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435",
  copy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  refreshLink: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443",
  generateLink: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443",
  refreshingLink: "\u041E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u043C \u0441\u0441\u044B\u043B\u043A\u0443...",
  groupAvatar: "\u0410\u0432\u0430\u0442\u0430\u0440 \u0433\u0440\u0443\u043F\u043F\u044B",
  pickPhoto: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0444\u043E\u0442\u043E",
  removePhoto: "\u0423\u0431\u0440\u0430\u0442\u044C \u0444\u043E\u0442\u043E",
  groupTitle: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0433\u0440\u0443\u043F\u043F\u044B",
  historyToggleLabel:
    "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u043D\u043E\u0432\u044B\u043C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C \u0433\u0440\u0443\u043F\u043F\u044B \u0432\u0438\u0434\u0435\u0442\u044C \u0441\u0442\u0430\u0440\u0443\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439",
  historyToggleOnHelp:
    "\u041D\u043E\u0432\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u0443\u0432\u0438\u0434\u044F\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0433\u0440\u0443\u043F\u043F\u044B \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E.",
  historyToggleOffHelp:
    "\u041D\u043E\u0432\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u0443\u0432\u0438\u0434\u044F\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u0432 \u0433\u0440\u0443\u043F\u043F\u0443.",
  save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
  saving: "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C...",
  leaveGroup: "\u0412\u044B\u0439\u0442\u0438 \u0438\u0437 \u0433\u0440\u0443\u043F\u043F\u044B",
  deleteGroup: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443",
  unblock: "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  block: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  about: "\u041E \u0441\u0435\u0431\u0435",
  selected: "\u0412\u044B\u0431\u0440\u0430\u043D\u043E",
} as const;

function renderMemberCount(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A`;
  }
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430`;
  }
  return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432`;
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
            {activeGroupConference ? "Войти" : COPY.call}
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
