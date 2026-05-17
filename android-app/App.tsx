import type {
  AuthResponse,
  ChatMessage,
  MessageReactionEvent,
  TypingEvent,
  ChatSummary,
  MobileAuthResponse,
  PendingOutgoingMessage,
  UserProfile,
  WorkspaceBootstrap,
} from '@north/shared';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthScreen} from './src/features/auth/AuthScreen';
import {
  ChatThreadScreen,
  type RunAuthorized,
} from './src/features/chat/ChatThreadScreen';
import {WorkspaceHomeScreen} from './src/features/workspace/WorkspaceHomeScreen';
import {
  addContact,
  ApiError,
  blockUser,
  createDirectChat,
  describeError,
  deletePendingOutgoingMessage,
  getWorkspaceBootstrap,
  login,
  logout,
  removeContact,
  refreshSession,
  register,
  searchWorkspace,
  toAuthResponse,
  unblockUser,
  updateArchivedChat,
  upsertPendingOutgoingMessage,
} from './src/lib/api';
import {
  normalizeBootstrappedPendingOutgoingMessages,
  removeWorkspacePendingOutgoingMessages,
  upsertWorkspacePendingOutgoingMessage,
} from './src/lib/pendingOutgoingMessages';
import {
  clearStoredRefreshToken,
  loadStoredRefreshToken,
  saveStoredRefreshToken,
} from './src/lib/sessionStorage';
import {replaceSubscribedChatIds, subscribeToChats} from './src/lib/realtime';

type AuthMode = 'login' | 'register';

type ActiveSession = {
  auth: AuthResponse;
  refreshToken: string;
};

type RealtimeMessageEnvelope = {
  message: ChatMessage;
  receivedAt: number;
};

type RealtimeReactionEnvelope = {
  event: MessageReactionEvent;
  receivedAt: number;
};

type RealtimeTypingEnvelope = {
  event: TypingEvent;
  receivedAt: number;
};

async function activateSession(response: MobileAuthResponse) {
  const nextSession: ActiveSession = {
    auth: toAuthResponse(response),
    refreshToken: response.refreshToken,
  };
  await saveStoredRefreshToken(response.refreshToken);
  return nextSession;
}

