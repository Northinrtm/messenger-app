import type { ChatMessage, Participant, UserProfile } from "../../lib/types";
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
        key: `day-${message.id}`,
        label,
      });
      previousLabel = label;
    }

    items.push({
      type: "message",
      key: message.id,
      message,
    });
  });

  return items;
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
