import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addContact as addContactRequest,
  addConferenceParticipants as addConferenceParticipantsRequest,
  addGroupParticipants,
  assignGroupModerator as assignGroupModeratorRequest,
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
  removeGroupParticipant as removeGroupParticipantRequest,
  removeContact as removeContactRequest,
  revokeGroupModerator as revokeGroupModeratorRequest,
  revokeSession,
  resendOwnEmailVerification,
  startGroupConferenceCall as startGroupConferenceCallRequest,
  unblockUser as unblockUserRequest,
  updateArchivedChat,
  updateGroupChat as updateGroupChatRequest,
  updateProfile,
  updateProfileAvatar,
  updateVideoConference as updateVideoConferenceRequest,
} from "../../../lib/api";
import type {
  AuthResponse,
  ChatPrejoinHistoryPolicy,
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
  conferenceChatId: string | null;
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
  groupDetailsPrejoinHistoryPolicy: ChatPrejoinHistoryPolicy;
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
  profileProfession: string;
  resetConferenceComposer: () => void;
  setActiveListTab: React.Dispatch<React.SetStateAction<ConversationListTab>>;
  setConferenceInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupDetailsAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setGroupDetailsPrejoinHistoryPolicy: React.Dispatch<React.SetStateAction<ChatPrejoinHistoryPolicy>>;
  setGroupDetailsTitle: React.Dispatch<React.SetStateAction<string>>;
  setGroupInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupParticipantUsernames: React.Dispatch<React.SetStateAction<string[]>>;
  setGroupTitle: React.Dispatch<React.SetStateAction<string>>;
  setIsGroupCreatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGroupInvitePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMobilePane: React.Dispatch<React.SetStateAction<"sidebar" | "conversation">>;
  setProfileProfession: React.Dispatch<React.SetStateAction<string>>;
  setSidebarSheet: React.Dispatch<React.SetStateAction<SidebarSheet>>;
};

