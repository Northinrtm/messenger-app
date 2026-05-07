import { describe, expect, it } from "vitest";

import { getActiveChatPreviewUnreadMode } from "./useWorkspaceEffects";

describe("getActiveChatPreviewUnreadMode", () => {
  it("keeps unread count server-driven until the user actually opens the chat", () => {
    expect(getActiveChatPreviewUnreadMode(false)).toBe("keep");
  });

  it("clears unread count only for a visibly opened active chat", () => {
    expect(getActiveChatPreviewUnreadMode(true)).toBe("clear");
  });
});