async function refreshActiveSession(refreshToken: string) {
  const response = await refreshSession({refreshToken});
  return activateSession(response);
}

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [appReady, setAppReady] = useState(false);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [latestRealtimeMessage, setLatestRealtimeMessage] =
    useState<RealtimeMessageEnvelope | null>(null);
  const [latestRealtimeReaction, setLatestRealtimeReaction] =
    useState<RealtimeReactionEnvelope | null>(null);
  const [latestRealtimeTyping, setLatestRealtimeTyping] =
    useState<RealtimeTypingEnvelope | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(
    'Secure session restore runs through the new mobile refresh endpoint.',
  );
  const sessionRef = useRef<ActiveSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const resetToSignedOutState = useCallback(async (infoMessage: string) => {
    await clearStoredRefreshToken();
    sessionRef.current = null;
    setSession(null);
    setWorkspace(null);
    setActiveChatId(null);
    setRealtimeConnected(false);
    setLatestRealtimeMessage(null);
    setLatestRealtimeReaction(null);
    setLatestRealtimeTyping(null);
    setAuthMode('login');
    setAuthInfo(infoMessage);
    setAuthError(null);
    setWorkspaceError(null);
    setWorkspacePending(false);
  }, []);

  const refreshSessionState = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      throw new ApiError('Session unavailable', 401);
    }

    const refreshedSession = await refreshActiveSession(currentSession.refreshToken);
    sessionRef.current = refreshedSession;
    setSession(refreshedSession);
    return refreshedSession;
  }, []);

  const loadWorkspace = useCallback(
    async (currentSession: ActiveSession) => {
      try {
        return await getWorkspaceBootstrap(currentSession.auth.token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        const refreshedSession = await refreshSessionState();
        return getWorkspaceBootstrap(refreshedSession.auth.token);
      }
    },
    [refreshSessionState],
  );

  const runAuthorized = useCallback<RunAuthorized>(
    async operation => {
      const currentSession = sessionRef.current;
      if (!currentSession) {
        throw new ApiError('Session unavailable', 401);
      }

      try {
        return await operation(currentSession.auth.token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        try {
          const refreshedSession = await refreshSessionState();
          return await operation(refreshedSession.auth.token);
        } catch (refreshError) {
          await resetToSignedOutState('Session expired. Sign in again.');
          throw refreshError;
        }
      }
    },
    [refreshSessionState, resetToSignedOutState],
  );

  const handleChatSummaryChange = useCallback((nextChat: ChatSummary) => {
    setWorkspace(currentWorkspace =>
      currentWorkspace
        ? upsertWorkspaceChat(currentWorkspace, nextChat)
        : currentWorkspace,
    );
  }, []);

  const handleChatRead = useCallback((chatId: string) => {
    setWorkspace(currentWorkspace =>
      currentWorkspace
        ? clearWorkspaceChatUnread(currentWorkspace, chatId)
        : currentWorkspace,
    );
  }, []);

  const persistPendingOutgoingMessage = useCallback(
    async (message: PendingOutgoingMessage) => {
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? upsertWorkspacePendingOutgoingMessage(currentWorkspace, message)
          : currentWorkspace,
      );

      try {
        const persistedMessage = await runAuthorized(token =>
          upsertPendingOutgoingMessage(token, message.clientMessageId, {
            chatId: message.chatId,
            content: message.content,
            createdAt: message.createdAt,
            localOrder: message.localOrder,
            recipientCount: message.recipientCount,
            replyTo: message.replyTo ?? null,
            forwardedFromMessageId: message.forwardedFromMessageId ?? null,
            status: message.status,
            attachments: message.attachments ?? [],
          }),
        );
        setWorkspace(currentWorkspace =>
          currentWorkspace
            ? upsertWorkspacePendingOutgoingMessage(currentWorkspace, persistedMessage)
            : currentWorkspace,
        );
        return persistedMessage;
      } catch (error) {
        throw error;
      }
    },
    [runAuthorized],
  );

  const deletePendingOutgoingMessages = useCallback(
    async (clientMessageIds: string[]) => {
      const normalizedClientMessageIds = clientMessageIds
        .map(clientMessageId => clientMessageId.trim())
        .filter(clientMessageId => clientMessageId.length > 0);

      if (normalizedClientMessageIds.length === 0) {
        return;
      }

      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? removeWorkspacePendingOutgoingMessages(
              currentWorkspace,
              normalizedClientMessageIds,
            )
          : currentWorkspace,
      );

      await Promise.all(
        normalizedClientMessageIds.map(clientMessageId =>
          runAuthorized(token =>
            deletePendingOutgoingMessage(token, clientMessageId),
          ).catch(() => undefined),
        ),
      );
    },
    [runAuthorized],
  );

  const persistRecoveredPendingOutgoingFailures = useCallback(
    (messages: PendingOutgoingMessage[]) => {
      messages.forEach(message => {
        persistPendingOutgoingMessage(message).catch(() => undefined);
      });
    },
    [persistPendingOutgoingMessage],
  );

  const handleRealtimeAuthFailure = useCallback(async () => {
    try {
      await refreshSessionState();
    } catch {
      await resetToSignedOutState('Session expired. Sign in again.');
    }
  }, [refreshSessionState, resetToSignedOutState]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const refreshToken = await loadStoredRefreshToken();
      if (!refreshToken) {
        if (!cancelled) {
          setAppReady(true);
        }
        return;
      }

      try {
        const nextSession = await refreshActiveSession(refreshToken);
        if (cancelled) {
          return;
        }

        sessionRef.current = nextSession;
        setSession(nextSession);

        try {
          const bootstrap = await loadWorkspace(nextSession);
          if (cancelled) {
            return;
          }
          const preparedWorkspace =
            normalizeBootstrappedPendingOutgoingMessages(bootstrap);
          setWorkspace(preparedWorkspace.workspace);
          persistRecoveredPendingOutgoingFailures(
            preparedWorkspace.recoveredFailedMessages,
          );
          setAuthInfo('Session restored from secure storage.');
        } catch (workspaceLoadError) {
          if (cancelled) {
            return;
          }
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo('Session restored. Workspace sync needs retry.');
        }
      } catch (error) {
        await clearStoredRefreshToken();
        if (cancelled) {
          return;
        }

        sessionRef.current = null;
        setSession(null);
        setWorkspace(null);
        setAuthError(describeError(error));
      } finally {
        if (!cancelled) {
          setAppReady(true);
        }
      }
    };

    restore().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [loadWorkspace, persistRecoveredPendingOutgoingFailures]);

  const realtimeSessionToken = session?.auth.token ?? null;
  const realtimeSessionUserId = session?.auth.user.id ?? null;
  const realtimeSessionId = session?.auth.sessionId ?? null;
  const workspaceReady = workspace !== null;
  const typingSubscriptionChatIds = activeChatId ? [activeChatId] : [];
  const typingSubscriptionChatIdsKey = typingSubscriptionChatIds.join('|');

  useEffect(() => {
    if (
      !realtimeSessionToken ||
      !realtimeSessionUserId ||
      !realtimeSessionId ||
      !workspaceReady
    ) {
      setRealtimeConnected(false);
      return;
    }

    const unsubscribe = subscribeToChats({
      chatIds: [],
      token: realtimeSessionToken,
      currentUserId: realtimeSessionUserId,
      onChat: handleChatSummaryChange,
      onMessage: message => {
        setLatestRealtimeMessage({
          message,
          receivedAt: Date.now(),
        });
      },
      onMessageReaction: event => {
        setLatestRealtimeReaction({
          event,
          receivedAt: Date.now(),
        });
      },
      onTyping: event => {
        setLatestRealtimeTyping({
          event,
          receivedAt: Date.now(),
        });
      },
      onSessionEvent: event => {
        if (event.type === 'SESSION_REVOKED' && event.sessionId === realtimeSessionId) {
          resetToSignedOutState('Session revoked. Sign in again.').catch(
            () => undefined,
          );
        }
      },
      onAuthFailure: () => {
        handleRealtimeAuthFailure().catch(() => undefined);
      },
      onConnectionChange: setRealtimeConnected,
    });

    return () => {
      unsubscribe();
      setRealtimeConnected(false);
    };
  }, [
    handleChatSummaryChange,
    handleRealtimeAuthFailure,
    realtimeSessionId,
    realtimeSessionToken,
    realtimeSessionUserId,
    resetToSignedOutState,
    workspaceReady,
  ]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    replaceSubscribedChatIds(
      typingSubscriptionChatIdsKey
        ? typingSubscriptionChatIdsKey.split('|')
        : [],
    );
  }, [typingSubscriptionChatIdsKey, workspaceReady]);

  const handleLogin = useCallback(
    async (input: {username: string; password: string}) => {
      setAuthPending(true);
      setAuthError(null);
      setWorkspaceError(null);
      setAuthInfo(null);

      try {
        const activeSession = await activateSession(await login(input));
        sessionRef.current = activeSession;
        setSession(activeSession);
        setActiveChatId(null);

        try {
          const bootstrap = await loadWorkspace(activeSession);
          const preparedWorkspace =
            normalizeBootstrappedPendingOutgoingMessages(bootstrap);
          setWorkspace(preparedWorkspace.workspace);
          persistRecoveredPendingOutgoingFailures(
            preparedWorkspace.recoveredFailedMessages,
          );
          setAuthInfo('Login succeeded.');
        } catch (workspaceLoadError) {
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo('Login succeeded. Workspace sync needs retry.');
        }
      } catch (error) {
        sessionRef.current = null;
        setSession(null);
        setWorkspace(null);
        setAuthError(describeError(error));
      } finally {
        setAuthPending(false);
        setAppReady(true);
      }
    },
    [loadWorkspace, persistRecoveredPendingOutgoingFailures],
  );

  const handleRegister = useCallback(
    async (input: {
      username: string;
      email: string;
      displayName: string;
      password: string;
    }) => {
      setAuthPending(true);
      setAuthError(null);
      setWorkspaceError(null);
      setAuthInfo(null);

      try {
        const activeSession = await activateSession(await register(input));
        sessionRef.current = activeSession;
        setSession(activeSession);
        setActiveChatId(null);

        try {
          const bootstrap = await loadWorkspace(activeSession);
          const preparedWorkspace =
            normalizeBootstrappedPendingOutgoingMessages(bootstrap);
          setWorkspace(preparedWorkspace.workspace);
          persistRecoveredPendingOutgoingFailures(
            preparedWorkspace.recoveredFailedMessages,
          );
          setAuthInfo('Account created and session established.');
        } catch (workspaceLoadError) {
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo('Account created. Workspace sync needs retry.');
        }
      } catch (error) {
        sessionRef.current = null;
        setSession(null);
        setWorkspace(null);
        setAuthError(describeError(error));
      } finally {
        setAuthPending(false);
        setAppReady(true);
      }
    },
    [loadWorkspace, persistRecoveredPendingOutgoingFailures],
  );

  const handleReloadWorkspace = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      return;
    }

    setWorkspacePending(true);
    setWorkspaceError(null);

    try {
      const bootstrap = await runAuthorized(token =>
        getWorkspaceBootstrap(token),
      );
      const preparedWorkspace =
        normalizeBootstrappedPendingOutgoingMessages(bootstrap);
      setWorkspace(preparedWorkspace.workspace);
      persistRecoveredPendingOutgoingFailures(
        preparedWorkspace.recoveredFailedMessages,
      );
    } catch (error) {
      setWorkspaceError(describeError(error));
    } finally {
      setWorkspacePending(false);
    }
  }, [persistRecoveredPendingOutgoingFailures, runAuthorized]);

  const handleLogout = useCallback(async () => {
    const refreshToken =
      sessionRef.current?.refreshToken ?? (await loadStoredRefreshToken());

    try {
      if (refreshToken) {
        await logout({refreshToken});
      }
    } catch {
      // Local session clearing should still win if remote logout fails.
    } finally {
      await resetToSignedOutState('Signed out on this device.');
    }
  }, [resetToSignedOutState]);

  const handleOpenChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

  const handleStartDirectChat = useCallback(
    async (username: string) => {
      const chat = await runAuthorized(token => createDirectChat(token, username));
      setWorkspace(currentWorkspace =>
        currentWorkspace ? upsertWorkspaceChat(currentWorkspace, chat) : currentWorkspace,
      );
      setActiveChatId(chat.id);
      return chat;
    },
    [runAuthorized],
  );

  const handleAddContact = useCallback(
    async (username: string) => {
      const profile = await runAuthorized(token => addContact(token, username));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? applyWorkspaceContact(currentWorkspace, profile)
          : currentWorkspace,
      );
      return profile;
    },
    [runAuthorized],
  );

  const handleRemoveContact = useCallback(
    async (username: string) => {
      await runAuthorized(token => removeContact(token, username));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? removeWorkspaceContact(currentWorkspace, username)
          : currentWorkspace,
      );
    },
    [runAuthorized],
  );

  const handleSearchWorkspace = useCallback(
    async (query: string) => runAuthorized(token => searchWorkspace(token, query)),
    [runAuthorized],
  );

  const handleArchiveChat = useCallback(
    async (chatId: string, archived: boolean) => {
      await runAuthorized(token => updateArchivedChat(token, chatId, archived));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? updateWorkspaceArchivedChatState(currentWorkspace, chatId, archived)
          : currentWorkspace,
      );
    },
    [runAuthorized],
  );

  const handleBlockUser = useCallback(
    async (username: string) => {
      const blockedProfile = await runAuthorized(token => blockUser(token, username));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? applyWorkspaceBlockedUser(currentWorkspace, blockedProfile)
          : currentWorkspace,
      );
      return blockedProfile;
    },
    [runAuthorized],
  );

  const handleUnblockUser = useCallback(
    async (username: string) => {
      await runAuthorized(token => unblockUser(token, username));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? removeWorkspaceBlockedUser(currentWorkspace, username)
          : currentWorkspace,
      );
    },
    [runAuthorized],
  );

  const handleBackToWorkspace = useCallback(() => {
    setActiveChatId(null);
  }, []);

  const activeChat =
    workspace?.chats.find(chat => chat.id === activeChatId) ?? null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {!appReady ? (
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#2c5c53" />
          <Text style={styles.loadingLabel}>Restoring secure session...</Text>
        </View>
      ) : session && workspace && activeChatId ? (
        <ChatThreadScreen
          session={session.auth}
          chatId={activeChatId}
          initialChat={activeChat}
          availableChats={workspace.chats}
          pendingOutgoingMessages={
            workspace.pendingOutgoingMessages.filter(
              message => message.chatId === activeChatId,
            )
          }
          realtimeConnected={realtimeConnected}
          realtimeMessage={latestRealtimeMessage}
          realtimeReaction={latestRealtimeReaction}
          realtimeTyping={latestRealtimeTyping}
          runAuthorized={runAuthorized}
          onBack={handleBackToWorkspace}
          onOpenChat={handleOpenChat}
          onChatSummaryChange={handleChatSummaryChange}
          onChatRead={handleChatRead}
          onPersistPendingOutgoingMessage={persistPendingOutgoingMessage}
          onDeletePendingOutgoingMessages={deletePendingOutgoingMessages}
        />
      ) : session && workspace ? (
        <WorkspaceHomeScreen
          session={session.auth}
          workspace={workspace}
          loading={workspacePending}
          error={workspaceError}
          onReload={handleReloadWorkspace}
          onLogout={handleLogout}
          onOpenChat={handleOpenChat}
          onStartDirectChat={handleStartDirectChat}
          onAddContact={handleAddContact}
          onRemoveContact={handleRemoveContact}
          onSearchWorkspace={handleSearchWorkspace}
          onArchiveChat={handleArchiveChat}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
        />
      ) : session ? (
        <WorkspaceRecoveryScreen
          loading={workspacePending}
          error={workspaceError}
          onRetry={handleReloadWorkspace}
          onLogout={handleLogout}
        />
      ) : (
        <AuthScreen
          mode={authMode}
          pending={authPending}
          error={authError}
          info={authInfo}
          onModeChange={setAuthMode}
          onLogin={handleLogin}
          onRegister={handleRegister}
        />
      )}
    </SafeAreaProvider>
  );
}

