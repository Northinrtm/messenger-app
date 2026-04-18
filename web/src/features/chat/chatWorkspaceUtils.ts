import type { ChatMessage, ChatSummary, Participant, UserProfile, VideoConference } from "../../lib/types";
import { getMessageIdentityKey } from "./chatState";
import { formatTimelineDay } from "./chatPresentation";

export type TimelineItem =
  | {
      type: "day";
      key: string;
      label: string;
    }
  | {
      type: "message";
      key: string;
      message: ChatMessage;
    };

export function buildTimeline(messages: ChatMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let previousLabel = "";
  messages.forEach((message) => {
    const label = formatTimelineDay(message.createdAt);
    if (label !== previousLabel) {
      items.push({
        type: "day",
        key: `day-${getMessageIdentityKey(message)}`,
        label,
      });
      previousLabel = label;
    }

    items.push({
      type: "message",
      key: getMessageIdentityKey(message),
      message,
    });
  });

  return items;
}

export function shouldPrimeEncryptionRecipientsOnChatOpen(messagesLoading: boolean) {
  return !messagesLoading;
}

export function getLatestUnreadChatActivityAt(chats: ChatSummary[]) {
  return chats.reduce<string | null>((latest, chat) => {
    if (chat.unreadCount <= 0) {
      return latest;
    }

    const candidate = chat.lastMessageAt ?? chat.updatedAt;
    if (!candidate) {
      return latest;
    }

    if (!latest || candidate.localeCompare(latest) > 0) {
      return candidate;
    }

    return latest;
  }, null);
}

export function hasUnreadChatActivitySince(
  chats: ChatSummary[],
  lastSeenActivityAt: string | null
) {
  const latestUnreadActivityAt = getLatestUnreadChatActivityAt(chats);
  if (!latestUnreadActivityAt) {
    return false;
  }

  if (!lastSeenActivityAt) {
    return true;
  }

  return latestUnreadActivityAt.localeCompare(lastSeenActivityAt) > 0;
}

export type ConferenceActivitySnapshot = Record<string, string>;

export function buildConferenceActivitySnapshot(conferences: VideoConference[]) {
  return Object.fromEntries(
    conferences.map((conference) => [
      conference.id,
      [
        conference.title,
        conference.scheduledAt,
        conference.createdAt,
        conference.activatedAt ?? "",
        conference.startedAt ?? "",
        conference.endedAt ?? "",
        conference.recordingCreatedAt ?? "",
        conference.createdBy.id,
        conference.participants
          .map((participant) => participant.id)
          .sort()
          .join(","),
      ].join("|"),
    ])
  );
}

export function isConferenceActivitySnapshotEqual(
  left: ConferenceActivitySnapshot | null,
  right: ConferenceActivitySnapshot | null
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

export function hasConferenceActivitySinceSeen(
  current: ConferenceActivitySnapshot,
  seen: ConferenceActivitySnapshot | null
) {
  if (!seen) {
    return false;
  }

  return !isConferenceActivitySnapshotEqual(current, seen);
}

export function mergeTypingParticipants(primary: Participant[], fallback: Participant[]) {
  const merged = new Map<string, Participant>();
  primary.forEach((participant) => merged.set(participant.id, participant));
  fallback.forEach((participant) => {
    if (!merged.has(participant.id)) {
      merged.set(participant.id, participant);
    }
  });
  return [...merged.values()];
}

export function syncChatTypingParticipants(
  current: Record<string, Participant[]>,
  chatId: string,
  participants: Participant[]
) {
  const nextParticipants = participants.filter(
    (participant, index, list) => list.findIndex((item) => item.id === participant.id) === index
  );
  const existingParticipants = current[chatId] ?? [];
  const isSame =
    existingParticipants.length === nextParticipants.length &&
    existingParticipants.every((participant, index) => participant.id === nextParticipants[index]?.id);

  if (isSame) {
    return current;
  }

  if (!nextParticipants.length) {
    if (!existingParticipants.length) {
      return current;
    }

    const { [chatId]: _removed, ...rest } = current;
    return rest;
  }

  return {
    ...current,
    [chatId]: nextParticipants,
  };
}

export function isCurrentUserParticipant(participant: Participant, currentUser: UserProfile) {
  return participant.username === currentUser.username;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read avatar"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read avatar"));
    reader.readAsDataURL(file);
  });
}

export function extractImageFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return null;
  }

  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }

  return null;
}

export function normalizeAccountDeletionConfirmation(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return normalized.trim().toLowerCase();
}
