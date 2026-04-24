import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLocalDrafts, writeLocalDraft } from "./localDrafts";

describe("localDrafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the updated draft list even when local storage is full", () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === "north-messenger-local-drafts:user-1") {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }

      return originalSetItem.call(this, key, value);
    });

    const drafts = writeLocalDraft("user-1", "chat-1", "hello from a full storage");

    expect(drafts).toEqual([
      expect.objectContaining({
        chatId: "chat-1",
        content: "hello from a full storage",
      }),
    ]);
    expect(readLocalDrafts("user-1")).toEqual([]);
  });
});
