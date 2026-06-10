import type { CSSProperties, RefObject } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import type { ChatMessage, MessageReaction } from "../../../lib/types";
import type { ContextMenuState } from "../chatUi";

type ReactionOption = {
  key: MessageReaction["key"];
  emoji: string;
  label: string;
};

const ICONS = {
  reply: "\u21A9",
  edit: "\u270E",
  forward: "\u2197",
  select: "\u2610",
  pin: "\uD83D\uDCCC",
  copy: "\uD83D\uDCCB",
  archive: "\u21AA",
  delete: "\uD83D\uDDD1",
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
  isChatArchived: boolean;
  onToggleChatArchive: (chatId: string) => void;
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
  isChatArchived,
  onToggleChatArchive,
  onDeleteChatForSelf,
}: Props) {
  const { t } = useI18n();
  return (
    <div ref={contextMenuRef} className="context-menu-shell" style={contextMenuStyle}>
      {contextMenu.kind === "message" && contextMenuMessage ? (
        <div className="context-menu-reaction-bar" aria-label={t("msgmenu.reactionsAria")}>
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
          contextMenu.kind === "chat" ? t("msgmenu.chatActionsAria") : t("msgmenu.messageActionsAria")
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
              <span className="context-menu-item-icon">{ICONS.reply}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{t("msgmenu.reply")}</span>
                <span className="context-menu-item-hint">{t("msgmenu.replyHint")}</span>
              </span>
            </button>
            {canEditContextMenuMessage ? (
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => onEdit(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">{ICONS.edit}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{t("msgmenu.edit")}</span>
                  <span className="context-menu-item-hint">{t("msgmenu.editHint")}</span>
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
                <span className="context-menu-item-icon">{ICONS.forward}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{t("msgmenu.forward")}</span>
                  <span className="context-menu-item-hint">{t("msgmenu.forwardHint")}</span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => onSelect(contextMenuMessage)}
            >
              <span className="context-menu-item-icon">{ICONS.select}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{t("msgmenu.select")}</span>
                <span className="context-menu-item-hint">{t("msgmenu.selectHint")}</span>
              </span>
            </button>
            {canPinContextMenuMessage ? (
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => onTogglePinned(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">{ICONS.pin}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">
                    {isPinnedContextMenuMessage ? t("msgmenu.unpin") : t("msgmenu.pin")}
                  </span>
                  <span className="context-menu-item-hint">
                    {isPinnedContextMenuMessage ? t("msgmenu.unpinHint") : t("msgmenu.pinHint")}
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
              <span className="context-menu-item-icon">{ICONS.copy}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{t("msgmenu.copy")}</span>
                <span className="context-menu-item-hint">{t("msgmenu.copyHint")}</span>
              </span>
            </button>
            {canDeleteContextMenuMessageForSelf ? (
              <button
                type="button"
                className="context-menu-item is-danger"
                role="menuitem"
                onClick={() => onDeleteForSelf(contextMenu.chatId, contextMenu.messageId)}
              >
                <span className="context-menu-item-icon">{ICONS.delete}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{t("msgmenu.deleteForSelf")}</span>
                  <span className="context-menu-item-hint">{t("msgmenu.deleteForSelfHint")}</span>
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
                <span className="context-menu-item-icon">{ICONS.delete}</span>
                <span className="context-menu-item-copy">
                  <span className="context-menu-item-label">{deleteForEveryoneLabel}</span>
                  <span className="context-menu-item-hint">
                    {canDeleteContextMenuMessageForEveryone
                      ? deleteForEveryoneHint
                      : t("msgmenu.deleteForEveryoneDisabled")}
                  </span>
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => onToggleChatArchive(contextMenu.chatId)}
            >
              <span className="context-menu-item-icon">{ICONS.archive}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">
                  {isChatArchived ? t("msgmenu.restoreChat") : t("msgmenu.archiveChat")}
                </span>
                <span className="context-menu-item-hint">
                  {isChatArchived ? t("msgmenu.restoreChatHint") : t("msgmenu.archiveChatHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="context-menu-item is-danger"
              role="menuitem"
              onClick={() => onDeleteChatForSelf(contextMenu.chatId)}
            >
              <span className="context-menu-item-icon">{ICONS.delete}</span>
              <span className="context-menu-item-copy">
                <span className="context-menu-item-label">{t("msgmenu.deleteChatForSelf")}</span>
                <span className="context-menu-item-hint">{t("msgmenu.deleteChatForSelfHint")}</span>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
