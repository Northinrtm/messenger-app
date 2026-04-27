import { ENCRYPTED_MESSAGE_UNAVAILABLE } from "./e2eeShared";
import type { ApiChatMessage, ChatMessage } from "./types";

type ReadableHydrationRecord = Pick<ChatMessage, "content" | "editedAt" | "attachments">;

type HydrationDiagnosticOutcome =
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

type HydrationDiagnosticRecord = {
  message: ApiChatMessage;
  currentUserId: string;
  phase: "snapshot" | "hydrate";
  outcome: HydrationDiagnosticOutcome;
  mirrorHit: boolean;
  archiveHit: boolean;
  remoteArchiveRefreshAttempted?: boolean;
  remoteArchiveRefreshHit?: boolean;
};

type HydratedMessageBuilder = (
  message: ApiChatMessage,
  content: string,
  editedAt?: string | null,
  archivedAttachments?: ChatMessage["attachments"]
) => ChatMessage;

export async function hydrateChatMessageSnapshot(options: {
  message: ApiChatMessage;
  userId: string;
  ensureE2eeTransportStorageSchema: () => void;
  readArchivedDecryptedMessageRecord: (
    userId: string,
    messageId: string
  ) => Promise<ReadableHydrationRecord | null>;
  readOutgoingMessageMirror: (
    userId: string,
    message: Pick<ApiChatMessage, "id" | "chatId" | "clientMessageId" | "sender">,
    currentUserId: string
  ) => ReadableHydrationRecord | null;
  buildHydratedChatMessage: HydratedMessageBuilder;
  recordMessageHydrationDiagnostic: (diagnostic: HydrationDiagnosticRecord) => void;
}) {
  options.ensureE2eeTransportStorageSchema();

  const archivedMessage = await options.readArchivedDecryptedMessageRecord(
    options.userId,
    options.message.id
  );
  const readableMessage =
    archivedMessage ?? options.readOutgoingMessageMirror(options.userId, options.message, options.userId);
  options.recordMessageHydrationDiagnostic({
    message: options.message,
    currentUserId: options.userId,
    phase: "snapshot",
    outcome: archivedMessage
      ? "snapshot-archive-hit"
      : readableMessage
        ? "snapshot-mirror-hit"
        : "snapshot-unavailable",
    mirrorHit: Boolean(!archivedMessage && readableMessage),
    archiveHit: Boolean(archivedMessage),
  });
  return options.buildHydratedChatMessage(
    options.message,
    readableMessage?.content ?? ENCRYPTED_MESSAGE_UNAVAILABLE,
    readableMessage?.editedAt ?? options.message.editedAt,
    readableMessage?.attachments
  );
}

