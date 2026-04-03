export type SidebarSheet =
  | "archive"
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

export type ConversationListTab = "dialogs" | "groups" | "conferences";

export type MenuActionId =
  | "conference"
  | "archive"
  | "profile"
  | "group"
  | "contacts"
  | "sessions"
  | "logout";

export type MenuAction = {
  id: MenuActionId;
  label: string;
  symbol: string;
  badge?: string;
};

export const MENU_ACTIONS: MenuAction[] = [
  { id: "profile", label: "РњРѕР№ РїСЂРѕС„РёР»СЊ", symbol: "ME" },
  { id: "archive", label: "РђСЂС…РёРІ", symbol: "AR" },
  { id: "group", label: "Р“СЂСѓРїРїС‹", symbol: "GR" },
  { id: "conference", label: "Р’РёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёРё", symbol: "VC" },
  { id: "contacts", label: "РљРѕРЅС‚Р°РєС‚С‹", symbol: "CT" },
  { id: "sessions", label: "РђРєС‚РёРІРЅС‹Рµ СѓСЃС‚СЂРѕР№СЃС‚РІР°", symbol: "DV" },
  { id: "logout", label: "Р’С‹Р№С‚Рё", symbol: "EX" },
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
