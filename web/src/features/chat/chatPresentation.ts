import type { ChatSummary, Participant, UserProfile, VideoConference } from "../../lib/types";

const CONFERENCE_ACTIVATION_LEAD_MS = 5 * 60 * 1000;

export function getDirectParticipant(chat: ChatSummary, currentUser: UserProfile) {
  if (!chat.direct) {
    return null;
  }

  return (
    chat.members.find((member) => !isCurrentUserParticipant(member, currentUser)) ?? null
  );
}

export function describeChat(chat: ChatSummary, currentUser: UserProfile) {
  if (chat.direct) {
    const otherParticipant = chat.members.find(
      (member) => !isCurrentUserParticipant(member, currentUser),
    );
    return otherParticipant ? `@${otherParticipant.username}` : "Р›РёС‡РЅС‹Р№ С‡Р°С‚";
  }

  return "Р“СЂСѓРїРїР°";
}

export function formatMemberCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} СѓС‡Р°СЃС‚РЅРёРє`;
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} СѓС‡Р°СЃС‚РЅРёРєР°`;
  }

  return `${count} СѓС‡Р°СЃС‚РЅРёРєРѕРІ`;
}

export function formatChatTimestamp(value: string) {
  const target = new Date(value);
  const now = new Date();
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  if (sameDay) {
    return formatClock(value);
  }

  const withinWeek = now.getTime() - target.getTime() < 6 * 24 * 60 * 60 * 1000;
  if (withinWeek) {
    return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(target);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(target);
}

export function formatClock(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatProfileDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTimelineDay(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return "РЎРµРіРѕРґРЅСЏ";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Р’С‡РµСЂР°";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

export function trimPreview(content: string, maxLength: number) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength - 3)}...`;
}

export function formatToastPreview(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }

  return `${trimmed.slice(0, 117)}...`;
}

export function mergeConferenceCandidates(
  contacts: Array<Participant | UserProfile>,
  groupMembers: Participant[],
  currentUsername: string,
) {
  const candidates = new Map<string, Participant | UserProfile>();

  contacts.forEach((contact) => {
    if (contact.username !== currentUsername) {
      candidates.set(contact.username, contact);
    }
  });

  groupMembers.forEach((member) => {
    if (member.username === currentUsername || candidates.has(member.username)) {
      return;
    }

    candidates.set(member.username, member);
  });

  return [...candidates.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "ru-RU"),
  );
}

export function upsertVideoConferences(
  current: VideoConference[] | undefined,
  conference: VideoConference,
) {
  const withoutCurrent = (current ?? []).filter((item) => item.id !== conference.id);
  return [...withoutCurrent, conference].sort((left, right) =>
    left.scheduledAt.localeCompare(right.scheduledAt),
  );
}

export function mergeVideoConferenceCollections(
  current: VideoConference[] | undefined,
  incoming: VideoConference[] | undefined,
) {
  return (incoming ?? []).reduce(
    (next, conference) => upsertVideoConferences(next, conference),
    current ?? [],
  );
}

export function removeVideoConference(
  current: VideoConference[] | undefined,
  conferenceId: string,
) {
  return (current ?? []).filter((item) => item.id !== conferenceId);
}

export function formatConferenceStatusLabel(conference: VideoConference) {
  if (conference.endedAt) {
    return `Р—Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° РёРґРµС‚";
  }

  if (conference.roomName || conference.activatedAt) {
    return "РљРѕРјРЅР°С‚Р° РѕС‚РєСЂС‹С‚Р° РґР»СЏ РїСЂРёРіР»Р°С€РµРЅРЅС‹С…";
  }

  return `РћС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString(),
  )}`;
}

export function formatConferenceListPreview(
  conference: VideoConference,
  currentUsername: string,
) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return "Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР°.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `РљРѕРјРЅР°С‚Р° РѕС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString(),
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "РљРѕРјРЅР°С‚Р° СѓР¶Рµ РѕС‚РєСЂС‹С‚Р° РґР»СЏ РїСЂРёРіР»Р°С€РµРЅРЅС‹С…. "
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ РёРґРµС‚.";
}

export function formatConferenceStageHint(
  conference: VideoConference,
  isOrganizer: boolean,
) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ Р·Р°РїСѓС‰РµРЅР°.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "РљРѕРјРЅР°С‚Р° СѓР¶Рµ РѕС‚РєСЂС‹С‚Р°. Р’РѕР№С‚Рё РјРѕРіСѓС‚ С‚РѕР»СЊРєРѕ РїСЂРёРіР»Р°С€С‘РЅРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё.";
    }

    return isOrganizer
      ? `РљРѕРјРЅР°С‚Р° РїРѕРґРіРѕС‚РѕРІР»РµРЅР°. Р’С…РѕРґ РґР»СЏ РїСЂРёРіР»Р°С€С‘РЅРЅС‹С… РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString(),
  );
  return `РљРѕРјРЅР°С‚Р° СЃС‚Р°РЅРµС‚ РґРѕСЃС‚СѓРїРЅР° Р·Р° 5 РјРёРЅСѓС‚ РґРѕ СЃС‚Р°СЂС‚Р°: ${activationAt}.`;
}

export function formatConferenceSchedule(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatConferenceTileTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return formatClock(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function createInitialConferenceDateTime() {
  return formatDateTimeInputValue(new Date(Date.now() + 30 * 60 * 1000));
}

export function createMinimumConferenceDateTime() {
  return formatDateTimeInputValue(new Date());
}

export function formatDateTimeInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function formatConferenceOrganizerLabel(
  organizer: Participant,
  currentUser: UserProfile,
) {
  return organizer.id === currentUser.id
    ? `${organizer.displayName} (РІС‹)`
    : organizer.displayName;
}

export function describeConferenceRole(isOrganizer: boolean) {
  return isOrganizer ? "РћСЂРіР°РЅРёР·Р°С‚РѕСЂ" : "РЈС‡Р°СЃС‚РЅРёРє";
}

function getConferenceActivationTime(value: string) {
  return new Date(new Date(value).getTime() - CONFERENCE_ACTIVATION_LEAD_MS);
}

function isCurrentUserParticipant(participant: Participant, currentUser: UserProfile) {
  return participant.id === currentUser.id;
}
