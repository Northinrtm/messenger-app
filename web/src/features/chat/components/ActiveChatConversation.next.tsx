import type {
  ChatMessage,
  ChatSummary,
  MessageReaction,
  MessageSnippet,
  MessageStatus,
  Participant,
  UserProfile,
} from "../../../lib/types";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { TimelineItem } from "../chatWorkspaceUtils";

import { AvatarCircle } from "./AvatarCircle";

type ReactionOption = {
  key: MessageReaction["key"];
  emoji: string;
  label: string;
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
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
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
  onComposerChange,
  onSubmit,
  formatClock,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
  buildMessagePreview,
}: Props) {
  const composerPlaceholder = isDirectChatBlocked
    ? "Пользователь заблокирован"
    : editingMessage
      ? "Измените сообщение"
      : replyingToMessage
        ? "Напишите ответ"
        : "Напишите сообщение";

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
          <div className="empty-state">Загружаем сообщения...</div>
        ) : timelineItems.length === 0 ? (
          <div className="empty-state">Начните переписку. Сообщения появятся здесь.</div>
        ) : (
          timelineItems.map((item) =>
            item.type === "day" ? (
              <div key={item.key} className="timeline-day">
                <span>{item.label}</span>
              </div>
            ) : (
              <MessageRow
                key={item.key}
                chatId={activeChat.id}
                directChat={activeChat.direct}
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
              />
            ),
          )
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
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
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
        <div className="north-composer-body">
          <textarea
            ref={composerTextareaRef}
            value={activeDraft}
            disabled={isDirectChatBlocked}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={composerPlaceholder}
            rows={1}
          />
          <button
            type="submit"
            className="primary-button north-send-button"
            disabled={!activeDraft.trim() || isDirectChatBlocked}
          >
            {editingMessage ? "✓" : ">"}
          </button>
        </div>
      </form>
    </>
  );
}

type MessageRowProps = {
  chatId: string;
  directChat: boolean;
  message: ChatMessage;
  sessionUser: UserProfile;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, chatId: string, messageId: string) => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onToggleReaction: (chatId: string, messageId: string, key: MessageReaction["key"]) => void;
  formatClock: (value: string) => string;
  getMessageStatusClassName: (status: MessageStatus | null) => string;
  getMessageStatusGlyph: (status: MessageStatus | null) => string;
  getMessageStatusLabel: (status: MessageStatus | null) => string;
  getReactionOption: (key: MessageReaction["key"]) => ReactionOption | null | undefined;
};

function MessageRow({
  chatId,
  directChat,
  message,
  sessionUser,
  onOpenContextMenu,
  onJumpToMessage,
  onToggleReaction,
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
      {message.editedAt ? <span className="message-edited-label">РёР·РјРµРЅРµРЅРѕ</span> : null}
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
        <div className="message-body">{message.content}</div>
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
}

