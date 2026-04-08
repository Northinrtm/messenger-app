import type { UserProfile, UserSessionInfo, ChatSummary, VideoConference } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

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
  sessions: UserSessionInfo[];
  sessionsLoading: boolean;
  currentSessionId: string;
  activeChat: ChatSummary | null;
  activeConference: VideoConference | null;
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
  createChatPending: boolean;
  updateProfilePending: boolean;
  avatarPending: boolean;
  deleteAccountPending: boolean;
  revokeSessionPending: boolean;
  contactSearchFetching: boolean;
  onClose: () => void;
  onProfileDisplayNameChange: (value: string) => void;
  onSubmitProfileDisplayName: () => void;
  onDeleteAccountConfirmationChange: (value: string) => void;
  onDeleteAccount: () => void;
  onRemoveAvatar: () => void;
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
  onRevokeSession: (sessionId: string) => void;
  formatProfileDate: (value: string) => string;
  formatSessionTime: (value: string) => string;
};

export function SidebarManagementSheets({
  sheet,
  profile,
  sessionUser,
  profileDisplayName,
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
  sessions,
  sessionsLoading,
  currentSessionId,
  activeChat,
  activeConference,
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
  createChatPending,
  updateProfilePending,
  avatarPending,
  deleteAccountPending,
  revokeSessionPending,
  contactSearchFetching,
  onClose,
  onProfileDisplayNameChange,
  onSubmitProfileDisplayName,
  onDeleteAccountConfirmationChange,
  onDeleteAccount,
  onRemoveAvatar,
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
  onRevokeSession,
  formatProfileDate,
  formatSessionTime,
}: Props) {
  if (!sheet) {
    return null;
  }

  if (sheet === "profile") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Мой профиль</div>
            <p className="sheet-copy">Информация о текущем аккаунте.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
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
              Вставь изображение из буфера обмена через Ctrl+V, когда открыт профиль.
            </p>
            <div className="profile-avatar-actions">
              {profile.avatarUrl ? (
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled={avatarPending}
                  onClick={onRemoveAvatar}
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
              onSubmitProfileDisplayName();
            }}
          >
            <span className="profile-label">Имя</span>
            <input
              value={profileDisplayName}
              onChange={(event) => onProfileDisplayNameChange(event.target.value)}
              placeholder="Новое имя"
              maxLength={40}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={
                updateProfilePending ||
                profileDisplayName.trim().length < 2 ||
                profileDisplayName.trim() === profile.displayName
              }
            >
              {updateProfilePending ? "Сохраняем..." : "Сохранить имя"}
            </button>
          </form>
          <div className="profile-line">
            <span className="profile-label">Username</span>
            <strong>@{profile.username}</strong>
          </div>
          <div className="profile-line">
            <span className="profile-label">ID аккаунта</span>
            <span>{profile.id}</span>
          </div>
          <div className="profile-line">
            <span className="profile-label">Создан</span>
            <span>{formatProfileDate(profile.createdAt)}</span>
          </div>
          <div className="profile-danger-card">
            <div className="profile-danger-copy">
              <span className="profile-label">Удаление аккаунта</span>
              <strong>Это действие необратимо.</strong>
              <p>
                Все сессии будут завершены, а профиль и связанные данные будут удалены.
                Введите @{profile.username}, чтобы подтвердить операцию.
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
              {deleteAccountPending ? "Удаляем аккаунт..." : "Удалить аккаунт"}
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
            <div className="section-title">Группы</div>
            <p className="sheet-copy">Создайте новую группу и добавляйте участников по кнопке.</p>
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
                    Добавь сначала контакты, чтобы собрать группу.
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
    const normalizedGroupTitle = groupDetailsTitle.trim();
    const groupDetailsChanged =
      normalizedGroupTitle !== activeChat.title ||
      (groupDetailsAvatarUrl ?? null) !== (activeChat.avatarUrl ?? null);

    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Инфо</div>
            <p className="sheet-copy">Информация о группе и управление участниками.</p>
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

        <div className="profile-line">
          <span className="profile-label">Аватар группы</span>
          <p className="profile-avatar-hint">
            Смени название и аватар группы, затем сохрани изменения.
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
            {updateGroupPending ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </form>

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
          <button
            type="button"
            className="sheet-row sheet-row-button"
            onClick={() => onOpenGroupMembers({ openInvitePicker: true })}
          >
            <div className="sheet-row-copy">
              <strong>Добавить из контактов</strong>
              <span>
                {availableGroupInviteContacts.length > 0
                  ? "Выбери людей из контактов и добавь их в группу."
                  : "Все контакты уже добавлены в эту группу."}
              </span>
            </div>
            <span className="member-pill">
              {availableGroupInviteContacts.length > 0 ? "Добавить" : "Готово"}
            </span>
          </button>
        </div>

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
              ? "Генерируем ссылку..."
              : groupInviteLinkUrl
                ? "Обновить ссылку"
                : "Сгенерировать ссылку"}
          </button>
        </div>
      </div>
    );
  }

  if (sheet === "groupMembers" && activeChat && !activeChat.direct) {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Участники группы</div>
            <p className="sheet-copy">
              Посмотри кто уже в {activeChat.title} и добавь новых людей из контактов.
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
            <button type="button" className="ghost-button" onClick={onToggleGroupInvitePicker}>
              {isGroupInvitePickerOpen ? "Скрыть список контактов" : "Добавить участника"}
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
              Выбери людей из контактов для {activeConference?.title ?? "встречи"}.
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
            <p className="sheet-copy">Добавляй контакты и открывай с ними личные чаты.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="sheet-form contact-search-form">
          <div className="contact-search-shell">
            <input
              value={contactSearch}
              onChange={(event) => onContactSearchChange(event.target.value)}
              placeholder="Username или display name"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {showContactSearchResults ? (
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
            <div className="section-title">Активные устройства</div>
            <p className="sheet-copy">Сессии и устройство, с которого выполнен вход.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="session-list menu-session-list">
          {sessionsLoading ? (
            <div className="empty-list">Загружаем список устройств...</div>
          ) : sessions.length === 0 ? (
            <div className="empty-list">Активна только текущая сессия.</div>
          ) : (
            sessions.map((item) => {
              const current = item.id === currentSessionId;
              return (
                <div key={item.id} className="session-row">
                  <div className="session-copy">
                    <strong>{item.deviceName}</strong>
                    <span>Последняя активность: {formatSessionTime(item.lastUsedAt)}</span>
                    <span>Истекает: {formatSessionTime(item.expiresAt)}</span>
                  </div>
                  {current ? (
                    <span className="member-pill">Текущее</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button compact"
                      disabled={revokeSessionPending}
                      onClick={() => onRevokeSession(item.id)}
                    >
                      Отключить
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return null;
}
