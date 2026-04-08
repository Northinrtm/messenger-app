import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addContact as addContactRequest,
  addConferenceParticipants as addConferenceParticipantsRequest,
  addGroupParticipants,
  banGroupParticipant as banGroupParticipantRequest,
  blockUser as blockUserRequest,
  cancelVideoConference as cancelVideoConferenceRequest,
  changePassword as changePasswordRequest,
  createVideoConference as createVideoConferenceRequest,
  deleteGroup as deleteGroupRequest,
  deleteOwnAccount as deleteOwnAccountRequest,
  createDirectChat,
  createGroupChat,
  endVideoConference as endVideoConferenceRequest,
  leaveGroup as leaveGroupRequest,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  unblockUser as unblockUserRequest,
  updateArchivedChat,
  updateGroupChat as updateGroupChatRequest,
  updateProfile,
  updateProfileAvatar,
  updateVideoConference as updateVideoConferenceRequest,
} from "../../../lib/api";
import { prepareOwnEncryptionKeyBundleForPasswordChange } from "../../../lib/e2ee";
import type {
  AuthResponse,
  ChatSummary,
  Participant,
  UserProfile,
  UserSessionInfo,
  VideoConference,
} from "../../../lib/types";
import { removeVideoConference, upsertVideoConferences } from "../chatPresentation";
import { upsertChat } from "../chatState";
import type { ConversationListTab, SidebarSheet } from "../chatUi";

type UseWorkspaceMutationsOptions = {
  activeChat: ChatSummary | null;
  activeChatId: string | null;
  activeConference: VideoConference | null;
  activeConferenceId: string | null;
  activeConferenceIsArchived: boolean;
  conferenceEditingId: string | null;
  conferenceInviteUsernames: string[];
  conferenceParticipantUsernames: string[];
  conferenceScheduledAt: string;
  conferenceTitle: string;
  currentSession: AuthResponse;
  passwordChangeConfirm: string;
  passwordChangeCurrent: string;
  passwordChangeNext: string;
  groupInviteUsernames: string[];
  groupDetailsAvatarUrl: string | null;
  groupDetailsTitle: string;
  groupParticipantUsernames: string[];
  groupTitle: string;
  removeChatLocally: (chatId: string) => void;
  onGroupCreated?: (chat: ChatSummary, options: { openMenu: boolean }) => void;
  onPasswordChanged?: () => void;
  onSessionChange: (session: AuthResponse | null) => void;
  openChat: (chatId: string, preferredTab?: ConversationListTab) => void;
  openConference: (conferenceId: string) => void;
  profile: UserProfile;
  profileDisplayName: string;
  resetConferenceComposer: () => void;
  setActiveListTab: React.Dispatch<React.SetStateAction<ConversationListTab>>;
  setConferenceInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupDetailsAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setGroupDetailsTitle: React.Dispatch<React.SetStateAction<string>>;
  setGroupInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupParticipantUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupTitle: React.Dispatch<React.SetStateAction<string>>;
  setIsGroupCreatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGroupInvitePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMobilePane: React.Dispatch<React.SetStateAction<"sidebar" | "conversation">>;
  setSidebarSheet: React.Dispatch<React.SetStateAction<SidebarSheet>>;
};

