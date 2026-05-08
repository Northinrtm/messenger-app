import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatSummary,
  Participant,
  SourceMessageJumpTarget,
  UserProfile,
} from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";
import { ChatAttachmentBrowserSheet } from "./ChatAttachmentBrowserSheet";

type UtilitySheet = "conference" | "archive" | "forward" | "chatMedia" | null;

type Props = {
  sheet: UtilitySheet;
  activeChat: ChatSummary | null;
  sessionUser: UserProfile;
  sessionToken: string;
  conferenceComposerMode: "instant" | "scheduled" | null;
  conferenceChatId: string | null;
  conferenceEditingId: string | null;
  conferenceTitle: string;
  conferenceScheduledAt: string;
  conferenceCandidates: Array<Participant | UserProfile>;
  conferenceParticipantUsernames: string[];
  contactsLoading: boolean;
  createConferencePending: boolean;
  updateConferencePending: boolean;
  archivedChatsLoading: boolean;
  archivedChats: ChatSummary[];
  forwardingMessages: ChatMessage[];
  forwardableChats: ChatSummary[];
  forwardContactOptions: UserProfile[];
  forwardPending: boolean;
  onClose: () => void;
  onCloseConferenceComposer: () => void;
  onOpenConferenceComposer: (mode: "instant" | "scheduled") => void;
  onConferenceTitleChange: (value: string) => void;
  onConferenceScheduledAtChange: (value: string) => void;
  onToggleConferenceParticipant: (username: string) => void;
  onSubmitCreateConferenceNow: () => void;
  onSubmitCreateConference: () => void;
  onSubmitUpdateConference: () => void;
  onOpenChatContextMenu: (event: ReactMouseEvent<HTMLDivElement>, chatId: string) => void;
  onOpenChat: (chatId: string) => void;
  onToggleArchiveChat: (chatId: string) => void;
  onCloseForward: () => void;
  onJumpToReplyTarget: (chatId: string, messageId: string) => void;
  onForwardToChat: (chatId: string) => void;
  onForwardToContact: (username: string) => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onJumpToAttachmentSourceMessage: (chatId: string, item: SourceMessageJumpTarget) => void;
  createMinimumConferenceDateTime: () => string;
  buildMessagePreview: (content: string, maxLength?: number) => string;
  describeChat: (chat: ChatSummary, currentUser: UserProfile) => string;
  formatMemberCount: (count: number) => string;
  getDirectParticipant: (chat: ChatSummary, currentUser: UserProfile) => Participant | null;
};

