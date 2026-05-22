import type {
  AuthResponse,
  ChatMessage,
  MessageReactionEvent,
  TypingEvent,
  ChatSummary,
  MobileAuthResponse,
  PendingOutgoingMessage,
  UserProfile,
  VideoConference,
  WorkspaceBootstrap,
} from '@north/shared';
import {Component, useCallback, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {SoundPlayer, type SoundPlayerHandle} from './src/lib/SoundPlayer';
import {
  ActivityIndicator,
  AppState,
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
import {ConferenceDetailScreen} from './src/features/conference/ConferenceDetailScreen';
import {WorkspaceHomeScreen} from './src/features/workspace/WorkspaceHomeScreen';
import {
  addContact,
  ApiError,
  blockUser,
  changeUsername,
  requestEmailChange,
  cancelVideoConference,
  clearConferencePresence,
  createConference,
  createConferenceInviteLink,
  createDirectChat,
  deleteChatForSelf,
  describeError,
  deletePendingOutgoingMessage,
  endVideoConference,
  updateAvatar,
  updateProfile,
  getWorkspaceBootstrap,
  leaveChatGroup,
  login,
  logout,
  removeContact,
  refreshSession,
  resendOwnEmailVerification,
  register,
  searchWorkspace,
  startVideoConference,
  touchConferencePresence,
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
import {androidTheme} from './src/theme';

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
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
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
  const soundPlayerRef = useRef<SoundPlayerHandle>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!latestRealtimeMessage) return;
    const {message} = latestRealtimeMessage;
    if (message.sender.id !== sessionRef.current?.auth.user.id) {
      soundPlayerRef.current?.playIcq();
    }
  }, [latestRealtimeMessage]);

  const resetToSignedOutState = useCallback(async (infoMessage: string) => {
    await clearStoredRefreshToken();
    sessionRef.current = null;
    setSession(null);
    setWorkspace(null);
    setActiveChatId(null);
    setActiveConferenceId(null);
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
        setActiveConferenceId(null);

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
        setActiveConferenceId(null);

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

  const lastWorkspaceRefreshRef = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastWorkspaceRefreshRef.current < 30_000) return;
      lastWorkspaceRefreshRef.current = now;
      if (sessionRef.current && workspace) {
        handleReloadWorkspace().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [handleReloadWorkspace, workspace]);

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
    setActiveConferenceId(null);
    setActiveChatId(chatId);
  }, []);

  const handleOpenConference = useCallback((conferenceId: string) => {
    setActiveChatId(null);
    setActiveConferenceId(conferenceId);
  }, []);

  const handleStartConference = useCallback(
    async (conferenceId: string) => {
      const conference = await runAuthorized(token =>
        startVideoConference(token, conferenceId),
      );
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? upsertWorkspaceConference(currentWorkspace, conference)
          : currentWorkspace,
      );
      return conference;
    },
    [runAuthorized],
  );

  const handleScheduleConference = useCallback(
    async (title: string, scheduledAt: string, participantUsernames?: string[]) => {
      const conference = await runAuthorized(token =>
        createConference(token, {title, scheduledAt, participantUsernames}),
      );
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? upsertWorkspaceConference(currentWorkspace, conference)
          : currentWorkspace,
      );
      return conference;
    },
    [runAuthorized],
  );

  const handleStartNewConference = useCallback(
    async (title: string, participantUsernames?: string[]) => {
      const conference = await runAuthorized(token =>
        createConference(token, {title, scheduledAt: new Date().toISOString(), participantUsernames}),
      );
      const started = await runAuthorized(token =>
        startVideoConference(token, conference.id),
      );
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? upsertWorkspaceConference(currentWorkspace, started)
          : currentWorkspace,
      );
      setActiveConferenceId(started.id);
      return started;
    },
    [runAuthorized],
  );

  const handleEndConference = useCallback(
    async (conferenceId: string) => {
      const conference = await runAuthorized(token =>
        endVideoConference(token, conferenceId),
      );
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? upsertWorkspaceConference(currentWorkspace, conference)
          : currentWorkspace,
      );
      return conference;
    },
    [runAuthorized],
  );

  const handleCancelConference = useCallback(
    async (conferenceId: string) => {
      await runAuthorized(token => cancelVideoConference(token, conferenceId));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? removeWorkspaceConference(currentWorkspace, conferenceId)
          : currentWorkspace,
      );
      setActiveConferenceId(currentId =>
        currentId === conferenceId ? null : currentId,
      );
    },
    [runAuthorized],
  );

  const handleCreateConferenceInviteLink = useCallback(
    (conferenceId: string, options?: {refresh?: boolean}) =>
      runAuthorized(token =>
        createConferenceInviteLink(token, conferenceId, options),
      ),
    [runAuthorized],
  );

  const handleTouchConferencePresence = useCallback(
    async (conferenceId: string) => {
      await runAuthorized(token => touchConferencePresence(token, conferenceId));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? patchWorkspaceConferencePresence(
              currentWorkspace,
              conferenceId,
              sessionRef.current?.auth.user.id ?? null,
              true,
            )
          : currentWorkspace,
      );
    },
    [runAuthorized],
  );

  const handleClearConferencePresence = useCallback(
    async (conferenceId: string) => {
      await runAuthorized(token => clearConferencePresence(token, conferenceId));
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? patchWorkspaceConferencePresence(
              currentWorkspace,
              conferenceId,
              sessionRef.current?.auth.user.id ?? null,
              false,
            )
          : currentWorkspace,
      );
    },
    [runAuthorized],
  );

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

  const handleDeleteChat = useCallback(
    async (chatId: string, isDirect: boolean) => {
      if (isDirect) {
        await runAuthorized(token => deleteChatForSelf(token, chatId));
      } else {
        await runAuthorized(token => leaveChatGroup(token, chatId));
      }
      setWorkspace(currentWorkspace =>
        currentWorkspace
          ? removeWorkspaceChat(currentWorkspace, chatId)
          : currentWorkspace,
      );
      setActiveChatId(currentId => (currentId === chatId ? null : currentId));
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
    setActiveConferenceId(null);
  }, []);

  const handleResendOwnEmailVerification = useCallback(
    async () => {
      await runAuthorized(token => resendOwnEmailVerification(token));
    },
    [runAuthorized],
  );

  const handleChangeUsername = useCallback(
    async (newUsername: string) => {
      const response = await runAuthorized(token => changeUsername(token, newUsername));
      const nextSession = await activateSession(response);
      setSession(nextSession);
    },
    [runAuthorized],
  );

  const handleRequestEmailChange = useCallback(
    async (newEmail: string) => {
      await runAuthorized(token => requestEmailChange(token, newEmail));
    },
    [runAuthorized],
  );

  const handleUpdateAvatar = useCallback(
    async (dataUri: string) => {
      const updatedProfile = await runAuthorized(token =>
        updateAvatar(token, dataUri),
      );
      setSession(current => {
        if (!current) return current;
        return {
          ...current,
          auth: {...current.auth, user: updatedProfile},
        };
      });
    },
    [runAuthorized],
  );

  const handleUpdateProfile = useCallback(
    async (input: {displayName: string; profession?: string | null}) => {
      const updatedProfile = await runAuthorized(token =>
        updateProfile(token, input),
      );
      setSession(current => {
        if (!current) return current;
        return {
          ...current,
          auth: {...current.auth, user: updatedProfile},
        };
      });
    },
    [runAuthorized],
  );

  const activeChat =
    workspace?.chats.find(chat => chat.id === activeChatId) ?? null;
  const activeConference =
    workspace?.conferences.find(conference => conference.id === activeConferenceId) ??
    workspace?.archivedConferences.find(
      conference => conference.id === activeConferenceId,
    ) ??
    null;

  return (
    <SafeAreaProvider>
      <SoundPlayer ref={soundPlayerRef} />
      <StatusBar barStyle="light-content" />
      {!appReady ? (
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={androidTheme.colors.blue} />
          <Text style={styles.loadingLabel}>Restoring secure session...</Text>
        </View>
      ) : session && workspace && activeConferenceId && activeConference ? (
        <ConferenceDetailScreen
          session={session.auth}
          conference={activeConference}
          onBack={handleBackToWorkspace}
          onOpenChat={handleOpenChat}
          onStartConference={handleStartConference}
          onEndConference={handleEndConference}
          onCancelConference={handleCancelConference}
          onCreateConferenceInviteLink={handleCreateConferenceInviteLink}
          onTouchConferencePresence={handleTouchConferencePresence}
          onClearConferencePresence={handleClearConferencePresence}
        />
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
          error={workspaceError}
          onLogout={handleLogout}
          onOpenChat={handleOpenChat}
          onOpenConference={handleOpenConference}
          onStartDirectChat={handleStartDirectChat}
          onAddContact={handleAddContact}
          onRemoveContact={handleRemoveContact}
          onSearchWorkspace={handleSearchWorkspace}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
          onResendEmailVerification={handleResendOwnEmailVerification}
          onRequestEmailChange={handleRequestEmailChange}
          onChangeUsername={handleChangeUsername}
          onUpdateAvatar={handleUpdateAvatar}
          onUpdateProfile={handleUpdateProfile}
          onRefreshWorkspace={handleReloadWorkspace}
          onScheduleConference={handleScheduleConference}
          onStartNewConference={handleStartNewConference}
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

function removeWorkspaceChat(
  workspace: WorkspaceBootstrap,
  chatId: string,
): WorkspaceBootstrap {
  return {
    ...workspace,
    chats: workspace.chats.filter(chat => chat.id !== chatId),
    archivedChatIds: workspace.archivedChatIds.filter(id => id !== chatId),
  };
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

function upsertWorkspaceConference(
  workspace: WorkspaceBootstrap,
  conference: VideoConference,
): WorkspaceBootstrap {
  const targetKey = conference.endedAt ? 'archivedConferences' : 'conferences';
  const sourceKey = conference.endedAt ? 'conferences' : 'archivedConferences';

  return {
    ...workspace,
    [sourceKey]: workspace[sourceKey].filter(item => item.id !== conference.id),
    [targetKey]: [
      conference,
      ...workspace[targetKey].filter(item => item.id !== conference.id),
    ].sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)),
  };
}

function removeWorkspaceConference(
  workspace: WorkspaceBootstrap,
  conferenceId: string,
): WorkspaceBootstrap {
  return {
    ...workspace,
    conferences: workspace.conferences.filter(
      conference => conference.id !== conferenceId,
    ),
    archivedConferences: workspace.archivedConferences.filter(
      conference => conference.id !== conferenceId,
    ),
  };
}

function patchWorkspaceConferencePresence(
  workspace: WorkspaceBootstrap,
  conferenceId: string,
  userId: string | null,
  present: boolean,
): WorkspaceBootstrap {
  if (!userId) {
    return workspace;
  }

  const patchConference = (conference: VideoConference) => {
    if (conference.id !== conferenceId) {
      return conference;
    }

    const activeParticipantUserIds = new Set(conference.activeParticipantUserIds);
    if (present) {
      activeParticipantUserIds.add(userId);
    } else {
      activeParticipantUserIds.delete(userId);
    }

    return {
      ...conference,
      activeParticipantUserIds: [...activeParticipantUserIds],
      activeParticipantCount: activeParticipantUserIds.size,
    };
  };

  return {
    ...workspace,
    conferences: workspace.conferences.map(patchConference),
    archivedConferences: workspace.archivedConferences.map(patchConference),
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

type ErrorBoundaryState = {hasError: boolean; message: string};

class AppErrorBoundary extends Component<
  {children: ReactNode},
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {hasError: false, message: ''};

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'Unexpected error';
    return {hasError: true, message};
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorBoundaryStyles.screen}>
          <Text style={errorBoundaryStyles.title}>Что-то пошло не так</Text>
          <Text style={errorBoundaryStyles.body}>{this.state.message}</Text>
          <Pressable
            style={errorBoundaryStyles.button}
            onPress={() => this.setState({hasError: false, message: ''})}>
            <Text style={errorBoundaryStyles.buttonLabel}>Попробовать снова</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorBoundaryStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f1720',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#eef4fb',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: 'rgba(238, 244, 251, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#4ea1ff',
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#081521',
  },
});

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingLabel: {
    color: androidTheme.colors.textSecondary,
    fontSize: 15,
  },
  recoveryScreen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  recoveryCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: androidTheme.radius.cardLarge,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    padding: 22,
    gap: 14,
    ...androidTheme.shadow,
  },
  recoveryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: androidTheme.colors.warm,
  },
  recoveryTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  recoveryCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: androidTheme.colors.textSecondary,
  },
  recoveryError: {
    color: androidTheme.colors.danger,
    backgroundColor: androidTheme.colors.dangerSoft,
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
    backgroundColor: androidTheme.colors.blueStrong,
  },
  recoveryPrimaryDisabled: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(95, 156, 255, 0.32)',
  },
  recoveryPrimaryLabel: {
    color: androidTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  recoveryGhost: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  recoveryGhostLabel: {
    color: androidTheme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
});

function AppWithBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default AppWithBoundary;
