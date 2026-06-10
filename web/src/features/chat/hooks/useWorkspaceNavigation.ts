import { useEffectEvent, type Dispatch, type SetStateAction } from "react";

import { useI18n } from "../../../i18n/I18nProvider";

import type { ChatSummary, VideoConference } from "../../../lib/types";
import {
  createInitialConferenceDateTime,
  formatDateTimeInputValue,
} from "../chatPresentation";
import type { ConversationListTab, SidebarSheet } from "../chatUi";

type ConferenceViewportMode = "full" | "mini";

type UseWorkspaceNavigationParams = {
  activeChat: ChatSummary | null;
  activeChatId: string | null;
  activeConferenceId: string | null;
  chats: ChatSummary[];
  clearChatAttention: (chatId: string) => void;
  clearComposerContext: (mode?: "all" | "reply" | "edit" | "forward") => void;
  currentUsername: string;
  setActiveChatId: Dispatch<SetStateAction<string | null>>;
  setActiveConferenceId: Dispatch<SetStateAction<string | null>>;
  setActiveListTab: Dispatch<SetStateAction<ConversationListTab>>;
  setConferenceComposerMode: Dispatch<SetStateAction<"instant" | "scheduled" | null>>;
  setConferenceEditingId: Dispatch<SetStateAction<string | null>>;
  setConferenceChatId: Dispatch<SetStateAction<string | null>>;
  setConferenceParticipantUsernames: Dispatch<SetStateAction<string[]>>;
  setConferenceScheduledAt: Dispatch<SetStateAction<string>>;
  setConferenceTitle: Dispatch<SetStateAction<string>>;
  setConferenceViewportMode: Dispatch<SetStateAction<ConferenceViewportMode>>;
  setDeleteAccountConfirmation: Dispatch<SetStateAction<string>>;
  setHasExplicitlyOpenedActiveChatThisSession: Dispatch<SetStateAction<boolean>>;
  setInitialChatViewportHint: Dispatch<
    SetStateAction<{ chatId: string; unreadCount: number } | null>
  >;
  setIsConferenceInfoOpen: Dispatch<SetStateAction<boolean>>;
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
  setMobilePane: Dispatch<SetStateAction<"sidebar" | "conversation">>;
  setSidebarSheet: Dispatch<SetStateAction<SidebarSheet>>;
  stopTyping: (chatId?: string | null) => void;
};

type UseWorkspaceNavigationResult = {
  activateListTab: (tab: ConversationListTab) => void;
  closeActiveChat: () => void;
  closeActiveConference: () => void;
  openChat: (chatId: string, tabHint?: ConversationListTab) => void;
  openConference: (conferenceId: string) => void;
  openConferenceComposer: (mode: "instant" | "scheduled") => void;
  openConferenceEditor: (conference: VideoConference) => void;
  openConferenceSheet: () => void;
  openGroupConferenceComposer: (mode: "instant" | "scheduled") => void;
  openSidebarSheet: (sheet: Exclude<SidebarSheet, null>) => void;
  resetConferenceComposer: () => void;
  restoreActiveConference: () => void;
};

