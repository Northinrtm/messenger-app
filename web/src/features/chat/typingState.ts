import { tActive } from "../../i18n";
import type { Participant, TypingEvent } from "../../lib/types";

export function applyTypingEvent(
  current: Record<string, Participant[]>,
  event: TypingEvent,
  currentUserId: string
) {
  if (event.participant.id === currentUserId) {
    return current;
  }

  if (!event.typing) {
    return removeTypingParticipant(current, event.chatId, event.participant.id);
  }

  const nextParticipants = [
    ...(current[event.chatId] ?? []).filter((participant) => participant.id !== event.participant.id),
    event.participant,
  ];

  return {
    ...current,
    [event.chatId]: nextParticipants,
  };
}

export function removeTypingParticipant(
  current: Record<string, Participant[]>,
  chatId: string,
  participantId: string
) {
  const chatParticipants = current[chatId];
  if (!chatParticipants) {
    return current;
  }

  const nextParticipants = chatParticipants.filter((participant) => participant.id !== participantId);
  if (nextParticipants.length === chatParticipants.length) {
    return current;
  }

  if (!nextParticipants.length) {
    const { [chatId]: _removed, ...rest } = current;
    return rest;
  }

  return {
    ...current,
    [chatId]: nextParticipants,
  };
}

export function formatTypingParticipants(participants: Participant[]) {
  const uniqueNames = [...new Set(participants.map((participant) => participant.displayName.trim()))].filter(
    Boolean
  );

  if (!uniqueNames.length) {
    return tActive("typing.one");
  }

  if (uniqueNames.length === 1) {
    return tActive("typing.named", { name: uniqueNames[0] });
  }

  if (uniqueNames.length === 2) {
    return tActive("typing.two", { name1: uniqueNames[0], name2: uniqueNames[1] });
  }

  return tActive("typing.more", { name: uniqueNames[0], count: uniqueNames.length - 1 });
}
