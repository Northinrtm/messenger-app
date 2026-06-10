import type {
  AuthResponse,
  ChatMessage,
  MessageReactionEvent,
  MessageStatusEvent,
  TypingEvent,
  ChatSummary,
  MobileAuthResponse,
  PendingOutgoingMessage,
  UserProfile,
  VideoConference,
  WorkspaceBootstrap,
} from '@north/shared';
import React, {Component, useCallback, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {SoundPlayer, type SoundPlayerHandle} from './src/lib/SoundPlayer';
import {
  ActivityIndicator,
  AppState,
  Modal,
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
  listSessions,
  login,
  logout,
  removeContact,
  refreshSession,
  resendOwnEmailVerification,
  register,
  revokeSession,
  searchWorkspace,
  startVideoConference,
  touchConferencePresence,
  toAuthResponse,
  unblockUser,
  updateArchivedChat,
  upsertPendingOutgoingMessage,
} from './src/lib/api';
import {
  type AppPreferences,
  type FontSize,
  loadPreferences,
  saveFontSize,
  saveChatBackground,
  saveNotificationsEnabled,
  saveMutedChatIds,
  saveSilentChatIds,
} from './src/lib/appPreferences';
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
import {
  cleanupFcmForSession,
  getInitialNotificationChatId,
  getInitialNotificationConferenceId,
  initFcmForSession,
  setupFcmForegroundHandler,
  setupFcmNotificationOpenedHandler,
} from './src/lib/fcm';
import {androidTheme} from './src/theme';
import {I18nProvider, useI18n} from './src/i18n/I18nProvider';
import {tActive} from './src/i18n';

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

type RealtimeStatusEnvelope = {
  event: MessageStatusEvent;
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

function startFcmSession(
  session: ActiveSession,
  sessionRef: React.RefObject<ActiveSession | null>,
  fcmCleanupRef: React.RefObject<(() => void) | null>,
) {
  fcmCleanupRef.current?.();
  const unsubscribe = initFcmForSession(
    session.auth.token,
    () => sessionRef.current?.auth.token ?? session.auth.token,
  );
  fcmCleanupRef.current = unsubscribe;
}

async function refreshActiveSession(refreshToken: string) {
  const response = await refreshSession({refreshToken});
  return activateSession(response);
}

function App() {
  const {t} = useI18n();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [appReady, setAppReady] = useState(false);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<VideoConference | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [latestRealtimeMessage, setLatestRealtimeMessage] =
    useState<RealtimeMessageEnvelope | null>(null);
  const [latestRealtimeReaction, setLatestRealtimeReaction] =
    useState<RealtimeReactionEnvelope | null>(null);
  const [latestRealtimeTyping, setLatestRealtimeTyping] =
    useState<RealtimeTypingEnvelope | null>(null);
  const [latestRealtimeStatus, setLatestRealtimeStatus] =
    useState<RealtimeStatusEnvelope | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(
    tActive('app.info.secureRestore'),
  );
  const [preferences, setPreferences] = useState<AppPreferences>({
    fontSize: 'medium',
    chatBackground: '#0f1720',
    notificationsEnabled: true,
    mutedChatIds: [],
    silentChatIds: [],
  });
  const sessionRef = useRef<ActiveSession | null>(null);
  const preferencesRef = useRef<AppPreferences>(preferences);
  const soundPlayerRef = useRef<SoundPlayerHandle>(null);
  const fcmCleanupRef = useRef<(() => void) | null>(null);
  /**
   * chatId stored when a notification tap launches the app before the workspace
   * is loaded (killed-state or background-with-JS-recycled). Cleared once the
   * workspace becomes available and the chat is opened.
   */
  const pendingNotificationChatIdRef = useRef<string | null>(null);
  const pendingNotificationConferenceIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (!latestRealtimeMessage) return;
    const {message} = latestRealtimeMessage;
    if (message.sender.id === sessionRef.current?.auth.user.id) {
      return;
    }
    const prefs = preferencesRef.current;
    // Respect global notification toggle and per-chat mute/silent prefs
    if (!prefs.notificationsEnabled) {
      return;
    }
    const chatId = message.chatId;
    if (prefs.mutedChatIds.includes(chatId) || prefs.silentChatIds.includes(chatId)) {
      return;
    }
    soundPlayerRef.current?.playIcq();
  }, [latestRealtimeMessage]);

  // Loop the ringtone while an incoming call is being shown.
  useEffect(() => {
    if (!incomingCall) {
      return;
    }
    soundPlayerRef.current?.playRing();
    const intervalId = setInterval(() => {
      soundPlayerRef.current?.playRing();
    }, 3_000);
    return () => clearInterval(intervalId);
  }, [incomingCall]);

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
    setLatestRealtimeStatus(null);
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
          await resetToSignedOutState(tActive('app.info.sessionExpired'));
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
      await resetToSignedOutState(tActive('app.info.sessionExpired'));
    }
  }, [refreshSessionState, resetToSignedOutState]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const [refreshToken, savedPrefs, initialNotifChatId, initialNotifConferenceId] =
        await Promise.all([
          loadStoredRefreshToken(),
          loadPreferences(),
          getInitialNotificationChatId(),
          getInitialNotificationConferenceId(),
        ]);
      if (initialNotifChatId) {
        pendingNotificationChatIdRef.current = initialNotifChatId;
      }
      if (initialNotifConferenceId) {
        pendingNotificationConferenceIdRef.current = initialNotifConferenceId;
      }
      if (!cancelled) {
        setPreferences(savedPrefs);
        preferencesRef.current = savedPrefs;
      }
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
        if (savedPrefs.notificationsEnabled) {
          startFcmSession(nextSession, sessionRef, fcmCleanupRef);
        }

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
          setAuthInfo(tActive('app.info.sessionRestored'));
        } catch (workspaceLoadError) {
          if (cancelled) {
            return;
          }
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo(tActive('app.info.sessionRestoredRetry'));
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

  useEffect(() => {
    if (!session) return;
    const unsubscribe = setupFcmForegroundHandler(_chatId => {
      // App is in foreground — realtime WebSocket delivers the message directly,
      // so no separate in-app notification is needed here.
    });
    return unsubscribe;
  }, [session]);

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
      onMessageStatus: event => {
        setLatestRealtimeStatus({
          event,
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
          resetToSignedOutState(tActive('app.info.sessionRevoked')).catch(
            () => undefined,
          );
        }
      },
      onIncomingCall: conference => {
        if (
          conference.createdBy.id === realtimeSessionUserId ||
          conference.endedAt
        ) {
          return;
        }
        setWorkspace(currentWorkspace =>
          currentWorkspace
            ? upsertWorkspaceConference(currentWorkspace, conference)
            : currentWorkspace,
        );
        setIncomingCall(conference);
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
        if (preferencesRef.current.notificationsEnabled) {
          startFcmSession(activeSession, sessionRef, fcmCleanupRef);
        }

        try {
          const bootstrap = await loadWorkspace(activeSession);
          const preparedWorkspace =
            normalizeBootstrappedPendingOutgoingMessages(bootstrap);
          setWorkspace(preparedWorkspace.workspace);
          persistRecoveredPendingOutgoingFailures(
            preparedWorkspace.recoveredFailedMessages,
          );
          setAuthInfo(tActive('app.info.loginSucceeded'));
        } catch (workspaceLoadError) {
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo(tActive('app.info.loginSucceededRetry'));
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
        if (preferencesRef.current.notificationsEnabled) {
          startFcmSession(activeSession, sessionRef, fcmCleanupRef);
        }

        try {
          const bootstrap = await loadWorkspace(activeSession);
          const preparedWorkspace =
            normalizeBootstrappedPendingOutgoingMessages(bootstrap);
          setWorkspace(preparedWorkspace.workspace);
          persistRecoveredPendingOutgoingFailures(
            preparedWorkspace.recoveredFailedMessages,
          );
          setAuthInfo(tActive('app.info.accountCreated'));
        } catch (workspaceLoadError) {
          setWorkspace(null);
          setWorkspaceError(describeError(workspaceLoadError));
          setAuthInfo(tActive('app.info.accountCreatedRetry'));
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

  const lastForegroundRefreshRef = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 30_000) return;
      lastForegroundRefreshRef.current = now;
      if (sessionRef.current && workspace) {
        refreshSessionState()
          .then(() => handleReloadWorkspace())
          .catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [handleReloadWorkspace, refreshSessionState, workspace]);

  const handleLogout = useCallback(async () => {
    const currentSession = sessionRef.current;
    const refreshToken =
      currentSession?.refreshToken ?? (await loadStoredRefreshToken());

    if (currentSession) {
      cleanupFcmForSession(currentSession.auth.token).catch(() => undefined);
      fcmCleanupRef.current?.();
      fcmCleanupRef.current = null;
    }

    try {
      if (refreshToken) {
        await logout({refreshToken});
      }
    } catch {
      // Local session clearing should still win if remote logout fails.
    } finally {
      await resetToSignedOutState(tActive('app.info.signedOut'));
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

  // Open a pending notification chat as soon as the workspace is available.
  // This covers two cases:
  //   1. Killed state: getInitialNotificationChatId set the ref during restore.
  //   2. Background tap racing with JS reinit: onNotificationOpenedApp set the
  //      ref before the workspace finished loading.
  useEffect(() => {
    if (!workspace) return;
    const pendingChatId = pendingNotificationChatIdRef.current;
    if (pendingChatId) {
      pendingNotificationChatIdRef.current = null;
      handleOpenChat(pendingChatId);
      return;
    }
    const pendingConferenceId = pendingNotificationConferenceIdRef.current;
    if (pendingConferenceId) {
      pendingNotificationConferenceIdRef.current = null;
      handleOpenConference(pendingConferenceId);
    }
  }, [workspace, handleOpenChat, handleOpenConference]);

  // Background tap handler: app was suspended (not killed), user tapped the
  // notification. Workspace is already loaded in the normal case; the pending
  // ref guards the rare edge case where the JS thread was recycled.
  useEffect(() => {
    const unsubscribe = setupFcmNotificationOpenedHandler(
      chatId => {
        if (workspace) {
          handleOpenChat(chatId);
        } else {
          pendingNotificationChatIdRef.current = chatId;
        }
      },
      conferenceId => {
        if (workspace) {
          handleOpenConference(conferenceId);
        } else {
          pendingNotificationConferenceIdRef.current = conferenceId;
        }
      },
    );
    return unsubscribe;
    // workspace intentionally omitted — the handler closure reaches it via
    // the pending ref path; re-registering on every workspace change would
    // cause duplicate subscriptions with @react-native-firebase/messaging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleOpenChat, handleOpenConference]);

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

  const handleListSessions = useCallback(
    () => runAuthorized(token => listSessions(token)),
    [runAuthorized],
  );

  const handleRevokeSession = useCallback(
    async (sessionId: string) => {
      await runAuthorized(token => revokeSession(token, sessionId));
    },
    [runAuthorized],
  );

  const handleSetFontSize = useCallback(async (size: FontSize) => {
    await saveFontSize(size);
    setPreferences(prev => ({...prev, fontSize: size}));
  }, []);

  const handleSetChatBackground = useCallback(async (color: string) => {
    await saveChatBackground(color);
    setPreferences(prev => ({...prev, chatBackground: color}));
  }, []);

  const handleSetNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      await saveNotificationsEnabled(enabled);
      setPreferences(prev => ({...prev, notificationsEnabled: enabled}));
      const currentSession = sessionRef.current;
      if (!currentSession) {
        return;
      }
      if (enabled) {
        startFcmSession(currentSession, sessionRef, fcmCleanupRef);
      } else {
        fcmCleanupRef.current?.();
        fcmCleanupRef.current = null;
        cleanupFcmForSession(currentSession.auth.token).catch(() => undefined);
      }
    },
    [],
  );

  const handleMuteChat = useCallback(async (chatId: string, muted: boolean) => {
    setPreferences(prev => {
      const set = new Set(prev.mutedChatIds);
      if (muted) { set.add(chatId); } else { set.delete(chatId); }
      const next = [...set];
      saveMutedChatIds(next).catch(() => undefined);
      return {...prev, mutedChatIds: next};
    });
  }, []);

  const handleSetChatSilent = useCallback(async (chatId: string, silent: boolean) => {
    setPreferences(prev => {
      const set = new Set(prev.silentChatIds);
      if (silent) { set.add(chatId); } else { set.delete(chatId); }
      const next = [...set];
      saveSilentChatIds(next).catch(() => undefined);
      return {...prev, silentChatIds: next};
    });
  }, []);

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

  const handleAcceptIncomingCall = (conference: VideoConference) => {
    setActiveChatId(null);
    setActiveConferenceId(conference.id);
    setIncomingCall(null);
  };

  return (
    <SafeAreaProvider>
      <SoundPlayer ref={soundPlayerRef} />
      <StatusBar barStyle="light-content" />
      {session && incomingCall ? (
        <IncomingCallOverlay
          conference={incomingCall}
          onAccept={() => handleAcceptIncomingCall(incomingCall)}
          onDismiss={() => setIncomingCall(null)}
        />
      ) : null}
      {!appReady ? (
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={androidTheme.colors.blue} />
          <Text style={styles.loadingLabel}>{t('app.restoringSession')}</Text>
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
          realtimeStatus={latestRealtimeStatus}
          runAuthorized={runAuthorized}
          preferences={preferences}
          onBack={handleBackToWorkspace}
          onOpenChat={handleOpenChat}
          onChatSummaryChange={handleChatSummaryChange}
          onChatRead={handleChatRead}
          onPersistPendingOutgoingMessage={persistPendingOutgoingMessage}
          onDeletePendingOutgoingMessages={deletePendingOutgoingMessages}
          contacts={workspace.contacts}
          blockedUsers={workspace.blockedUsers}
          onAddContact={handleAddContact}
          onRemoveContact={handleRemoveContact}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
        />
      ) : session && workspace ? (
        <WorkspaceHomeScreen
          session={session.auth}
          workspace={workspace}
          error={workspaceError}
          preferences={preferences}
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
          onListSessions={handleListSessions}
          onRevokeSession={handleRevokeSession}
          onSetFontSize={handleSetFontSize}
          onSetChatBackground={handleSetChatBackground}
          onSetNotificationsEnabled={handleSetNotificationsEnabled}
          onMuteChat={handleMuteChat}
          onSetChatSilent={handleSetChatSilent}
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

type IncomingCallOverlayProps = {
  conference: VideoConference;
  onAccept: () => void;
  onDismiss: () => void;
};

function IncomingCallOverlay({
  conference,
  onAccept,
  onDismiss,
}: IncomingCallOverlayProps) {
  const {t} = useI18n();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Auto-dismiss the ring after 45s so a missed/cancelled call does not linger.
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), 45_000);
    return () => clearTimeout(timer);
  }, [conference.id]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={incomingCallStyles.backdrop}>
        <View style={incomingCallStyles.card}>
          <Text style={incomingCallStyles.glyph}>📞</Text>
          <Text style={incomingCallStyles.eyebrow}>{t('call.incoming')}</Text>
          <Text style={incomingCallStyles.name} numberOfLines={1}>
            {conference.createdBy.displayName}
          </Text>
          <View style={incomingCallStyles.actions}>
            <Pressable style={incomingCallStyles.decline} onPress={onDismiss}>
              <Text style={incomingCallStyles.declineLabel}>{t('call.decline')}</Text>
            </Pressable>
            <Pressable style={incomingCallStyles.accept} onPress={onAccept}>
              <Text style={incomingCallStyles.acceptLabel}>{t('call.accept')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const incomingCallStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 12, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 8,
    padding: 26,
    borderRadius: 28,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    ...androidTheme.shadow,
  },
  glyph: {
    fontSize: 38,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: androidTheme.colors.textSecondary,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  decline: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 92, 92, 0.16)',
  },
  declineLabel: {
    color: '#ff8f8f',
    fontSize: 15,
    fontWeight: '800',
  },
  accept: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3ecf8e',
  },
  acceptLabel: {
    color: '#06210f',
    fontSize: 15,
    fontWeight: '800',
  },
});

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
  const {t} = useI18n();
  return (
    <View style={styles.recoveryScreen}>
      <View style={styles.recoveryCard}>
        <Text style={styles.recoveryEyebrow}>{t('app.recoveryEyebrow')}</Text>
        <Text style={styles.recoveryTitle}>{t('app.recoveryTitle')}</Text>
        <Text style={styles.recoveryCopy}>{t('app.recoveryCopy')}</Text>
        {error ? <Text style={styles.recoveryError}>{error}</Text> : null}
        <Pressable
          onPress={onRetry}
          disabled={loading}
          style={loading ? styles.recoveryPrimaryDisabled : styles.recoveryPrimary}>
          <Text style={styles.recoveryPrimaryLabel}>
            {loading ? t('app.recoveryRetrying') : t('app.recoveryRetry')}
          </Text>
        </Pressable>
        <Pressable onPress={onLogout} style={styles.recoveryGhost}>
          <Text style={styles.recoveryGhostLabel}>{t('app.logout')}</Text>
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
          <Text style={errorBoundaryStyles.title}>{tActive('app.errorTitle')}</Text>
          <Text style={errorBoundaryStyles.body}>{this.state.message}</Text>
          <Pressable
            style={errorBoundaryStyles.button}
            onPress={() => this.setState({hasError: false, message: ''})}>
            <Text style={errorBoundaryStyles.buttonLabel}>{tActive('app.errorRetry')}</Text>
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
    <I18nProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </I18nProvider>
  );
}

export default AppWithBoundary;
