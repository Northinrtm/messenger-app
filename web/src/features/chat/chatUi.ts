import type { TranslationKey } from "../../i18n";

export type SidebarSheet =
  | "archive"
  | "chatMedia"
  | "conference"
  | "conferenceMembers"
  | "profile"
  | "group"
  | "groupInfo"
  | "groupMembers"
  | "contacts"
  | "sessions"
  | "forward"
  | null;

export type ConversationListTab = "chats" | "mail" | "conferences";

export type MenuActionId =
  | "conference"
  | "archive"
  | "profile"
  | "group"
  | "contacts"
  | "sessions"
  | "download-apk"
  | "logout";

export type MenuAction = {
  id: MenuActionId;
  labelKey: TranslationKey;
  symbol: string;
  badge?: string;
};

export const MENU_ACTIONS: MenuAction[] = [
  { id: "profile", labelKey: "menu.profile", symbol: "ME" },
  { id: "archive", labelKey: "menu.archive", symbol: "AR" },
  { id: "group", labelKey: "menu.groups", symbol: "GR" },
  { id: "conference", labelKey: "menu.conferences", symbol: "VC" },
  { id: "contacts", labelKey: "menu.contacts", symbol: "CT" },
  { id: "sessions", labelKey: "menu.devices", symbol: "DV" },
  { id: "download-apk", labelKey: "menu.downloadApk", symbol: "AN" },
  { id: "logout", labelKey: "menu.logout", symbol: "EX" },
];

export type ContextMenuState =
  | {
      kind: "chat";
      chatId: string;
      x: number;
      y: number;
    }
  | {
      kind: "message";
      chatId: string;
      messageId: string;
      x: number;
      y: number;
    };
