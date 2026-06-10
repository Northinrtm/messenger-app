import { useI18n } from "../../../i18n/I18nProvider";
import { tpActive } from "../../../i18n";
import type { ChatSummary, Participant, UserProfile } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  activeChat: ChatSummary;
  bannedParticipants: Participant[];
  activeConferenceParticipantUserIds: string[];
  sessionUserId: string;
  createChatPending: boolean;
  addGroupParticipantsPending: boolean;
  banGroupParticipantPending: boolean;
  groupBansLoading: boolean;
  removeGroupParticipantPending: boolean;
  assignModeratorPending: boolean;
  revokeModeratorPending: boolean;
  transferOwnershipPending: boolean;
  unbanGroupParticipantPending: boolean;
  canAddMembers: boolean;
  canManageRoles: boolean;
  canModerateMembers: boolean;
  availableGroupInviteContacts: UserProfile[];
  selectedGroupInviteContacts: UserProfile[];
  isGroupInvitePickerOpen: boolean;
  groupInviteUsernames: string[];
  onClose: () => void;
  onCreateChat: (username: string) => void;
  onToggleGroupInvitePicker: () => void;
  onToggleGroupInviteParticipant: (username: string) => void;
  onSubmitAddGroupParticipants: () => void;
  onBanParticipant: (participant: Participant) => void;
  onUnbanParticipant: (participant: Participant) => void;
  onRemoveParticipant: (participant: Participant) => void;
  onAssignModerator: (participant: Participant) => void;
  onRevokeModerator: (participant: Participant) => void;
  onTransferOwnership: (participant: Participant) => void;
};

function renderMemberCount(count: number) {
  return tpActive("members.count", count);
}

