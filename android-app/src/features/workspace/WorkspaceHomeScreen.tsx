import type {
  AuthResponse,
  ChatDraft,
  ChatSummary,
  PendingOutgoingMessage,
  UserProfile,
  UserSessionInfo,
  VideoConference,
  WorkspaceBootstrap,
  WorkspaceSearch,
} from '@north/shared';
import type {ReactNode, RefObject} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {launchImageLibrary} from 'react-native-image-picker';
import {
  Animated,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {androidTheme} from '../../theme';
import {useI18n} from '../../i18n/I18nProvider';
import {getActiveLocale, tActive, type Locale} from '../../i18n';

const ARCHIVE_ROW_H = 64;
const UNARCHIVE_BTN_W = 92;
const UNARCHIVE_THRESHOLD = 90;

type WorkspaceTab = 'chats' | 'contacts' | 'settings' | 'profile';
type ChatFilter = 'all' | 'direct' | 'groups' | 'unread';

type Props = {
  session: AuthResponse;
  workspace: WorkspaceBootstrap;
  error: string | null;
  preferences: {
    fontSize: 'small' | 'medium' | 'large';
    chatBackground: string;
    notificationsEnabled: boolean;
    mutedChatIds: string[];
    silentChatIds: string[];
  };
  onLogout: () => Promise<void>;
  onOpenChat: (chatId: string) => void;
  onOpenConference: (conferenceId: string) => void;
  onStartDirectChat: (username: string) => Promise<ChatSummary>;
  onAddContact: (username: string) => Promise<UserProfile>;
  onRemoveContact: (username: string) => Promise<void>;
  onSearchWorkspace: (query: string) => Promise<WorkspaceSearch>;
  onArchiveChat: (chatId: string, archived: boolean) => Promise<void>;
  onDeleteChat: (chatId: string, isDirect: boolean) => Promise<void>;
  onBlockUser: (username: string) => Promise<UserProfile>;
  onUnblockUser: (username: string) => Promise<void>;
  onResendEmailVerification: () => Promise<void>;
  onRequestEmailChange: (newEmail: string) => Promise<void>;
  onChangeUsername: (newUsername: string) => Promise<void>;
  onUpdateAvatar: (dataUri: string) => Promise<void>;
  onUpdateProfile: (input: {displayName: string; profession?: string | null}) => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onScheduleConference: (title: string, scheduledAt: string, participantUsernames?: string[]) => Promise<VideoConference>;
  onStartNewConference: (title: string, participantUsernames?: string[]) => Promise<VideoConference>;
  onListSessions: () => Promise<UserSessionInfo[]>;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onSetFontSize: (size: 'small' | 'medium' | 'large') => Promise<void>;
  onSetChatBackground: (color: string) => Promise<void>;
  onSetNotificationsEnabled: (enabled: boolean) => Promise<void>;
  onMuteChat: (chatId: string, muted: boolean) => Promise<void>;
  onSetChatSilent: (chatId: string, silent: boolean) => Promise<void>;
};

export function WorkspaceHomeScreen({
  session,
  workspace,
  error,
  preferences,
  onLogout,
  onOpenChat,
  onOpenConference,
  onStartDirectChat,
  onAddContact,
  onRemoveContact,
  onSearchWorkspace,
  onArchiveChat,
  onDeleteChat,
  onBlockUser,
  onUnblockUser,
  onResendEmailVerification,
  onRequestEmailChange,
  onChangeUsername,
  onUpdateAvatar,
  onUpdateProfile,
  onRefreshWorkspace,
  onScheduleConference,
  onStartNewConference,
  onListSessions,
  onRevokeSession,
  onSetFontSize,
  onSetChatBackground,
  onSetNotificationsEnabled,
  onMuteChat,
  onSetChatSilent,
}: Props) {
  const {t, tp, locale, setLocale} = useI18n();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chats');
  const [activeChatFilter, _setActiveChatFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<WorkspaceSearch | null>(null);
  const [_pendingArchiveChatIds, setPendingArchiveChatIds] = useState<
    Record<string, boolean>
  >({});
  const [_pendingDeleteChatIds, setPendingDeleteChatIds] = useState<
    Record<string, boolean>
  >({});
  const [searchMode, setSearchMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatListScrollRef = useRef<ScrollView>(null);
  const archiveRowTranslateX = useRef(new Animated.Value(0)).current;
  const archiveRowDismissRef = useRef<{
    translateX: Animated.Value;
    scrollRef: RefObject<ScrollView | null>;
  } | null>(null);
  archiveRowDismissRef.current = {translateX: archiveRowTranslateX, scrollRef: chatListScrollRef};
  const archiveRowPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, {dx, dy}) =>
        dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.8,
      onPanResponderMove: (_, {dx}) => {
        if (dx < 0) {
          archiveRowDismissRef.current?.translateX.setValue(Math.max(dx, -220));
        }
      },
      onPanResponderRelease: (_, {dx, vx}) => {
        const ctx = archiveRowDismissRef.current;
        if (!ctx) {return;}
        const pastThreshold = dx < -80 || (dx < -40 && vx < -0.6);
        if (pastThreshold) {
          Animated.timing(ctx.translateX, {
            toValue: -500,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            ctx.translateX.setValue(0);
            ctx.scrollRef.current?.scrollTo({y: ARCHIVE_ROW_H + 4, animated: true});
          });
        } else {
          Animated.spring(ctx.translateX, {toValue: 0, useNativeDriver: true}).start();
        }
      },
      onPanResponderTerminate: () => {
        archiveRowDismissRef.current?.translateX.setValue(0);
        if (archiveRowDismissRef.current) {
          Animated.spring(archiveRowDismissRef.current.translateX, {toValue: 0, useNativeDriver: true}).start();
        }
      },
    }),
  ).current;
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(
    new Set(),
  );
  const isSelectionMode = selectedChatIds.size > 0;
  const [pendingUserActions, setPendingUserActions] = useState<
    Record<string, boolean>
  >({});
  const [verificationPending, setVerificationPending] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [workspaceRefreshing, setWorkspaceRefreshing] = useState(false);
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [chatListViewHeight, setChatListViewHeight] = useState(2000);
  const [conferenceModal, setConferenceModal] = useState<'schedule' | 'start' | null>(null);
  const [confTitle, setConfTitle] = useState('');
  const [confDate, setConfDate] = useState('');
  const [confTime, setConfTime] = useState('');
  const [confPending, setConfPending] = useState(false);
  const [confError, setConfError] = useState<string | null>(null);
  const [confParticipants, setConfParticipants] = useState<string[]>([]);
  const [confShowContacts, setConfShowContacts] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const [confMenuOpen, setConfMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [emailChangeInput, setEmailChangeInput] = useState('');
  const [emailChangePending, setEmailChangePending] = useState(false);
  const [emailChangeInfo, setEmailChangeInfo] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [usernameChangeInput, setUsernameChangeInput] = useState('');
  const [usernameChangePending, setUsernameChangePending] = useState(false);
  const [usernameChangeInfo, setUsernameChangeInfo] = useState<string | null>(null);
  const [usernameChangeError, setUsernameChangeError] = useState<string | null>(null);

  // Settings modals
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsScreenOpen, setSettingsScreenOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [dataStorageOpen, setDataStorageOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [sessionsPending, setSessionsPending] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionIds, setRevokingSessionIds] = useState<Set<string>>(new Set());
  const [cacheCleared, setCacheCleared] = useState(false);

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
  const mutedChatIdSet = useMemo(
    () => new Set(preferences.mutedChatIds),
    [preferences.mutedChatIds],
  );
  const silentChatIdSet = useMemo(
    () => new Set(preferences.silentChatIds),
    [preferences.silentChatIds],
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
  const filteredActiveChats = useMemo(
    () =>
      activeChats.filter(chat => {
        switch (activeChatFilter) {
          case 'direct':
            return chat.direct;
          case 'groups':
            return !chat.direct;
          case 'unread':
            return chat.unreadCount > 0;
          case 'all':
          default:
            return true;
        }
      }),
    [activeChatFilter, activeChats],
  );
  const archivedChats = useMemo(
    () => workspace.chats.filter(chat => archivedChatIds.has(chat.id)),
    [archivedChatIds, workspace.chats],
  );
  const activeConferences = workspace.conferences.filter(c => !c.endedAt);
  const archivedConferences = workspace.archivedConferences.filter(c => !c.endedAt);
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
      setSearchError(t('ws.err.searchMin'));
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

  const handleDeleteChat = async (chatId: string, isDirect: boolean) => {
    setPendingDeleteChatIds(currentState => ({...currentState, [chatId]: true}));
    setActionError(null);

    try {
      await onDeleteChat(chatId, isDirect);
    } catch (nextError) {
      setActionError(toErrorText(nextError));
    } finally {
      setPendingDeleteChatIds(currentState => omitRecordKey(currentState, chatId));
    }
  };

  const handleLongPressChat = (chatId: string) => {
    setSelectedChatIds(new Set([chatId]));
  };

  const handleToggleSelectChat = (chatId: string) => {
    setSelectedChatIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const handleCancelSelection = () => {
    setSelectedChatIds(new Set());
  };

  const handleBulkArchive = async () => {
    const ids = [...selectedChatIds];
    setSelectedChatIds(new Set());
    await Promise.all(ids.map(id => handleArchiveToggle(id, true)));
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedChatIds];
    setSelectedChatIds(new Set());
    await Promise.all(
      ids.map(id => {
        const chat = workspace.chats.find(c => c.id === id);
        if (!chat) {
          return Promise.resolve();
        }
        return handleDeleteChat(id, chat.direct);
      }),
    );
  };

  const handleBulkMute = async () => {
    const ids = [...selectedChatIds];
    // If any selected chat is unmuted → mute all; otherwise → unmute all
    const shouldMute = ids.some(id => !mutedChatIdSet.has(id));
    setSelectedChatIds(new Set());
    await Promise.all(ids.map(id => onMuteChat(id, shouldMute).catch(() => undefined)));
  };

  const openConferenceModal = (mode: 'schedule' | 'start') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setConfTitle('');
    setConfDate(`${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`);
    setConfTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setConfError(null);
    setConfParticipants([]);
    setConfShowContacts(false);
    setConferenceModal(mode);
  };

  const handleConfirmConferenceModal = async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultTitle = t('ws.conf.defaultTitle', {
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
    const title = confTitle.trim() || (conferenceModal === 'start' ? defaultTitle : '');
    if (!title) {
      setConfError(t('ws.conf.errEmptyTitle'));
      return;
    }
    setConfPending(true);
    setConfError(null);
    try {
      if (conferenceModal === 'start') {
        await onStartNewConference(title, confParticipants);
      } else {
        const [day, month, year] = confDate.split('.');
        const [hours, minutes] = confTime.split(':');
        const scheduledAt = new Date(
          Number(year), Number(month) - 1, Number(day),
          Number(hours), Number(minutes),
        ).toISOString();
        await onScheduleConference(title, scheduledAt, confParticipants);
      }
      setConferenceModal(null);
    } catch (err) {
      setConfError(toErrorText(err));
    } finally {
      setConfPending(false);
    }
  };

  const handleTabChange = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setSelectedChatIds(new Set());
    setSearchMode(false);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    if (tab === 'chats') {
      setShowArchiveView(false);
    }
    if (tab === 'settings') {
      onRefreshWorkspace().catch(() => undefined);
    }
  };

  const handleExitSearch = () => {
    setSearchMode(false);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  };

  useEffect(() => {
    if (!searchMode) {
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      handleSearch().catch(() => undefined);
    }, 400);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchMode]);



  useEffect(() => {
    if (!showArchiveView) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowArchiveView(false);
      return true;
    });
    return () => sub.remove();
  }, [showArchiveView]);

  const handleCreateGroup = () => {
    setMenuOpen(false);
    setActionError(t('ws.err.createGroupSoon'));
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

  const handlePickAvatar = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
      maxWidth: 512,
      maxHeight: 512,
    });
    if (result.didCancel || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64 || !asset.type) return;
    const dataUri = `data:${asset.type};base64,${asset.base64}`;
    setAvatarUploading(true);
    setActionError(null);
    try {
      await onUpdateAvatar(dataUri);
    } catch (err) {
      setActionError(toErrorText(err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const openDevices = () => {
    setSessionsPending(true);
    setSessionsError(null);
    setSessions([]);
    setDevicesOpen(true);
    onListSessions()
      .then(setSessions)
      .catch(err => setSessionsError(toErrorText(err)))
      .finally(() => setSessionsPending(false));
  };

  const handleRevokeSession = (sessionId: string) => {
    setRevokingSessionIds(prev => new Set([...prev, sessionId]));
    onRevokeSession(sessionId)
      .then(() => setSessions(prev => prev.filter(s => s.id !== sessionId)))
      .catch(err => setSessionsError(toErrorText(err)))
      .finally(() =>
        setRevokingSessionIds(prev => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        }),
      );
  };

  const handleRevokeOtherSessions = () => {
    const others = sessions.filter(s => s.id !== session.sessionId);
    others.forEach(s => handleRevokeSession(s.id));
  };

  const openEditProfile = () => {
    const name = session.user.displayName.trim();
    const spaceIdx = name.indexOf(' ');
    setEditFirstName(spaceIdx === -1 ? name : name.slice(0, spaceIdx));
    setEditLastName(spaceIdx === -1 ? '' : name.slice(spaceIdx + 1));
    setEditBio(session.user.profession ?? '');
    setEditError(null);
    setEmailChangeInput(session.user.email ?? '');
    setEmailChangePending(false);
    setEmailChangeInfo(null);
    setEmailChangeError(null);
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const displayName = lastName ? `${firstName} ${lastName}` : firstName;
    if (!displayName) {
      setEditError(t('ws.edit.errEmptyName'));
      return;
    }
    setEditPending(true);
    setEditError(null);
    try {
      await onUpdateProfile({displayName, profession: editBio.trim() || null});
      setEditProfileOpen(false);
    } catch (err) {
      setEditError(toErrorText(err));
    } finally {
      setEditPending(false);
    }
  };

  const handleResendVerificationFromEditScreen = async () => {
    setVerificationPending(true);
    try {
      await onResendEmailVerification();
    } catch {
      // silently ignore — user can try again
    } finally {
      setVerificationPending(false);
    }
  };

  const handleRequestEmailChangeFromEditScreen = async () => {
    const newEmail = emailChangeInput.trim();
    if (!newEmail) {
      return;
    }
    setEmailChangePending(true);
    setEmailChangeInfo(null);
    setEmailChangeError(null);
    try {
      await onRequestEmailChange(newEmail);
      setEmailChangeInfo(t('ws.edit.emailSent', {email: newEmail}));
      setEmailChangeInput('');
    } catch (err) {
      setEmailChangeError(toErrorText(err));
    } finally {
      setEmailChangePending(false);
    }
  };

  const handleChangeUsernameFromEditScreen = async () => {
    const newUsername = usernameChangeInput.trim();
    if (!newUsername) {
      return;
    }
    setUsernameChangePending(true);
    setUsernameChangeInfo(null);
    setUsernameChangeError(null);
    try {
      await onChangeUsername(newUsername);
      setUsernameChangeInfo(t('ws.edit.usernameChanged'));
      setUsernameChangeInput('');
    } catch (err) {
      setUsernameChangeError(toErrorText(err));
    } finally {
      setUsernameChangePending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ios: 'padding', android: 'height'})}
      style={styles.screen}>
      <View style={styles.screen}>
        {isSelectionMode ? (
          <SelectionBar
            count={selectedChatIds.size}
            paddingTop={Math.max(insets.top, 8) + 10}
            onCancel={handleCancelSelection}
            onMute={handleBulkMute}
            onArchive={() => {
              handleBulkArchive().catch(() => undefined);
            }}
            onDelete={() => {
              handleBulkDelete().catch(() => undefined);
            }}
          />
        ) : searchMode ? (
          <View
            style={[
              styles.appBar,
              {paddingTop: Math.max(insets.top, 8) + 10},
            ]}>
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('ws.searchPlaceholder')}
              placeholderTextColor={androidTheme.colors.textMuted}
              selectionColor={androidTheme.colors.blue}
              style={styles.appBarSearchInput}
              returnKeyType="search"
              onSubmitEditing={() => {
                handleSearch().catch(() => undefined);
              }}
              testID="search-input"
            />
            <Pressable
              onPress={handleExitSearch}
              style={styles.appBarIconBtn}
              testID="search-back-button">
              <Text style={styles.appBarIcon}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={[
              styles.appBar,
              {paddingTop: Math.max(insets.top, 8) + 10},
            ]}>
            <Text style={styles.appBarTitle}>{activeTabLabel}</Text>
            <View style={styles.appBarActions}>
              {activeTab === 'chats' ? (
                <>
                  <Pressable
                    onPress={() => setSearchMode(true)}
                    style={styles.appBarIconBtn}
                    testID="search-icon-button">
                    <Text style={styles.appBarIcon}>🔍</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMenuOpen(true)}
                    style={styles.appBarIconBtn}
                    testID="menu-icon-button">
                    <Text style={styles.appBarMenuDots}>⋯</Text>
                  </Pressable>
                </>
              ) : null}
              {activeTab === 'settings' ? (
                <Pressable
                  onPress={() => setConfMenuOpen(true)}
                  style={styles.appBarIconBtn}
                  testID="conf-menu-button">
                  <Text style={styles.appBarMenuDots}>⋯</Text>
                </Pressable>
              ) : null}
              {activeTab === 'profile' ? (
                <Pressable
                  onPress={() => setProfileMenuOpen(true)}
                  style={styles.appBarIconBtn}
                  testID="profile-menu-button">
                  <Text style={styles.appBarMenuDots}>⋮</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        <Modal
          transparent
          visible={menuOpen}
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuOpen(false)}>
            <View style={styles.menuPopover}>
              <Pressable
                onPress={handleCreateGroup}
                style={styles.menuItem}
                testID="menu-create-group">
                <Text style={styles.menuItemLabel}>{t('ws.menu.createGroup')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {error ? <Banner tone="danger" label={error} /> : null}
        {actionError ? <Banner tone="danger" label={actionError} /> : null}
        {searchError ? <Banner tone="danger" label={searchError} /> : null}

        {searchMode ? (
          <ScrollView
            style={styles.tabScroll}
            contentContainerStyle={styles.chatListContent}
            keyboardShouldPersistTaps="handled">
            {normalizedSearchQuery.length < 2 ? (
              workspace.chats.length === 0 ? (
                <EmptyState label={t('ws.empty.noChats')} />
              ) : (
                workspace.chats.map(chat => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    draft={draftsByChatId.get(chat.id) ?? null}
                    pendingCount={pendingByChatId.get(chat.id) ?? 0}
                    selected={false}
                    isSelectionMode={false}
                    onOpen={() => {
                      handleExitSearch();
                      onOpenChat(chat.id);
                    }}
                    onLongPress={() => undefined}
                    onSelect={() => undefined}
                  />
                ))
              )
            ) : searchPending ? (
              <EmptyState label={t('ws.empty.searching')} />
            ) : searchResults ? (
              <>
                {searchResults.chats.length > 0 ? (
                  <SearchResultGroup title={t('ws.search.chatsGroups')}>
                    {searchResults.chats.map(chat => (
                      <ChatListItem
                        key={chat.id}
                        chat={chat}
                        draft={draftsByChatId.get(chat.id) ?? null}
                        pendingCount={pendingByChatId.get(chat.id) ?? 0}
                        selected={false}
                        isSelectionMode={false}
                        onOpen={() => {
                          handleExitSearch();
                          onOpenChat(chat.id);
                        }}
                        onLongPress={() => undefined}
                        onSelect={() => undefined}
                      />
                    ))}
                  </SearchResultGroup>
                ) : null}

                {searchResults.contacts.length > 0 ? (
                  <SearchResultGroup title={t('ws.search.contacts')}>
                    {searchResults.contacts.map(profile => (
                      <ProfileListItem
                        key={profile.id}
                        profile={profile}
                        actions={[
                          {
                            label: t('ws.action.write'),
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
                        ]}
                      />
                    ))}
                  </SearchResultGroup>
                ) : null}

                {searchResults.users.length > 0 ? (
                  <SearchResultGroup title={t('ws.search.users')}>
                    {searchResults.users.map(profile => {
                      const normalizedUsername = profile.username.trim().toLowerCase();
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
                                      label: t('ws.action.unblock'),
                                      pending: Boolean(
                                        pendingUserActions[
                                          buildUserActionKey('unblock', profile.username)
                                        ],
                                      ),
                                      onPress: () => {
                                        handleUnblock(profile.username).catch(() => undefined);
                                      },
                                      testID: `unblock-search-user-${profile.username}`,
                                    },
                                  ]
                                : [
                                    {
                                      label: t('ws.action.write'),
                                      pending: Boolean(
                                        pendingUserActions[
                                          buildUserActionKey('message', profile.username)
                                        ],
                                      ),
                                      onPress: () => {
                                        handleStartChat(profile.username).catch(() => undefined);
                                      },
                                      testID: `message-search-user-${profile.username}`,
                                      tone: 'primary',
                                    },
                                    ...(!alreadyContact
                                      ? [
                                          {
                                            label: t('ws.action.add'),
                                            pending: Boolean(
                                              pendingUserActions[
                                                buildUserActionKey('add-contact', profile.username)
                                              ],
                                            ),
                                            onPress: () => {
                                              handleAddContact(profile.username).catch(() => undefined);
                                            },
                                            testID: `add-contact-${profile.username}`,
                                          },
                                        ]
                                      : []),
                                    {
                                      label: t('ws.action.block'),
                                      pending: Boolean(
                                        pendingUserActions[
                                          buildUserActionKey('block', profile.username)
                                        ],
                                      ),
                                      onPress: () => {
                                        handleBlock(profile.username).catch(() => undefined);
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

                {searchResultCount === 0 ? (
                  <EmptyState label={t('ws.empty.nothingFound')} />
                ) : null}
              </>
            ) : (
              <EmptyState label={t('ws.empty.searchMin')} />
            )}
          </ScrollView>
        ) : null}

        <View style={[styles.contentArea, searchMode && styles.hidden]}>
          {activeTab === 'chats' ? (
            showArchiveView ? (
              <ScrollView
                style={styles.tabScroll}
                contentContainerStyle={styles.chatListContent}
                keyboardShouldPersistTaps="handled">
                {archivedChats.length === 0 ? (
                  <EmptyState label={t('ws.archive.empty')} />
                ) : (
                  archivedChats.map(chat => (
                    <SwipeableChatItem
                      key={chat.id}
                      chat={chat}
                      draft={draftsByChatId.get(chat.id) ?? null}
                      pendingCount={pendingByChatId.get(chat.id) ?? 0}
                      selected={selectedChatIds.has(chat.id)}
                      isSelectionMode={isSelectionMode}
                      muted={mutedChatIdSet.has(chat.id)}
                      onOpen={() => onOpenChat(chat.id)}
                      onLongPress={() => handleLongPressChat(chat.id)}
                      onSelect={() => handleToggleSelectChat(chat.id)}
                      swipeLabel={t('ws.archive.restore')}
                      swipeIcon="⬆"
                      swipeBgColor={androidTheme.colors.blueStrong}
                      swipeLabelColor="#fff"
                      onSwipeAction={() => {
                        handleArchiveToggle(chat.id, false).catch(() => undefined);
                      }}
                    />
                  ))
                )}
              </ScrollView>
            ) : (
              <ScrollView
                ref={chatListScrollRef}
                style={styles.tabScroll}
                contentOffset={{x: 0, y: ARCHIVE_ROW_H + 4}}
                contentContainerStyle={[
                  styles.chatListContent,
                  {minHeight: chatListViewHeight + ARCHIVE_ROW_H},
                ]}
                keyboardShouldPersistTaps="handled"
                onLayout={e => {
                  setChatListViewHeight(e.nativeEvent.layout.height);
                }}>
                <View style={styles.swipeContainer}>
                  <Animated.View
                    style={[
                      styles.archiveRowDismissBg,
                      {
                        opacity: archiveRowTranslateX.interpolate({
                          inputRange: [-220, -20, 0],
                          outputRange: [1, 0.4, 0],
                          extrapolate: 'clamp',
                        }),
                      },
                    ]}>
                    <Text style={styles.archiveRowDismissIcon}>✕</Text>
                  </Animated.View>
                  <Animated.View
                    style={{transform: [{translateX: archiveRowTranslateX}]}}
                    {...archiveRowPanResponder.panHandlers}>
                    <Pressable
                      style={styles.archiveRevealRow}
                      onPress={() => setShowArchiveView(true)}>
                      <View style={styles.archiveRevealIconWrap}>
                        <Text style={styles.archiveRevealIconText}>📥</Text>
                      </View>
                      <Text style={styles.archiveRevealLabel}>
                        {archivedChats.length > 0
                          ? t('ws.archive.titleCount', {count: archivedChats.length})
                          : t('ws.archive.title')}
                      </Text>
                    </Pressable>
                  </Animated.View>
                </View>
                {filteredActiveChats.length === 0 ? (
                  <EmptyState label={t('ws.empty.noActiveChats')} />
                ) : (
                  filteredActiveChats.map(chat => (
                    <SwipeableChatItem
                      key={chat.id}
                      chat={chat}
                      draft={draftsByChatId.get(chat.id) ?? null}
                      pendingCount={pendingByChatId.get(chat.id) ?? 0}
                      selected={selectedChatIds.has(chat.id)}
                      isSelectionMode={isSelectionMode}
                      muted={mutedChatIdSet.has(chat.id)}
                      onOpen={() => onOpenChat(chat.id)}
                      onLongPress={() => handleLongPressChat(chat.id)}
                      onSelect={() => handleToggleSelectChat(chat.id)}
                      swipeLabel={t('ws.archive.swipe')}
                      swipeIcon="📥"
                      swipeBgColor={androidTheme.colors.surfaceMuted}
                      swipeLabelColor={androidTheme.colors.textPrimary}
                      onSwipeAction={() => {
                        handleArchiveToggle(chat.id, true).catch(() => undefined);
                      }}
                    />
                  ))
                )}
              </ScrollView>
            )
          ) : null}

          {activeTab === 'contacts' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled">
              {workspace.contacts.length === 0 ? (
                <EmptyState label={t('ws.empty.noContacts')} />
              ) : (
                workspace.contacts.map(profile => (
                  <ProfileListItem
                    key={profile.id}
                    profile={profile}
                    actions={[
                      {
                        label: '📞',
                        onPress: () => {
                          onStartNewConference(
                            t('ws.callWith', {name: profile.displayName}),
                            [profile.username],
                          ).catch(() => undefined);
                        },
                        testID: `call-contact-${profile.username}`,
                        tone: 'primary',
                      },
                      {
                        label: t('ws.action.write'),
                        pending: Boolean(
                          pendingUserActions[
                            buildUserActionKey('message', profile.username)
                          ],
                        ),
                        onPress: () => {
                          handleStartChat(profile.username).catch(() => undefined);
                        },
                        testID: `message-contact-${profile.username}`,
                      },
                      {
                        label: t('ws.action.remove'),
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
                        label: t('ws.action.block'),
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

              {workspace.blockedUsers.length > 0 ? (
                <>
                  <View style={styles.archivedDivider}>
                    <Text style={styles.archivedDividerLabel}>
                      {t('ws.blockedCount', {count: workspace.blockedUsers.length})}
                    </Text>
                  </View>
                  {workspace.blockedUsers.map(profile => (
                    <ProfileListItem
                      key={profile.id}
                      profile={profile}
                      actions={[
                        {
                          label: t('ws.action.unblock'),
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
                  ))}
                </>
              ) : null}
            </ScrollView>
          ) : null}

          {activeTab === 'settings' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.tabContent}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={workspaceRefreshing}
                  onRefresh={() => {
                    setWorkspaceRefreshing(true);
                    onRefreshWorkspace().finally(() => setWorkspaceRefreshing(false));
                  }}
                  tintColor={androidTheme.colors.blue}
                  colors={[androidTheme.colors.blue]}
                />
              }>

              <View style={styles.conferenceToolbar}>
                <Pressable
                  style={styles.confToolbarBtn}
                  onPress={() => {
                    const now = new Date();
                    setCalendarYear(now.getFullYear());
                    setCalendarMonth(now.getMonth());
                    setCalendarSelectedDay(null);
                    setCalendarOpen(true);
                  }}>
                  <Text style={styles.confToolbarBtnLabel}>{t('ws.conf.calendarBtn')}</Text>
                </Pressable>
              </View>

              {/* Dropdown menu */}
              <Modal
                visible={confMenuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setConfMenuOpen(false)}>
                <Pressable
                  style={styles.confMenuOverlay}
                  onPress={() => setConfMenuOpen(false)}>
                  <View style={styles.confMenuCard}>
                    <Pressable
                      style={styles.confMenuItem}
                      onPress={() => {
                        setConfMenuOpen(false);
                        openConferenceModal('start');
                      }}>
                      <Text style={styles.confMenuItemIcon}>▶</Text>
                      <Text style={styles.confMenuItemLabel}>{t('ws.conf.startNow')}</Text>
                    </Pressable>
                    <View style={styles.confMenuDivider} />
                    <Pressable
                      style={styles.confMenuItem}
                      onPress={() => {
                        setConfMenuOpen(false);
                        openConferenceModal('schedule');
                      }}>
                      <Text style={styles.confMenuItemIcon}>+</Text>
                      <Text style={styles.confMenuItemLabel}>{t('ws.conf.schedule')}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Modal>

              {activeConferences.length > 0 || archivedConferences.length > 0 ? (
                <>
                  {activeConferences.map(conference => (
                    <ConferenceListItem
                      key={conference.id}
                      conference={conference}
                      onOpen={() => onOpenConference(conference.id)}
                    />
                  ))}
                  {archivedConferences.map(conference => (
                    <ConferenceListItem
                      key={conference.id}
                      conference={conference}
                      onOpen={() => onOpenConference(conference.id)}
                    />
                  ))}
                </>
              ) : (
                <EmptyState label={t('ws.conf.emptyList')} />
              )}

              <Modal
                visible={conferenceModal !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setConferenceModal(null)}>
                <Pressable
                  style={styles.confModalOverlay}
                  onPress={() => setConferenceModal(null)}>
                  <Pressable style={styles.confModalCard} onPress={() => {}}>
                    <Text style={styles.confModalTitle}>
                      {conferenceModal === 'start' ? t('ws.conf.startTitle') : t('ws.conf.scheduleTitle')}
                    </Text>

                    <Text style={styles.confModalLabel}>
                      {conferenceModal === 'start' ? t('ws.conf.titleOptional') : t('ws.conf.titleLabel')}
                    </Text>
                    <TextInput
                      style={styles.confModalInput}
                      placeholder={conferenceModal === 'start' ? t('ws.conf.titlePlaceholderStart') : t('ws.conf.titlePlaceholderSchedule')}
                      placeholderTextColor={androidTheme.colors.textMuted}
                      value={confTitle}
                      onChangeText={setConfTitle}
                      returnKeyType="done"
                    />

                    {/* Участники */}
                    <Pressable
                      style={styles.confModalParticipantsBtn}
                      onPress={() => setConfShowContacts(v => !v)}>
                      <Text style={styles.confModalParticipantsBtnLabel}>
                        {t('ws.conf.participants')}{confParticipants.length > 0 ? ` (${confParticipants.length})` : ''}
                      </Text>
                      <Text style={styles.confModalParticipantsChevron}>
                        {confShowContacts ? '▲' : '▼'}
                      </Text>
                    </Pressable>

                    {confShowContacts ? (
                      <View style={styles.confContactList}>
                        {workspace.contacts.length === 0 ? (
                          <Text style={styles.confContactEmpty}>{t('ws.conf.noContacts')}</Text>
                        ) : (
                          workspace.contacts.map(contact => {
                            const selected = confParticipants.includes(contact.username);
                            return (
                              <Pressable
                                key={contact.username}
                                style={[
                                  styles.confContactItem,
                                  selected && styles.confContactItemSelected,
                                ]}
                                onPress={() => {
                                  setConfParticipants(prev =>
                                    selected
                                      ? prev.filter(u => u !== contact.username)
                                      : [...prev, contact.username],
                                  );
                                }}>
                                <View style={[styles.confContactCheck, selected && styles.confContactCheckSelected]}>
                                  {selected ? <Text style={styles.confContactCheckMark}>✓</Text> : null}
                                </View>
                                <View style={styles.confContactInfo}>
                                  <Text style={styles.confContactName}>{contact.displayName}</Text>
                                  <Text style={styles.confContactUsername}>@{contact.username}</Text>
                                </View>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    ) : null}

                    {conferenceModal === 'schedule' ? (
                      <>
                        <Text style={styles.confModalLabel}>{t('ws.conf.dateLabel')}</Text>
                        <TextInput
                          style={styles.confModalInput}
                          placeholder="19.05.2026"
                          placeholderTextColor={androidTheme.colors.textMuted}
                          value={confDate}
                          onChangeText={setConfDate}
                          keyboardType="numeric"
                          returnKeyType="next"
                        />
                        <Text style={styles.confModalLabel}>{t('ws.conf.timeLabel')}</Text>
                        <TextInput
                          style={styles.confModalInput}
                          placeholder="14:00"
                          placeholderTextColor={androidTheme.colors.textMuted}
                          value={confTime}
                          onChangeText={setConfTime}
                          keyboardType="numeric"
                          returnKeyType="done"
                        />
                      </>
                    ) : null}

                    {confError ? (
                      <Text style={styles.confModalError}>{confError}</Text>
                    ) : null}

                    <View style={styles.confModalActions}>
                      <Pressable
                        style={styles.confModalCancelBtn}
                        onPress={() => setConferenceModal(null)}>
                        <Text style={styles.confModalCancelLabel}>{t('common.cancel')}</Text>
                      </Pressable>
                      <Pressable
                        style={confPending ? styles.confModalSubmitDisabled : styles.confModalSubmitBtn}
                        disabled={confPending}
                        onPress={() => handleConfirmConferenceModal().catch(() => undefined)}>
                        <Text style={styles.confModalSubmitLabel}>
                          {confPending
                            ? t('ws.conf.creating')
                            : conferenceModal === 'start'
                              ? t('ws.conf.startBtn')
                              : t('ws.conf.scheduleBtn')}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              <Modal
                visible={calendarOpen}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setCalendarOpen(false)}>
                <ConferenceCalendar
                  year={calendarYear}
                  month={calendarMonth}
                  selectedDay={calendarSelectedDay}
                  conferences={[...activeConferences, ...archivedConferences]}
                  onPrevMonth={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear(y => y - 1);
                    } else {
                      setCalendarMonth(m => m - 1);
                    }
                    setCalendarSelectedDay(null);
                  }}
                  onNextMonth={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear(y => y + 1);
                    } else {
                      setCalendarMonth(m => m + 1);
                    }
                    setCalendarSelectedDay(null);
                  }}
                  onSelectDay={setCalendarSelectedDay}
                  onOpenConference={conferenceId => {
                    setCalendarOpen(false);
                    onOpenConference(conferenceId);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              </Modal>
            </ScrollView>
          ) : null}

          {activeTab === 'profile' ? (
            <ScrollView
              style={styles.tabScroll}
              contentContainerStyle={styles.profileTabContent}
              keyboardShouldPersistTaps="handled">

              {/* Avatar + name + status */}
              <View style={styles.profileHeroNew}>
                <Pressable
                  disabled={avatarUploading}
                  onPress={() => handlePickAvatar().catch(err => setActionError(toErrorText(err)))}>
                  <Avatar
                    name={session.user.displayName}
                    avatarUrl={session.user.avatarUrl}
                    size={96}
                  />
                  {avatarUploading ? (
                    <View style={settingsStyles.avatarOverlay}>
                      <Text style={settingsStyles.avatarOverlayText}>⏳</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Text style={styles.profileNameNew}>{session.user.displayName}</Text>
                <Text style={styles.profileOnlineStatus}>
                  {session.user.online ? t('ws.profile.online') : t('ws.profile.offline')}
                </Text>
              </View>

              {/* Three action buttons */}
              <View style={styles.profileActionsRow}>
                <Pressable
                  style={styles.profileActionItem}
                  disabled={avatarUploading}
                  onPress={() => handlePickAvatar().catch(err => setActionError(toErrorText(err)))}>
                  <View style={styles.profileActionIconWrap}>
                    <Text style={styles.profileActionIconText}>📷</Text>
                  </View>
                  <Text style={styles.profileActionLabel}>{t('ws.profile.choosePhoto')}</Text>
                </Pressable>
                <Pressable
                  testID="edit-profile-button"
                  style={styles.profileActionItem}
                  onPress={openEditProfile}>
                  <View style={styles.profileActionIconWrap}>
                    <Text style={styles.profileActionIconText}>✏️</Text>
                  </View>
                  <Text style={styles.profileActionLabel}>{t('ws.profile.edit')}</Text>
                </Pressable>
                <Pressable
                  style={styles.profileActionItem}
                  onPress={() => setSettingsScreenOpen(true)}>
                  <View style={styles.profileActionIconWrap}>
                    <Text style={styles.profileActionIconText}>⚙️</Text>
                  </View>
                  <Text style={styles.profileActionLabel}>{t('settings.title')}</Text>
                </Pressable>
              </View>

              {/* Info card */}
              <View style={styles.profileInfoCard}>
                {session.user.profession ? (
                  <>
                    <View style={styles.profileInfoRow}>
                      <Text style={styles.profileInfoValue}>{session.user.profession}</Text>
                      <Text style={styles.profileInfoMeta}>{t('ws.profile.about')}</Text>
                    </View>
                    <View style={styles.profileInfoDivider} />
                  </>
                ) : null}
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoValue}>@{session.user.username}</Text>
                  <Text style={styles.profileInfoMeta}>{t('ws.profile.username')}</Text>
                </View>
                {session.user.email ? (
                  <>
                    <View style={styles.profileInfoDivider} />
                    <View style={styles.profileInfoRow}>
                      <Text style={styles.profileInfoValue}>{session.user.email}</Text>
                      <Text style={styles.profileInfoMeta}>Email</Text>
                    </View>
                  </>
                ) : null}
              </View>

            </ScrollView>
          ) : null}

          {/* Profile logout dropdown */}
          <Modal
            visible={profileMenuOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setProfileMenuOpen(false)}>
            <Pressable
              style={settingsStyles.menuOverlay}
              onPress={() => setProfileMenuOpen(false)}>
              <View style={settingsStyles.menuDropdown}>
                <Pressable
                  style={settingsStyles.menuItem}
                  onPress={() => {
                    setProfileMenuOpen(false);
                    onLogout().catch(() => undefined);
                  }}>
                  <Text style={settingsStyles.menuItemTextDanger}>{t('ws.profile.logout')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          {/* Settings screen */}
          <Modal
            visible={settingsScreenOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setSettingsScreenOpen(false)}>
            <View style={settingsStyles.modalScreen}>
              <View style={settingsStyles.modalHeader}>
                <Pressable onPress={() => setSettingsScreenOpen(false)} style={settingsStyles.modalBackBtn}>
                  <Text style={settingsStyles.modalBackText}>{t('nav.back')}</Text>
                </Pressable>
                <Text style={settingsStyles.modalTitle}>{t('settings.title')}</Text>
                <View style={settingsStyles.modalBackBtn} />
              </View>
              <ScrollView contentContainerStyle={settingsStyles.modalContent}>
                {/* Profile mini-header */}
                <Pressable
                  style={settingsStyles.settingsProfileHeader}
                  onPress={() => {
                    setSettingsScreenOpen(false);
                    openEditProfile();
                  }}>
                  <Avatar
                    name={session.user.displayName}
                    avatarUrl={session.user.avatarUrl}
                    size={56}
                  />
                  <View style={settingsStyles.settingsProfileInfo}>
                    <Text style={settingsStyles.settingsProfileName}>{session.user.displayName}</Text>
                    <Text style={settingsStyles.settingsProfileSub}>
                      @{session.user.username}{session.user.email ? ` · ${session.user.email}` : ''}
                    </Text>
                  </View>
                  <Text style={settingsStyles.settingsChevron}>›</Text>
                </Pressable>

                <View style={settingsStyles.sectionCard}>
                  <Pressable
                    testID="settings-account-button"
                    style={settingsStyles.settingsRow}
                    onPress={() => {
                      setSettingsScreenOpen(false);
                      openEditProfile();
                    }}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#3a6bc4'}]}>
                      <Text style={settingsStyles.settingsIconText}>👤</Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('settings.account')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>{t('settings.accountSub')}</Text>
                    </View>
                    <Text style={settingsStyles.settingsChevron}>›</Text>
                  </Pressable>

                  <View style={settingsStyles.rowDivider} />

                  <Pressable
                    style={settingsStyles.settingsRow}
                    onPress={() => setNotificationsOpen(true)}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#c46a2e'}]}>
                      <Text style={settingsStyles.settingsIconText}>
                        {preferences.notificationsEnabled ? '🔔' : '🔕'}
                      </Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('settings.notifications')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>
                        {preferences.notificationsEnabled ? t('settings.on') : t('settings.off')}
                        {preferences.mutedChatIds.length > 0
                          ? ` · ${tp('settings.mutedCount', preferences.mutedChatIds.length)}`
                          : ''}
                      </Text>
                    </View>
                    <Text style={settingsStyles.settingsChevron}>›</Text>
                  </Pressable>

                  <View style={settingsStyles.rowDivider} />

                  <Pressable
                    style={settingsStyles.settingsRow}
                    onPress={() => setChatSettingsOpen(true)}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#2e8c5c'}]}>
                      <Text style={settingsStyles.settingsIconText}>💬</Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('settings.chatSettings')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>{t('settings.chatSettingsSub')}</Text>
                    </View>
                    <Text style={settingsStyles.settingsChevron}>›</Text>
                  </Pressable>

                  <View style={settingsStyles.rowDivider} />

                  <Pressable
                    style={settingsStyles.settingsRow}
                    onPress={() => setDataStorageOpen(true)}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#7a4db8'}]}>
                      <Text style={settingsStyles.settingsIconText}>💾</Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('settings.dataStorage')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>{t('settings.dataStorageSub')}</Text>
                    </View>
                    <Text style={settingsStyles.settingsChevron}>›</Text>
                  </Pressable>

                  <View style={settingsStyles.rowDivider} />

                  <Pressable
                    style={settingsStyles.settingsRow}
                    onPress={openDevices}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#c46a2e'}]}>
                      <Text style={settingsStyles.settingsIconText}>📱</Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('settings.devices')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>{t('settings.devicesSub')}</Text>
                    </View>
                    <Text style={settingsStyles.settingsChevron}>›</Text>
                  </Pressable>
                </View>

                <Text style={settingsStyles.sectionLabel}>
                  {t('settings.language.label').toUpperCase()}
                </Text>
                <View style={settingsStyles.sectionCard}>
                  {(['ru', 'en'] as const).map((option, idx, arr) => (
                    <View key={option}>
                      <Pressable
                        style={settingsStyles.settingsRow}
                        onPress={() => setLocale(option)}>
                        <Text style={settingsStyles.settingsRowTitle}>
                          {option === 'ru'
                            ? t('settings.language.ru')
                            : t('settings.language.en')}
                        </Text>
                        {locale === option ? (
                          <Text style={settingsStyles.checkmark}>✓</Text>
                        ) : null}
                      </Pressable>
                      {idx < arr.length - 1 ? (
                        <View style={settingsStyles.rowDivider} />
                      ) : null}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </Modal>

          {/* Notifications modal */}
          <Modal
            visible={notificationsOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setNotificationsOpen(false)}>
            <View style={settingsStyles.modalScreen}>
              <View style={settingsStyles.modalHeader}>
                <Pressable
                  onPress={() => setNotificationsOpen(false)}
                  style={settingsStyles.modalBackBtn}>
                  <Text style={settingsStyles.modalBackText}>{t('nav.back')}</Text>
                </Pressable>
                <Text style={settingsStyles.modalTitle}>{t('settings.notifications')}</Text>
                <View style={settingsStyles.modalBackBtn} />
              </View>
              <ScrollView contentContainerStyle={settingsStyles.modalContent}>
                <Text style={settingsStyles.sectionLabel}>{t('notif.captionNotifications')}</Text>
                <View style={settingsStyles.sectionCard}>
                  <View style={[settingsStyles.settingsRow, notifStyles.toggleRow]}>
                    <View style={[settingsStyles.settingsIcon, {backgroundColor: '#c46a2e'}]}>
                      <Text style={settingsStyles.settingsIconText}>
                        {preferences.notificationsEnabled ? '🔔' : '🔕'}
                      </Text>
                    </View>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>{t('notif.receive')}</Text>
                      <Text style={settingsStyles.settingsRowSub}>
                        {t('notif.pushAndSounds')}
                      </Text>
                    </View>
                    <Switch
                      value={preferences.notificationsEnabled}
                      onValueChange={v =>
                        onSetNotificationsEnabled(v).catch(() => undefined)
                      }
                      trackColor={{
                        false: androidTheme.colors.border,
                        true: androidTheme.colors.blueStrong,
                      }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </View>

                {workspace.chats.length > 0 ? (
                  <>
                    <Text style={settingsStyles.sectionLabel}>{t('notif.captionChatsGroups')}</Text>
                    <View style={settingsStyles.sectionCard}>
                      {workspace.chats.map((chat, idx, arr) => {
                        const isMuted = mutedChatIdSet.has(chat.id);
                        const isSilent = silentChatIdSet.has(chat.id);
                        return (
                          <View key={chat.id}>
                            <View style={notifStyles.chatRow}>
                              <Avatar
                                name={chat.title}
                                avatarUrl={chat.avatarUrl}
                                size={40}
                              />
                              <View style={notifStyles.chatInfo}>
                                <Text
                                  style={settingsStyles.settingsRowTitle}
                                  numberOfLines={1}>
                                  {chat.title}
                                </Text>
                                <View style={notifStyles.togglesRow}>
                                  <View style={notifStyles.toggleItem}>
                                    <Text style={notifStyles.toggleLabel}>
                                      {t('settings.notifications')}
                                    </Text>
                                    <Switch
                                      value={!isMuted}
                                      onValueChange={v =>
                                        onMuteChat(chat.id, !v).catch(
                                          () => undefined,
                                        )
                                      }
                                      trackColor={{
                                        false: androidTheme.colors.border,
                                        true: androidTheme.colors.blueStrong,
                                      }}
                                      thumbColor="#ffffff"
                                      style={notifStyles.switchControl}
                                    />
                                  </View>
                                  <View style={notifStyles.toggleItem}>
                                    <Text
                                      style={[
                                        notifStyles.toggleLabel,
                                        isMuted && notifStyles.toggleLabelDisabled,
                                      ]}>
                                      {t('notif.sound')}
                                    </Text>
                                    <Switch
                                      value={!isSilent && !isMuted}
                                      disabled={isMuted}
                                      onValueChange={v =>
                                        onSetChatSilent(chat.id, !v).catch(
                                          () => undefined,
                                        )
                                      }
                                      trackColor={{
                                        false: androidTheme.colors.border,
                                        true: androidTheme.colors.blueStrong,
                                      }}
                                      thumbColor="#ffffff"
                                      style={notifStyles.switchControl}
                                    />
                                  </View>
                                </View>
                              </View>
                            </View>
                            {idx < arr.length - 1 ? (
                              <View style={settingsStyles.rowDivider} />
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </Modal>

          {/* Chat settings modal */}
          <Modal
            visible={chatSettingsOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setChatSettingsOpen(false)}>
            <View style={settingsStyles.modalScreen}>
              <View style={settingsStyles.modalHeader}>
                <Pressable onPress={() => setChatSettingsOpen(false)} style={settingsStyles.modalBackBtn}>
                  <Text style={settingsStyles.modalBackText}>{t('nav.back')}</Text>
                </Pressable>
                <Text style={settingsStyles.modalTitle}>{t('settings.chatSettings')}</Text>
                <View style={settingsStyles.modalBackBtn} />
              </View>
              <ScrollView contentContainerStyle={settingsStyles.modalContent}>
                <Text style={settingsStyles.sectionLabel}>{t('chatset.captionTextSize')}</Text>
                <View style={settingsStyles.sectionCard}>
                  {(['small', 'medium', 'large'] as const).map((size, idx, arr) => (
                    <View key={size}>
                      <Pressable
                        style={settingsStyles.settingsRow}
                        onPress={() => onSetFontSize(size).catch(() => undefined)}>
                        <Text style={settingsStyles.settingsRowTitle}>
                          {size === 'small' ? t('chatset.small') : size === 'medium' ? t('chatset.medium') : t('chatset.large')}
                        </Text>
                        {preferences.fontSize === size ? (
                          <Text style={settingsStyles.checkmark}>✓</Text>
                        ) : null}
                      </Pressable>
                      {idx < arr.length - 1 ? <View style={settingsStyles.rowDivider} /> : null}
                    </View>
                  ))}
                </View>

                <Text style={settingsStyles.sectionLabel}>{t('chatset.captionChatBg')}</Text>
                <View style={settingsStyles.bgGrid}>
                  {[
                    {label: t('chatset.bgDark'), value: '#0f1720'},
                    {label: t('chatset.bgBlack'), value: '#000000'},
                    {label: t('chatset.bgBlue'), value: '#0d1f3c'},
                    {label: t('chatset.bgGreen'), value: '#0d2118'},
                    {label: t('chatset.bgPurple'), value: '#1a0d2e'},
                    {label: t('chatset.bgGray'), value: '#1a1a1a'},
                  ].map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[
                        settingsStyles.bgOption,
                        {backgroundColor: opt.value},
                        preferences.chatBackground === opt.value && settingsStyles.bgOptionSelected,
                      ]}
                      onPress={() => onSetChatBackground(opt.value).catch(() => undefined)}>
                      <Text style={settingsStyles.bgOptionLabel}>{opt.label}</Text>
                      {preferences.chatBackground === opt.value ? (
                        <Text style={settingsStyles.bgCheckmark}>✓</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </Modal>

          {/* Data & storage modal */}
          <Modal
            visible={dataStorageOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setDataStorageOpen(false)}>
            <View style={settingsStyles.modalScreen}>
              <View style={settingsStyles.modalHeader}>
                <Pressable onPress={() => setDataStorageOpen(false)} style={settingsStyles.modalBackBtn}>
                  <Text style={settingsStyles.modalBackText}>{t('nav.back')}</Text>
                </Pressable>
                <Text style={settingsStyles.modalTitle}>{t('settings.dataStorage')}</Text>
                <View style={settingsStyles.modalBackBtn} />
              </View>
              <ScrollView contentContainerStyle={settingsStyles.modalContent}>
                <Text style={settingsStyles.sectionLabel}>{t('settings.captionCache')}</Text>
                <View style={settingsStyles.sectionCard}>
                  <Pressable
                    style={settingsStyles.settingsRow}
                    onPress={() => {
                      setCacheCleared(true);
                      setTimeout(() => setCacheCleared(false), 2000);
                    }}>
                    <View style={settingsStyles.settingsRowContent}>
                      <Text style={settingsStyles.settingsRowTitle}>
                        {cacheCleared ? t('ws.data.cacheCleared') : t('ws.data.clearCache')}
                      </Text>
                      <Text style={settingsStyles.settingsRowSub}>
                        {t('ws.data.cacheSub')}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </Modal>

          {/* Devices / sessions modal */}
          <Modal
            visible={devicesOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setDevicesOpen(false)}>
            <View style={settingsStyles.modalScreen}>
              <View style={settingsStyles.modalHeader}>
                <Pressable onPress={() => setDevicesOpen(false)} style={settingsStyles.modalBackBtn}>
                  <Text style={settingsStyles.modalBackText}>{t('nav.back')}</Text>
                </Pressable>
                <Text style={settingsStyles.modalTitle}>{t('settings.devices')}</Text>
                <View style={settingsStyles.modalBackBtn} />
              </View>
              <ScrollView contentContainerStyle={settingsStyles.modalContent}>
                {sessionsPending ? (
                  <Text style={settingsStyles.emptyText}>{t('ws.devices.loading')}</Text>
                ) : sessionsError ? (
                  <Text style={settingsStyles.errorText}>{sessionsError}</Text>
                ) : (
                  <>
                    {sessions.filter(s => s.id !== session.sessionId).length > 0 ? (
                      <>
                        <Pressable
                          style={settingsStyles.dangerButton}
                          onPress={handleRevokeOtherSessions}>
                          <Text style={settingsStyles.dangerButtonLabel}>
                            {t('ws.devices.endAllOthers')}
                          </Text>
                        </Pressable>
                        <Text style={settingsStyles.sectionLabel}>{t('ws.devices.captionOther')}</Text>
                        <View style={settingsStyles.sectionCard}>
                          {sessions
                            .filter(s => s.id !== session.sessionId)
                            .map((s, idx, arr) => (
                              <View key={s.id}>
                                <View style={settingsStyles.sessionRow}>
                                  <View style={settingsStyles.sessionInfo}>
                                    <Text style={settingsStyles.sessionDevice}>{s.deviceName || t('ws.devices.device')}</Text>
                                    <Text style={settingsStyles.sessionMeta}>
                                      {new Date(s.lastUsedAt).toLocaleDateString(getActiveLocale(), {
                                        day: 'numeric', month: 'long', year: 'numeric',
                                      })}
                                    </Text>
                                  </View>
                                  <Pressable
                                    style={[
                                      settingsStyles.revokeBtn,
                                      revokingSessionIds.has(s.id) && {opacity: 0.5},
                                    ]}
                                    disabled={revokingSessionIds.has(s.id)}
                                    onPress={() => handleRevokeSession(s.id)}>
                                    <Text style={settingsStyles.revokeBtnText}>
                                      {revokingSessionIds.has(s.id) ? '...' : t('ws.devices.end')}
                                    </Text>
                                  </Pressable>
                                </View>
                                {idx < arr.length - 1 ? <View style={settingsStyles.rowDivider} /> : null}
                              </View>
                            ))}
                        </View>
                      </>
                    ) : null}

                    <Text style={settingsStyles.sectionLabel}>{t('ws.devices.captionCurrent')}</Text>
                    <View style={settingsStyles.sectionCard}>
                      {sessions.filter(s => s.id === session.sessionId).map(s => (
                        <View key={s.id} style={settingsStyles.sessionRow}>
                          <View style={settingsStyles.sessionInfo}>
                            <Text style={settingsStyles.sessionDevice}>{s.deviceName || t('ws.devices.currentDevice')}</Text>
                            <Text style={settingsStyles.sessionMeta}>
                              {t('ws.devices.activePrefix')}{new Date(s.lastUsedAt).toLocaleDateString(getActiveLocale(), {
                                day: 'numeric', month: 'long', year: 'numeric',
                              })}
                            </Text>
                          </View>
                          <View style={[settingsStyles.revokeBtn, {backgroundColor: 'transparent', borderColor: 'transparent'}]}>
                            <Text style={{color: androidTheme.colors.success, fontSize: 12}}>●</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </Modal>

          <Modal
            visible={editProfileOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setEditProfileOpen(false)}>
            <View style={editStyles.screen}>
              <View style={editStyles.header}>
                <Pressable onPress={() => setEditProfileOpen(false)} style={editStyles.headerBtn}>
                  <Text style={editStyles.headerBtnText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={editStyles.headerTitle}>{t('ws.edit.title')}</Text>
                <Pressable
                  onPress={() => { handleSaveProfile().catch(() => undefined); }}
                  disabled={editPending}
                  style={editStyles.headerBtn}>
                  <Text style={[editStyles.headerBtnText, editStyles.headerBtnAccent]}>
                    {editPending ? '...' : t('ws.edit.done')}
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={editStyles.scrollView}
                contentContainerStyle={editStyles.scrollContent}
                keyboardShouldPersistTaps="handled">

                <View style={editStyles.avatarRow}>
                  <Avatar
                    name={editFirstName || session.user.displayName}
                    avatarUrl={session.user.avatarUrl}
                    size={80}
                  />
                </View>

                <Text style={editStyles.sectionLabel}>{t('ws.edit.captionYourName')}</Text>
                <View style={editStyles.inputCard}>
                  <TextInput
                    style={editStyles.input}
                    value={editFirstName}
                    onChangeText={setEditFirstName}
                    placeholder={t('ws.edit.firstName')}
                    placeholderTextColor={androidTheme.colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    maxLength={40}
                  />
                  <View style={editStyles.inputDivider} />
                  <TextInput
                    style={editStyles.input}
                    value={editLastName}
                    onChangeText={setEditLastName}
                    placeholder={t('ws.edit.lastName')}
                    placeholderTextColor={androidTheme.colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    maxLength={40}
                  />
                </View>

                <Text style={editStyles.sectionLabel}>{t('ws.edit.captionAbout')}</Text>
                <View style={editStyles.inputCard}>
                  <TextInput
                    style={[editStyles.input, editStyles.inputMultiline]}
                    value={editBio}
                    onChangeText={setEditBio}
                    placeholder={t('ws.edit.aboutPlaceholder')}
                    placeholderTextColor={androidTheme.colors.textMuted}
                    multiline
                    maxLength={160}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                </View>
                <Text style={editStyles.inputHint}>{`${editBio.length}/160`}</Text>

                <Text style={editStyles.sectionLabel}>{t('ws.edit.captionUsername')}</Text>
                <View style={editStyles.inputCard}>
                  <View style={editStyles.readonlyRow}>
                    <Text style={editStyles.readonlyValue}>{`@${session.user.username}`}</Text>
                  </View>
                </View>
                <Text style={editStyles.inputHint}>{t('ws.edit.usernameHint')}</Text>
                <View style={editStyles.inputCard}>
                  <TextInput
                    style={editStyles.input}
                    value={usernameChangeInput}
                    onChangeText={text => {
                      setUsernameChangeInput(text);
                      setUsernameChangeInfo(null);
                      setUsernameChangeError(null);
                    }}
                    placeholder={t('ws.edit.newUsernamePlaceholder')}
                    placeholderTextColor={androidTheme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!usernameChangePending}
                    maxLength={24}
                  />
                </View>
                {usernameChangeInput.trim() && usernameChangeInput.trim() !== session.user.username ? (
                  <Pressable
                    onPress={() => { handleChangeUsernameFromEditScreen().catch(() => undefined); }}
                    disabled={usernameChangePending || !usernameChangeInput.trim()}
                    style={[
                      editStyles.resendBtn,
                      (!usernameChangeInput.trim() || usernameChangePending) && {opacity: 0.5},
                    ]}>
                    <Text style={editStyles.resendBtnText}>
                      {usernameChangePending ? t('ws.edit.changingUsername') : t('ws.edit.changeUsername')}
                    </Text>
                  </Pressable>
                ) : null}
                {usernameChangeInfo ? (
                  <Text style={editStyles.verifiedHint}>{usernameChangeInfo}</Text>
                ) : null}
                {usernameChangeError ? (
                  <Text style={editStyles.unverifiedHint}>{usernameChangeError}</Text>
                ) : null}

                <Text style={editStyles.sectionLabel}>{'EMAIL'}</Text>
                <View style={editStyles.inputCard}>
                  <TextInput
                    style={editStyles.input}
                    value={emailChangeInput}
                    onChangeText={text => {
                      setEmailChangeInput(text);
                      setEmailChangeInfo(null);
                      setEmailChangeError(null);
                    }}
                    placeholder={t('ws.edit.emailPlaceholder')}
                    placeholderTextColor={androidTheme.colors.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!emailChangePending}
                  />
                </View>
                {session.user.email && emailChangeInput.trim() === session.user.email ? (
                  <Text style={session.user.emailVerified ? editStyles.verifiedHint : editStyles.unverifiedHint}>
                    {session.user.emailVerified ? t('ws.edit.emailVerified') : t('ws.edit.emailUnverified')}
                  </Text>
                ) : null}
                {emailChangeInput.trim() !== (session.user.email ?? '') ? (
                  <Pressable
                    onPress={() => { handleRequestEmailChangeFromEditScreen().catch(() => undefined); }}
                    disabled={emailChangePending || !emailChangeInput.trim()}
                    style={[
                      editStyles.resendBtn,
                      (!emailChangeInput.trim() || emailChangePending) && {opacity: 0.5},
                    ]}>
                    <Text style={editStyles.resendBtnText}>
                      {emailChangePending ? t('ws.edit.sendingLink') : t('ws.edit.sendLink')}
                    </Text>
                  </Pressable>
                ) : !session.user.emailVerified && session.user.email ? (
                  <Pressable
                    testID="resend-email-verification-button"
                    onPress={() => { handleResendVerificationFromEditScreen().catch(() => undefined); }}
                    disabled={verificationPending}
                    style={editStyles.resendBtn}>
                    <Text style={editStyles.resendBtnText}>
                      {verificationPending ? t('ws.edit.sendingVerification') : t('ws.edit.sendVerification')}
                    </Text>
                  </Pressable>
                ) : null}
                {emailChangeInfo ? (
                  <Text style={editStyles.emailChangeInfo}>{emailChangeInfo}</Text>
                ) : null}
                {emailChangeError ? (
                  <Text style={editStyles.errorText}>{emailChangeError}</Text>
                ) : null}

                {editError ? (
                  <Text style={editStyles.errorText}>{editError}</Text>
                ) : null}

              </ScrollView>
            </View>
          </Modal>
        </View>

        <View
          style={[
            styles.bottomNavWrap,
            {
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}>
          <View style={styles.bottomNav}>
            <BottomTabButton
              icon="💬"
              label={t('ws.tab.chats')}
              active={activeTab === 'chats'}
              onPress={() => handleTabChange('chats')}
              testID="tab-chats"
            />
            <BottomTabButton
              icon="👥"
              label={t('ws.tab.contacts')}
              active={activeTab === 'contacts'}
              onPress={() => handleTabChange('contacts')}
              testID="tab-contacts"
            />
            <BottomTabButton
              icon="📹"
              label={t('ws.tab.calls')}
              active={activeTab === 'settings'}
              onPress={() => handleTabChange('settings')}
              testID="tab-settings"
            />
            <BottomTabButton
              icon={null}
              avatarName={session.user.displayName}
              avatarUrl={session.user.avatarUrl}
              label={t('ws.tab.profile')}
              active={activeTab === 'profile'}
              onPress={() => handleTabChange('profile')}
              testID="tab-profile"
            />
          </View>
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

  return tActive('common.unexpectedError');
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
      return tActive('ws.tab.chats');
    case 'contacts':
      return tActive('ws.tab.contacts');
    case 'settings':
      return tActive('ws.tab.calls');
    case 'profile':
      return tActive('ws.tab.profile');
    default:
      return 'North Messenger';
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

type SelectionBarProps = {
  count: number;
  paddingTop: number;
  onCancel: () => void;
  onMute: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function SelectionBar({
  count,
  paddingTop,
  onCancel,
  onMute,
  onArchive,
  onDelete,
}: SelectionBarProps) {
  return (
    <View style={[styles.selectionBar, {paddingTop}]}>
      <Pressable
        onPress={onCancel}
        style={styles.selectionCancelBtn}
        testID="selection-cancel">
        <Text style={styles.selectionCancelLabel}>✕</Text>
        <Text style={styles.selectionCountLabel}>{count}</Text>
      </Pressable>
      <View style={styles.selectionActions}>
        <Pressable
          onPress={onMute}
          style={styles.selectionActionBtn}
          testID="selection-mute">
          <Text style={styles.selectionActionIcon}>🔕</Text>
        </Pressable>
        <Pressable
          onPress={onArchive}
          style={styles.selectionActionBtn}
          testID="selection-archive">
          <Text style={styles.selectionActionIcon}>📥</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={styles.selectionActionBtn}
          testID="selection-delete">
          <Text style={styles.selectionDeleteIcon}>🗑️</Text>
        </Pressable>
      </View>
    </View>
  );
}

type BottomTabButtonProps = {
  icon: string | null;
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
  avatarName?: string;
  avatarUrl?: string | null;
};

function BottomTabButton({
  icon,
  label,
  active,
  onPress,
  testID,
  avatarName,
  avatarUrl,
}: BottomTabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={active ? styles.bottomTabActive : styles.bottomTab}
      testID={testID}>
      <View style={styles.bottomTabIconWrap}>
        {avatarName != null ? (
          <View style={styles.bottomTabAvatar}>
            <Avatar name={avatarName} avatarUrl={avatarUrl ?? null} size={26} />
            {active ? <View style={styles.bottomTabAvatarRing} /> : null}
          </View>
        ) : (
          <Text style={active ? styles.bottomTabIconActive : styles.bottomTabIcon}>
            {icon}
          </Text>
        )}
      </View>
      <Text
        style={active ? styles.bottomTabLabelActive : styles.bottomTabLabel}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type ChatListItemProps = {
  chat: ChatSummary;
  draft: ChatDraft | null;
  pendingCount: number;
  selected: boolean;
  isSelectionMode: boolean;
  muted?: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onSelect: () => void;
};

function ChatListItem({
  chat,
  draft,
  pendingCount,
  selected,
  isSelectionMode,
  muted = false,
  onOpen,
  onLongPress,
  onSelect,
}: ChatListItemProps) {
  const {t} = useI18n();
  const unreadCount = Math.max(0, chat.unreadCount);
  const snippet = draft
    ? draft.content || t('ws.chat.emptyDraft')
    : chat.lastMessage ||
      chat.pinnedMessage?.preview ||
      t('ws.chat.startMessaging');

  return (
    <Pressable
      onPress={isSelectionMode ? onSelect : onOpen}
      onLongPress={onLongPress}
      style={[styles.chatCard, selected && styles.chatCardSelected]}
      testID={`chat-row-${chat.id}`}>
      <View style={styles.chatAvatarWrap}>
        <Avatar name={chat.title} avatarUrl={chat.avatarUrl} size={52} />
        {isSelectionMode ? (
          <View
            style={[
              styles.selectionCircle,
              selected && styles.selectionCircleSelected,
            ]}>
            {selected ? (
              <Text style={styles.selectionCheckmark}>✓</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.chatCardCopy}>
        <View style={styles.chatCardTopRow}>
          <Text numberOfLines={1} style={styles.chatCardTitle}>
            {chat.title}
          </Text>
          <View style={styles.chatCardTimeRow}>
            {muted ? (
              <Text style={styles.chatCardMutedIcon}>🔕</Text>
            ) : null}
            <Text style={styles.chatCardTime}>
              {formatRelativeMessageTime(chat.lastMessageAt ?? chat.updatedAt)}
            </Text>
          </View>
        </View>
        <View style={styles.chatCardBottomRow}>
          <View style={styles.chatCardSnippetRow}>
            {draft ? (
              <Text style={styles.chatCardDraftPrefix}>{t('ws.chat.draftPrefix')}</Text>
            ) : pendingCount > 0 ? (
              <Text style={styles.chatCardPendingPrefix}>⏳ </Text>
            ) : chat.pinnedMessage ? (
              <Text style={styles.chatCardPinPrefix}>📌 </Text>
            ) : null}
            <Text
              numberOfLines={1}
              style={
                draft ? styles.chatCardSnippetDraft : styles.chatCardSnippet
              }>
              {snippet}
            </Text>
          </View>
          <View style={styles.chatCardSide}>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeLabel}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : chat.reactionAttention ? (
              <Text style={styles.chatReactionDot}>🔔</Text>
            ) : null}
          </View>
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

type SwipeableChatItemProps = ChatListItemProps & {
  swipeLabel: string;
  swipeIcon: string;
  swipeBgColor: string;
  swipeLabelColor: string;
  onSwipeAction: () => void;
};

function SwipeableChatItem(props: SwipeableChatItemProps) {
  const {swipeLabel, swipeIcon, swipeBgColor, swipeLabelColor, onSwipeAction, ...chatProps} = props;
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, {dx, dy}) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.8,
      onPanResponderMove: (_, {dx}) => {
        if (dx < 0) {
          translateX.setValue(Math.max(dx, -(UNARCHIVE_BTN_W + 60)));
        }
      },
      onPanResponderRelease: (_, {dx, vx}) => {
        const pastThreshold =
          dx < -UNARCHIVE_THRESHOLD || (dx < -UNARCHIVE_BTN_W && vx < -0.6);
        if (pastThreshold) {
          Animated.timing(translateX, {
            toValue: -500,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            onSwipeAction();
            translateX.setValue(0);
          });
        } else {
          Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
      },
    }),
  ).current;

  const btnOpacity = translateX.interpolate({
    inputRange: [-(UNARCHIVE_BTN_W + 60), -10, 0],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[
          styles.swipeActionBtn,
          {backgroundColor: swipeBgColor, opacity: btnOpacity},
        ]}>
        <Pressable onPress={onSwipeAction} style={styles.swipeActionBtnInner}>
          <Text style={[styles.swipeActionIcon, {color: swipeLabelColor}]}>
            {swipeIcon}
          </Text>
          <Text style={[styles.swipeActionLabel, {color: swipeLabelColor}]}>
            {swipeLabel}
          </Text>
        </Pressable>
      </Animated.View>
      <Animated.View
        style={{transform: [{translateX}]}}
        {...panResponder.panHandlers}>
        <ChatListItem {...chatProps} />
      </Animated.View>
    </View>
  );
}

type ProfileListItemProps = {
  profile: UserProfile;
  actions?: ProfileRowAction[];
};

function ProfileListItem({profile, actions = []}: ProfileListItemProps) {
  const {t} = useI18n();
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
            (profile.online ? t('ws.profile.onlineNow') : t('ws.profile.noDetails'))}
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

// ─── Conference Calendar ──────────────────────────────────────────────────────

const WEEKDAYS_BY_LOCALE: Record<Locale, string[]> = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};
const MONTH_NAMES_BY_LOCALE: Record<Locale, string[]> = {
  ru: [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

function getWeekdays(): string[] {
  return WEEKDAYS_BY_LOCALE[getActiveLocale()] ?? WEEKDAYS_BY_LOCALE.ru;
}

function getMonthNames(): string[] {
  return MONTH_NAMES_BY_LOCALE[getActiveLocale()] ?? MONTH_NAMES_BY_LOCALE.ru;
}

function toLocalDateKey(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type ConferenceCalendarProps = {
  year: number;
  month: number;
  selectedDay: string | null;
  conferences: VideoConference[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (key: string) => void;
  onOpenConference: (id: string) => void;
  onClose: () => void;
};

function ConferenceCalendar({
  year, month, selectedDay, conferences,
  onPrevMonth, onNextMonth, onSelectDay, onOpenConference, onClose,
}: ConferenceCalendarProps) {
  const {t} = useI18n();
  const today = new Date();
  const todayKey = toLocalDateKey(today.toISOString());

  // Map day-key → conferences
  const byDay = useMemo(() => {
    const map = new Map<string, VideoConference[]>();
    for (const c of conferences) {
      const key = toLocalDateKey(c.scheduledAt);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [conferences]);

  // Build grid: Monday-first weeks
  const firstOfMonth = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // 0=Sun…6=Sat → convert to Mon-first index (0=Mon…6=Sun)
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array(startOffset).fill(null),
    ...Array.from({length: lastDay}, (_, i) => i + 1),
  ];
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dayKey = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`;

  const selectedConferences = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <View style={calStyles.screen}>
      {/* Header */}
      <View style={calStyles.header}>
        <Pressable onPress={onClose} style={calStyles.closeBtn}>
          <Text style={calStyles.closeBtnLabel}>✕</Text>
        </Pressable>
        <Text style={calStyles.headerTitle}>{t('ws.cal.title')}</Text>
      </View>

      {/* Month navigation */}
      <View style={calStyles.monthNav}>
        <Pressable onPress={onPrevMonth} style={calStyles.navBtn}>
          <Text style={calStyles.navBtnLabel}>‹</Text>
        </Pressable>
        <Text style={calStyles.monthLabel}>
          {getMonthNames()[month]} {year}
        </Text>
        <Pressable onPress={onNextMonth} style={calStyles.navBtn}>
          <Text style={calStyles.navBtnLabel}>›</Text>
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={calStyles.weekRow}>
        {getWeekdays().map(w => (
          <Text key={w} style={calStyles.weekDay}>{w}</Text>
        ))}
      </View>

      {/* Days grid */}
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={calStyles.cell} />;
          }
          const key = dayKey(day);
          const hasConf = byDay.has(key);
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <Pressable
              key={key}
              style={[
                calStyles.cell,
                isToday && calStyles.cellToday,
                isSelected && calStyles.cellSelected,
              ]}
              onPress={() => onSelectDay(key)}>
              <Text style={[
                calStyles.cellDay,
                isToday && calStyles.cellDayToday,
                isSelected && calStyles.cellDaySelected,
              ]}>
                {day}
              </Text>
              {hasConf ? (
                <View style={[
                  calStyles.dot,
                  isSelected && calStyles.dotSelected,
                ]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Selected day conferences */}
      <ScrollView style={calStyles.dayList} contentContainerStyle={calStyles.dayListContent}>
        {selectedDay === null ? (
          <Text style={calStyles.dayListHint}>{t('ws.cal.pickDay')}</Text>
        ) : selectedConferences.length === 0 ? (
          <Text style={calStyles.dayListHint}>{t('ws.cal.noConfThatDay')}</Text>
        ) : (
          selectedConferences.map(c => (
            <Pressable
              key={c.id}
              style={calStyles.confItem}
              onPress={() => onOpenConference(c.id)}>
              <View style={calStyles.confItemDot} />
              <View style={calStyles.confItemCopy}>
                <Text style={calStyles.confItemTitle}>{c.title}</Text>
                <Text style={calStyles.confItemTime}>
                  {new Date(c.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  {c.endedAt ? t('ws.cal.statusEnded') : c.startedAt ? t('ws.cal.statusOngoing') : t('ws.cal.statusScheduled')}
                </Text>
              </View>
              <Text style={calStyles.confItemArrow}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const calStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: androidTheme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  closeBtnLabel: {
    fontSize: 16,
    color: androidTheme.colors.textPrimary,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
    flex: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  navBtnLabel: {
    fontSize: 22,
    color: androidTheme.colors.textPrimary,
    fontWeight: '700',
    lineHeight: 26,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textMuted,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellToday: {
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: androidTheme.colors.blue,
  },
  cellSelected: {
    borderRadius: 50,
    backgroundColor: androidTheme.colors.blueStrong,
    borderWidth: 0,
  },
  cellDay: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
  },
  cellDayToday: {
    color: androidTheme.colors.blue,
    fontWeight: '800',
  },
  cellDaySelected: {
    color: '#fff',
    fontWeight: '800',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: androidTheme.colors.blue,
  },
  dotSelected: {
    backgroundColor: '#fff',
  },
  dayList: {
    flex: 1,
    marginTop: 8,
  },
  dayListContent: {
    padding: 16,
    gap: 10,
  },
  dayListHint: {
    textAlign: 'center',
    color: androidTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 24,
  },
  confItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: androidTheme.colors.surface,
    borderRadius: androidTheme.radius.card,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    padding: 14,
    gap: 12,
  },
  confItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: androidTheme.colors.blueStrong,
    flexShrink: 0,
  },
  confItemCopy: {
    flex: 1,
    gap: 3,
  },
  confItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  confItemTime: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  confItemArrow: {
    fontSize: 20,
    color: androidTheme.colors.textMuted,
    fontWeight: '700',
  },
});

// ─── Conference List Item ──────────────────────────────────────────────────────

type ConferenceListItemProps = {
  conference: VideoConference;
  onOpen: () => void;
};

function ConferenceListItem({conference, onOpen}: ConferenceListItemProps) {
  const {t, tp} = useI18n();
  return (
    <View style={styles.conferenceCard}>
      <View style={styles.conferenceCardCopy}>
        <Text style={styles.conferenceCardTitle}>{conference.title}</Text>
        <Text style={styles.conferenceCardMeta}>
          {tp('ws.confItem.participants', conference.participants.length)} •{' '}
          {formatRelativeMessageTime(conference.scheduledAt)}
        </Text>
        <Text style={styles.conferenceCardHint}>
          {conference.endedAt
            ? t('ws.confItem.ended')
            : conference.startedAt
              ? t('ws.confItem.ongoing')
              : conference.chatId
                ? t('ws.confItem.linkedGroup')
                : t('ws.confItem.awaiting')}
        </Text>
      </View>
      <Pressable
        onPress={onOpen}
        style={styles.inlineActionPrimary}
        testID={`open-conference-${conference.id}`}>
        <Text style={styles.inlineActionPrimaryLabel}>{t('ws.open')}</Text>
      </Pressable>
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
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  appBarTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  appBarActions: {
    flexDirection: 'row',
    gap: 4,
  },
  appBarIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  appBarIcon: {
    fontSize: 18,
    color: androidTheme.colors.textPrimary,
  },
  appBarMenuDots: {
    fontSize: 22,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
    letterSpacing: 2,
  },
  appBarSearchInput: {
    flex: 1,
    height: 42,
    color: androidTheme.colors.textPrimary,
    fontSize: 16,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 21,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuPopover: {
    position: 'absolute',
    top: 80,
    right: 16,
    minWidth: 180,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
    ...androidTheme.shadow,
  },
  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  menuItemLabel: {
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
  },
  searchResultsHeading: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  searchResultsCount: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: androidTheme.colors.textMuted,
  },
  chatListContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    gap: 2,
  },
  filterScrollRow: {
    marginBottom: 6,
  },
  filterScrollContent: {
    paddingHorizontal: 4,
    gap: 8,
    flexDirection: 'row',
  },
  archivedDivider: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginTop: 6,
  },
  archivedDividerLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: androidTheme.colors.textMuted,
  },
  settingsSectionLabel: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  settingsSectionLabelText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: androidTheme.colors.textMuted,
  },
  bottomTabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  bottomTabIconActive: {
    fontSize: 22,
  },
  bottomTabAvatar: {
    position: 'relative',
    width: 26,
    height: 26,
  },
  bottomTabAvatarRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: androidTheme.colors.blueStrong,
  },
  searchButton: {
    minWidth: 98,
    minHeight: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  searchButtonDisabled: {
    minWidth: 98,
    minHeight: 46,
    borderRadius: 18,
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
  hidden: {
    display: 'none',
  },
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  sectionHeading: {
    gap: 5,
    paddingTop: 4,
  },
  sectionHeadingCompact: {
    gap: 5,
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  sectionTitleSmall: {
    fontSize: 17,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: androidTheme.colors.textSecondary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 10,
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 10,
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.blueSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textMuted,
  },
  filterChipLabelActive: {
    fontSize: 13,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  filterChipCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  filterChipCountActive: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  filterChipCountLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.textSecondary,
  },
  filterChipCountLabelActive: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.textInverse,
  },
  bottomNavWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: androidTheme.colors.background,
  },
  bottomNav: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 26,
    backgroundColor: androidTheme.colors.backgroundElevated,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    ...androidTheme.shadow,
  },
  bottomTab: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  bottomTabActive: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: androidTheme.colors.blueSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
  },
  bottomTabIconWrap: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: androidTheme.colors.textMuted,
    marginTop: 3,
  },
  bottomTabLabelActive: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.blue,
    marginTop: 3,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
  },
  chatCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  chatCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  chatBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chatBadgeDraft: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: androidTheme.colors.dangerSoft,
  },
  chatBadgeDraftLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.danger,
  },
  chatBadgeMuted: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  chatBadgeMutedLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.textSecondary,
  },
  chatBadgeWarning: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: androidTheme.colors.warningSoft,
  },
  chatBadgeWarningLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.warning,
  },
  chatBadgePrimary: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: androidTheme.colors.blueSoft,
  },
  chatBadgePrimaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  chatCardTime: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
    flexShrink: 0,
  },
  chatCardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatCardMutedIcon: {
    fontSize: 11,
    opacity: 0.7,
  },
  chatCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatCardSnippetRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  chatCardDraftPrefix: {
    fontSize: 14,
    color: androidTheme.colors.danger,
    flexShrink: 0,
  },
  chatCardPendingPrefix: {
    fontSize: 13,
    flexShrink: 0,
  },
  chatCardPinPrefix: {
    fontSize: 13,
    flexShrink: 0,
  },
  chatCardSnippet: {
    flex: 1,
    fontSize: 14,
    color: androidTheme.colors.textSecondary,
  },
  chatCardSnippetDraft: {
    flex: 1,
    fontSize: 14,
    color: androidTheme.colors.danger,
  },
  chatReactionDot: {
    fontSize: 14,
  },
  chatCardSelected: {
    backgroundColor: androidTheme.colors.blueSoft,
  },
  chatAvatarWrap: {
    position: 'relative',
  },
  selectionCircle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 2,
    borderColor: androidTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCircleSelected: {
    backgroundColor: androidTheme.colors.blueStrong,
    borderColor: androidTheme.colors.blueStrong,
  },
  selectionCheckmark: {
    fontSize: 10,
    fontWeight: '800',
    color: androidTheme.colors.textInverse,
    lineHeight: 14,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  selectionCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectionCancelLabel: {
    fontSize: 20,
    color: androidTheme.colors.textPrimary,
    fontWeight: '700',
  },
  selectionCountLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 4,
  },
  selectionActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  selectionActionIcon: {
    fontSize: 20,
  },
  selectionDeleteIcon: {
    fontSize: 20,
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
  chatCardSide: {
    alignItems: 'center',
    flexShrink: 0,
  },
  smallAction: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
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
    ...androidTheme.shadow,
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
    ...androidTheme.shadow,
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
  profileTabContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 16,
    alignItems: 'center',
  },
  profileHeroNew: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
    width: '100%',
  },
  profileNameNew: {
    fontSize: 22,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
    marginTop: 4,
  },
  profileOnlineStatus: {
    fontSize: 14,
    color: androidTheme.colors.blue,
  },
  profileActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  profileActionItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  profileActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
  },
  profileActionIconText: {
    fontSize: 20,
  },
  profileActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: androidTheme.colors.textSecondary,
    textAlign: 'center',
  },
  profileInfoCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
  },
  profileInfoRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
  },
  profileInfoValue: {
    fontSize: 16,
    color: androidTheme.colors.textPrimary,
    fontWeight: '500',
  },
  profileInfoMeta: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
  },
  profileInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: androidTheme.colors.border,
    marginLeft: 16,
  },
  profilePubTabsRow: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
  },
  profilePubTabActive: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
    borderBottomWidth: 2,
    borderBottomColor: androidTheme.colors.blue,
  },
  profilePubTabLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.blue,
  },
  profilePubTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  profilePubTabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: androidTheme.colors.textMuted,
  },
  logoutButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 90, 0.2)',
  },
  logoutButtonLabel: {
    color: androidTheme.colors.danger,
    fontSize: 15,
    fontWeight: '800',
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
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  swipeActionBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: UNARCHIVE_BTN_W,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeActionBtnInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeActionIcon: {
    fontSize: 18,
  },
  swipeActionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  archiveRowDismissBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 4,
    width: 64,
    borderRadius: 16,
    backgroundColor: androidTheme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveRowDismissIcon: {
    fontSize: 18,
    color: androidTheme.colors.textSecondary,
    fontWeight: '600',
  },
  archiveRevealRow: {
    height: ARCHIVE_ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    marginBottom: 4,
  },
  archiveRevealIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
  },
  archiveRevealIconText: {
    fontSize: 20,
  },
  archiveRevealLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
  },
  archiveBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  archiveBackArrow: {
    fontSize: 22,
    color: androidTheme.colors.textPrimary,
    fontWeight: '700',
  },
  archiveBackText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  archiveBackCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
  },
  archiveBackCountLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: androidTheme.colors.textMuted,
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
  conferenceToolbar: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  confToolbarBtn: {
    height: 38,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  confToolbarBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  confToolbarBtnPrimary: {
    height: 38,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.blue,
  },
  confToolbarBtnPrimaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.blue,
  },
  confToolbarBtnAccent: {
    height: 38,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  confToolbarBtnAccentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textInverse,
  },
  confModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confModalCard: {
    width: '100%',
    backgroundColor: androidTheme.colors.surface,
    borderRadius: androidTheme.radius.cardLarge,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    padding: 20,
    gap: 10,
    ...androidTheme.shadow,
  },
  confModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
    marginBottom: 4,
  },
  confModalLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: androidTheme.colors.textMuted,
    marginTop: 4,
  },
  confModalInput: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    backgroundColor: androidTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
  },
  confModalError: {
    fontSize: 13,
    color: androidTheme.colors.danger,
    backgroundColor: androidTheme.colors.dangerSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  confModalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  confModalCancelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  confModalSubmitBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  confModalSubmitDisabled: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  confModalSubmitLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: androidTheme.colors.textInverse,
  },
  confMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  confMenuCard: {
    position: 'absolute',
    top: 56,
    right: 12,
    minWidth: 200,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
    ...androidTheme.shadow,
  },
  confMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  confMenuItemIcon: {
    fontSize: 16,
    color: androidTheme.colors.blue,
    width: 20,
    textAlign: 'center',
  },
  confMenuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
  },
  confMenuDivider: {
    height: 1,
    backgroundColor: androidTheme.colors.border,
    marginHorizontal: 12,
  },
  confModalParticipantsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    backgroundColor: androidTheme.colors.surfaceMuted,
    paddingHorizontal: 14,
  },
  confModalParticipantsBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
  },
  confModalParticipantsChevron: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  confContactList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
    maxHeight: 220,
  },
  confContactEmpty: {
    padding: 14,
    fontSize: 13,
    color: androidTheme.colors.textMuted,
    textAlign: 'center',
  },
  confContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: androidTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
  },
  confContactItemSelected: {
    backgroundColor: 'rgba(80,136,255,0.1)',
  },
  confContactCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: androidTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confContactCheckSelected: {
    backgroundColor: androidTheme.colors.blueStrong,
    borderColor: androidTheme.colors.blueStrong,
  },
  confContactCheckMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  confContactInfo: {
    flex: 1,
    gap: 1,
  },
  confContactName: {
    fontSize: 14,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  confContactUsername: {
    fontSize: 12,
    color: androidTheme.colors.textSecondary,
  },
});

const editStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: androidTheme.colors.border,
    backgroundColor: androidTheme.colors.surface,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  headerBtn: {
    minWidth: 60,
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerBtnText: {
    fontSize: 16,
    color: androidTheme.colors.blue,
  },
  headerBtnAccent: {
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    gap: 6,
  },
  avatarRow: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: androidTheme.colors.textMuted,
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 6,
    paddingLeft: 4,
  },
  inputCard: {
    borderRadius: 18,
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: androidTheme.colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: androidTheme.colors.border,
    marginLeft: 16,
  },
  inputHint: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
    paddingLeft: 4,
    marginTop: 4,
  },
  readonlyRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  readonlyRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  readonlyValue: {
    fontSize: 16,
    color: androidTheme.colors.textSecondary,
  },
  verifiedBadge: {
    fontSize: 12,
    color: androidTheme.colors.success,
    fontWeight: '600',
  },
  unverifiedBadge: {
    fontSize: 12,
    color: androidTheme.colors.warning,
    fontWeight: '600',
  },
  resendBtn: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  resendBtnText: {
    fontSize: 14,
    color: androidTheme.colors.blue,
  },
  errorText: {
    fontSize: 14,
    color: androidTheme.colors.danger,
    marginTop: 12,
    textAlign: 'center',
  },
  emailChangeInfo: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
    marginTop: 10,
    lineHeight: 18,
    textAlign: 'center',
  },
  verifiedHint: {
    fontSize: 13,
    color: androidTheme.colors.success,
    marginTop: 6,
    marginLeft: 4,
  },
  unverifiedHint: {
    fontSize: 13,
    color: androidTheme.colors.warm,
    marginTop: 6,
    marginLeft: 4,
  },
});

const settingsStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topBarTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  menuBtnText: {
    fontSize: 24,
    color: androidTheme.colors.textSecondary,
    lineHeight: 28,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 12,
  },
  menuDropdown: {
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 12,
    minWidth: 160,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemTextDanger: {
    fontSize: 15,
    color: androidTheme.colors.danger,
    fontWeight: '600',
  },
  settingsProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    gap: 14,
  },
  settingsProfileInfo: {
    flex: 1,
    gap: 3,
  },
  settingsProfileName: {
    fontSize: 17,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  settingsProfileSub: {
    fontSize: 13,
    color: androidTheme.colors.textSecondary,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlayText: {
    fontSize: 24,
  },
  sectionCard: {
    backgroundColor: androidTheme.colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: androidTheme.colors.textMuted,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingsIconText: {
    fontSize: 18,
  },
  settingsRowContent: {
    flex: 1,
  },
  settingsRowTitle: {
    fontSize: 16,
    color: androidTheme.colors.textPrimary,
    fontWeight: '500',
  },
  settingsRowSub: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
    marginTop: 2,
  },
  settingsChevron: {
    fontSize: 22,
    color: androidTheme.colors.textMuted,
    fontWeight: '300',
  },
  rowDivider: {
    height: 1,
    backgroundColor: androidTheme.colors.border,
    marginLeft: 66,
  },
  checkmark: {
    fontSize: 18,
    color: androidTheme.colors.blue,
    fontWeight: '700',
  },
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  bgOption: {
    width: '30%',
    aspectRatio: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 6,
  },
  bgOptionSelected: {
    borderColor: androidTheme.colors.blue,
  },
  bgOptionLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textAlign: 'center',
  },
  bgCheckmark: {
    fontSize: 16,
    color: androidTheme.colors.blue,
    fontWeight: '800',
  },
  modalScreen: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: androidTheme.colors.border,
  },
  modalBackBtn: {
    minWidth: 80,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  modalBackText: {
    fontSize: 16,
    color: androidTheme.colors.blue,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: androidTheme.colors.textPrimary,
  },
  modalContent: {
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: androidTheme.colors.textMuted,
    marginTop: 40,
    fontSize: 15,
  },
  errorText: {
    textAlign: 'center',
    color: androidTheme.colors.danger,
    marginTop: 40,
    fontSize: 15,
    marginHorizontal: 24,
  },
  dangerButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: androidTheme.colors.dangerSoft,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: androidTheme.colors.danger,
  },
  dangerButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: androidTheme.colors.danger,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDevice: {
    fontSize: 15,
    color: androidTheme.colors.textPrimary,
    fontWeight: '500',
  },
  sessionMeta: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
    marginTop: 2,
  },
  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: androidTheme.colors.danger,
  },
  revokeBtnText: {
    fontSize: 13,
    color: androidTheme.colors.danger,
    fontWeight: '600',
  },
});

const notifStyles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    gap: 14,
  },
  toggleRowContent: {
    flex: 1,
    gap: 2,
  },
  toggleRowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: androidTheme.colors.textPrimary,
  },
  toggleRowSub: {
    fontSize: 13,
    color: androidTheme.colors.textMuted,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: androidTheme.colors.border,
  },
  chatInfo: {
    flex: 1,
    gap: 2,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: androidTheme.colors.textPrimary,
  },
  chatStatus: {
    fontSize: 12,
    color: androidTheme.colors.textMuted,
  },
  togglesRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  toggleItem: {
    alignItems: 'center',
    gap: 4,
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: androidTheme.colors.textMuted,
    textAlign: 'center',
  },
  toggleLabelDisabled: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
  },
  switchControl: {
    transform: [{scaleX: 0.8}, {scaleY: 0.8}],
  },
});
