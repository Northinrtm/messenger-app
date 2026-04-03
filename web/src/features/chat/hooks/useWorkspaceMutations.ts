import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addContact as addContactRequest,
  addConferenceParticipants as addConferenceParticipantsRequest,
  addGroupParticipants,
  createVideoConference as createVideoConferenceRequest,
  deleteOwnAccount as deleteOwnAccountRequest,
  createDirectChat,
  createGroupChat,
  endVideoConference as endVideoConferenceRequest,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  updateArchivedChat,
  updateProfile,
  updateProfileAvatar,
} from "../../../lib/api";
import type {
  AuthResponse,
  ChatSummary,
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
  conferenceInviteUsernames: string[];
  conferenceParticipantUsernames: string[];
  conferenceScheduledAt: string;
  conferenceTitle: string;
  currentSession: AuthResponse;
  groupInviteUsernames: string[];
  groupParticipantUsernames: string[];
  groupTitle: string;
  onSessionChange: (session: AuthResponse | null) => void;
  openChat: (chatId: string, preferredTab?: ConversationListTab) => void;
  openConference: (conferenceId: string) => void;
  profile: UserProfile;
  profileDisplayName: string;
  resetConferenceComposer: () => void;
  setActiveListTab: React.Dispatch<React.SetStateAction<ConversationListTab>>;
  setConferenceInviteUsernames: React.Dispatch<React.SetStateAction<string[]>>;
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
  conferenceInviteUsernames,
  conferenceParticipantUsernames,
  conferenceScheduledAt,
  conferenceTitle,
  currentSession,
  groupInviteUsernames,
  groupParticipantUsernames,
  groupTitle,
  onSessionChange,
  openChat,
  openConference,
  profile,
  profileDisplayName,
  resetConferenceComposer,
  setActiveListTab,
  setConferenceInviteUsernames,
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
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", token], (current) => upsertChat(current, chat));
      void queryClient.invalidateQueries({ queryKey: ["chats", token] });
      setGroupTitle("");
      setGroupParticipantUsernames([]);
      setIsGroupCreatePickerOpen(false);
      setSidebarSheet(null);
      openChat(chat.id, "groups");
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

  const submitCreateGroup = () => {
    const title = groupTitle.trim();
    if (!title || !groupParticipantUsernames.length) {
      return;
    }

    createGroupMutation.mutate({
      title,
      participantUsernames: groupParticipantUsernames,
    });
  };

  const submitCreateConference = (formatClock: (value: string) => string) => {
    const parsedDate = new Date(conferenceScheduledAt);
    const scheduledAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const title = conferenceTitle.trim() || `Встреча ${formatClock(scheduledAt.toISOString())}`;
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
    createChatMutation,
    createConferenceMutation,
    createGroupMutation,
    deleteAccountMutation,
    endConferenceMutation,
    removeContact,
    removeContactMutation,
    revokeSessionMutation,
    signOutMutation,
    submitAddConferenceParticipants,
    submitAddGroupParticipants,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitProfileDisplayName,
    toggleArchiveChat,
    updateArchivedChatMutation,
    updateProfileMutation,
  };
}
