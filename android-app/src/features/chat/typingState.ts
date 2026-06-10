import type {Participant, TypingEvent} from '@north/shared';

import {tActive} from '../../i18n';

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
    return tActive('typing.one');
  }

  if (uniqueNames.length === 1) {
    return tActive('typing.named', {name: uniqueNames[0]});
  }

  if (uniqueNames.length === 2) {
    return tActive('typing.two', {name1: uniqueNames[0], name2: uniqueNames[1]});
  }

  return tActive('typing.more', {
    name: uniqueNames[0],
    count: uniqueNames.length - 1,
  });
}
