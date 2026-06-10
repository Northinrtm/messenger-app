import { memo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import type {
  ChatSummary,
  MailMessageSummary,
  Participant,
  UserProfile,
  VideoConference,
} from "../../../lib/types";
import { useI18n } from "../../../i18n/I18nProvider";
import type { TranslationKey } from "../../../i18n";
import type { ConversationListTab } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { ConferenceCalendarPanel } from "./ConferenceCalendarPanel";
import { MailInboxPanel } from "./MailInboxPanel";

function resolveReactionMessageIds(chat: ChatSummary): string[] {
  if (chat.reactionAttentionMessageIds && chat.reactionAttentionMessageIds.length > 0) {
    return chat.reactionAttentionMessageIds;
  }
  return chat.reactionAttentionMessageId ? [chat.reactionAttentionMessageId] : [];
}

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
  chatsLoading: boolean;
  mailInbox: MailMessageSummary[];
  mailSent: MailMessageSummary[];
  mailLoading: boolean;
  mailFolder: "inbox" | "sent";
  activeMailMessageId: string | null;
  mailComposing: boolean;
  userMailAddress: string;
  tabChats: ChatSummary[];
  tabChatsEmptyText: TranslationKey;
  activeChatId: string | null;
  liveGroupConferencesByChatId: Map<string, VideoConference>;
  typingByChatId: Record<string, Participant[]>;
  draftsByChatId: Record<string, string>;
  failedChatIds: ReadonlySet<string>;
  openConference: (conferenceId: string) => void;
  openChat: (chatId: string) => void;
  startReactionTour: (chatId: string, messageIds: string[]) => void;
  openChatAtFailedMessage: (chatId: string) => void;
  openChatContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, chatId: string) => void;
  onMailSwitchFolder: (folder: "inbox" | "sent") => void;
  onMailOpenMessage: (messageId: string) => void;
  onMailCompose: () => void;
  formatConferenceListPreview: (conference: VideoConference, currentUsername: string) => string;
  formatConferenceTileTime: (value: string) => string;
  formatConferenceSchedule: (value: string) => string;
  formatMailTimestamp: (value: string) => string;
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
  chatsLoading,
  mailInbox,
  mailSent,
  mailLoading,
  mailFolder,
  activeMailMessageId,
  mailComposing,
  userMailAddress,
  tabChats,
  tabChatsEmptyText,
  activeChatId,
  liveGroupConferencesByChatId,
  typingByChatId,
  draftsByChatId,
  failedChatIds,
  openConference,
  openChat,
  startReactionTour,
  openChatAtFailedMessage,
  openChatContextMenu,
  onMailSwitchFolder,
  onMailOpenMessage,
  onMailCompose,
  formatConferenceListPreview,
  formatConferenceTileTime,
  formatConferenceSchedule,
  formatMailTimestamp,
  trimPreview,
  getDirectParticipant,
  formatTypingParticipants,
  formatChatTimestamp,
  describeChat,
  formatMemberCount,
}: Props) {
  const { t } = useI18n();
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
          {conferenceViewMode === "calendar" ? t("chatList.viewList") : t("chatList.viewCalendar")}
        </button>
        <button
          type="button"
          className="conference-list-action-btn"
          onClick={onOpenScheduleConference}
        >
          {t("chatList.schedule")}
        </button>
        <button
          type="button"
          className="conference-list-action-btn conference-list-action-btn--accent"
          onClick={onOpenStartConferenceNow}
        >
          {t("chatList.startNow")}
        </button>
      </div>
    );

    if (conferencesLoading) {
      return (
        <>
          {conferenceBrowserToggle}
          <div className="empty-list">{t("chatList.loadingConferences")}</div>
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
            {normalizedSearch ? t("list.notFound") : t("chatList.emptyScheduledConferences")}
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
                      participantPreview || t("chatList.membersAfterInvite"),
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
      <MailInboxPanel
        inbox={mailInbox}
        sent={mailSent}
        loading={mailLoading}
        folder={mailFolder}
        activeMessageId={activeMailMessageId}
        composing={mailComposing}
        userEmail={userMailAddress}
        onSwitchFolder={onMailSwitchFolder}
        onOpenMessage={onMailOpenMessage}
        onCompose={onMailCompose}
        formatMailTimestamp={formatMailTimestamp}
      />
    );
  }

  if (chatsLoading) {
    return <div className="empty-list">{t("chatList.loadingChats")}</div>;
  }

  if (tabChats.length === 0) {
    return <div className="empty-list">{t(tabChatsEmptyText)}</div>;
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
          Boolean(chat.reactionAttention) && !liveGroupConference;
        const preview = isChatTyping
          ? formatTypingParticipants(chatTypingParticipants)
          : draftPreview ||
            chat.lastMessage ||
            t("chatList.noMessages");
        const finalPreview = liveGroupConference
          ? t("chatList.liveCall", { count: liveGroupConference.activeParticipantCount })
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
                  <span className="chat-live-indicator">{t("chatList.call")}</span>
                ) : null}
              </div>

              <div className={isChatTyping ? "chat-preview-line is-typing" : "chat-preview-line"}>
                <p className={isChatTyping ? "chat-preview-copy is-typing" : "chat-preview-copy"}>
                  {draftPreview && !isChatTyping ? (
                    <span className="chat-draft">{t("chatList.draftPrefix")}</span>
                  ) : null}
                  {trimPreview(finalPreview, 88)}
                </p>
                {hasFailedOutgoingMessage || hasReactionIndicator || unread > 0 ? (
                  <span className="chat-preview-indicators">
                    {hasReactionIndicator ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className={chat.reactionAttention ? "chat-preview-reaction is-attention" : "chat-preview-reaction"}
                        title={
                          chat.reactionAttention
                            ? t("chatList.reactionNewToYours")
                            : t("chatList.reactionsOnLast")
                        }
                        aria-label={
                          chat.reactionAttention
                            ? t("chatList.reactionNewToYours")
                            : t("chatList.reactionsOnLast")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          startReactionTour(chat.id, resolveReactionMessageIds(chat));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.stopPropagation();
                            startReactionTour(chat.id, resolveReactionMessageIds(chat));
                          }
                        }}
                      >
                        {"\u263A"}
                        {chat.reactionAttentionMessageIds && chat.reactionAttentionMessageIds.length > 1
                          ? <sup className="reaction-attention-count">{chat.reactionAttentionMessageIds.length}</sup>
                          : null}
                      </span>
                    ) : null}
                    {hasFailedOutgoingMessage && !liveGroupConference ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="chat-preview-error"
                        title={t("chatList.unsentTitle")}
                        aria-label={t("chatList.goToUnsent")}
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
