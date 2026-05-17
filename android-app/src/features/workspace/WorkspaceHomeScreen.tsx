import type {
  AuthResponse,
  ChatDraft,
  ChatSummary,
  PendingOutgoingMessage,
  UserProfile,
  VideoConference,
  WorkspaceBootstrap,
  WorkspaceSearch,
} from '@north/shared';
import type {ReactNode} from 'react';
import {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {API_URL, APP_CONFIG_NOTE} from '../../config';

type WorkspaceTab = 'chats' | 'contacts' | 'conferences' | 'profile';

type Props = {
  session: AuthResponse;
  workspace: WorkspaceBootstrap;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenChat: (chatId: string) => void;
  onStartDirectChat: (username: string) => Promise<ChatSummary>;
  onAddContact: (username: string) => Promise<UserProfile>;
  onRemoveContact: (username: string) => Promise<void>;
  onSearchWorkspace: (query: string) => Promise<WorkspaceSearch>;
  onArchiveChat: (chatId: string, archived: boolean) => Promise<void>;
  onBlockUser: (username: string) => Promise<UserProfile>;
  onUnblockUser: (username: string) => Promise<void>;
};

export function WorkspaceHomeScreen({
  session,
  workspace,
  loading,
  error,
  onReload,
  onLogout,
  onOpenChat,
  onStartDirectChat,
  onAddContact,
  onRemoveContact,
  onSearchWorkspace,
  onArchiveChat,
  onBlockUser,
  onUnblockUser,
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<WorkspaceSearch | null>(null);
  const [pendingArchiveChatIds, setPendingArchiveChatIds] = useState<
    Record<string, boolean>
  >({});
  const [pendingUserActions, setPendingUserActions] = useState<
    Record<string, boolean>
  >({});

  const normalizedSearchQuery = searchQuery.trim();
  const archivedChatIds = useMemo(
    () => new Set(workspace.archivedChatIds),
    [workspace.archivedChatIds],
  );
  const currentUsername = session.user.username.trim().toLowerCase();
  const contactUsernames = useMemo(
    () =>
      new Set(
        workspace.contacts.map(profile =>
          profile.username.trim().toLowerCase(),
        ),
      ),
    [workspace.contacts],
  );
  const blockedUsernames = useMemo(
    () =>
      new Set(
        workspace.blockedUsers.map(profile =>
          profile.username.trim().toLowerCase(),
        ),
      ),
    [workspace.blockedUsers],
  );
  const draftsByChatId = useMemo(
    () => new Map(workspace.drafts.map(draft => [draft.chatId, draft])),
    [workspace.drafts],
  );
  const pendingByChatId = useMemo(
    () => buildPendingOutgoingCounts(workspace.pendingOutgoingMessages),
    [workspace.pendingOutgoingMessages],
  );
  const activeChats = useMemo(
    () => workspace.chats.filter(chat => !archivedChatIds.has(chat.id)),
    [archivedChatIds, workspace.chats],
  );
  const archivedChats = useMemo(
    () => workspace.chats.filter(chat => archivedChatIds.has(chat.id)),
    [archivedChatIds, workspace.chats],
  );
  const searchResultCount = countWorkspaceSearchResults(searchResults);
  const activeConferences = workspace.conferences;
  const archivedConferences = workspace.archivedConferences;

  const handleSearch = async () => {
    if (normalizedSearchQuery.length === 0) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    if (normalizedSearchQuery.length < 2) {
      setSearchResults(null);
      setSearchError('Type at least 2 characters to search the workspace.');
      return;
    }

    setSearchPending(true);
    setSearchError(null);
    setActionError(null);

    try {
      const results = await onSearchWorkspace(normalizedSearchQuery);
      setSearchResults(results);
    } catch (nextError) {
      setSearchResults(null);
      setSearchError(toErrorText(nextError));
    } finally {
      setSearchPending(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
  };

  const handleArchiveToggle = async (chatId: string, archived: boolean) => {
    setPendingArchiveChatIds(currentState => ({
      ...currentState,
      [chatId]: true,
    }));
    setActionError(null);

    try {
      await onArchiveChat(chatId, archived);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingArchiveChatIds(currentState => {
        if (!currentState[chatId]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[chatId];
        return nextState;
      });
    }
  };

  const handleBlock = async (username: string) => {
    const key = buildUserActionKey('block', username);
    setPendingUserActions(currentState => ({
      ...currentState,
      [key]: true,
    }));
    setActionError(null);

    try {
      await onBlockUser(username);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingUserActions(currentState => {
        if (!currentState[key]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[key];
        return nextState;
      });
    }
  };

  const handleUnblock = async (username: string) => {
    const key = buildUserActionKey('unblock', username);
    setPendingUserActions(currentState => ({
      ...currentState,
      [key]: true,
    }));
    setActionError(null);

    try {
      await onUnblockUser(username);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingUserActions(currentState => {
        if (!currentState[key]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[key];
        return nextState;
      });
    }
  };

  const handleStartChat = async (username: string) => {
    const key = buildUserActionKey('message', username);
    setPendingUserActions(currentState => ({
      ...currentState,
      [key]: true,
    }));
    setActionError(null);

    try {
      await onStartDirectChat(username);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingUserActions(currentState => {
        if (!currentState[key]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[key];
        return nextState;
      });
    }
  };

  const handleAddContact = async (username: string) => {
    const key = buildUserActionKey('add-contact', username);
    setPendingUserActions(currentState => ({
      ...currentState,
      [key]: true,
    }));
    setActionError(null);

    try {
      await onAddContact(username);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingUserActions(currentState => {
        if (!currentState[key]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[key];
        return nextState;
      });
    }
  };

  const handleRemoveContact = async (username: string) => {
    const key = buildUserActionKey('remove-contact', username);
    setPendingUserActions(currentState => ({
      ...currentState,
      [key]: true,
    }));
    setActionError(null);

    try {
      await onRemoveContact(username);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingUserActions(currentState => {
        if (!currentState[key]) {
          return currentState;
        }

        const nextState = {...currentState};
        delete nextState[key];
        return nextState;
      });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Android workspace</Text>
          <Text style={styles.title}>{session.user.displayName}</Text>
          <Text style={styles.copy}>
            Messaging is now live on mobile, attachments already work, and this
            workspace shell is moving from read-only into real everyday actions.
          </Text>
        </View>
        <View style={styles.heroActions}>
          <Pressable
            onPress={onReload}
            disabled={loading}
            style={loading ? styles.actionDisabled : styles.actionPrimary}>
            <Text style={styles.actionPrimaryLabel}>
              {loading ? 'Refreshing...' : 'Refresh workspace'}
            </Text>
          </Pressable>
          <Pressable onPress={onLogout} style={styles.actionGhost}>
            <Text style={styles.actionGhostLabel}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Chats" value={String(activeChats.length)} />
        <SummaryCard label="Archived" value={String(archivedChats.length)} />
        <SummaryCard label="Contacts" value={String(workspace.contacts.length)} />
        <SummaryCard
          label="Blocked"
          value={String(workspace.blockedUsers.length)}
        />
        <SummaryCard
          label="Conferences"
          value={String(activeConferences.length)}
        />
        <SummaryCard
          label="Archived conf."
          value={String(archivedConferences.length)}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.searchCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workspace search</Text>
          <Text style={styles.sectionSubtitle}>
            Search chats, contacts, users, and conferences through the backend
            search endpoint.
          </Text>
        </View>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search chats, users, conferences"
          placeholderTextColor="#8d7b67"
          style={styles.searchInput}
          testID="search-input"
        />
        <View style={styles.searchActions}>
          <Pressable
            onPress={() => {
              handleSearch().catch(() => undefined);
            }}
            disabled={searchPending}
            style={searchPending ? styles.actionDisabled : styles.actionPrimary}
            testID="search-button">
            <Text style={styles.actionPrimaryLabel}>
              {searchPending ? 'Searching...' : 'Search'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleClearSearch}
            style={styles.actionGhost}
            testID="clear-search-button">
            <Text style={styles.actionGhostLabel}>Clear</Text>
          </Pressable>
        </View>
        {searchError ? <Text style={styles.inlineError}>{searchError}</Text> : null}
        {normalizedSearchQuery.length > 0 && !searchError && !searchPending ? (
          <Text style={styles.searchHint}>
            {searchResults
              ? `${searchResultCount} result${
                  searchResultCount === 1 ? '' : 's'
                } for "${normalizedSearchQuery}".`
              : 'Run search to load matching chats, users, and conferences.'}
          </Text>
        ) : null}
      </View>

      {searchResults ? (
        <View style={styles.section}>
          <SectionHeader
            title="Search results"
            subtitle={`Workspace matches for "${normalizedSearchQuery}".`}
          />

          {searchResults.chats.length > 0 ? (
            <SearchResultGroup title="Chats">
              {searchResults.chats.map(chat => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  draft={draftsByChatId.get(chat.id) ?? null}
                  pendingCount={pendingByChatId.get(chat.id) ?? 0}
                  archived={archivedChatIds.has(chat.id)}
                  archivePending={Boolean(pendingArchiveChatIds[chat.id])}
                  onOpen={() => onOpenChat(chat.id)}
                  onToggleArchive={() => {
                    handleArchiveToggle(chat.id, !archivedChatIds.has(chat.id)).catch(
                      () => undefined,
                    );
                  }}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {searchResults.contacts.length > 0 ? (
            <SearchResultGroup title="Contacts">
              {searchResults.contacts.map(profile => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  actions={[
                    {
                      label: 'Message',
                      pending: Boolean(
                        pendingUserActions[
                          buildUserActionKey('message', profile.username)
                        ],
                      ),
                      onPress: () => {
                        handleStartChat(profile.username).catch(() => undefined);
                      },
                      testID: `message-contact-${profile.username}`,
                      tone: 'primary',
                    },
                    {
                      label: 'Remove',
                      pending: Boolean(
                        pendingUserActions[
                          buildUserActionKey('remove-contact', profile.username)
                        ],
                      ),
                      onPress: () => {
                        handleRemoveContact(profile.username).catch(
                          () => undefined,
                        );
                      },
                      testID: `remove-contact-${profile.username}`,
                    },
                    {
                      label: 'Block',
                      pending: Boolean(
                        pendingUserActions[
                          buildUserActionKey('block', profile.username)
                        ],
                      ),
                      onPress: () => {
                        handleBlock(profile.username).catch(() => undefined);
                      },
                      testID: `block-contact-${profile.username}`,
                      tone: 'danger',
                    },
                  ]}
                />
              ))}
            </SearchResultGroup>
          ) : null}

          {searchResults.users.length > 0 ? (
            <SearchResultGroup title="Users">
              {searchResults.users.map(profile => {
                const normalizedUsername = profile.username
                  .trim()
                  .toLowerCase();
                const blocked = blockedUsernames.has(normalizedUsername);
                const currentUser = normalizedUsername === currentUsername;
                const alreadyContact = contactUsernames.has(normalizedUsername);

                return (
                  <ProfileRow
                    key={profile.id}
                    profile={profile}
                    actions={
                      currentUser
                        ? []
                        : blocked
                          ? [
                              {
                                label: 'Unblock',
                                pending: Boolean(
                                  pendingUserActions[
                                    buildUserActionKey(
                                      'unblock',
                                      profile.username,
                                    )
                                  ],
                                ),
                                onPress: () => {
                                  handleUnblock(profile.username).catch(
                                    () => undefined,
                                  );
                                },
                                testID: `unblock-search-user-${profile.username}`,
                              },
                            ]
                          : [
                              {
                                label: 'Message',
                                pending: Boolean(
                                  pendingUserActions[
                                    buildUserActionKey(
                                      'message',
                                      profile.username,
                                    )
                                  ],
                                ),
                                onPress: () => {
                                  handleStartChat(profile.username).catch(
                                    () => undefined,
                                  );
                                },
                                testID: `message-search-user-${profile.username}`,
                                tone: 'primary',
                              },
                              ...(!alreadyContact
                                ? [
                                    {
                                      label: 'Add contact',
                                      pending: Boolean(
                                        pendingUserActions[
                                          buildUserActionKey(
                                            'add-contact',
                                            profile.username,
                                          )
                                        ],
                                      ),
                                      onPress: () => {
                                        handleAddContact(profile.username).catch(
                                          () => undefined,
                                        );
                                      },
                                      testID: `add-contact-${profile.username}`,
                                    },
                                  ]
                                : []),
                              {
                                label: 'Block',
                                pending: Boolean(
                                  pendingUserActions[
                                    buildUserActionKey(
                                      'block',
                                      profile.username,
                                    )
                                  ],
                                ),
                                onPress: () => {
                                  handleBlock(profile.username).catch(
                                    () => undefined,
                                  );
                                },
                                testID: `search-user-${profile.username}`,
                                tone: 'danger',
                              },
                            ]
                    }
                  />
                );
              })}
            </SearchResultGroup>
          ) : null}

          {searchResults.conferences.length > 0 ? (
            <SearchResultGroup title="Conferences">
              {searchResults.conferences.map(conference => (
                <ConferenceRow key={conference.id} conference={conference} />
              ))}
            </SearchResultGroup>
          ) : null}

          {searchResultCount === 0 ? (
            <EmptyState label="No workspace matches for this query." />
          ) : null}
        </View>
      ) : null}

      <View style={styles.tabRow}>
        <TabButton
          label="Chats"
          active={activeTab === 'chats'}
          onPress={() => setActiveTab('chats')}
          testID="tab-chats"
        />
        <TabButton
          label="Contacts"
          active={activeTab === 'contacts'}
          onPress={() => setActiveTab('contacts')}
          testID="tab-contacts"
        />
        <TabButton
          label="Conferences"
          active={activeTab === 'conferences'}
          onPress={() => setActiveTab('conferences')}
          testID="tab-conferences"
        />
        <TabButton
          label="Profile"
          active={activeTab === 'profile'}
          onPress={() => setActiveTab('profile')}
          testID="tab-profile"
        />
      </View>

      {activeTab === 'chats' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Chats"
            subtitle="Unread, drafts, pending sends, and archive state all come from real workspace data."
          />
          {activeChats.length === 0 ? (
            <EmptyState label="No active chats yet." />
          ) : (
            activeChats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                draft={draftsByChatId.get(chat.id) ?? null}
                pendingCount={pendingByChatId.get(chat.id) ?? 0}
                archived={false}
                archivePending={Boolean(pendingArchiveChatIds[chat.id])}
                onOpen={() => onOpenChat(chat.id)}
                onToggleArchive={() => {
                  handleArchiveToggle(chat.id, true).catch(() => undefined);
                }}
              />
            ))
          )}

          <SectionHeader
            title="Archived chats"
            subtitle="Archive and restore now use the same backend chat state as web."
          />
          {archivedChats.length === 0 ? (
            <EmptyState label="No archived chats." />
          ) : (
            archivedChats.map(chat => (
              <ChatRow
                key={chat.id}
                chat={chat}
                draft={draftsByChatId.get(chat.id) ?? null}
                pendingCount={pendingByChatId.get(chat.id) ?? 0}
                archived
                archivePending={Boolean(pendingArchiveChatIds[chat.id])}
                onOpen={() => onOpenChat(chat.id)}
                onToggleArchive={() => {
                  handleArchiveToggle(chat.id, false).catch(() => undefined);
                }}
              />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'contacts' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Contacts"
            subtitle="Current contacts plus blocked users management on the mobile client."
          />
          {workspace.contacts.length === 0 ? (
            <EmptyState label="No contacts yet." />
          ) : (
            workspace.contacts.map(profile => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                actions={[
                  {
                    label: 'Message',
                    pending: Boolean(
                      pendingUserActions[
                        buildUserActionKey('message', profile.username)
                      ],
                    ),
                    onPress: () => {
                      handleStartChat(profile.username).catch(() => undefined);
                    },
                    testID: `message-contact-${profile.username}`,
                    tone: 'primary',
                  },
                  {
                    label: 'Remove',
                    pending: Boolean(
                      pendingUserActions[
                        buildUserActionKey('remove-contact', profile.username)
                      ],
                    ),
                    onPress: () => {
                      handleRemoveContact(profile.username).catch(
                        () => undefined,
                      );
                    },
                    testID: `remove-contact-${profile.username}`,
                  },
                  {
                    label: 'Block',
                    pending: Boolean(
                      pendingUserActions[
                        buildUserActionKey('block', profile.username)
                      ],
                    ),
                    onPress: () => {
                      handleBlock(profile.username).catch(() => undefined);
                    },
                    testID: `block-contact-${profile.username}`,
                    tone: 'danger',
                  },
                ]}
              />
            ))
          )}

          <SectionHeader
            title="Blocked users"
            subtitle="Unblock actions are now available directly on Android."
          />
          {workspace.blockedUsers.length === 0 ? (
            <EmptyState label="No blocked users." />
          ) : (
            workspace.blockedUsers.map(profile => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                actions={[
                  {
                    label: 'Unblock',
                    pending: Boolean(
                      pendingUserActions[
                        buildUserActionKey('unblock', profile.username)
                      ],
                    ),
                    onPress: () => {
                      handleUnblock(profile.username).catch(() => undefined);
                    },
                    testID: `unblock-user-${profile.username}`,
                  },
                ]}
              />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'conferences' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Conferences"
            subtitle="Conference list is visible now; in-app join remains the later call sprint."
          />
          {activeConferences.length === 0 ? (
            <EmptyState label="No conferences yet." />
          ) : (
            activeConferences.map(conference => (
              <ConferenceRow key={conference.id} conference={conference} />
            ))
          )}

          <SectionHeader
            title="Archived conferences"
            subtitle="Ended conferences already come from backend bootstrap separately."
          />
          {archivedConferences.length === 0 ? (
            <EmptyState label="No archived conferences." />
          ) : (
            archivedConferences.map(conference => (
              <ConferenceRow key={conference.id} conference={conference} />
            ))
          )}
        </View>
      ) : null}

      {activeTab === 'profile' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Profile"
            subtitle="Session and account state are coming from the dedicated mobile auth contract."
          />
          <View style={styles.card}>
            <MetaRow label="Username" value={`@${session.user.username}`} />
            <MetaRow label="Email" value={session.user.email ?? 'hidden'} />
            <MetaRow
              label="Verification"
              value={session.user.emailVerified ? 'verified' : 'not verified'}
            />
            <MetaRow label="Session" value={session.sessionId.slice(0, 8)} />
            <MetaRow label="API" value={API_URL} />
            <MetaRow
              label="Mailboxes"
              value={String(workspace.mailboxes.length)}
            />
            <MetaRow
              label="Pending outgoing"
              value={String(workspace.pendingOutgoingMessages.length)}
            />
            <MetaRow
              label="Blocked users"
              value={String(workspace.blockedUsers.length)}
            />
            <Text style={styles.metaNote}>{APP_CONFIG_NOTE}</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function buildPendingOutgoingCounts(messages: PendingOutgoingMessage[]) {
  const counts = new Map<string, number>();
  messages.forEach(message => {
    counts.set(message.chatId, (counts.get(message.chatId) ?? 0) + 1);
  });
  return counts;
}

function countWorkspaceSearchResults(results: WorkspaceSearch | null) {
  if (!results) {
    return 0;
  }

  return (
    results.users.length +
    results.contacts.length +
    results.chats.length +
    results.conferences.length
  );
}

function toErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unexpected error';
}

function buildUserActionKey(
  action:
    | 'block'
    | 'unblock'
    | 'message'
    | 'add-contact'
    | 'remove-contact',
  username: string,
) {
  return `${action}:${username.trim().toLowerCase()}`;
}

type SummaryCardProps = {
  label: string;
  value: string;
};

function SummaryCard({label, value}: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

type TabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
};

function TabButton({label, active, onPress, testID}: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={active ? styles.tabButtonActive : styles.tabButton}
      testID={testID}>
      <Text style={active ? styles.tabButtonLabelActive : styles.tabButtonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

type SectionHeaderProps = {
  title: string;
  subtitle: string;
};

function SectionHeader({title, subtitle}: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

type SearchResultGroupProps = {
  title: string;
  children: ReactNode;
};

function SearchResultGroup({title, children}: SearchResultGroupProps) {
  return (
    <View style={styles.searchResultGroup}>
      <Text style={styles.searchResultGroupTitle}>{title}</Text>
      <View style={styles.searchResultGroupBody}>{children}</View>
    </View>
  );
}

type ChatRowProps = {
  chat: ChatSummary;
  draft: ChatDraft | null;
  pendingCount: number;
  archived: boolean;
  archivePending: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
};

function ChatRow({
  chat,
  draft,
  pendingCount,
  archived,
  archivePending,
  onOpen,
  onToggleArchive,
}: ChatRowProps) {
  const metadata = [
    chat.direct ? 'Direct' : 'Group',
    chat.unreadCount > 0 ? `Unread ${chat.unreadCount}` : null,
    draft ? 'Draft' : null,
    pendingCount > 0 ? `Pending ${pendingCount}` : null,
    archived ? 'Archived' : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <Text style={styles.cardTitle}>{chat.title}</Text>
        <View style={styles.rowActions}>
          <Pressable
            onPress={onToggleArchive}
            disabled={archivePending}
            style={
              archivePending ? styles.inlineActionDisabled : styles.inlineActionMuted
            }
            testID={`archive-chat-${chat.id}`}>
            <Text style={styles.inlineActionMutedLabel}>
              {archivePending
                ? archived
                  ? 'Restoring...'
                  : 'Archiving...'
                : archived
                  ? 'Restore'
                  : 'Archive'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onOpen}
            style={styles.inlineActionPrimary}
            testID={`open-chat-${chat.id}`}>
            <Text style={styles.inlineActionPrimaryLabel}>Open</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.cardMeta}>{metadata || 'No chat activity yet'}</Text>
      <Text style={styles.cardSnippet}>{chat.lastMessage ?? 'No messages yet'}</Text>
      {draft ? (
        <Text style={styles.cardHint}>Draft: {draft.content || 'empty draft'}</Text>
      ) : null}
    </View>
  );
}

type ProfileRowAction = {
  label: string;
  pending?: boolean;
  onPress: () => void;
  testID: string;
  tone?: 'muted' | 'primary' | 'danger';
};

type ProfileRowProps = {
  profile: UserProfile;
  actions?: ProfileRowAction[];
};

function ProfileRow({profile, actions = []}: ProfileRowProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{profile.displayName}</Text>
      <Text style={styles.cardMeta}>
        @{profile.username} | {profile.online ? 'online' : 'offline'}
      </Text>
      <Text style={styles.cardSnippet}>
        {profile.profession?.trim() || 'No profession set'}
      </Text>
      {actions.length > 0 ? (
        <View style={styles.profileRowActions}>
          {actions.map(action => (
            <Pressable
              key={action.testID}
              onPress={action.onPress}
              disabled={action.pending}
              style={
                action.pending
                  ? styles.inlineActionDisabled
                  : action.tone === 'primary'
                    ? styles.inlineActionPrimary
                    : action.tone === 'danger'
                      ? styles.inlineActionDanger
                      : styles.inlineActionMuted
              }
              testID={action.testID}>
              <Text
                style={
                  action.tone === 'primary'
                    ? styles.inlineActionPrimaryLabel
                    : action.tone === 'danger'
                      ? styles.inlineActionDangerLabel
                      : styles.inlineActionMutedLabel
                }>
                {action.pending ? `${action.label}...` : action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type ConferenceRowProps = {
  conference: VideoConference;
};

function ConferenceRow({conference}: ConferenceRowProps) {
  const state = conference.startedAt
    ? 'Live now'
    : conference.roomName
      ? 'Joinable'
      : 'Scheduled';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{conference.title}</Text>
      <Text style={styles.cardMeta}>
        {conference.participants.length} participants | {state}
      </Text>
      <Text style={styles.cardSnippet}>
        {conference.chatId ? 'Bound to a group chat' : 'Standalone conference'}
      </Text>
    </View>
  );
}

type MetaRowProps = {
  label: string;
  value: string;
};

function MetaRow({label, value}: MetaRowProps) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

type EmptyStateProps = {
  label: string;
};

function EmptyState({label}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3efe7',
  },
  content: {
    padding: 20,
    gap: 18,
  },
  hero: {
    backgroundColor: '#fffaf1',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 20,
    gap: 18,
  },
  heroCopy: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8a5a2b',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#1f1a14',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4f463c',
  },
  heroActions: {
    gap: 12,
  },
  actionPrimary: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
    paddingHorizontal: 18,
  },
  actionDisabled: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9aa8a3',
    paddingHorizontal: 18,
  },
  actionGhost: {
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
    paddingHorizontal: 18,
  },
  actionPrimaryLabel: {
    color: '#fffaf1',
    fontWeight: '800',
    fontSize: 15,
  },
  actionGhostLabel: {
    color: '#5b4b3c',
    fontWeight: '800',
    fontSize: 15,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#1f5149',
    borderRadius: 22,
    padding: 16,
    gap: 4,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fffaf1',
  },
  summaryLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#c6ddd8',
  },
  error: {
    color: '#8b221c',
    backgroundColor: '#f8dfdb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineError: {
    color: '#8b221c',
    fontSize: 13,
    lineHeight: 18,
  },
  searchCard: {
    backgroundColor: '#fffaf1',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9ccb8',
    backgroundColor: '#fdf7ed',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f1a14',
  },
  searchActions: {
    flexDirection: 'row',
    gap: 10,
  },
  searchHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6f6256',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tabButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#efe4d3',
  },
  tabButtonActive: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2c5c53',
  },
  tabButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b4b3c',
  },
  tabButtonLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fffaf1',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f1a14',
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6f6256',
  },
  searchResultGroup: {
    gap: 8,
  },
  searchResultGroupTitle: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8a5a2b',
  },
  searchResultGroupBody: {
    gap: 10,
  },
  card: {
    backgroundColor: '#fffaf1',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 16,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileRowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  inlineActionPrimary: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2c5c53',
  },
  inlineActionPrimaryLabel: {
    color: '#fffaf1',
    fontSize: 12,
    fontWeight: '800',
  },
  inlineActionMuted: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#efe4d3',
  },
  inlineActionDisabled: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#d8d0c4',
  },
  inlineActionDanger: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8dfdb',
  },
  inlineActionMutedLabel: {
    color: '#5b4b3c',
    fontSize: 12,
    fontWeight: '800',
  },
  inlineActionDangerLabel: {
    color: '#8b221c',
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1f1a14',
  },
  cardMeta: {
    fontSize: 13,
    color: '#6a5d50',
  },
  cardSnippet: {
    fontSize: 14,
    lineHeight: 20,
    color: '#40372f',
  },
  cardHint: {
    fontSize: 13,
    color: '#8a5a2b',
  },
  metaRow: {
    gap: 3,
  },
  metaLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8d7b67',
  },
  metaValue: {
    fontSize: 15,
    color: '#2d251d',
  },
  metaNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6f6256',
  },
  emptyState: {
    backgroundColor: '#efe4d3',
    borderRadius: 18,
    padding: 16,
  },
  emptyLabel: {
    color: '#6a5d50',
    fontSize: 14,
  },
});
