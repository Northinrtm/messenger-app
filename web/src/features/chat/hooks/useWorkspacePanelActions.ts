import { type QueryClient } from "@tanstack/react-query";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";

import type { ChatSummary, Participant, UserProfile, VideoConference } from "../../../lib/types";
import { removeVideoConference } from "../chatPresentation";
import type { MenuActionId } from "../chatUi";

type EndConferenceMutationLike = {
  mutate: (conferenceId: string, options?: { onError?: () => void }) => void;
};

type UseWorkspacePanelActionsOptions = {
  activeChat: ChatSummary | null;
  activeConference: VideoConference | null;
  activeConferenceIsArchived: boolean;
  activeConferenceIsOwnedByCurrentUser: boolean;
  activeDirectParticipant: Participant | null;
  addContact: (user: UserProfile) => void;
  closeActiveConference: () => void;
  endConferenceMutation: EndConferenceMutationLike;
  openConferenceSheet: () => void;
  openSidebarSheet: (sheet: "archive" | "profile" | "group" | "contacts" | "sessions" | "groupInfo" | "groupMembers" | "conferenceMembers") => void;
  queryClient: QueryClient;
  sessionToken: string;
  setIsGroupInvitePickerOpen: Dispatch<SetStateAction<boolean>>;
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
  signOut: () => void;
};

export function useWorkspacePanelActions({
  activeChat,
  activeConference,
  activeConferenceIsArchived,
  activeConferenceIsOwnedByCurrentUser,
  activeDirectParticipant,
  addContact,
  closeActiveConference,
  endConferenceMutation,
  openConferenceSheet,
  openSidebarSheet,
  queryClient,
  sessionToken,
  setIsGroupInvitePickerOpen,
  setIsMenuOpen,
  signOut,
}: UseWorkspacePanelActionsOptions) {
  const handleConferenceStageExit = useEffectEvent(() => {
    if (!activeConference) {
      closeActiveConference();
      return;
    }

    const conference = activeConference;
    if (activeConferenceIsOwnedByCurrentUser) {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", sessionToken], (current) =>
        removeVideoConference(current, conference.id)
      );
      endConferenceMutation.mutate(conference.id, {
        onError: () => {
          void queryClient.invalidateQueries({ queryKey: ["video-conferences", sessionToken] });
        },
      });
    }

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
    handleConferenceStageExit,
    handleMenuAction,
    openConferenceMembersSheet,
    openGroupInfoSheet,
    openGroupMembersSheet,
  };
}
