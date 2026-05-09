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
  | "logout";

export type MenuAction = {
  id: MenuActionId;
  label: string;
  symbol: string;
  badge?: string;
};

export const MENU_ACTIONS: MenuAction[] = [
  { id: "profile", label: "\u041C\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C", symbol: "ME" },
  { id: "archive", label: "\u0410\u0440\u0445\u0438\u0432", symbol: "AR" },
  { id: "group", label: "\u0413\u0440\u0443\u043F\u043F\u044B", symbol: "GR" },
  { id: "conference", label: "\u0412\u0438\u0434\u0435\u043E\u043A\u043E\u043D\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0438", symbol: "VC" },
  { id: "contacts", label: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u044B", symbol: "CT" },
  { id: "sessions", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430", symbol: "DV" },
  { id: "logout", label: "\u0412\u044B\u0439\u0442\u0438", symbol: "EX" },
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
