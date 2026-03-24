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
    return "Печатает...";
  }

  if (uniqueNames.length === 1) {
    return `${uniqueNames[0]} печатает...`;
  }

  if (uniqueNames.length === 2) {
    return `${uniqueNames[0]} и ${uniqueNames[1]} печатают...`;
  }

  return `${uniqueNames[0]} и еще ${uniqueNames.length - 1} печатают...`;
}
