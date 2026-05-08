import { memo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

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
  liveGroupConferencesByChatId: Map<string, VideoConference>;
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

export const ChatListPanel = memo(function ChatListPanel({
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
  liveGroupConferencesByChatId,
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
          {conferenceViewMode === "calendar" ? "Р В Р’В Р В Р вЂ№Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ" : "Р В Р’В Р РЋРІвЂћСћР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р вЂ°"}
        </button>
      </div>
    );

    if (conferencesLoading) {
      return (
        <>
          {conferenceBrowserToggle}
          <div className="empty-list">Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В¶Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’В Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚В...</div>
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
            {normalizedSearch ? "Р В Р’В Р РЋРЎС™Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚Сћ." : "Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р РЋРІР‚ВР В Р’В Р Р†РІР‚С›РІР‚вЂњ."}
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
                      participantPreview || "Р В Р’В Р В РІвЂљВ¬Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚вЂњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.",
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
        {"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0447\u0430\u0442\u044B..."}
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
        const liveGroupConference = chat.direct
          ? null
          : liveGroupConferencesByChatId.get(chat.id) ?? null;
        const chatTypingParticipants = typingByChatId[chat.id] ?? [];
        const isChatTyping = chatTypingParticipants.length > 0;
        const rawDraftPreview = draftsByChatId[chat.id]?.trim() ?? "";
        const draftPreview = liveGroupConference ? "" : rawDraftPreview;
        const preview = isChatTyping
          ? formatTypingParticipants(chatTypingParticipants)
          : draftPreview || chat.lastMessage || "\u041d\u0435\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439";
        const finalPreview = liveGroupConference
          ? `\u0418\u0434\u0435\u0442 \u0441\u043e\u0437\u0432\u043e\u043d \u2022 ${liveGroupConference.activeParticipantCount} \u0432 \u044d\u0444\u0438\u0440\u0435`
          : preview;
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
                {liveGroupConference ? <span className="chat-live-indicator">{"\u0421\u043e\u0437\u0432\u043e\u043d"}</span> : null}
              </div>

              <div className={isChatTyping ? "chat-preview-line is-typing" : "chat-preview-line"}>
                <p className={isChatTyping ? "chat-preview-copy is-typing" : "chat-preview-copy"}>
                  {draftPreview && !isChatTyping ? <span className="chat-draft">{"\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a: "}</span> : null}
                  {trimPreview(finalPreview, 88)}
                </p>
                {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
});
ChatListPanel.displayName = "ChatListPanel";
