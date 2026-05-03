import type { ChatPrejoinHistoryPolicy } from "./types";

export type GroupHistoryKeyGrantPayload = {
  aadVersion: number;
  context: string;
  chatId: string;
  historyKeyId: string;
  historyKey: string;
  membershipVersion: number;
  historyPolicy: ChatPrejoinHistoryPolicy | "DIRECT";
  createdAt: string;
};

export type GroupHistoryKeyRecord = {
  historyKeyId: string;
  chatId: string;
  keyMaterial: string;
  membershipVersion?: number;
  historyPolicy?: ChatPrejoinHistoryPolicy | "DIRECT";
  createdAt: string;
  updatedAt: string;
};

export type GroupHistoryKeyState = {
  currentKeyIdsByChatId: Record<string, string>;
  syncCursorByChatId: Record<string, string>;
  fullySyncedChatIds: string[];
  keysById: Record<string, GroupHistoryKeyRecord>;
};

export function parseGroupHistoryKeyGrantPayload(
  value: string,
  expectedAadVersion: number
): GroupHistoryKeyGrantPayload {
  const parsed = JSON.parse(value) as Partial<GroupHistoryKeyGrantPayload>;
  if (
    parsed.aadVersion !== expectedAadVersion ||
    typeof parsed.context !== "string" ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.historyKey !== "string" ||
    typeof parsed.membershipVersion !== "number" ||
    !Number.isFinite(parsed.membershipVersion) ||
    parsed.membershipVersion < 0 ||
    (parsed.historyPolicy !== "DIRECT" &&
      parsed.historyPolicy !== "JOIN_ONLY" &&
      parsed.historyPolicy !== "FULL_HISTORY") ||
    typeof parsed.createdAt !== "string"
  ) {
    throw new Error("Malformed group history key grant");
  }

  return parsed as GroupHistoryKeyGrantPayload;
}
