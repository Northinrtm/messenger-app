import type {
  ApiChatMessage,
  AuthResponse,
  ChatMessage,
  ChatSummary,
  PendingOutgoingMessage,
} from '@north/shared';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Linking, Share} from 'react-native';
import {ChatThreadScreen} from './ChatThreadScreen';

jest.mock('../../lib/api', () => ({
  acknowledgeRead: jest.fn(async () => undefined),
  describeError: (error: unknown) =>
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Unexpected error',
  getChatOpen: jest.fn(),
  getMessagesPage: jest.fn(),
  toggleMessageReaction: jest.fn(),
  downloadChatAttachment: jest.fn(),
  uploadChatAttachment: jest.fn(),
}));

jest.mock('../../lib/plainMessages', () => ({
  sendPlainMessage: jest.fn(),
  updatePlainMessage: jest.fn(),
}));

jest.mock('../../lib/realtime', () => ({
  publishTypingEvent: jest.fn(() => true),
}));

jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: {
    pick: jest.fn(),
    isCancel: jest.fn(() => false),
    types: {
      allFiles: '*/*',
    },
  },
}));

const apiModule = jest.requireMock('../../lib/api') as {
  getChatOpen: jest.Mock;
  toggleMessageReaction: jest.Mock;
  downloadChatAttachment: jest.Mock;
  uploadChatAttachment: jest.Mock;
};
const plainMessagesModule = jest.requireMock('../../lib/plainMessages') as {
  sendPlainMessage: jest.Mock;
  updatePlainMessage: jest.Mock;
};
const realtimeModule = jest.requireMock('../../lib/realtime') as {
  publishTypingEvent: jest.Mock;
};
const documentPickerModule = jest.requireMock(
  'react-native-document-picker',
) as {
  default: {
    pick: jest.Mock;
    isCancel: jest.Mock;
    types: {
      allFiles: string;
    };
  };
};
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];
const openUrlSpy = jest
  .spyOn(Linking, 'openURL')
  .mockImplementation(async () => 'opened');
const shareSpy = jest
  .spyOn(Share, 'share')
  .mockImplementation(async () => ({
    action: 'sharedAction',
    activityType: null,
  }));

const session: AuthResponse = {
  token: 'session-token',
  tokenExpiresAt: '2026-05-13T12:00:00.000Z',
  sessionId: 'session-1',
  user: {
    id: 'user-1',
    username: 'north',
    displayName: 'North',
    profession: 'Engineer',
    createdAt: '2026-05-01T10:00:00.000Z',
    avatarUrl: null,
    online: true,
  },
};

const initialChat: ChatSummary = {
  id: 'chat-1',
  direct: false,
  title: 'Core team',
  avatarUrl: null,
  chatVersion: 'chat-v1',
  capabilities: {
    canEditGroup: true,
    canDeleteGroup: true,
    canManageInviteLink: true,
    canAddMembers: true,
    canManageRoles: true,
    canModerateMembers: true,
    canTogglePrejoinHistory: true,
    canLeaveGroup: true,
  },
  ownerUserId: session.user.id,
  moderatorUserIds: [session.user.id],
  members: [
    {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      profession: session.user.profession,
      avatarUrl: session.user.avatarUrl,
      online: true,
    },
    {
      id: 'user-2',
      username: 'alex',
      displayName: 'Alex',
      profession: 'Operator',
      avatarUrl: null,
      online: false,
    },
  ],
  lastMessage: null,
  lastMessageAt: null,
  lastMessageHasReactions: false,
  lastMessageServerOrder: null,
  updatedAt: '2026-05-13T10:00:00.000Z',
  unreadCount: 0,
  membershipVersion: 1,
  pinnedMessage: null,
  pinnedMessages: [],
  prejoinHistoryPolicy: 'FULL_HISTORY',
};

const forwardingTargetChat: ChatSummary = {
  ...initialChat,
  id: 'chat-2',
  direct: true,
  title: 'Alex',
  members: [initialChat.members[0], initialChat.members[1]],
};

