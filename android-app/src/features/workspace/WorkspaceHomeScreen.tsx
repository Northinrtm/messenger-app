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
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {androidTheme} from '../../theme';

type WorkspaceTab = 'chats' | 'contacts' | 'conferences' | 'profile';

type Props = {
  session: AuthResponse;
  workspace: WorkspaceBootstrap;
  error: string | null;
  onLogout: () => Promise<void>;
  onOpenChat: (chatId: string) => void;
  onOpenConference: (conferenceId: string) => void;
  onStartDirectChat: (username: string) => Promise<ChatSummary>;
  onAddContact: (username: string) => Promise<UserProfile>;
  onRemoveContact: (username: string) => Promise<void>;
  onSearchWorkspace: (query: string) => Promise<WorkspaceSearch>;
  onArchiveChat: (chatId: string, archived: boolean) => Promise<void>;
  onBlockUser: (username: string) => Promise<UserProfile>;
  onUnblockUser: (username: string) => Promise<void>;
  onResendEmailVerification: () => Promise<void>;
};

export function WorkspaceHomeScreen({
  session,
  workspace,
  error,
  onLogout,
  onOpenChat,
  onOpenConference,
  onStartDirectChat,
  onAddContact,
  onRemoveContact,
  onSearchWorkspace,
  onArchiveChat,
  onBlockUser,
  onUnblockUser,
  onResendEmailVerification,
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
  const [verificationPending, setVerificationPending] = useState(false);
  const [profileInfo, setProfileInfo] = useState<string | null>(null);

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
  const activeConferences = workspace.conferences;
  const archivedConferences = workspace.archivedConferences;
  const searchResultCount = countWorkspaceSearchResults(searchResults);
  const activeTabLabel = getTabLabel(activeTab);

  const handleSearch = async () => {
    if (normalizedSearchQuery.length === 0) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    if (normalizedSearchQuery.length < 2) {
      setSearchResults(null);
      setSearchError('Type at least 2 characters to search.');
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
      setPendingUserActions(currentState => omitRecordKey(currentState, key));
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
      setPendingUserActions(currentState => omitRecordKey(currentState, key));
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
      setPendingUserActions(currentState => omitRecordKey(currentState, key));
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
      setPendingUserActions(currentState => omitRecordKey(currentState, key));
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
      setPendingUserActions(currentState => omitRecordKey(currentState, key));
    }
  };

  const handleResendVerification = async () => {
    setVerificationPending(true);
    setActionError(null);
    setProfileInfo(null);

    try {
      await onResendEmailVerification();
      setProfileInfo('Verification email sent.');
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setVerificationPending(false);
    }
  };

  const profileCards = [
    {label: 'Chats', value: String(activeChats.length)},
    {label: 'Contacts', value: String(workspace.contacts.length)},
    {label: 'Calls', value: String(activeConferences.length)},
    {label: 'Pending', value: String(workspace.pendingOutgoingMessages.length)},
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ios: 'padding', android: 'height'})}
      style={styles.screen}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.topBarCopy}>
            <Text style={styles.brandTitle}>North Messenger</Text>
            <Text style={styles.brandSubtitle}>{activeTabLabel}</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.topBarAction}>
            <Text style={styles.topBarActionLabel}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.searchShell}>
          <View style={styles.searchField}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search chats, people, conferences"
              placeholderTextColor={androidTheme.colors.textMuted}
              selectionColor={androidTheme.colors.blue}
              style={styles.searchInput}
              testID="search-input"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={handleClearSearch}
                style={styles.searchClearButton}
                testID="clear-search-button">
                <Text style={styles.searchClearLabel}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              handleSearch().catch(() => undefined);
            }}
            disabled={searchPending}
            style={searchPending ? styles.searchButtonDisabled : styles.searchButton}
            testID="search-button">
            <Text style={styles.searchButtonLabel}>
              {searchPending ? 'Searching...' : 'Search'}
            </Text>
          </Pressable>
        </View>

        {error ? <Banner tone="danger" label={error} /> : null}
        {actionError ? <Banner tone="danger" label={actionError} /> : null}
        {searchError ? <Banner tone="danger" label={searchError} /> : null}
        {profileInfo ? <Banner tone="success" label={profileInfo} /> : null}

        {searchResults && normalizedSearchQuery.length > 0 ? (
          <View style={styles.searchResultsCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Search results</Text>
              <Text style={styles.sectionSubtitle}>
                {searchResultCount} result{searchResultCount === 1 ? '' : 's'} for "
                {normalizedSearchQuery}"
              </Text>
            </View>

            <ScrollView
              style={styles.searchResultsScroll}
              contentContainerStyle={styles.searchResultsContent}
              keyboardShouldPersistTaps="handled">
              {searchResults.chats.length > 0 ? (
                <SearchResultGroup title="Chats">
                  {searchResults.chats.map(chat => (
                    <ChatListItem
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
                    <ProfileListItem
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
                <SearchResultGroup title="People">
                  {searchResults.users.map(profile => {
                    const normalizedUsername = profile.username
                      .trim()
                      .toLowerCase();
                    const blocked = blockedUsernames.has(normalizedUsername);
                    const currentUser = normalizedUsername === currentUsername;
                    const alreadyContact = contactUsernames.has(normalizedUsername);

                    return (
                      <ProfileListItem
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
                <SearchResultGroup title="Calls">
                  {searchResults.conferences.map(conference => (
                    <ConferenceListItem
                      key={conference.id}
                      conference={conference}
                      onOpen={() => onOpenConference(conference.id)}
                    />
                  ))}
                </SearchResultGroup>
              ) : null}

              {searchResultCount === 0 ? (
                <EmptyState label="No workspace matches for this query." />
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.contentArea}>
          {activeTab === 'chats' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Chats</Text>
                <Text style={styles.sectionSubtitle}>
                  Recent conversations, drafts, pending sends, and archive state.
                </Text>
              </View>
              {activeChats.length === 0 ? (
                <EmptyState label="No active chats yet." />
              ) : (
                activeChats.map(chat => (
                  <ChatListItem
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

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Archived</Text>
                <Text style={styles.sectionSubtitle}>
                  Hidden chats stay available here and can be restored.
                </Text>
              </View>
              {archivedChats.length === 0 ? (
                <EmptyState label="No archived chats." />
              ) : (
                archivedChats.map(chat => (
                  <ChatListItem
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
            </ScrollView>
          ) : null}

          {activeTab === 'contacts' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Contacts</Text>
                <Text style={styles.sectionSubtitle}>
                  Quick message, remove, block, and unblock actions.
                </Text>
              </View>
              {workspace.contacts.length === 0 ? (
                <EmptyState label="No contacts yet." />
              ) : (
                workspace.contacts.map(profile => (
                  <ProfileListItem
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

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Blocked</Text>
                <Text style={styles.sectionSubtitle}>
                  People you blocked on the workspace.
                </Text>
              </View>
              {workspace.blockedUsers.length === 0 ? (
                <EmptyState label="No blocked users." />
              ) : (
                workspace.blockedUsers.map(profile => (
                  <ProfileListItem
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
            </ScrollView>
          ) : null}

          {activeTab === 'conferences' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Calls</Text>
                <Text style={styles.sectionSubtitle}>
                  Scheduled and live conferences already available on mobile.
                </Text>
              </View>
              {activeConferences.length === 0 ? (
                <EmptyState label="No active conferences." />
              ) : (
                activeConferences.map(conference => (
                  <ConferenceListItem
                    key={conference.id}
                    conference={conference}
                    onOpen={() => onOpenConference(conference.id)}
                  />
                ))
              )}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Archive</Text>
                <Text style={styles.sectionSubtitle}>
                  Ended conferences remain visible for context and recordings.
                </Text>
              </View>
              {archivedConferences.length === 0 ? (
                <EmptyState label="No archived conferences." />
              ) : (
                archivedConferences.map(conference => (
                  <ConferenceListItem
                    key={conference.id}
                    conference={conference}
                    onOpen={() => onOpenConference(conference.id)}
                  />
                ))
              )}
            </ScrollView>
          ) : null}

          {activeTab === 'profile' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.profileHero}>
                <Avatar
                  name={session.user.displayName}
                  avatarUrl={session.user.avatarUrl}
                  size={72}
                />
                <View style={styles.profileHeroCopy}>
                  <Text style={styles.profileName}>{session.user.displayName}</Text>
                  <Text style={styles.profileUsername}>@{session.user.username}</Text>
                  <Text style={styles.profileEmail}>
                    {session.user.email ?? 'Email hidden'}
                  </Text>
                </View>
              </View>

              <View style={styles.profileStatsRow}>
                {profileCards.map(card => (
                  <ProfileStatCard key={card.label} label={card.label} value={card.value} />
                ))}
              </View>

              <View style={styles.profileCard}>
                <Text style={styles.sectionTitle}>Email verification</Text>
                <Text style={styles.sectionSubtitle}>
                  Use your account email here for sign-in and verification
                  status.
                </Text>
                <VerificationBadge
                  verified={Boolean(session.user.emailVerified)}
                  emailVerificationEnabled={
                    session.user.emailVerificationEnabled !== false
                  }
                />
                {!session.user.emailVerified &&
                session.user.emailVerificationEnabled !== false ? (
                  <Pressable
                    onPress={() => {
                      handleResendVerification().catch(() => undefined);
                    }}
                    disabled={verificationPending}
                    style={
                      verificationPending
                        ? styles.secondaryButtonDisabled
                        : styles.secondaryButton
                    }
                    testID="resend-email-verification-button">
                    <Text style={styles.secondaryButtonLabel}>
                      {verificationPending
                        ? 'Sending...'
                        : 'Resend verification email'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.profileCard}>
                <Text style={styles.sectionTitle}>Workspace</Text>
                <MetaRow label="Drafts" value={String(workspace.drafts.length)} />
                <MetaRow
                  label="Pending outgoing"
                  value={String(workspace.pendingOutgoingMessages.length)}
                />
                <MetaRow
                  label="Blocked users"
                  value={String(workspace.blockedUsers.length)}
                />
              </View>

              <Pressable onPress={onLogout} style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Logout</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.bottomNav}>
          <BottomTabButton
            label="Chats"
            active={activeTab === 'chats'}
            onPress={() => setActiveTab('chats')}
            testID="tab-chats"
          />
          <BottomTabButton
            label="Contacts"
            active={activeTab === 'contacts'}
            onPress={() => setActiveTab('contacts')}
            testID="tab-contacts"
          />
          <BottomTabButton
            label="Calls"
            active={activeTab === 'conferences'}
            onPress={() => setActiveTab('conferences')}
            testID="tab-conferences"
          />
          <BottomTabButton
            label="Profile"
            active={activeTab === 'profile'}
            onPress={() => setActiveTab('profile')}
            testID="tab-profile"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
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

function omitRecordKey(
  currentState: Record<string, boolean>,
  key: string,
) {
  if (!currentState[key]) {
    return currentState;
  }

  const nextState = {...currentState};
  delete nextState[key];
  return nextState;
}

function getTabLabel(activeTab: WorkspaceTab) {
  switch (activeTab) {
    case 'chats':
      return 'All chats';
    case 'contacts':
      return 'People';
    case 'conferences':
      return 'Calls';
    case 'profile':
      return 'Profile';
    default:
      return 'Workspace';
  }
}

type BannerProps = {
  tone: 'danger' | 'success';
  label: string;
};

function Banner({tone, label}: BannerProps) {
  return (
    <View style={tone === 'danger' ? styles.errorBanner : styles.successBanner}>
      <Text
        style={
          tone === 'danger' ? styles.errorBannerLabel : styles.successBannerLabel
        }>
        {label}
      </Text>
    </View>
  );
}

type SearchResultGroupProps = {
  title: string;
  children: ReactNode;
};

function SearchResultGroup({title, children}: SearchResultGroupProps) {
  return (
    <View style={styles.searchGroup}>
      <Text style={styles.searchGroupTitle}>{title}</Text>
      <View style={styles.searchGroupBody}>{children}</View>
    </View>
  );
}

type BottomTabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
};

function BottomTabButton({label, active, onPress, testID}: BottomTabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={active ? styles.bottomTabActive : styles.bottomTab}
      testID={testID}>
      <Text style={active ? styles.bottomTabLabelActive : styles.bottomTabLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

type ChatListItemProps = {
  chat: ChatSummary;
  draft: ChatDraft | null;
  pendingCount: number;
  archived: boolean;
  archivePending: boolean;
  onOpen: () => void;
  onToggleArchive: () => void;
};

function ChatListItem({
  chat,
  draft,
  pendingCount,
  archived,
  archivePending,
  onOpen,
  onToggleArchive,
}: ChatListItemProps) {
  const unreadCount = Math.max(0, chat.unreadCount);
  const snippet = draft
    ? `Draft: ${draft.content || 'empty draft'}`
    : chat.lastMessage || 'No messages yet';
  const metadata = [
    chat.direct ? 'Direct' : `${chat.members.length} members`,
    pendingCount > 0 ? `Pending ${pendingCount}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <Pressable onPress={onOpen} style={styles.chatCard}>
      <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size={54} />
      <View style={styles.chatCardCopy}>
        <View style={styles.chatCardTopRow}>
          <Text numberOfLines={1} style={styles.chatCardTitle}>
            {chat.title}
          </Text>
          <Text style={styles.chatCardTime}>
            {formatRelativeMessageTime(chat.lastMessageAt ?? chat.updatedAt)}
          </Text>
        </View>
        <View style={styles.chatCardMiddleRow}>
          <Text numberOfLines={2} style={styles.chatCardSnippet}>
            {snippet}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeLabel}>{String(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.chatCardBottomRow}>
          <Text numberOfLines={1} style={styles.chatCardMeta}>
            {metadata}
          </Text>
          <Pressable
            onPress={event => {
              event?.stopPropagation?.();
              onToggleArchive();
            }}
            disabled={archivePending}
            style={archivePending ? styles.smallActionDisabled : styles.smallAction}
            testID={`archive-chat-${chat.id}`}>
            <Text style={styles.smallActionLabel}>
              {archivePending
                ? archived
                  ? 'Restoring...'
                  : 'Archiving...'
                : archived
                  ? 'Restore'
                  : 'Archive'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

type ProfileRowAction = {
  label: string;
  pending?: boolean;
  onPress: () => void;
  testID: string;
  tone?: 'muted' | 'primary' | 'danger';
};

type ProfileListItemProps = {
  profile: UserProfile;
  actions?: ProfileRowAction[];
};

function ProfileListItem({profile, actions = []}: ProfileListItemProps) {
  return (
    <View style={styles.profileListCard}>
      <Avatar
        name={profile.displayName}
        avatarUrl={profile.avatarUrl}
        size={52}
      />
      <View style={styles.profileListCopy}>
        <Text style={styles.profileListName}>{profile.displayName}</Text>
        <Text style={styles.profileListMeta}>@{profile.username}</Text>
        <Text numberOfLines={2} style={styles.profileListSubtitle}>
          {profile.profession?.trim() ||
            (profile.online ? 'Online now' : 'No additional details')}
        </Text>
      </View>
      {actions.length > 0 ? (
        <View style={styles.profileActionWrap}>
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

type ConferenceListItemProps = {
  conference: VideoConference;
  onOpen: () => void;
};

function ConferenceListItem({conference, onOpen}: ConferenceListItemProps) {
  return (
    <View style={styles.conferenceCard}>
      <View style={styles.conferenceCardCopy}>
        <Text style={styles.conferenceCardTitle}>{conference.title}</Text>
        <Text style={styles.conferenceCardMeta}>
          {conference.participants.length} participants •{' '}
          {formatRelativeMessageTime(conference.scheduledAt)}
        </Text>
        <Text style={styles.conferenceCardHint}>
          {conference.startedAt
            ? 'Live now'
            : conference.endedAt
              ? 'Ended'
              : conference.chatId
                ? 'Linked to a group chat'
                : 'Standalone conference'}
        </Text>
      </View>
      <Pressable
        onPress={onOpen}
        style={styles.inlineActionPrimary}
        testID={`open-conference-${conference.id}`}>
        <Text style={styles.inlineActionPrimaryLabel}>Open</Text>
      </Pressable>
    </View>
  );
}

type VerificationBadgeProps = {
  verified: boolean;
  emailVerificationEnabled: boolean;
};

function VerificationBadge({
  verified,
  emailVerificationEnabled,
}: VerificationBadgeProps) {
  if (!emailVerificationEnabled) {
    return (
      <View style={styles.warningPill}>
        <Text style={styles.warningPillLabel}>Verification is disabled.</Text>
      </View>
    );
  }

  return (
    <View style={verified ? styles.successPill : styles.warningPill}>
      <Text style={verified ? styles.successPillLabel : styles.warningPillLabel}>
        {verified ? 'Email verified' : 'Email not verified'}
      </Text>
    </View>
  );
}

function ProfileStatCard({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.profileStatCard}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function EmptyState({label}: {label: string}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyLabel}>{label}</Text>
    </View>
  );
}

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl: string | null;
  size: number;
}) {
  const initials = buildInitials(name);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
      {avatarUrl ? (
        <Image
          source={{uri: avatarUrl}}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <Text style={[styles.avatarLabel, {fontSize: Math.max(14, size * 0.36)}]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

function buildInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'NM';
  }

  const first = words[0]?.slice(0, 1) ?? '';
  const second = (words[1] ?? words[0] ?? '').slice(0, 1);
  return `${first}${second}`.toUpperCase();
}

function formatRelativeMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarCopy: {
    flex: 1,
    gap: 3,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  brandSubtitle: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  topBarAction: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  topBarActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  searchShell: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 10,
  },
  searchField: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: androidTheme.colors.textPrimary,
    fontSize: 15,
    paddingVertical: 14,
  },
  searchClearButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  searchClearLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textSecondary,
  },
  searchButton: {
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  searchButtonDisabled: {
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78, 161, 255, 0.32)',
  },
  searchButtonLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBanner: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.dangerSoft,
  },
  errorBannerLabel: {
    color: androidTheme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  successBanner: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.successSoft,
  },
  successBannerLabel: {
    color: androidTheme.colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  searchResultsCard: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    maxHeight: 280,
  },
  searchResultsScroll: {
    flexGrow: 0,
  },
  searchResultsContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 14,
  },
  searchGroup: {
    gap: 10,
  },
  searchGroupTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: androidTheme.colors.blue,
  },
  searchGroupBody: {
    gap: 10,
  },
  contentArea: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 14,
  },
  sectionHeading: {
    gap: 4,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: androidTheme.colors.textSecondary,
  },
  bottomNav: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: androidTheme.colors.border,
    backgroundColor: androidTheme.colors.backgroundElevated,
  },
  bottomTab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  bottomTabActive: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
  },
  bottomTabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textMuted,
  },
  bottomTabLabelActive: {
    fontSize: 13,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  chatCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  chatCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  chatCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatCardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  chatCardTime: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  chatCardMiddleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  chatCardSnippet: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: androidTheme.colors.textSecondary,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  unreadBadgeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: androidTheme.colors.textInverse,
  },
  chatCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatCardMeta: {
    flex: 1,
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  smallAction: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  smallActionDisabled: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  smallActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  profileListCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  profileListCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  profileListName: {
    fontSize: 16,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  profileListMeta: {
    fontSize: 13,
    color: androidTheme.colors.blue,
  },
  profileListSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: androidTheme.colors.textSecondary,
  },
  profileActionWrap: {
    width: 104,
    gap: 8,
    alignItems: 'stretch',
  },
  inlineActionPrimary: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  inlineActionPrimaryLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineActionMuted: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  inlineActionDisabled: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  inlineActionDanger: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.dangerSoft,
  },
  inlineActionMutedLabel: {
    color: androidTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineActionDangerLabel: {
    color: androidTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  conferenceCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    borderRadius: 22,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  conferenceCardCopy: {
    flex: 1,
    gap: 4,
  },
  conferenceCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  conferenceCardMeta: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
  },
  conferenceCardHint: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  profileHero: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 18,
    borderRadius: 26,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  profileHeroCopy: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  profileUsername: {
    fontSize: 14,
    color: androidTheme.colors.blue,
  },
  profileEmail: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  profileStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  profileStatCard: {
    width: '47%',
    padding: 14,
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    gap: 4,
  },
  profileStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  profileStatLabel: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: androidTheme.colors.textMuted,
  },
  profileCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    gap: 12,
  },
  successPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.successSoft,
  },
  successPillLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: androidTheme.colors.success,
  },
  warningPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.warningSoft,
  },
  warningPillLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: androidTheme.colors.warning,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  secondaryButtonDisabled: {
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  secondaryButtonLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  primaryButtonLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  metaRow: {
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: androidTheme.colors.textMuted,
  },
  metaValue: {
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
  },
  emptyState: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  emptyLabel: {
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
    overflow: 'hidden',
  },
  avatarLabel: {
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
});
