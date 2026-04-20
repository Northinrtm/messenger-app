import type {
  ComponentProps,
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
  RefObject,
} from "react";

import type { IncomingToast } from "../hooks/useIncomingToasts";
import type { ConversationListTab } from "../chatUi";
import { ActiveConferenceConversation } from "./ActiveConferenceConversation";
import { ActiveChatConversation } from "./ActiveChatConversation";
import { ChatMembersPanel } from "./ChatMembersPanel.next";
import { ChatMenuPanel } from "./ChatMenuPanel";
import { MessageContextMenu } from "./MessageContextMenu";

type Props = {
  activeChatConversationProps: ComponentProps<typeof ActiveChatConversation> | null;
  activeConferenceConversationProps: ComponentProps<typeof ActiveConferenceConversation> | null;
  activeConferenceTitle: string | null;
  activeConferenceStatusLabel: string | null;
  activeListTab: ConversationListTab;
  chatMembersPanelRef: RefObject<HTMLDivElement | null>;
  chatMembersProps: ComponentProps<typeof ChatMembersPanel> | null;
  chatMenuPanelRef: RefObject<HTMLDivElement | null>;
  chatMenuProps: ComponentProps<typeof ChatMenuPanel> | null;
  chatsLoading: boolean;
  conferenceSurfaceRef: RefObject<HTMLDivElement | null>;
  conferenceSurfaceStyle?: CSSProperties;
  conferencesLoading: boolean;
  contextMenuProps: ComponentProps<typeof MessageContextMenu> | null;
  errorText: string | null;
  incomingToasts: IncomingToast[];
  isConferenceMiniDragging: boolean;
  isConferenceMinimized: boolean;
  onConferenceMiniSurfaceClick?: MouseEventHandler<HTMLDivElement>;
  onOpenToastChat: (chatId: string) => void;
  onStartConferenceMiniDrag: PointerEventHandler<HTMLDivElement>;
  showConference: boolean;
};

export function WorkspaceConversation({
  activeChatConversationProps,
  activeConferenceConversationProps,
  activeConferenceTitle,
  activeConferenceStatusLabel,
  activeListTab,
  chatMembersPanelRef,
  chatMembersProps,
  chatMenuPanelRef,
  chatMenuProps,
  chatsLoading,
  conferenceSurfaceRef,
  conferenceSurfaceStyle,
  conferencesLoading,
  contextMenuProps,
  errorText,
  incomingToasts,
  isConferenceMiniDragging,
  isConferenceMinimized,
  onConferenceMiniSurfaceClick,
  onOpenToastChat,
  onStartConferenceMiniDrag,
  showConference,
}: Props) {
  return (
    <>
      <section className="conversation north-conversation">
        {showConference ? (
          <div
            ref={conferenceSurfaceRef}
            className={
              isConferenceMinimized
                ? "conference-surface is-mini"
                : "conference-surface is-full"
            }
            style={conferenceSurfaceStyle}
            onClick={isConferenceMinimized ? onConferenceMiniSurfaceClick : undefined}
          >
            {isConferenceMinimized ? (
              <div
                className={
                  isConferenceMiniDragging
                    ? "conference-mini-toolbar is-draggable is-dragging"
                    : "conference-mini-toolbar is-draggable"
                }
                onPointerDown={onStartConferenceMiniDrag}
              >
                <div className="conference-mini-copy">
                  <strong>{activeConferenceTitle}</strong>
                  <span>{activeConferenceStatusLabel ?? "Конференция активна"}</span>
                </div>
              </div>
            ) : null}
            {activeConferenceConversationProps ? (
              <ActiveConferenceConversation {...activeConferenceConversationProps} />
            ) : null}
          </div>
        ) : null}

        {activeChatConversationProps ? (
          <ActiveChatConversation {...activeChatConversationProps} />
        ) : !showConference || isConferenceMinimized ? (
          chatsLoading || conferencesLoading ? (
            <div className="empty-state large north-empty-state">Загружаем данные...</div>
          ) : (
            <div className="conversation-empty">
              <div className="conversation-empty-badge">
                {activeListTab === "conferences"
                  ? "Выберите видеоконференцию слева"
                  : "Выберите, кому хотели бы написать"}
              </div>
            </div>
          )
        ) : null}

        {chatMenuProps ? (
          <div className="chat-menu-panel-shell is-popover">
            <div ref={chatMenuPanelRef} className="chat-menu-panel-frame">
              <ChatMenuPanel {...chatMenuProps} />
            </div>
          </div>
        ) : null}

        {chatMembersProps ? (
          <div className="chat-menu-panel-shell is-modal">
            <div ref={chatMembersPanelRef} className="chat-members-panel-frame">
              <ChatMembersPanel {...chatMembersProps} />
            </div>
          </div>
        ) : null}

        {errorText ? <div className="floating-error">{errorText}</div> : null}
      </section>

      {contextMenuProps ? <MessageContextMenu {...contextMenuProps} /> : null}

      {incomingToasts.length > 0 ? (
        <aside className="toast-stack" aria-live="polite">
          {incomingToasts.map((toast) => (
            <button
              type="button"
              key={toast.id}
              className="incoming-toast"
              onClick={() => onOpenToastChat(toast.chatId)}
            >
              <div className="incoming-toast-title">
                <strong>{toast.title}</strong>
                <span>{toast.senderName}</span>
              </div>
              <p>{toast.preview}</p>
            </button>
          ))}
        </aside>
      ) : null}
    </>
  );
}
