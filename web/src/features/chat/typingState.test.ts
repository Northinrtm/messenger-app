import { describe, expect, it } from "vitest";
import type { Participant, TypingEvent } from "../../lib/types";
import { applyTypingEvent, formatTypingParticipants, removeTypingParticipant } from "./typingState";

function participant(id: string, displayName: string): Participant {
  return {
    id,
    username: displayName.toLowerCase(),
    displayName,
    profession: null,
    avatarUrl: null,
    online: true,
  };
}

function typingEvent(overrides: Partial<TypingEvent> = {}): TypingEvent {
  return {
    chatId: "chat-1",
    participant: participant("user-2", "Alice"),
    typing: true,
    createdAt: "2026-03-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("typingState", () => {
  it("adds typing participant for the chat", () => {
    const next = applyTypingEvent({}, typingEvent(), "user-1");

    expect(next["chat-1"]?.map((item) => item.id)).toEqual(["user-2"]);
  });

  it("ignores typing events from the current user", () => {
    const next = applyTypingEvent({}, typingEvent({ participant: participant("user-1", "North") }), "user-1");

    expect(next).toEqual({});
  });

  it("removes participant when typing stops", () => {
    const current = {
      "chat-1": [participant("user-2", "Alice"), participant("user-3", "Bob")],
    };

    const next = removeTypingParticipant(current, "chat-1", "user-2");

    expect(next["chat-1"]?.map((item) => item.id)).toEqual(["user-3"]);
  });

  it("formats a readable group typing label", () => {
    expect(
      formatTypingParticipants([
        participant("user-2", "Alice"),
        participant("user-3", "Bob"),
        participant("user-4", "Charlie"),
      ])
    ).toBe("Alice и еще 2 печатают...");
  });
});
