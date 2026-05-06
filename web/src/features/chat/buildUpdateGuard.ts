export type BuildUpdateAutoReloadState = {
  hasAvailableBuildUpdate: boolean;
  activeConferenceId: string | null;
  hasActiveComposerText: boolean;
  draftsByChatId: Record<string, string>;
  pendingOutgoingCountByChatId: Record<string, number>;
  replyingToMessageId: string | null;
  editingMessageId: string | null;
  forwardingMessageIds: string[];
  selectedMessageIds: string[];
};

export function shouldAutoReloadForBuildUpdate(state: BuildUpdateAutoReloadState) {
  if (!state.hasAvailableBuildUpdate) {
    return false;
  }

  if (state.activeConferenceId) {
    return false;
  }

  if (state.hasActiveComposerText) {
    return false;
  }

  if (Object.values(state.draftsByChatId).some((draft) => draft.trim().length > 0)) {
    return false;
  }

  if (Object.values(state.pendingOutgoingCountByChatId).some((count) => count > 0)) {
    return false;
  }

  if (state.replyingToMessageId || state.editingMessageId) {
    return false;
  }

  if (state.forwardingMessageIds.length > 0 || state.selectedMessageIds.length > 0) {
    return false;
  }

  return true;
}
