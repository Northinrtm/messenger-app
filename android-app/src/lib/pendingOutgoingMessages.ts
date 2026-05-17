import type {
  ChatMessage,
  PendingOutgoingMessage,
  UserProfile,
  WorkspaceBootstrap,
} from '@north/shared';

export function toRecoveredPendingChatMessage(
  currentUser: UserProfile,
  message: PendingOutgoingMessage,
): ChatMessage {
  return {
    id: message.clientMessageId,
    chatId: message.chatId,
    serverOrder: null,
    sender: currentUser,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: null,
    status: {
      state: message.status,
      recipientCount: message.recipientCount,
      deliveredCount: 0,
      readCount: 0,
    },
    clientMessageId: message.clientMessageId,
    localOrder: message.localOrder,
    replyTo: message.replyTo ?? null,
    forwarded: Boolean(message.forwardedFromMessageId),
    forwardedFrom: null,
    forwardedFromMessageId: message.forwardedFromMessageId ?? null,
    reactions: [],
    attachments: message.attachments ?? [],
  };
}

export function upsertWorkspacePendingOutgoingMessage(
  workspace: WorkspaceBootstrap,
  message: PendingOutgoingMessage,
): WorkspaceBootstrap {
  const existingIndex = workspace.pendingOutgoingMessages.findIndex(
    currentMessage => currentMessage.clientMessageId === message.clientMessageId,
  );

  if (existingIndex === -1) {
    return {
      ...workspace,
      pendingOutgoingMessages: sortPendingOutgoingMessages([
        ...workspace.pendingOutgoingMessages,
        message,
      ]),
    };
  }

  const nextPendingOutgoingMessages = [...workspace.pendingOutgoingMessages];
  nextPendingOutgoingMessages[existingIndex] = message;
  return {
    ...workspace,
    pendingOutgoingMessages: sortPendingOutgoingMessages(nextPendingOutgoingMessages),
  };
}

export function removeWorkspacePendingOutgoingMessages(
  workspace: WorkspaceBootstrap,
  clientMessageIds: string[],
): WorkspaceBootstrap {
  const pendingOutgoingToRemove = new Set(
    clientMessageIds
      .map(clientMessageId => clientMessageId.trim())
      .filter(clientMessageId => clientMessageId.length > 0),
  );

  if (!pendingOutgoingToRemove.size) {
    return workspace;
  }

  return {
    ...workspace,
    pendingOutgoingMessages: workspace.pendingOutgoingMessages.filter(
      message => !pendingOutgoingToRemove.has(message.clientMessageId),
    ),
  };
}

export function normalizeBootstrappedPendingOutgoingMessages(
  workspace: WorkspaceBootstrap,
) {
  const recoveredFailedMessages = workspace.pendingOutgoingMessages
    .filter(message => message.status === 'SENDING')
    .map(message => ({
      ...message,
      status: 'FAILED' as const,
    }));

  if (recoveredFailedMessages.length === 0) {
    return {
      workspace,
      recoveredFailedMessages,
    };
  }

  const recoveredFailedMessagesById = new Map(
    recoveredFailedMessages.map(message => [message.clientMessageId, message] as const),
  );

  return {
    workspace: {
      ...workspace,
      pendingOutgoingMessages: workspace.pendingOutgoingMessages.map(message =>
        recoveredFailedMessagesById.get(message.clientMessageId) ?? message,
      ),
    },
    recoveredFailedMessages,
  };
}

function sortPendingOutgoingMessages(messages: PendingOutgoingMessage[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.clientMessageId.localeCompare(right.clientMessageId);
  });
}
