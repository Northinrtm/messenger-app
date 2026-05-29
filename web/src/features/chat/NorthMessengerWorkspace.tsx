import {
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type ComponentProps,
  useEffect,
  useEffectEvent,
  type CSSProperties,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  acceptInviteLink as acceptInviteLinkRequest,
  addContact as addContactRequest,
  addConferenceParticipants as addConferenceParticipantsRequest,
  addGroupParticipants,
  clearConferencePresence as clearConferencePresenceRequest,
  fetchConferenceJitsiToken,
  createConferenceInviteLink as createConferenceInviteLinkRequest,
  createGroupInviteLink as createGroupInviteLinkRequest,
  createVideoConference as createVideoConferenceRequest,
  deleteMailMessage as deleteMailMessageRequest,
  downloadChatAttachment,
  getMailMessage as getMailMessageRequest,
  getWorkspaceBootstrap,
  deleteOwnAccount as deleteOwnAccountRequest,
  deleteChat as deleteChatRequest,
  describeError,
  endVideoConference as endVideoConferenceRequest,
  createDirectChat,
  createGroupChat,
  listGroupBans as listGroupBansRequest,
  sendMail as sendMailRequest,
  touchConferencePresence as touchConferencePresenceRequest,
  updatePinnedMessage as updatePinnedMessageRequest,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  updateArchivedChat,
  requestEmailChange,
  updateProfile,
  updateProfileAvatar,
} from "../../lib/api";
import { JITSI_BASE_URL } from "../../lib/config";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  isPushNotificationSupported,
  syncPushSubscription,
  type PushNotificationClientState,
} from "../../lib/pushNotifications";
import { rememberCurrentBuildRevision } from "../../lib/messageHydrationDiagnostics";
import type {
  AuthResponse,
  ChatMessage,
  ChatMessageAttachment,
  ChatPrejoinHistoryPolicy,
  MailMessageDetail,
  MessageReaction,
  ChatSummary,
  Participant,
  SourceMessageJumpTarget,
  UserProfile,
  UserSessionInfo,
  VideoConference,
} from "../../lib/types";
import {
  buildMessagesQueryKey,
  clearChatUnreadCount,
  getChatPinnedMessages,
  getMessageIdentityKey,
  removeChatById,
  upsertChat,
} from "./chatState";
import { formatTypingParticipants } from "./typingState";
import { buildReadableIncomingMessageIdsKey } from "./hooks/messageReadVisibility";
import {
  createInitialConferenceDateTime,
  createMinimumConferenceDateTime,
  describeChat,
  describeConferenceRole,
  formatChatTimestamp,
  formatClock,
  formatConferenceListPreview,
  formatConferenceOrganizerLabel,
  formatConferenceSchedule,
  formatConferenceStageHint,
  formatConferenceStatusLabel,
  formatConferenceTileTime,
  formatMemberCount,
  formatProfileDate,
  formatSessionTime,
  formatToastPreview,
  getDirectParticipant,
  mergeVideoConferenceCollections,
  mergeConferenceCandidates,
  removeVideoConference,
  trimPreview,
  upsertVideoConferences,
} from "./chatPresentation";
import {
  buildConferenceActivitySnapshot,
  buildTimeline,
  extractImageFromClipboard,
  hasConferenceActivitySinceSeen,
  hasUnreadChatActivitySince,
  isCurrentUserParticipant,
  isConferenceActivitySnapshotEqual,
  mergeTypingParticipants,
  normalizeAccountDeletionConfirmation,
  readFileAsDataUrl,
  syncChatTypingParticipants,
  getLatestUnreadChatActivityAt,
  type TimelineItem,
} from "./chatWorkspaceUtils";
import {
  buildChatListPreviewText,
  buildMessagePreview,
  ensureOwnMessageStatus,
  getMessageReaction,
  getMessageStatusClassName,
  getMessageStatusGlyph,
  getMessageStatusLabel,
  getReactionOption,
  isOwnMessage,
  MESSAGE_REACTION_OPTIONS,
  toMessageSnippet,
} from "./messagePresentation";
import { type ConferenceRecordingState } from "./ManagedConferenceStage";
import { ActiveChatConversation } from "./components/ActiveChatConversation";
import { buildAttachmentMessageJumpCursor } from "./components/ChatAttachmentBrowserSheet";
import { ChatMembersPanel } from "./components/ChatMembersPanel.next";
import { ChatMenuPanel } from "./components/ChatMenuPanel";
import { ChatListPanel } from "./components/ChatListPanel";
import { MessageContextMenu } from "./components/MessageContextMenu";
import { SidebarManagementSheets } from "./components/SidebarManagementSheets";
import { SidebarMenuOverlay } from "./components/SidebarMenuOverlay";
import { SidebarUtilitySheets } from "./components/SidebarUtilitySheets";
import { WorkspaceConversation } from "./components/WorkspaceConversation";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { MENU_ACTIONS, type ConversationListTab, type MenuActionId, type SidebarSheet } from "./chatUi";
import { useContextMenu } from "./hooks/useContextMenu";
import { useChatPreviews } from "./hooks/useChatPreviews";
import { useChatDrafts } from "./hooks/useChatDrafts";
import { useDismissiblePanel } from "./hooks/useDismissiblePanel";
import { useWorkspaceEffects } from "./hooks/useWorkspaceEffects";
import { useWorkspaceFormActions } from "./hooks/useWorkspaceFormActions";
import { useIncomingToasts } from "./hooks/useIncomingToasts";
import { useMessageActions } from "./hooks/useMessageActions";
import { useMessageStreamNavigation } from "./hooks/useMessageStreamNavigation";
import { useMessageReceipts } from "./hooks/useMessageReceipts";
import { useWorkspacePanelActions } from "./hooks/useWorkspacePanelActions";
import { useRealtimeChatSubscription } from "./hooks/useRealtimeChatSubscription";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useTypingSignals } from "./hooks/useTypingSignals";
import { useWorkspaceMutations } from "./hooks/useWorkspaceMutations";
import { useWorkspaceQueries } from "./hooks/useWorkspaceQueries";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";
import { shouldListChat, useWorkspaceStatus } from "./hooks/useWorkspaceStatus";
import {
  readWorkspaceNavigationState,
  writeWorkspaceNavigationState,
  type ConferenceViewportMode,
  type MobilePane,
} from "./workspaceNavigationPersistence";
import { shouldAutoReloadForBuildUpdate } from "./buildUpdateGuard";

