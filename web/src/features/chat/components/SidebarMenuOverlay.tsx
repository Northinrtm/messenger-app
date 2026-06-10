import type { RefObject } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
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
  const { t } = useI18n();
  return (
    <div className="sidebar-menu-overlay notranslate" ref={menuPanelRef} translate="no">
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
          aria-label={t("menu.collapse")}
        >
          ^
        </button>
      </div>
      <div className="menu-section menu-item-list">
        {menuActions.map(({ id, labelKey, symbol, badge }) => (
          <button type="button" key={id} className="menu-row" onClick={() => onAction(id)}>
            <span className="menu-row-icon">{symbol}</span>
            <span className="menu-row-label">
              {id === "logout" && isSigningOut ? t("menu.loggingOut") : t(labelKey)}
            </span>
            {badge ? <span className="menu-badge-new">{badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