type WorkspaceRecoveryScreenProps = {
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
};

function WorkspaceRecoveryScreen({
  loading,
  error,
  onRetry,
  onLogout,
}: WorkspaceRecoveryScreenProps) {
  return (
    <View style={styles.recoveryScreen}>
      <View style={styles.recoveryCard}>
        <Text style={styles.recoveryEyebrow}>Workspace sync</Text>
        <Text style={styles.recoveryTitle}>Session is active</Text>
        <Text style={styles.recoveryCopy}>
          Mobile auth succeeded, but the workspace bootstrap still needs a clean
          retry.
        </Text>
        {error ? <Text style={styles.recoveryError}>{error}</Text> : null}
        <Pressable
          onPress={onRetry}
          disabled={loading}
          style={loading ? styles.recoveryPrimaryDisabled : styles.recoveryPrimary}>
          <Text style={styles.recoveryPrimaryLabel}>
            {loading ? 'Retrying...' : 'Retry workspace sync'}
          </Text>
        </Pressable>
        <Pressable onPress={onLogout} style={styles.recoveryGhost}>
          <Text style={styles.recoveryGhostLabel}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

function upsertWorkspaceChat(
  workspace: WorkspaceBootstrap,
  nextChat: ChatSummary,
): WorkspaceBootstrap {
  const existingIndex = workspace.chats.findIndex(chat => chat.id === nextChat.id);
  if (existingIndex === -1) {
    return {
      ...workspace,
      chats: [nextChat, ...workspace.chats],
    };
  }

  const nextChats = [...workspace.chats];
  nextChats[existingIndex] = nextChat;
  return {
    ...workspace,
    chats: nextChats,
  };
}

function clearWorkspaceChatUnread(
  workspace: WorkspaceBootstrap,
  chatId: string,
): WorkspaceBootstrap {
  return {
    ...workspace,
    chats: workspace.chats.map(chat =>
      chat.id === chatId ? {...chat, unreadCount: 0} : chat,
    ),
  };
}

function applyWorkspaceContact(
  workspace: WorkspaceBootstrap,
  profile: UserProfile,
): WorkspaceBootstrap {
  return {
    ...workspace,
    contacts: [
      profile,
      ...workspace.contacts.filter(contact => contact.id !== profile.id),
    ],
  };
}

function removeWorkspaceContact(
  workspace: WorkspaceBootstrap,
  username: string,
): WorkspaceBootstrap {
  const normalizedUsername = username.trim().toLowerCase();
  return {
    ...workspace,
    contacts: workspace.contacts.filter(
      contact => contact.username.trim().toLowerCase() !== normalizedUsername,
    ),
  };
}

function updateWorkspaceArchivedChatState(
  workspace: WorkspaceBootstrap,
  chatId: string,
  archived: boolean,
): WorkspaceBootstrap {
  const archivedChatIds = new Set(workspace.archivedChatIds);
  if (archived) {
    archivedChatIds.add(chatId);
  } else {
    archivedChatIds.delete(chatId);
  }

  return {
    ...workspace,
    archivedChatIds: [...archivedChatIds],
  };
}

function applyWorkspaceBlockedUser(
  workspace: WorkspaceBootstrap,
  blockedProfile: UserProfile,
): WorkspaceBootstrap {
  const blockedUsers = [
    blockedProfile,
    ...workspace.blockedUsers.filter(user => user.id !== blockedProfile.id),
  ];

  return {
    ...workspace,
    contacts: workspace.contacts.filter(user => user.id !== blockedProfile.id),
    blockedUsers,
  };
}

function removeWorkspaceBlockedUser(
  workspace: WorkspaceBootstrap,
  username: string,
): WorkspaceBootstrap {
  const normalizedUsername = username.trim().toLowerCase();
  return {
    ...workspace,
    blockedUsers: workspace.blockedUsers.filter(
      user => user.username.trim().toLowerCase() !== normalizedUsername,
    ),
  };
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#f3efe7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingLabel: {
    color: '#4f463c',
    fontSize: 15,
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: '#f3efe7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  recoveryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fffaf1',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e0d3bf',
    padding: 22,
    gap: 14,
  },
  recoveryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#8a5a2b',
  },
  recoveryTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f1a14',
  },
  recoveryCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4f463c',
  },
  recoveryError: {
    color: '#8b221c',
    backgroundColor: '#f8dfdb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  recoveryPrimary: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c5c53',
  },
  recoveryPrimaryDisabled: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9aa8a3',
  },
  recoveryPrimaryLabel: {
    color: '#fffaf1',
    fontSize: 15,
    fontWeight: '800',
  },
  recoveryGhost: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe4d3',
  },
  recoveryGhostLabel: {
    color: '#5b4b3c',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default App;
