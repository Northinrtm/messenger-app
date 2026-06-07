import { describe, expect, it } from "vitest";

import {
  buildChatListPreviewText,
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

describe("buildChatListPreviewText", () => {
  const replySnippet = {
    id: "m-original",
    createdAt: "2026-06-07T09:20:00.000Z",
    preview: "Исходное сообщение собеседника",
    sender: {
      id: "u-2",
      username: "beta",
      displayName: "Beta",
      profession: null,
      avatarUrl: null,
      online: true,
    },
  };

  it("shows the reply's own text rather than the quoted message", () => {
    const preview = buildChatListPreviewText({
      content: "Это мой ответ",
      attachments: [],
      replyTo: replySnippet,
    });

    expect(preview).toBe("↪ Это мой ответ");
    expect(preview).not.toContain("Исходное сообщение собеседника");
  });

  it("falls back to the reply attachment label when the reply has no text", () => {
    const preview = buildChatListPreviewText({
      content: "",
      attachments: [{ id: "a-1", fileName: "photo.png", mimeType: "image/png", sizeBytes: 1024 }],
      replyTo: replySnippet,
    });

    expect(preview).toBe("↪ Файл: photo.png");
  });

  it("uses the plain content preview for non-reply messages", () => {
    expect(
      buildChatListPreviewText({ content: "Привет", attachments: [], replyTo: null })
    ).toBe("Привет");
  });
});
