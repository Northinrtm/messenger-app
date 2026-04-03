import type { RefObject } from "react";

import type { UserProfile } from "../../../lib/types";
import type { MenuAction, MenuActionId } from "../chatUi";
import { AvatarCircle } from "./AvatarCircle";

type Props = {
  profile: UserProfile;
  menuActions: MenuAction[];
  menuPanelRef: RefObject<HTMLDivElement | null>;
  isSigningOut: boolean;
  onClose: () => void;
  onAction: (actionId: MenuActionId) => void;
};

export function SidebarMenuOverlay({
  profile,
  menuActions,
  menuPanelRef,
  isSigningOut,
  onClose,
  onAction,
}: Props) {
  return (
    <div className="sidebar-menu-overlay" ref={menuPanelRef}>
      <div className="sidebar-menu-profile">
        <AvatarCircle
          className="menu-profile-avatar"
          name={profile.displayName}
          avatarUrl={profile.avatarUrl}
          online={profile.online}
        />
        <div className="menu-profile-copy">
          <strong>{profile.displayName}</strong>
        </div>
        <button
          type="button"
          className="sidebar-menu-collapse"
          onClick={onClose}
          aria-label="Скрыть меню"
        >
          ^
        </button>
      </div>

      <div className="menu-section menu-account-list">
        <button type="button" className="menu-row account-row is-current" onClick={onClose}>
          <AvatarCircle
            className="menu-row-avatar"
            name={profile.displayName}
            avatarUrl={profile.avatarUrl}
            online={profile.online}
          />
          <div className="menu-row-copy">
            <strong>{profile.displayName}</strong>
            <span>@{profile.username}</span>
          </div>
        </button>
      </div>

      <div className="menu-section menu-item-list">
        {menuActions.map(({ id, label, symbol, badge }) => (
          <button type="button" key={id} className="menu-row" onClick={() => onAction(id)}>
            <span className="menu-row-icon">{symbol}</span>
            <span className="menu-row-label">
              {id === "logout" && isSigningOut ? "Выход..." : label}
            </span>
            {badge ? <span className="menu-badge-new">{badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
