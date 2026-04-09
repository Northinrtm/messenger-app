export { ChatMenuPanel } from "./ChatMenuPanel.centered";

/*

import type { Participant, ChatSummary } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  activeChat: ChatSummary;
  sessionUserId: string;
  activeDirectParticipant: Participant | null;
  activeDirectInContacts: boolean;
  isDirectBlocked: boolean;
  groupDetailsTitle: string;
  groupDetailsAvatarUrl: string | null;
  groupInviteLinkUrl: string | null;
  groupInviteLinkPending: boolean;
  updateGroupPending: boolean;
  createChatPending: boolean;
  leaveGroupPending: boolean;
  deleteGroupPending: boolean;
  banGroupParticipantPending: boolean;
  toggleBlockPending: boolean;
  canDeleteGroup: boolean;
  canManageMembers: boolean;
  onClose: () => void;
  onGroupDetailsTitleChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onRemoveGroupAvatar: () => void;
  onSubmitUpdateGroup: () => void;
  onGenerateGroupInviteLink: () => void;
  onCopyGroupInviteLink: (value: string) => void;
  onOpenGroupMembers: () => void;
  onOpenGroupConferenceComposer: (mode: "instant" | "scheduled") => void;
  onCreateChat: (username: string) => void;
  onLeaveGroup: () => void;
  onDeleteGroup: () => void;
  onBanParticipant: (participant: Participant) => void;
  onAddToContacts: () => void;
  onStartDirectConference: () => void;
  onToggleBlocked: () => void;
};

export function ChatMenuPanel({
  activeChat,
  sessionUserId,
  activeDirectParticipant,
  activeDirectInContacts,
  isDirectBlocked,
  groupDetailsTitle,
  groupDetailsAvatarUrl,
  groupInviteLinkUrl,
  groupInviteLinkPending,
  updateGroupPending,
  createChatPending,
  leaveGroupPending,
  deleteGroupPending,
  banGroupParticipantPending,
  toggleBlockPending,
  canDeleteGroup,
  canManageMembers,
  onClose,
  onGroupDetailsTitleChange,
  onGroupAvatarSelected,
  onRemoveGroupAvatar,
  onSubmitUpdateGroup,
  onGenerateGroupInviteLink,
  onCopyGroupInviteLink,
  onOpenGroupMembers,
  onOpenGroupConferenceComposer,
  onCreateChat,
  onLeaveGroup,
  onDeleteGroup,
  onBanParticipant,
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
          <button type="button" className="sidebar-menu-collapse" onClick={onClose} aria-label="Закрыть меню">
            ×
          </button>
        </div>

        <div className="chat-menu-actions">
          {!activeDirectInContacts ? (
            <button type="button" className="ghost-button compact" onClick={onAddToContacts}>
              В контакты
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button compact"
            disabled={isDirectBlocked}
            onClick={onStartDirectConference}
          >
            Созвон
          </button>
          <button
            type="button"
            className={isDirectBlocked ? "ghost-button compact danger-button" : "ghost-button compact"}
            disabled={toggleBlockPending}
            onClick={onToggleBlocked}
          >
            {isDirectBlocked ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>

        <div className="profile-line">
          <span className="profile-label">Username</span>
          <strong>@{activeDirectParticipant.username}</strong>
        </div>
        <div className="profile-line">
          <span className="profile-label">Статус</span>
          <span>
            {isDirectBlocked
              ? "Пользователь заблокирован"
              : activeDirectParticipant.online
                ? "В сети"
                : "Не в сети"}
          </span>
        </div>
      </div>
    );
  }

  if (activeChat.direct) {
    return null;
  }

  const normalizedGroupTitle = groupDetailsTitle.trim();
  const groupTitle = normalizedGroupTitle || activeChat.title;
  const ownerUserId = activeChat.ownerUserId ?? activeChat.members[0]?.id ?? null;
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
            <span>
              {activeChat.members.length} {activeChat.members.length === 1 ? "участник" : "участника"}
            </span>
          </div>
        </div>
        <button type="button" className="sidebar-menu-collapse" onClick={onClose} aria-label="Закрыть меню">
          ×
        </button>
      </div>

      <div className="chat-menu-actions">
        <button
          type="button"
          className="ghost-button compact"
          onClick={() => onOpenGroupConferenceComposer("instant")}
        >
          Созвон
        </button>
        <button
          type="button"
          className="ghost-button compact"
          onClick={() => onOpenGroupConferenceComposer("scheduled")}
        >
          Запланировать
        </button>
        <button type="button" className="ghost-button compact" onClick={onOpenGroupMembers}>
          Участники
        </button>
      </div>

      <div className="profile-line">
        <span className="profile-label">Аватар группы</span>
        <div className="profile-avatar-actions">
          <label htmlFor="chat-menu-group-avatar" className="ghost-button compact">
            Выбрать фото
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
          disabled={updateGroupPending || normalizedGroupTitle.length < 2 || !groupChanged}
        >
          {updateGroupPending ? "Сохраняем..." : "Сохранить"}
        </button>
      </form>

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
            ? "Обновляем ссылку..."
            : groupInviteLinkUrl
              ? "Обновить ссылку"
              : "Сгенерировать ссылку"}
        </button>
      </div>

      <div className="chat-menu-members">
        <div className="section-title">Участники</div>
        <div className="sheet-list chat-menu-members-list">
          {activeChat.members.map((member) => {
            const isCurrentUser = member.id === sessionUserId;
            const isOwner = ownerUserId === member.id;
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
                  {canManageMembers && !isCurrentUser ? (
                    <button
                      type="button"
                      className="ghost-button compact danger-button"
                      disabled={banGroupParticipantPending}
                      onClick={() => onBanParticipant(member)}
                    >
                      Бан
                    </button>
                  ) : null}
                  <span className="member-pill">
                    {isCurrentUser ? "Вы" : isOwner ? "Владелец" : "В группе"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chat-menu-footer">
        <button
          type="button"
          className="ghost-button compact"
          disabled={leaveGroupPending || deleteGroupPending}
          onClick={onLeaveGroup}
        >
          Выйти из группы
        </button>
        {canDeleteGroup ? (
          <button
            type="button"
            className="ghost-button compact danger-button"
            disabled={deleteGroupPending}
            onClick={onDeleteGroup}
          >
            Удалить группу
          </button>
        ) : null}
      </div>
    </div>
  );
}
*/
