import { describe, expect, it } from "vitest";

import { shouldAutoReloadForBuildUpdate } from "./buildUpdateGuard";

function createState(
  overrides: Partial<Parameters<typeof shouldAutoReloadForBuildUpdate>[0]> = {}
): Parameters<typeof shouldAutoReloadForBuildUpdate>[0] {
  return {
    hasAvailableBuildUpdate: true,
    activeConferenceId: null,
    hasActiveComposerText: false,
    draftsByChatId: {},
    pendingOutgoingCountByChatId: {},
    replyingToMessageId: null,
    editingMessageId: null,
    forwardingMessageIds: [],
    selectedMessageIds: [],
    ...overrides,
  };
}

describe("buildUpdateGuard", () => {
  it("auto-reloads only when the workspace is idle", () => {
    expect(shouldAutoReloadForBuildUpdate(createState())).toBe(true);
  });

  it("blocks auto-reload when there is no pending build update", () => {
    expect(
      shouldAutoReloadForBuildUpdate(createState({ hasAvailableBuildUpdate: false }))
    ).toBe(false);
  });

  it("blocks auto-reload while a draft is open in the active chat", () => {
    expect(
      shouldAutoReloadForBuildUpdate(createState({ hasActiveComposerText: true }))
    ).toBe(false);
  });

  it("blocks auto-reload while any chat still has a persisted draft", () => {
    expect(
      shouldAutoReloadForBuildUpdate(
        createState({ draftsByChatId: { "chat-2": "resume later" } })
      )
    ).toBe(false);
  });

  it("blocks auto-reload while messages are still sending", () => {
    expect(
      shouldAutoReloadForBuildUpdate(
        createState({ pendingOutgoingCountByChatId: { "chat-1": 1 } })
      )
    ).toBe(false);
  });

  it("blocks auto-reload while conference mode is active", () => {
    expect(
      shouldAutoReloadForBuildUpdate(createState({ activeConferenceId: "conf-1" }))
    ).toBe(false);
  });

  it("blocks auto-reload while reply, edit, forward, or selection flows are open", () => {
    expect(
      shouldAutoReloadForBuildUpdate(createState({ replyingToMessageId: "message-1" }))
    ).toBe(false);
    expect(
      shouldAutoReloadForBuildUpdate(createState({ editingMessageId: "message-1" }))
    ).toBe(false);
    expect(
      shouldAutoReloadForBuildUpdate(createState({ forwardingMessageIds: ["message-1"] }))
    ).toBe(false);
    expect(
      shouldAutoReloadForBuildUpdate(createState({ selectedMessageIds: ["message-1"] }))
    ).toBe(false);
  });
});
