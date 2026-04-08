import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

import type { ChatSummary, Participant, UserProfile, VideoConference } from "../../../lib/types";
import type { ConversationListTab } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { ConferenceCalendarPanel } from "./ConferenceCalendarPanel";

type Props = {
  activeListTab: ConversationListTab;
  conferenceViewMode: "list" | "calendar";
  onToggleConferenceViewMode: () => void;
  normalizedSearch: string;
  conferencesLoading: boolean;
  visibleConferences: VideoConference[];
  activeConferenceId: string | null;
  conferenceListScrollRef: RefObject<HTMLDivElement | null>;
  sessionUser: UserProfile;
  chatsLoading: boolean;
  tabChats: ChatSummary[];
  tabChatsEmptyText: string;
  activeChatId: string | null;
  typingByChatId: Record<string, Participant[]>;
  draftsByChatId: Record<string, string>;
  openConference: (conferenceId: string) => void;
  openChat: (chatId: string) => void;
  openChatContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, chatId: string) => void;
  formatConferenceListPreview: (conference: VideoConference, currentUsername: string) => string;
  formatConferenceTileTime: (value: string) => string;
  formatConferenceSchedule: (value: string) => string;
  trimPreview: (content: string, maxLength: number) => string;
  getDirectParticipant: (chat: ChatSummary, currentUser: UserProfile) => Participant | null;
  formatTypingParticipants: (participants: Participant[]) => string;
  formatChatTimestamp: (value: string) => string;
  describeChat: (chat: ChatSummary, currentUser: UserProfile) => string;
  formatMemberCount: (count: number) => string;
};

