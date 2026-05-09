import type { ComponentProps, RefObject } from "react";

import type { IncomingToast } from "../hooks/useIncomingToasts";
import type { ConversationListTab } from "../chatUi";
import { ActiveConferenceConversation } from "./ActiveConferenceConversation";
import { ActiveChatConversation } from "./ActiveChatConversation";
import { ChatMembersPanel } from "./ChatMembersPanel.next";
import { ChatMenuPanel } from "./ChatMenuPanel";
import { MessageContextMenu } from "./MessageContextMenu";

const EMPTY_STATE_COPY = {
  loading: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435...",
  selectConference:
    "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0438\u0434\u0435\u043E\u043A\u043E\u043D\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u044E \u0441\u043B\u0435\u0432\u0430",
  manageMail:
    "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0439\u0442\u0435 \u043F\u043E\u0447\u0442\u043E\u0432\u044B\u043C\u0438 \u044F\u0449\u0438\u043A\u0430\u043C\u0438 \u0441\u043B\u0435\u0432\u0430",
  selectChat:
    "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435, \u043A\u043E\u043C\u0443 \u0445\u043E\u0442\u0435\u043B\u0438 \u0431\u044B \u043D\u0430\u043F\u0438\u0441\u0430\u0442\u044C",
} as const;

type Props = {
  activeChatConversationProps: ComponentProps<typeof ActiveChatConversation> | null;
  activeConferenceConversationProps: ComponentProps<typeof ActiveConferenceConversation> | null;
  activeListTab: ConversationListTab;
  chatMembersPanelRef: RefObject<HTMLDivElement | null>;
  chatMembersProps: ComponentProps<typeof ChatMembersPanel> | null;
  chatMenuPanelRef: RefObject<HTMLDivElement | null>;
  chatMenuProps: ComponentProps<typeof ChatMenuPanel> | null;
  chatsLoading: boolean;
  conferenceSurfaceRef: RefObject<HTMLDivElement | null>;
  conferencesLoading: boolean;
  contextMenuProps: ComponentProps<typeof MessageContextMenu> | null;
  errorText: string | null;
  incomingToasts: IncomingToast[];
  isConferenceMinimized: boolean;
  onOpenToastChat: (chatId: string) => void;
  showConference: boolean;
};

export function WorkspaceConversation({
  activeChatConversationProps,
  activeConferenceConversationProps,
  activeListTab,
  chatMembersPanelRef,
  chatMembersProps,
  chatMenuPanelRef,
  chatMenuProps,
  chatsLoading,
  conferenceSurfaceRef,
  conferencesLoading,
  contextMenuProps,
  errorText,
  incomingToasts,
  isConferenceMinimized,
  onOpenToastChat,
  showConference,
}: Props) {
  return (
    <>
      <section className="conversation north-conversation">
        {showConference && activeConferenceConversationProps ? (
          <div
            ref={conferenceSurfaceRef}
            className={
              isConferenceMinimized
                ? "conference-surface is-background"
                : "conference-surface is-full"
            }
            aria-hidden={isConferenceMinimized}
            inert={isConferenceMinimized ? true : undefined}
          >
            <ActiveConferenceConversation {...activeConferenceConversationProps} />
          </div>
        ) : null}

        {activeChatConversationProps ? (
          <ActiveChatConversation {...activeChatConversationProps} />
        ) : !showConference || isConferenceMinimized ? (
          chatsLoading || conferencesLoading ? (
            <div className="empty-state large north-empty-state">{EMPTY_STATE_COPY.loading}</div>
          ) : (
            <div className="conversation-empty">
              <div className="conversation-empty-badge">
                {activeListTab === "conferences"
                  ? EMPTY_STATE_COPY.selectConference
                  : activeListTab === "mail"
                    ? EMPTY_STATE_COPY.manageMail
                    : EMPTY_STATE_COPY.selectChat}
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