type Props = {
  pendingInviteCode: string | null;
  onPendingInviteHandled: () => void;
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

const TYPING_EVENT_TTL_MS = 8_000;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 8_000;
const TYPING_MIN_VISIBLE_MS = 1_200;
const MESSAGE_QUERY_GC_TIME_MS = 30 * 60_000;
const TYPING_QUERY_GC_TIME_MS = 15_000;
const SEARCH_QUERY_GC_TIME_MS = 30_000;
const CONFERENCE_ACTIVATION_LEAD_MS = 5 * 60 * 1000;
const BUILD_META_POLL_MS = 60_000;
const BUILD_UPDATE_AUTO_RELOAD_DELAY_MS = 1_500;
const WORKSPACE_BOOTSTRAP_STALE_TIME_MS = 15_000;
const initialPushNotificationState = (): PushNotificationClientState => ({
  supported: isPushNotificationSupported(),
  serverEnabled: false,
  subscribed: false,
  permission: isPushNotificationSupported() ? Notification.permission : "unsupported",
});

type BuildRevisionMeta = {
  revision: string;
  builtAt: string | null;
};

function buildInviteUrl(code: string) {
  if (typeof window === "undefined") {
    return `/j/${code}`;
  }

  return new URL(`/j/${code}`, window.location.origin).toString();
}

export function NorthMessengerWorkspace({
  pendingInviteCode,
  onPendingInviteHandled,
  session,
  onSessionChange,
}: Props) {
  const queryClient = useQueryClient();
  const [initialNavigationState] = useState(() =>
    readWorkspaceNavigationState(session.user.id)
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(
    initialNavigationState.activeChatId
  );
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(
    initialNavigationState.activeConferenceId
  );
  const [conferenceViewportMode, setConferenceViewportMode] = useState<ConferenceViewportMode>(
    initialNavigationState.conferenceViewportMode
  );
  const [activeListTab, setActiveListTab] = useState<ConversationListTab>(
    normalizeConversationListTabForProfile(
      initialNavigationState.activeListTab,
      session.user.mailEnabled
    )
  );
  const [conferenceBrowserMode, setConferenceBrowserMode] = useState<"list" | "calendar">("list");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isChatMembersOpen, setIsChatMembersOpen] = useState(false);
  const [sidebarSheet, setSidebarSheet] = useState<SidebarSheet>(null);
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDetailsTitle, setGroupDetailsTitle] = useState("");
  const [groupDetailsAvatarUrl, setGroupDetailsAvatarUrl] = useState<string | null>(null);
  const [groupDetailsPrejoinHistoryPolicy, setGroupDetailsPrejoinHistoryPolicy] =
    useState<ChatPrejoinHistoryPolicy>("FULL_HISTORY");
  const [conferenceTitle, setConferenceTitle] = useState("");
  const [conferenceScheduledAt, setConferenceScheduledAt] = useState(() =>
    createInitialConferenceDateTime()
  );
  const [conferenceComposerMode, setConferenceComposerMode] = useState<"instant" | "scheduled" | null>(null);
  const [conferenceEditingId, setConferenceEditingId] = useState<string | null>(null);
  const [conferenceChatId, setConferenceChatId] = useState<string | null>(null);
  const [conferenceParticipantUsernames, setConferenceParticipantUsernames] = useState<string[]>([]);
  const [conferenceInviteUsernames, setConferenceInviteUsernames] = useState<string[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState(session.user.displayName);
  const [profileProfession, setProfileProfession] = useState(session.user.profession ?? "");
  const [activeMailMessageId, setActiveMailMessageId] = useState<string | null>(null);
  const [mailComposing, setMailComposing] = useState(false);
  const [mailFolder, setMailFolder] = useState<"inbox" | "sent">("inbox");
  const [mailSendError, setMailSendError] = useState<string | null>(null);
  const [mailReplyTo, setMailReplyTo] = useState<{ to: string; subject: string } | null>(null);
  const [emailChangeInput, setEmailChangeInput] = useState("");
  const [usernameChangeInput, setUsernameChangeInput] = useState("");
  const [passwordChangeCurrent, setPasswordChangeCurrent] = useState("");
  const [passwordChangeNext, setPasswordChangeNext] = useState("");
  const [passwordChangeConfirm, setPasswordChangeConfirm] = useState("");
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [isGroupCreatePickerOpen, setIsGroupCreatePickerOpen] = useState(false);
  const [isGroupInvitePickerOpen, setIsGroupInvitePickerOpen] = useState(false);
  const [pendingOutgoingCountByChatId, setPendingOutgoingCountByChatId] = useState<Record<string, number>>({});
  const [contactSearch, setContactSearch] = useState("");
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>(initialNavigationState.mobilePane);
  const [hasExplicitlyOpenedActiveChatThisSession, setHasExplicitlyOpenedActiveChatThisSession] =
    useState(() => Boolean(initialNavigationState.activeChatId));
  const [isConferenceInfoOpen, setIsConferenceInfoOpen] = useState(false);
  const [conferenceRecordingState, setConferenceRecordingState] =
    useState<ConferenceRecordingState>("idle");
  const [conferenceExitRequestToken, setConferenceExitRequestToken] = useState(0);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [activePinnedMessageId, setActivePinnedMessageId] = useState<string | null>(null);
  const [forwardingMessageIds, setForwardingMessageIds] = useState<string[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isDeleteSelectedMessagesDialogOpen, setIsDeleteSelectedMessagesDialogOpen] =
    useState(false);
  const [groupInviteCodesByChatId, setGroupInviteCodesByChatId] = useState<Record<string, string>>({});
  const [conferenceInviteCodesById, setConferenceInviteCodesById] = useState<Record<string, string>>({});
  const [pushNotificationState, setPushNotificationState] =
    useState<PushNotificationClientState>(initialPushNotificationState);
  const [pushNotificationPending, setPushNotificationPending] = useState(false);
  const [pushNotificationInfo, setPushNotificationInfo] = useState<string | null>(null);
  const [pushNotificationError, setPushNotificationError] = useState<string | null>(null);
  const [initialChatViewportHint, setInitialChatViewportHint] = useState<{
    chatId: string;
    unreadCount: number;
  } | null>(null);
  const [pendingMessageJump, setPendingMessageJump] = useState<{
    chatId: string;
    messageId: string;
    initialCursor: string | null;
  } | null>(null);
  const [lastSeenChatsActivityAt, setLastSeenChatsActivityAt] = useState<string | null>(null);
  const [seenConferenceActivitySnapshot, setSeenConferenceActivitySnapshot] = useState<
    Record<string, string> | null
  >(null);
  const [availableBuildUpdate, setAvailableBuildUpdate] = useState<BuildRevisionMeta | null>(null);
  const navigationUserIdRef = useRef(session.user.id);
  const loadedBuildRevisionRef = useRef<string | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const conferenceListScrollRef = useRef<HTMLDivElement | null>(null);
  const conferenceSurfaceRef = useRef<HTMLDivElement | null>(null);
  const { sidebarWidth, startSidebarResize } = useSidebarResize();

  useEffect(() => {
    if (navigationUserIdRef.current === session.user.id) {
      return;
    }

    const restoredNavigationState = readWorkspaceNavigationState(session.user.id);
    navigationUserIdRef.current = session.user.id;
    setActiveChatId(restoredNavigationState.activeChatId);
    setActiveConferenceId(restoredNavigationState.activeConferenceId);
    setConferenceViewportMode(restoredNavigationState.conferenceViewportMode);
    setActiveListTab(
      normalizeConversationListTabForProfile(
        restoredNavigationState.activeListTab,
        session.user.mailEnabled
      )
    );
    setMobilePane(restoredNavigationState.mobilePane);
    setHasExplicitlyOpenedActiveChatThisSession(false);
    setSidebarSheet(null);
    setIsMenuOpen(false);
    setIsChatMenuOpen(false);
    setIsChatMembersOpen(false);
    setIsConferenceInfoOpen(false);
    setConferenceComposerMode(null);
    setConferenceEditingId(null);
    setConferenceChatId(null);
    setActiveMailMessageId(null);
    setMailComposing(false);
    setSearch("");
  }, [session.user.id]);
  useEffect(() => {
    let cancelled = false;

    const syncBuildRevision = async () => {
      const nextBuildRevision = await readCurrentBuildRevision();
      if (cancelled || !nextBuildRevision?.revision) {
        return;
      }

      rememberCurrentBuildRevision(nextBuildRevision.revision);

      if (!loadedBuildRevisionRef.current) {
        loadedBuildRevisionRef.current = nextBuildRevision.revision;
        return;
      }

      if (nextBuildRevision.revision !== loadedBuildRevisionRef.current) {
        setAvailableBuildUpdate(nextBuildRevision);
      }
    };

    const handleForegroundSync = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void syncBuildRevision();
    };

    void syncBuildRevision();
    const intervalId = window.setInterval(() => {
      void syncBuildRevision();
    }, BUILD_META_POLL_MS);
    window.addEventListener("focus", handleForegroundSync);
    document.addEventListener("visibilitychange", handleForegroundSync);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleForegroundSync);
      document.removeEventListener("visibilitychange", handleForegroundSync);
    };
  }, []);
  useEffect(() => {
    if (navigationUserIdRef.current !== session.user.id) {
      return;
    }

    writeWorkspaceNavigationState(session.user.id, {
      activeChatId,
      activeConferenceId,
      activeListTab,
      conferenceViewportMode,
      mobilePane,
    });
  }, [
    activeChatId,
    activeConferenceId,
    activeListTab,
    conferenceViewportMode,
    mobilePane,
    session.user.id,
  ]);
  const {
    clearChatAttention,
    dismissIncomingToast,
    incomingToasts,
    showIncomingToast,
  } = useIncomingToasts({
    activeChatId,
    browserNotificationsEnabled: pushNotificationState.subscribed,
    currentUserId: session.user.id,
    currentUsername: session.user.username,
    formatPreview: (message) => formatToastPreview(buildChatListPreviewText(message)),
    queryClient,
    token: session.token,
  });
  const { buttonRef: conferenceInfoButtonRef, panelRef: conferenceInfoPanelRef } =
    useDismissiblePanel({
      isOpen: isConferenceInfoOpen,
      onClose: () => setIsConferenceInfoOpen(false),
    });
  const { buttonRef: menuButtonRef, panelRef: menuPanelRef } = useDismissiblePanel({
    isOpen: isMenuOpen,
    onClose: () => setIsMenuOpen(false),
  });
  const { buttonRef: chatMenuButtonRef, panelRef: chatMenuPanelRef } = useDismissiblePanel({
    isOpen: isChatMenuOpen,
    onClose: () => setIsChatMenuOpen(false),
  });
  const { panelRef: chatMembersPanelRef } = useDismissiblePanel({
    isOpen: isChatMembersOpen,
    onClose: () => setIsChatMembersOpen(false),
  });
  const createGroupInviteLinkMutation = useMutation({
    mutationFn: (input: { chatId: string; refresh?: boolean }) =>
      createGroupInviteLinkRequest(session.token, input.chatId, { refresh: input.refresh }),
    onSuccess: (inviteLink, input) => {
      setGroupInviteCodesByChatId((current) => ({
        ...current,
        [input.chatId]: inviteLink.code,
      }));
    },
  });
  const createConferenceInviteLinkMutation = useMutation({
    mutationFn: (input: { conferenceId: string; refresh?: boolean }) =>
      createConferenceInviteLinkRequest(session.token, input.conferenceId, {
        refresh: input.refresh,
      }),
    onSuccess: (inviteLink, input) => {
      setConferenceInviteCodesById((current) => ({
        ...current,
        [input.conferenceId]: inviteLink.code,
      }));
    },
  });
  const mailSendMutation = useMutation({
    mutationFn: (input: { to: string; subject: string; body: string }) =>
      sendMailRequest(session.token, input.to, input.subject, input.body),
    onSuccess: () => {
      setMailComposing(false);
      setMailReplyTo(null);
      setMailSendError(null);
      setMailFolder("sent");
      queryClient.invalidateQueries({ queryKey: ["mail-sent", session.token] });
    },
    onError: (error) => {
      setMailSendError(describeError(error));
    },
  });
  const mailDeleteMutation = useMutation({
    mutationFn: (messageId: string) => deleteMailMessageRequest(session.token, messageId),
    onSuccess: (_result, messageId) => {
      if (activeMailMessageId === messageId) {
        setActiveMailMessageId(null);
      }
      queryClient.invalidateQueries({
        queryKey: [mailFolder === "inbox" ? "mail-inbox" : "mail-sent", session.token],
      });
    },
  });
  const handleGroupCreated = useEffectEvent((chat: ChatSummary) => {
    createGroupInviteLinkMutation.mutate({ chatId: chat.id });
  });
  const {
    contextMenu,
    contextMenuRef,
    contextMenuStyle,
    openChatContextMenu,
    openMessageContextMenu,
    setContextMenu,
  } = useContextMenu();
  const workspaceBootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", session.token],
    queryFn: () => getWorkspaceBootstrap(session.token),
    staleTime: WORKSPACE_BOOTSTRAP_STALE_TIME_MS,
  });
  const workspaceBootstrapReady =
    workspaceBootstrapQuery.isSuccess || workspaceBootstrapQuery.isError;
  const workspaceBootstrapData = workspaceBootstrapQuery.data;
  const workspaceBootstrapUpdatedAt = workspaceBootstrapData
    ? workspaceBootstrapQuery.dataUpdatedAt
    : undefined;
  const appliedWorkspaceBootstrapVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceBootstrapData) {
      return;
    }
    if (appliedWorkspaceBootstrapVersionRef.current === workspaceBootstrapData.workspaceVersion) {
      return;
    }
    appliedWorkspaceBootstrapVersionRef.current = workspaceBootstrapData.workspaceVersion;

    queryClient.setQueryData(["profile", session.token], workspaceBootstrapData.profile);
    queryClient.setQueryData(["chats", session.token], workspaceBootstrapData.chats);
    queryClient.setQueryData(
      ["archived-chats", session.token],
      workspaceBootstrapData.archivedChatIds
    );
    queryClient.setQueryData(["contacts", session.token], workspaceBootstrapData.contacts);
    queryClient.setQueryData(
      ["blocked-users", session.token],
      workspaceBootstrapData.blockedUsers
    );
    queryClient.setQueryData(["drafts", session.token], workspaceBootstrapData.drafts);
    queryClient.setQueryData(["mailboxes", session.token], workspaceBootstrapData.mailboxes);
    queryClient.setQueryData(
      ["video-conferences", session.token],
      workspaceBootstrapData.conferences
    );
    queryClient.setQueryData(
      ["video-conferences-archive", session.token],
      workspaceBootstrapData.archivedConferences
    );
  }, [queryClient, session.token, workspaceBootstrapData]);
  const {
    activeDraft,
    clearDraftForChat,
    commitDraftForChat,
    composerTextareaRef,
    draftActivityByChatId,
    draftsByChatId,
    draftsQuery,
    focusComposer,
    handleComposerChange: setComposerDraft,
    scheduleDraftSave,
    setDraftsByChatId,
  } = useChatDrafts({
    activeChatId,
    bootstrapReady: workspaceBootstrapReady,
    initialDrafts: workspaceBootstrapData?.drafts,
    initialDraftsUpdatedAt: workspaceBootstrapUpdatedAt,
    queryClient,
    token: session.token,
  });
  const {
    clearTypingParticipant,
    handleComposerChange,
    hasActiveComposerTextRef,
    scheduleTypingStop,
    scheduleTypingTimeout,
    sendTypingHeartbeat,
    setTypingByChatId,
    stopTyping,
    typingByChatId,
  } = useTypingSignals({
    activeChatId,
    activeDraft,
    composerChatId: activeChatId,
    heartbeatMs: TYPING_HEARTBEAT_MS,
    idleMs: TYPING_IDLE_MS,
    minVisibleMs: TYPING_MIN_VISIBLE_MS,
    ttlMs: TYPING_EVENT_TTL_MS,
    setComposerDraft,
  });
  const activePendingOutgoingCount = activeChatId
    ? pendingOutgoingCountByChatId[activeChatId] ?? 0
    : 0;
  useEffect(() => {
    const shouldAutoReloadBuildUpdate = shouldAutoReloadForBuildUpdate({
      hasAvailableBuildUpdate: availableBuildUpdate !== null,
      activeConferenceId,
      hasActiveComposerText: hasActiveComposerTextRef.current,
      draftsByChatId,
      pendingOutgoingCountByChatId,
      replyingToMessageId,
      editingMessageId,
      forwardingMessageIds,
      selectedMessageIds,
    });
    if (
      !availableBuildUpdate ||
      !shouldAutoReloadBuildUpdate ||
      typeof window === "undefined" ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.location.reload();
    }, BUILD_UPDATE_AUTO_RELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeConferenceId,
    availableBuildUpdate,
    draftsByChatId,
    editingMessageId,
    forwardingMessageIds,
    pendingOutgoingCountByChatId,
    replyingToMessageId,
    selectedMessageIds,
    hasActiveComposerTextRef,
  ]);
  const isActiveChatOpen =
    Boolean(activeChatId) &&
    mobilePane === "conversation" &&
    hasExplicitlyOpenedActiveChatThisSession;
  const {
    activeTypingQuery,
    archivedChatsQuery,
    archivedConferencesQuery,
    blockedUsersQuery,
    chatsQuery,
    conferencesQuery,
    contactsQuery,
    contactsSearchQuery,
    mailboxesQuery,
    mailInboxQuery,
    mailSentQuery,
    messages,
    messagesQuery,
    pendingOutgoingMessagesQuery,
    profileQuery,
    sessionsQuery,
    userSearchQuery,
  } = useWorkspaceQueries({
    activeChatId,
    activeConferenceId,
    isActiveChatOpen,
    activeListTab,
    activePendingOutgoingCount,
    bootstrapReady: workspaceBootstrapReady,
    contactSearchText: contactSearch,
    currentUser: session.user,
    initialWorkspaceBootstrap: workspaceBootstrapData,
    initialWorkspaceBootstrapUpdatedAt: workspaceBootstrapUpdatedAt,
    isRealtimeConnected,
    messageQueryGcTimeMs: MESSAGE_QUERY_GC_TIME_MS,
    messageNavigationSeed: pendingMessageJump
      ? {
          chatId: pendingMessageJump.chatId,
          cursor: pendingMessageJump.initialCursor,
        }
      : null,
    searchQueryGcTimeMs: SEARCH_QUERY_GC_TIME_MS,
    searchText: search,
    sessionToken: session.token,
    sidebarSheet,
    typingQueryGcTimeMs: TYPING_QUERY_GC_TIME_MS,
    userId: session.user.id,
  });

  const serverChats = chatsQuery.data ?? [];
  const archivedChatIds = archivedChatsQuery.data ?? [];
  const archivedChatIdSet = useMemo(() => new Set(archivedChatIds), [archivedChatIds]);
  const normalizedSearch = search.trim().toLowerCase();
  const listedServerChats = useMemo(
    () => serverChats.filter((chat) => !chat.direct || chat.lastMessageAt !== null),
    [serverChats]
  );
  const visibleServerChats = useMemo(
    () => listedServerChats.filter((chat) => !archivedChatIdSet.has(chat.id)),
    [archivedChatIdSet, listedServerChats]
  );
  const {
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    refreshChatPreviewFromServer,
    removeChatPinnedMessage,
    syncChatPinnedMessage,
    syncChatPinnedMessages,
    syncChatPreviewFromCache,
  } = useChatPreviews({
    formatPreviewText: buildChatListPreviewText,
    queryClient,
    token: session.token,
  });
  const chats = serverChats;
  const sessions = sessionsQuery.data ?? [];
  const profile = profileQuery.data ?? session.user;
  const mailboxes = mailboxesQuery.data ?? [];
  const mailInbox = mailInboxQuery.data ?? [];
  const mailSent = mailSentQuery.data ?? [];
  const mailLoading =
    activeListTab === "mail" &&
    (mailInboxQuery.isFetching || mailSentQuery.isFetching) &&
    mailInbox.length === 0 &&
    mailSent.length === 0;
  const userMailAddress =
    mailboxes.length > 0 ? mailboxes[0].email : `${profile.username}@ktsf.ru`;

  const mailMessageQuery = useQuery({
    queryKey: ["mail-message", session.token, activeMailMessageId],
    queryFn: () => getMailMessageRequest(session.token, activeMailMessageId!),
    enabled: Boolean(activeMailMessageId) && activeListTab === "mail",
    staleTime: 60_000,
  });
  const activeMailMessage: MailMessageDetail | null = mailMessageQuery.data ?? null;

  useEffect(() => {
    if (activeListTab === "mail" && !profile.mailEnabled) {
      setActiveListTab("chats");
    }
  }, [activeListTab, profile.mailEnabled]);
  const deleteAccountRequiresMatch =
    normalizeAccountDeletionConfirmation(deleteAccountConfirmation) ===
    profile.username.toLowerCase();
  const contacts = contactsQuery.data ?? [];
  const blockedUsers = blockedUsersQuery.data ?? [];
  const conferences = conferencesQuery.data ?? [];
  const archivedConferences = archivedConferencesQuery.data ?? [];
  const userSearchResults = userSearchQuery.data?.users ?? [];
  const contactSearchResults = contactsSearchQuery.data?.users ?? [];
  const workspaceBootstrapLoading = workspaceBootstrapQuery.isPending;
  const chatsLoading =
    workspaceBootstrapLoading || (chatsQuery.data === undefined && chatsQuery.isFetching);
  const sessionsLoading = sessionsQuery.data === undefined && sessionsQuery.isFetching;
  const archivedChatsLoading =
    workspaceBootstrapLoading ||
    (archivedChatsQuery.data === undefined && archivedChatsQuery.isFetching);
  const contactsLoading =
    workspaceBootstrapLoading || (contactsQuery.data === undefined && contactsQuery.isFetching);
  const mailboxesLoading =
    workspaceBootstrapLoading || (mailboxesQuery.data === undefined && mailboxesQuery.isFetching);
  const conferencesLoading =
    workspaceBootstrapLoading || (conferencesQuery.data === undefined && conferencesQuery.isFetching);
  const archivedConferencesLoading =
    workspaceBootstrapLoading ||
    (archivedConferencesQuery.data === undefined && archivedConferencesQuery.isFetching);
  const allConferences = useMemo(
    () => mergeVideoConferenceCollections(conferences, archivedConferences),
    [archivedConferences, conferences]
  );
  const listedConferences = useMemo(
    () =>
      conferences.filter(
        (conference) =>
          conference.participants.some((participant) => participant.id === session.user.id) &&
          !conference.endedAt
      ),
    [conferences, session.user.id]
  );
  const liveGroupConferencesByChatId = useMemo(() => {
    const next = new Map<string, VideoConference>();
    listedConferences.forEach((conference) => {
      if (!conference.chatId || !conference.startedAt || conference.endedAt) {
        return;
      }

      const current = next.get(conference.chatId);
      if (!current) {
        next.set(conference.chatId, conference);
        return;
      }

      const currentSortKey = current.startedAt ?? current.createdAt;
      const nextSortKey = conference.startedAt ?? conference.createdAt;
      if (nextSortKey.localeCompare(currentSortKey) > 0) {
        next.set(conference.chatId, conference);
      }
    });
    return next;
  }, [listedConferences]);
  const chatIds = useMemo(() => chats.map((chat) => chat.id).sort(), [chats]);
  const chatIdsKey = useMemo(() => chatIds.join(","), [chatIds]);
  const listedChats = useMemo(
    () => chats.filter((chat) => shouldListChat(chat, draftActivityByChatId)),
    [chats, draftActivityByChatId]
  );
  const nonArchivedChats = useMemo(
    () => listedChats.filter((chat) => !archivedChatIdSet.has(chat.id)),
    [archivedChatIdSet, listedChats]
  );
  const archivedChats = useMemo(
    () => listedChats.filter((chat) => archivedChatIdSet.has(chat.id)),
    [archivedChatIdSet, listedChats]
  );
  const searchedVisibleChats = useMemo(
    () => userSearchQuery.data?.chats ?? [],
    [userSearchQuery.data?.chats]
  );
  const visibleChats = useMemo(
    () => (normalizedSearch ? searchedVisibleChats : nonArchivedChats),
    [nonArchivedChats, normalizedSearch, searchedVisibleChats]
  );
  const groupContacts = useMemo(
    () => contacts.filter((contact) => contact.username !== session.user.username),
    [contacts, session.user.username]
  );
  const directChatUsernames = useMemo(
    () =>
      new Set(
        chats
          .map((chat) =>
            chat.direct ? getDirectParticipant(chat, session.user)?.username ?? null : null
          )
          .filter((username): username is string => Boolean(username))
      ),
    [chats, session.user]
  );
  const forwardContactOptions = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.username !== session.user.username && !directChatUsernames.has(contact.username)
      ),
    [contacts, directChatUsernames, session.user.username]
  );
  const visibleConferences = useMemo(
    () => (normalizedSearch ? userSearchQuery.data?.conferences ?? [] : listedConferences),
    [listedConferences, normalizedSearch, userSearchQuery.data?.conferences]
  );
  const failedChatIds = useMemo(
    () =>
      new Set(
        (pendingOutgoingMessagesQuery.data ?? [])
          .filter((message) => message.status === "FAILED")
          .map((message) => message.chatId)
      ),
    [pendingOutgoingMessagesQuery.data]
  );
  const latestUnreadChatActivityAt = getLatestUnreadChatActivityAt(nonArchivedChats);
  const currentConferenceActivitySnapshot = useMemo(
    () => buildConferenceActivitySnapshot(listedConferences),
    [listedConferences]
  );
  const showMailTab = Boolean(profile.mailEnabled) && mailboxes.length > 0;
  const isViewingChatsSection = !sidebarSheet && activeListTab === "chats";
  const isViewingConferencesSection = !sidebarSheet && activeListTab === "conferences";
  const showChatsTabIndicator =
    !isViewingChatsSection && hasUnreadChatActivitySince(nonArchivedChats, lastSeenChatsActivityAt);
  const showConferencesTabIndicator =
    !isViewingConferencesSection &&
    hasConferenceActivitySinceSeen(currentConferenceActivitySnapshot, seenConferenceActivitySnapshot);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats]
  );
  const activeChatLiveGroupConference =
    activeChat && !activeChat.direct ? liveGroupConferencesByChatId.get(activeChat.id) ?? null : null;
  const activeConference = useMemo(
    () => allConferences.find((conference) => conference.id === activeConferenceId) ?? null,
    [activeConferenceId, allConferences]
  );
  const activeChatLiveParticipantIdSet = useMemo(
    () => new Set(activeChatLiveGroupConference?.activeParticipantUserIds ?? []),
    [activeChatLiveGroupConference]
  );
  const activeGroupInviteUrl =
    activeChat && !activeChat.direct && groupInviteCodesByChatId[activeChat.id]
      ? buildInviteUrl(groupInviteCodesByChatId[activeChat.id]!)
      : null;
  const conferenceCandidates = useMemo(
    () =>
      mergeConferenceCandidates(
        groupContacts,
        activeChat && !activeChat.direct ? activeChat.members : [],
        session.user.username
      ),
    [activeChat, groupContacts, session.user.username]
  );
  const activeDirectParticipant = useMemo(
    () => (activeChat ? getDirectParticipant(activeChat, session.user) : null),
    [activeChat, session.user]
  );
  const activeDirectInContacts = useMemo(
    () =>
      activeDirectParticipant
        ? contacts.some((contact) => contact.username === activeDirectParticipant.username)
        : false,
    [activeDirectParticipant, contacts]
  );
  const activeDirectBlockedByMe = useMemo(
    () =>
      activeDirectParticipant
        ? blockedUsers.some((user) => user.username === activeDirectParticipant.username)
        : false,
    [activeDirectParticipant, blockedUsers]
  );
  const activeChatCapabilities = activeChat && !activeChat.direct ? activeChat.capabilities : null;
  const activeChatCanDeleteGroup = Boolean(activeChatCapabilities?.canDeleteGroup);
  const activeChatCanEditGroup = Boolean(activeChatCapabilities?.canEditGroup);
  const activeChatCanManageInviteLink = Boolean(activeChatCapabilities?.canManageInviteLink);
  const activeChatCanAddMembers = Boolean(activeChatCapabilities?.canAddMembers);
  const activeChatCanManageRoles = Boolean(activeChatCapabilities?.canManageRoles);
  const activeChatCanModerateMembers = Boolean(activeChatCapabilities?.canModerateMembers);
  const activeChatCanLeaveGroup = Boolean(activeChatCapabilities?.canLeaveGroup);
  const groupBansQuery = useQuery({
    queryKey: ["group-bans", session.token, activeChat?.id],
    queryFn: () => listGroupBansRequest(session.token, activeChat!.id),
    enabled:
      Boolean(activeChat && !activeChat.direct && activeChatCanModerateMembers) &&
      (isChatMembersOpen || sidebarSheet === "groupMembers"),
    staleTime: 15_000,
  });
  const bannedGroupParticipants = groupBansQuery.data ?? [];
  const refreshPushNotifications = useEffectEvent(async () => {
    const nextState = await getPushNotificationState(session.token);
    setPushNotificationState(nextState);
    return nextState;
  });
  const handleEnablePushNotifications = useEffectEvent(async () => {
    setPushNotificationPending(true);
    setPushNotificationInfo(null);
    setPushNotificationError(null);
    try {
      const nextState = await enablePushNotifications(session.token);
      setPushNotificationState(nextState);
      setPushNotificationInfo(
        "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435."
      );
    } catch (error) {
      setPushNotificationError(describeError(error));
      void refreshPushNotifications().catch(() => undefined);
    } finally {
      setPushNotificationPending(false);
    }
  });
  const handleDisablePushNotifications = useEffectEvent(async () => {
    setPushNotificationPending(true);
    setPushNotificationInfo(null);
    setPushNotificationError(null);
    try {
      const nextState = await disablePushNotifications(session.token);
      setPushNotificationState(nextState);
      setPushNotificationInfo(
        "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435."
      );
    } catch (error) {
      setPushNotificationError(describeError(error));
      void refreshPushNotifications().catch(() => undefined);
    } finally {
      setPushNotificationPending(false);
    }
  });
  const activeConferenceIsArchived = Boolean(activeConference?.endedAt);
  const activeConferenceCanJoin = Boolean(
    activeConference?.roomName &&
      activeConference.activatedAt &&
      !activeConference.endedAt
  );
  const activeConferenceIsChatBound = Boolean(activeConference?.chatId);
  const activeConferenceIsOwnedByCurrentUser = activeConference
    ? activeConference.createdBy.id === profile.id
    : false;
  const activeConferenceShareUrl =
    activeConference && conferenceInviteCodesById[activeConference.id]
      ? buildInviteUrl(conferenceInviteCodesById[activeConference.id]!)
      : null;
  const activeConferenceCanManageParticipants = Boolean(
    activeConference &&
      !activeConferenceIsChatBound &&
      activeConferenceIsOwnedByCurrentUser &&
      !activeConferenceIsArchived
  );
  const activeConferenceCanEnd = Boolean(
    activeConference &&
      activeConferenceIsOwnedByCurrentUser &&
      activeConference.startedAt &&
      !activeConferenceIsArchived
  );
  const activeConferenceCanEditSchedule = Boolean(
    activeConference &&
      activeConferenceIsOwnedByCurrentUser &&
      !activeConferenceIsArchived &&
      !activeConference.startedAt
  );
  const activeConferenceCanCancelSchedule = activeConferenceCanEditSchedule;
  const activeConferenceCanShareInviteLink = Boolean(
    activeConference &&
      !activeConferenceIsChatBound &&
      activeConferenceIsOwnedByCurrentUser &&
      !activeConferenceIsArchived
  );
  const activeConferenceRoleLabel = activeConference
    ? describeConferenceRole(activeConferenceIsOwnedByCurrentUser)
    : null;
  const activeConferenceOrganizerLabel = activeConference
    ? formatConferenceOrganizerLabel(activeConference.createdBy, profile)
    : null;
  const activeConferenceStatusLabel = activeConference
    ? formatConferenceStatusLabel(activeConference)
    : null;
  const activeConferenceLocalRecordingActive =
    conferenceRecordingState === "starting" || conferenceRecordingState === "recording";
  const activeConferenceStageHint = activeConference
    ? formatConferenceStageHint(activeConference, activeConferenceIsOwnedByCurrentUser)
    : null;
  const availableGroupInviteContacts =
    activeChat && !activeChat.direct
      ? groupContacts.filter(
          (contact) => !activeChat.members.some((member) => member.username === contact.username)
        )
      : [];
  const selectedGroupContacts = groupContacts.filter((contact) =>
    groupParticipantUsernames.includes(contact.username)
  );
  const selectedGroupInviteContacts = availableGroupInviteContacts.filter((contact) =>
    groupInviteUsernames.includes(contact.username)
  );
  const availableConferenceInviteContacts = activeConference
    ? groupContacts.filter(
        (contact) =>
          !activeConference.participants.some((participant) => participant.username === contact.username)
      )
    : [];
  const activeTypingParticipants = activeChatId
    ? isRealtimeConnected
      ? typingByChatId[activeChatId] ?? []
      : mergeTypingParticipants(
          typingByChatId[activeChatId] ?? [],
          activeTypingQuery.data ?? []
        )
    : [];
  const conversationSubtitle = activeChat
    ? activeTypingParticipants.length > 0
      ? formatTypingParticipants(activeTypingParticipants)
      : activeChat.direct
        ? describeChat(activeChat, session.user)
        : formatMemberCount(activeChat.members.length)
    : "";
  const showTypingIndicator = activeTypingParticipants.length > 0;
  const timelineItems = useMemo(() => buildTimeline(messages), [messages]);
  const activeChatHistoryAccessNotice =
    activeChat && !activeChat.direct && !activeChat.members.some((member) => member.id === session.user.id)
      ? {
          title: "Группа доступна только для чтения",
          description:
            "Вы больше не участвуете в этой группе. История сохранена, но новые сообщения, файлы и реакции недоступны.",
        }
      : null;
  const readableIncomingMessageIdsKey = useMemo(
    () => buildReadableIncomingMessageIdsKey(messages, session.user.id),
    [messages, session.user.id]
  );
  const messagesLoading =
    Boolean(activeChat?.id) && messagesQuery.data === undefined && messagesQuery.isFetching;
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const lastMessage = messages[messages.length - 1] ?? null;
  const lastMessageAnchorKey = lastMessage ? getMessageIdentityKey(lastMessage) : null;
  const contextMenuMessage =
    contextMenu?.kind === "message"
      ? messages.find((message) => message.id === contextMenu.messageId) ?? null
      : null;
  const replyingToMessage =
    replyingToMessageId && activeChat
      ? messages.find((message) => message.id === replyingToMessageId) ?? null
      : null;
  const editingMessage =
    editingMessageId && activeChat
      ? messages.find((message) => message.id === editingMessageId) ?? null
      : null;
  const forwardingMessageIdSet = useMemo(
    () => new Set(forwardingMessageIds),
    [forwardingMessageIds]
  );
  const forwardingMessages =
    activeChat && forwardingMessageIdSet.size > 0
      ? messages.filter((message) => forwardingMessageIdSet.has(message.id))
      : [];
  const selectedMessageIdSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds]
  );
  const selectedMessages =
    activeChat && selectedMessageIdSet.size > 0
      ? messages.filter((message) => selectedMessageIdSet.has(message.id))
      : [];
  const isSelectingMessages = selectedMessages.length > 0;
  const canForwardSelectedMessages = selectedMessages.length > 0;
  const canDeleteSelectedMessagesForEveryone = Boolean(
    selectedMessages.length > 0 &&
      selectedMessages.every(
        (message) =>
          message.id !== message.clientMessageId &&
          (activeChat?.direct ||
            isOwnMessage(message, session.user) ||
            Boolean(activeChat?.capabilities.canModerateMembers))
      )
  );

  useEffect(() => {
    if (selectedMessageIds.length === 0) {
      if (isDeleteSelectedMessagesDialogOpen) {
        setIsDeleteSelectedMessagesDialogOpen(false);
      }
      return;
    }

    const validSelectedMessageIds = messages
      .filter((message) => selectedMessageIdSet.has(message.id))
      .map((message) => message.id);
    if (validSelectedMessageIds.length === 0) {
      setSelectedMessageIds([]);
      setIsDeleteSelectedMessagesDialogOpen(false);
      return;
    }

    if (validSelectedMessageIds.length !== selectedMessageIds.length) {
      setSelectedMessageIds(validSelectedMessageIds);
    }
  }, [
    isDeleteSelectedMessagesDialogOpen,
    messages,
    selectedMessageIds,
    selectedMessageIdSet,
  ]);

  useEffect(() => {
    setSelectedMessageIds([]);
    setIsDeleteSelectedMessagesDialogOpen(false);
  }, [activeChat?.id]);
  const activePinnedMessages = useMemo(() => {
    const pinnedMessages = getChatPinnedMessages(activeChat);
    if (pinnedMessages.length === 0) {
      return [];
    }

    const messagesById = new Map(messages.map((message) => [message.id, message] as const));
    return pinnedMessages.map((pinnedMessage) => {
      const hydratedMessage = messagesById.get(pinnedMessage.id);
      return hydratedMessage ? toMessageSnippet(hydratedMessage) : pinnedMessage;
    });
  }, [activeChat, messages]);
  const activePinnedMessageIdSet = useMemo(
    () => new Set(activePinnedMessages.map((message) => message.id)),
    [activePinnedMessages]
  );
  useEffect(() => {
    if (activePinnedMessages.length === 0) {
      setActivePinnedMessageId(null);
      return;
    }

    setActivePinnedMessageId((current) =>
      current && activePinnedMessages.some((message) => message.id === current)
        ? current
        : activePinnedMessages[0]!.id
    );
  }, [activePinnedMessages]);
  const activePinnedMessage =
    activePinnedMessages.find((message) => message.id === activePinnedMessageId) ??
    activePinnedMessages[0] ??
    null;
  const activePinnedMessageIndex = activePinnedMessage
    ? activePinnedMessages.findIndex((message) => message.id === activePinnedMessage.id)
    : -1;
  const forwardableChats = visibleChats.filter((chat) => chat.id !== activeChat?.id);
  const canDeleteContextMenuMessageForSelf = Boolean(contextMenuMessage && activeChat?.direct);
  const showDeleteContextMenuMessageForEveryone = Boolean(
    contextMenuMessage &&
      activeChat &&
      (activeChat.direct ||
        contextMenuMessage.id !== contextMenuMessage.clientMessageId)
  );
  const canDeleteContextMenuMessageForEveryone = Boolean(
    contextMenuMessage &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId &&
      (activeChat?.direct ||
        isOwnMessage(contextMenuMessage, session.user) ||
        Boolean(activeChat?.capabilities.canModerateMembers))
  );
  const canReactContextMenuMessage = Boolean(
    contextMenuMessage &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId &&
      !isOwnMessage(contextMenuMessage, session.user)
  );
  const canEditContextMenuMessage = Boolean(
    contextMenuMessage &&
      isOwnMessage(contextMenuMessage, session.user) &&
      !contextMenuMessage.forwardedFrom &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const canForwardContextMenuMessage = Boolean(contextMenuMessage);
  const canPinContextMenuMessage = Boolean(
    contextMenuMessage &&
      activeChat &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const isPinnedContextMenuMessage = Boolean(
    contextMenuMessage && activePinnedMessageIdSet.has(contextMenuMessage.id)
  );
  const deleteForEveryoneLabel = activeChat?.direct
    ? "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u043E\u0431\u043E\u0438\u0445"
    : "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445";
  const deleteForEveryoneHint = activeChat?.direct
    ? "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0443 \u0432\u0430\u0441 \u043E\u0431\u043E\u0438\u0445"
    : "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0443 \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432";

  useEffect(() => {
    let cancelled = false;
    void syncPushSubscription(session.token)
      .then((nextState) => {
        if (!cancelled) {
          setPushNotificationState(nextState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPushNotificationError(describeError(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session.token, session.user.id]);

  useEffect(() => {
    if (isRealtimeConnected || !activeChatId || activeTypingQuery.data === undefined) {
      return;
    }

    setTypingByChatId((current) =>
      syncChatTypingParticipants(current, activeChatId, activeTypingQuery.data)
    );
  }, [activeChatId, activeTypingQuery.data, isRealtimeConnected]);

  useEffect(() => {
    setIsChatMenuOpen(false);
    setIsChatMembersOpen(false);
  }, [activeChatId, activeConferenceId]);

  useEffect(() => {
    sendMessageMutation.reset();
    editMessageMutation.reset();
  }, [activeChatId, session.sessionId, session.user.id]);

  useEffect(() => {
    setConferenceRecordingState("idle");
  }, [activeConference?.id]);

  useEffect(() => {
    if (!isViewingChatsSection) {
      return;
    }

    const nextSeenActivityAt = latestUnreadChatActivityAt ?? new Date().toISOString();
    setLastSeenChatsActivityAt((current) => {
      if (current && nextSeenActivityAt.localeCompare(current) <= 0) {
        return current;
      }

      return nextSeenActivityAt;
    });
  }, [isViewingChatsSection, latestUnreadChatActivityAt]);

  useEffect(() => {
    if (!isViewingConferencesSection && seenConferenceActivitySnapshot !== null) {
      return;
    }

    setSeenConferenceActivitySnapshot((current) => {
      if (isConferenceActivitySnapshotEqual(current, currentConferenceActivitySnapshot)) {
        return current;
      }

      return currentConferenceActivitySnapshot;
    });
  }, [
    currentConferenceActivitySnapshot,
    isViewingConferencesSection,
    seenConferenceActivitySnapshot,
  ]);

  const rememberRealtimeMessage = (messageId: string) => {
    handledRealtimeMessageIdsRef.current.set(messageId, true);
    if (handledRealtimeMessageIdsRef.current.size > 300) {
      const oldestMessageId = handledRealtimeMessageIdsRef.current.keys().next().value;
      if (oldestMessageId) {
        handledRealtimeMessageIdsRef.current.delete(oldestMessageId);
      }
    }
  };

  const incrementPendingOutgoing = (chatId: string) => {
    setPendingOutgoingCountByChatId((current) => ({
      ...current,
      [chatId]: (current[chatId] ?? 0) + 1,
    }));
  };

  const decrementPendingOutgoing = (chatId: string) => {
    setPendingOutgoingCountByChatId((current) => {
      const nextCount = Math.max(0, (current[chatId] ?? 0) - 1);
      if (nextCount === 0) {
        const { [chatId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [chatId]: nextCount,
      };
    });
  };

  const clearChatUnreadIndicator = useEffectEvent((chatId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      clearChatUnreadCount(current, chatId)
    );
  });
  const {
    acknowledgeDelivered,
    acknowledgeRead,
    acknowledgeVisibleMessagesAsRead,
  } = useMessageReceipts({
    activeChatId,
    isActiveChatOpen,
    clearChatUnreadIndicator,
    currentUser: session.user,
    messages,
    onUnauthorized: () => onSessionChange(null),
    token: session.token,
  });

  const clearComposerContext = useEffectEvent((mode: "all" | "reply" | "edit" | "forward" = "all") => {
    if (mode === "all" || mode === "reply") {
      setReplyingToMessageId(null);
    }
    if (mode === "all" || mode === "edit") {
      setEditingMessageId(null);
    }
    if (mode === "all" || mode === "forward") {
      setForwardingMessageIds([]);
      forwardMessageMutation.reset();
      if (sidebarSheet === "forward") {
        setSidebarSheet(null);
      }
    }
  });
  const clearReplyComposerContext = useEffectEvent(() => {
    clearComposerContext("reply");
  });
  const clearEditComposerContext = useEffectEvent(() => {
    clearComposerContext("edit");
  });

  const {
    activateListTab,
    closeActiveChat,
    closeActiveConference,
    openChat,
    openConference,
    openConferenceComposer,
    openConferenceEditor,
    openConferenceSheet,
    openGroupConferenceComposer,
    openSidebarSheet,
    resetConferenceComposer,
    restoreActiveConference,
  } = useWorkspaceNavigation({
    activeChat,
    activeChatId,
    activeConferenceId,
    chats,
    clearChatAttention,
    clearComposerContext,
    currentUsername: session.user.username,
    setActiveChatId,
    setActiveConferenceId,
    setActiveListTab,
    setConferenceComposerMode,
    setConferenceChatId,
    setConferenceEditingId,
    setConferenceParticipantUsernames,
    setConferenceScheduledAt,
    setConferenceTitle,
    setConferenceViewportMode,
    setDeleteAccountConfirmation,
    setHasExplicitlyOpenedActiveChatThisSession,
    setInitialChatViewportHint,
    setIsConferenceInfoOpen,
    setIsMenuOpen,
    setMobilePane,
    setSidebarSheet,
    stopTyping,
  });
  const openActiveChatMediaBrowser = useEffectEvent(() => {
    if (!activeChat) {
      return;
    }

    setIsChatMenuOpen(false);
    setIsChatMembersOpen(false);
    openSidebarSheet("chatMedia");
  });
  const { messageStreamRef, preserveOlderMessagesOffset, scrollToMessage } =
    useMessageStreamNavigation({
      activeChatId,
      currentChatId: activeChat?.id ?? null,
      lastMessageAnchorKey,
      lastMessageId,
      messages,
      currentUserId: session.user.id,
      pendingMessageJump: pendingMessageJump
        ? {
            chatId: pendingMessageJump.chatId,
            messageId: pendingMessageJump.messageId,
          }
        : null,
      clearPendingMessageJump: (chatId, messageId) =>
        setPendingMessageJump((current) =>
          current?.chatId === chatId && current.messageId === messageId ? null : current
        ),
      pendingInitialAnchor: initialChatViewportHint,
      clearPendingInitialAnchor: (chatId) =>
        setInitialChatViewportHint((current) =>
          current?.chatId === chatId ? null : current
        ),
      openChat,
    });

  const jumpToSourceMessageTarget = useEffectEvent(
    (chatId: string, target: SourceMessageJumpTarget) => {
      const targetMessageLoaded =
        activeChatId === chatId && messages.some((message) => message.id === target.messageId);

      if (targetMessageLoaded) {
        setPendingMessageJump(null);
        setInitialChatViewportHint(null);
        openChat(chatId);
        setInitialChatViewportHint(null);
        scrollToMessage(chatId, target.messageId);
        return;
      }

      setPendingMessageJump({
        chatId,
        messageId: target.messageId,
        initialCursor: buildAttachmentMessageJumpCursor(target.messageServerOrder),
      });
      setInitialChatViewportHint(null);
      openChat(chatId);
      setInitialChatViewportHint(null);
    }
  );

  const jumpToAttachmentSourceMessage = useEffectEvent(
    (chatId: string, item: SourceMessageJumpTarget) => {
      jumpToSourceMessageTarget(chatId, item);
    }
  );

  const openChatAtMessage = useEffectEvent((chatId: string, messageId: string) => {
    scrollToMessage(chatId, messageId);
  });

  const openChatAtFailedMessage = useEffectEvent((chatId: string) => {
    const firstFailed = (pendingOutgoingMessagesQuery.data ?? []).find(
      (msg) => msg.chatId === chatId && msg.status === "FAILED"
    );
    if (firstFailed) {
      scrollToMessage(chatId, firstFailed.clientMessageId);
    } else {
      openChat(chatId);
    }
  });

  useEffect(() => {
    if (!pendingMessageJump) {
      return;
    }

    queryClient.removeQueries({
      queryKey: buildMessagesQueryKey(session.user.id, pendingMessageJump.chatId),
      exact: true,
    });
  }, [pendingMessageJump, queryClient, session.user.id]);

  const deleteChatLocally = useEffectEvent((chatId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      removeChatById(current, chatId)
    );
    queryClient.setQueryData<string[]>(["archived-chats", session.token], (current) =>
      current?.filter((item) => item !== chatId) ?? []
    );
    queryClient.removeQueries({ queryKey: buildMessagesQueryKey(session.user.id, chatId) });
    clearChatAttention(chatId);
    clearDraftForChat(chatId);

    if (activeChatId === chatId) {
      clearComposerContext();
      closeActiveChat();
    }
  });

  const {
    copyMessageText,
    deleteChatForSelf,
    deleteChatMutation,
    deleteMessageForEveryone,
    deleteMessagesForEveryone,
    deleteMessageForSelf,
    deleteMessagesForSelf,
    deleteMessageMutation,
    editMessageAction,
    editMessageMutation,
    forwardMessageAction,
    forwardMessagesAction,
    forwardMessageMutation,
    forwardMessageToChat,
    forwardMessageToContact,
    pinMessageMutation,
    replyToMessage,
    retryFailedMessage,
    sendMessageMutation,
    submitActiveDraft,
    toggleMessageReactionMutation,
    togglePinnedMessageAction,
    toggleReactionForMessage,
    toggleReactionFromContextMenu,
  } = useMessageActions({
    activeChat,
    activePinnedMessageIdSet,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    chats,
    clearComposerContext,
    clearDraftForChat,
    currentUser: session.user,
    session,
    deleteChatLocally,
    editingMessage,
    focusComposer,
    forwardingMessages,
    incrementPendingOutgoing,
    decrementPendingOutgoing,
    isRealtimeConnected,
    onOpenChat: openChat,
    onOpenForwardSheet: () => openSidebarSheet("forward"),
    pendingOutgoingMessages: pendingOutgoingMessagesQuery.data ?? [],
    refreshChatPreviewFromServer,
    rememberRealtimeMessage,
    replyingToMessage,
    scheduleDraftSave,
    sessionToken: session.token,
    setContextMenu,
    setDraftsByChatId,
    setEditingMessageId,
    setForwardingMessageIds,
    setReplyingToMessageId,
    stopTyping,
    removeChatPinnedMessage,
    syncChatPinnedMessage,
    syncChatPreviewFromCache,
  });

  const clearMessageSelection = useEffectEvent(() => {
    setSelectedMessageIds([]);
    setIsDeleteSelectedMessagesDialogOpen(false);
  });

  const startMessageSelection = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    setSelectedMessageIds([message.id]);
    setIsDeleteSelectedMessagesDialogOpen(false);
  });

  const toggleMessageSelection = useEffectEvent((messageId: string) => {
    setSelectedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((selectedMessageId) => selectedMessageId !== messageId)
        : [...current, messageId]
    );
    setIsDeleteSelectedMessagesDialogOpen(false);
  });

  const openSelectedMessagesForward = useEffectEvent(() => {
    if (selectedMessages.length === 0) {
      return;
    }

    forwardMessagesAction(selectedMessages);
    clearMessageSelection();
  });

  const confirmDeleteSelectedMessagesForSelf = useEffectEvent(() => {
    if (!activeChat || !activeChat.direct || selectedMessages.length === 0) {
      return;
    }

    void deleteMessagesForSelf(
      activeChat.id,
      selectedMessages.map((message) => message.id)
    );
    clearMessageSelection();
  });

  const confirmDeleteSelectedMessagesForEveryone = useEffectEvent(() => {
    if (!activeChat || selectedMessages.length === 0 || !canDeleteSelectedMessagesForEveryone) {
      return;
    }

    void deleteMessagesForEveryone(
      activeChat.id,
      selectedMessages.map((message) => message.id)
    );
    clearMessageSelection();
  });

  const handleDownloadAttachment = useEffectEvent(
    async (chatId: string, attachment: ChatMessageAttachment) => {
      try {
        const download = await downloadChatAttachment(session.token, chatId, attachment.id);
        const url = window.URL.createObjectURL(download.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = download.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
      } catch (error) {
        window.alert(describeError(error));
      }
    }
  );

  const handleLoadAttachmentPreview = useEffectEvent(
    async (chatId: string, attachment: ChatMessageAttachment) => {
      const download = await downloadChatAttachment(session.token, chatId, attachment.id);
      return download.blob;
    }
  );

  const {
    addConferenceParticipantsMutation,
    addContact,
    addContactMutation,
    addGroupParticipantsMutation,
    assignGroupModeratorMutation,
    avatarMutation,
    banGroupParticipantMutation,
    blockUserMutation,
    cancelConferenceMutation,
    changeUsernameMutation,
    changePasswordMutation,
    createChatMutation,
    createConferenceMutation,
    createGroupMutation,
    deleteGroupMutation,
    deleteAccountMutation,
    endConferenceMutation,
    leaveGroupMutation,
    removeGroupParticipantMutation,
    removeContact,
    removeContactMutation,
    revokeGroupModeratorMutation,
    revokeSessionMutation,
    resendOwnEmailVerificationMutation,
    signOutMutation,
    startGroupConferenceCallMutation,
    transferGroupOwnershipMutation,
    submitAddConferenceParticipants,
    submitAddGroupParticipants,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitPasswordChange,
    submitUpdateGroup,
    submitUpdateGroupPrejoinHistoryPolicy,
    submitProfileDisplayName,
    toggleArchiveChat,
    unbanGroupParticipantMutation,
    updateArchivedChatMutation,
    updateConferenceMutation,
    updateGroupMutation,
    updateGroupHistoryPolicyMutation,
    updateProfileMutation,
    unblockUserMutation,
  } = useWorkspaceMutations({
    activeChat,
    activeChatId,
    activeConference,
    activeConferenceId,
    activeConferenceIsArchived,
    conferenceChatId,
    conferenceEditingId,
    conferenceInviteUsernames,
    conferenceParticipantUsernames,
    conferenceScheduledAt,
    conferenceTitle,
    currentSession: session,
    passwordChangeConfirm,
    passwordChangeCurrent,
    passwordChangeNext,
    groupInviteUsernames,
    groupDetailsAvatarUrl,
    groupDetailsPrejoinHistoryPolicy,
    groupDetailsTitle,
    groupParticipantUsernames,
    groupTitle,
    removeChatLocally: deleteChatLocally,
    onGroupCreated: handleGroupCreated,
    onPasswordChanged: () => {
      setPasswordChangeCurrent("");
      setPasswordChangeNext("");
      setPasswordChangeConfirm("");
      setChangePasswordSuccess(true);
    },
    onSessionChange,
    openChat,
    openConference,
    profile,
    profileDisplayName,
    profileProfession,
    resetConferenceComposer,
    setActiveListTab,
    setConferenceInviteUsernames,
    setGroupDetailsAvatarUrl,
    setGroupDetailsPrejoinHistoryPolicy,
    setGroupDetailsTitle,
    setGroupInviteUsernames,
    setGroupParticipantUsernames,
    setGroupTitle,
    setIsGroupCreatePickerOpen,
    setIsGroupInvitePickerOpen,
    setMobilePane,
    setProfileProfession,
      setSidebarSheet,
    });
  const emailVerificationInfo = resendOwnEmailVerificationMutation.isSuccess
    ? profile.email
      ? `Письмо для подтверждения отправлено на ${profile.email}.`
      : "Письмо для подтверждения отправлено."
    : null;
  const emailVerificationError = resendOwnEmailVerificationMutation.error
    ? describeError(resendOwnEmailVerificationMutation.error)
    : null;
  const resolvedEmailVerificationInfo =
    resendOwnEmailVerificationMutation.isSuccess && !resendOwnEmailVerificationMutation.error
      ? profile.email
        ? `Письмо для подтверждения отправлено на ${profile.email}.`
        : "Письмо для подтверждения отправлено."
      : null;
  const resolvedActiveChatHistoryAccessNotice = activeChatHistoryAccessNotice
    ? {
        ...activeChatHistoryAccessNotice,
        isPending: leaveGroupMutation.isPending,
      }
    : null;
  const changePasswordError = changePasswordMutation.error
    ? (changePasswordMutation.error instanceof ApiError &&
       changePasswordMutation.error.status === 401
       ? "Неверный текущий пароль."
       : describeError(changePasswordMutation.error))
    : null;
  const changeUsernameError = changeUsernameMutation.error
    ? describeError(changeUsernameMutation.error)
    : null;
  const changeUsernameInfo = changeUsernameMutation.isSuccess
    ? "Юзернейм успешно изменён."
    : null;

  const requestEmailChangeMutation = useMutation({
    mutationFn: (newEmail: string) => requestEmailChange(session.token, newEmail),
  });
  const emailChangeInfo = requestEmailChangeMutation.isSuccess
    ? `Ссылка для подтверждения отправлена на ${emailChangeInput.trim()}. Перейдите по ней для смены почты.`
    : null;
  const emailChangeError = requestEmailChangeMutation.error
    ? describeError(requestEmailChangeMutation.error)
    : null;

  useEffect(() => {
    if (sidebarSheet === "profile") {
      return;
    }

    setEmailChangeInput("");
    setUsernameChangeInput("");
    requestEmailChangeMutation.reset();
    changeUsernameMutation.reset();
    setPasswordChangeCurrent("");
    setPasswordChangeNext("");
    setPasswordChangeConfirm("");
  }, [sidebarSheet]);

  const handleMailOpenMessage = useEffectEvent((messageId: string) => {
    setActiveMailMessageId(messageId);
    setMailComposing(false);
    setMailReplyTo(null);
    setMailSendError(null);
  });

  const handleMailCompose = useEffectEvent(() => {
    setMailComposing(true);
    setActiveMailMessageId(null);
    setMailReplyTo(null);
    setMailSendError(null);
    mailSendMutation.reset();
  });

  const handleMailReply = useEffectEvent(() => {
    if (!activeMailMessage) return;
    setMailComposing(true);
    setMailReplyTo({
      to: activeMailMessage.from,
      subject: activeMailMessage.subject.startsWith("Re:")
        ? activeMailMessage.subject
        : `Re: ${activeMailMessage.subject}`,
    });
    setActiveMailMessageId(null);
    setMailSendError(null);
    mailSendMutation.reset();
  });

  const handleMailClose = useEffectEvent(() => {
    setMailComposing(false);
    setActiveMailMessageId(null);
    setMailReplyTo(null);
    setMailSendError(null);
    mailSendMutation.reset();
  });

  const handleMailSend = useEffectEvent((to: string, subject: string, body: string) => {
    mailSendMutation.mutate({ to, subject, body });
  });

  const handleMailDelete = useEffectEvent(() => {
    if (activeMailMessageId) {
      mailDeleteMutation.mutate(activeMailMessageId);
    }
  });

  const uploadAvatarFromFile = useEffectEvent(async (file: File) => {
    try {
      const avatarUrl = await readFileAsDataUrl(file);
      avatarMutation.mutate(avatarUrl);
    } catch {
      return;
    }
  });

  const uploadGroupAvatarFromFile = useEffectEvent(async (file: File) => {
    try {
      const avatarUrl = await readFileAsDataUrl(file);
      setGroupDetailsAvatarUrl(avatarUrl);
    } catch {
      return;
    }
  });

  const {
    addActiveChatToContacts,
    handleCancelScheduledConference,
    handleEndConference,
    handleConferenceStageExit,
    handleMenuAction,
    openConferenceEditorSheet,
    openConferenceMembersSheet,
    openGroupMembersSheet,
  } = useWorkspacePanelActions({
    activeChat,
    activeConference,
    activeConferenceIsArchived,
    activeConferenceIsOwnedByCurrentUser,
    activeDirectParticipant,
    addContact,
    cancelConferenceMutation,
    closeActiveConference,
    endConferenceMutation,
    openConferenceEditor,
    openConferenceSheet,
    openSidebarSheet,
    queryClient,
    sessionToken: session.token,
    setIsGroupInvitePickerOpen,
    setIsMenuOpen,
    signOut: () => signOutMutation.mutate(),
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (code: string) => acceptInviteLinkRequest(session.token, code),
    onSuccess: (result) => {
      if (result.chat) {
        queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
          upsertChat(current, result.chat!),
        );
        queryClient.setQueryData<string[]>(["archived-chats", session.token], (current) =>
          current?.filter((chatId) => chatId !== result.chat!.id) ?? [],
        );
        openChat(result.chat.id, "chats");
        onPendingInviteHandled();
        return;
      }

      if (result.conference) {
        queryClient.setQueryData<VideoConference[]>(["video-conferences", session.token], (current) =>
          upsertVideoConferences(current, result.conference!),
        );
        queryClient.setQueryData<VideoConference[]>(["video-conferences-archive", session.token], (current) =>
          removeVideoConference(current, result.conference!.id),
        );
        openConference(result.conference.id);
        onPendingInviteHandled();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
        return;
      }

      onPendingInviteHandled();
    },
  });

  const handleGenerateGroupInviteLink = useEffectEvent(() => {
    if (!activeChat || activeChat.direct || !activeChatCanManageInviteLink) {
      return;
    }

    createGroupInviteLinkMutation.mutate({
      chatId: activeChat.id,
      refresh: Boolean(groupInviteCodesByChatId[activeChat.id]),
    });
  });

  const handleGenerateConferenceInviteLink = useEffectEvent(() => {
    if (!activeConference || !activeConferenceCanShareInviteLink) {
      return;
    }

    createConferenceInviteLinkMutation.mutate({
      conferenceId: activeConference.id,
      refresh: Boolean(conferenceInviteCodesById[activeConference.id]),
    });
  });

  const handleSubmitUpdateGroup = useEffectEvent(() => {
    submitUpdateGroup();
  });

  const handleUpdateGroupPrejoinHistoryPolicy = useEffectEvent(
    (value: ChatPrejoinHistoryPolicy) => {
      submitUpdateGroupPrejoinHistoryPolicy(value);
    }
  );

  const handleToggleChatArchiveFromContextMenu = useEffectEvent((chatId: string) => {
    setContextMenu(null);
    toggleArchiveChat(chatId, archivedChatIdSet);
  });

  const handleLeaveGroup = useEffectEvent(() => {
    if (!activeChat || activeChat.direct || !activeChatCanLeaveGroup) {
      return;
    }

    if (!window.confirm(`Выйти из группы "${activeChat.title}"?`)) {
      return;
    }

    leaveGroupMutation.mutate(activeChat.id);
  });

  const handleDeleteGroup = useEffectEvent(() => {
    if (!activeChat || activeChat.direct || !activeChatCanDeleteGroup) {
      return;
    }

    if (!window.confirm(`Удалить группу "${activeChat.title}" для всех участников?`)) {
      return;
    }

    deleteGroupMutation.mutate(activeChat.id);
  });

  const handleBanParticipant = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || participant.id === session.user.id) {
      return;
    }

    if (!window.confirm(`Забанить ${participant.displayName} и убрать из группы?`)) {
      return;
    }

    banGroupParticipantMutation.mutate(participant);
  });

  const handleBanParticipantAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanModerateMembers || participant.id === session.user.id) {
      return;
    }

    if (!window.confirm(`Забанить ${participant.displayName} и убрать из группы?`)) {
      return;
    }

    banGroupParticipantMutation.mutate(participant);
  });

  const handleUnbanParticipantAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanModerateMembers) {
      return;
    }

    if (!window.confirm(`Снять бан с ${participant.displayName}?`)) {
      return;
    }

    unbanGroupParticipantMutation.mutate(participant);
  });

  const handleRemoveParticipantAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanModerateMembers || participant.id === session.user.id) {
      return;
    }

    if (!window.confirm(`Исключить ${participant.displayName} из группы?`)) {
      return;
    }

    removeGroupParticipantMutation.mutate(participant);
  });

  const handleAssignModeratorAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanManageRoles || participant.id === session.user.id) {
      return;
    }

    if (!window.confirm(`Назначить ${participant.displayName} модератором группы?`)) {
      return;
    }

    assignGroupModeratorMutation.mutate(participant);
  });

  const handleRevokeModeratorAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanManageRoles) {
      return;
    }

    if (!window.confirm(`Снять роль модератора с ${participant.displayName}?`)) {
      return;
    }

    revokeGroupModeratorMutation.mutate(participant);
  });

  const handleTransferGroupOwnershipAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatCanManageRoles || participant.id === session.user.id) {
      return;
    }

    if (
      !window.confirm(
        `Передать права владельца группы ${participant.displayName}? После передачи вы останетесь модератором.`
      )
    ) {
      return;
    }

    transferGroupOwnershipMutation.mutate(participant);
  });

  const handleToggleDirectBlock = useEffectEvent(() => {
    if (!activeDirectParticipant) {
      return;
    }

    if (activeDirectBlockedByMe) {
      unblockUserMutation.mutate(activeDirectParticipant.username);
      return;
    }

    if (!window.confirm(`Заблокировать ${activeDirectParticipant.displayName}?`)) {
      return;
    }

    blockUserMutation.mutate(activeDirectParticipant.username);
  });

  const handleStartDirectConference = useEffectEvent(() => {
    if (!activeDirectParticipant || activeDirectBlockedByMe) {
      return;
    }

    if (createConferenceMutation.isPending) return;
    const now = new Date().toISOString();
    createConferenceMutation.mutate({
      title: `Созвон с ${activeDirectParticipant.displayName}`,
      scheduledAt: now,
      participantUsernames: [activeDirectParticipant.username],
    });
  });

  const handleStartOrJoinGroupConference = useEffectEvent(() => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    if (activeChatLiveGroupConference) {
      openConference(activeChatLiveGroupConference.id);
      return;
    }

    if (startGroupConferenceCallMutation.isPending) return;
    startGroupConferenceCallMutation.mutate(activeChat.id);
  });

  useEffect(() => {
    if (!isChatMenuOpen || !activeChat || activeChat.direct || !activeChatCanManageInviteLink) {
      return;
    }

    if (groupInviteCodesByChatId[activeChat.id] || createGroupInviteLinkMutation.isPending) {
      return;
    }

    createGroupInviteLinkMutation.mutate({ chatId: activeChat.id });
  }, [activeChat, activeChatCanManageInviteLink, createGroupInviteLinkMutation, groupInviteCodesByChatId, isChatMenuOpen]);

  useEffect(() => {
    const shouldSyncGroupDetails = isChatMenuOpen || sidebarSheet === "groupInfo";
    if (!shouldSyncGroupDetails || !activeChat || activeChat.direct) {
      return;
    }

    setGroupDetailsTitle(activeChat.title);
    setGroupDetailsAvatarUrl(activeChat.avatarUrl ?? null);
    setGroupDetailsPrejoinHistoryPolicy(activeChat.prejoinHistoryPolicy ?? "FULL_HISTORY");
  }, [activeChat?.id, activeChat?.direct, isChatMenuOpen, sidebarSheet]);

  useEffect(() => {
    if (!pendingInviteCode) {
      return;
    }

    acceptInviteMutation.mutate(pendingInviteCode);
  }, [pendingInviteCode, session.token]);

  useEffect(() => {
    if (activeConferenceId === null) {
      setConferenceViewportMode("full");
    }
  }, [activeConferenceId]);

  const requestConferenceExit = useEffectEvent(() => {
    if (!activeConference) {
      return;
    }

    setConferenceExitRequestToken((current) => current + 1);
  });

  const handleConferencePresenceTouch = useEffectEvent((conferenceId: string) => {
    void touchConferencePresenceRequest(session.token, conferenceId).catch(() => {
      return;
    });
  });

  const handleConferencePresenceLeave = useEffectEvent(
    (conferenceId: string, options?: { keepalive?: boolean }) => {
      void clearConferencePresenceRequest(session.token, conferenceId, {
        keepalive: options?.keepalive,
      }).catch(() => {
        return;
      });
    }
  );

  const {
    handleAddContact,
    handleSubmitActiveDraft,
    handleSubmitCreateConference,
    handleSubmitCreateConferenceNow,
    handleSubmitCreateGroup,
    handleSubmitProfileDisplayName,
    toggleConferenceInviteParticipant,
    toggleConferenceParticipant,
    toggleGroupInviteParticipant,
    toggleGroupParticipant,
  } = useWorkspaceFormActions({
    addContact,
    setConferenceInviteUsernames,
    setConferenceParticipantUsernames,
    setContactSearch,
    setGroupInviteUsernames,
    setGroupParticipantUsernames,
    submitActiveDraft,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitProfileDisplayName,
  });

  useWorkspaceEffects({
    acknowledgeVisibleMessagesAsRead,
    activeChat,
    activeChatId,
    isActiveChatOpen,
    activeConferenceId,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    archivedConferences,
    conferences,
    chats,
    hasArchivedConferencesData: archivedConferencesQuery.data !== undefined,
    hasChatsData: chatsQuery.data !== undefined,
    hasConferencesData: conferencesQuery.data !== undefined,
    clearChatAttention,
    editingMessageId,
    extractImageFromClipboard,
    forwardingMessageIds,
    hasEditingMessage: Boolean(editingMessage),
    hasForwardingMessages: forwardingMessages.length > 0,
    hasReplyingMessage: Boolean(replyingToMessage),
    hydratedPinnedMessages: activePinnedMessages,
    lastMessage,
    lastMessageId,
    messageCount: messages.length,
    readableIncomingMessageIdsKey,
    profileDisplayName,
    profileProfession,
    queryClient,
    replyingToMessageId,
    sessionToken: session.token,
    setActiveChatId,
    setActiveConferenceId,
    setConferenceInviteUsernames,
    setEditingMessageId,
    setForwardingMessageIds,
    setGroupInviteUsernames,
    setIsConferenceInfoOpen,
    setIsGroupCreatePickerOpen,
    setIsGroupInvitePickerOpen,
    setMobilePane,
    setProfileDisplayName,
    setProfileProfession,
    setReplyingToMessageId,
    setSidebarSheet,
    sidebarSheet,
    syncChatPinnedMessages,
    uploadAvatarFromFile,
  });

  useRealtimeChatSubscription({
    acknowledgeDelivered,
    acknowledgeRead,
    activeChatId,
    isActiveChatOpen,
    hasActiveComposerTextRef,
    activePinnedMessageIdSet,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    chatIdsKey,
    clearChatUnreadIndicator,
    clearComposerContext,
    clearDraftForChat,
    clearTypingParticipant,
    currentSessionId: session.sessionId,
    currentUser: session.user,
    deleteChatLocally,
    isOwnMessage: (message) => isOwnMessage(message, session.user),
    isRealtimeConnected,
    normalizeIncomingMessage: (message) => ensureOwnMessageStatus(message, session.user),
    onConnectionChange: setIsRealtimeConnected,
    onUnauthorized: () => onSessionChange(null),
    queryClient,
    refreshChatPreviewFromServer,
    scheduleTypingStop,
    scheduleTypingTimeout,
    sendTypingHeartbeat,
    sessionToken: session.token,
    setEditingMessageId,
    setForwardingMessageIds,
    setReplyingToMessageId,
    setTypingByChatId,
    showIncomingToast,
    removeChatPinnedMessage,
    syncChatPreviewFromCache,
  });

  const loadOlderMessages = () => {
    if (!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) {
      return;
    }

    preserveOlderMessagesOffset();
    void messagesQuery.fetchNextPage();
  };
  const toggleConferenceViewMode = useEffectEvent(() => {
    setConferenceBrowserMode((current) => (current === "calendar" ? "list" : "calendar"));
  });

  const { errorText, showContactSearchResults, tabChats, tabChatsEmptyText } = useWorkspaceStatus({
    activeListTab,
    contactSearch,
    draftActivityByChatId,
    errorContextKey: [
      activeListTab,
      activeChat?.id ?? "-",
      activeConference?.id ?? "-",
      sidebarSheet ?? "-",
    ].join("|"),
    errors: [
      acceptInviteMutation.error,
      createChatMutation.error,
      createGroupMutation.error,
      createConferenceMutation.error,
      createGroupInviteLinkMutation.error,
      createConferenceInviteLinkMutation.error,
      updateConferenceMutation.error,
      cancelConferenceMutation.error,
      endConferenceMutation.error,
      leaveGroupMutation.error,
      deleteGroupMutation.error,
      banGroupParticipantMutation.error,
      removeGroupParticipantMutation.error,
      assignGroupModeratorMutation.error,
      revokeGroupModeratorMutation.error,
      addConferenceParticipantsMutation.error,
      addGroupParticipantsMutation.error,
      isTransientSendConfirmationError(sendMessageMutation.error)
        ? null
        : sendMessageMutation.error,
      signOutMutation.error,
      revokeSessionMutation.error,
      updateProfileMutation.error,
      changePasswordMutation.error,
      avatarMutation.error,
      deleteAccountMutation.error,
      updateArchivedChatMutation.error,
      deleteChatMutation.error,
      deleteMessageMutation.error,
      editMessageMutation.error,
      pinMessageMutation.error,
      forwardMessageMutation.error,
      toggleMessageReactionMutation.error,
      addContactMutation.error,
      removeContactMutation.error,
      blockUserMutation.error,
      unblockUserMutation.error,
      mailSendMutation.error,
      mailDeleteMutation.error,
      workspaceBootstrapQuery.error,
      chatsQuery.error,
      sessionsQuery.error,
      profileQuery.error,
      archivedChatsQuery.error,
      contactsQuery.error,
      blockedUsersQuery.error,
      mailboxesQuery.error,
      conferencesQuery.error,
      archivedConferencesQuery.error,
      draftsQuery.error,
      userSearchQuery.error,
      contactsSearchQuery.error,
      messagesQuery.error,
    ],
    normalizedSearch,
    onUnauthorized: () => onSessionChange(null),
    visibleChats,
  });
  const showTopSearchResults = search.trim().length > 0;
  const userSearchIsPending = showTopSearchResults && userSearchQuery.isFetching;
  const contactSearchIsPending = showContactSearchResults && contactsSearchQuery.isFetching;
  const chatListContent = useMemo(
    () => (
      <ChatListPanel
        activeListTab={activeListTab}
        conferenceViewMode={conferenceBrowserMode}
        onToggleConferenceViewMode={toggleConferenceViewMode}
        onOpenScheduleConference={() => openConferenceComposer("scheduled")}
        onOpenStartConferenceNow={() => openConferenceComposer("instant")}
        normalizedSearch={normalizedSearch}
        conferencesLoading={conferencesLoading}
        visibleConferences={visibleConferences}
        activeConferenceId={activeConference?.id ?? null}
        conferenceListScrollRef={conferenceListScrollRef}
        sessionUser={session.user}
        chatsLoading={chatsLoading}
        mailInbox={mailInbox}
        mailSent={mailSent}
        mailLoading={mailLoading}
        mailFolder={mailFolder}
        activeMailMessageId={activeMailMessageId}
        mailComposing={mailComposing}
        userMailAddress={userMailAddress}
        tabChats={tabChats}
        tabChatsEmptyText={tabChatsEmptyText}
        activeChatId={activeChat?.id ?? null}
        liveGroupConferencesByChatId={liveGroupConferencesByChatId}
        typingByChatId={typingByChatId}
        draftsByChatId={draftsByChatId}
        failedChatIds={failedChatIds}
        openConference={openConference}
        openChat={openChat}
        openChatAtMessage={openChatAtMessage}
        openChatAtFailedMessage={openChatAtFailedMessage}
        openChatContextMenu={openChatContextMenu}
        onMailSwitchFolder={setMailFolder}
        onMailOpenMessage={handleMailOpenMessage}
        onMailCompose={handleMailCompose}
        formatConferenceListPreview={formatConferenceListPreview}
        formatConferenceTileTime={formatConferenceTileTime}
        formatConferenceSchedule={formatConferenceSchedule}
        formatMailTimestamp={formatChatTimestamp}
        trimPreview={trimPreview}
        getDirectParticipant={getDirectParticipant}
        formatTypingParticipants={formatTypingParticipants}
        formatChatTimestamp={formatChatTimestamp}
        describeChat={describeChat}
        formatMemberCount={formatMemberCount}
      />
    ),
    [
      activeChat?.id,
      activeConference?.id,
      activeListTab,
      activeMailMessageId,
      chatsLoading,
      conferenceBrowserMode,
      conferencesLoading,
      draftsByChatId,
      failedChatIds,
      handleMailCompose,
      handleMailOpenMessage,
      liveGroupConferencesByChatId,
      mailComposing,
      mailFolder,
      mailInbox,
      mailLoading,
      mailSent,
      normalizedSearch,
      openChat,
      openChatContextMenu,
      openConference,
      session.user,
      setMailFolder,
      tabChats,
      tabChatsEmptyText,
      toggleConferenceViewMode,
      openConferenceComposer,
      typingByChatId,
      userMailAddress,
      visibleConferences,
    ]
  );
  const isConferenceMinimized = activeConference !== null && conferenceViewportMode === "mini";
  const conferenceSidebarDock =
    activeConference && isConferenceMinimized ? (
      <button
        type="button"
        className="conference-sidebar-dock-button"
        onClick={restoreActiveConference}
      >
        <span className="conference-sidebar-dock-indicator" aria-hidden="true" />
        <span className="conference-sidebar-dock-copy">
          <strong>{activeConference.title}</strong>
          <span>{activeConferenceStatusLabel ?? "Конференция активна"}</span>
        </span>
        <span className="conference-sidebar-dock-action">Открыть</span>
      </button>
    ) : null;
  const workspaceStyle: CSSProperties = {
    ["--north-sidebar-width" as string]: `${sidebarWidth}px`,
  };
  const buildUpdateBannerStyle: CSSProperties = {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    gap: 12,
    maxWidth: "min(680px, calc(100vw - 32px))",
    padding: "12px 16px",
    borderRadius: 16,
    background: "rgba(20, 34, 53, 0.96)",
    border: "1px solid rgba(125, 181, 255, 0.28)",
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
    color: "rgba(245, 248, 255, 0.96)",
    backdropFilter: "blur(14px)",
  };
  const buildUpdateMessageStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.4,
  };
  const sidebarUtilitySheetProps: ComponentProps<typeof SidebarUtilitySheets> = {
    sheet:
      sidebarSheet === "conference" ||
      sidebarSheet === "archive" ||
      sidebarSheet === "forward" ||
      sidebarSheet === "chatMedia"
        ? sidebarSheet
        : null,
    activeChat,
    sessionUser: session.user,
    sessionToken: session.token,
    conferenceComposerMode,
    conferenceChatId,
    conferenceEditingId,
    conferenceTitle,
    conferenceScheduledAt,
    conferenceCandidates,
    conferenceParticipantUsernames,
    contactsLoading,
    createConferencePending: createConferenceMutation.isPending,
    updateConferencePending: updateConferenceMutation.isPending,
    archivedChatsLoading,
    archivedChats,
    forwardingMessages,
    forwardableChats,
    forwardContactOptions,
    forwardPending: forwardMessageMutation.isPending,
    forwardErrorText: forwardMessageMutation.error
      ? describeError(forwardMessageMutation.error)
      : null,
    onClose: () => setSidebarSheet(null),
    onCloseConferenceComposer: () => {
      resetConferenceComposer();
      setSidebarSheet(null);
    },
    onOpenConferenceComposer: openConferenceComposer,
    onConferenceTitleChange: setConferenceTitle,
    onConferenceScheduledAtChange: setConferenceScheduledAt,
    onToggleConferenceParticipant: toggleConferenceParticipant,
    onSubmitCreateConferenceNow: () => handleSubmitCreateConferenceNow(formatClock),
    onSubmitCreateConference: () => handleSubmitCreateConference(formatClock),
    onSubmitUpdateConference: () => handleSubmitCreateConference(formatClock),
    onOpenChatContextMenu: openChatContextMenu,
    onOpenChat: openChat,
    onToggleArchiveChat: (chatId) => toggleArchiveChat(chatId, archivedChatIdSet),
    onCloseForward: () => clearComposerContext("forward"),
    onJumpToReplyTarget: scrollToMessage,
    onForwardToChat: forwardMessageToChat,
    onForwardToContact: forwardMessageToContact,
    onDownloadAttachment: handleDownloadAttachment,
    onLoadAttachmentPreview: handleLoadAttachmentPreview,
    onJumpToAttachmentSourceMessage: jumpToAttachmentSourceMessage,
    createMinimumConferenceDateTime,
    buildMessagePreview,
    describeChat,
    formatMemberCount,
    getDirectParticipant,
  };
  const sidebarManagementSheetProps: ComponentProps<typeof SidebarManagementSheets> = {
    sheet:
      sidebarSheet === "profile" ||
      sidebarSheet === "group" ||
      sidebarSheet === "groupInfo" ||
      sidebarSheet === "groupMembers" ||
      sidebarSheet === "conferenceMembers" ||
      sidebarSheet === "contacts" ||
      sidebarSheet === "sessions"
        ? sidebarSheet
        : null,
    profile,
    mailServerEnabled: mailboxes.length > 0,
    sessionUser: session.user,
    currentSessionId: session.sessionId,
    profileDisplayName,
    profileProfession,
    passwordChangeCurrent,
    passwordChangeNext,
    passwordChangeConfirm,
    deleteAccountConfirmation,
    deleteAccountRequiresMatch,
    groupTitle,
    groupDetailsTitle,
    groupDetailsAvatarUrl,
    groupDetailsPrejoinHistoryPolicy,
    contactSearch,
    showContactSearchResults,
    contactSearchResults,
    contacts,
    contactsLoading,
    sessions,
    sessionsLoading,
    activeChat,
    activeConference,
    bannedGroupParticipants,
    groupBansLoading: groupBansQuery.isFetching && bannedGroupParticipants.length === 0,
    groupInviteLinkUrl: activeGroupInviteUrl,
    groupContacts,
    selectedGroupContacts,
    isGroupCreatePickerOpen,
    groupParticipantUsernames,
    availableGroupInviteContacts,
    selectedGroupInviteContacts,
    isGroupInvitePickerOpen,
    groupInviteUsernames,
    availableConferenceInviteContacts,
    conferenceInviteUsernames,
    createGroupPending: createGroupMutation.isPending,
    groupInviteLinkPending: createGroupInviteLinkMutation.isPending,
    addGroupParticipantsPending: addGroupParticipantsMutation.isPending,
    addConferenceParticipantsPending: addConferenceParticipantsMutation.isPending,
    updateGroupPending:
      updateGroupMutation.isPending || updateGroupHistoryPolicyMutation.isPending,
    unbanGroupParticipantPending: unbanGroupParticipantMutation.isPending,
    createChatPending: createChatMutation.isPending,
    updateProfilePending: updateProfileMutation.isPending,
    changePasswordPending: changePasswordMutation.isPending,
    changePasswordError,
    changePasswordSuccess,
    avatarPending: avatarMutation.isPending,
    deleteAccountPending: deleteAccountMutation.isPending,
    emailVerificationPending: resendOwnEmailVerificationMutation.isPending,
    emailVerificationInfo: resolvedEmailVerificationInfo,
    emailVerificationError,
    emailChangePending: requestEmailChangeMutation.isPending,
    emailChangeInfo,
    emailChangeError,
    emailChangeInput,
    onEmailChangeInputChange: (value: string) => {
      setEmailChangeInput(value);
      requestEmailChangeMutation.reset();
    },
    onRequestEmailChange: () => requestEmailChangeMutation.mutate(emailChangeInput.trim()),
    usernameChangePending: changeUsernameMutation.isPending,
    usernameChangeInfo: changeUsernameInfo,
    usernameChangeError: changeUsernameError,
    usernameChangeInput,
    onUsernameChangeInputChange: (value: string) => {
      setUsernameChangeInput(value);
      changeUsernameMutation.reset();
    },
    onSubmitUsernameChange: () => changeUsernameMutation.mutate(usernameChangeInput.trim()),
    pushNotificationsSupported: pushNotificationState.supported,
    pushNotificationsServerEnabled: pushNotificationState.serverEnabled,
    pushNotificationsEnabled: pushNotificationState.subscribed,
    pushNotificationsPermission: pushNotificationState.permission,
    pushNotificationsPending: pushNotificationPending,
    pushNotificationsInfo: pushNotificationInfo,
    pushNotificationsError: pushNotificationError,
    revokeSessionPending: revokeSessionMutation.isPending,
    contactSearchFetching: contactSearchIsPending,
    onClose: () => setSidebarSheet(null),
    onProfileDisplayNameChange: setProfileDisplayName,
    onProfileProfessionChange: setProfileProfession,
    onSubmitProfileDisplayName: handleSubmitProfileDisplayName,
    onPasswordChangeCurrentChange: setPasswordChangeCurrent,
    onPasswordChangeNextChange: setPasswordChangeNext,
    onPasswordChangeConfirmChange: setPasswordChangeConfirm,
    onSubmitPasswordChange: submitPasswordChange,
    onDeleteAccountConfirmationChange: setDeleteAccountConfirmation,
    onDeleteAccount: () => deleteAccountMutation.mutate(),
    onRemoveAvatar: () => avatarMutation.mutate(null),
    onAvatarSelected: (file) => void uploadAvatarFromFile(file),
    onResendEmailVerification: () => resendOwnEmailVerificationMutation.mutate(),
    onEnablePushNotifications: () => void handleEnablePushNotifications(),
    onDisablePushNotifications: () => void handleDisablePushNotifications(),
    onGroupTitleChange: setGroupTitle,
    onGroupDetailsTitleChange: setGroupDetailsTitle,
    onGroupDetailsPrejoinHistoryPolicyChange: handleUpdateGroupPrejoinHistoryPolicy,
    onGroupAvatarSelected: (file) => void uploadGroupAvatarFromFile(file),
    onRemoveGroupAvatar: () => setGroupDetailsAvatarUrl(null),
    onToggleGroupCreatePicker: () => setIsGroupCreatePickerOpen((current) => !current),
    onToggleGroupParticipant: toggleGroupParticipant,
    onSubmitCreateGroup: handleSubmitCreateGroup,
    onSubmitUpdateGroup: handleSubmitUpdateGroup,
    onOpenGroupMembers: openGroupMembersSheet,
    onToggleGroupInvitePicker: () => setIsGroupInvitePickerOpen((current) => !current),
    onToggleGroupInviteParticipant: toggleGroupInviteParticipant,
    onSubmitAddGroupParticipants: submitAddGroupParticipants,
    onUnbanParticipant: handleUnbanParticipantAction,
    onGenerateGroupInviteLink: handleGenerateGroupInviteLink,
    onCopyGroupInviteLink: (value) => void navigator.clipboard.writeText(value),
    onToggleConferenceInviteParticipant: toggleConferenceInviteParticipant,
    onSubmitAddConferenceParticipants: submitAddConferenceParticipants,
    onContactSearchChange: setContactSearch,
    onAddContact: handleAddContact,
    onRemoveContact: removeContact,
    onCreateChat: (username) => createChatMutation.mutate(username),
    onRevokeSession: (sessionId) => revokeSessionMutation.mutate(sessionId),
    formatProfileDate,
    formatSessionTime,
  };
  const sidebarMenuOverlayProps: ComponentProps<typeof SidebarMenuOverlay> = {
    profile,
    menuActions: MENU_ACTIONS,
    menuPanelRef,
    isSigningOut: signOutMutation.isPending,
    onClose: () => setIsMenuOpen(false),
    onAction: handleMenuAction,
  };
  const activeConferenceConversationProps =
    activeConference
      ? {
          conference: activeConference,
          jitsiBaseUrl: JITSI_BASE_URL,
          jwtTokenFetcher: () => fetchConferenceJitsiToken(session.token, activeConference.id),
          profileDisplayName: profile.displayName,
          organizerLabel: activeConferenceOrganizerLabel,
          roleLabel: activeConferenceRoleLabel,
          statusLabel: activeConferenceStatusLabel,
          stageHint: activeConferenceStageHint,
          canJoin: activeConferenceCanJoin,
          canEditSchedule: activeConferenceCanEditSchedule,
          canCancelSchedule: activeConferenceCanCancelSchedule,
          canManageParticipants: activeConferenceCanManageParticipants,
          canShareInviteLink: activeConferenceCanShareInviteLink,
          conferenceActionPending:
            updateConferenceMutation.isPending ||
            cancelConferenceMutation.isPending ||
            endConferenceMutation.isPending,
          localRecordingActive: activeConferenceLocalRecordingActive,
          shareUrl: activeConferenceShareUrl,
          shareUrlPending: createConferenceInviteLinkMutation.isPending,
          isInfoOpen: isConferenceInfoOpen,
          infoButtonRef: conferenceInfoButtonRef,
          infoPanelRef: conferenceInfoPanelRef,
          onBack: () => setMobilePane("sidebar"),
          onEditConference: openConferenceEditorSheet,
          onCancelConference: handleCancelScheduledConference,
          onConferenceEndForAll: () => handleEndConference({ skipConfirm: true }),
          onConferencePresenceTouch: handleConferencePresenceTouch,
          onConferencePresenceLeave: handleConferencePresenceLeave,
          onGenerateShareUrl: handleGenerateConferenceInviteLink,
          onToggleInfo: () => setIsConferenceInfoOpen((current) => !current),
          onOpenMembers: openConferenceMembersSheet,
          onCopyShareUrl: (value: string) => void navigator.clipboard.writeText(value),
          onRecordingStateChange: setConferenceRecordingState,
          exitRequestToken: conferenceExitRequestToken,
          onConferenceExit: handleConferenceStageExit,
          formatConferenceSchedule,
          formatMemberCount,
        }
      : null;
  const activeChatConversationProps: ComponentProps<typeof ActiveChatConversation> | null =
    (!activeConference || isConferenceMinimized) && activeChat
      ? {
          activeChat,
          activeDirectParticipant,
          activeGroupConference: activeChatLiveGroupConference,
          sessionUser: session.user,
          conversationSubtitle,
          showTypingIndicator,
          activePinnedMessage,
          activePinnedMessageIndex,
          activePinnedMessageCount: activePinnedMessages.length,
          timelineItems,
          messagesLoading,
          hasNextPage: Boolean(messagesQuery.hasNextPage),
          isFetchingNextPage: messagesQuery.isFetchingNextPage,
          replyingToMessage,
          editingMessage,
          isSelectingMessages,
          selectedMessageCount: selectedMessages.length,
          selectedMessageIdSet,
          canForwardSelectedMessages,
          canDeleteSelectedMessagesForEveryone,
          isDeleteSelectedMessagesDialogOpen,
          activeDraft,
          isChatMenuOpen,
          isDirectChatBlocked: activeDirectBlockedByMe,
          historyAccessNotice: resolvedActiveChatHistoryAccessNotice,
          chatMenuButtonRef,
          messageStreamRef,
          composerTextareaRef,
          onBack: () => setMobilePane("sidebar"),
          onToggleChatMenu: () => {
            setIsChatMembersOpen(false);
            setIsChatMenuOpen((current) => !current);
          },
          onOpenMembers: () => {
            setIsChatMenuOpen(false);
            setIsChatMembersOpen(true);
          },
          onStartOrJoinGroupConference: handleStartOrJoinGroupConference,
          onCloseChat: closeActiveChat,
          onJumpToPinned: () => {
            if (activePinnedMessage) {
              jumpToSourceMessageTarget(activeChat.id, {
                messageId: activePinnedMessage.id,
                messageServerOrder: activePinnedMessage.serverOrder ?? null,
              });
            }
          },
          onSelectPreviousPinned: () => {
            if (activePinnedMessages.length <= 1 || activePinnedMessageIndex <= 0) {
              return;
            }

            setActivePinnedMessageId(activePinnedMessages[activePinnedMessageIndex - 1]!.id);
          },
          onSelectNextPinned: () => {
            if (
              activePinnedMessages.length <= 1 ||
              activePinnedMessageIndex < 0 ||
              activePinnedMessageIndex >= activePinnedMessages.length - 1
            ) {
              return;
            }

            setActivePinnedMessageId(activePinnedMessages[activePinnedMessageIndex + 1]!.id);
          },
          onUnpin: () =>
            activePinnedMessage
              ? pinMessageMutation.mutate({
                  chatId: activeChat.id,
                  messageId: activePinnedMessage.id,
                })
              : undefined,
          onLoadOlderMessages: loadOlderMessages,
          onOpenMessageContextMenu: openMessageContextMenu,
          onToggleReaction: toggleReactionForMessage,
          onJumpToMessage: scrollToMessage,
          onClearReply: clearReplyComposerContext,
          onClearEdit: clearEditComposerContext,
          onToggleSelectedMessage: toggleMessageSelection,
          onCancelMessageSelection: clearMessageSelection,
          onForwardSelectedMessages: openSelectedMessagesForward,
          onRequestDeleteSelectedMessages: () => setIsDeleteSelectedMessagesDialogOpen(true),
          onCloseDeleteSelectedMessagesDialog: () => setIsDeleteSelectedMessagesDialogOpen(false),
          onDeleteSelectedMessagesForSelf: confirmDeleteSelectedMessagesForSelf,
          onDeleteSelectedMessagesForEveryone: confirmDeleteSelectedMessagesForEveryone,
          onRetryMessage: retryFailedMessage,
          onDownloadAttachment: handleDownloadAttachment,
          onLoadAttachmentPreview: handleLoadAttachmentPreview,
          onComposerChange: handleComposerChange,
          onCommitDraft: commitDraftForChat,
          onSubmit: handleSubmitActiveDraft,
          formatClock,
          getMessageStatusClassName,
          getMessageStatusGlyph,
          getMessageStatusLabel,
          getReactionOption,
          buildMessagePreview,
        }
      : null;
  const chatMenuPanelProps: ComponentProps<typeof ChatMenuPanel> | null =
    (!activeConference || isConferenceMinimized) && activeChat && isChatMenuOpen
      ? {
          activeChat,
          activeDirectParticipant,
          activeDirectInContacts,
          isDirectBlocked: activeDirectBlockedByMe,
          activeGroupConference: activeChatLiveGroupConference,
          groupDetailsTitle,
          groupDetailsAvatarUrl,
          groupDetailsPrejoinHistoryPolicy,
          groupInviteLinkUrl: activeGroupInviteUrl,
          availableGroupInviteContacts,
          selectedGroupInviteContacts,
          isGroupInvitePickerOpen,
          groupInviteLinkPending: createGroupInviteLinkMutation.isPending,
          addGroupParticipantsPending: addGroupParticipantsMutation.isPending,
          updateGroupPending:
            updateGroupMutation.isPending || updateGroupHistoryPolicyMutation.isPending,
          createChatPending: createChatMutation.isPending,
          leaveGroupPending: leaveGroupMutation.isPending,
          deleteGroupPending: deleteGroupMutation.isPending,
          banGroupParticipantPending: banGroupParticipantMutation.isPending,
          removeGroupParticipantPending: removeGroupParticipantMutation.isPending,
          assignModeratorPending: assignGroupModeratorMutation.isPending,
          revokeModeratorPending: revokeGroupModeratorMutation.isPending,
          toggleBlockPending: blockUserMutation.isPending || unblockUserMutation.isPending,
          canDeleteGroup: activeChatCanDeleteGroup,
          canEditGroup: activeChatCanEditGroup,
          canManageInviteLink: activeChatCanManageInviteLink,
          onClose: () => setIsChatMenuOpen(false),
          onOpenMembers: () => {
            setIsChatMenuOpen(false);
            setIsChatMembersOpen(true);
          },
          onOpenMediaBrowser: openActiveChatMediaBrowser,
          onGroupDetailsTitleChange: setGroupDetailsTitle,
          onGroupAvatarSelected: (file) => void uploadGroupAvatarFromFile(file),
          onRemoveGroupAvatar: () => setGroupDetailsAvatarUrl(null),
          onGroupDetailsPrejoinHistoryPolicyChange: handleUpdateGroupPrejoinHistoryPolicy,
          onSubmitUpdateGroup: handleSubmitUpdateGroup,
          onGenerateGroupInviteLink: handleGenerateGroupInviteLink,
          onCopyGroupInviteLink: (value) => void navigator.clipboard.writeText(value),
          onToggleGroupInvitePicker: () => setIsGroupInvitePickerOpen((current) => !current),
          onToggleGroupInviteParticipant: toggleGroupInviteParticipant,
          onSubmitAddGroupParticipants: submitAddGroupParticipants,
          onOpenGroupConferenceComposer: openGroupConferenceComposer,
          onStartOrJoinGroupConference: handleStartOrJoinGroupConference,
          onCreateChat: (username) => createChatMutation.mutate(username),
          onLeaveGroup: handleLeaveGroup,
          onDeleteGroup: handleDeleteGroup,
          onBanParticipant: handleBanParticipantAction,
          onRemoveParticipant: handleRemoveParticipantAction,
          onAssignModerator: handleAssignModeratorAction,
          onRevokeModerator: handleRevokeModeratorAction,
          onAddToContacts: addActiveChatToContacts,
          onStartDirectConference: handleStartDirectConference,
          onToggleBlocked: handleToggleDirectBlock,
        }
      : null;
  const chatMembersPanelProps: ComponentProps<typeof ChatMembersPanel> | null =
    (!activeConference || isConferenceMinimized) && activeChat && isChatMembersOpen
      ? {
          activeChat,
          bannedParticipants: bannedGroupParticipants,
          activeConferenceParticipantUserIds: [...activeChatLiveParticipantIdSet],
          sessionUserId: session.user.id,
          createChatPending: createChatMutation.isPending,
          addGroupParticipantsPending: addGroupParticipantsMutation.isPending,
          banGroupParticipantPending: banGroupParticipantMutation.isPending,
          groupBansLoading: groupBansQuery.isFetching && bannedGroupParticipants.length === 0,
          removeGroupParticipantPending: removeGroupParticipantMutation.isPending,
          assignModeratorPending: assignGroupModeratorMutation.isPending,
          revokeModeratorPending: revokeGroupModeratorMutation.isPending,
          transferOwnershipPending: transferGroupOwnershipMutation.isPending,
          unbanGroupParticipantPending: unbanGroupParticipantMutation.isPending,
          canAddMembers: activeChatCanAddMembers,
          canManageRoles: activeChatCanManageRoles,
          canModerateMembers: activeChatCanModerateMembers,
          availableGroupInviteContacts,
          selectedGroupInviteContacts,
          isGroupInvitePickerOpen,
          groupInviteUsernames,
          onClose: () => setIsChatMembersOpen(false),
          onCreateChat: (username) => createChatMutation.mutate(username),
          onToggleGroupInvitePicker: () => setIsGroupInvitePickerOpen((current) => !current),
          onToggleGroupInviteParticipant: toggleGroupInviteParticipant,
          onSubmitAddGroupParticipants: submitAddGroupParticipants,
          onBanParticipant: handleBanParticipantAction,
          onUnbanParticipant: handleUnbanParticipantAction,
          onRemoveParticipant: handleRemoveParticipantAction,
          onAssignModerator: handleAssignModeratorAction,
          onRevokeModerator: handleRevokeModeratorAction,
          onTransferOwnership: handleTransferGroupOwnershipAction,
        }
      : null;
  const messageContextMenuProps: ComponentProps<typeof MessageContextMenu> | null = contextMenu
    ? {
        contextMenu,
        contextMenuRef,
        contextMenuStyle,
        contextMenuMessage,
        reactionOptions: MESSAGE_REACTION_OPTIONS,
        getMessageReaction,
        onToggleReaction: toggleReactionFromContextMenu,
        canReactContextMenuMessage,
        canEditContextMenuMessage,
        canForwardContextMenuMessage,
        canPinContextMenuMessage,
        isPinnedContextMenuMessage,
        canDeleteContextMenuMessageForSelf,
        showDeleteContextMenuMessageForEveryone,
        canDeleteContextMenuMessageForEveryone,
        deleteForEveryoneLabel,
        deleteForEveryoneHint,
        onReply: replyToMessage,
        onEdit: editMessageAction,
        onForward: forwardMessageAction,
        onSelect: startMessageSelection,
        onTogglePinned: togglePinnedMessageAction,
        onCopy: copyMessageText,
        onDeleteForSelf: deleteMessageForSelf,
        onDeleteForEveryone: deleteMessageForEveryone,
        isChatArchived:
          contextMenu.kind === "chat" ? archivedChatIdSet.has(contextMenu.chatId) : false,
        onToggleChatArchive: handleToggleChatArchiveFromContextMenu,
        onDeleteChatForSelf: deleteChatForSelf,
      }
    : null;

  return (
    <main
      className="workspace-shell north-workspace"
      data-mobile-pane={mobilePane}
      style={workspaceStyle}
    >
      {availableBuildUpdate ? (
        <div style={buildUpdateBannerStyle} role="status" aria-live="polite">
          <p style={buildUpdateMessageStyle}>
            Доступна новая версия приложения. Обновите вкладку, чтобы применить последние
            исправления доставки и шифрования.
          </p>
          <button type="button" className="ghost-button compact" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </div>
      ) : null}
      <WorkspaceSidebar
        activeListTab={activeListTab}
        chatListContent={chatListContent}
        conferenceDock={conferenceSidebarDock}
        conferenceListScrollRef={conferenceListScrollRef}
        isMenuOpen={isMenuOpen}
        menuButtonRef={menuButtonRef}
        menuOverlayProps={sidebarMenuOverlayProps}
        onActivateListTab={activateListTab}
        onSearchChange={setSearch}
        onSelectSearchUser={(user) => {
          createChatMutation.mutate(user.username);
          setSearch("");
        }}
        onToggleMenu={() => setIsMenuOpen((current) => !current)}
        search={search}
        showChatsTabIndicator={showChatsTabIndicator}
        showMailTab={showMailTab}
        showConferencesTabIndicator={showConferencesTabIndicator}
        showTopSearchResults={showTopSearchResults}
        sidebarManagementSheetProps={sidebarManagementSheetProps}
        sidebarSheet={sidebarSheet}
        sidebarUtilitySheetProps={sidebarUtilitySheetProps}
        userSearchIsFetching={userSearchIsPending}
        userSearchResults={userSearchResults}
      />

      <div
        className="north-layout-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Изменить ширину списка диалогов"
        onPointerDown={startSidebarResize}
      />

      <WorkspaceConversation
        activeChatConversationProps={activeChatConversationProps}
        activeConferenceConversationProps={activeConferenceConversationProps}
        activeListTab={activeListTab}
        chatMembersPanelRef={chatMembersPanelRef}
        chatMembersProps={chatMembersPanelProps}
        chatMenuPanelRef={chatMenuPanelRef}
        chatMenuProps={chatMenuPanelProps}
        chatsLoading={chatsLoading}
        conferenceSurfaceRef={conferenceSurfaceRef}
        conferencesLoading={conferencesLoading}
        contextMenuProps={messageContextMenuProps}
        errorText={errorText}
        incomingToasts={incomingToasts}
        isConferenceMinimized={isConferenceMinimized}
        mailComposeProps={
          mailComposing
            ? {
                sendPending: mailSendMutation.isPending,
                sendError: mailSendError,
                initialTo: mailReplyTo?.to,
                initialSubject: mailReplyTo?.subject,
                onSend: handleMailSend,
                onClose: handleMailClose,
              }
            : null
        }
        mailMessageProps={
          activeMailMessageId && !mailComposing
            ? {
                message: activeMailMessage,
                loading: mailMessageQuery.isFetching && !activeMailMessage,
                deletePending: mailDeleteMutation.isPending,
                folder: mailFolder,
                onDelete: handleMailDelete,
                onReply: handleMailReply,
                formatMailTimestamp: formatChatTimestamp,
              }
            : null
        }
        onOpenToastChat={openChat}
        showConference={Boolean(activeConference)}
      />
    </main>
  );
}

function isTransientSendConfirmationError(error: unknown) {
  return error instanceof ApiError && [0, 503, 504].includes(error.status);
}

function normalizeConversationListTabForProfile(
  tab: ConversationListTab,
  mailEnabled: boolean | undefined
): ConversationListTab {
  return !mailEnabled && tab === "mail" ? "chats" : tab;
}

async function readCurrentBuildRevision(): Promise<BuildRevisionMeta | null> {
  try {
    const response = await fetch("/build-meta.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    const candidate = (await response.json()) as Partial<BuildRevisionMeta> | null;
    if (!candidate || typeof candidate.revision !== "string" || candidate.revision.length === 0) {
      return null;
    }

    return {
      revision: candidate.revision,
      builtAt: typeof candidate.builtAt === "string" ? candidate.builtAt : null,
    };
  } catch {
    return null;
  }
}

