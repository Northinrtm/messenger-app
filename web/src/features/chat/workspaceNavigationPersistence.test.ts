import { beforeEach, describe, expect, it } from "vitest";

import {
  normalizeWorkspaceNavigationState,
  readWorkspaceNavigationState,
  writeWorkspaceNavigationState,
  type WorkspaceNavigationState,
} from "./workspaceNavigationPersistence";

describe("workspaceNavigationPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults for malformed saved state", () => {
    window.localStorage.setItem("north-messenger-workspace-navigation:user-1", "{bad json");

    expect(readWorkspaceNavigationState("user-1")).toEqual({
      activeChatId: null,
      activeConferenceId: null,
      activeListTab: "chats",
      conferenceViewportMode: "full",
      mobilePane: "sidebar",
    });
  });

  it("round trips navigation state per user", () => {
    const state: WorkspaceNavigationState = {
      activeChatId: "chat-1",
      activeConferenceId: "conference-1",
      activeListTab: "conferences",
      conferenceViewportMode: "mini",
      mobilePane: "conversation",
    };

    writeWorkspaceNavigationState("user-1", state);

    expect(readWorkspaceNavigationState("user-1")).toEqual(state);
    expect(readWorkspaceNavigationState("user-2")).toEqual({
      activeChatId: null,
      activeConferenceId: null,
      activeListTab: "chats",
      conferenceViewportMode: "full",
      mobilePane: "sidebar",
    });
  });

  it("normalizes chat plus conference to a docked conference", () => {
    expect(
      normalizeWorkspaceNavigationState({
        activeChatId: "chat-1",
        activeConferenceId: "conference-1",
        activeListTab: "chats",
        conferenceViewportMode: "full",
        mobilePane: "sidebar",
      })
    ).toEqual({
      activeChatId: "chat-1",
      activeConferenceId: "conference-1",
      activeListTab: "chats",
      conferenceViewportMode: "mini",
      mobilePane: "conversation",
    });
  });

  it("normalizes a lone conference to full view", () => {
    expect(
      normalizeWorkspaceNavigationState({
        activeChatId: null,
        activeConferenceId: "conference-1",
        activeListTab: "conferences",
        conferenceViewportMode: "mini",
        mobilePane: "sidebar",
      })
    ).toEqual({
      activeChatId: null,
      activeConferenceId: "conference-1",
      activeListTab: "conferences",
      conferenceViewportMode: "full",
      mobilePane: "conversation",
    });
  });
});
