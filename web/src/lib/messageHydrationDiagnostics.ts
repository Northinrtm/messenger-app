import type { ApiChatMessage } from "./types";

export type MessageHydrationDiagnosticPhase = "snapshot" | "hydrate";

export type MessageHydrationDiagnosticOutcome =
  | "snapshot-archive-hit"
  | "snapshot-mirror-hit"
  | "snapshot-unavailable"
  | "plain-archive-hit"
  | "plain-mirror-hit"
  | "plain-unavailable"
  | "decrypt-success"
  | "decrypt-failed-mirror-hit"
  | "decrypt-failed-archive-hit"
  | "decrypt-failed-archive-refresh-hit"
  | "decrypt-failed-unavailable";

export type MessageHydrationDiagnosticRecord = {
  messageId: string;
  chatId: string;
  senderUserId: string;
  ownMessage: boolean;
  createdAt: string;
  phase: MessageHydrationDiagnosticPhase;
  outcome: MessageHydrationDiagnosticOutcome;
  encrypted: boolean;
  scheme: string | null;
  hasSharedEnvelope: boolean;
  mirrorHit: boolean;
  archiveHit: boolean;
  remoteArchiveRefreshAttempted: boolean;
  remoteArchiveRefreshHit: boolean;
  buildRevision: string | null;
  at: string;
};

const MESSAGE_HYDRATION_DIAGNOSTICS_STORAGE_KEY =
  "north-messenger:message-hydration-diagnostics";
const CURRENT_BUILD_REVISION_STORAGE_KEY = "north-messenger:current-build-revision";
const MAX_MESSAGE_HYDRATION_DIAGNOSTICS = 100;

export function rememberCurrentBuildRevision(revision: string) {
  if (typeof window === "undefined" || !revision.trim()) {
    return;
  }

  try {
    window.sessionStorage.setItem(CURRENT_BUILD_REVISION_STORAGE_KEY, revision);
  } catch {
    return;
  }
}

export function recordMessageHydrationDiagnostic(input: {
  message: Pick<ApiChatMessage, "id" | "chatId" | "createdAt" | "sender" | "encryptedPayload">;
  currentUserId: string;
  phase: MessageHydrationDiagnosticPhase;
  outcome: MessageHydrationDiagnosticOutcome;
  mirrorHit: boolean;
  archiveHit: boolean;
  remoteArchiveRefreshAttempted?: boolean;
  remoteArchiveRefreshHit?: boolean;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const nextRecord: MessageHydrationDiagnosticRecord = {
    messageId: input.message.id,
    chatId: input.message.chatId,
    senderUserId: input.message.sender.id,
    ownMessage: input.message.sender.id === input.currentUserId,
    createdAt: input.message.createdAt,
    phase: input.phase,
    outcome: input.outcome,
    encrypted: Boolean(input.message.encryptedPayload),
    scheme: input.message.encryptedPayload?.scheme ?? null,
    hasSharedEnvelope: Boolean(input.message.encryptedPayload?.sharedEnvelope),
    mirrorHit: input.mirrorHit,
    archiveHit: input.archiveHit,
    remoteArchiveRefreshAttempted: input.remoteArchiveRefreshAttempted ?? false,
    remoteArchiveRefreshHit: input.remoteArchiveRefreshHit ?? false,
    buildRevision: readCurrentBuildRevision(),
    at: new Date().toISOString(),
  };

  try {
    const current = readMessageHydrationDiagnostics();
    const withoutSameMessageOutcome = current.filter(
      (record) =>
        !(
          record.messageId === nextRecord.messageId &&
          record.phase === nextRecord.phase &&
          record.outcome === nextRecord.outcome
        )
    );
    window.sessionStorage.setItem(
      MESSAGE_HYDRATION_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([nextRecord, ...withoutSameMessageOutcome].slice(0, MAX_MESSAGE_HYDRATION_DIAGNOSTICS))
    );
  } catch {
    return;
  }
}

export function readMessageHydrationDiagnostics() {
  if (typeof window === "undefined") {
    return [] as MessageHydrationDiagnosticRecord[];
  }

  try {
    const rawValue = window.sessionStorage.getItem(MESSAGE_HYDRATION_DIAGNOSTICS_STORAGE_KEY);
    if (!rawValue) {
      return [] as MessageHydrationDiagnosticRecord[];
    }

    const parsed = JSON.parse(rawValue) as MessageHydrationDiagnosticRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as MessageHydrationDiagnosticRecord[];
  }
}

function readCurrentBuildRevision() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(CURRENT_BUILD_REVISION_STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}