export function useWorkspaceMutations({
  activeChat,
  activeChatId,
  activeConference,
  activeConferenceId,
  activeConferenceIsArchived,
  conferenceChatId,
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
  groupDetailsPrejoinHistoryPolicy,
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
  profileProfession,
  resetConferenceComposer,
  setActiveListTab,
  setConferenceInviteUsernames,
  setGroupDetailsAvatarUrl,
  setGroupDetailsPrejoinHistoryPolicy,
  setGroupDetailsTitle,
  setGroupInviteUsernames,
  setGroupParticipantUsernames,
  setGroupTitle,
  setIsGroupCreatePickerOpen,
  setIsGroupInvitePickerOpen,
  setMobilePane,
  setProfileProfession,
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
      openChat(chat.id, "chats");
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
      openChat(chat.id, "chats");
      onGroupCreated?.(chat, { openMenu: input.participantUsernames.length === 0 });
      setSidebarSheet(null);
    },
  });

  const createConferenceMutation = useMutation({
    mutationFn: (input: {
      title: string;
      scheduledAt: string;
      participantUsernames: string[];
      chatId?: string | null;
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

  const startGroupConferenceCallMutation = useMutation({
    mutationFn: (chatId: string) => startGroupConferenceCallRequest(token, chatId),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", token], (current) =>
        upsertVideoConferences(current, conference),
      );
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

  const removeGroupParticipantMutation = useMutation({
    mutationFn: (participant: Participant) =>
      removeGroupParticipantRequest(token, activeChat!.id, participant.username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
    },
  });

  const assignGroupModeratorMutation = useMutation({
    mutationFn: (participant: Participant) =>
      assignGroupModeratorRequest(token, activeChat!.id, participant.username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
    },
  });

  const revokeGroupModeratorMutation = useMutation({
    mutationFn: (participant: Participant) =>
      revokeGroupModeratorRequest(token, activeChat!.id, participant.username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: (input: {
      chatId: string;
      title: string;
      avatarUrl: string | null;
      prejoinHistoryPolicy: ChatPrejoinHistoryPolicy;
    }) =>
      updateGroupChatRequest(token, input.chatId, {
        title: input.title,
        avatarUrl: input.avatarUrl,
        prejoinHistoryPolicy: input.prejoinHistoryPolicy,
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      setGroupDetailsTitle(chat.title);
      setGroupDetailsAvatarUrl(chat.avatarUrl ?? null);
      setGroupDetailsPrejoinHistoryPolicy(chat.prejoinHistoryPolicy ?? "FULL_HISTORY");
    },
  });

  const updateGroupHistoryPolicyMutation = useMutation({
    mutationFn: (input: {
      chatId: string;
      title: string;
      avatarUrl: string | null;
      prejoinHistoryPolicy: ChatPrejoinHistoryPolicy;
    }) =>
      updateGroupChatRequest(token, input.chatId, {
        title: input.title,
        avatarUrl: input.avatarUrl,
        prejoinHistoryPolicy: input.prejoinHistoryPolicy,
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      setGroupDetailsPrejoinHistoryPolicy(chat.prejoinHistoryPolicy ?? "FULL_HISTORY");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: async () => {
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
    mutationFn: (input: { displayName: string; profession: string | null }) => updateProfile(token, input),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
      setProfileProfession(nextProfile.profession ?? "");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) =>
      changePasswordRequest(token, {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      }),
    onSuccess: () => {
      onPasswordChanged?.();
      queryClient.clear();
      onSessionChange(null);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string | null) => updateProfileAvatar(token, avatarUrl),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
    },
  });

  const resendOwnEmailVerificationMutation = useMutation({
    mutationFn: () => resendOwnEmailVerification(token),
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
    onMutate: async (chatId) => {
      const chatsKey = ["chats", token] as const;
      const archivedChatsKey = ["archived-chats", token] as const;
      await queryClient.cancelQueries({ queryKey: chatsKey });
      await queryClient.cancelQueries({ queryKey: archivedChatsKey });
      const previousChats = queryClient.getQueryData<ChatSummary[]>(chatsKey) ?? [];
      const previousArchivedChats = queryClient.getQueryData<string[]>(archivedChatsKey) ?? [];

      removeChatLocally(chatId);
      setSidebarSheet(null);

      return {
        previousArchivedChats,
        previousChats,
        wasActive: activeChatId === chatId,
      };
    },
    onSuccess: (_result, chatId) => {
      removeChatLocally(chatId);
      setSidebarSheet(null);
    },
    onError: (_error, _chatId, context) => {
      if (context) {
        queryClient.setQueryData(["chats", token], context.previousChats);
        queryClient.setQueryData(["archived-chats", token], context.previousArchivedChats);
        if (context.wasActive) {
          openChat(_chatId, "chats");
        }
      }
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
    const nextProfession = profileProfession.trim();
    const normalizedProfession = nextProfession ? nextProfession : null;
    const profileProfessionChanged = normalizedProfession !== (profile.profession ?? null);
    if (!nextDisplayName || (nextDisplayName === profile.displayName && !profileProfessionChanged)) {
      return;
    }

    updateProfileMutation.mutate({
      displayName: nextDisplayName,
      profession: normalizedProfession,
    });
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
    const currentPolicy = activeChat.prejoinHistoryPolicy ?? "FULL_HISTORY";
    if (
      title === activeChat.title &&
      normalizedAvatarUrl === (activeChat.avatarUrl ?? null) &&
      groupDetailsPrejoinHistoryPolicy === currentPolicy
    ) {
      return;
    }

    updateGroupMutation.mutate({
      chatId: activeChat.id,
      title,
      avatarUrl: normalizedAvatarUrl,
      prejoinHistoryPolicy: groupDetailsPrejoinHistoryPolicy,
    });
  };

  const submitUpdateGroupPrejoinHistoryPolicy = (prejoinHistoryPolicy: ChatPrejoinHistoryPolicy) => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    const currentPolicy = activeChat.prejoinHistoryPolicy ?? "FULL_HISTORY";
    if (prejoinHistoryPolicy === currentPolicy) {
      return;
    }

    setGroupDetailsPrejoinHistoryPolicy(prejoinHistoryPolicy);
    updateGroupHistoryPolicyMutation.mutate(
      {
        chatId: activeChat.id,
        title: activeChat.title,
        avatarUrl: activeChat.avatarUrl ?? null,
        prejoinHistoryPolicy,
      },
      {
        onError: () => {
          setGroupDetailsPrejoinHistoryPolicy(currentPolicy);
        },
      }
    );
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
      chatId: conferenceChatId,
    });
  };

  const submitCreateConferenceNow = (formatClock: (value: string) => string) => {
    const now = new Date();
    const title = conferenceTitle.trim() || `Встреча ${formatClock(now.toISOString())}`;
    createConferenceMutation.mutate({
      title,
      scheduledAt: now.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
      chatId: conferenceChatId,
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
    assignGroupModeratorMutation,
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
    removeGroupParticipantMutation,
    removeContact,
    removeContactMutation,
    revokeGroupModeratorMutation,
    revokeSessionMutation,
    resendOwnEmailVerificationMutation,
    signOutMutation,
    startGroupConferenceCallMutation,
    submitAddConferenceParticipants,
    submitAddGroupParticipants,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitPasswordChange,
    submitUpdateGroup,
    submitUpdateGroupPrejoinHistoryPolicy,
    submitProfileDisplayName,
    toggleArchiveChat,
    updateArchivedChatMutation,
    updateConferenceMutation,
    updateGroupMutation,
    updateGroupHistoryPolicyMutation,
    updateProfileMutation,
    unblockUserMutation,
  };
}