export function ChatMembersPanel({
  activeChat,
  bannedParticipants,
  activeConferenceParticipantUserIds,
  sessionUserId,
  createChatPending,
  addGroupParticipantsPending,
  banGroupParticipantPending,
  groupBansLoading,
  removeGroupParticipantPending,
  assignModeratorPending,
  revokeModeratorPending,
  transferOwnershipPending,
  unbanGroupParticipantPending,
  canAddMembers,
  canManageRoles,
  canModerateMembers,
  availableGroupInviteContacts,
  selectedGroupInviteContacts,
  isGroupInvitePickerOpen,
  groupInviteUsernames,
  onClose,
  onCreateChat,
  onToggleGroupInvitePicker,
  onToggleGroupInviteParticipant,
  onSubmitAddGroupParticipants,
  onBanParticipant,
  onUnbanParticipant,
  onRemoveParticipant,
  onAssignModerator,
  onRevokeModerator,
  onTransferOwnership,
}: Props) {
  const { t } = useI18n();
  const ownerUserId = activeChat.ownerUserId;
  const moderatorUserIdSet = new Set(activeChat.moderatorUserIds);
  const activeConferenceParticipantIdSet = new Set(activeConferenceParticipantUserIds);

  return (
    <div className="chat-menu-panel chat-members-panel">
      <div className="chat-menu-head">
        <div className="chat-menu-identity">
          <AvatarCircle
            className="menu-profile-avatar chat-menu-avatar"
            name={activeChat.title}
            avatarUrl={activeChat.avatarUrl}
            badge="GR"
          />
          <div className="chat-menu-copy">
            <strong>{t("conf.participants")}</strong>
            <span>{renderMemberCount(activeChat.members.length)}</span>
          </div>
        </div>
        <div className="chat-menu-head-actions">
          {canAddMembers ? (
            <button type="button" className="ghost-button compact" onClick={onToggleGroupInvitePicker}>
              {isGroupInvitePickerOpen ? t("common.hide") : t("sheet.add")}
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-menu-collapse"
            onClick={onClose}
            aria-label={t("members.closeAria")}
          >
            ×
          </button>
        </div>
      </div>

      {canAddMembers && isGroupInvitePickerOpen ? (
        <div className="chat-members-panel-picker">
          {selectedGroupInviteContacts.length > 0 ? (
            <div className="sheet-chip-list">
              {selectedGroupInviteContacts.map((contact) => (
                <span key={contact.username} className="sheet-chip">
                  {contact.displayName}
                </span>
              ))}
            </div>
          ) : null}

          <div className="group-picker-list">
            {availableGroupInviteContacts.length === 0 ? (
              <div className="empty-list">{t("sheet.allContactsInGroupOrEmpty")}</div>
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
            type="button"
            className="secondary-button"
            disabled={addGroupParticipantsPending || !groupInviteUsernames.length}
            onClick={onSubmitAddGroupParticipants}
          >
            {addGroupParticipantsPending ? t("sheet.adding") : t("sheet.addToGroup")}
          </button>
        </div>
      ) : null}

      <div className="chat-members-panel-list">
        {activeChat.members.map((member) => {
          const isCurrentUser = member.id === sessionUserId;
          const isOwner = ownerUserId === member.id;
          const isModerator = moderatorUserIdSet.has(member.id);
          const canManageThisMember = !isCurrentUser && !isOwner;
          const canOwnerManageRole = canManageRoles && canManageThisMember;
          const canModerateThisMember =
            canModerateMembers && canManageThisMember && (canManageRoles || !isModerator);
          const rolePills: string[] = [];

          if (isCurrentUser) {
            rolePills.push(t("chat.you"));
          }
          if (isOwner) {
            rolePills.push(t("members.owner"));
          } else if (isModerator) {
            rolePills.push(t("members.moderator"));
          }
          if (rolePills.length === 0) {
            rolePills.push(t("sheet.inGroup"));
          }

          return (
            <div key={member.id} className="sheet-row sheet-row-with-avatar">
              <AvatarCircle
                className="menu-row-avatar sheet-contact-avatar"
                name={member.displayName}
                avatarUrl={member.avatarUrl}
                activityBadge={activeConferenceParticipantIdSet.has(member.id) ? "headphones" : undefined}
                online={member.online}
              />
              <div className="sheet-row-copy">
                <strong>{member.displayName}</strong>
                <span>@{member.username}</span>
              </div>
              <div className="sheet-row-actions">
                {!isCurrentUser ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={createChatPending}
                    onClick={() => onCreateChat(member.username)}
                  >
                    {t("sheet.chat")}
                  </button>
                ) : null}
                {canOwnerManageRole && !isModerator ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={assignModeratorPending}
                    onClick={() => onAssignModerator(member)}
                  >
                    {t("members.moderator")}
                  </button>
                ) : null}
                {canOwnerManageRole && isModerator ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={transferOwnershipPending}
                    onClick={() => onTransferOwnership(member)}
                  >
                    {t("members.transferOwnership")}
                  </button>
                ) : null}
                {canOwnerManageRole && isModerator ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={revokeModeratorPending}
                    onClick={() => onRevokeModerator(member)}
                  >
                    {t("members.revokeRole")}
                  </button>
                ) : null}
                {canModerateThisMember ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={removeGroupParticipantPending}
                    onClick={() => onRemoveParticipant(member)}
                  >
                    {t("members.remove")}
                  </button>
                ) : null}
                {canModerateThisMember ? (
                  <button
                    type="button"
                    className="ghost-button compact danger-button"
                    disabled={banGroupParticipantPending}
                    onClick={() => onBanParticipant(member)}
                  >
                    {t("members.ban")}
                  </button>
                ) : null}
                <div className="member-pill-stack">
                  {rolePills.map((pill) => (
                    <span key={pill} className="member-pill">
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canModerateMembers ? (
        <div className="chat-members-panel-list">
          <div className="sheet-section">
            <div className="section-title">{t("sheet.bannedMembers")}</div>
            {groupBansLoading ? (
              <div className="empty-list">{t("sheet.loadingBans")}</div>
            ) : bannedParticipants.length === 0 ? (
              <div className="empty-list">{t("sheet.bansEmpty")}</div>
            ) : (
              bannedParticipants.map((participant) => (
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
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
