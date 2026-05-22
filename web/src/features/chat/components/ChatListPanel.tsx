import { memo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import type {
  ChatSummary,
  Participant,
  UserMailbox,
  UserProfile,
  VideoConference,
} from "../../../lib/types";
import type { ConversationListTab } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { ConferenceCalendarPanel } from "./ConferenceCalendarPanel";
import { MailboxesPanel } from "./MailboxesPanel";

type Props = {
  activeListTab: ConversationListTab;
  conferenceViewMode: "list" | "calendar";
  onToggleConferenceViewMode: () => void;
  onOpenScheduleConference: () => void;
  onOpenStartConferenceNow: () => void;
  normalizedSearch: string;
  conferencesLoading: boolean;
  visibleConferences: VideoConference[];
  activeConferenceId: string | null;
  conferenceListScrollRef: RefObject<HTMLDivElement | null>;
  sessionUser: UserProfile;
  addMailboxPending: boolean;
  chatsLoading: boolean;
  mailboxError: string | null;
  mailboxInput: string;
  mailboxes: UserMailbox[];
  mailboxesLoading: boolean;
  removeMailboxPending: boolean;
  tabChats: ChatSummary[];
  tabChatsEmptyText: string;
  activeChatId: string | null;
  liveGroupConferencesByChatId: Map<string, VideoConference>;
  typingByChatId: Record<string, Participant[]>;
  draftsByChatId: Record<string, string>;
  failedChatIds: ReadonlySet<string>;
  openConference: (conferenceId: string) => void;
  openChat: (chatId: string) => void;
  openChatAtFailedMessage: (chatId: string) => void;
  openChatContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, chatId: string) => void;
  onAddMailbox: () => void;
  onMailboxInputChange: (value: string) => void;
  onRemoveMailbox: (mailboxId: string) => void;
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
  onOpenScheduleConference,
  onOpenStartConferenceNow,
  normalizedSearch,
  conferencesLoading,
  visibleConferences,
  activeConferenceId,
  conferenceListScrollRef,
  sessionUser,
  addMailboxPending,
  chatsLoading,
  mailboxError,
  mailboxInput,
  mailboxes,
  mailboxesLoading,
  removeMailboxPending,
  tabChats,
  tabChatsEmptyText,
  activeChatId,
  liveGroupConferencesByChatId,
  typingByChatId,
  draftsByChatId,
  failedChatIds,
  openConference,
  openChat,
  openChatAtFailedMessage,
  openChatContextMenu,
  onAddMailbox,
  onMailboxInputChange,
  onRemoveMailbox,
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
          {conferenceViewMode === "calendar" ? "\u0421\u043f\u0438\u0441\u043e\u043a" : "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c"}
        </button>
        <button
          type="button"
          className="conference-list-action-btn"
          onClick={onOpenScheduleConference}
        >
          {"+ \u0417\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}
        </button>
        <button
          type="button"
          className="conference-list-action-btn conference-list-action-btn--accent"
          onClick={onOpenStartConferenceNow}
        >
          {"\u25b6 \u041d\u0430\u0447\u0430\u0442\u044c \u0441\u0435\u0439\u0447\u0430\u0441"}
        </button>
      </div>
    );

    if (conferencesLoading) {
      return (
        <>
          {conferenceBrowserToggle}
          <div className="empty-list">
            {"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0432\u0438\u0434\u0435\u043e\u043a\u043e\u043d\u0444\u0435\u0440\u0435\u043d\u0446\u0438\u0438..."}
          </div>
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
            {normalizedSearch
              ? "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e."
              : "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0432\u0438\u0434\u0435\u043e\u043a\u043e\u043d\u0444\u0435\u0440\u0435\u043d\u0446\u0438\u0439."}
          </div>
        </>
      );
    }

    return (
      <>
        {conferenceBrowserToggle}
        {visibleConferences.map((conference) => {
          const participantPreview = formatConferenceListPreview(
            conference,
            sessionUser.username
          );

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
                      participantPreview ||
                        "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438 \u0431\u0443\u0434\u0443\u0442 \u0432\u0438\u0434\u043d\u044b \u043f\u043e\u0441\u043b\u0435 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f.",
                      88
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

  if (activeListTab === "mail") {
    return (
      <MailboxesPanel
        addMailboxPending={addMailboxPending}
        mailboxError={mailboxError}
        mailboxInput={mailboxInput}
        mailboxes={mailboxes}
        mailboxesLoading={mailboxesLoading}
        removeMailboxPending={removeMailboxPending}
        onAddMailbox={onAddMailbox}
        onMailboxInputChange={onMailboxInputChange}
        onRemoveMailbox={onRemoveMailbox}
      />
    );
  }

  if (chatsLoading) {
    return (
      <div className="empty-list">
        {"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0447\u0430\u0442\u044b..."}
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
        const hasFailedOutgoingMessage = failedChatIds.has(chat.id);
        const hasReactionIndicator =
          Boolean(chat.reactionAttention || chat.lastMessageHasReactions) && !liveGroupConference;
        const preview = isChatTyping
          ? formatTypingParticipants(chatTypingParticipants)
          : draftPreview ||
            chat.lastMessage ||
            "\u041d\u0435\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439";
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
                {liveGroupConference ? (
                  <span className="chat-live-indicator">
                    {"\u0421\u043e\u0437\u0432\u043e\u043d"}
                  </span>
                ) : null}
              </div>

              <div className={isChatTyping ? "chat-preview-line is-typing" : "chat-preview-line"}>
                <p className={isChatTyping ? "chat-preview-copy is-typing" : "chat-preview-copy"}>
                  {draftPreview && !isChatTyping ? (
                    <span className="chat-draft">
                      {"\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a: "}
                    </span>
                  ) : null}
                  {trimPreview(finalPreview, 88)}
                </p>
                {hasFailedOutgoingMessage || hasReactionIndicator || unread > 0 ? (
                  <span className="chat-preview-indicators">
                    {hasReactionIndicator ? (
                      <span
                        className="chat-preview-reaction"
                        title={
                          chat.reactionAttention
                            ? "\u0415\u0441\u0442\u044c \u043d\u043e\u0432\u0430\u044f \u0440\u0435\u0430\u043a\u0446\u0438\u044f \u043d\u0430 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"
                            : "\u041d\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0435\u0441\u0442\u044c \u0440\u0435\u0430\u043a\u0446\u0438\u0438"
                        }
                        aria-label={
                          chat.reactionAttention
                            ? "\u0415\u0441\u0442\u044c \u043d\u043e\u0432\u0430\u044f \u0440\u0435\u0430\u043a\u0446\u0438\u044f \u043d\u0430 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"
                            : "\u041d\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0435\u0441\u0442\u044c \u0440\u0435\u0430\u043a\u0446\u0438\u0438"
                        }
                      >
                        {"\u263A"}
                      </span>
                    ) : null}
                    {hasFailedOutgoingMessage && !liveGroupConference ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="chat-preview-error"
                        title={"\u0415\u0441\u0442\u044c \u043d\u0435\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"}
                        aria-label={"\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043d\u0435\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u043e\u043c\u0443 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044e"}
                        onClick={(event) => {
                          event.stopPropagation();
                          openChatAtFailedMessage(chat.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.stopPropagation();
                            openChatAtFailedMessage(chat.id);
                          }
                        }}
                      >
                        !
                      </span>
                    ) : null}
                    {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
});

ChatListPanel.displayName = "ChatListPanel";
