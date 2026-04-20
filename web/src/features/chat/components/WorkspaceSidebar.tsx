import type { ComponentProps, ReactNode, RefObject } from "react";

import type { UserProfile } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { SidebarManagementSheets } from "./SidebarManagementSheets";
import { SidebarMenuOverlay } from "./SidebarMenuOverlay";
import { SidebarUtilitySheets } from "./SidebarUtilitySheets";

type Props = {
  activeListTab: ConversationListTab;
  chatListContent: ReactNode;
  conferenceListScrollRef: RefObject<HTMLDivElement | null>;
  isMenuOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuOverlayProps: ComponentProps<typeof SidebarMenuOverlay>;
  onActivateListTab: (tab: ConversationListTab) => void;
  onSearchChange: (value: string) => void;
  onSelectSearchUser: (user: UserProfile) => void;
  onToggleMenu: () => void;
  search: string;
  showChatsTabIndicator: boolean;
  showConferencesTabIndicator: boolean;
  showTopSearchResults: boolean;
  sidebarManagementSheetProps: ComponentProps<typeof SidebarManagementSheets>;
  sidebarSheet: SidebarSheet;
  sidebarUtilitySheetProps: ComponentProps<typeof SidebarUtilitySheets>;
  userSearchIsFetching: boolean;
  userSearchResults: UserProfile[];
};

export function WorkspaceSidebar({
  activeListTab,
  chatListContent,
  conferenceListScrollRef,
  isMenuOpen,
  menuButtonRef,
  menuOverlayProps,
  onActivateListTab,
  onSearchChange,
  onSelectSearchUser,
  onToggleMenu,
  search,
  showChatsTabIndicator,
  showConferencesTabIndicator,
  showTopSearchResults,
  sidebarManagementSheetProps,
  sidebarSheet,
  sidebarUtilitySheetProps,
  userSearchIsFetching,
  userSearchResults,
}: Props) {
  return (
    <aside className="sidebar north-sidebar">
      <div className="north-sidebar-top">
        <button
          type="button"
          ref={menuButtonRef}
          className={isMenuOpen ? "sidebar-menu-button is-active" : "sidebar-menu-button"}
          onClick={onToggleMenu}
          aria-expanded={isMenuOpen}
          aria-label="Открыть меню"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="north-search-shell">
          <input
            className="north-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск"
          />

          {showTopSearchResults ? (
            <div className="search-dropdown top-search-dropdown">
              {userSearchIsFetching ? (
                <div className="search-result-empty">Ищем пользователей...</div>
              ) : userSearchResults.length === 0 ? (
                <div className="search-result-empty">Ничего не найдено.</div>
              ) : (
                userSearchResults.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    className="search-result-row"
                    onClick={() => onSelectSearchUser(user)}
                  >
                    <AvatarCircle
                      className="menu-row-avatar"
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      online={user.online}
                    />
                    <div className="search-result-copy">
                      <strong>{user.displayName}</strong>
                      <span>@{user.username}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {!sidebarSheet ? (
        <div className="conversation-list-tabs">
          <button
            type="button"
            className={
              [
                activeListTab === "chats"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab",
                showChatsTabIndicator ? "has-indicator" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            data-tab="chats"
            aria-label="Чаты"
            onClick={() => onActivateListTab("chats")}
          >
            Диалоги
          </button>
          <button
            type="button"
            className={
              [
                activeListTab === "conferences"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab",
                showConferencesTabIndicator ? "has-indicator" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            data-tab="conferences"
            aria-label="Видеоконференции"
            onClick={() => onActivateListTab("conferences")}
          >
            Видеоконференции
          </button>
        </div>
      ) : null}

      {sidebarSheet ? (
        <section className="north-sidebar-sheet">
          <SidebarUtilitySheets {...sidebarUtilitySheetProps} />
          <SidebarManagementSheets {...sidebarManagementSheetProps} />
        </section>
      ) : null}

      {!sidebarSheet ? (
        <div ref={conferenceListScrollRef} className="chat-list north-chat-list">
          {chatListContent}
        </div>
      ) : null}

      {isMenuOpen ? <SidebarMenuOverlay {...menuOverlayProps} /> : null}
    </aside>
  );
}
