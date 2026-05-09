import { useRef, useState, type ComponentProps, type FocusEvent, type ReactNode, type RefObject } from "react";

import type { UserProfile } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { SidebarManagementSheets } from "./SidebarManagementSheets";
import { SidebarMenuOverlay } from "./SidebarMenuOverlay";
import { SidebarUtilitySheets } from "./SidebarUtilitySheets";

const SIDEBAR_COPY = {
  openMenuAria: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E",
  searchPlaceholder: "\u041F\u043E\u0438\u0441\u043A",
  searchLoading:
    "\u0418\u0449\u0435\u043C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439...",
  searchEmpty: "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E.",
  chatsAria: "\u0427\u0430\u0442\u044B",
  chatsLabel: "\u0427\u0430\u0442\u044B",
  mailAria: "\u041F\u043E\u0447\u0442\u0430",
  mailLabel: "\u041F\u043E\u0447\u0442\u0430",
  conferencesAria:
    "\u0412\u0438\u0434\u0435\u043E\u043A\u043E\u043D\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0438",
  conferencesLabel:
    "\u0412\u0438\u0434\u0435\u043E\u043A\u043E\u043D\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0438",
} as const;

type Props = {
  activeListTab: ConversationListTab;
  chatListContent: ReactNode;
  conferenceDock?: ReactNode;
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
  showMailTab: boolean;
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
  conferenceDock,
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
  showMailTab,
  showConferencesTabIndicator,
  showTopSearchResults,
  sidebarManagementSheetProps,
  sidebarSheet,
  sidebarUtilitySheetProps,
  userSearchIsFetching,
  userSearchResults,
}: Props) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchShellRef = useRef<HTMLDivElement | null>(null);

  const handleSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && searchShellRef.current?.contains(nextTarget)) {
      return;
    }

    setIsSearchFocused(false);
  };

  return (
    <aside className="sidebar north-sidebar notranslate" translate="no">
      <div className="north-sidebar-top">
        <button
          type="button"
          ref={menuButtonRef}
          className={isMenuOpen ? "sidebar-menu-button is-active" : "sidebar-menu-button"}
          onClick={onToggleMenu}
          aria-expanded={isMenuOpen}
          aria-label={SIDEBAR_COPY.openMenuAria}
        >
          <span />
          <span />
          <span />
        </button>

        <div
          ref={searchShellRef}
          className="north-search-shell"
          onBlur={handleSearchBlur}
        >
          <input
            className="north-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder={SIDEBAR_COPY.searchPlaceholder}
          />

          {showTopSearchResults && isSearchFocused ? (
            <div className="search-dropdown top-search-dropdown">
              {userSearchIsFetching ? (
                <div className="search-result-empty">{SIDEBAR_COPY.searchLoading}</div>
              ) : userSearchResults.length === 0 ? (
                <div className="search-result-empty">{SIDEBAR_COPY.searchEmpty}</div>
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
            aria-label={SIDEBAR_COPY.chatsAria}
            onClick={() => onActivateListTab("chats")}
          >
            {SIDEBAR_COPY.chatsLabel}
          </button>
          {showMailTab ? (
            <button
              type="button"
              className={
                activeListTab === "mail"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab"
              }
              data-tab="mail"
              aria-label={SIDEBAR_COPY.mailAria}
              onClick={() => onActivateListTab("mail")}
            >
              {SIDEBAR_COPY.mailLabel}
            </button>
          ) : null}
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
            aria-label={SIDEBAR_COPY.conferencesAria}
            onClick={() => onActivateListTab("conferences")}
          >
            {SIDEBAR_COPY.conferencesLabel}
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

      {!sidebarSheet && conferenceDock ? (
        <div className="north-sidebar-conference-dock">{conferenceDock}</div>
      ) : null}

      {isMenuOpen ? <SidebarMenuOverlay {...menuOverlayProps} /> : null}
    </aside>
  );
}
