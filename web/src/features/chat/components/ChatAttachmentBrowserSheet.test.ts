import { describe, expect, it } from "vitest";

import {
  buildAttachmentMessageJumpCursor,
  clampPhotoViewerZoom,
  resolveAdjacentPhotoViewerIndex,
} from "./ChatAttachmentBrowserSheet";

describe("buildAttachmentMessageJumpCursor", () => {
  it("returns the exclusive page cursor right after the target message order", () => {
    expect(buildAttachmentMessageJumpCursor(101)).toBe("102");
  });

  it("returns null when the message server order is unavailable", () => {
    expect(buildAttachmentMessageJumpCursor(null)).toBeNull();
  });
});

describe("clampPhotoViewerZoom", () => {
  it("keeps zoom inside the supported range", () => {
    expect(clampPhotoViewerZoom(0.5)).toBe(1);
    expect(clampPhotoViewerZoom(1.75)).toBe(1.75);
    expect(clampPhotoViewerZoom(5)).toBe(4);
  });

  it("rounds zoom to two decimal places", () => {
    expect(clampPhotoViewerZoom(1.333)).toBe(1.33);
  });
});

describe("resolveAdjacentPhotoViewerIndex", () => {
  it("moves to the previous and next photo within bounds", () => {
    expect(resolveAdjacentPhotoViewerIndex(2, -1, 5)).toBe(1);
    expect(resolveAdjacentPhotoViewerIndex(2, 1, 5)).toBe(3);
  });

  it("returns null when navigation would leave the loaded photo range", () => {
    expect(resolveAdjacentPhotoViewerIndex(0, -1, 5)).toBeNull();
    expect(resolveAdjacentPhotoViewerIndex(4, 1, 5)).toBeNull();
    expect(resolveAdjacentPhotoViewerIndex(0, 1, 0)).toBeNull();
  });
});
