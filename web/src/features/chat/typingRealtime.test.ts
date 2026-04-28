import { describe, expect, it } from "vitest";

import {
  getTypingIndicatorClearDelay,
  parseRealtimeEventTimestamp,
  shouldProcessTypingEvent,
  shouldSendTypingHeartbeat,
} from "./typingRealtime";

describe("typingRealtime", () => {
  it("publishes heartbeat only for recent input in the same chat", () => {
    expect(
      shouldSendTypingHeartbeat(
        {
          chatId: "chat-1",
          lastInputAt: 5_000,
        },
        "chat-1",
        10_000,
        8_000
      )
    ).toBe(true);

    expect(
      shouldSendTypingHeartbeat(
        {
          chatId: "chat-1",
          lastInputAt: 0,
        },
        "chat-1",
        10_000,
        8_000
      )
    ).toBe(false);

    expect(
      shouldSendTypingHeartbeat(
        {
          chatId: "chat-1",
          lastInputAt: 1_000,
        },
        "chat-1",
        10_000,
        8_000
      )
    ).toBe(false);

    expect(
      shouldSendTypingHeartbeat(
        {
          chatId: "chat-2",
          lastInputAt: 9_000,
        },
        "chat-1",
        10_000,
        8_000
      )
    ).toBe(false);
  });

  it("keeps the typing indicator visible for the minimum window", () => {
    expect(getTypingIndicatorClearDelay(undefined, 10_000, 1_200)).toBe(0);
    expect(getTypingIndicatorClearDelay(9_400, 10_000, 1_200)).toBe(600);
    expect(getTypingIndicatorClearDelay(8_000, 10_000, 1_200)).toBe(0);
  });

  it("ignores stale typing events and accepts newer ones", () => {
    expect(shouldProcessTypingEvent(undefined, 10_000)).toBe(true);
    expect(shouldProcessTypingEvent(10_000, 10_000)).toBe(false);
    expect(shouldProcessTypingEvent(10_000, 10_001)).toBe(true);
    expect(shouldProcessTypingEvent(10_000, 9_999)).toBe(false);
  });

  it("parses realtime timestamps with a fallback", () => {
    expect(parseRealtimeEventTimestamp("2026-04-28T10:15:00.000Z")).toBe(
      Date.parse("2026-04-28T10:15:00.000Z")
    );
    expect(parseRealtimeEventTimestamp("invalid", 123)).toBe(123);
    expect(parseRealtimeEventTimestamp(null, 456)).toBe(456);
  });
});
