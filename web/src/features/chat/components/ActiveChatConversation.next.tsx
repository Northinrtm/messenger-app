import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatSummary,
  MessageReaction,
  MessageSnippet,
  MessageStatus,
  Participant,
  UserProfile,
  VideoConference,
} from "../../../lib/types";
import type { AttachmentUploadProgress, SubmitDraftOptions } from "../hooks/useMessageActions";
import { readSendDiagnosticRecord } from "../../../lib/sendDiagnostics";
import {
  getSendFailureDisplayLabel,
  getSendFailureDisplayTitle,
  parseStoredSendFailure,
} from "../../../lib/sendFailureDiagnostics";
import {
  findActiveMentionQuery,
  isMentionBoundary,
  normalizeMentionUsername,
  replaceActiveMentionQuery,
} from "../messageMentions";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { TimelineItem } from "../chatWorkspaceUtils";

import { AvatarCircle } from "./AvatarCircle";

type ReactionOption = {
  key: MessageReaction["key"];
  emoji: string;
  label: string;
};

type HistoryAccessNotice = {
  title: string;
  description: string;
  isPending: boolean;
};

const MESSAGE_SELECTION_COPY = {
  toolbarForward: "\u041F\u0415\u0420\u0415\u0421\u041B\u0410\u0422\u042C",
  toolbarDelete: "\u0423\u0414\u0410\u041B\u0418\u0422\u042C",
  toolbarCancel: "\u041E\u0422\u041C\u0415\u041D\u0410",
  dialogTitle:
    "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  dialogPromptSingle:
    "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435, \u0433\u0434\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435.",
  dialogPromptManyPrefix:
    "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435, \u0433\u0434\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  dialogDeleteForSelf:
    "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0443 \u0441\u0435\u0431\u044F",
  dialogDeleteForSelfHint:
    "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0438\u0441\u0447\u0435\u0437\u043D\u0443\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0443 \u0432\u0430\u0441.",
  dialogDeleteForEveryone:
    "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445",
  dialogDeleteForEveryoneHint:
    "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0438\u0441\u0447\u0435\u0437\u043D\u0443\u0442 \u0443 \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0447\u0430\u0442\u0430.",
  dialogDeleteForEveryoneDisabled:
    "\u0414\u043B\u044F \u0432\u0441\u0435\u0445 \u043C\u043E\u0436\u043D\u043E \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u044D\u0442\u043E \u043F\u043E\u0437\u0432\u043E\u043B\u044F\u044E\u0442.",
  dialogDeleteForEveryoneOnlySingle:
    "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432.",
  dialogDeleteForEveryoneOnlyManyPrefix:
    "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432",
  dialogCancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
  selectMessage: "\u0412\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  deselectMessage:
    "\u0421\u043D\u044F\u0442\u044C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
};

const COMPOSER_COPY = {
  blockedPlaceholder: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D",
  refreshPlaceholder:
    "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0447\u0430\u0442, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C",
  editPlaceholder: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  replyPlaceholder: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u0442\u0432\u0435\u0442",
  messagePlaceholder: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  replyLabel: "\u041E\u0442\u0432\u0435\u0442",
  editLabel: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
  cancelReplyAria: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442",
  cancelEditAria:
    "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
  refreshing: "\u041E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u043C...",
  attachmentsAria:
    "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B",
  removeAttachmentAria: "\u0423\u0431\u0440\u0430\u0442\u044C \u0444\u0430\u0439\u043B",
  cancelUpload: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C",
  attachFile: "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B",
  startVoiceRecording: "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435",
  stopVoiceRecording: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C",
  voiceRecordingActive: "\u0418\u0434\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u044C",
  voiceRecordingPreparing: "\u0413\u043E\u0442\u043E\u0432\u0438\u043C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435...",
  voiceRecordingUnsupported:
    "\u0412 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u043D\u0435\u0442 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0438 \u0437\u0430\u043F\u0438\u0441\u0438 \u0433\u043E\u043B\u043E\u0441\u0430.",
  voiceRecordingFailed:
    "\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0433\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F.",
  closeGlyph: "\u00D7",
  submitEditGlyph: "\u2713",
} as const;

type Props = {
  activeChat: ChatSummary;
  activeDirectParticipant: Participant | null;
  activeGroupConference: VideoConference | null;
  sessionUser: UserProfile;
  conversationSubtitle: string;
  showTypingIndicator: boolean;
  activePinnedMessage: MessageSnippet | null;
  activePinnedMessageIndex: number;
  activePinnedMessageCount: number;
  timelineItems: TimelineItem[];
  messagesLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  replyingToMessage: ChatMessage | null;
  editingMessage: ChatMessage | null;
  isSelectingMessages: boolean;
  selectedMessageCount: number;
  selectedMessageIdSet: ReadonlySet<string>;
  canForwardSelectedMessages: boolean;
  canDeleteSelectedMessagesForEveryone: boolean;
  isDeleteSelectedMessagesDialogOpen: boolean;
  activeDraft: string;
  isChatMenuOpen: boolean;
  isDirectChatBlocked: boolean;
  historyAccessNotice: HistoryAccessNotice | null;
  chatMenuButtonRef: RefObject<HTMLButtonElement | null>;
  messageStreamRef: RefObject<HTMLDivElement | null>;
  composerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onBack: () => void;
  onToggleChatMenu: () => void;
  onOpenMembers: () => void;
  onStartOrJoinGroupConference: () => void;
  onCloseChat: () => void;
  onJumpToPinned: () => void;
  onSelectPreviousPinned: () => void;
  onSelectNextPinned: () => void;
  onUnpin: () => void;
  onLoadOlderMessages: () => void;
  onOpenMessageContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    chatId: string,
    messageId: string,
  ) => void;
  onToggleReaction: (
    chatId: string,
    messageId: string,
    key: MessageReaction["key"],
  ) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onClearReply: () => void;
  onClearEdit: () => void;
  onToggleSelectedMessage: (messageId: string) => void;
  onCancelMessageSelection: () => void;
  onForwardSelectedMessages: () => void;
  onRequestDeleteSelectedMessages: () => void;
  onCloseDeleteSelectedMessagesDialog: () => void;
  onDeleteSelectedMessagesForSelf: () => void;
  onDeleteSelectedMessagesForEveryone: () => void;
  onRetryMessage: (message: ChatMessage) => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onComposerChange: (value: string) => void;
  onCommitDraft: (chatId: string, value: string) => void;
  onSubmit: (draft: string, files?: File[], options?: SubmitDraftOptions) => boolean | Promise<boolean>;
  formatClock: (value: string) => string;
  getMessageStatusClassName: (status: MessageStatus | null) => string;
  getMessageStatusGlyph: (status: MessageStatus | null) => string;
  getMessageStatusLabel: (status: MessageStatus | null) => string;
  getReactionOption: (key: MessageReaction["key"]) => ReactionOption | null | undefined;
  buildMessagePreview: (content: string, maxLength?: number) => string;
};