export function useWorkspaceMutations({
  activeChat,
  activeChatId,
  activeConference,
  activeConferenceId,
  activeConferenceIsArchived,
  conferenceEditingId,
  conferenceInviteUsernames,
  conferenceParticipantUsernames,
  conferenceScheduledAt,
  conferenceTitle,
  currentSession,
  passwordChangeConfirm,
  passwordChangeCurrent,
  passwordChangeNext,
  groupInviteUsernames,
  groupDetailsAvatarUrl,
  groupDetailsTitle,
  groupParticipantUsernames,
  groupTitle,
  removeChatLocally,
  onGroupCreated,
  onPasswordChanged,
  onSessionChange,
  openChat,
  openConference,
  profile,
  profileDisplayName,
  resetConferenceComposer,
  setActiveListTab,
  setConferenceInviteUsernames,
  setGroupDetailsAvatarUrl,
  setGroupDetailsTitle,
  setGroupInviteUsernames,
  setGroupParticipantUsernames,
  setGroupTitle,
  setIsGroupCreatePickerOpen,
  setIsGroupInvitePickerOpen,
  setMobilePane,
  setSidebarSheet,
}: UseWorkspaceMutationsOptions) {
  const queryClient = useQueryClient();
  const { token } = currentSession;
  const syncProfile = (nextProfile: UserProfile) => {
    queryClient.setQueryData(["profile", token], nextProfile);
    onSessionChange({
      ...currentSession,
      user: nextProfile,
    });
  };

  const createChatMutation = useMutation({
    mutationFn: (participantUsername: string) => createDirectChat(token, participantUsername),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
      setSidebarSheet(null);
      openChat(chat.id, "dialogs");
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (input: { title: string; participantUsernames: string[] }) =>
      createGroupChat(token, input),
    onSuccess: (chat, input) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
      setGroupTitle("");
      setGroupParticipantUsernames([]);
      setIsGroupCreatePickerOpen(false);
      openChat(chat.id, "groups");
      onGroupCreated?.(chat, { openMenu: input.participantUsernames.length === 0 });
      setSidebarSheet(null);
    },
  });

  const createConferenceMutation = useMutation({
    mutationFn: (input: {
      title: string;
      scheduledAt: string;
      participantUsernames: string[];
    }) => createVideoConferenceRequest(token, input),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        upsertVideoConferences(current, conference),
      );
      resetConferenceComposer();
      setActiveListTab("conferences");
      openConference(conference.id);
    },
  });

  const updateConferenceMutation = useMutation({
    mutationFn: (input: { conferenceId: string; title: string; scheduledAt: string }) =>
      updateVideoConferenceRequest(token, input.conferenceId, {
        title: input.title,
        scheduledAt: input.scheduledAt,
      }),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        upsertVideoConferences(current, conference),
      );
      queryClient.setQueryData<VideoConference[]>(["video-conferences-archive", token], (current) =>
        removeVideoConference(current, conference.id),
      );
      resetConferenceComposer();
      openConference(conference.id);
    },
  });

  const endConferenceMutation = useMutation({
    mutationFn: (conferenceId: string) => endVideoConferenceRequest(token, conferenceId),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        removeVideoConference(current, conference.id),
      );
      queryClient.setQueryData<VideoConference[]>(["video-conferences-archive", token], (current) =>
        upsertVideoConferences(current, conference),
      );
      if (activeConferenceId === conference.id) {
        setSidebarSheet(null);
      }
    },
  });

  const cancelConferenceMutation = useMutation({
    mutationFn: (conferenceId: string) => cancelVideoConferenceRequest(token, conferenceId),
    onSuccess: (_result, conferenceId) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        removeVideoConference(current, conferenceId),
      );
      queryClient.setQueryData<VideoConference[]>(["video-conferences-archive", token], (current) =>
        removeVideoConference(current, conferenceId),
      );
      resetConferenceComposer();
      setSidebarSheet(null);
    },
  });

  const addConferenceParticipantsMutation = useMutation({
    mutationFn: (participantUsernames: string[]) =>
      addConferenceParticipantsRequest(token, activeConference!.id, { participantUsernames }),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        upsertVideoConferences(current, conference),
      );
      setConferenceInviteUsernames([]);
      setSidebarSheet(null);
    },
  });

  const addGroupParticipantsMutation = useMutation({
    mutationFn: (participantUsernames: string[]) =>
      addGroupParticipants(token, activeChat!.id, { participantUsernames }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      setGroupInviteUsernames([]);
      setIsGroupInvitePickerOpen(false);
      setSidebarSheet(null);
    },
  });

  const banGroupParticipantMutation = useMutation({
    mutationFn: (participant: Participant) =>
      banGroupParticipantRequest(token, activeChat!.id, participant.username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: (input: { chatId: string; title: string; avatarUrl: string | null }) =>
      updateGroupChatRequest(token, input.chatId, {
        title: input.title,
        avatarUrl: input.avatarUrl,
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      setGroupDetailsTitle(chat.title);
      setGroupDetailsAvatarUrl(chat.avatarUrl ?? null);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      onSessionChange(null);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => revokeSession(token, sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.setQueryData<UserSessionInfo[]>(["sessions", token], (current) =>
        current?.filter((item) => item.id !== sessionId) ?? [],
      );
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (displayName: string) => updateProfile(token, { displayName }),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const encryptionKeyBundle = await prepareOwnEncryptionKeyBundleForPasswordChange(
        token,
        currentSession.user.id,
        input.currentPassword,
        input.newPassword
      );
      return changePasswordRequest(token, {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        encryptionKeyBundle,
      });
    },
    onSuccess: () => {
      onPasswordChanged?.();
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string | null) => updateProfileAvatar(token, avatarUrl),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteOwnAccountRequest(token),
    onSuccess: () => {
      queryClient.clear();
      onSessionChange(null);
    },
  });

  const updateArchivedChatMutation = useMutation({
    mutationFn: ({ chatId, archived }: { chatId: string; archived: boolean }) =>
      updateArchivedChat(token, chatId, archived),
    onMutate: async ({ chatId, archived }) => {
      const queryKey = ["archived-chats", token] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next = archived
        ? previous.includes(chatId)
          ? previous
          : [...previous, chatId]
        : previous.filter((item) => item !== chatId);
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["archived-chats", token], context.previous);
      }
    },
  });

  const addContactMutation = useMutation({
    mutationFn: (user: UserProfile) => addContactRequest(token, user.username),
    onSuccess: (contact) => {
      queryClient.setQueryData<UserProfile[]>(["contacts", token], (current) => {
        const withoutDuplicate = current?.filter((item) => item.username !== contact.username) ?? [];
        return [contact, ...withoutDuplicate];
      });
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: (username: string) => removeContactRequest(token, username),
    onSuccess: (_result, username) => {
      queryClient.setQueryData<UserProfile[]>(["contacts", token], (current) =>
        current?.filter((item) => item.username !== username) ?? [],
      );
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: (username: string) => blockUserRequest(token, username),
    onSuccess: (blockedUser) => {
      queryClient.setQueryData<UserProfile[]>(["blocked-users", token], (current) => {
        const next = current?.filter((item) => item.username !== blockedUser.username) ?? [];
        return [blockedUser, ...next];
      });
      queryClient.setQueryData<UserProfile[]>(["contacts", token], (current) =>
        current?.filter((item) => item.username !== blockedUser.username) ?? []
      );
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: (username: string) => unblockUserRequest(token, username),
    onSuccess: (_result, username) => {
      queryClient.setQueryData<UserProfile[]>(["blocked-users", token], (current) =>
        current?.filter((item) => item.username !== username) ?? []
      );
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: (chatId: string) => leaveGroupRequest(token, chatId),
    onSuccess: (_result, chatId) => {
      removeChatLocally(chatId);
      setSidebarSheet(null);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (chatId: string) => deleteGroupRequest(token, chatId),
    onSuccess: (_result, chatId) => {
      removeChatLocally(chatId);
      setSidebarSheet(null);
    },
  });

  const addContact = (user: UserProfile) => {
    if (user.username === currentSession.user.username) {
      return;
    }

    addContactMutation.mutate(user);
  };

  const removeContact = (username: string) => {
    removeContactMutation.mutate(username);
  };

  const toggleArchiveChat = (chatId: string, archivedChatIds: Set<string>) => {
    const archived = !archivedChatIds.has(chatId);
    updateArchivedChatMutation.mutate({ chatId, archived });

    if (activeChatId === chatId && archived) {
      setSidebarSheet("archive");
      setMobilePane("sidebar");
    }
  };

  const submitProfileDisplayName = () => {
    const nextDisplayName = profileDisplayName.trim();
    if (!nextDisplayName || nextDisplayName === profile.displayName) {
      return;
    }

    updateProfileMutation.mutate(nextDisplayName);
  };

  const submitPasswordChange = () => {
    if (!passwordChangeCurrent || !passwordChangeNext) {
      return;
    }
    if (passwordChangeNext.length < 8 || passwordChangeNext !== passwordChangeConfirm) {
      return;
    }
    if (passwordChangeCurrent === passwordChangeNext) {
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordChangeCurrent,
      newPassword: passwordChangeNext,
    });
  };

  const submitCreateGroup = () => {
    const title = groupTitle.trim();
    if (!title) {
      return;
    }

    createGroupMutation.mutate({
      title,
      participantUsernames: groupParticipantUsernames,
    });
  };

  const submitUpdateGroup = () => {
    const title = groupDetailsTitle.trim();
    if (!title || !activeChat || activeChat.direct) {
      return;
    }

    const normalizedAvatarUrl = groupDetailsAvatarUrl ?? null;
    if (title === activeChat.title && normalizedAvatarUrl === (activeChat.avatarUrl ?? null)) {
      return;
    }

    updateGroupMutation.mutate({
      chatId: activeChat.id,
      title,
      avatarUrl: normalizedAvatarUrl,
    });
  };

  const submitCreateConference = (formatClock: (value: string) => string) => {
    const parsedDate = new Date(conferenceScheduledAt);
    const scheduledAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const title = conferenceTitle.trim() || `Встреча ${formatClock(scheduledAt.toISOString())}`;
    if (conferenceEditingId) {
      updateConferenceMutation.mutate({
        conferenceId: conferenceEditingId,
        title,
        scheduledAt: scheduledAt.toISOString(),
      });
      return;
    }

    createConferenceMutation.mutate({
      title,
      scheduledAt: scheduledAt.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
    });
  };

  const submitCreateConferenceNow = (formatClock: (value: string) => string) => {
    const now = new Date();
    const title = conferenceTitle.trim() || `Встреча ${formatClock(now.toISOString())}`;
    createConferenceMutation.mutate({
      title,
      scheduledAt: now.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
    });
  };

  const submitAddConferenceParticipants = () => {
    if (!conferenceInviteUsernames.length || !activeConference || activeConferenceIsArchived) {
      return;
    }

    addConferenceParticipantsMutation.mutate(conferenceInviteUsernames);
  };

  const submitAddGroupParticipants = () => {
    if (!groupInviteUsernames.length || !activeChat || activeChat.direct) {
      return;
    }

    addGroupParticipantsMutation.mutate(groupInviteUsernames);
  };

  return {
    addConferenceParticipantsMutation,
    addContact,
    addContactMutation,
    addGroupParticipantsMutation,
    avatarMutation,
    banGroupParticipantMutation,
    blockUserMutation,
    cancelConferenceMutation,
    changePasswordMutation,
    createChatMutation,
    createConferenceMutation,
    createGroupMutation,
    deleteGroupMutation,
    deleteAccountMutation,
    endConferenceMutation,
    leaveGroupMutation,
    removeContact,
    removeContactMutation,
    revokeSessionMutation,
    signOutMutation,
    submitAddConferenceParticipants,
    submitAddGroupParticipants,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitPasswordChange,
    submitUpdateGroup,
    submitProfileDisplayName,
    toggleArchiveChat,
    updateArchivedChatMutation,
    updateConferenceMutation,
    updateGroupMutation,
    updateProfileMutation,
    unblockUserMutation,
  };
}