export function ChatListPanel({
  activeListTab,
  conferenceViewMode,
  onToggleConferenceViewMode,
  normalizedSearch,
  conferencesLoading,
  visibleConferences,
  activeConferenceId,
  conferenceListScrollRef,
  sessionUser,
  chatsLoading,
  tabChats,
  tabChatsEmptyText,
  activeChatId,
  typingByChatId,
  draftsByChatId,
  openConference,
  openChat,
  openChatContextMenu,
  formatConferenceListPreview,
  formatConferenceTileTime,
  formatConferenceSchedule,
  trimPreview,
  getDirectParticipant,
  formatTypingParticipants,
  formatChatTimestamp,
  describeChat,
  formatMemberCount,
}: Props) {
  if (activeListTab === "conferences") {
    const conferenceBrowserToggle = (
      <div className="conference-list-inline-toolbar">
        <button
          type="button"
          className={
            conferenceViewMode === "calendar"
              ? "conference-list-toggle is-active"
              : "conference-list-toggle"
          }
          onClick={onToggleConferenceViewMode}
        >
          {conferenceViewMode === "calendar" ? "Список" : "Календарь"}
        </button>
      </div>
    );

    if (conferencesLoading) {
      return (
        <>
          {conferenceBrowserToggle}
          <div className="empty-list">Загружаем видеоконференции...</div>
        </>
      );
    }

    if (conferenceViewMode === "calendar") {
      return (
        <ConferenceCalendarPanel
          header={conferenceBrowserToggle}
          key={normalizedSearch || "conference-calendar"}
          conferences={visibleConferences}
          activeConferenceId={activeConferenceId}
          currentUsername={sessionUser.username}
          normalizedSearch={normalizedSearch}
          scrollContainerRef={conferenceListScrollRef}
          onOpenConference={openConference}
          formatConferenceListPreview={formatConferenceListPreview}
          formatConferenceTileTime={formatConferenceTileTime}
          formatConferenceSchedule={formatConferenceSchedule}
          formatMemberCount={formatMemberCount}
        />
      );
    }

    if (visibleConferences.length === 0) {
      return (
        <>
          {conferenceBrowserToggle}
          <div className="empty-list">
            {normalizedSearch ? "Ничего не найдено." : "Пока нет запланированных видеоконференций."}
          </div>
        </>
      );
    }

    return (
      <>
        {conferenceBrowserToggle}
        {visibleConferences.map((conference) => {
          const participantPreview = formatConferenceListPreview(conference, sessionUser.username);
          return (
            <button
              type="button"
              key={conference.id}
              className={
                conference.id === activeConferenceId
                  ? "chat-tile north-chat-tile is-active"
                  : "chat-tile north-chat-tile"
              }
              onClick={() => openConference(conference.id)}
            >
              <AvatarCircle className="avatar north-avatar" name={conference.title} badge="VC" />

              <div className="chat-copy">
                <div className="chat-line">
                  <div className="chat-title-wrap">
                    <span className="chat-type-mark is-conference">VC</span>
                    <strong>{conference.title}</strong>
                  </div>
                  <span>{formatConferenceTileTime(conference.scheduledAt)}</span>
                </div>

                <div className="chat-detail-line">
                  <span>{formatConferenceSchedule(conference.scheduledAt)}</span>
                  <span className="chat-detail-dot">|</span>
                  <span>{formatMemberCount(conference.participants.length)}</span>
                </div>

                <div className="chat-preview-line">
                  <p className="chat-preview-copy">
                    {trimPreview(
                      participantPreview || "Участники будут видны после приглашения.",
                      88,
                    )}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </>
    );
  }

  if (chatsLoading) {
    return (
      <div className="empty-list">
        {activeListTab === "dialogs" ? "Загружаем диалоги..." : "Загружаем группы..."}
      </div>
    );
  }

  if (tabChats.length === 0) {
    return <div className="empty-list">{tabChatsEmptyText}</div>;
  }

  return (
    <>
      {tabChats.map((chat) => {
        const directParticipant = getDirectParticipant(chat, sessionUser);
        const unread = chat.unreadCount;
        const chatTypingParticipants = typingByChatId[chat.id] ?? [];
        const isChatTyping = chatTypingParticipants.length > 0;
        const draftPreview = draftsByChatId[chat.id]?.trim() ?? "";
        const preview = isChatTyping
          ? formatTypingParticipants(chatTypingParticipants)
          : draftPreview || chat.lastMessage || "Нет сообщений";
        const previewTimestamp = chat.lastMessageAt ?? chat.updatedAt;

        return (
          <button
            type="button"
            key={chat.id}
            className={
              chat.id === activeChatId
                ? "chat-tile north-chat-tile is-active"
                : unread > 0
                  ? "chat-tile north-chat-tile is-unread"
                  : "chat-tile north-chat-tile"
            }
            onClick={() => openChat(chat.id)}
            onContextMenu={(event) => openChatContextMenu(event, chat.id)}
          >
            <AvatarCircle
              className="avatar north-avatar"
              name={directParticipant?.displayName ?? chat.title}
              avatarUrl={chat.direct ? directParticipant?.avatarUrl ?? null : chat.avatarUrl}
              badge={chat.direct ? undefined : "GR"}
              online={chat.direct ? directParticipant?.online : false}
            />

            <div className="chat-copy">
              <div className="chat-line">
                <div className="chat-title-wrap">
                  {!chat.direct ? <span className="chat-type-mark is-group">GR</span> : null}
                  <strong>{chat.title}</strong>
                </div>
                <span>{formatChatTimestamp(previewTimestamp)}</span>
              </div>

              <div className="chat-detail-line">
                <span>{describeChat(chat, sessionUser)}</span>
                {!chat.direct ? <span className="chat-detail-dot">|</span> : null}
                {!chat.direct ? <span>{formatMemberCount(chat.members.length)}</span> : null}
              </div>

              <div className={isChatTyping ? "chat-preview-line is-typing" : "chat-preview-line"}>
                <p className={isChatTyping ? "chat-preview-copy is-typing" : "chat-preview-copy"}>
                  {draftPreview && !isChatTyping ? <span className="chat-draft">Черновик: </span> : null}
                  {trimPreview(preview, 88)}
                </p>
                {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}
