import {
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import type { UserProfile } from "../../../lib/types";
import type { ConversationListTab, SidebarSheet } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";
import { SidebarManagementSheets } from "./SidebarManagementSheets";
import { SidebarMenuOverlay } from "./SidebarMenuOverlay";
import { SidebarUtilitySheets } from "./SidebarUtilitySheets";

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
  const { t } = useI18n();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchShellRef = useRef<HTMLDivElement | null>(null);

  const handleSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && searchShellRef.current?.contains(nextTarget)) {
      return;
    }

    setIsSearchFocused(false);
  };

  const handleListPaging = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key !== "PageDown" && event.key !== "PageUp") {
      return;
    }

    const container = conferenceListScrollRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    scrollSidebarListByPage(container, event.key === "PageDown" ? "down" : "up");
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
          aria-label={t("sidebar.openMenu")}
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
            placeholder={t("sidebar.searchPlaceholder")}
          />

          {showTopSearchResults && isSearchFocused ? (
            <div className="search-dropdown top-search-dropdown">
              {userSearchIsFetching ? (
                <div className="search-result-empty">{t("sidebar.searchLoading")}</div>
              ) : userSearchResults.length === 0 ? (
                <div className="search-result-empty">{t("sidebar.searchEmpty")}</div>
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
            aria-label={t("sidebar.tabChats")}
            onClick={() => onActivateListTab("chats")}
          >
            {t("sidebar.tabChats")}
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
              aria-label={t("sidebar.tabMail")}
              onClick={() => onActivateListTab("mail")}
            >
              {t("sidebar.tabMail")}
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
            aria-label={t("menu.conferences")}
            onClick={() => onActivateListTab("conferences")}
          >
            {t("menu.conferences")}
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
        <div
          ref={conferenceListScrollRef}
          className="chat-list north-chat-list"
          tabIndex={0}
          aria-label={t("sidebar.listAria")}
          onKeyDown={handleListPaging}
        >
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

export function scrollSidebarListByPage(
  container: Pick<HTMLDivElement, "clientHeight" | "scrollBy">,
  direction: "up" | "down"
) {
  const pageOffset = Math.max(96, container.clientHeight - 72);
  container.scrollBy({
    top: direction === "down" ? pageOffset : -pageOffset,
    behavior: "smooth",
  });
}
