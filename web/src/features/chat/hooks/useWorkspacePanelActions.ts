import { type QueryClient } from "@tanstack/react-query";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";

import type { ChatSummary, Participant, UserProfile, VideoConference } from "../../../lib/types";
import { removeVideoConference } from "../chatPresentation";
import type { MenuActionId } from "../chatUi";

type EndConferenceMutationLike = {
  mutate: (conferenceId: string, options?: { onError?: () => void }) => void;
};

type CancelConferenceMutationLike = {
  mutate: (conferenceId: string) => void;
};

type UseWorkspacePanelActionsOptions = {
  activeChat: ChatSummary | null;
  activeConference: VideoConference | null;
  activeConferenceIsArchived: boolean;
  activeConferenceIsOwnedByCurrentUser: boolean;
  activeDirectParticipant: Participant | null;
  addContact: (user: UserProfile) => void;
  cancelConferenceMutation: CancelConferenceMutationLike;
  closeActiveConference: () => void;
  endConferenceMutation: EndConferenceMutationLike;
  openConferenceEditor: (conference: VideoConference) => void;
  openConferenceSheet: () => void;
  openSidebarSheet: (sheet: "archive" | "profile" | "group" | "contacts" | "sessions" | "groupInfo" | "groupMembers" | "conferenceMembers") => void;
  queryClient: QueryClient;
  sessionToken: string;
  setIsGroupInvitePickerOpen: Dispatch<SetStateAction<boolean>>;
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
  signOut: () => void;
};

type EndConferenceOptions = {
  skipConfirm?: boolean;
};

export function useWorkspacePanelActions({
  activeChat,
  activeConference,
  activeConferenceIsArchived,
  activeConferenceIsOwnedByCurrentUser,
  activeDirectParticipant,
  addContact,
  cancelConferenceMutation,
  closeActiveConference,
  endConferenceMutation,
  openConferenceEditor,
  openConferenceSheet,
  openSidebarSheet,
  queryClient,
  sessionToken,
  setIsGroupInvitePickerOpen,
  setIsMenuOpen,
  signOut,
}: UseWorkspacePanelActionsOptions) {
  const handleConferenceStageExit = useEffectEvent(() => {
    closeActiveConference();
  });

  const handleEndConference = useEffectEvent((options?: EndConferenceOptions) => {
    if (
      !activeConference ||
      !activeConferenceIsOwnedByCurrentUser ||
      activeConferenceIsArchived ||
      !activeConference.startedAt
    ) {
      return;
    }

    if (options?.skipConfirm) {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", sessionToken], (current) =>
        removeVideoConference(current, activeConference.id)
      );
      endConferenceMutation.mutate(activeConference.id, {
        onError: () => {
          void queryClient.invalidateQueries({ queryKey: ["video-conferences", sessionToken] });
        },
      });
      closeActiveConference();
      return;
    }

    if (!window.confirm(`Завершить встречу "${activeConference.title}" для всех участников?`)) {
      return;
    }

    queryClient.setQueryData<VideoConference[]>(["video-conferences", sessionToken], (current) =>
      removeVideoConference(current, activeConference.id)
    );
    endConferenceMutation.mutate(activeConference.id, {
      onError: () => {
        void queryClient.invalidateQueries({ queryKey: ["video-conferences", sessionToken] });
      },
    });
    closeActiveConference();
  });

  const addActiveChatToContacts = useEffectEvent(() => {
    if (!activeDirectParticipant) {
      return;
    }

    addContact({
      id: activeDirectParticipant.id,
      username: activeDirectParticipant.username,
      displayName: activeDirectParticipant.displayName,
      profession: activeDirectParticipant.profession ?? null,
      createdAt: new Date().toISOString(),
      avatarUrl: activeDirectParticipant.avatarUrl ?? null,
      online: activeDirectParticipant.online === true,
    });
  });

  const openGroupMembersSheet = useEffectEvent((options?: { openInvitePicker?: boolean }) => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    setIsGroupInvitePickerOpen(Boolean(options?.openInvitePicker));
    openSidebarSheet("groupMembers");
  });

  const openGroupInfoSheet = useEffectEvent(() => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openSidebarSheet("groupInfo");
  });

  const openConferenceMembersSheet = useEffectEvent(() => {
    if (!activeConference || !activeConferenceIsOwnedByCurrentUser || activeConferenceIsArchived) {
      return;
    }

    openSidebarSheet("conferenceMembers");
  });

  const openConferenceEditorSheet = useEffectEvent(() => {
    if (
      !activeConference ||
      !activeConferenceIsOwnedByCurrentUser ||
      activeConferenceIsArchived ||
      activeConference.startedAt
    ) {
      return;
    }

    openConferenceEditor(activeConference);
  });

  const handleCancelScheduledConference = useEffectEvent(() => {
    if (
      !activeConference ||
      !activeConferenceIsOwnedByCurrentUser ||
      activeConferenceIsArchived ||
      activeConference.startedAt
    ) {
      return;
    }

    if (!window.confirm(`Отменить встречу "${activeConference.title}"?`)) {
      return;
    }

    cancelConferenceMutation.mutate(activeConference.id);
  });

  const handleMenuAction = useEffectEvent((actionId: MenuActionId) => {
    switch (actionId) {
      case "conference":
        openConferenceSheet();
        return;
      case "archive":
        openSidebarSheet("archive");
        return;
      case "profile":
        openSidebarSheet("profile");
        return;
      case "group":
        openSidebarSheet("group");
        return;
      case "contacts":
        openSidebarSheet("contacts");
        return;
      case "sessions":
        openSidebarSheet("sessions");
        return;
      case "logout":
        setIsMenuOpen(false);
        signOut();
        return;
      default:
        setIsMenuOpen(false);
    }
  });

  return {
    addActiveChatToContacts,
    handleCancelScheduledConference,
    handleEndConference,
    handleConferenceStageExit,
    handleMenuAction,
    openConferenceEditorSheet,
    openConferenceMembersSheet,
    openGroupInfoSheet,
    openGroupMembersSheet,
  };
}
