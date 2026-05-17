import type {Participant, TypingEvent} from '@north/shared';

export function applyTypingEvent(
  currentParticipants: Participant[],
  event: TypingEvent,
  currentUserId: string,
) {
  if (event.participant.id === currentUserId) {
    return currentParticipants;
  }

  if (!event.typing) {
    return removeTypingParticipant(currentParticipants, event.participant.id);
  }

  return [
    ...currentParticipants.filter(
      participant => participant.id !== event.participant.id,
    ),
    event.participant,
  ];
}

export function removeTypingParticipant(
  currentParticipants: Participant[],
  participantId: string,
) {
  return currentParticipants.filter(
    participant => participant.id !== participantId,
  );
}

export function formatTypingParticipants(participants: Participant[]) {
  const uniqueNames = [
    ...new Set(participants.map(participant => participant.displayName.trim())),
  ].filter(Boolean);

  if (uniqueNames.length === 0) {
    return 'Typing...';
  }

  if (uniqueNames.length === 1) {
    return `${uniqueNames[0]} is typing...`;
  }

  if (uniqueNames.length === 2) {
    return `${uniqueNames[0]} and ${uniqueNames[1]} are typing...`;
  }

  return `${uniqueNames[0]} and ${uniqueNames.length - 1} others are typing...`;
}