export function ActiveChatConversation({
  activeChat,
  activeDirectParticipant,
  activeGroupConference,
  sessionUser,
  conversationSubtitle,
  showTypingIndicator,
  activePinnedMessage,
  activePinnedMessageIndex,
  activePinnedMessageCount,
  timelineItems,
  messagesLoading,
  hasNextPage,
  isFetchingNextPage,
  replyingToMessage,
  editingMessage,
  isSelectingMessages,
  selectedMessageCount,
  selectedMessageIdSet,
  canForwardSelectedMessages,
  canDeleteSelectedMessagesForEveryone,
  isDeleteSelectedMessagesDialogOpen,
  activeDraft,
  isChatMenuOpen,
  isDirectChatBlocked,
  historyAccessNotice,
  chatMenuButtonRef,
  messageStreamRef,
  composerTextareaRef,
  onBack,
  onToggleChatMenu,
  onOpenMembers,
  onStartOrJoinGroupConference,
  onCloseChat,
  onJumpToPinned,
  onSelectPreviousPinned,
  onSelectNextPinned,
  onUnpin,
  onLoadOlderMessages,
  onOpenMessageContextMenu,
  onToggleReaction,
  onJumpToMessage,
  onClearReply,
  onClearEdit,
  onToggleSelectedMessage,
  onCancelMessageSelection,
  onForwardSelectedMessages,
  onRequestDeleteSelectedMessages,
  onCloseDeleteSelectedMessagesDialog,
  onDeleteSelectedMessagesForSelf,
  onDeleteSelectedMessagesForEveryone,
  onRetryMessage,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onComposerChange,
  onCommitDraft,
  onSubmit,
  formatClock,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
  buildMessagePreview,
}: Props) {
  const [activeMentionProfile, setActiveMentionProfile] = useState<Participant | null>(null);
  const allowDeleteSelectedMessagesForSelf = activeChat.direct;
  const activeGroupConferenceLabel = activeGroupConference
    ? `Идет созвон • ${activeGroupConference.activeParticipantCount} в эфире`
    : null;
  const canSelectPreviousPinned =
    activePinnedMessageCount > 1 && activePinnedMessageIndex > 0;
  const canSelectNextPinned =
    activePinnedMessageCount > 1 && activePinnedMessageIndex >= 0
      ? activePinnedMessageIndex < activePinnedMessageCount - 1
      : false;
  return (
    <>
      <header
        className={
          isSelectingMessages
            ? "conversation-header north-conversation-header is-selection-mode"
            : "conversation-header north-conversation-header"
        }
      >
        {isSelectingMessages ? (
          <div className="message-selection-toolbar">
            <div className="message-selection-toolbar-actions">
              <button
                type="button"
                className="ghost-button compact message-selection-action"
                onClick={onForwardSelectedMessages}
                disabled={!canForwardSelectedMessages}
              >
                {MESSAGE_SELECTION_COPY.toolbarForward} {selectedMessageCount}
              </button>
              <button
                type="button"
                className="ghost-button compact message-selection-action"
                onClick={onRequestDeleteSelectedMessages}
              >
                {MESSAGE_SELECTION_COPY.toolbarDelete} {selectedMessageCount}
              </button>
            </div>
            <button
              type="button"
              className="ghost-button compact message-selection-cancel"
              onClick={onCancelMessageSelection}
            >
              {MESSAGE_SELECTION_COPY.toolbarCancel}
            </button>
          </div>
        ) : (
        <>
        <div className="conversation-heading">
          <button type="button" className="ghost-button compact mobile-back" onClick={onBack}>
            Чаты
          </button>

          {activeChat.direct ? (
            <button
              type="button"
              ref={chatMenuButtonRef}
              className={
                isChatMenuOpen
                  ? "conversation-identity-button is-active"
                  : "conversation-identity-button"
              }
              onClick={onToggleChatMenu}
            >
              <AvatarCircle
                className="avatar conversation-avatar north-avatar"
                name={activeDirectParticipant?.displayName ?? activeChat.title}
                avatarUrl={activeDirectParticipant?.avatarUrl ?? null}
                online={activeDirectParticipant?.online}
              />
              <span className="conversation-copy">
                <span className="conversation-title-row">
                  <h3>{activeChat.title}</h3>
                </span>
                <span
                  className={
                    showTypingIndicator
                      ? "conversation-subtitle is-typing"
                      : "conversation-subtitle"
                  }
                >
                  {conversationSubtitle}
                </span>
              </span>
            </button>
          ) : (
            <div className="conversation-group-identity">
              <button
                type="button"
                ref={chatMenuButtonRef}
                className={
                  isChatMenuOpen
                    ? "conversation-group-title-button is-active"
                    : "conversation-group-title-button"
                }
                onClick={onToggleChatMenu}
              >
                <AvatarCircle
                  className="avatar conversation-avatar north-avatar"
                  name={activeChat.title}
                  avatarUrl={activeChat.avatarUrl}
                  badge="GR"
                />
                <span className="conversation-title-row">
                  <h3>{activeChat.title}</h3>
                </span>
              </button>
              <button
                type="button"
                className={
                  showTypingIndicator
                    ? "conversation-subtitle-button is-typing"
                    : "conversation-subtitle-button"
                }
                onClick={onOpenMembers}
                aria-label="Открыть участников группы"
              >
                {activeGroupConferenceLabel ?? conversationSubtitle}
              </button>
            </div>
          )}
        </div>
        <div className="conversation-actions">
          {!activeChat.direct && !historyAccessNotice && (activeChat.capabilities.canLeaveGroup || activeChat.ownerUserId === sessionUser.id) ? (
            <button
              type="button"
              className="ghost-button compact conversation-call-button"
              onClick={onStartOrJoinGroupConference}
            >
              {activeGroupConference ? "Войти" : "Созвон"}
            </button>
          ) : null}
          <button
            type="button"
            className="conversation-close-button"
            onClick={onCloseChat}
            aria-label="Закрыть чат"
          >
            {"\u00D7"}
          </button>
        </div>
        </>
        )}
      </header>

      {activePinnedMessage ? (
        <div className="pinned-message-banner">
          <div className="pinned-message-banner-head">
            <span className="pinned-message-label">
              {activePinnedMessageCount > 1
                ? `Закрепленное сообщение ${activePinnedMessageIndex + 1}/${activePinnedMessageCount}`
                : "Закрепленное сообщение"}
            </span>
            {activePinnedMessageCount > 1 ? (
              <div className="pinned-message-nav" aria-label="Навигация по закрепленным сообщениям">
                <button
                  type="button"
                  className="ghost-button compact pinned-message-nav-button"
                  onClick={onSelectPreviousPinned}
                  disabled={!canSelectPreviousPinned}
                  aria-label="Показать предыдущее закрепленное сообщение"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="ghost-button compact pinned-message-nav-button"
                  onClick={onSelectNextPinned}
                  disabled={!canSelectNextPinned}
                  aria-label="Показать следующее закрепленное сообщение"
                >
                  {">"}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="pinned-message-main" onClick={onJumpToPinned}>
            <span className="message-reply-accent pinned-message-accent" aria-hidden="true" />
            <span className="pinned-message-copy">
              <strong className="pinned-message-sender">{activePinnedMessage.sender.displayName}</strong>
              <span className="pinned-message-preview">{activePinnedMessage.preview}</span>
            </span>
          </button>
          <div className="pinned-message-actions">
            <button type="button" className="ghost-button compact" onClick={onJumpToPinned}>
              Перейти
            </button>
            <button
              type="button"
              className="ghost-button compact pinned-message-close"
              onClick={onUnpin}
              aria-label="Открепить сообщение"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {historyAccessNotice ? (
        <div
          className={
            historyAccessNotice.isPending
              ? "message-history-notice is-sticky is-pending"
              : "message-history-notice is-sticky"
          }
          role="status"
          aria-live="polite"
        >
          <div className="message-history-notice-copy">
            <strong>{historyAccessNotice.title}</strong>
            <span>{historyAccessNotice.description}</span>
          </div>
        </div>
      ) : null}

      <div className="message-stream north-message-stream" ref={messageStreamRef}>
        {hasNextPage ? (
          <button
            type="button"
            className="ghost-button history-button"
            onClick={onLoadOlderMessages}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Загружаем..." : "Показать более ранние"}
          </button>
        ) : null}

        {messagesLoading ? (
          <div className="conversation-empty north-message-stream-empty">
            <div className="empty-state north-empty-state">Загружаем сообщения...</div>
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="conversation-empty north-message-stream-empty">
            <div className="empty-state north-empty-state">
              Начните переписку. Сообщения появятся здесь.
            </div>
          </div>
        ) : (
          <ConversationTimeline
            activeChatId={activeChat.id}
            directChat={activeChat.direct}
            isSelectingMessages={isSelectingMessages}
            selectedMessageIdSet={selectedMessageIdSet}
            mentionParticipants={activeChat.members}
            timelineItems={timelineItems}
            sessionUser={sessionUser}
            onOpenMessageContextMenu={onOpenMessageContextMenu}
            onJumpToMessage={onJumpToMessage}
            onToggleSelectedMessage={onToggleSelectedMessage}
            onToggleReaction={onToggleReaction}
            onOpenMentionProfile={setActiveMentionProfile}
            onRetryMessage={onRetryMessage}
            onDownloadAttachment={onDownloadAttachment}
            onLoadAttachmentPreview={onLoadAttachmentPreview}
            formatClock={formatClock}
            getMessageStatusClassName={getMessageStatusClassName}
            getMessageStatusGlyph={getMessageStatusGlyph}
            getMessageStatusLabel={getMessageStatusLabel}
            getReactionOption={getReactionOption}
          />
        )}

        {showTypingIndicator ? (
          <div className="typing-indicator" aria-live="polite">
            <div className="typing-indicator-bubble" aria-hidden="true">
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
              <span className="typing-indicator-dot" />
            </div>
            <span className="typing-indicator-copy">{conversationSubtitle}</span>
          </div>
        ) : null}
      </div>
      <ConversationComposer
        activeChatId={activeChat.id}
        activeDraft={activeDraft}
        replyingToMessage={replyingToMessage}
        editingMessage={editingMessage}
        isDirectChatBlocked={isDirectChatBlocked}
        historyAccessNotice={historyAccessNotice}
        composerTextareaRef={composerTextareaRef}
        onComposerChange={onComposerChange}
        onCommitDraft={onCommitDraft}
        onSubmit={onSubmit}
        onJumpToMessage={onJumpToMessage}
        onClearReply={onClearReply}
        onClearEdit={onClearEdit}
        buildMessagePreview={buildMessagePreview}
        mentionParticipants={activeChat.members}
        sessionUser={sessionUser}
      />
      {isDeleteSelectedMessagesDialogOpen ? (
        <div className="message-selection-dialog-backdrop" role="presentation">
          <div
            className="message-selection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-selected-messages-title"
          >
            <div className="message-selection-dialog-copy">
              <strong id="delete-selected-messages-title">{MESSAGE_SELECTION_COPY.dialogTitle}</strong>
              <span>
                {allowDeleteSelectedMessagesForSelf
                  ? selectedMessageCount === 1
                    ? MESSAGE_SELECTION_COPY.dialogPromptSingle
                    : `${MESSAGE_SELECTION_COPY.dialogPromptManyPrefix} (${selectedMessageCount}).`
                  : selectedMessageCount === 1
                    ? MESSAGE_SELECTION_COPY.dialogDeleteForEveryoneOnlySingle
                    : `${MESSAGE_SELECTION_COPY.dialogDeleteForEveryoneOnlyManyPrefix} (${selectedMessageCount}).`}
              </span>
            </div>
            <div className="message-selection-dialog-actions">
              {allowDeleteSelectedMessagesForSelf ? (
                <button
                  type="button"
                  className="message-selection-dialog-option"
                  onClick={onDeleteSelectedMessagesForSelf}
                >
                  <strong>{MESSAGE_SELECTION_COPY.dialogDeleteForSelf}</strong>
                  <span>{MESSAGE_SELECTION_COPY.dialogDeleteForSelfHint}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="message-selection-dialog-option is-danger"
                onClick={onDeleteSelectedMessagesForEveryone}
                disabled={!canDeleteSelectedMessagesForEveryone}
              >
                <strong>{MESSAGE_SELECTION_COPY.dialogDeleteForEveryone}</strong>
                <span>
                  {canDeleteSelectedMessagesForEveryone
                    ? MESSAGE_SELECTION_COPY.dialogDeleteForEveryoneHint
                    : MESSAGE_SELECTION_COPY.dialogDeleteForEveryoneDisabled}
                </span>
              </button>
            </div>
            <button
              type="button"
              className="ghost-button compact message-selection-dialog-cancel"
              onClick={onCloseDeleteSelectedMessagesDialog}
            >
              {MESSAGE_SELECTION_COPY.dialogCancel}
            </button>
          </div>
        </div>
      ) : null}
      {activeMentionProfile ? (
        <MentionProfileDialog
          participant={activeMentionProfile}
          onClose={() => setActiveMentionProfile(null)}
        />
      ) : null}
    </>
  );
}

type ConversationComposerProps = {
  activeChatId: string;
  activeDraft: string;
  replyingToMessage: ChatMessage | null;
  editingMessage: ChatMessage | null;
  isDirectChatBlocked: boolean;
  historyAccessNotice: HistoryAccessNotice | null;
  composerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onComposerChange: (value: string) => void;
  onCommitDraft: (chatId: string, value: string) => void;
  onSubmit: Props["onSubmit"];
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onClearReply: () => void;
  onClearEdit: () => void;
  buildMessagePreview: (content: string, maxLength?: number) => string;
  mentionParticipants: Participant[];
  sessionUser: UserProfile;
};

const ConversationComposer = memo(function ConversationComposer({
  activeChatId,
  activeDraft,
  replyingToMessage,
  editingMessage,
  isDirectChatBlocked,
  historyAccessNotice,
  composerTextareaRef,
  onComposerChange,
  onCommitDraft,
  onSubmit,
  onJumpToMessage,
  onClearReply,
  onClearEdit,
  buildMessagePreview,
  mentionParticipants,
  sessionUser,
}: ConversationComposerProps) {
  const [hasComposerText, setHasComposerText] = useState(activeDraft.trim().length > 0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);
  const [attachmentUploadProgress, setAttachmentUploadProgress] =
    useState<AttachmentUploadProgress | null>(null);
  const [shouldRestoreComposerFocus, setShouldRestoreComposerFocus] = useState(false);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [voiceRecordingState, setVoiceRecordingState] = useState<"idle" | "recording" | "stopping">("idle");
  const [voiceRecordingDurationMs, setVoiceRecordingDurationMs] = useState(0);
  const previousActiveDraftRef = useRef(activeDraft);
  const previousChatIdRef = useRef(activeChatId);
  const latestComposerValueRef = useRef(activeDraft);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceRecordingStartedAtRef = useRef<number | null>(null);
  const voiceRecordingTimerRef = useRef<number | null>(null);
  const discardVoiceRecordingRef = useRef(false);
  const suppressVoiceStateResetRef = useRef(false);
  const composerUnavailable = isDirectChatBlocked || historyAccessNotice !== null;
  const attachmentsDisabled =
    composerUnavailable ||
    Boolean(editingMessage) ||
    isSubmittingComposer ||
    voiceRecordingState !== "idle";
  const selectedFileCount = editingMessage ? 0 : selectedFiles.length;
  const canSubmitComposer =
    !composerUnavailable &&
    !isSubmittingComposer &&
    voiceRecordingState === "idle" &&
    (hasComposerText || selectedFileCount > 0);
  const composerPlaceholder = historyAccessNotice
    ? historyAccessNotice.title
    : isDirectChatBlocked
      ? COMPOSER_COPY.blockedPlaceholder
    : editingMessage
        ? COMPOSER_COPY.editPlaceholder
        : replyingToMessage
        ? COMPOSER_COPY.replyPlaceholder
          : COMPOSER_COPY.messagePlaceholder;
  const mentionCandidates = mentionParticipants.filter(
    (participant) =>
      participant.username !== sessionUser.username &&
      participant.username.toLowerCase().includes(mentionQuery?.query ?? "")
  );
  const showMentionSuggestions =
    !composerUnavailable &&
    mentionQuery !== null &&
    mentionCandidates.length > 0;

  useEffect(() => {
    const previousChatId = previousChatIdRef.current;
    if (previousChatId !== activeChatId) {
      onCommitDraft(previousChatId, latestComposerValueRef.current);
      previousChatIdRef.current = activeChatId;
      previousActiveDraftRef.current = activeDraft;
      latestComposerValueRef.current = activeDraft;
      if (composerTextareaRef.current) {
        composerTextareaRef.current.value = activeDraft;
      }
      setHasComposerText(activeDraft.trim().length > 0);
      setMentionQuery(null);
      setMentionActiveIndex(0);
      return;
    }

    const previousActiveDraft = previousActiveDraftRef.current;
    previousActiveDraftRef.current = activeDraft;
    const currentValue = composerTextareaRef.current?.value ?? latestComposerValueRef.current;
    if (currentValue === activeDraft) {
      return;
    }

    if (composerTextareaRef.current && document.activeElement === composerTextareaRef.current) {
      return;
    }

    if (currentValue === previousActiveDraft) {
      latestComposerValueRef.current = activeDraft;
      if (composerTextareaRef.current) {
        composerTextareaRef.current.value = activeDraft;
      }
      setHasComposerText(activeDraft.trim().length > 0);
    }
  }, [activeChatId, activeDraft, composerTextareaRef, onCommitDraft]);

  useEffect(() => {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    stopVoiceRecording(true);
    setSelectedFiles([]);
    setAttachmentUploadProgress(null);
    setMentionQuery(null);
    setMentionActiveIndex(0);
  }, [activeChatId, editingMessage?.id]);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      stopVoiceRecording(true, false);
    };
  }, []);

  useLayoutEffect(() => {
    if (!shouldRestoreComposerFocus || isSubmittingComposer || composerUnavailable) {
      return;
    }

    composerTextareaRef.current?.focus();
    setShouldRestoreComposerFocus(false);
  }, [composerTextareaRef, composerUnavailable, isSubmittingComposer, shouldRestoreComposerFocus]);

  const addSelectedFiles = (fileList: FileList | File[]) => {
    const nextFiles = Array.from(fileList).filter((file) => file.size > 0);
    if (nextFiles.length === 0) {
      return;
    }

    setSelectedFiles((current) => [...current, ...nextFiles]);
  };

  const clearVoiceRecordingTimer = () => {
    if (voiceRecordingTimerRef.current !== null) {
      window.clearInterval(voiceRecordingTimerRef.current);
      voiceRecordingTimerRef.current = null;
    }
    voiceRecordingStartedAtRef.current = null;
  };

  const releaseVoiceRecordingResources = (resetState = true) => {
    clearVoiceRecordingTimer();
    voiceRecorderRef.current = null;
    suppressVoiceStateResetRef.current = false;
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
    voiceChunksRef.current = [];
    if (resetState) {
      setVoiceRecordingDurationMs(0);
      setVoiceRecordingState("idle");
    }
  };

  const stopVoiceRecording = (discard = false, resetState = true) => {
    discardVoiceRecordingRef.current = discard;
    suppressVoiceStateResetRef.current = !resetState;
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (resetState) {
        setVoiceRecordingState("stopping");
      }
      recorder.stop();
      return;
    }
    releaseVoiceRecordingResources(resetState);
  };

  const startVoiceRecording = async () => {
    if (
      composerUnavailable ||
      editingMessage ||
      isSubmittingComposer ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      window.alert(COMPOSER_COPY.voiceRecordingUnsupported);
      return;
    }

    if (voiceRecordingState !== "idle") {
      stopVoiceRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveVoiceRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      discardVoiceRecordingRef.current = false;
      voiceRecordingStartedAtRef.current = Date.now();
      setVoiceRecordingDurationMs(0);
      setVoiceRecordingState("recording");
      voiceRecordingTimerRef.current = window.setInterval(() => {
        const startedAt = voiceRecordingStartedAtRef.current;
        if (startedAt !== null) {
          setVoiceRecordingDurationMs(Date.now() - startedAt);
        }
      }, 250);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener(
        "stop",
        () => {
          const shouldDiscard = discardVoiceRecordingRef.current;
          const resetState = !suppressVoiceStateResetRef.current;
          discardVoiceRecordingRef.current = false;
          suppressVoiceStateResetRef.current = false;
          const chunks = voiceChunksRef.current;
          const recordingMimeType =
            recorder.mimeType || resolveVoiceRecordingMimeType() || "audio/webm";
          releaseVoiceRecordingResources(resetState);
          if (shouldDiscard || chunks.length === 0) {
            return;
          }

          const blob = new Blob(chunks, { type: recordingMimeType });
          addSelectedFiles([buildVoiceRecordingFile(blob, recordingMimeType)]);
        },
        { once: true }
      );
      recorder.start();
    } catch {
      releaseVoiceRecordingResources();
      window.alert(COMPOSER_COPY.voiceRecordingFailed);
    }
  };

  const syncMentionQuery = (value: string, caretPosition: number) => {
    const nextMentionQuery = findActiveMentionQuery(value, caretPosition);
    setMentionQuery(nextMentionQuery);
    setMentionActiveIndex(0);
  };

  const applyMentionCandidate = (participant: Participant) => {
    if (!mentionQuery || !composerTextareaRef.current) {
      return;
    }

    const replacement = replaceActiveMentionQuery(
      latestComposerValueRef.current,
      mentionQuery,
      participant.username
    );
    latestComposerValueRef.current = replacement.value;
    composerTextareaRef.current.value = replacement.value;
    composerTextareaRef.current.focus();
    composerTextareaRef.current.setSelectionRange(
      replacement.caretPosition,
      replacement.caretPosition
    );
    const nextHasComposerText = replacement.value.trim().length > 0;
    setHasComposerText((current) =>
      current === nextHasComposerText ? current : nextHasComposerText
    );
    setMentionQuery(null);
    setMentionActiveIndex(0);
    onComposerChange(replacement.value);
  };

  const submitComposer = async () => {
    if (!canSubmitComposer) {
      return;
    }

    const previousComposerValue = latestComposerValueRef.current;
    const previousSelectedFiles = selectedFiles;
    const submitFiles = editingMessage ? [] : selectedFiles;
    const uploadAbortController = submitFiles.length > 0 ? new AbortController() : null;
    uploadAbortControllerRef.current = uploadAbortController;
    setAttachmentUploadProgress(
      uploadAbortController ? buildInitialAttachmentUploadProgress(submitFiles) : null
    );
    setIsSubmittingComposer(true);
    latestComposerValueRef.current = '';
    if (composerTextareaRef.current) {
      composerTextareaRef.current.value = '';
    }
    setHasComposerText(false);
    if (!editingMessage) {
      setSelectedFiles([]);
    }
    onComposerChange('');
    try {
      const submitted = uploadAbortController
        ? await onSubmit(previousComposerValue, submitFiles, {
            signal: uploadAbortController.signal,
            onAttachmentProgress: setAttachmentUploadProgress,
          })
        : await onSubmit(previousComposerValue, submitFiles);
      if (!submitted) {
        latestComposerValueRef.current = previousComposerValue;
        if (composerTextareaRef.current) {
          composerTextareaRef.current.value = previousComposerValue;
        }
        setHasComposerText(previousComposerValue.trim().length > 0);
        if (!editingMessage) {
          setSelectedFiles(previousSelectedFiles);
        }
        onComposerChange(previousComposerValue);
      }
    } catch (error) {
      latestComposerValueRef.current = previousComposerValue;
      if (composerTextareaRef.current) {
        composerTextareaRef.current.value = previousComposerValue;
      }
      setHasComposerText(previousComposerValue.trim().length > 0);
      if (!editingMessage) {
        setSelectedFiles(previousSelectedFiles);
      }
      onComposerChange(previousComposerValue);
      throw error;
    } finally {
      if (uploadAbortControllerRef.current === uploadAbortController) {
        uploadAbortControllerRef.current = null;
      }
      setAttachmentUploadProgress(null);
      setIsSubmittingComposer(false);
      composerTextareaRef.current?.focus();
      setShouldRestoreComposerFocus(true);
      setMentionQuery(null);
      setMentionActiveIndex(0);
    }
  };

  return (
    <form
      className="composer north-composer"
      onDragOver={(event) => {
        if (!attachmentsDisabled && Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (attachmentsDisabled || event.dataTransfer.files.length === 0) {
          return;
        }
        event.preventDefault();
        addSelectedFiles(event.dataTransfer.files);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void submitComposer();
      }}
    >
      {replyingToMessage ? (
        <div className="composer-context">
          <button
            type="button"
            className="composer-reply-preview"
            onClick={() => onJumpToMessage(replyingToMessage.chatId, replyingToMessage.id)}
          >
            <span className="message-reply-accent" aria-hidden="true" />
            <span className="composer-context-copy">
              <span className="composer-context-label">{COMPOSER_COPY.replyLabel}</span>
              <strong>{replyingToMessage.sender.displayName}</strong>
              <span>{buildMessagePreview(replyingToMessage.content, 120)}</span>
            </span>
          </button>
          <button
            type="button"
            className="composer-context-close"
            onClick={onClearReply}
            aria-label={COMPOSER_COPY.cancelReplyAria}
          >
            {COMPOSER_COPY.closeGlyph}
          </button>
        </div>
      ) : null}
      {editingMessage ? (
        <div className="composer-context">
          <div className="composer-context-edit">
            <span className="message-reply-accent" aria-hidden="true" />
            <span className="composer-context-copy">
              <span className="composer-context-label">{COMPOSER_COPY.editLabel}</span>
              <strong>{editingMessage.sender.displayName}</strong>
              <span>{buildMessagePreview(editingMessage.content, 120)}</span>
            </span>
          </div>
          <button
            type="button"
            className="composer-context-close"
            onClick={onClearEdit}
            aria-label={COMPOSER_COPY.cancelEditAria}
          >
            {COMPOSER_COPY.closeGlyph}
          </button>
        </div>
      ) : null}
      {selectedFileCount > 0 ? (
        <div className="composer-attachments" aria-label={COMPOSER_COPY.attachmentsAria}>
          {selectedFiles.map((file, index) => (
            <span className="composer-attachment-chip" key={`${file.name}-${file.size}-${index}`}>
              <span className="composer-attachment-name">{file.name}</span>
              <span className="composer-attachment-size">{formatFileSize(file.size)}</span>
              <button
                type="button"
                className="composer-attachment-remove"
                onClick={() =>
                  setSelectedFiles((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                aria-label={COMPOSER_COPY.removeAttachmentAria}
              >
                {COMPOSER_COPY.closeGlyph}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {attachmentUploadProgress ? (
        <div className="composer-upload-progress" role="status" aria-live="polite">
          <div className="composer-upload-progress-copy">
            <span>{formatAttachmentUploadProgress(attachmentUploadProgress)}</span>
            <button
              type="button"
              className="ghost-button compact composer-upload-cancel"
              onClick={() => uploadAbortControllerRef.current?.abort()}
            >
              {COMPOSER_COPY.cancelUpload}
            </button>
          </div>
          <div className="composer-upload-progress-track" aria-hidden="true">
            <span
              className="composer-upload-progress-bar"
              style={{ width: `${Math.round(attachmentUploadProgress.ratio * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
      {voiceRecordingState !== "idle" ? (
        <div className="composer-recording-status" role="status" aria-live="polite">
          <span className="composer-recording-dot" aria-hidden="true" />
          <span>
            {voiceRecordingState === "stopping"
              ? COMPOSER_COPY.voiceRecordingPreparing
              : `${COMPOSER_COPY.voiceRecordingActive}: ${formatVoiceRecordingDuration(voiceRecordingDurationMs)}`}
          </span>
        </div>
      ) : null}
      <div className="north-composer-body">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="composer-file-input"
          disabled={attachmentsDisabled}
          onChange={(event) => {
            if (event.target.files) {
              addSelectedFiles(event.target.files);
            }
            event.currentTarget.value = '';
          }}
        />
        <div className="composer-action-stack">
          <button
            type="button"
            className={
              voiceRecordingState === "idle"
                ? "ghost-button compact composer-voice-button"
                : "ghost-button compact composer-voice-button is-recording"
            }
            onClick={() => void startVoiceRecording()}
            disabled={
              composerUnavailable ||
              Boolean(editingMessage) ||
              isSubmittingComposer ||
              voiceRecordingState === "stopping"
            }
            title={
              voiceRecordingState === "idle"
                ? COMPOSER_COPY.startVoiceRecording
                : COMPOSER_COPY.stopVoiceRecording
            }
            aria-label={
              voiceRecordingState === "idle"
                ? COMPOSER_COPY.startVoiceRecording
                : COMPOSER_COPY.stopVoiceRecording
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 4.5a2.8 2.8 0 0 1 2.8 2.8v5.2a2.8 2.8 0 1 1-5.6 0V7.3A2.8 2.8 0 0 1 12 4.5Z"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M6.8 11.8a5.2 5.2 0 0 0 10.4 0"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M12 17v3.2"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M9.3 20.2h5.4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
          <button
            type="button"
            className="ghost-button compact composer-attachment-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachmentsDisabled}
            title={COMPOSER_COPY.attachFile}
            aria-label={COMPOSER_COPY.attachFile}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M7.4 12.7 14.9 5.2a3.4 3.4 0 0 1 4.8 4.8l-8.7 8.7a5 5 0 0 1-7.1-7.1l8.9-8.9"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <path
                d="m8.9 14.1 7.6-7.6"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
        <div className="composer-textarea-shell">
          <textarea
            ref={composerTextareaRef}
            defaultValue={activeDraft}
            disabled={composerUnavailable}
            onChange={(event) => {
              const nextValue = event.target.value;
              const caretPosition = event.target.selectionStart ?? nextValue.length;
              latestComposerValueRef.current = nextValue;
              const nextHasComposerText = nextValue.trim().length > 0;
              setHasComposerText((current) =>
                current === nextHasComposerText ? current : nextHasComposerText
              );
              syncMentionQuery(nextValue, caretPosition);
              onComposerChange(nextValue);
            }}
            onBlur={() => onCommitDraft(activeChatId, latestComposerValueRef.current)}
            onPaste={(event) => {
              if (attachmentsDisabled || event.clipboardData.files.length === 0) {
                return;
              }
              addSelectedFiles(event.clipboardData.files);
              event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (showMentionSuggestions) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMentionActiveIndex((current) =>
                    mentionCandidates.length === 0 ? 0 : Math.min(current + 1, mentionCandidates.length - 1)
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionActiveIndex((current) => Math.max(current - 1, 0));
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMentionQuery(null);
                  setMentionActiveIndex(0);
                  return;
                }
                if ((event.key === "Enter" || event.key === "Tab") && mentionCandidates[mentionActiveIndex]) {
                  event.preventDefault();
                  applyMentionCandidate(mentionCandidates[mentionActiveIndex]!);
                  return;
                }
              }
              if (event.key === "PageUp" || event.key === "PageDown") {
                event.preventDefault();
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submitComposer();
              }
            }}
            onClick={(event) => {
              syncMentionQuery(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? event.currentTarget.value.length
              );
            }}
            placeholder={composerPlaceholder}
            rows={1}
          />
          {showMentionSuggestions ? (
            <div className="composer-mention-dropdown search-dropdown" role="listbox">
              {mentionCandidates.map((participant, index) => (
                <button
                  type="button"
                  key={participant.id}
                  className={
                    index === mentionActiveIndex
                      ? "search-result-row composer-mention-option is-active"
                      : "search-result-row composer-mention-option"
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyMentionCandidate(participant)}
                  role="option"
                  aria-selected={index === mentionActiveIndex}
                >
                  <AvatarCircle
                    className="avatar north-avatar"
                    name={participant.displayName}
                    avatarUrl={participant.avatarUrl ?? null}
                    online={participant.online}
                  />
                  <span className="search-result-copy">
                    <strong>{participant.displayName}</strong>
                    <span>@{participant.username}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          className="primary-button north-send-button"
          disabled={!canSubmitComposer}
          onMouseDown={(event) => event.preventDefault()}
        >
          {editingMessage ? COMPOSER_COPY.submitEditGlyph : '>'}
        </button>
      </div>
    </form>
  );
});

ConversationComposer.displayName = 'ConversationComposer';

type ConversationTimelineProps = {
  activeChatId: string;
  directChat: boolean;
  isSelectingMessages: boolean;
  selectedMessageIdSet: ReadonlySet<string>;
  mentionParticipants: Participant[];
  timelineItems: TimelineItem[];
  sessionUser: UserProfile;
  onRender?: () => void;
  onOpenMessageContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    chatId: string,
    messageId: string,
  ) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onToggleSelectedMessage: (messageId: string) => void;
  onToggleReaction: (
    chatId: string,
    messageId: string,
    key: MessageReaction["key"],
  ) => void;
  onOpenMentionProfile: (participant: Participant) => void;
  onRetryMessage: (message: ChatMessage) => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  formatClock: (value: string) => string;
  getMessageStatusClassName: (status: MessageStatus | null) => string;
  getMessageStatusGlyph: (status: MessageStatus | null) => string;
  getMessageStatusLabel: (status: MessageStatus | null) => string;
  getReactionOption: (key: MessageReaction["key"]) => ReactionOption | null | undefined;
};

export const ConversationTimeline = memo(function ConversationTimeline({
  activeChatId,
  directChat,
  isSelectingMessages,
  selectedMessageIdSet,
  mentionParticipants,
  timelineItems,
  sessionUser,
  onRender,
  onOpenMessageContextMenu,
  onJumpToMessage,
  onToggleSelectedMessage,
  onToggleReaction,
  onOpenMentionProfile,
  onRetryMessage,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  formatClock,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
}: ConversationTimelineProps) {
  onRender?.();
  return (
    <>
      {timelineItems.map((item) =>
        item.type === "day" ? (
          <div key={item.key} className="timeline-day">
            <span>{item.label}</span>
          </div>
        ) : (
          <MessageRow
            key={item.key}
            chatId={activeChatId}
            directChat={directChat}
            isSelectingMessages={isSelectingMessages}
            selected={selectedMessageIdSet.has(item.message.id)}
            mentionParticipants={mentionParticipants}
            message={item.message}
            sessionUser={sessionUser}
            onOpenContextMenu={onOpenMessageContextMenu}
            onJumpToMessage={onJumpToMessage}
            onToggleSelectedMessage={onToggleSelectedMessage}
            onToggleReaction={onToggleReaction}
            onOpenMentionProfile={onOpenMentionProfile}
            formatClock={formatClock}
            getMessageStatusClassName={getMessageStatusClassName}
            getMessageStatusGlyph={getMessageStatusGlyph}
            getMessageStatusLabel={getMessageStatusLabel}
            getReactionOption={getReactionOption}
            onRetryMessage={onRetryMessage}
            onDownloadAttachment={onDownloadAttachment}
            onLoadAttachmentPreview={onLoadAttachmentPreview}
          />
        ),
      )}
    </>
  );
});
ConversationTimeline.displayName = "ConversationTimeline";

type MessageRowProps = {
  chatId: string;
  directChat: boolean;
  isSelectingMessages: boolean;
  selected: boolean;
  mentionParticipants: Participant[];
  message: ChatMessage;
  sessionUser: UserProfile;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, chatId: string, messageId: string) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onToggleSelectedMessage: (messageId: string) => void;
  onToggleReaction: (chatId: string, messageId: string, key: MessageReaction["key"]) => void;
  onOpenMentionProfile: (participant: Participant) => void;
  onRetryMessage: (message: ChatMessage) => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  formatClock: (value: string) => string;
  getMessageStatusClassName: (status: MessageStatus | null) => string;
  getMessageStatusGlyph: (status: MessageStatus | null) => string;
  getMessageStatusLabel: (status: MessageStatus | null) => string;
  getReactionOption: (key: MessageReaction["key"]) => ReactionOption | null | undefined;
};

const MessageRow = memo(function MessageRow({
  chatId,
  directChat,
  isSelectingMessages,
  selected,
  mentionParticipants,
  message,
  sessionUser,
  onOpenContextMenu,
  onJumpToMessage,
  onToggleSelectedMessage,
  onToggleReaction,
  onOpenMentionProfile,
  onRetryMessage,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  formatClock,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
}: MessageRowProps) {
  const ownMessage = message.sender.id === sessionUser.id;
  const metaTimestamp = formatClock(message.editedAt ?? message.createdAt);
  const failedSendSummary =
    ownMessage &&
    message.status?.state === "FAILED" &&
    message.clientMessageId
      ? parseStoredSendFailure(readSendDiagnosticRecord(message.clientMessageId)?.result)
      : null;
  const failedSendLabel = getSendFailureDisplayLabel(failedSendSummary);
  const failedSendTitle = getSendFailureDisplayTitle(failedSendSummary);
  const showSenderAvatar = !ownMessage && !directChat;
  const messageMetaTrailing = (
    <div className="message-meta-trailing">
      {message.editedAt ? <span className="message-edited-label">изменено</span> : null}
      <span>{metaTimestamp}</span>
      {ownMessage ? (
        <span
          className={getMessageStatusClassName(message.status)}
          title={getMessageStatusLabel(message.status)}
          aria-label={getMessageStatusLabel(message.status)}
        >
          {getMessageStatusGlyph(message.status)}
        </span>
      ) : null}
    </div>
  );
  const rowClassName = directChat
    ? ownMessage
      ? "message-row is-mine is-direct"
      : "message-row is-direct"
    : ownMessage
      ? "message-row is-mine"
      : "message-row";
  const usesInlineBottomMeta = directChat && ownMessage && message.status?.state === "FAILED";
  const selectionRowClassName = isSelectingMessages
    ? `${rowClassName} is-selecting${selected ? " is-selected" : ""}`
    : rowClassName;
  const bubbleClassName = ownMessage ? "message-bubble is-mine" : "message-bubble";
  const selectionBubbleClassName = isSelectingMessages
    ? `${bubbleClassName}${usesInlineBottomMeta ? " has-inline-meta" : ""} is-selection-mode${selected ? " is-selected" : ""}`
    : `${bubbleClassName}${usesInlineBottomMeta ? " has-inline-meta" : ""}`;
  const attachments = message.attachments ?? [];
  const shouldShowMessageText =
    message.content.trim().length > 0 && !isAttachmentOnlyFallback(message.content, attachments);
  const forwardedLabel = message.forwardedFrom
    ? `Переслано от ${message.forwardedFrom.sender.displayName}`
    : message.forwarded
      ? "Переслано"
      : null;
  const resolveMentionParticipant = (username: string) => {
    const normalizedUsername = normalizeMentionUsername(username);
    return (
      mentionParticipants.find(
        (participant) => participant.username.toLowerCase() === normalizedUsername
      ) ?? null
    );
  };

  return (
    <div className={selectionRowClassName}>
      {showSenderAvatar ? (
        <AvatarCircle
          className="avatar message-row-avatar north-avatar"
          name={message.sender.displayName}
          avatarUrl={message.sender.avatarUrl ?? null}
          online={message.sender.online}
        />
      ) : null}
      <div className="message-bubble-shell">
      <article
        data-message-id={message.id}
        data-message-anchor-key={message.clientMessageId ?? message.id}
        className={selectionBubbleClassName}
        onContextMenu={(event) => {
          if (isSelectingMessages) {
            event.preventDefault();
            return;
          }
          onOpenContextMenu(event, chatId, message.id);
        }}
      >
        {isSelectingMessages ? (
          <button
            type="button"
            className="message-selection-overlay"
            onClick={() => onToggleSelectedMessage(message.id)}
            aria-label={selected ? "Снять выделение" : "Выделить сообщение"}
            aria-pressed={selected}
          />
        ) : null}
        <div className={directChat ? "message-meta is-compact" : "message-meta"}>
          {!directChat ? <strong>{ownMessage ? "Вы" : message.sender.displayName}</strong> : <span />}
          <div className="message-meta-trailing">
            {message.editedAt ? <span className="message-edited-label">изменено</span> : null}
            <span>{metaTimestamp}</span>
            {ownMessage ? (
              <span
                className={getMessageStatusClassName(message.status)}
                title={getMessageStatusLabel(message.status)}
                aria-label={getMessageStatusLabel(message.status)}
              >
                {getMessageStatusGlyph(message.status)}
              </span>
            ) : null}
          </div>
        </div>
        {message.replyTo ? (
          <button
            type="button"
            className="message-reply-card"
            onClick={() => onJumpToMessage(chatId, message.replyTo!.id)}
          >
            <span className="message-reply-accent" aria-hidden="true" />
            <span className="message-reply-copy">
              <strong>{message.replyTo.sender.displayName}</strong>
              <span>{message.replyTo.preview}</span>
            </span>
          </button>
        ) : null}
        {forwardedLabel ? <div className="message-forwarded-label">{forwardedLabel}</div> : null}
        {shouldShowMessageText ? (
          <div className="message-body">
            {renderMessageTextWithLinks(message.content, resolveMentionParticipant, onOpenMentionProfile)}
          </div>
        ) : null}
        {attachments.length > 0 ? (
          <div className="message-attachments" aria-label="Вложения">
            {attachments.map((attachment) => (
              <MessageAttachmentView
                key={attachment.id}
                chatId={chatId}
                attachment={attachment}
                onDownloadAttachment={onDownloadAttachment}
                onLoadAttachmentPreview={onLoadAttachmentPreview}
              />
            ))}
          </div>
        ) : null}
        {ownMessage && message.status?.state === "FAILED" ? (
          <div className="message-failure-actions">
            <span className="message-failure-label" title={failedSendTitle}>
              {failedSendLabel}
            </span>
            <button
              type="button"
              className="message-retry-button"
              title={failedSendTitle}
              onClick={() => onRetryMessage(message)}
            >
              Retry
            </button>
          </div>
        ) : null}
        {directChat ? (
          <div
            className={
              usesInlineBottomMeta
                ? "message-meta-clone message-meta is-compact is-bottom is-inline"
                : "message-meta-clone message-meta is-compact is-bottom"
            }
          >
            {messageMetaTrailing}
          </div>
        ) : null}
        {message.reactions.length > 0 ? (
          <div className="message-reactions" aria-label="Реакции на сообщение">
            {message.reactions.map((reaction) => {
              const reactionOption = getReactionOption(reaction.key);
              return (
                <button
                  type="button"
                  key={reaction.key}
                  className={
                    reaction.reactedByCurrentUser
                      ? "message-reaction-button is-active"
                      : "message-reaction-button"
                  }
                  onClick={() => onToggleReaction(chatId, message.id, reaction.key)}
                  disabled={ownMessage}
                  title={reactionOption?.label ?? reaction.key}
                  aria-label={reactionOption?.label ?? reaction.key}
                >
                  <span>{reactionOption?.emoji ?? reaction.key}</span>
                  {reaction.count > 1 ? (
                    <span className="message-reaction-count">{reaction.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </article>
      {isSelectingMessages ? (
        <button
          type="button"
          className={selected ? "message-select-toggle is-selected" : "message-select-toggle"}
          onClick={() => onToggleSelectedMessage(message.id)}
          aria-label={selected ? "Снять выделение" : "Выделить сообщение"}
          aria-pressed={selected}
        >
          <span className="message-select-toggle-ring" aria-hidden="true" />
        </button>
      ) : null}
      </div>
    </div>
  );
});
MessageRow.displayName = "MessageRow";

type MessageAttachmentViewProps = {
  chatId: string;
  attachment: ChatMessageAttachment;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
};

const MessageAttachmentView = memo(function MessageAttachmentView({
  chatId,
  attachment,
  onDownloadAttachment,
  onLoadAttachmentPreview,
}: MessageAttachmentViewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewImageLoaded, setPreviewImageLoaded] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioPreviewError, setAudioPreviewError] = useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const inFlightPreviewRef = useRef<Promise<Blob> | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const audioPreviewObjectUrlRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAudioRef = useRef(false);
  const waveformBars = useMemo(() => {
    const BAR_COUNT = 40;
    const seed = attachment.id.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xffff, 0);
    return Array.from({ length: BAR_COUNT }, (_, i) =>
      Math.round(15 + Math.abs(Math.sin(seed + i * 2.7)) * 85)
    );
  }, [attachment.id]);
  const imageAttachment = isImageAttachment(attachment);
  const audioAttachment = isAudioAttachment(attachment);
  const previewIdentity = [
    chatId,
    attachment.id,
    attachment.mimeType,
    attachment.sizeBytes,
  ].join(":");

  const loadPreviewBlob = () => {
    if (inFlightPreviewRef.current) {
      return inFlightPreviewRef.current;
    }

    const request = onLoadAttachmentPreview(chatId, attachment).finally(() => {
      if (inFlightPreviewRef.current === request) {
        inFlightPreviewRef.current = null;
      }
    });
    inFlightPreviewRef.current = request;
    return request;
  };

  const loadAudioPreview = (autoplay = false) => {
    if (audioPreviewUrl && !audioPreviewError) {
      if (autoplay) {
        window.setTimeout(() => {
          void audioElementRef.current?.play().catch(() => undefined);
        }, 0);
      }
      return;
    }
    if (audioPreviewLoading) {
      autoPlayAudioRef.current = autoPlayAudioRef.current || autoplay;
      return;
    }

    autoPlayAudioRef.current = autoplay;
    setAudioPreviewLoading(true);
    setAudioPreviewError(false);
    loadPreviewBlob()
      .then((blob) => {
        if (audioPreviewObjectUrlRef.current) {
          window.URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
        }
        const objectUrl = window.URL.createObjectURL(blob);
        audioPreviewObjectUrlRef.current = objectUrl;
        setAudioPreviewUrl(objectUrl);
      })
      .catch(() => {
        setAudioPreviewError(true);
      })
      .finally(() => setAudioPreviewLoading(false));
  };

  useEffect(() => {
    if (!imageAttachment) {
      inFlightPreviewRef.current = null;
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setPreviewError(true);
      }
    }, 15_000);

    inFlightPreviewRef.current = null;
    if (previewObjectUrlRef.current) {
      window.URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewError(false);
    setPreviewImageLoaded(false);

    loadPreviewBlob()
      .then((blob) => {
        window.clearTimeout(timeoutId);
        if (cancelled) {
          return;
        }

        const objectUrl = window.URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [imageAttachment, previewIdentity]);

  useEffect(() => {
    if (audioPreviewObjectUrlRef.current) {
      window.URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
      audioPreviewObjectUrlRef.current = null;
    }
    setAudioPreviewUrl(null);
    setAudioPreviewError(false);
    setAudioPreviewLoading(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    autoPlayAudioRef.current = false;
    if (!audioAttachment) {
      return;
    }
  }, [audioAttachment, previewIdentity]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      if (audioPreviewObjectUrlRef.current) {
        window.URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
        audioPreviewObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!audioPreviewUrl || !autoPlayAudioRef.current) {
      return;
    }

    autoPlayAudioRef.current = false;
    void audioElementRef.current?.play().catch(() => undefined);
  }, [audioPreviewUrl]);

  useEffect(() => {
    const el = audioElementRef.current;
    if (!el) return;
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onDuration = () => { if (isFinite(el.duration)) setDuration(el.duration); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); el.currentTime = 0; };
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDuration);
    el.addEventListener("loadedmetadata", onDuration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDuration);
      el.removeEventListener("loadedmetadata", onDuration);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  const handlePlayPause = () => {
    if (!audioPreviewUrl) {
      loadAudioPreview(true);
      return;
    }
    const el = audioElementRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      void el.play().catch(() => undefined);
    }
  };

  const handleSeek = (barIndex: number) => {
    const el = audioElementRef.current;
    if (!el || !duration) return;
    el.currentTime = (barIndex / waveformBars.length) * duration;
    if (!isPlaying) {
      void el.play().catch(() => undefined);
    }
  };

  const openImageAttachment = () => {
    if (previewUrl && !previewError) {
      const openedWindow = window.open(previewUrl, "_blank");
      if (!openedWindow) {
        onDownloadAttachment(chatId, attachment);
      } else {
        openedWindow.opener = null;
      }
      return;
    }

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = attachment.fileName;
      previewWindow.document.body.style.margin = "0";
      previewWindow.document.body.style.background = "#050d16";
      previewWindow.document.body.style.color = "#d8eafa";
      previewWindow.document.body.style.display = "grid";
      previewWindow.document.body.style.placeItems = "center";
      previewWindow.document.body.style.minHeight = "100vh";
      previewWindow.document.body.textContent = "Загружаем изображение...";
    }

    setIsOpeningPreview(true);
    loadPreviewBlob()
      .then((blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        if (previewWindow) {
          previewWindow.location.href = objectUrl;
        } else {
          const openedWindow = window.open(objectUrl, "_blank");
          if (!openedWindow) {
            onDownloadAttachment(chatId, attachment);
          } else {
            openedWindow.opener = null;
          }
        }
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
      })
      .catch(() => {
        previewWindow?.close();
        setPreviewError(true);
      })
      .finally(() => setIsOpeningPreview(false));
  };

  if (imageAttachment) {
    return (
      <button
        type="button"
        className={
          previewUrl && !previewError
            ? "message-image-attachment"
            : "message-image-attachment is-placeholder"
        }
        onClick={openImageAttachment}
        title="Открыть изображение"
        aria-label={`Открыть изображение ${attachment.fileName}`}
      >
        {previewUrl && !previewError ? (
          <>
            <img
              className={
                previewImageLoaded
                  ? "message-image-preview"
                  : "message-image-preview is-loading"
              }
              src={previewUrl}
              alt={attachment.fileName}
              onLoad={() => setPreviewImageLoaded(true)}
              onError={() => setPreviewError(true)}
            />
            {!previewImageLoaded ? (
              <span className="message-image-placeholder message-image-loading-overlay">
                Загружаем изображение...
              </span>
            ) : null}
          </>
        ) : (
          <span className="message-image-placeholder">
            {previewError ? "Превью недоступно" : "Загружаем изображение..."}
          </span>
        )}
        <span className="message-image-caption">
          <span className="message-image-name">{attachment.fileName}</span>
          <span>{formatFileSize(attachment.sizeBytes)} · {isOpeningPreview ? "Открываем..." : "Открыть"}</span>
        </span>
      </button>
    );
  }

  if (audioAttachment) {
    const BAR_COUNT = waveformBars.length;
    const progress = duration > 0 ? currentTime / duration : 0;
    const displayTime = duration > 0
      ? formatAudioTime(currentTime > 0 ? currentTime : duration)
      : formatFileSize(attachment.sizeBytes);
    return (
      <div className="message-audio-attachment">
        <button
          type="button"
          className="audio-play-btn"
          onClick={handlePlayPause}
          aria-label={isPlaying ? "Пауза" : audioPreviewError ? "Повторить" : "Воспроизвести"}
        >
          {audioPreviewLoading ? (
            <span className="audio-loading-ring" aria-hidden="true" />
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="white">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="white">
              <polygon points="8,4 20,12 8,20" />
            </svg>
          )}
        </button>
        <div className="audio-waveform-wrap">
          <div className="audio-waveform">
            {waveformBars.map((height, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={i / BAR_COUNT < progress ? "audio-waveform-bar is-played" : "audio-waveform-bar"}
                style={{ "--bar-h": `${height}%` } as CSSProperties}
                onClick={() => handleSeek(i)}
              />
            ))}
          </div>
          <div className="audio-meta">
            <span>{duration > 0 ? formatAudioTime(currentTime > 0 ? currentTime : duration) : ""}</span>
            <span>{formatFileSize(attachment.sizeBytes)}</span>
          </div>
        </div>
        <audio
          ref={audioElementRef}
          src={audioPreviewUrl ?? undefined}
          preload="none"
          style={{ display: "none" }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="message-attachment-card"
      onClick={() => onDownloadAttachment(chatId, attachment)}
    >
      <span className="message-attachment-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M7 3.8h7.4L19 8.4v11.8H7z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M14.2 3.8v4.8H19"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <span className="message-attachment-copy">
        <strong>{attachment.fileName}</strong>
        <span>{formatFileSize(attachment.sizeBytes)}</span>
      </span>
      <span className="message-attachment-action">Скачать</span>
    </button>
  );
});
MessageAttachmentView.displayName = "MessageAttachmentView";

const MESSAGE_TEXT_TOKEN_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+|@[A-Za-z][A-Za-z0-9_]{2,23}/giu;

function renderMessageTextWithLinks(
  content: string,
  resolveMentionParticipant: (username: string) => Participant | null,
  onOpenMentionProfile: (participant: Participant) => void
): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(MESSAGE_TEXT_TOKEN_PATTERN)) {
    const rawToken = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      parts.push(content.slice(cursor, index));
    }

    if (rawToken.startsWith("@") && isMentionBoundary(content, index)) {
      const participant = resolveMentionParticipant(rawToken);
      if (participant) {
        parts.push(
          <button
            type="button"
            className="message-mention"
            key={`message-mention-${index}`}
            onClick={() => onOpenMentionProfile(participant)}
          >
            @{participant.username}
          </button>,
        );
      } else {
        parts.push(rawToken);
      }
      cursor = index + rawToken.length;
      continue;
    }

    const { url, trailingText } = splitTrailingUrlPunctuation(rawToken);
    parts.push(
      <a
        className="message-link"
        href={normalizeLinkHref(url)}
        key={`message-link-${index}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {url}
      </a>,
    );
    if (trailingText) {
      parts.push(trailingText);
    }
    cursor = index + rawToken.length;
  }

  if (cursor < content.length) {
    parts.push(content.slice(cursor));
  }

  return parts;
}

function splitTrailingUrlPunctuation(value: string) {
  let urlEnd = value.length;
  while (urlEnd > 0 && /[.,!?;:)\]]/.test(value[urlEnd - 1])) {
    urlEnd -= 1;
  }

  return {
    url: value.slice(0, urlEnd),
    trailingText: value.slice(urlEnd),
  };
}

function normalizeLinkHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isAttachmentOnlyFallback(content: string, attachments: ChatMessageAttachment[]) {
  const trimmedContent = content.trim();
  if (attachments.length === 1) {
    return trimmedContent === `Файл: ${attachments[0].fileName}`;
  }

  if (attachments.length > 1) {
    return trimmedContent === `Файлы: ${attachments.length}`;
  }

  return false;
}

function formatAudioTime(seconds: number) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function isImageAttachment(attachment: ChatMessageAttachment) {
  return attachment.mimeType.toLowerCase().startsWith("image/");
}

function isAudioAttachment(attachment: ChatMessageAttachment) {
  return attachment.mimeType.toLowerCase().startsWith("audio/");
}

function resolveVoiceRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  for (const mimeType of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

function buildVoiceRecordingFile(blob: Blob, mimeType: string) {
  const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([blob], `voice-message-${timestamp}.${extension}`, {
    type: mimeType || blob.type || "audio/webm",
  });
}

function formatVoiceRecordingDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildInitialAttachmentUploadProgress(files: File[]): AttachmentUploadProgress {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    fileIndex: 0,
    fileCount: files.length,
    fileName: files[0]?.name ?? "attachment",
    loadedBytes: 0,
    phase: "uploading",
    ratio: 0,
    totalBytes,
  };
}

function formatAttachmentUploadProgress(progress: AttachmentUploadProgress) {
  const phase = "Загружаем";
  const percent = Math.round(progress.ratio * 100);
  const filePosition =
    progress.fileCount > 1 ? ` ${progress.fileIndex + 1}/${progress.fileCount}` : "";
  return `${phase}${filePosition}: ${progress.fileName} · ${percent}% · ${formatFileSize(
    progress.loadedBytes
  )}/${formatFileSize(progress.totalBytes)}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

type MentionProfileDialogProps = {
  participant: Participant;
  onClose: () => void;
};

function MentionProfileDialog({ participant, onClose }: MentionProfileDialogProps) {
  return (
    <div
      className="message-selection-dialog-backdrop mention-profile-dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mention-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Профиль ${participant.displayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="mention-profile-close"
          onClick={onClose}
          aria-label="Закрыть профиль"
        >
          ×
        </button>
        <AvatarCircle
          className="avatar mention-profile-avatar north-avatar"
          name={participant.displayName}
          avatarUrl={participant.avatarUrl ?? null}
          online={participant.online}
        />
        <div className="mention-profile-copy">
          <strong>{participant.displayName}</strong>
          <span>@{participant.username}</span>
          <span>{participant.profession?.trim() ? participant.profession : "Без статуса"}</span>
        </div>
      </div>
    </div>
  );
}



