import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatSummary,
  MessageReaction,
  MessageSnippet,
  MessageStatus,
  Participant,
  UserProfile,
} from "../../../lib/types";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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

type EncryptionIdentityWarning = {
  title: string;
  description: string;
  errorText: string | null;
  actionLabel: string;
  isPending: boolean;
};

type Props = {
  activeChat: ChatSummary;
  activeDirectParticipant: Participant | null;
  archivedChatIdSet: Set<string>;
  sessionUser: UserProfile;
  conversationSubtitle: string;
  showTypingIndicator: boolean;
  activePinnedMessage: MessageSnippet | null;
  timelineItems: TimelineItem[];
  messagesLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  replyingToMessage: ChatMessage | null;
  editingMessage: ChatMessage | null;
  activeDraft: string;
  isChatMenuOpen: boolean;
  isDirectChatBlocked: boolean;
  encryptionIdentityWarning: EncryptionIdentityWarning | null;
  chatMenuButtonRef: RefObject<HTMLButtonElement | null>;
  messageStreamRef: RefObject<HTMLDivElement | null>;
  composerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onBack: () => void;
  onToggleChatMenu: () => void;
  onToggleArchive: () => void;
  onCloseChat: () => void;
  onJumpToPinned: () => void;
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
  onRecoverEncryptionIdentity: () => void;
  onRetryMessage: (message: ChatMessage) => void;
  onDownloadAttachment: (chatId: string, attachment: ChatMessageAttachment) => void;
  onLoadAttachmentPreview: (chatId: string, attachment: ChatMessageAttachment) => Promise<Blob>;
  onComposerChange: (value: string) => void;
  onSubmit: (draft: string, files?: File[]) => boolean | Promise<boolean>;
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
  archivedChatIdSet,
  sessionUser,
  conversationSubtitle,
  showTypingIndicator,
  activePinnedMessage,
  timelineItems,
  messagesLoading,
  hasNextPage,
  isFetchingNextPage,
  replyingToMessage,
  editingMessage,
  activeDraft,
  isChatMenuOpen,
  isDirectChatBlocked,
  encryptionIdentityWarning,
  chatMenuButtonRef,
  messageStreamRef,
  composerTextareaRef,
  onBack,
  onToggleChatMenu,
  onToggleArchive,
  onCloseChat,
  onJumpToPinned,
  onUnpin,
  onLoadOlderMessages,
  onOpenMessageContextMenu,
  onToggleReaction,
  onJumpToMessage,
  onClearReply,
  onClearEdit,
  onRecoverEncryptionIdentity,
  onRetryMessage,
  onDownloadAttachment,
  onLoadAttachmentPreview,
  onComposerChange,
  onSubmit,
  formatClock,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
  buildMessagePreview,
}: Props) {
  const [composerValue, setComposerValue] = useState(activeDraft);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);
  const [shouldRestoreComposerFocus, setShouldRestoreComposerFocus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerUnavailable = isDirectChatBlocked || Boolean(encryptionIdentityWarning);

  useEffect(() => {
    setComposerValue(activeDraft);
  }, [activeDraft]);

  useEffect(() => {
    setSelectedFiles([]);
  }, [activeChat.id, editingMessage?.id]);

  useLayoutEffect(() => {
    if (!shouldRestoreComposerFocus || isSubmittingComposer || composerUnavailable) {
      return;
    }

    composerTextareaRef.current?.focus();
    setShouldRestoreComposerFocus(false);
  }, [composerTextareaRef, composerUnavailable, isSubmittingComposer, shouldRestoreComposerFocus]);

  const attachmentsDisabled = composerUnavailable || Boolean(editingMessage) || isSubmittingComposer;
  const selectedFileCount = editingMessage ? 0 : selectedFiles.length;
  const canSubmitComposer =
    !composerUnavailable &&
    !isSubmittingComposer &&
    (composerValue.trim().length > 0 || selectedFileCount > 0);
  const composerPlaceholder = isDirectChatBlocked
    ? "Пользователь заблокирован"
    : encryptionIdentityWarning
      ? "Обновите чат, чтобы продолжить"
      : editingMessage
      ? "Измените сообщение"
      : replyingToMessage
        ? "Напишите ответ"
        : "Напишите сообщение";

  const addSelectedFiles = (fileList: FileList | File[]) => {
    const nextFiles = Array.from(fileList).filter((file) => file.size > 0);
    if (nextFiles.length === 0) {
      return;
    }

    setSelectedFiles((current) => [...current, ...nextFiles]);
  };

  const submitComposer = async () => {
    if (!canSubmitComposer) {
      return;
    }

    setIsSubmittingComposer(true);
    try {
      const submitted = await onSubmit(composerValue, editingMessage ? [] : selectedFiles);
      if (submitted) {
        setComposerValue("");
        setSelectedFiles([]);
      }
    } finally {
      setIsSubmittingComposer(false);
      composerTextareaRef.current?.focus();
      setShouldRestoreComposerFocus(true);
    }
  };

  return (
    <>
      <header className="conversation-header north-conversation-header">
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
                name={activeChat.title}
                avatarUrl={activeChat.avatarUrl}
                badge="GR"
              />
              <span className="conversation-copy">
                <span className="conversation-title-row">
                  <h3>{activeChat.title}</h3>
                </span>
                <p
                  className={
                    showTypingIndicator
                      ? "conversation-subtitle is-typing"
                      : "conversation-subtitle"
                  }
                >
                  {conversationSubtitle}
                </p>
              </span>
            </button>
          )}
        </div>
        <div className="conversation-actions">
          <button
            type="button"
            className="ghost-button compact archive-toggle-button"
            onClick={onToggleArchive}
          >
            {archivedChatIdSet.has(activeChat.id) ? "Вернуть" : "В архив"}
          </button>
          <button
            type="button"
            className="ghost-button compact archive-toggle-button close-chat-button"
            onClick={onCloseChat}
          >
            Закрыть
          </button>
        </div>
      </header>

      {activePinnedMessage ? (
        <div className="pinned-message-banner">
          <button type="button" className="pinned-message-main" onClick={onJumpToPinned}>
            <span className="message-reply-accent pinned-message-accent" aria-hidden="true" />
            <span className="pinned-message-copy">
              <span className="pinned-message-label">Закрепленное сообщение</span>
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
            timelineItems={timelineItems}
            sessionUser={sessionUser}
            onOpenMessageContextMenu={onOpenMessageContextMenu}
            onJumpToMessage={onJumpToMessage}
            onToggleReaction={onToggleReaction}
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

      <form
        className="composer north-composer"
        onDragOver={(event) => {
          if (!attachmentsDisabled && Array.from(event.dataTransfer.types).includes("Files")) {
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
                <span className="composer-context-label">Ответ</span>
                <strong>{replyingToMessage.sender.displayName}</strong>
                <span>{buildMessagePreview(replyingToMessage.content, 120)}</span>
              </span>
            </button>
            <button
              type="button"
              className="composer-context-close"
              onClick={onClearReply}
              aria-label="Отменить ответ"
            >
              ×
            </button>
          </div>
        ) : null}
        {editingMessage ? (
          <div className="composer-context">
            <div className="composer-context-edit">
              <span className="message-reply-accent" aria-hidden="true" />
              <span className="composer-context-copy">
                <span className="composer-context-label">Редактирование</span>
                <strong>{editingMessage.sender.displayName}</strong>
                <span>{buildMessagePreview(editingMessage.content, 120)}</span>
              </span>
            </div>
            <button
              type="button"
              className="composer-context-close"
              onClick={onClearEdit}
              aria-label="Отменить редактирование"
            >
              ×
            </button>
          </div>
        ) : null}
        {encryptionIdentityWarning ? (
          <div className="composer-encryption-warning" role="alert" aria-live="polite">
            <div className="composer-encryption-warning-copy">
              <strong>{encryptionIdentityWarning.title}</strong>
              <span>{encryptionIdentityWarning.description}</span>
              {encryptionIdentityWarning.errorText ? (
                <span className="composer-encryption-warning-error">
                  {encryptionIdentityWarning.errorText}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="ghost-button compact composer-encryption-warning-action"
              onClick={onRecoverEncryptionIdentity}
              disabled={encryptionIdentityWarning.isPending}
            >
              {encryptionIdentityWarning.isPending ? "Обновляем..." : encryptionIdentityWarning.actionLabel}
            </button>
          </div>
        ) : null}
        {selectedFileCount > 0 ? (
          <div className="composer-attachments" aria-label="Прикрепленные файлы">
            {selectedFiles.map((file, index) => (
              <span className="composer-attachment-chip" key={`${file.name}-${file.size}-${index}`}>
                <span className="composer-attachment-name">{file.name}</span>
                <span className="composer-attachment-size">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  onClick={() =>
                    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  aria-label="Убрать файл"
                >
                  ×
                </button>
              </span>
            ))}
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
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="ghost-button compact composer-attachment-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachmentsDisabled}
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
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
          <textarea
            ref={composerTextareaRef}
            value={composerValue}
            disabled={composerUnavailable || isSubmittingComposer}
            onChange={(event) => {
              const nextValue = event.target.value;
              setComposerValue(nextValue);
              onComposerChange(nextValue);
            }}
            onPaste={(event) => {
              if (attachmentsDisabled || event.clipboardData.files.length === 0) {
                return;
              }
              addSelectedFiles(event.clipboardData.files);
              event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitComposer();
              }
            }}
            placeholder={composerPlaceholder}
            rows={1}
          />
          <button
            type="submit"
            className="primary-button north-send-button"
            disabled={!canSubmitComposer}
            onMouseDown={(event) => event.preventDefault()}
          >
            {editingMessage ? "✓" : ">"}
          </button>
        </div>
      </form>
    </>
  );
}

type ConversationTimelineProps = {
  activeChatId: string;
  directChat: boolean;
  timelineItems: TimelineItem[];
  sessionUser: UserProfile;
  onRender?: () => void;
  onOpenMessageContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    chatId: string,
    messageId: string,
  ) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onToggleReaction: (
    chatId: string,
    messageId: string,
    key: MessageReaction["key"],
  ) => void;
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
  timelineItems,
  sessionUser,
  onRender,
  onOpenMessageContextMenu,
  onJumpToMessage,
  onToggleReaction,
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
            message={item.message}
            sessionUser={sessionUser}
            onOpenContextMenu={onOpenMessageContextMenu}
            onJumpToMessage={onJumpToMessage}
            onToggleReaction={onToggleReaction}
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
  message: ChatMessage;
  sessionUser: UserProfile;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, chatId: string, messageId: string) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onToggleReaction: (chatId: string, messageId: string, key: MessageReaction["key"]) => void;
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
  message,
  sessionUser,
  onOpenContextMenu,
  onJumpToMessage,
  onToggleReaction,
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
  const showSenderAvatar = !ownMessage && !directChat;
  const messageMetaTrailing = (
    <div className="message-meta-trailing">
      {message.editedAt ? <span className="message-edited-label">изменено</span> : null}
      <span>{formatClock(message.createdAt)}</span>
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
  const attachments = message.attachments ?? [];
  const shouldShowMessageText =
    message.content.trim().length > 0 && !isAttachmentOnlyFallback(message.content, attachments);

  return (
    <div className={rowClassName}>
      {showSenderAvatar ? (
        <AvatarCircle
          className="avatar message-row-avatar north-avatar"
          name={message.sender.displayName}
          avatarUrl={message.sender.avatarUrl ?? null}
          online={message.sender.online}
        />
      ) : null}
      <article
        data-message-id={message.id}
        data-message-anchor-key={message.clientMessageId ?? message.id}
        className={ownMessage ? "message-bubble is-mine" : "message-bubble"}
        onContextMenu={(event) => onOpenContextMenu(event, chatId, message.id)}
      >
        <div className={directChat ? "message-meta is-compact" : "message-meta"}>
          {!directChat ? <strong>{ownMessage ? "Вы" : message.sender.displayName}</strong> : <span />}
          <div className="message-meta-trailing">
            {message.editedAt ? <span className="message-edited-label">изменено</span> : null}
            <span>{formatClock(message.createdAt)}</span>
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
        {shouldShowMessageText ? (
          <div className="message-body">{renderMessageTextWithLinks(message.content)}</div>
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
          <button
            type="button"
            className="message-retry-button"
            onClick={() => onRetryMessage(message)}
          >
            Retry
          </button>
        ) : null}
        {directChat ? (
          <div className="message-meta-clone message-meta is-compact is-bottom">{messageMetaTrailing}</div>
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
  const inFlightPreviewRef = useRef<Promise<Blob> | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const imageAttachment = isImageAttachment(attachment);
  const previewIdentity = [
    chatId,
    attachment.id,
    attachment.key,
    attachment.iv,
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
    return () => {
      if (previewObjectUrlRef.current) {
        window.URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

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

const MESSAGE_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;

function renderMessageTextWithLinks(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(MESSAGE_URL_PATTERN)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const { url, trailingText } = splitTrailingUrlPunctuation(rawUrl);

    if (index > cursor) {
      parts.push(content.slice(cursor, index));
    }

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

    cursor = index + rawUrl.length;
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

function isImageAttachment(attachment: ChatMessageAttachment) {
  return attachment.mimeType.toLowerCase().startsWith("image/");
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

