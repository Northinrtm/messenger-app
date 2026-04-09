import type { ChatSummary, Participant } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  activeChat: ChatSummary;
  sessionUserId: string;
  createChatPending: boolean;
  banGroupParticipantPending: boolean;
  removeGroupParticipantPending: boolean;
  assignModeratorPending: boolean;
  revokeModeratorPending: boolean;
  canManageRoles: boolean;
  canModerateMembers: boolean;
  onClose: () => void;
  onCreateChat: (username: string) => void;
  onBanParticipant: (participant: Participant) => void;
  onRemoveParticipant: (participant: Participant) => void;
  onAssignModerator: (participant: Participant) => void;
  onRevokeModerator: (participant: Participant) => void;
};

function renderMemberCount(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} участник`;
  }
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} участника`;
  }
  return `${count} участников`;
}

export function ChatMembersPanel({
  activeChat,
  sessionUserId,
  createChatPending,
  banGroupParticipantPending,
  removeGroupParticipantPending,
  assignModeratorPending,
  revokeModeratorPending,
  canManageRoles,
  canModerateMembers,
  onClose,
  onCreateChat,
  onBanParticipant,
  onRemoveParticipant,
  onAssignModerator,
  onRevokeModerator,
}: Props) {
  const ownerUserId = activeChat.ownerUserId;
  const moderatorUserIdSet = new Set(activeChat.moderatorUserIds);

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
            <strong>Участники</strong>
            <span>{renderMemberCount(activeChat.members.length)}</span>
          </div>
        </div>
        <button type="button" className="sidebar-menu-collapse" onClick={onClose} aria-label="Закрыть участников">
          ×
        </button>
      </div>

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
            rolePills.push("Вы");
          }
          if (isOwner) {
            rolePills.push("Владелец");
          } else if (isModerator) {
            rolePills.push("Модератор");
          }
          if (rolePills.length === 0) {
            rolePills.push("В группе");
          }

          return (
            <div key={member.id} className="sheet-row sheet-row-with-avatar">
              <AvatarCircle
                className="menu-row-avatar sheet-contact-avatar"
                name={member.displayName}
                avatarUrl={member.avatarUrl}
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
                    Чат
                  </button>
                ) : null}
                {canOwnerManageRole && !isModerator ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={assignModeratorPending}
                    onClick={() => onAssignModerator(member)}
                  >
                    Модератор
                  </button>
                ) : null}
                {canOwnerManageRole && isModerator ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={revokeModeratorPending}
                    onClick={() => onRevokeModerator(member)}
                  >
                    Снять роль
                  </button>
                ) : null}
                {canModerateThisMember ? (
                  <button
                    type="button"
                    className="ghost-button compact"
                    disabled={removeGroupParticipantPending}
                    onClick={() => onRemoveParticipant(member)}
                  >
                    Исключить
                  </button>
                ) : null}
                {canModerateThisMember ? (
                  <button
                    type="button"
                    className="ghost-button compact danger-button"
                    disabled={banGroupParticipantPending}
                    onClick={() => onBanParticipant(member)}
                  >
                    Бан
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
    </div>
  );
}
