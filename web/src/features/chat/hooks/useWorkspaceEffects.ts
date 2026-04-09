import { type QueryClient } from "@tanstack/react-query";
import { startTransition, useEffect } from "react";

import type { ChatMessage, ChatSummary, MessageSnippet, VideoConference } from "../../../lib/types";
import type { SidebarSheet } from "../chatUi";
import type { ChatMessageActivityMode } from "../chatState";

type UseWorkspaceEffectsOptions = {
  acknowledgeVisibleMessagesAsRead: () => void;
  activeChat: ChatSummary | null;
  activeChatId: string | null;
  activeConferenceId: string | null;
  applyChatPreviewMessage: (message: ChatMessage) => void;
  applyServerChatPreviewMessage: (message: ChatMessage, mode?: ChatMessageActivityMode) => void;
  archivedConferences: VideoConference[];
  conferences: VideoConference[];
  chats: ChatSummary[];
  hasArchivedConferencesData: boolean;
  hasConferencesData: boolean;
  clearChatAttention: (chatId: string) => void;
  clearChatUnreadIndicator: (chatId: string) => void;
  editingMessageId: string | null;
  extractImageFromClipboard: (clipboardData: DataTransfer | null) => File | null;
  forwardingMessageId: string | null;
  hasEditingMessage: boolean;
  hasForwardingMessage: boolean;
  hasReplyingMessage: boolean;
  hydratedPinnedMessage: MessageSnippet | null;
  lastMessage: ChatMessage | null;
  lastMessageId: string | null;
  messageCount: number;
  profileDisplayName: string;
  profileProfession: string | null;
  queryClient: QueryClient;
  replyingToMessageId: string | null;
  sessionToken: string;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveConferenceId: React.Dispatch<React.SetStateAction<string | null>>;
  setConferenceInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setForwardingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
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
  activeConferenceId,
  applyChatPreviewMessage,
  applyServerChatPreviewMessage,
  archivedConferences,
  conferences,
  chats,
  hasArchivedConferencesData,
  hasConferencesData,
  clearChatAttention,
  clearChatUnreadIndicator,
  editingMessageId,
  extractImageFromClipboard,
  forwardingMessageId,
  hasEditingMessage,
  hasForwardingMessage,
  hasReplyingMessage,
  hydratedPinnedMessage,
  lastMessage,
  lastMessageId,
  messageCount,
  profileDisplayName,
  profileProfession,
  queryClient,
  replyingToMessageId,
  sessionToken,
  setActiveChatId,
  setActiveConferenceId,
  setConferenceInviteUsernames,
  setEditingMessageId,
  setForwardingMessageId,
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
    if (!chats.length) {
      if (activeChatId !== null) {
        setActiveChatId(null);
      }
      return;
    }

    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      startTransition(() => {
        setActiveChatId(null);
      });
    }
  }, [activeChatId, chats, setActiveChatId]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    clearChatAttention(activeChatId);
    clearChatUnreadIndicator(activeChatId);
  }, [activeChatId, clearChatAttention, clearChatUnreadIndicator]);

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
      setForwardingMessageId(null);
    }
  }, [
    setConferenceInviteUsernames,
    setForwardingMessageId,
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
    if (forwardingMessageId && !hasForwardingMessage && sidebarSheet === "forward") {
      setSidebarSheet(null);
      setForwardingMessageId(null);
    }
  }, [forwardingMessageId, hasForwardingMessage, setForwardingMessageId, setSidebarSheet, sidebarSheet]);

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
      .findAll({ queryKey: ["messages", sessionToken] })
      .forEach((query) => {
        const queryChatId = typeof query.queryKey[2] === "string" ? query.queryKey[2] : null;
        if (queryChatId !== activeChatId) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      });

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
  }, [acknowledgeVisibleMessagesAsRead, activeChatId, lastMessageId, messageCount]);

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

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [acknowledgeVisibleMessagesAsRead]);
}
