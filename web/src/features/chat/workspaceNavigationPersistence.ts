import type { ConversationListTab } from "./chatUi";

export type ConferenceViewportMode = "full" | "mini";
export type MobilePane = "sidebar" | "conversation";

export type WorkspaceNavigationState = {
  activeChatId: string | null;
  activeConferenceId: string | null;
  activeListTab: ConversationListTab;
  conferenceViewportMode: ConferenceViewportMode;
  mobilePane: MobilePane;
};

const WORKSPACE_NAVIGATION_STORAGE_PREFIX = "north-messenger-workspace-navigation";
const WORKSPACE_NAVIGATION_STORAGE_VERSION = 1;

const defaultWorkspaceNavigationState: WorkspaceNavigationState = {
  activeChatId: null,
  activeConferenceId: null,
  activeListTab: "chats",
  conferenceViewportMode: "full",
  mobilePane: "sidebar",
};

type PersistedWorkspaceNavigationState = Partial<WorkspaceNavigationState> & {
  version?: number;
};

function getWorkspaceNavigationStorageKey(userId: string) {
  return `${WORKSPACE_NAVIGATION_STORAGE_PREFIX}:${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readConversationListTab(value: unknown): ConversationListTab {
  return value === "conferences" ? "conferences" : "chats";
}

function readConferenceViewportMode(value: unknown): ConferenceViewportMode {
  return value === "mini" ? "mini" : "full";
}

function readMobilePane(value: unknown): MobilePane {
  return value === "conversation" ? "conversation" : "sidebar";
}

export function normalizeWorkspaceNavigationState(
  value: unknown
): WorkspaceNavigationState {
  if (!isRecord(value)) {
    return { ...defaultWorkspaceNavigationState };
  }

  const candidate = value as PersistedWorkspaceNavigationState;
  const activeChatId = readOptionalString(candidate.activeChatId);
  const activeConferenceId = readOptionalString(candidate.activeConferenceId);
  const activeListTab = readConversationListTab(candidate.activeListTab);
  let conferenceViewportMode = readConferenceViewportMode(candidate.conferenceViewportMode);
  let mobilePane = readMobilePane(candidate.mobilePane);

  if (!activeConferenceId || (activeConferenceId && !activeChatId)) {
    conferenceViewportMode = "full";
  } else if (activeChatId && activeConferenceId) {
    conferenceViewportMode = "mini";
  }

  if (activeChatId || activeConferenceId) {
    mobilePane = "conversation";
  }

  return {
    activeChatId,
    activeConferenceId,
    activeListTab,
    conferenceViewportMode,
    mobilePane,
  };
}

export function readWorkspaceNavigationState(userId: string): WorkspaceNavigationState {
  if (typeof window === "undefined") {
    return { ...defaultWorkspaceNavigationState };
  }

  try {
    const rawValue = window.localStorage.getItem(getWorkspaceNavigationStorageKey(userId));
    if (!rawValue) {
      return { ...defaultWorkspaceNavigationState };
    }

    return normalizeWorkspaceNavigationState(JSON.parse(rawValue));
  } catch {
    return { ...defaultWorkspaceNavigationState };
  }
}

export function writeWorkspaceNavigationState(
  userId: string,
  state: WorkspaceNavigationState
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const normalizedState = normalizeWorkspaceNavigationState(state);
    window.localStorage.setItem(
      getWorkspaceNavigationStorageKey(userId),
      JSON.stringify({
        version: WORKSPACE_NAVIGATION_STORAGE_VERSION,
        ...normalizedState,
      })
    );
  } catch {
    return;
  }
}
