import type {
  AuthResponse,
  ChatSummary,
  UserProfile,
  WorkspaceBootstrap,
  WorkspaceSearch,
} from '@north/shared';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {WorkspaceHomeScreen} from './WorkspaceHomeScreen';

const session: AuthResponse = {
  token: 'session-token',
  tokenExpiresAt: '2026-05-17T12:00:00.000Z',
  sessionId: 'session-1',
  user: {
    id: 'user-1',
    username: 'north',
    displayName: 'North',
    profession: 'Engineer',
    createdAt: '2026-05-01T10:00:00.000Z',
    avatarUrl: null,
    online: true,
    email: 'north@example.test',
    emailVerified: true,
  },
};

const contact: UserProfile = {
  id: 'user-2',
  username: 'alex',
  displayName: 'Alex',
  profession: 'Operator',
  createdAt: '2026-05-01T10:10:00.000Z',
  avatarUrl: null,
  online: false,
};

const blockedUser: UserProfile = {
  id: 'user-3',
  username: 'blocked',
  displayName: 'Blocked User',
  profession: 'Former member',
  createdAt: '2026-05-01T10:20:00.000Z',
  avatarUrl: null,
  online: false,
};

const workspace: WorkspaceBootstrap = {
  workspaceVersion: 'workspace-v1',
  profile: session.user,
  chats: [
    {
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
          avatarUrl: null,
          online: true,
        },
      ],
      lastMessage: 'Latest message',
      lastMessageAt: '2026-05-17T11:00:00.000Z',
      updatedAt: '2026-05-17T11:00:00.000Z',
      unreadCount: 2,
      pinnedMessage: null,
    },
  ],
  archivedChatIds: [],
  contacts: [contact],
  blockedUsers: [blockedUser],
  drafts: [],
  pendingOutgoingMessages: [],
  mailboxes: [],
  conferences: [],
  archivedConferences: [],
};

const directChat: ChatSummary = {
  id: 'chat-direct-1',
  direct: true,
  title: 'Alex',
  avatarUrl: null,
  chatVersion: 'chat-direct-v1',
  capabilities: {
    canEditGroup: false,
    canDeleteGroup: false,
    canManageInviteLink: false,
    canAddMembers: false,
    canManageRoles: false,
    canModerateMembers: false,
    canTogglePrejoinHistory: false,
    canLeaveGroup: false,
  },
  ownerUserId: null,
  moderatorUserIds: [],
  members: [],
  lastMessage: null,
  lastMessageAt: null,
  updatedAt: '2026-05-17T11:00:00.000Z',
  unreadCount: 0,
  pinnedMessage: null,
};

const emptySearchResults: WorkspaceSearch = {
  users: [],
  contacts: [],
  chats: [],
  conferences: [],
};

function findPressableByTestId(
  root: ReactTestRenderer.ReactTestInstance,
  testID: string,
) {
  const matches = root.findAll(
    node =>
      node.props.testID === testID && typeof node.props.onPress === 'function',
  );
  if (matches.length === 0) {
    throw new Error(`Pressable with testID "${testID}" was not found`);
  }
  return matches[0];
}

