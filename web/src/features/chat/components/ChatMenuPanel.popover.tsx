import type { ChatSummary, Participant, UserProfile } from "../../../lib/types";
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
  canManageMembers: boolean;
  canManageRoles: boolean;
  canModerateMembers: boolean;
  onClose: () => void;
  onOpenMembers: () => void;
  onGroupDetailsTitleChange: (value: string) => void;
  onGroupAvatarSelected: (file: File) => void;
  onRemoveGroupAvatar: () => void;
  onSubmitUpdateGroup: () => void;
  onGenerateGroupInviteLink: () => void;
  onCopyGroupInviteLink: (value: string) => void;
  onToggleGroupInvitePicker: () => void;
  onToggleGroupInviteParticipant: (username: string) => void;
  onSubmitAddGroupParticipants: () => void;
  onOpenGroupConferenceComposer: (mode: "instant" | "scheduled") => void;
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
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} участник`;
  }
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} участника`;
  }
  return `${count} участников`;
}

export function ChatMenuPanel({
  activeChat,
  activeDirectParticipant,
  activeDirectInContacts,
  isDirectBlocked,
  groupDetailsTitle,
  groupDetailsAvatarUrl,
  groupInviteLinkUrl,
  availableGroupInviteContacts,
  selectedGroupInviteContacts,
  isGroupInvitePickerOpen,
  groupInviteLinkPending,
  addGroupParticipantsPending,
  updateGroupPending,
  leaveGroupPending,
  deleteGroupPending,
  toggleBlockPending,
  canDeleteGroup,
  canEditGroup,
  canManageInviteLink,
  canManageMembers,
  onClose,
  onOpenMembers,
  onGroupDetailsTitleChange,
  onGroupAvatarSelected,
  onRemoveGroupAvatar,
  onSubmitUpdateGroup,
  onGenerateGroupInviteLink,
  onCopyGroupInviteLink,
  onToggleGroupInvitePicker,
  onToggleGroupInviteParticipant,
  onSubmitAddGroupParticipants,
  onOpenGroupConferenceComposer,
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
      </div>
    );
  }

  if (activeChat.direct) {
    return null;
  }

  const normalizedGroupTitle = groupDetailsTitle.trim();
  const groupTitle = normalizedGroupTitle || activeChat.title;
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
        <button type="button" className="sidebar-menu-collapse" onClick={onClose} aria-label="Закрыть меню">
          ×
        </button>
      </div>

      <div className="chat-menu-primary-actions">
        <div className="chat-menu-actions">
          <button type="button" className="ghost-button compact" onClick={() => onOpenGroupConferenceComposer("instant")}>
            Созвон
          </button>
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => onOpenGroupConferenceComposer("scheduled")}
          >
            Запланировать
          </button>
        </div>
        <button type="button" className="ghost-button compact chat-menu-toggle" onClick={onOpenMembers}>
          Участники
        </button>
      </div>

      {canManageInviteLink ? (
        <div className="invite-link-panel chat-menu-invite-panel">
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
      ) : null}

      {canEditGroup ? (
        <>
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
        </>
      ) : null}

      {canManageMembers ? (
        <div className="profile-line">
          <span className="profile-label">Добавить участников</span>
          <button type="button" className="ghost-button compact" onClick={onToggleGroupInvitePicker}>
            {isGroupInvitePickerOpen ? "Скрыть список" : "Добавить из контактов"}
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
                  <div className="empty-list">Все контакты уже добавлены в группу или список пуст.</div>
                ) : (
                  availableGroupInviteContacts.map((contact) => {
                    const selected = selectedGroupInviteContacts.some(
                      (selectedContact) => selectedContact.username === contact.username,
                    );
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
                disabled={addGroupParticipantsPending || selectedGroupInviteContacts.length === 0}
                onClick={onSubmitAddGroupParticipants}
              >
                {addGroupParticipantsPending ? "Добавляем..." : "Добавить в группу"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

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
