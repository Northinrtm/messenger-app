import { useEffectEvent, type Dispatch, type SetStateAction } from "react";

import type { UserProfile } from "../../../lib/types";

const toggleUsernameSelection = (current: string[], username: string) => {
  return current.includes(username)
    ? current.filter((item) => item !== username)
    : [...current, username];
};

type UseWorkspaceFormActionsOptions = {
  addContact: (user: UserProfile) => void;
  setConferenceInviteUsernames: Dispatch<SetStateAction<string[]>>;
  setConferenceParticipantUsernames: Dispatch<SetStateAction<string[]>>;
  setContactSearch: Dispatch<SetStateAction<string>>;
  setGroupInviteUsernames: Dispatch<SetStateAction<string[]>>;
  setGroupParticipantUsernames: Dispatch<SetStateAction<string[]>>;
  submitActiveDraft: (draft: string, files?: File[]) => boolean | Promise<boolean>;
  submitCreateConference: (formatClock: (value: string) => string) => void;
  submitCreateConferenceNow: (formatClock: (value: string) => string) => void;
  submitCreateGroup: () => void;
  submitProfileDisplayName: () => void;
};

export function useWorkspaceFormActions({
  addContact,
  setConferenceInviteUsernames,
  setConferenceParticipantUsernames,
  setContactSearch,
  setGroupInviteUsernames,
  setGroupParticipantUsernames,
  submitActiveDraft,
  submitCreateConference,
  submitCreateConferenceNow,
  submitCreateGroup,
  submitProfileDisplayName,
}: UseWorkspaceFormActionsOptions) {
  const toggleGroupParticipant = useEffectEvent((username: string) => {
    setGroupParticipantUsernames((current) => toggleUsernameSelection(current, username));
  });

  const toggleConferenceParticipant = useEffectEvent((username: string) => {
    setConferenceParticipantUsernames((current) => toggleUsernameSelection(current, username));
  });

  const toggleGroupInviteParticipant = useEffectEvent((username: string) => {
    setGroupInviteUsernames((current) => toggleUsernameSelection(current, username));
  });

  const toggleConferenceInviteParticipant = useEffectEvent((username: string) => {
    setConferenceInviteUsernames((current) => toggleUsernameSelection(current, username));
  });

  const handleSubmitProfileDisplayName = useEffectEvent(() => {
    submitProfileDisplayName();
  });

  const handleSubmitActiveDraft = useEffectEvent((draft: string, files?: File[]) => {
    return submitActiveDraft(draft, files);
  });

  const handleSubmitCreateGroup = useEffectEvent(() => {
    submitCreateGroup();
  });

  const handleSubmitCreateConference = useEffectEvent((formatClock: (value: string) => string) => {
    submitCreateConference(formatClock);
  });

  const handleSubmitCreateConferenceNow = useEffectEvent((formatClock: (value: string) => string) => {
    submitCreateConferenceNow(formatClock);
  });

  const handleAddContact = useEffectEvent((user: UserProfile) => {
    addContact(user);
    setContactSearch("");
  });

  return {
    handleAddContact,
    handleSubmitActiveDraft,
    handleSubmitCreateConference,
    handleSubmitCreateConferenceNow,
    handleSubmitCreateGroup,
    handleSubmitProfileDisplayName,
    toggleConferenceInviteParticipant,
    toggleConferenceParticipant,
    toggleGroupInviteParticipant,
    toggleGroupParticipant,
  };
}