describe('WorkspaceHomeScreen', () => {
  it('archives a chat through the archive callback', async () => {
    const onArchiveChat = jest.fn(async () => undefined);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <WorkspaceHomeScreen
          session={session}
          workspace={workspace}
          loading={false}
          error={null}
          onReload={async () => undefined}
          onLogout={async () => undefined}
          onOpenChat={() => undefined}
          onStartDirectChat={async () => directChat}
          onAddContact={async username => ({...contact, username})}
          onRemoveContact={async () => undefined}
          onSearchWorkspace={async () => emptySearchResults}
          onArchiveChat={onArchiveChat}
          onBlockUser={async username => ({...contact, username})}
          onUnblockUser={async () => undefined}
        />,
      );
    });

    const archiveButton = findPressableByTestId(
      renderer!.root,
      'archive-chat-chat-1',
    );
    await ReactTestRenderer.act(async () => {
      await archiveButton.props.onPress();
    });

    expect(onArchiveChat).toHaveBeenCalledWith('chat-1', true);
  });

  it('unblocks a user from the contacts tab', async () => {
    const onUnblockUser = jest.fn(async () => undefined);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <WorkspaceHomeScreen
          session={session}
          workspace={workspace}
          loading={false}
          error={null}
          onReload={async () => undefined}
          onLogout={async () => undefined}
          onOpenChat={() => undefined}
          onStartDirectChat={async () => directChat}
          onAddContact={async username => ({...contact, username})}
          onRemoveContact={async () => undefined}
          onSearchWorkspace={async () => emptySearchResults}
          onArchiveChat={async () => undefined}
          onBlockUser={async username => ({...contact, username})}
          onUnblockUser={onUnblockUser}
        />,
      );
    });

    const contactsTab = renderer!.root.findByProps({testID: 'tab-contacts'});
    await ReactTestRenderer.act(async () => {
      contactsTab.props.onPress();
    });

    const unblockButton = findPressableByTestId(
      renderer!.root,
      'unblock-user-blocked',
    );
    await ReactTestRenderer.act(async () => {
      await unblockButton.props.onPress();
    });

    expect(onUnblockUser).toHaveBeenCalledWith('blocked');
  });

  it('searches the workspace and blocks a found user', async () => {
    const onSearchWorkspace = jest.fn(async () => ({
      users: [
        {
          id: 'user-4',
          username: 'sofia',
          displayName: 'Sofia',
          profession: 'Analyst',
          createdAt: '2026-05-01T10:30:00.000Z',
          avatarUrl: null,
          online: true,
        },
      ],
      contacts: [],
      chats: [],
      conferences: [],
    }));
    const onBlockUser = jest.fn(async username => ({
      ...contact,
      id: 'user-4',
      username,
      displayName: 'Sofia',
    }));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <WorkspaceHomeScreen
          session={session}
          workspace={workspace}
          loading={false}
          error={null}
          onReload={async () => undefined}
          onLogout={async () => undefined}
          onOpenChat={() => undefined}
          onStartDirectChat={async () => directChat}
          onAddContact={async username => ({...contact, username})}
          onRemoveContact={async () => undefined}
          onSearchWorkspace={onSearchWorkspace}
          onArchiveChat={async () => undefined}
          onBlockUser={onBlockUser}
          onUnblockUser={async () => undefined}
        />,
      );
    });

    const searchInput = renderer!.root.findByProps({testID: 'search-input'});
    await ReactTestRenderer.act(async () => {
      searchInput.props.onChangeText('sof');
    });

    const searchButton = renderer!.root.findByProps({testID: 'search-button'});
    await ReactTestRenderer.act(async () => {
      await searchButton.props.onPress();
    });

    expect(onSearchWorkspace).toHaveBeenCalledWith('sof');

    const blockButton = findPressableByTestId(
      renderer!.root,
      'search-user-sofia',
    );
    await ReactTestRenderer.act(async () => {
      await blockButton.props.onPress();
    });

    expect(onBlockUser).toHaveBeenCalledWith('sofia');
  });

  it('starts a direct chat from a contact row', async () => {
    const onStartDirectChat = jest.fn(async () => directChat);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <WorkspaceHomeScreen
          session={session}
          workspace={workspace}
          loading={false}
          error={null}
          onReload={async () => undefined}
          onLogout={async () => undefined}
          onOpenChat={() => undefined}
          onStartDirectChat={onStartDirectChat}
          onAddContact={async username => ({...contact, username})}
          onRemoveContact={async () => undefined}
          onSearchWorkspace={async () => emptySearchResults}
          onArchiveChat={async () => undefined}
          onBlockUser={async username => ({...contact, username})}
          onUnblockUser={async () => undefined}
        />,
      );
    });

    const contactsTab = renderer!.root.findByProps({testID: 'tab-contacts'});
    await ReactTestRenderer.act(async () => {
      contactsTab.props.onPress();
    });

    const messageButton = findPressableByTestId(
      renderer!.root,
      'message-contact-alex',
    );
    await ReactTestRenderer.act(async () => {
      await messageButton.props.onPress();
    });

    expect(onStartDirectChat).toHaveBeenCalledWith('alex');
  });

  it('adds a contact from search results', async () => {
    const onSearchWorkspace = jest.fn(async () => ({
      users: [
        {
          id: 'user-5',
          username: 'rina',
          displayName: 'Rina',
          profession: 'Designer',
          createdAt: '2026-05-01T10:31:00.000Z',
          avatarUrl: null,
          online: false,
        },
      ],
      contacts: [],
      chats: [],
      conferences: [],
    }));
    const onAddContact = jest.fn(async username => ({
      ...contact,
      id: 'user-5',
      username,
      displayName: 'Rina',
    }));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <WorkspaceHomeScreen
          session={session}
          workspace={workspace}
          loading={false}
          error={null}
          onReload={async () => undefined}
          onLogout={async () => undefined}
          onOpenChat={() => undefined}
          onStartDirectChat={async () => directChat}
          onAddContact={onAddContact}
          onRemoveContact={async () => undefined}
          onSearchWorkspace={onSearchWorkspace}
          onArchiveChat={async () => undefined}
          onBlockUser={async username => ({...contact, username})}
          onUnblockUser={async () => undefined}
        />,
      );
    });

    const searchInput = renderer!.root.findByProps({testID: 'search-input'});
    await ReactTestRenderer.act(async () => {
      searchInput.props.onChangeText('ri');
    });

    const searchButton = renderer!.root.findByProps({testID: 'search-button'});
    await ReactTestRenderer.act(async () => {
      await searchButton.props.onPress();
    });

    const addContactButton = findPressableByTestId(
      renderer!.root,
      'add-contact-rina',
    );
    await ReactTestRenderer.act(async () => {
      await addContactButton.props.onPress();
    });

    expect(onAddContact).toHaveBeenCalledWith('rina');
  });
});
