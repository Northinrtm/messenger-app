import type { CSSProperties, RefObject } from "react";

import type { ChatMessage, MessageReaction } from "../../../lib/types";
import type { ContextMenuState } from "../chatUi";

type ReactionOption = {
  key: MessageReaction["key"];
  emoji: string;
  label: string;
};

type Props = {
  contextMenu: ContextMenuState;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuStyle?: CSSProperties;
  contextMenuMessage: ChatMessage | null;
  reactionOptions: ReactionOption[];
  getMessageReaction: (message: ChatMessage, key: MessageReaction["key"]) => MessageReaction | null | undefined;
  onToggleReaction: (chatId: string, messageId: string, key: MessageReaction["key"]) => void;
  canReactContextMenuMessage: boolean;
  canEditContextMenuMessage: boolean;
  canForwardContextMenuMessage: boolean;
  canPinContextMenuMessage: boolean;
  isPinnedContextMenuMessage: boolean;
  canDeleteContextMenuMessageForSelf: boolean;
  canDeleteContextMenuMessageForEveryone: boolean;
  deleteForEveryoneLabel: string;
  deleteForEveryoneHint: string;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onSelect: (message: ChatMessage) => void;
  onTogglePinned: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onDeleteForSelf: (chatId: string, messageId: string) => void;
  onDeleteForEveryone: (chatId: string, messageId: string) => void;
  onDeleteChatForSelf: (chatId: string) => void;
};

export function MessageContextMenu({
  contextMenu,
  contextMenuRef,
  contextMenuStyle,
  contextMenuMessage,
  reactionOptions,
  getMessageReaction,
  onToggleReaction,
  canReactContextMenuMessage,
  canEditContextMenuMessage,
  canForwardContextMenuMessage,
  canPinContextMenuMessage,
  isPinnedContextMenuMessage,
  canDeleteContextMenuMessageForSelf,
  canDeleteContextMenuMessageForEveryone,
  deleteForEveryoneLabel,
  deleteForEveryoneHint,
  onReply,
  onEdit,
  onForward,
  onSelect,
  onTogglePinned,
  onCopy,
  onDeleteForSelf,
  onDeleteForEveryone,
  onDeleteChatForSelf,
}: Props) {
  return (
    <div ref={contextMenuRef} className="context-menu-shell" style={contextMenuStyle}>
      {contextMenu.kind === "message" && contextMenuMessage ? (
        <div className="context-menu-reaction-bar" aria-label="Реакции на сообщение">
          {reactionOptions.map((reactionOption) => {
            const reaction = getMessageReaction(contextMenuMessage, reactionOption.key);
            return (
              <button
                key={reactionOption.key}
                type="button"
                className={
                  reaction?.reactedByCurrentUser
                    ? "context-menu-reaction-button is-active"
                    : "context-menu-reaction-button"
                }
                onClick={() =>
                  onToggleReaction(contextMenu.chatId, contextMenu.messageId, reactionOption.key)
                }
                disabled={!canReactContextMenuMessage}
                title={reactionOption.label}
                aria-label={reactionOption.label}
              >
                {reactionOption.emoji}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className="context-menu-surface"
        role="menu"
        aria-label={contextMenu.kind === "chat" ? "Chat actions" : "Message actions"}
      >
        {contextMenu.kind === "message" && contextMenuMessage ? (
          <>
            <button type="button" className="context-menu-item" role="menuitem" onClick={() => onReply(contextMenuMessage)}>
              <span className="context-menu-item-icon">↩</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">Ответить</span>
                <span className="context-menu-item-hint">Показать цитату над полем ввода</span>
              </span>
            </button>
            {canEditContextMenuMessage ? (
              <button type="button" className="context-menu-item" role="menuitem" onClick={() => onEdit(contextMenuMessage)}>
                <span className="context-menu-item-icon">✎</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">Редактировать</span>
                  <span className="context-menu-item-hint">Изменить текст сообщения</span>
                </span>
              </button>
            ) : null}
            {canForwardContextMenuMessage ? (
              <button type="button" className="context-menu-item" role="menuitem" onClick={() => onForward(contextMenuMessage)}>
                <span className="context-menu-item-icon">⇢</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">Переслать</span>
                  <span className="context-menu-item-hint">Отправить в другой чат или группу</span>
                </span>
              </button>
            ) : null}
            <button type="button" className="context-menu-item" role="menuitem" onClick={() => onSelect(contextMenuMessage)}>
              <span className="context-menu-item-icon">◉</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">Р’С‹Р±СЂР°С‚СЊ</span>
                <span className="context-menu-item-hint">РћС‚РјРµС‚РёС‚СЊ СЌС‚Рѕ Рё РґСЂСѓРіРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ</span>
              </span>
            </button>
            {canPinContextMenuMessage ? (
              <button type="button" className="context-menu-item" role="menuitem" onClick={() => onTogglePinned(contextMenuMessage)}>
                <span className="context-menu-item-icon">📌</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{isPinnedContextMenuMessage ? "Открепить" : "Закрепить"}</span>
                  <span className="context-menu-item-hint">
                    {isPinnedContextMenuMessage
                      ? "Убрать сообщение из шапки чата"
                      : "Показать сообщение сверху чата"}
                  </span>
                </span>
              </button>
            ) : null}
            <button type="button" className="context-menu-item" role="menuitem" onClick={() => onCopy(contextMenuMessage)}>
              <span className="context-menu-item-icon">⧉</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">Копировать текст</span>
                <span className="context-menu-item-hint">Скопировать сообщение в буфер</span>
              </span>
            </button>
            <button
              type="button"
              className="context-menu-item is-danger"
              role="menuitem"
              onClick={() => onDeleteForSelf(contextMenu.chatId, contextMenu.messageId)}
              disabled={!canDeleteContextMenuMessageForSelf}
            >
              <span className="context-menu-item-icon">🗑</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">Удалить у себя</span>
                <span className="context-menu-item-hint">Сообщение исчезнет только у вас</span>
              </span>
            </button>
            <button
              type="button"
              className="context-menu-item is-danger"
              role="menuitem"
              onClick={() => onDeleteForEveryone(contextMenu.chatId, contextMenu.messageId)}
              disabled={!canDeleteContextMenuMessageForEveryone}
            >
              <span className="context-menu-item-icon">🗑</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{deleteForEveryoneLabel}</span>
                <span className="context-menu-item-hint">
                  {canDeleteContextMenuMessageForEveryone
                    ? deleteForEveryoneHint
                    : "Удалить для всех можно только свои сообщения"}
                </span>
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="context-menu-item is-danger"
            role="menuitem"
            onClick={() => onDeleteChatForSelf(contextMenu.chatId)}
          >
            <span className="context-menu-item-icon">🗑</span>
            <span className="context-menu-item-copy">
              <span className="context-menu-item-label">Удалить чат у себя</span>
              <span className="context-menu-item-hint">Чат исчезнет только из вашего списка</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
