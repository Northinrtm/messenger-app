import type { CSSProperties, RefObject } from "react";

import type { ChatMessage, MessageReaction } from "../../../lib/types";
import type { ContextMenuState } from "../chatUi";

type ReactionOption = {
  key: MessageReaction["key"];
  emoji: string;
  label: string;
};

const MENU_COPY = {
  reactionsAria: "\u0420\u0435\u0430\u043A\u0446\u0438\u0438 \u043D\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  messageActionsAria: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u043C",
  chatActionsAria: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0447\u0430\u0442\u043E\u043C",
  replyLabel: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C",
  replyHint:
    "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443 \u043D\u0430\u0434 \u043F\u043E\u043B\u0435\u043C \u0432\u0432\u043E\u0434\u0430",
  replyIcon: "\u21A9",
  editLabel: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
  editHint:
    "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  editIcon: "\u270E",
  forwardLabel: "\u041F\u0435\u0440\u0435\u0441\u043B\u0430\u0442\u044C",
  forwardHint:
    "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0447\u0430\u0442 \u0438\u043B\u0438 \u0433\u0440\u0443\u043F\u043F\u0443",
  forwardIcon: "\u2197",
  selectLabel: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C",
  selectHint:
    "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u044D\u0442\u043E \u0438 \u0434\u0440\u0443\u0433\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  selectIcon: "\u2610",
  pinLabel: "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C",
  unpinLabel: "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C",
  pinHint:
    "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441\u0432\u0435\u0440\u0445\u0443 \u0447\u0430\u0442\u0430",
  unpinHint:
    "\u0423\u0431\u0440\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u0437 \u0448\u0430\u043F\u043A\u0438 \u0447\u0430\u0442\u0430",
  pinIcon: "\uD83D\uDCCC",
  copyLabel: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442",
  copyHint: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 \u0431\u0443\u0444\u0435\u0440",
  copyIcon: "\uD83D\uDCCB",
  deleteForSelfLabel: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0443 \u0441\u0435\u0431\u044F",
  deleteForSelfHint:
    "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0443 \u0432\u0430\u0441",
  deleteForEveryoneDisabled:
    "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  deleteChatForSelfLabel: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0447\u0430\u0442 \u0443 \u0441\u0435\u0431\u044F",
  deleteChatForSelfHint:
    "\u0427\u0430\u0442 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u0432\u0430\u0448\u0435\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430",
  deleteIcon: "\uD83D\uDDD1",
};

type Props = {
  contextMenu: ContextMenuState;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuStyle?: CSSProperties;
  contextMenuMessage: ChatMessage | null;
  reactionOptions: ReactionOption[];
  getMessageReaction: (
    message: ChatMessage,
    key: MessageReaction["key"]
  ) => MessageReaction | null | undefined;
  onToggleReaction: (chatId: string, messageId: string, key: MessageReaction["key"]) => void;
  canReactContextMenuMessage: boolean;
  canEditContextMenuMessage: boolean;
  canForwardContextMenuMessage: boolean;
  canPinContextMenuMessage: boolean;
  isPinnedContextMenuMessage: boolean;
  canDeleteContextMenuMessageForSelf: boolean;
  showDeleteContextMenuMessageForEveryone: boolean;
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
  showDeleteContextMenuMessageForEveryone,
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
        <div className="context-menu-reaction-bar" aria-label={MENU_COPY.reactionsAria}>
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
        aria-label={
          contextMenu.kind === "chat" ? MENU_COPY.chatActionsAria : MENU_COPY.messageActionsAria
        }
      >
        {contextMenu.kind === "message" && contextMenuMessage ? (
          <>
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => onReply(contextMenuMessage)}
            >
              <span className="context-menu-item-icon">{MENU_COPY.replyIcon}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{MENU_COPY.replyLabel}</span>
                <span className="context-menu-item-hint">{MENU_COPY.replyHint}</span>
              </span>
            </button>
            {canEditContextMenuMessage ? (
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => onEdit(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">{MENU_COPY.editIcon}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{MENU_COPY.editLabel}</span>
                  <span className="context-menu-item-hint">{MENU_COPY.editHint}</span>
                </span>
              </button>
            ) : null}
            {canForwardContextMenuMessage ? (
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => onForward(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">{MENU_COPY.forwardIcon}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{MENU_COPY.forwardLabel}</span>
                  <span className="context-menu-item-hint">{MENU_COPY.forwardHint}</span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => onSelect(contextMenuMessage)}
            >
              <span className="context-menu-item-icon">{MENU_COPY.selectIcon}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{MENU_COPY.selectLabel}</span>
                <span className="context-menu-item-hint">{MENU_COPY.selectHint}</span>
              </span>
            </button>
            {canPinContextMenuMessage ? (
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => onTogglePinned(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">{MENU_COPY.pinIcon}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">
                    {isPinnedContextMenuMessage ? MENU_COPY.unpinLabel : MENU_COPY.pinLabel}
                  </span>
                  <span className="context-menu-item-hint">
                    {isPinnedContextMenuMessage ? MENU_COPY.unpinHint : MENU_COPY.pinHint}
                  </span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => onCopy(contextMenuMessage)}
            >
              <span className="context-menu-item-icon">{MENU_COPY.copyIcon}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{MENU_COPY.copyLabel}</span>
                <span className="context-menu-item-hint">{MENU_COPY.copyHint}</span>
              </span>
            </button>
            {canDeleteContextMenuMessageForSelf ? (
              <button
                type="button"
                className="context-menu-item is-danger"
                role="menuitem"
                onClick={() => onDeleteForSelf(contextMenu.chatId, contextMenu.messageId)}
              >
                <span className="context-menu-item-icon">{MENU_COPY.deleteIcon}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{MENU_COPY.deleteForSelfLabel}</span>
                  <span className="context-menu-item-hint">{MENU_COPY.deleteForSelfHint}</span>
                </span>
              </button>
            ) : null}
            {showDeleteContextMenuMessageForEveryone ? (
              <button
                type="button"
                className="context-menu-item is-danger"
                role="menuitem"
                onClick={() => onDeleteForEveryone(contextMenu.chatId, contextMenu.messageId)}
                disabled={!canDeleteContextMenuMessageForEveryone}
              >
                <span className="context-menu-item-icon">{MENU_COPY.deleteIcon}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{deleteForEveryoneLabel}</span>
                  <span className="context-menu-item-hint">
                    {canDeleteContextMenuMessageForEveryone
                      ? deleteForEveryoneHint
                      : MENU_COPY.deleteForEveryoneDisabled}
                  </span>
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="context-menu-item is-danger"
            role="menuitem"
            onClick={() => onDeleteChatForSelf(contextMenu.chatId)}
          >
            <span className="context-menu-item-icon">{MENU_COPY.deleteIcon}</span>
            <span className="context-menu-item-copy">
              <span className="context-menu-item-label">{MENU_COPY.deleteChatForSelfLabel}</span>
              <span className="context-menu-item-hint">{MENU_COPY.deleteChatForSelfHint}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