export async function hydrateChatMessage(options: {
  message: ApiChatMessage;
  userId: string;
  serializeMessageHydration: <T>(userId: string, action: () => Promise<T>) => Promise<T>;
  ensureE2eeTransportStorageSchema: () => void;
  readArchivedDecryptedMessageRecord: (
    userId: string,
    messageId: string
  ) => Promise<ReadableHydrationRecord | null>;
  readOutgoingMessageMirror: (
    userId: string,
    message: Pick<ApiChatMessage, "id" | "chatId" | "clientMessageId" | "sender">,
    currentUserId: string
  ) => ReadableHydrationRecord | null;
  buildHydratedChatMessage: HydratedMessageBuilder;
  recordMessageHydrationDiagnostic: (diagnostic: HydrationDiagnosticRecord) => void;
  decryptMessage: (message: ApiChatMessage, userId: string) => Promise<string>;
  rememberOutgoingMessageMirror: (
    userId: string,
    message: Pick<
      ChatMessage,
      "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments" | "clientMessageId"
    >
  ) => void;
  rememberArchivedDecryptedMessage: (
    userId: string,
    message: Pick<ChatMessage, "id" | "chatId" | "content" | "createdAt" | "editedAt" | "attachments">
  ) => Promise<void>;
  refreshArchivedMessagesFromRemoteRecoverySnapshot: (userId: string) => Promise<boolean>;
}) {
  return options.serializeMessageHydration(options.userId, async () => {
    options.ensureE2eeTransportStorageSchema();

    if (!options.message.encryptedPayload) {
      const archivedMessage = await options.readArchivedDecryptedMessageRecord(
        options.userId,
        options.message.id
      );
      const readableMessage =
        archivedMessage ??
        options.readOutgoingMessageMirror(options.userId, options.message, options.userId);
      options.recordMessageHydrationDiagnostic({
        message: options.message,
        currentUserId: options.userId,
        phase: "hydrate",
        outcome: archivedMessage
          ? "plain-archive-hit"
          : readableMessage
            ? "plain-mirror-hit"
            : "plain-unavailable",
        mirrorHit: Boolean(!archivedMessage && readableMessage),
        archiveHit: Boolean(archivedMessage),
      });
      return archivedMessage
        ? options.buildHydratedChatMessage(
            options.message,
            archivedMessage.content,
            archivedMessage.editedAt,
            archivedMessage.attachments
          )
        : readableMessage
          ? options.buildHydratedChatMessage(
              options.message,
              readableMessage.content,
              readableMessage.editedAt,
              readableMessage.attachments
            )
          : options.buildHydratedChatMessage(options.message, ENCRYPTED_MESSAGE_UNAVAILABLE);
    }

    try {
      const content = await options.decryptMessage(options.message, options.userId);
      const hydratedMessage = options.buildHydratedChatMessage(options.message, content);
      options.recordMessageHydrationDiagnostic({
        message: options.message,
        currentUserId: options.userId,
        phase: "hydrate",
        outcome: "decrypt-success",
        mirrorHit: false,
        archiveHit: false,
      });
      if (options.message.sender.id === options.userId) {
        options.rememberOutgoingMessageMirror(options.userId, hydratedMessage);
      }
      void options.rememberArchivedDecryptedMessage(options.userId, hydratedMessage);
      return hydratedMessage;
    } catch {
      const mirroredOwnMessage = options.readOutgoingMessageMirror(
        options.userId,
        options.message,
        options.userId
      );
      if (mirroredOwnMessage) {
        options.recordMessageHydrationDiagnostic({
          message: options.message,
          currentUserId: options.userId,
          phase: "hydrate",
          outcome: "decrypt-failed-mirror-hit",
          mirrorHit: true,
          archiveHit: false,
        });
        return options.buildHydratedChatMessage(
          options.message,
          mirroredOwnMessage.content,
          mirroredOwnMessage.editedAt,
          mirroredOwnMessage.attachments
        );
      }
      let archivedMessage = await options.readArchivedDecryptedMessageRecord(
        options.userId,
        options.message.id
      );
      const remoteArchiveRefreshAttempted = !archivedMessage;
      let remoteArchiveRefreshHit = false;
      if (
        !archivedMessage &&
        (await options.refreshArchivedMessagesFromRemoteRecoverySnapshot(options.userId))
      ) {
        archivedMessage = await options.readArchivedDecryptedMessageRecord(
          options.userId,
          options.message.id
        );
        remoteArchiveRefreshHit = Boolean(archivedMessage);
      }
      options.recordMessageHydrationDiagnostic({
        message: options.message,
        currentUserId: options.userId,
        phase: "hydrate",
        outcome: archivedMessage
          ? remoteArchiveRefreshHit
            ? "decrypt-failed-archive-refresh-hit"
            : "decrypt-failed-archive-hit"
          : "decrypt-failed-unavailable",
        mirrorHit: false,
        archiveHit: Boolean(archivedMessage),
        remoteArchiveRefreshAttempted,
        remoteArchiveRefreshHit,
      });
      return archivedMessage
        ? options.buildHydratedChatMessage(
            options.message,
            archivedMessage.content,
            archivedMessage.editedAt,
            archivedMessage.attachments
          )
        : options.buildHydratedChatMessage(options.message, ENCRYPTED_MESSAGE_UNAVAILABLE);
    }
  });
}

export async function hydrateLatestUnavailableMessageSnapshots(options: {
  rawMessages: ApiChatMessage[];
  hydratedMessages: ChatMessage[];
  userId: string;
  beforeServerOrder?: number | null;
  suffixSize: number;
  isUnavailableEncryptedMessage: (value: string) => boolean;
  withSerializedMessageHydrationBatch: <T>(userId: string, action: () => Promise<T>) => Promise<T>;
  hydrateChatMessage: (message: ApiChatMessage, userId: string) => Promise<ChatMessage>;
}) {
  if ((options.beforeServerOrder ?? null) !== null || options.rawMessages.length === 0) {
    return options.hydratedMessages;
  }

  const inlineHydrationStartIndex = Math.max(0, options.rawMessages.length - options.suffixSize);
  const inlineHydrationIndexes: number[] = [];
  for (let index = options.rawMessages.length - 1; index >= inlineHydrationStartIndex; index -= 1) {
    if (
      options.rawMessages[index]?.encryptedPayload &&
      options.isUnavailableEncryptedMessage(options.hydratedMessages[index]?.content ?? "")
    ) {
      inlineHydrationIndexes.push(index);
    }
  }

  if (inlineHydrationIndexes.length === 0) {
    return options.hydratedMessages;
  }

  const nextHydratedMessages = [...options.hydratedMessages];
  await options.withSerializedMessageHydrationBatch(options.userId, async () => {
    for (const index of inlineHydrationIndexes) {
      nextHydratedMessages[index] = await options.hydrateChatMessage(
        options.rawMessages[index],
        options.userId
      );
    }
  });
  return nextHydratedMessages;
}
