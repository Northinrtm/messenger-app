import { type QueryClient } from "@tanstack/react-query";
import { startTransition, useEffect } from "react";

import type { ChatMessage, ChatSummary, MessageSnippet, VideoConference } from "../../../lib/types";
import type { SidebarSheet } from "../chatUi";
import type { ChatMessageActivityMode } from "../chatState";

type UseWorkspaceEffectsOptions = {
  acknowledgeVisibleMessagesAsRead: () => void;
  activeChat: ChatSummary | null;
  activeChatId: string | null;
  isActiveChatOpen: boolean;
  activeConferenceId: string | null;
  applyChatPreviewMessage: (message: ChatMessage) => void;
  applyServerChatPreviewMessage: (message: ChatMessage, mode?: ChatMessageActivityMode) => void;
  archivedConferences: VideoConference[];
  conferences: VideoConference[];
  chats: ChatSummary[];
  hasArchivedConferencesData: boolean;
  hasChatsData: boolean;
  hasConferencesData: boolean;
  clearChatAttention: (chatId: string) => void;
  editingMessageId: string | null;
  extractImageFromClipboard: (clipboardData: DataTransfer | null) => File | null;
  forwardingMessageIds: string[];
  hasEditingMessage: boolean;
  hasForwardingMessages: boolean;
  hasReplyingMessage: boolean;
  hydratedPinnedMessage: MessageSnippet | null;
  lastMessage: ChatMessage | null;
  lastMessageId: string | null;
  messageCount: number;
  readableIncomingMessageIdsKey: string;
  profileDisplayName: string;
  profileProfession: string | null;
  queryClient: QueryClient;
  replyingToMessageId: string | null;
  sessionToken: string;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveConferenceId: React.Dispatch<React.SetStateAction<string | null>>;
  setConferenceInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setForwardingMessageIds: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setIsConferenceInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGroupCreatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGroupInvitePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMobilePane: React.Dispatch<React.SetStateAction<"sidebar" | "conversation">>;
  setProfileDisplayName: React.Dispatch<React.SetStateAction<string>>;
  setProfileProfession: React.Dispatch<React.SetStateAction<string>>;
  setReplyingToMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setSidebarSheet: React.Dispatch<React.SetStateAction<SidebarSheet>>;
  sidebarSheet: SidebarSheet;
  syncChatPinnedSummary: (chatId: string, message: MessageSnippet | null) => void;
  uploadAvatarFromFile: (file: File) => void | Promise<void>;
};

