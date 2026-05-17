import { describe, expect, it } from "vitest";

import {
  extractMentionUsernames,
  findActiveMentionQuery,
  replaceActiveMentionQuery,
} from "./messageMentions";

describe("messageMentions", () => {
  it("extracts unique mention usernames and ignores email-like text", () => {
    expect(extractMentionUsernames("hello @North and mail@test.com and @anna @north")).toEqual([
      "north",
      "anna",
    ]);
  });

  it("finds the active mention query at the caret", () => {
    expect(findActiveMentionQuery("hello @an", 9)).toEqual({
      start: 6,
      end: 9,
      query: "an",
    });
  });

  it("replaces the active mention query with a normalized username and trailing space", () => {
    expect(
      replaceActiveMentionQuery("hello @an", { start: 6, end: 9, query: "an" }, "Anna")
    ).toEqual({
      value: "hello @anna ",
      caretPosition: 12,
    });
  });
});
