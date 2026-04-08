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
    return otherParticipant ? otherParticipant.username : "\u041B\u0438\u0447\u043D\u044B\u0439 \u0447\u0430\u0442";
  }

  return "\u0413\u0440\u0443\u043F\u043F\u0430";
}

export function formatMemberCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A`;
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430`;
  }

  return `${count} \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432`;
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
    return "\u0421\u0435\u0433\u043E\u0434\u043D\u044F";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "\u0412\u0447\u0435\u0440\u0430";
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
    return `\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430 ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0438\u0434\u0435\u0442";
  }

  if (conference.roomName || conference.activatedAt) {
    return "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0434\u043B\u044F \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u043D\u044B\u0445";
  }

  return `\u041E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F ${formatConferenceSchedule(
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
    return "\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString(),
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0443\u0436\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0434\u043B\u044F \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u043D\u044B\u0445."
      : `\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0443\u0436\u0435 \u0438\u0434\u0435\u0442.";
}

export function formatConferenceStageHint(
  conference: VideoConference,
  isOrganizer: boolean,
) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430 ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "\u0412\u0441\u0442\u0440\u0435\u0447\u0430 \u0443\u0436\u0435 \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u0430.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0443\u0436\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u0430. \u0412\u043E\u0439\u0442\u0438 \u043C\u043E\u0433\u0443\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0451\u043D\u043D\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438.";
    }

    return isOrganizer
      ? `\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u0430. \u0412\u0445\u043E\u0434 \u0434\u043B\u044F \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0451\u043D\u043D\u044B\u0445 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`
      : `\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 ${formatConferenceSchedule(
          conference.scheduledAt,
        )}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString(),
  );
  return `\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0441\u0442\u0430\u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0437\u0430 5 \u043C\u0438\u043D\u0443\u0442 \u0434\u043E \u0441\u0442\u0430\u0440\u0442\u0430: ${activationAt}.`;
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
    ? `${organizer.displayName} (\u0432\u044B)`
    : organizer.displayName;
}

export function describeConferenceRole(isOrganizer: boolean) {
  return isOrganizer ? "\u041E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0442\u043E\u0440" : "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A";
}

function getConferenceActivationTime(value: string) {
  return new Date(new Date(value).getTime() - CONFERENCE_ACTIVATION_LEAD_MS);
}

function isCurrentUserParticipant(participant: Participant, currentUser: UserProfile) {
  return participant.id === currentUser.id;
}