function createApiMessage(overrides: Partial<ApiChatMessage> = {}): ApiChatMessage {
  return {
    id: 'message-1',
    chatId: initialChat.id,
    serverOrder: 100,
    sender: initialChat.members[1],
    createdAt: '2026-05-13T10:05:00.000Z',
    editedAt: null,
    status: null,
    clientMessageId: null,
    replyTo: null,
    reactions: [],
    plainPayload: {
      content: 'Server message',
    },
    attachments: [],
    ...overrides,
  };
}

function createChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    chatId: initialChat.id,
    serverOrder: 100,
    sender: initialChat.members[1],
    content: 'Server message',
    createdAt: '2026-05-13T10:05:00.000Z',
    editedAt: null,
    status: null,
    clientMessageId: null,
    localOrder: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    ...overrides,
  };
}

function renderChatThread(
  pendingOutgoingMessages: PendingOutgoingMessage[] = [],
  options?: {
    availableChats?: ChatSummary[];
    onOpenChat?: (chatId: string) => void;
    onPersistPendingOutgoingMessage?: (
      message: PendingOutgoingMessage,
    ) => Promise<PendingOutgoingMessage>;
  },
) {
  const runAuthorized = async <T,>(operation: (token: string) => Promise<T>) =>
    operation('access-token');

  const renderer = ReactTestRenderer.create(
    <ChatThreadScreen
      session={session}
      chatId={initialChat.id}
      initialChat={initialChat}
      availableChats={options?.availableChats ?? [initialChat, forwardingTargetChat]}
      pendingOutgoingMessages={pendingOutgoingMessages}
      realtimeConnected={true}
      realtimeMessage={null}
      realtimeReaction={null}
      realtimeTyping={null}
      runAuthorized={runAuthorized}
      onBack={() => undefined}
      onOpenChat={options?.onOpenChat ?? (() => undefined)}
      onChatSummaryChange={() => undefined}
      onChatRead={() => undefined}
      onPersistPendingOutgoingMessage={
        options?.onPersistPendingOutgoingMessage ?? (async message => message)
      }
      onDeletePendingOutgoingMessages={async () => undefined}
    />,
  );

  mountedRenderers.push(renderer);
  return renderer;
}

