import { useEffectEvent, type Dispatch, type SetStateAction } from "react";

import type { ChatSummary } from "../../../lib/types";
import { createInitialConferenceDateTime } from "../chatPresentation";
import type { ConversationListTab, SidebarSheet } from "../chatUi";

type UseWorkspaceNavigationParams = {
  activeChat: ChatSummary | null;
  activeChatId: string | null;
  chats: ChatSummary[];
  clearChatAttention: (chatId: string) => void;
  clearChatUnreadIndicator: (chatId: string) => void;
  clearComposerContext: (mode?: "all" | "reply" | "edit" | "forward") => void;
  currentUsername: string;
  setActiveChatId: Dispatch<SetStateAction<string | null>>;
  setActiveConferenceId: Dispatch<SetStateAction<string | null>>;
  setActiveListTab: Dispatch<SetStateAction<ConversationListTab>>;
  setConferenceComposerMode: Dispatch<SetStateAction<"instant" | "scheduled" | null>>;
  setConferenceParticipantUsernames: Dispatch<SetStateAction<string[]>>;
  setConferenceScheduledAt: Dispatch<SetStateAction<string>>;
  setConferenceTitle: Dispatch<SetStateAction<string>>;
  setDeleteAccountConfirmation: Dispatch<SetStateAction<string>>;
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
  openConferenceSheet: () => void;
  openGroupConferenceComposer: (mode: "instant" | "scheduled") => void;
  openSidebarSheet: (sheet: Exclude<SidebarSheet, null>) => void;
  resetConferenceComposer: () => void;
};

export function useWorkspaceNavigation({
  activeChat,
  activeChatId,
  chats,
  clearChatAttention,
  clearChatUnreadIndicator,
  clearComposerContext,
  currentUsername,
  setActiveChatId,
  setActiveConferenceId,
  setActiveListTab,
  setConferenceComposerMode,
  setConferenceParticipantUsernames,
  setConferenceScheduledAt,
  setConferenceTitle,
  setDeleteAccountConfirmation,
  setIsConferenceInfoOpen,
  setIsMenuOpen,
  setMobilePane,
  setSidebarSheet,
  stopTyping,
}: UseWorkspaceNavigationParams): UseWorkspaceNavigationResult {
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
    setConferenceComposerMode(null);
  });

  const openConferenceSheet = useEffectEvent(() => {
    setActiveListTab("conferences");
    setActiveConferenceId(null);
    openSidebarSheet("conference");
  });

  const openConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    openConferenceSheet();
    setConferenceComposerMode(mode);
    if (mode === "scheduled") {
      setConferenceScheduledAt(createInitialConferenceDateTime());
    }
  });

  const openGroupConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openConferenceSheet();
    setConferenceComposerMode(mode);
    setConferenceTitle(`Встреча ${activeChat.title}`);
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
      setActiveConferenceId(null);
    }
  });

  const openChat = useEffectEvent((chatId: string, tabHint?: ConversationListTab) => {
    clearComposerContext();
    clearChatAttention(chatId);
    clearChatUnreadIndicator(chatId);
    if (tabHint && tabHint !== "conferences") {
      setActiveListTab(tabHint);
    } else {
      const targetChat = chats.find((chat) => chat.id === chatId) ?? null;
      if (targetChat) {
        setActiveListTab(targetChat.direct ? "dialogs" : "groups");
      }
    }
    setIsMenuOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setMobilePane("conversation");
    setActiveConferenceId(null);
    setActiveChatId(chatId);
  });

  const closeActiveChat = useEffectEvent(() => {
    clearComposerContext();
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setSidebarSheet(null);
    setMobilePane("sidebar");
    setActiveChatId(null);
  });

  const closeActiveConference = useEffectEvent(() => {
    setIsConferenceInfoOpen(false);
    clearComposerContext();
    setSidebarSheet(null);
    setMobilePane("sidebar");
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
    setMobilePane("conversation");
    setActiveChatId(null);
    setActiveConferenceId(conferenceId);
  });

  return {
    activateListTab,
    closeActiveChat,
    closeActiveConference,
    openChat,
    openConference,
    openConferenceComposer,
    openConferenceSheet,
    openGroupConferenceComposer,
    openSidebarSheet,
    resetConferenceComposer,
  };
}
