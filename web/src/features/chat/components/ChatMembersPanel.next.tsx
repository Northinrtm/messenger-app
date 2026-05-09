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
}: Props) {
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
            <strong>Участники</strong>
            <span>{renderMemberCount(activeChat.members.length)}</span>
          </div>
        </div>
        <div className="chat-menu-head-actions">
          {canAddMembers ? (
            <button type="button" className="ghost-button compact" onClick={onToggleGroupInvitePicker}>
              {isGroupInvitePickerOpen ? "Скрыть" : "Добавить"}
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-menu-collapse"
            onClick={onClose}
            aria-label="Закрыть участников"
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
              <div className="empty-list">Все контакты уже в этой группе или список пуст.</div>
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
            type="button"
            className="secondary-button"
            disabled={addGroupParticipantsPending || !groupInviteUsernames.length}
            onClick={onSubmitAddGroupParticipants}
          >
            {addGroupParticipantsPending ? "Добавляем..." : "Добавить в группу"}
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
      {canModerateMembers ? (
        <div className="chat-members-panel-list">
          <div className="sheet-section">
            <div className="section-title">Заблокированные участники</div>
            {groupBansLoading ? (
              <div className="empty-list">Загружаем список банов...</div>
            ) : bannedParticipants.length === 0 ? (
              <div className="empty-list">Список банов пуст.</div>
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
                      Разбанить
                    </button>
                    <span className="member-pill">В бане</span>
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