export function useWorkspaceEffects({
  acknowledgeVisibleMessagesAsRead,
  activeChat,
  activeChatId,
  isActiveChatOpen,
  activeConferenceId,
  applyChatPreviewMessage,
  applyServerChatPreviewMessage,
  archivedConferences,
  conferences,
  chats,
  hasArchivedConferencesData,
  hasChatsData,
  hasConferencesData,
  clearChatAttention,
  editingMessageId,
  extractImageFromClipboard,
  forwardingMessageIds,
  hasEditingMessage,
  hasForwardingMessages,
  hasReplyingMessage,
  hydratedPinnedMessage,
  lastMessage,
  lastMessageId,
  messageCount,
  readableIncomingMessageIdsKey,
  profileDisplayName,
  profileProfession,
  queryClient,
  replyingToMessageId,
  sessionToken,
  setActiveChatId,
  setActiveConferenceId,
  setConferenceInviteUsernames,
  setEditingMessageId,
  setForwardingMessageIds,
  setGroupInviteUsernames,
  setIsConferenceInfoOpen,
  setIsGroupCreatePickerOpen,
  setIsGroupInvitePickerOpen,
  setMobilePane,
  setProfileDisplayName,
  setProfileProfession,
  setReplyingToMessageId,
  setSidebarSheet,
  sidebarSheet,
  syncChatPinnedSummary,
  uploadAvatarFromFile,
}: UseWorkspaceEffectsOptions) {
  useEffect(() => {
    if (!hasChatsData) {
      return;
    }

    if (!chats.length) {
      if (activeChatId !== null) {
        setMobilePane("sidebar");
        setActiveChatId(null);
      }
      return;
    }

    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      setMobilePane("sidebar");
      startTransition(() => {
        setActiveChatId(null);
      });
    }
  }, [activeChatId, chats, hasChatsData, setActiveChatId, setMobilePane]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    clearChatAttention(activeChatId);
  }, [activeChatId, clearChatAttention]);

  useEffect(() => {
    setProfileDisplayName(profileDisplayName);
  }, [profileDisplayName, setProfileDisplayName]);

  useEffect(() => {
    setProfileProfession(profileProfession ?? "");
  }, [profileProfession, setProfileProfession]);

  useEffect(() => {
    setIsConferenceInfoOpen(false);
  }, [activeConferenceId, setIsConferenceInfoOpen]);

  useEffect(() => {
    if (!hasConferencesData || !hasArchivedConferencesData || !activeConferenceId) {
      return;
    }

    if (
      conferences.some((conference) => conference.id === activeConferenceId) ||
      archivedConferences.some((conference) => conference.id === activeConferenceId)
    ) {
      return;
    }

    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setMobilePane("sidebar");
    startTransition(() => {
      setActiveConferenceId(null);
    });
  }, [
    activeConferenceId,
    archivedConferences,
    conferences,
    hasArchivedConferencesData,
    hasConferencesData,
    setActiveConferenceId,
    setIsConferenceInfoOpen,
    setMobilePane,
    setSidebarSheet,
  ]);

  useEffect(() => {
    if (sidebarSheet !== "group") {
      setIsGroupCreatePickerOpen(false);
    }

    if (sidebarSheet !== "groupMembers") {
      setGroupInviteUsernames([]);
      setIsGroupInvitePickerOpen(false);
    }

    if (sidebarSheet !== "conferenceMembers") {
      setConferenceInviteUsernames([]);
    }

    if (sidebarSheet !== "forward") {
      setForwardingMessageIds([]);
    }
  }, [
    setConferenceInviteUsernames,
    setForwardingMessageIds,
    setGroupInviteUsernames,
    setIsGroupCreatePickerOpen,
    setIsGroupInvitePickerOpen,
    sidebarSheet,
  ]);

  useEffect(() => {
    if (replyingToMessageId && !hasReplyingMessage) {
      setReplyingToMessageId(null);
    }
  }, [hasReplyingMessage, replyingToMessageId, setReplyingToMessageId]);

  useEffect(() => {
    if (editingMessageId && !hasEditingMessage) {
      setEditingMessageId(null);
    }
  }, [editingMessageId, hasEditingMessage, setEditingMessageId]);

  useEffect(() => {
    if (forwardingMessageIds.length > 0 && !hasForwardingMessages && sidebarSheet === "forward") {
      setSidebarSheet(null);
      setForwardingMessageIds([]);
    }
  }, [
    forwardingMessageIds,
    hasForwardingMessages,
    setForwardingMessageIds,
    setSidebarSheet,
    sidebarSheet,
  ]);

  useEffect(() => {
    if (sidebarSheet !== "profile") {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const file = extractImageFromClipboard(event.clipboardData);
      if (!file) {
        return;
      }

      event.preventDefault();
      void uploadAvatarFromFile(file);
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [extractImageFromClipboard, sidebarSheet, uploadAvatarFromFile]);

  useEffect(() => {
    queryClient
      .getQueryCache()
      .findAll({ queryKey: ["typing", sessionToken] })
      .forEach((query) => {
        const queryChatId = typeof query.queryKey[2] === "string" ? query.queryKey[2] : null;
        if (queryChatId !== activeChatId) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      });
  }, [activeChatId, queryClient, sessionToken]);

  useEffect(() => {
    acknowledgeVisibleMessagesAsRead();
  }, [
    acknowledgeVisibleMessagesAsRead,
    activeChatId,
    isActiveChatOpen,
    lastMessageId,
    messageCount,
    readableIncomingMessageIdsKey,
  ]);

  useEffect(() => {
    if (!activeChatId || !lastMessage) {
      return;
    }

    applyChatPreviewMessage(lastMessage);
    applyServerChatPreviewMessage(lastMessage, "clear");
  }, [activeChatId, applyChatPreviewMessage, applyServerChatPreviewMessage, lastMessage]);

  useEffect(() => {
    if (!activeChat?.id || !activeChat.pinnedMessage || !hydratedPinnedMessage) {
      return;
    }

    if (activeChat.pinnedMessage.preview === hydratedPinnedMessage.preview) {
      return;
    }

    syncChatPinnedSummary(activeChat.id, hydratedPinnedMessage);
  }, [activeChat, hydratedPinnedMessage, syncChatPinnedSummary]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        acknowledgeVisibleMessagesAsRead();
      }
    };

    const handleWindowFocus = () => {
      acknowledgeVisibleMessagesAsRead();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [acknowledgeVisibleMessagesAsRead]);
}
