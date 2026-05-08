import { describe, expect, it } from "vitest";

import { buildAttachmentMessageJumpCursor } from "./ChatAttachmentBrowserSheet";

describe("buildAttachmentMessageJumpCursor", () => {
  it("returns the exclusive page cursor right after the target message order", () => {
    expect(buildAttachmentMessageJumpCursor(101)).toBe("102");
  });

  it("returns null when the message server order is unavailable", () => {
    expect(buildAttachmentMessageJumpCursor(null)).toBeNull();
  });
});
