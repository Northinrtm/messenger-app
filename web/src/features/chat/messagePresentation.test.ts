import { describe, expect, it } from "vitest";

import {
  getMessageStatusGlyph,
  getMessageStatusLabel,
} from "./messagePresentation";

describe("messagePresentation status indicators", () => {
  it("keeps delivered and read visually distinct", () => {
    expect(
      getMessageStatusGlyph({
        state: "DELIVERED",
        recipientCount: 1,
        deliveredCount: 1,
        readCount: 0,
      })
    ).toBe("\u2713");

    expect(
      getMessageStatusGlyph({
        state: "READ",
        recipientCount: 1,
        deliveredCount: 1,
        readCount: 1,
      })
    ).toBe("\u2713\u2713");
  });

  it("includes receipt counts in delivered and read labels", () => {
    expect(
      getMessageStatusLabel({
        state: "DELIVERED",
        recipientCount: 3,
        deliveredCount: 2,
        readCount: 0,
      })
    ).toContain("(2/3)");

    expect(
      getMessageStatusLabel({
        state: "READ",
        recipientCount: 3,
        deliveredCount: 3,
        readCount: 1,
      })
    ).toContain("(1/3)");
  });
});