describe('ChatThreadScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openUrlSpy.mockClear();
    shareSpy.mockClear();
  });

  afterEach(async () => {
    while (mountedRenderers.length > 0) {
      const renderer = mountedRenderers.pop();
      if (!renderer) {
        continue;
      }

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });

  it('sends replies with replyToMessageId from composer context', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    plainMessagesModule.sendPlainMessage.mockResolvedValue(
      createChatMessage({
        id: 'message-2',
        clientMessageId: 'android-ack-1',
        replyTo: {
          id: 'message-1',
          sender: initialChat.members[1],
          createdAt: '2026-05-13T10:05:00.000Z',
          preview: 'Server message',
          serverOrder: 100,
        },
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const replyButton = renderer!.root.findByProps({
      testID: 'reply-action-message-1',
    });
    await ReactTestRenderer.act(async () => {
      replyButton.props.onPress();
    });

    expect(
      renderer!.root.findByProps({testID: 'reply-context'}),
    ).toBeTruthy();

    const composerInput = renderer!.root.findByProps({testID: 'composer-input'});
    await ReactTestRenderer.act(async () => {
      composerInput.props.onChangeText('Reply body');
    });

    const sendButton = renderer!.root.findByProps({testID: 'send-button'});
    await ReactTestRenderer.act(async () => {
      await sendButton.props.onPress();
    });

    expect(plainMessagesModule.sendPlainMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: initialChat.id,
        content: 'Reply body',
        replyToMessageId: 'message-1',
      }),
    );
  });

  it('edits own confirmed messages through updatePlainMessage', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [
        createApiMessage({
          id: 'message-own-1',
          sender: initialChat.members[0],
          plainPayload: {
            content: 'Original own message',
          },
        }),
      ],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    plainMessagesModule.updatePlainMessage.mockResolvedValue(
      createChatMessage({
        id: 'message-own-1',
        sender: initialChat.members[0],
        content: 'Updated own message',
        editedAt: '2026-05-13T10:07:00.000Z',
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const editButton = renderer!.root.findByProps({
      testID: 'edit-action-message-own-1',
    });
    await ReactTestRenderer.act(async () => {
      editButton.props.onPress();
    });

    const composerInput = renderer!.root.findByProps({testID: 'composer-input'});
    expect(composerInput.props.value).toBe('Original own message');

    await ReactTestRenderer.act(async () => {
      composerInput.props.onChangeText('Updated own message');
    });

    const sendButton = renderer!.root.findByProps({testID: 'send-button'});
    await ReactTestRenderer.act(async () => {
      await sendButton.props.onPress();
    });

    expect(plainMessagesModule.updatePlainMessage).toHaveBeenCalledWith(
      'access-token',
      session.user.id,
      initialChat.id,
      'message-own-1',
      'Updated own message',
      {
        attachments: [],
      },
    );
    expect(plainMessagesModule.sendPlainMessage).not.toHaveBeenCalled();
  });

  it('uploads picked attachments and sends an attachment-only message', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    documentPickerModule.default.pick.mockResolvedValue([
      {
        uri: 'file:///report.pdf',
        fileCopyUri: 'file:///report.pdf',
        name: 'report.pdf',
        size: 2048,
        type: 'application/pdf',
      },
    ]);
    apiModule.uploadChatAttachment.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });
    plainMessagesModule.sendPlainMessage.mockResolvedValue(
      createChatMessage({
        id: 'message-attachment-1',
        clientMessageId: 'android-attachment-1',
        attachments: [
          {
            id: 'attachment-1',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          },
        ],
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const attachButton = renderer!.root.findByProps({testID: 'attach-button'});
    await ReactTestRenderer.act(async () => {
      attachButton.props.onPress();
      await Promise.resolve();
    });

    expect(renderer!.root.findByProps({children: 'report.pdf'})).toBeTruthy();

    const sendButton = renderer!.root.findByProps({testID: 'send-button'});
    await ReactTestRenderer.act(async () => {
      await sendButton.props.onPress();
    });

    expect(apiModule.uploadChatAttachment).toHaveBeenCalledWith(
      'access-token',
      initialChat.id,
      expect.objectContaining({
        uri: 'file:///report.pdf',
        fileName: 'report.pdf',
      }),
    );
    expect(plainMessagesModule.sendPlainMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: initialChat.id,
        content: '',
        attachments: [
          {
            id: 'attachment-1',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          },
        ],
      }),
    );
  });

  it('opens a message attachment through the backend download-url contract', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [
        createApiMessage({
          attachments: [
            {
              id: 'attachment-1',
              fileName: 'report.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
            },
          ],
        }),
      ],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    apiModule.downloadChatAttachment.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      url: 'https://cdn.example.test/report.pdf',
      expiresAt: '2026-05-17T12:00:00.000Z',
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const attachmentButton = renderer!.root.findByProps({
      testID: 'open-attachment-message-1-attachment-1',
    });
    await ReactTestRenderer.act(async () => {
      await attachmentButton.props.onPress();
    });

    expect(apiModule.downloadChatAttachment).toHaveBeenCalledWith(
      'access-token',
      initialChat.id,
      'attachment-1',
    );
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://cdn.example.test/report.pdf',
    );
  });

  it('previews image attachments inside the thread before opening externally', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [
        createApiMessage({
          attachments: [
            {
              id: 'attachment-image-1',
              fileName: 'photo.png',
              mimeType: 'image/png',
              sizeBytes: 4096,
            },
          ],
        }),
      ],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    apiModule.downloadChatAttachment.mockResolvedValue({
      id: 'attachment-image-1',
      fileName: 'photo.png',
      mimeType: 'image/png',
      url: 'https://cdn.example.test/photo.png',
      expiresAt: '2026-05-17T12:00:00.000Z',
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const previewButton = renderer!.root.findByProps({
      testID: 'open-attachment-message-1-attachment-image-1',
    });
    await ReactTestRenderer.act(async () => {
      await previewButton.props.onPress();
    });

    expect(apiModule.downloadChatAttachment).toHaveBeenCalledWith(
      'access-token',
      initialChat.id,
      'attachment-image-1',
    );
    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(
      renderer!.root.findByProps({testID: 'image-preview-overlay'}),
    ).toBeTruthy();
    expect(
      renderer!.root.findByProps({testID: 'image-preview-title'}).props.children,
    ).toBe('photo.png');

    const externalButton = renderer!.root.findByProps({
      testID: 'image-preview-open-external',
    });
    await ReactTestRenderer.act(async () => {
      await externalButton.props.onPress();
    });

    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://cdn.example.test/photo.png',
    );

    const closeButton = renderer!.root.findByProps({
      testID: 'image-preview-close',
    });
    await ReactTestRenderer.act(async () => {
      closeButton.props.onPress();
    });

    expect(
      renderer!.root.findAllByProps({testID: 'image-preview-overlay'}),
    ).toHaveLength(0);
  });

  it('shares a message attachment through the system share sheet', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [
        createApiMessage({
          attachments: [
            {
              id: 'attachment-1',
              fileName: 'report.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
            },
          ],
        }),
      ],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    apiModule.downloadChatAttachment.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      url: 'https://cdn.example.test/report.pdf',
      expiresAt: '2026-05-17T12:00:00.000Z',
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const shareButton = renderer!.root.findByProps({
      testID: 'share-attachment-message-1-attachment-1',
    });
    await ReactTestRenderer.act(async () => {
      await shareButton.props.onPress();
    });

    expect(apiModule.downloadChatAttachment).toHaveBeenCalledWith(
      'access-token',
      initialChat.id,
      'attachment-1',
    );
    expect(shareSpy).toHaveBeenCalledWith({
      title: 'report.pdf',
      message: 'https://cdn.example.test/report.pdf',
      url: 'https://cdn.example.test/report.pdf',
    });
  });

  it('forwards a confirmed message to another chat with forwarded metadata', async () => {
    const onOpenChat = jest.fn();
    const persistedMessages: PendingOutgoingMessage[] = [];
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    plainMessagesModule.sendPlainMessage.mockResolvedValue(
      createChatMessage({
        id: 'message-forwarded-1',
        chatId: forwardingTargetChat.id,
        clientMessageId: 'android-forward-1',
        forwarded: true,
        forwardedFrom: {
          sender: initialChat.members[1],
        },
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread([], {
        onOpenChat,
        onPersistPendingOutgoingMessage: async message => {
          persistedMessages.push(message);
          return message;
        },
      });
    });

    const forwardButton = renderer!.root.findByProps({
      testID: 'forward-action-message-1',
    });
    await ReactTestRenderer.act(async () => {
      forwardButton.props.onPress();
    });

    expect(
      renderer!.root.findByProps({testID: 'forward-context'}),
    ).toBeTruthy();

    const targetButton = renderer!.root.findByProps({
      testID: `forward-target-${forwardingTargetChat.id}`,
    });
    await ReactTestRenderer.act(async () => {
      await targetButton.props.onPress();
    });

    expect(plainMessagesModule.sendPlainMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: forwardingTargetChat.id,
        content: 'Server message',
        forwardedFromMessageId: 'message-1',
      }),
    );
    expect(persistedMessages).toHaveLength(1);
    expect(persistedMessages[0]?.forwardedFromMessageId).toBe('message-1');
    expect(onOpenChat).toHaveBeenCalledWith(forwardingTargetChat.id);
  });

  it('toggles reactions through the existing message reaction endpoint', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });
    apiModule.toggleMessageReaction.mockResolvedValue({
      chatId: initialChat.id,
      messageId: 'message-1',
      reactions: [
        {
          key: 'LIKE',
          count: 1,
          reactedByCurrentUser: true,
        },
      ],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const reactionButton = renderer!.root.findByProps({
      testID: 'reaction-toggle-message-1-LIKE',
    });
    await ReactTestRenderer.act(async () => {
      await reactionButton.props.onPress();
    });

    expect(apiModule.toggleMessageReaction).toHaveBeenCalledWith(
      'access-token',
      initialChat.id,
      'message-1',
      'LIKE',
    );

    const updatedReactionButton = renderer!.root.findByProps({
      testID: 'reaction-toggle-message-1-LIKE',
    });
    expect(
      updatedReactionButton.findByProps({children: '👍 1'}),
    ).toBeTruthy();
  });

  it('applies incoming realtime reaction events to the visible thread', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });

    const runAuthorized = async <T,>(operation: (token: string) => Promise<T>) =>
      operation('access-token');

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatThreadScreen
          session={session}
          chatId={initialChat.id}
          initialChat={initialChat}
          availableChats={[initialChat, forwardingTargetChat]}
          pendingOutgoingMessages={[]}
          realtimeConnected={true}
          realtimeMessage={null}
          realtimeReaction={null}
          realtimeTyping={null}
          runAuthorized={runAuthorized}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onChatSummaryChange={() => undefined}
          onChatRead={() => undefined}
          onPersistPendingOutgoingMessage={async message => message}
          onDeletePendingOutgoingMessages={async () => undefined}
        />,
      );
      mountedRenderers.push(renderer!);
    });

    await ReactTestRenderer.act(async () => {
      renderer!.update(
        <ChatThreadScreen
          session={session}
          chatId={initialChat.id}
          initialChat={initialChat}
          availableChats={[initialChat, forwardingTargetChat]}
          pendingOutgoingMessages={[]}
          realtimeConnected={true}
          realtimeMessage={null}
          realtimeReaction={{
            event: {
              chatId: initialChat.id,
              messageId: 'message-1',
              reactions: [
                {
                  key: 'EYES',
                  count: 2,
                  reactedByCurrentUser: false,
                },
              ],
            },
            receivedAt: Date.now(),
          }}
          realtimeTyping={null}
          runAuthorized={runAuthorized}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onChatSummaryChange={() => undefined}
          onChatRead={() => undefined}
          onPersistPendingOutgoingMessage={async message => message}
          onDeletePendingOutgoingMessages={async () => undefined}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const reactionButton = renderer!.root.findByProps({
      testID: 'reaction-toggle-message-1-EYES',
    });
    const textChildren = reactionButton
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children);
    expect(textChildren).toContain('👀 2');
  });

  it('publishes typing activity when the composer receives text', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = renderChatThread();
    });

    const composerInput = renderer!.root.findByProps({testID: 'composer-input'});
    await ReactTestRenderer.act(async () => {
      composerInput.props.onChangeText('typing now');
    });

    expect(realtimeModule.publishTypingEvent).toHaveBeenCalledWith(
      initialChat.id,
      true,
    );
  });

  it('shows a typing indicator for incoming realtime typing events', async () => {
    apiModule.getChatOpen.mockResolvedValue({
      chat: initialChat,
      initialMessages: [createApiMessage()],
      initialMessagesNextCursor: null,
      confirmedPendingOutgoingClientMessageIds: [],
    });

    const runAuthorized = async <T,>(operation: (token: string) => Promise<T>) =>
      operation('access-token');

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatThreadScreen
          session={session}
          chatId={initialChat.id}
          initialChat={initialChat}
          availableChats={[initialChat, forwardingTargetChat]}
          pendingOutgoingMessages={[]}
          realtimeConnected={true}
          realtimeMessage={null}
          realtimeReaction={null}
          realtimeTyping={null}
          runAuthorized={runAuthorized}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onChatSummaryChange={() => undefined}
          onChatRead={() => undefined}
          onPersistPendingOutgoingMessage={async message => message}
          onDeletePendingOutgoingMessages={async () => undefined}
        />,
      );
      mountedRenderers.push(renderer!);
    });

    await ReactTestRenderer.act(async () => {
      renderer!.update(
        <ChatThreadScreen
          session={session}
          chatId={initialChat.id}
          initialChat={initialChat}
          availableChats={[initialChat, forwardingTargetChat]}
          pendingOutgoingMessages={[]}
          realtimeConnected={true}
          realtimeMessage={null}
          realtimeReaction={null}
          realtimeTyping={{
            event: {
              chatId: initialChat.id,
              participant: initialChat.members[1],
              typing: true,
              createdAt: '2026-05-13T10:08:00.000Z',
            },
            receivedAt: Date.now(),
          }}
          runAuthorized={runAuthorized}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onChatSummaryChange={() => undefined}
          onChatRead={() => undefined}
          onPersistPendingOutgoingMessage={async message => message}
          onDeletePendingOutgoingMessages={async () => undefined}
        />,
      );
    });

    const typingIndicator = renderer!.root.findByProps({
      testID: 'typing-indicator',
    });
    expect(typingIndicator.findByProps({children: 'Alex is typing...'})).toBeTruthy();
  });
});