export function SidebarUtilitySheets({
  sheet,
  activeChat,
  sessionUser,
  sessionToken,
  conferenceComposerMode,
  conferenceChatId,
  conferenceEditingId,
  conferenceTitle,
  conferenceScheduledAt,
  conferenceCandidates,
  conferenceParticipantUsernames,
  contactsLoading,
  createConferencePending,
  updateConferencePending,
  archivedChatsLoading,
  archivedChats,
  forwardingMessages,
  forwardableChats,
  forwardContactOptions,
  forwardPending,
  onClose,
  onCloseConferenceComposer,
  onOpenConferenceComposer,
  onConferenceTitleChange,
  onConferenceScheduledAtChange,
  onToggleConferenceParticipant,
  onSubmitCreateConferenceNow,
  onSubmitCreateConference,
  onSubmitUpdateConference,
  onOpenChatContextMenu,
  onOpenChat,
  onToggleArchiveChat,
  onCloseForward,
  onJumpToReplyTarget,
  onForwardToChat,
  onForwardToContact,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onJumpToAttachmentSourceMessage,
  createMinimumConferenceDateTime,
  buildMessagePreview,
  describeChat,
  formatMemberCount,
  getDirectParticipant,
}: Props) {
  if (sheet === "conference") {
    const isEditingConference = Boolean(conferenceEditingId);
    const isGroupConferenceComposer = Boolean(conferenceChatId);
    const conferenceSubmitPending = createConferencePending || updateConferencePending;

    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            {isEditingConference ? (
              <>
                <div className="section-title">Редактирование встречи</div>
                <p className="sheet-copy">Измени название или время запланированной встречи.</p>
              </>
            ) : null}
            {!isEditingConference ? <div className="section-title">Видеоконференции</div> : null}
            {!isEditingConference ? (
              <p className="sheet-copy">
                Запусти встречу сразу или запланируй ее на удобное время.
              </p>
            ) : null}
          </div>
          <button type="button" className="ghost-button compact" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {!isEditingConference ? (
          <div className="conference-browser-actions">
            <button
              type="button"
              className={
                conferenceComposerMode === "instant"
                  ? "ghost-button compact is-active"
                  : "ghost-button compact"
              }
              onClick={() => onOpenConferenceComposer("instant")}
            >
              Начать сейчас
            </button>
            <button
              type="button"
              className={
                conferenceComposerMode === "scheduled"
                  ? "ghost-button compact is-active"
                  : "ghost-button compact"
              }
              onClick={() => onOpenConferenceComposer("scheduled")}
            >
              Запланировать
            </button>
          </div>
        ) : null}

        {conferenceComposerMode || isEditingConference ? (
          <form
            className="conference-browser-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (isEditingConference) {
                onSubmitUpdateConference();
                return;
              }
              if (conferenceComposerMode === "instant") {
                onSubmitCreateConferenceNow();
                return;
              }
              onSubmitCreateConference();
            }}
          >
            <input
              value={conferenceTitle}
              onChange={(event) => onConferenceTitleChange(event.target.value)}
              placeholder="Название встречи"
              maxLength={120}
            />

            {conferenceComposerMode === "scheduled" || isEditingConference ? (
              <input
                type="datetime-local"
                value={conferenceScheduledAt}
                min={createMinimumConferenceDateTime()}
                onChange={(event) => onConferenceScheduledAtChange(event.target.value)}
              />
            ) : null}

            {!isEditingConference && !isGroupConferenceComposer ? (
              <div className="group-picker-list conference-picker-list">
                {contactsLoading && conferenceCandidates.length === 0 ? (
                  <div className="empty-list">Загружаем контакты...</div>
                ) : conferenceCandidates.length === 0 ? (
                  <div className="empty-list">
                    Пока некого добавлять. Создайте группу или добавьте контакты.
                  </div>
                ) : (
                  conferenceCandidates.map((contact) => {
                    const selected = conferenceParticipantUsernames.includes(contact.username);
                    return (
                      <button
                        type="button"
                        key={contact.username}
                        className={
                          selected
                            ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                            : "sheet-row sheet-row-with-avatar group-picker-row"
                        }
                        onClick={() => onToggleConferenceParticipant(contact.username)}
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

            {!isEditingConference && isGroupConferenceComposer ? (
              <div className="empty-list">
                Участники этой встречи берутся из текущего состава группы.
              </div>
            ) : null}

            <div className="conference-browser-actions">
              <button type="button" className="ghost-button compact" onClick={onCloseConferenceComposer}>
                Закрыть
              </button>
              <button type="submit" className="secondary-button" disabled={conferenceSubmitPending}>
                {conferenceSubmitPending
                  ? isEditingConference
                    ? "Сохраняем..."
                    : "Создаем..."
                  : isEditingConference
                    ? "Сохранить изменения"
                    : conferenceComposerMode === "instant"
                      ? "Создать сейчас"
                      : "Запланировать"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  if (sheet === "archive") {
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Архив</div>
            <p className="sheet-copy">Здесь лежат архивированные чаты и группы.</p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onCloseConferenceComposer}>
            Закрыть
          </button>
        </div>

        <div className="sheet-list">
          {archivedChatsLoading ? (
            <div className="empty-list">Загружаем архив...</div>
          ) : archivedChats.length === 0 ? (
            <div className="empty-list">Архив пока пуст.</div>
          ) : (
            <>
              {archivedChats.length > 0 ? <div className="section-title">Чаты</div> : null}
              {archivedChats.map((chat) => (
                <div
                  key={chat.id}
                  className="sheet-row"
                  onContextMenu={(event) => onOpenChatContextMenu(event, chat.id)}
                >
                  <div className="sheet-row-copy">
                    <strong>{chat.title}</strong>
                    <span>
                      {chat.direct
                        ? describeChat(chat, sessionUser)
                        : formatMemberCount(chat.members.length)}
                    </span>
                  </div>
                  <div className="sheet-row-actions">
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => onOpenChat(chat.id)}
                    >
                      Открыть
                    </button>
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => onToggleArchiveChat(chat.id)}
                    >
                      Вернуть
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  if (sheet === "chatMedia") {
    return (
      <ChatAttachmentBrowserSheet
        activeChat={activeChat}
        sessionToken={sessionToken}
        onClose={onClose}
        onDownloadAttachment={onDownloadAttachment}
        onLoadAttachmentPreview={onLoadAttachmentPreview}
        onJumpToSourceMessage={onJumpToAttachmentSourceMessage}
      />
    );
  }

  if (sheet === "forward") {
    const forwardingMessage = forwardingMessages[0] ?? null;
    return (
      <div className="sheet-card">
        <div className="sheet-head">
          <div>
            <div className="section-title">Переслать</div>
            <p className="sheet-copy">
              Выберите чат, группу или контакт для пересылки сообщения.
            </p>
          </div>
          <button type="button" className="ghost-button compact" onClick={onCloseForward}>
            Закрыть
          </button>
        </div>

        {forwardingMessages.length === 0 ? (
          <div className="empty-list">Сообщение для пересылки не найдено.</div>
        ) : (
          <div className="sheet-list">
            <div className="forward-preview-card">
              <span className="forward-preview-label">Сообщение</span>
              {forwardingMessage?.replyTo ? (
                <button
                  type="button"
                  className="message-reply-card is-compact"
                  onClick={() => onJumpToReplyTarget(forwardingMessage!.chatId, forwardingMessage!.replyTo!.id)}
                >
                  <span className="message-reply-accent" aria-hidden="true" />
                  <span className="message-reply-copy">
                    <strong>{forwardingMessage!.replyTo!.sender.displayName}</strong>
                    <span>{forwardingMessage!.replyTo!.preview}</span>
                  </span>
                </button>
              ) : null}
              <div className="forward-preview-body">
                <strong>{forwardingMessage!.sender.displayName}</strong>
                <p>{buildMessagePreview(forwardingMessage!.content, 180)}</p>
              </div>
              {forwardingMessages.length > 1 ? (
                <div className="forward-preview-more">
                  +{forwardingMessages.length - 1}
                </div>
              ) : null}
            </div>

            <div className="forward-target-section">
              <div className="section-title">Чаты и группы</div>
              {forwardableChats.length === 0 ? (
                <div className="empty-list">Нет других открытых чатов для пересылки.</div>
              ) : (
                forwardableChats.map((chat) => {
                  const directParticipant = getDirectParticipant(chat, sessionUser);
                  return (
                    <button
                      type="button"
                      key={chat.id}
                      className="sheet-row sheet-row-with-avatar forward-target-row"
                      onClick={() => onForwardToChat(chat.id)}
                      disabled={forwardPending}
                    >
                      <AvatarCircle
                        className="menu-row-avatar sheet-contact-avatar"
                        name={directParticipant?.displayName ?? chat.title}
                        avatarUrl={directParticipant?.avatarUrl ?? null}
                        badge={chat.direct ? undefined : "GR"}
                        online={chat.direct ? directParticipant?.online : false}
                      />
                      <div className="sheet-row-copy">
                        <strong>{chat.title}</strong>
                        <span>
                          {chat.direct
                            ? describeChat(chat, sessionUser)
                            : formatMemberCount(chat.members.length)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="forward-target-section">
              <div className="section-title">Контакты</div>
              {forwardContactOptions.length === 0 ? (
                <div className="empty-list">Нет контактов без личного чата.</div>
              ) : (
                forwardContactOptions.map((contact) => (
                  <button
                    type="button"
                    key={contact.username}
                    className="sheet-row sheet-row-with-avatar forward-target-row"
                    onClick={() => onForwardToContact(contact.username)}
                    disabled={forwardPending}
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
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