export function useWorkspaceNavigation({
  activeChat,
  activeChatId,
  activeConferenceId,
  chats,
  clearChatAttention,
  clearComposerContext,
  currentUsername,
  setActiveChatId,
  setActiveConferenceId,
  setActiveListTab,
  setConferenceComposerMode,
  setConferenceEditingId,
  setConferenceChatId,
  setConferenceParticipantUsernames,
  setConferenceScheduledAt,
  setConferenceTitle,
  setConferenceViewportMode,
  setDeleteAccountConfirmation,
  setHasExplicitlyOpenedActiveChatThisSession,
  setInitialChatViewportHint,
  setIsConferenceInfoOpen,
  setIsMenuOpen,
  setMobilePane,
  setSidebarSheet,
  stopTyping,
}: UseWorkspaceNavigationParams): UseWorkspaceNavigationResult {
  const { t } = useI18n();
  const openSidebarSheet = useEffectEvent((sheet: Exclude<SidebarSheet, null>) => {
    setDeleteAccountConfirmation("");
    setSidebarSheet(sheet);
    setIsMenuOpen(false);
    setMobilePane("sidebar");
  });

  const resetConferenceComposer = useEffectEvent(() => {
    setConferenceTitle("");
    setConferenceScheduledAt(createInitialConferenceDateTime());
    setConferenceParticipantUsernames([]);
    setConferenceChatId(null);
    setConferenceComposerMode(null);
    setConferenceEditingId(null);
  });

  const openConferenceSheet = useEffectEvent(() => {
    setActiveListTab("conferences");
    if (activeConferenceId) {
      setConferenceViewportMode("mini");
      setIsConferenceInfoOpen(false);
    }
    openSidebarSheet("conference");
  });

  const openConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    openConferenceSheet();
    setConferenceChatId(null);
    setConferenceEditingId(null);
    setConferenceComposerMode(mode);
    setConferenceParticipantUsernames([]);
    setConferenceTitle("");
    if (mode === "scheduled") {
      setConferenceScheduledAt(createInitialConferenceDateTime());
    }
  });

  const openConferenceEditor = useEffectEvent((conference: VideoConference) => {
    openConferenceSheet();
    setConferenceEditingId(conference.id);
    setConferenceChatId(conference.chatId ?? null);
    setConferenceComposerMode("scheduled");
    setConferenceTitle(conference.title);
    setConferenceScheduledAt(formatDateTimeInputValue(new Date(conference.scheduledAt)));
    setConferenceParticipantUsernames([]);
  });

  const openGroupConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openConferenceSheet();
    setConferenceChatId(activeChat.id);
    setConferenceEditingId(null);
    setConferenceComposerMode(mode);
    setConferenceParticipantUsernames([]);
    setConferenceTitle(t("conf.defaultTitleNamed", { title: activeChat.title }));
    setConferenceParticipantUsernames(
      activeChat.members
        .filter((member) => member.username !== currentUsername)
        .map((member) => member.username)
    );
    if (mode === "scheduled") {
      setConferenceScheduledAt(createInitialConferenceDateTime());
    }
  });

  const activateListTab = useEffectEvent((tab: ConversationListTab) => {
    setActiveListTab(tab);
    setSidebarSheet(null);
    setIsMenuOpen(false);
    if (tab !== "conferences") {
      setConferenceComposerMode(null);
      setConferenceEditingId(null);
      if (activeConferenceId) {
        setConferenceViewportMode("mini");
        setIsConferenceInfoOpen(false);
      }
    }
  });

  const openChat = useEffectEvent((chatId: string, tabHint?: ConversationListTab) => {
    const targetChat = chats.find((chat) => chat.id === chatId) ?? null;

    setInitialChatViewportHint({
      chatId,
      unreadCount: targetChat?.unreadCount ?? 0,
    });
    clearComposerContext();
    clearChatAttention(chatId);
    if (tabHint === "chats" || targetChat) {
      setActiveListTab("chats");
    }
    setIsMenuOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setConferenceEditingId(null);
    setMobilePane("conversation");
    if (activeConferenceId) {
      setConferenceViewportMode("mini");
      setIsConferenceInfoOpen(false);
    }
    setHasExplicitlyOpenedActiveChatThisSession(true);
    setActiveChatId(chatId);
  });

  const closeActiveChat = useEffectEvent(() => {
    clearComposerContext();
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setSidebarSheet(null);
    setMobilePane("sidebar");
    setHasExplicitlyOpenedActiveChatThisSession(false);
    setActiveChatId(null);
  });

  const closeActiveConference = useEffectEvent(() => {
    setIsConferenceInfoOpen(false);
    clearComposerContext();
    setSidebarSheet(null);
    setConferenceEditingId(null);
    setMobilePane(activeChatId ? "conversation" : "sidebar");
    setConferenceViewportMode("full");
    setActiveConferenceId(null);
  });

  const openConference = useEffectEvent((conferenceId: string) => {
    clearComposerContext();
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setActiveListTab("conferences");
    setIsMenuOpen(false);
    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setConferenceEditingId(null);
    setConferenceViewportMode("full");
    setMobilePane("conversation");
    setHasExplicitlyOpenedActiveChatThisSession(false);
    setActiveChatId(null);
    setActiveConferenceId(conferenceId);
  });

  const restoreActiveConference = useEffectEvent(() => {
    if (!activeConferenceId) {
      return;
    }

    clearComposerContext();
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setActiveListTab("conferences");
    setIsMenuOpen(false);
    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setConferenceEditingId(null);
    setConferenceViewportMode("full");
    setMobilePane("conversation");
    setHasExplicitlyOpenedActiveChatThisSession(false);
    setActiveChatId(null);
  });

  return {
    activateListTab,
    closeActiveChat,
    closeActiveConference,
    openChat,
    openConference,
    openConferenceComposer,
    openConferenceEditor,
    openConferenceSheet,
    openGroupConferenceComposer,
    openSidebarSheet,
    resetConferenceComposer,
    restoreActiveConference,
  };
}
