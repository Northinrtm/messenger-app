import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
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
  createConferenceInviteLink as createConferenceInviteLinkRequest,
  createGroupInviteLink as createGroupInviteLinkRequest,
  createVideoConference as createVideoConferenceRequest,
  deleteOwnAccount as deleteOwnAccountRequest,
  deleteChat as deleteChatRequest,
  describeError,
  endVideoConference as endVideoConferenceRequest,
  createDirectChat,
  createGroupChat,
  touchConferencePresence as touchConferencePresenceRequest,
  updatePinnedMessage as updatePinnedMessageRequest,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  updateArchivedChat,
  updateProfile,
  updateProfileAvatar,
} from "../../lib/api";
import { JITSI_BASE_URL } from "../../lib/config";
import {
  clearPinnedEncryptionIdentity,
  isEncryptionIdentityChangedError,
  isUnavailableEncryptedMessage,
  primeEncryptedMessageRecipients,
} from "../../lib/e2ee";
import type {
  AuthResponse,
  ChatMessage,
  MessageReaction,
  ChatSummary,
  Participant,
  UserProfile,
  UserSessionInfo,
  VideoConference,
} from "../../lib/types";
import {
  applyChatPreviewOverrides,
  clearChatUnreadCount,
  removeChatById,
  upsertChat,
} from "./chatState";
import { formatTypingParticipants } from "./typingState";
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
  buildTimeline,
  extractImageFromClipboard,
  isCurrentUserParticipant,
  mergeTypingParticipants,
  normalizeAccountDeletionConfirmation,
  readFileAsDataUrl,
  syncChatTypingParticipants,
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
import { ActiveConferenceConversation } from "./components/ActiveConferenceConversation";
import { ActiveChatConversation } from "./components/ActiveChatConversation";
import { AvatarCircle } from "./components/AvatarCircle";
import { ChatMembersPanel } from "./components/ChatMembersPanel.next";
import { ChatMenuPanel } from "./components/ChatMenuPanel";
import { ChatListPanel } from "./components/ChatListPanel";
import { MessageContextMenu } from "./components/MessageContextMenu";
import { SidebarManagementSheets } from "./components/SidebarManagementSheets";
import { SidebarMenuOverlay } from "./components/SidebarMenuOverlay";
import { SidebarUtilitySheets } from "./components/SidebarUtilitySheets";
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
import { useWorkspaceStatus } from "./hooks/useWorkspaceStatus";

type Props = {
  pendingInviteCode: string | null;
  onPendingInviteHandled: () => void;
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

const TYPING_EVENT_TTL_MS = 8_000;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 8_000;
const MESSAGE_QUERY_GC_TIME_MS = 60_000;
const TYPING_QUERY_GC_TIME_MS = 15_000;
const SEARCH_QUERY_GC_TIME_MS = 30_000;
const CONFERENCE_ACTIVATION_LEAD_MS = 5 * 60 * 1000;
const CONFERENCE_MINI_WINDOW_MARGIN_PX = 8;

type ConferenceMiniPosition = {
  x: number;
  y: number;
};

type ChatEncryptionIdentityWarning = {
  chatId: string;
  participantIds: string[];
  errorText: string | null;
};

function clampConferenceMiniPosition(
  position: ConferenceMiniPosition,
  size: { width: number; height: number }
) {
  const maxX = Math.max(CONFERENCE_MINI_WINDOW_MARGIN_PX, window.innerWidth - size.width - CONFERENCE_MINI_WINDOW_MARGIN_PX);
  const maxY = Math.max(
    CONFERENCE_MINI_WINDOW_MARGIN_PX,
    window.innerHeight - size.height - CONFERENCE_MINI_WINDOW_MARGIN_PX
  );

  return {
    x: Math.min(Math.max(position.x, CONFERENCE_MINI_WINDOW_MARGIN_PX), maxX),
    y: Math.min(Math.max(position.y, CONFERENCE_MINI_WINDOW_MARGIN_PX), maxY),
  };
}

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
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
  const [conferenceViewportMode, setConferenceViewportMode] = useState<"full" | "mini">("full");
  const [activeListTab, setActiveListTab] = useState<ConversationListTab>("dialogs");
  const [conferenceBrowserMode, setConferenceBrowserMode] = useState<"list" | "calendar">("list");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isChatMembersOpen, setIsChatMembersOpen] = useState(false);
  const [sidebarSheet, setSidebarSheet] = useState<SidebarSheet>(null);
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDetailsTitle, setGroupDetailsTitle] = useState("");
  const [groupDetailsAvatarUrl, setGroupDetailsAvatarUrl] = useState<string | null>(null);
  const [conferenceTitle, setConferenceTitle] = useState("");
  const [conferenceScheduledAt, setConferenceScheduledAt] = useState(() =>
    createInitialConferenceDateTime()
  );
  const [conferenceComposerMode, setConferenceComposerMode] = useState<"instant" | "scheduled" | null>(null);
  const [conferenceEditingId, setConferenceEditingId] = useState<string | null>(null);
  const [conferenceParticipantUsernames, setConferenceParticipantUsernames] = useState<string[]>([]);
  const [conferenceInviteUsernames, setConferenceInviteUsernames] = useState<string[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState(session.user.displayName);
  const [profileProfession, setProfileProfession] = useState(session.user.profession ?? "");
  const [passwordChangeCurrent, setPasswordChangeCurrent] = useState("");
  const [passwordChangeNext, setPasswordChangeNext] = useState("");
  const [passwordChangeConfirm, setPasswordChangeConfirm] = useState("");
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [isGroupCreatePickerOpen, setIsGroupCreatePickerOpen] = useState(false);
  const [isGroupInvitePickerOpen, setIsGroupInvitePickerOpen] = useState(false);
  const [pendingOutgoingCountByChatId, setPendingOutgoingCountByChatId] = useState<Record<string, number>>({});
  const [contactSearch, setContactSearch] = useState("");
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const [isConferenceInfoOpen, setIsConferenceInfoOpen] = useState(false);
  const [conferenceRecordingState, setConferenceRecordingState] =
    useState<ConferenceRecordingState>("idle");
  const [conferenceExitRequestToken, setConferenceExitRequestToken] = useState(0);
  const [conferenceMiniPosition, setConferenceMiniPosition] = useState<ConferenceMiniPosition | null>(null);
  const [isConferenceMiniDragging, setIsConferenceMiniDragging] = useState(false);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);
  const [groupInviteCodesByChatId, setGroupInviteCodesByChatId] = useState<Record<string, string>>({});
  const [conferenceInviteCodesById, setConferenceInviteCodesById] = useState<Record<string, string>>({});
  const [pendingGroupMenuOpenChatId, setPendingGroupMenuOpenChatId] = useState<string | null>(null);
  const [chatEncryptionIdentityWarning, setChatEncryptionIdentityWarning] =
    useState<ChatEncryptionIdentityWarning | null>(null);
  const [isRecoveringEncryptionIdentity, setIsRecoveringEncryptionIdentity] = useState(false);
  const [initialChatViewportHint, setInitialChatViewportHint] = useState<{
    chatId: string;
    unreadCount: number;
  } | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const conferenceListScrollRef = useRef<HTMLDivElement | null>(null);
  const conferenceSurfaceRef = useRef<HTMLDivElement | null>(null);
  const conferenceMiniDragCleanupRef = useRef<(() => void) | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredContactSearch = useDeferredValue(contactSearch);
  const { sidebarWidth, startSidebarResize } = useSidebarResize();
  const {
    clearChatAttention,
    dismissIncomingToast,
    incomingToasts,
    showIncomingToast,
  } = useIncomingToasts({
    activeChatId,
    currentUserId: session.user.id,
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
    mutationFn: (conferenceId: string) => createConferenceInviteLinkRequest(session.token, conferenceId),
    onSuccess: (inviteLink, conferenceId) => {
      setConferenceInviteCodesById((current) => ({
        ...current,
        [conferenceId]: inviteLink.code,
      }));
    },
  });
  const handleGroupCreated = useEffectEvent((chat: ChatSummary, options: { openMenu: boolean }) => {
    createGroupInviteLinkMutation.mutate({ chatId: chat.id });
    if (options.openMenu) {
      setPendingGroupMenuOpenChatId(chat.id);
    }
  });
  const {
    contextMenu,
    contextMenuRef,
    contextMenuStyle,
    openChatContextMenu,
    openMessageContextMenu,
    setContextMenu,
  } = useContextMenu();
  const {
    activeDraft,
    clearDraftForChat,
    composerTextareaRef,
    draftsByChatId,
    draftsQuery,
    focusComposer,
    handleComposerChange: setComposerDraft,
    scheduleDraftSave,
    setDraftsByChatId,
  } = useChatDrafts({
    activeChatId,
    queryClient,
    token: session.token,
    userId: session.user.id,
  });
  const {
    clearTypingParticipant,
    handleComposerChange,
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
    ttlMs: TYPING_EVENT_TTL_MS,
    setComposerDraft,
  });
  const activePendingOutgoingCount = activeChatId
    ? pendingOutgoingCountByChatId[activeChatId] ?? 0
    : 0;
  const {
    activeTypingQuery,
    archivedChatsQuery,
    archivedConferencesQuery,
    blockedUsersQuery,
    chatsQuery,
    conferencesQuery,
    contactsQuery,
    contactsSearchQuery,
    messages,
    messagesQuery,
    profileQuery,
    sessionsQuery,
    userSearchQuery,
  } = useWorkspaceQueries({
    activeChatId,
    activeConferenceId,
    activeListTab,
    activePendingOutgoingCount,
    deferredContactSearch,
    deferredSearch,
    isRealtimeConnected,
    messageQueryGcTimeMs: MESSAGE_QUERY_GC_TIME_MS,
    searchQueryGcTimeMs: SEARCH_QUERY_GC_TIME_MS,
    sessionToken: session.token,
    sidebarSheet,
    typingQueryGcTimeMs: TYPING_QUERY_GC_TIME_MS,
    userId: session.user.id,
  });

  const serverChats = chatsQuery.data ?? [];
  const archivedChatIds = archivedChatsQuery.data ?? [];
  const archivedChatIdSet = new Set(archivedChatIds);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const listedServerChats = serverChats.filter((chat) => !chat.direct || chat.lastMessageAt !== null);
  const filteredServerChats = !normalizedSearch
    ? listedServerChats
    : listedServerChats.filter((chat) => {
        return (
          chat.title.toLowerCase().includes(normalizedSearch) ||
          chat.members.some((member) =>
            `${member.username} ${member.displayName}`.toLowerCase().includes(normalizedSearch)
          )
        );
      });
  const visibleServerChats = filteredServerChats.filter((chat) => !archivedChatIdSet.has(chat.id));
  const previewHydrationChats =
    sidebarSheet === "archive"
      ? listedServerChats.filter((chat) => archivedChatIdSet.has(chat.id))
      : activeListTab === "groups"
        ? visibleServerChats.filter((chat) => !chat.direct)
        : activeListTab === "dialogs"
          ? visibleServerChats.filter((chat) => chat.direct)
          : [];
  const {
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    chatPreviewOverrides,
    clearChatPreviewOverride,
    refreshChatPreviewFromServer,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  } = useChatPreviews({
    archivedChatIds,
    formatPreviewText: buildChatListPreviewText,
    onUnauthorized: () => onSessionChange(null),
    previewHydrationChats,
    queryClient,
    token: session.token,
    userId: session.user.id,
  });
  const chats = applyChatPreviewOverrides(serverChats, chatPreviewOverrides);
  const sessions = sessionsQuery.data ?? [];
  const profile = profileQuery.data ?? session.user;
  const deleteAccountRequiresMatch =
    normalizeAccountDeletionConfirmation(deleteAccountConfirmation) ===
    profile.username.toLowerCase();
  const contacts = contactsQuery.data ?? [];
  const blockedUsers = blockedUsersQuery.data ?? [];
  const conferences = conferencesQuery.data ?? [];
  const archivedConferences = archivedConferencesQuery.data ?? [];
  const userSearchResults = userSearchQuery.data ?? [];
  const contactSearchResults = contactsSearchQuery.data ?? [];
  const chatsLoading = chatsQuery.data === undefined && chatsQuery.isFetching;
  const sessionsLoading = sessionsQuery.data === undefined && sessionsQuery.isFetching;
  const archivedChatsLoading = archivedChatsQuery.data === undefined && archivedChatsQuery.isFetching;
  const contactsLoading = contactsQuery.data === undefined && contactsQuery.isFetching;
  const conferencesLoading = conferencesQuery.data === undefined && conferencesQuery.isFetching;
  const archivedConferencesLoading =
    archivedConferencesQuery.data === undefined && archivedConferencesQuery.isFetching;
  const allConferences = mergeVideoConferenceCollections(conferences, archivedConferences);
  const listedConferences = conferences.filter((conference) =>
    conference.participants.some((participant) => participant.id === session.user.id) && !conference.endedAt
  );
  const chatIds = chats.map((chat) => chat.id).sort();
  const chatIdsKey = chatIds.join(",");
  const listedChats = chats.filter((chat) => !chat.direct || chat.lastMessageAt !== null);
  const filteredChats = !normalizedSearch
    ? listedChats
    : listedChats.filter((chat) => {
        return (
          chat.title.toLowerCase().includes(normalizedSearch) ||
          chat.members.some((member) =>
            `${member.username} ${member.displayName}`.toLowerCase().includes(normalizedSearch)
          )
        );
      });
  const visibleChats = filteredChats.filter((chat) => !archivedChatIdSet.has(chat.id));
  const visibleDirectChats = visibleChats.filter((chat) => chat.direct);
  const visibleGroupChats = visibleChats.filter((chat) => !chat.direct);
  const archivedChats = listedChats.filter((chat) => archivedChatIdSet.has(chat.id));
  const groupContacts = contacts.filter((contact) => contact.username !== session.user.username);
  const directChatUsernames = new Set(
    chats
      .map((chat) => (chat.direct ? getDirectParticipant(chat, session.user)?.username ?? null : null))
      .filter((username): username is string => Boolean(username))
  );
  const forwardContactOptions = contacts.filter(
    (contact) =>
      contact.username !== session.user.username && !directChatUsernames.has(contact.username)
  );
  const visibleConferences = !normalizedSearch
    ? listedConferences
    : listedConferences.filter((conference) => {
        const participantText = conference.participants
          .map((participant) => `${participant.username} ${participant.displayName}`)
          .join(" ")
          .toLowerCase();
        return (
          conference.title.toLowerCase().includes(normalizedSearch) ||
          participantText.includes(normalizedSearch)
        );
      });

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const activeConference =
    allConferences.find((conference) => conference.id === activeConferenceId) ?? null;
  const activeGroupInviteUrl =
    activeChat && !activeChat.direct && groupInviteCodesByChatId[activeChat.id]
      ? buildInviteUrl(groupInviteCodesByChatId[activeChat.id]!)
      : null;
  const conferenceCandidates = mergeConferenceCandidates(
    groupContacts,
    activeChat && !activeChat.direct ? activeChat.members : [],
    session.user.username
  );
  const activeDirectParticipant = activeChat ? getDirectParticipant(activeChat, session.user) : null;
  const activeDirectInContacts = activeDirectParticipant
    ? contacts.some((contact) => contact.username === activeDirectParticipant.username)
    : false;
  const activeDirectBlockedByMe = activeDirectParticipant
    ? blockedUsers.some((user) => user.username === activeDirectParticipant.username)
    : false;
  const activeGroupOwnerUserId =
    activeChat && !activeChat.direct
      ? activeChat.ownerUserId
      : null;
  const activeChatIsOwnedByCurrentUser = activeGroupOwnerUserId === session.user.id;
  const activeChatIsModerator = Boolean(
    activeChat && !activeChat.direct && activeChat.moderatorUserIds.includes(session.user.id)
  );
  const activeChatCanModerateMembers = activeChatIsOwnedByCurrentUser || activeChatIsModerator;
  const activeChatCanShareInviteLink = activeChatIsOwnedByCurrentUser || activeChatIsModerator;
  const activeChatEncryptionWarning =
    activeChat && chatEncryptionIdentityWarning?.chatId === activeChat.id
      ? {
          title: "Нужно обновить чат",
          description:
            "Данные чата изменились. Обновите чат, чтобы снова отправлять и редактировать сообщения.",
          errorText: chatEncryptionIdentityWarning.errorText,
          actionLabel: "Обновить чат",
          isPending: isRecoveringEncryptionIdentity,
        }
      : null;
  const markActiveChatEncryptionIdentityWarning = useEffectEvent(
    (chatId: string, participantIds: string[], errorText: string | null = null) => {
      setChatEncryptionIdentityWarning((current) => {
        if (
          current?.chatId === chatId &&
          current.errorText === errorText &&
          current.participantIds.length === participantIds.length &&
          current.participantIds.every((participantId, index) => participantId === participantIds[index])
        ) {
          return current;
        }

        return {
          chatId,
          participantIds,
          errorText,
        };
      });
    }
  );
  const clearActiveChatEncryptionIdentityWarning = useEffectEvent((chatId?: string) => {
    setChatEncryptionIdentityWarning((current) => {
      if (!current) {
        return null;
      }
      if (!chatId || current.chatId === chatId) {
        return null;
      }
      return current;
    });
  });
  const activeConferenceIsArchived = Boolean(activeConference?.endedAt);
  const activeConferenceCanJoin = Boolean(
    activeConference?.roomName &&
      activeConference.activatedAt &&
      !activeConference.endedAt
  );
  const activeConferenceIsOwnedByCurrentUser = activeConference
    ? activeConference.createdBy.id === profile.id
    : false;
  const activeConferenceShareUrl =
    activeConference && conferenceInviteCodesById[activeConference.id]
      ? buildInviteUrl(conferenceInviteCodesById[activeConference.id]!)
      : null;
  const activeConferenceCanManageParticipants = Boolean(
    activeConference && activeConferenceIsOwnedByCurrentUser && !activeConferenceIsArchived
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
    activeConference && activeConferenceIsOwnedByCurrentUser && !activeConferenceIsArchived
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
  const timelineItems = buildTimeline(messages);
  const messagesLoading =
    Boolean(activeChat?.id) && messagesQuery.data === undefined && messagesQuery.isFetching;
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const lastMessage = messages[messages.length - 1] ?? null;
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
  const forwardingMessage =
    forwardingMessageId && activeChat
      ? messages.find((message) => message.id === forwardingMessageId) ?? null
      : null;
  const hydratedPinnedMessage =
    activeChat?.pinnedMessage &&
    messages.find((message) => message.id === activeChat.pinnedMessage?.id)
      ? toMessageSnippet(
          messages.find((message) => message.id === activeChat.pinnedMessage?.id)!
        )
      : null;
  const activePinnedMessage = hydratedPinnedMessage ?? activeChat?.pinnedMessage ?? null;
  const forwardableChats = visibleChats.filter((chat) => chat.id !== activeChat?.id);
  const canDeleteContextMenuMessageForSelf = Boolean(
    contextMenuMessage && contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const canDeleteContextMenuMessageForEveryone = Boolean(
    contextMenuMessage &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId &&
      (activeChat?.direct || isOwnMessage(contextMenuMessage, session.user))
  );
  const canReactContextMenuMessage = Boolean(
    contextMenuMessage && contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const canEditContextMenuMessage = Boolean(
    contextMenuMessage &&
      isOwnMessage(contextMenuMessage, session.user) &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const canForwardContextMenuMessage = Boolean(
    contextMenuMessage && !isUnavailableEncryptedMessage(contextMenuMessage.content)
  );
  const canPinContextMenuMessage = Boolean(
    contextMenuMessage &&
      activeChat &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const isPinnedContextMenuMessage =
    Boolean(contextMenuMessage && activeChat?.pinnedMessage?.id === contextMenuMessage.id);
  const deleteForEveryoneLabel = activeChat?.direct ? "Удалить для обоих" : "Удалить для всех";
  const deleteForEveryoneHint = activeChat?.direct
    ? "Сообщение исчезнет у вас обоих"
    : "Сообщение исчезнет у всех участников";

  useEffect(() => {
    if (isRealtimeConnected || !activeChatId || activeTypingQuery.data === undefined) {
      return;
    }

    setTypingByChatId((current) =>
      syncChatTypingParticipants(current, activeChatId, activeTypingQuery.data)
    );
  }, [activeChatId, activeTypingQuery.data, isRealtimeConnected]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    let cancelled = false;
    void primeEncryptedMessageRecipients(session.token, activeChat.members).catch((error) => {
      if (cancelled) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
        return;
      }

      if (isEncryptionIdentityChangedError(error)) {
        markActiveChatEncryptionIdentityWarning(activeChat.id, activeChat.members.map((member) => member.id));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeChat, markActiveChatEncryptionIdentityWarning, onSessionChange, session.token]);

  useEffect(() => {
    setIsChatMenuOpen(false);
    setIsChatMembersOpen(false);
  }, [activeChatId, activeConferenceId]);

  useEffect(() => {
    clearActiveChatEncryptionIdentityWarning(activeChatId ?? undefined);
    setIsRecoveringEncryptionIdentity(false);
  }, [activeChatId, clearActiveChatEncryptionIdentityWarning]);

  useEffect(() => {
    if (
      !pendingGroupMenuOpenChatId ||
      activeChatId !== pendingGroupMenuOpenChatId ||
      !activeChat ||
      activeChat.direct
    ) {
      return;
    }

    setIsChatMenuOpen(true);
    setIsChatMembersOpen(false);
    setPendingGroupMenuOpenChatId(null);
  }, [activeChat, activeChatId, pendingGroupMenuOpenChatId]);

  useEffect(() => {
    setConferenceRecordingState("idle");
  }, [activeConference?.id]);

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
      setForwardingMessageId(null);
      if (sidebarSheet === "forward") {
        setSidebarSheet(null);
      }
    }
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
    clearChatUnreadIndicator,
    clearComposerContext,
    currentUsername: session.user.username,
    setActiveChatId,
    setActiveConferenceId,
    setActiveListTab,
    setConferenceComposerMode,
    setConferenceEditingId,
    setConferenceParticipantUsernames,
    setConferenceScheduledAt,
    setConferenceTitle,
    setConferenceViewportMode,
    setDeleteAccountConfirmation,
    setInitialChatViewportHint,
    setIsConferenceInfoOpen,
    setIsMenuOpen,
    setMobilePane,
    setSidebarSheet,
    stopTyping,
  });
  const { messageStreamRef, preserveOlderMessagesOffset, scrollToMessage } =
    useMessageStreamNavigation({
      activeChatId,
      currentChatId: activeChat?.id ?? null,
      lastMessageId,
      messages,
      currentUserId: session.user.id,
      pendingInitialAnchor: initialChatViewportHint,
      clearPendingInitialAnchor: (chatId) =>
        setInitialChatViewportHint((current) =>
          current?.chatId === chatId ? null : current
        ),
      openChat,
    });

  const deleteChatLocally = useEffectEvent((chatId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      removeChatById(current, chatId)
    );
    queryClient.setQueryData<string[]>(["archived-chats", session.token], (current) =>
      current?.filter((item) => item !== chatId) ?? []
    );
    queryClient.removeQueries({ queryKey: ["messages", session.token, chatId] });
    clearChatPreviewOverride(chatId);
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
    deleteMessageForSelf,
    deleteMessageMutation,
    editMessageAction,
    editMessageMutation,
    forwardMessageAction,
    forwardMessageMutation,
    forwardMessageToChat,
    forwardMessageToContact,
    pinMessageMutation,
    replyToMessage,
    sendMessageMutation,
    submitActiveDraft,
    toggleMessageReactionMutation,
    togglePinnedMessageAction,
    toggleReactionForMessage,
    toggleReactionFromContextMenu,
  } = useMessageActions({
    activeChat,
    activePinnedMessageId: activeChat?.pinnedMessage?.id ?? null,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    chats,
    clearComposerContext,
    clearDraftForChat,
    currentUser: session.user,
    deleteChatLocally,
    editingMessage,
    focusComposer,
    forwardingMessage,
    incrementPendingOutgoing,
    decrementPendingOutgoing,
    onOpenChat: openChat,
    onOpenForwardSheet: () => openSidebarSheet("forward"),
    refreshChatPreviewFromServer,
    rememberRealtimeMessage,
    replyingToMessage,
    scheduleDraftSave,
    sessionToken: session.token,
    setContextMenu,
    setDraftsByChatId,
    setEditingMessageId,
    setForwardingMessageId,
    setReplyingToMessageId,
    stopTyping,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  });

  const handleRecoverEncryptionIdentity = useEffectEvent(async () => {
    if (
      !activeChat ||
      !chatEncryptionIdentityWarning ||
      chatEncryptionIdentityWarning.chatId !== activeChat.id ||
      isRecoveringEncryptionIdentity
    ) {
      return;
    }

    setIsRecoveringEncryptionIdentity(true);
    sendMessageMutation.reset();
    editMessageMutation.reset();
    setChatEncryptionIdentityWarning((current) =>
      current && current.chatId === activeChat.id
        ? {
            ...current,
            errorText: null,
          }
        : current
    );

    try {
      chatEncryptionIdentityWarning.participantIds.forEach((participantId) => {
        clearPinnedEncryptionIdentity(participantId);
      });
      await primeEncryptedMessageRecipients(session.token, activeChat.members);
      setChatEncryptionIdentityWarning(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
        return;
      }

      setChatEncryptionIdentityWarning((current) =>
        current && current.chatId === activeChat.id
          ? {
              ...current,
              errorText: "Не удалось обновить чат. Попробуйте ещё раз.",
            }
          : current
      );
    } finally {
      setIsRecoveringEncryptionIdentity(false);
    }
  });

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const mismatchError = isEncryptionIdentityChangedError(sendMessageMutation.error)
      ? sendMessageMutation.error
      : isEncryptionIdentityChangedError(editMessageMutation.error)
        ? editMessageMutation.error
        : null;

    if (!mismatchError) {
      return;
    }

    markActiveChatEncryptionIdentityWarning(
      activeChat.id,
      activeChat.members.map((member) => member.id),
      null
    );
  }, [
    activeChat,
    editMessageMutation.error,
    markActiveChatEncryptionIdentityWarning,
    sendMessageMutation.error,
  ]);

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
    signOutMutation,
    submitAddConferenceParticipants,
    submitAddGroupParticipants,
    submitCreateConference,
    submitCreateConferenceNow,
    submitCreateGroup,
    submitPasswordChange,
    submitUpdateGroup,
    submitProfileDisplayName,
    toggleArchiveChat,
    updateArchivedChatMutation,
    updateConferenceMutation,
    updateGroupMutation,
    updateProfileMutation,
    unblockUserMutation,
  } = useWorkspaceMutations({
    activeChat,
    activeChatId,
    activeConference,
    activeConferenceId,
    activeConferenceIsArchived,
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
    groupDetailsTitle,
    groupParticipantUsernames,
    groupTitle,
    removeChatLocally: deleteChatLocally,
    onGroupCreated: handleGroupCreated,
    onPasswordChanged: () => {
      setPasswordChangeCurrent("");
      setPasswordChangeNext("");
      setPasswordChangeConfirm("");
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

  useEffect(() => {
    if (sidebarSheet === "profile") {
      return;
    }

    setPasswordChangeCurrent("");
    setPasswordChangeNext("");
    setPasswordChangeConfirm("");
  }, [sidebarSheet]);

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
        openChat(result.chat.id, "groups");
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
    if (!activeChat || activeChat.direct || !activeChatCanShareInviteLink) {
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

    createConferenceInviteLinkMutation.mutate(activeConference.id);
  });

  const handleSubmitUpdateGroup = useEffectEvent(() => {
    submitUpdateGroup();
  });

  const handleLeaveGroup = useEffectEvent(() => {
    if (!activeChat || activeChat.direct || activeChatIsOwnedByCurrentUser) {
      return;
    }

    if (!window.confirm(`Выйти из группы "${activeChat.title}"?`)) {
      return;
    }

    leaveGroupMutation.mutate(activeChat.id);
  });

  const handleDeleteGroup = useEffectEvent(() => {
    if (!activeChat || activeChat.direct || !activeChatIsOwnedByCurrentUser) {
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
    if (!activeChat || activeChat.direct || !activeChatIsOwnedByCurrentUser || participant.id === session.user.id) {
      return;
    }

    if (!window.confirm(`Назначить ${participant.displayName} модератором группы?`)) {
      return;
    }

    assignGroupModeratorMutation.mutate(participant);
  });

  const handleRevokeModeratorAction = useEffectEvent((participant: Participant) => {
    if (!activeChat || activeChat.direct || !activeChatIsOwnedByCurrentUser) {
      return;
    }

    if (!window.confirm(`Снять роль модератора с ${participant.displayName}?`)) {
      return;
    }

    revokeGroupModeratorMutation.mutate(participant);
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

    const now = new Date().toISOString();
    createConferenceMutation.mutate({
      title: `Созвон с ${activeDirectParticipant.displayName}`,
      scheduledAt: now,
      participantUsernames: [activeDirectParticipant.username],
    });
  });

  useEffect(() => {
    if (!isChatMenuOpen || !activeChat || activeChat.direct || !activeChatCanShareInviteLink) {
      return;
    }

    if (groupInviteCodesByChatId[activeChat.id] || createGroupInviteLinkMutation.isPending) {
      return;
    }

    createGroupInviteLinkMutation.mutate({ chatId: activeChat.id });
  }, [activeChat, activeChatCanShareInviteLink, createGroupInviteLinkMutation, groupInviteCodesByChatId, isChatMenuOpen]);

  useEffect(() => {
    if (!isChatMenuOpen || !activeChat || activeChat.direct) {
      return;
    }

    setGroupDetailsTitle(activeChat.title);
    setGroupDetailsAvatarUrl(activeChat.avatarUrl ?? null);
  }, [activeChat, isChatMenuOpen]);

  useEffect(() => {
    if (!pendingInviteCode) {
      return;
    }

    acceptInviteMutation.mutate(pendingInviteCode);
  }, [pendingInviteCode, session.token]);

  useEffect(() => {
    if (activeConferenceId === null) {
      setConferenceViewportMode("full");
      setConferenceMiniPosition(null);
      setIsConferenceMiniDragging(false);
      conferenceMiniDragCleanupRef.current?.();
      conferenceMiniDragCleanupRef.current = null;
    }
  }, [activeConferenceId]);

  useEffect(() => {
    return () => {
      conferenceMiniDragCleanupRef.current?.();
      conferenceMiniDragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      conferenceViewportMode !== "mini" ||
      !conferenceMiniPosition ||
      !conferenceSurfaceRef.current
    ) {
      return;
    }

    const handleResize = () => {
      const surface = conferenceSurfaceRef.current;
      if (!surface) {
        return;
      }

      setConferenceMiniPosition((current) => {
        if (!current) {
          return current;
        }

        return clampConferenceMiniPosition(current, {
          width: surface.offsetWidth,
          height: surface.offsetHeight,
        });
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [conferenceMiniPosition, conferenceViewportMode]);

  const requestConferenceExit = useEffectEvent(() => {
    if (!activeConference) {
      return;
    }

    setConferenceExitRequestToken((current) => current + 1);
  });

  const handleConferenceMiniSurfaceClick = useEffectEvent((event: ReactMouseEvent<HTMLDivElement>) => {
    if (conferenceViewportMode !== "mini") {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".conference-mini-toolbar")) {
      return;
    }

    restoreActiveConference();
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

  const startConferenceMiniDrag = useEffectEvent((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("button, a, input, textarea, select, label")) {
      return;
    }

    const surface = conferenceSurfaceRef.current;
    if (!surface || conferenceViewportMode !== "mini") {
      return;
    }

    conferenceMiniDragCleanupRef.current?.();
    const rect = surface.getBoundingClientRect();
    const dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setConferenceMiniPosition({
      x: rect.left,
      y: rect.top,
    });
    setIsConferenceMiniDragging(true);

    const stopDragging = () => {
      setIsConferenceMiniDragging(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      conferenceMiniDragCleanupRef.current = null;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setConferenceMiniPosition(
        clampConferenceMiniPosition(
          {
            x: moveEvent.clientX - dragOffset.x,
            y: moveEvent.clientY - dragOffset.y,
          },
          {
            width: rect.width,
            height: rect.height,
          }
        )
      );
    };

    conferenceMiniDragCleanupRef.current = stopDragging;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    event.preventDefault();
  });

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
    activeConferenceId,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    archivedConferences,
    conferences,
    chats,
    hasArchivedConferencesData: archivedConferencesQuery.data !== undefined,
    hasConferencesData: conferencesQuery.data !== undefined,
    clearChatAttention,
    clearChatUnreadIndicator,
    editingMessageId,
    extractImageFromClipboard,
    forwardingMessageId,
    hasEditingMessage: Boolean(editingMessage),
    hasForwardingMessage: Boolean(forwardingMessage),
    hasReplyingMessage: Boolean(replyingToMessage),
    hydratedPinnedMessage,
    lastMessage,
    lastMessageId,
    messageCount: messages.length,
    profileDisplayName: profile.displayName,
    profileProfession: profile.profession,
    queryClient,
    replyingToMessageId,
    sessionToken: session.token,
    setActiveChatId,
    setActiveConferenceId,
    setConferenceInviteUsernames,
    setEditingMessageId,
    setForwardingMessageId,
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
    syncChatPinnedSummary,
    uploadAvatarFromFile,
  });

  useRealtimeChatSubscription({
    acknowledgeDelivered,
    acknowledgeRead,
    activeChatId,
    activeDraft,
    activePinnedMessageId: activeChat?.pinnedMessage?.id ?? null,
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
    scheduleTypingTimeout,
    sendTypingHeartbeat,
    sessionToken: session.token,
    setEditingMessageId,
    setForwardingMessageId,
    setReplyingToMessageId,
    setTypingByChatId,
    showIncomingToast,
    syncChatPinnedSummary,
    syncChatPreviewFromCache,
  });

  const loadOlderMessages = () => {
    if (!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) {
      return;
    }

    preserveOlderMessagesOffset();
    void messagesQuery.fetchNextPage();
  };

  const { errorText, showContactSearchResults, tabChats, tabChatsEmptyText } = useWorkspaceStatus({
    activeListTab,
    deferredContactSearch,
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
      isEncryptionIdentityChangedError(sendMessageMutation.error) ? null : sendMessageMutation.error,
      signOutMutation.error,
      revokeSessionMutation.error,
      updateProfileMutation.error,
      changePasswordMutation.error,
      avatarMutation.error,
      deleteAccountMutation.error,
      updateArchivedChatMutation.error,
      deleteChatMutation.error,
      deleteMessageMutation.error,
      isEncryptionIdentityChangedError(editMessageMutation.error) ? null : editMessageMutation.error,
      pinMessageMutation.error,
      forwardMessageMutation.error,
      toggleMessageReactionMutation.error,
      addContactMutation.error,
      removeContactMutation.error,
      blockUserMutation.error,
      unblockUserMutation.error,
      chatsQuery.error,
      sessionsQuery.error,
      profileQuery.error,
      archivedChatsQuery.error,
      contactsQuery.error,
      blockedUsersQuery.error,
      conferencesQuery.error,
      archivedConferencesQuery.error,
      draftsQuery.error,
      userSearchQuery.error,
      contactsSearchQuery.error,
      messagesQuery.error,
    ],
    normalizedSearch,
    onUnauthorized: () => onSessionChange(null),
    visibleDirectChats,
    visibleGroupChats,
  });
  const showTopSearchResults = deferredSearch.trim().length > 0;
  const chatListContent = (
    <ChatListPanel
      activeListTab={activeListTab}
      conferenceViewMode={conferenceBrowserMode}
      onToggleConferenceViewMode={() =>
        setConferenceBrowserMode((current) => (current === "calendar" ? "list" : "calendar"))
      }
      normalizedSearch={normalizedSearch}
      conferencesLoading={conferencesLoading}
      visibleConferences={visibleConferences}
      activeConferenceId={activeConference?.id ?? null}
      conferenceListScrollRef={conferenceListScrollRef}
      sessionUser={session.user}
      chatsLoading={chatsLoading}
      tabChats={tabChats}
      tabChatsEmptyText={tabChatsEmptyText}
      activeChatId={activeChat?.id ?? null}
      typingByChatId={typingByChatId}
      draftsByChatId={draftsByChatId}
      openConference={openConference}
      openChat={openChat}
      openChatContextMenu={openChatContextMenu}
      formatConferenceListPreview={formatConferenceListPreview}
      formatConferenceTileTime={formatConferenceTileTime}
      formatConferenceSchedule={formatConferenceSchedule}
      trimPreview={trimPreview}
      getDirectParticipant={getDirectParticipant}
      formatTypingParticipants={formatTypingParticipants}
      formatChatTimestamp={formatChatTimestamp}
      describeChat={describeChat}
      formatMemberCount={formatMemberCount}
    />
  );
  const conferenceConversation = activeConference ? (
    <ActiveConferenceConversation
      conference={activeConference}
      jitsiBaseUrl={JITSI_BASE_URL}
      profileDisplayName={profile.displayName}
      organizerLabel={activeConferenceOrganizerLabel}
      roleLabel={activeConferenceRoleLabel}
      statusLabel={activeConferenceStatusLabel}
      stageHint={activeConferenceStageHint}
      canJoin={activeConferenceCanJoin}
      canEditSchedule={activeConferenceCanEditSchedule}
      canCancelSchedule={activeConferenceCanCancelSchedule}
      canManageParticipants={activeConferenceCanManageParticipants}
      canShareInviteLink={activeConferenceCanShareInviteLink}
      conferenceActionPending={
        updateConferenceMutation.isPending ||
        cancelConferenceMutation.isPending ||
        endConferenceMutation.isPending
      }
      localRecordingActive={activeConferenceLocalRecordingActive}
      shareUrl={activeConferenceShareUrl}
      shareUrlPending={createConferenceInviteLinkMutation.isPending}
      isInfoOpen={isConferenceInfoOpen}
      infoButtonRef={conferenceInfoButtonRef}
      infoPanelRef={conferenceInfoPanelRef}
      onBack={() => setMobilePane("sidebar")}
      onEditConference={openConferenceEditorSheet}
      onCancelConference={handleCancelScheduledConference}
      onConferenceEndForAll={() => handleEndConference({ skipConfirm: true })}
      onConferencePresenceTouch={handleConferencePresenceTouch}
      onConferencePresenceLeave={handleConferencePresenceLeave}
      onGenerateShareUrl={handleGenerateConferenceInviteLink}
      onToggleInfo={() => setIsConferenceInfoOpen((current) => !current)}
      onOpenMembers={openConferenceMembersSheet}
      onCopyShareUrl={(value) => void navigator.clipboard.writeText(value)}
      onRecordingStateChange={setConferenceRecordingState}
      exitRequestToken={conferenceExitRequestToken}
      onConferenceExit={handleConferenceStageExit}
      formatConferenceSchedule={formatConferenceSchedule}
      formatMemberCount={formatMemberCount}
    />
  ) : null;
  const isConferenceMinimized = activeConference !== null && conferenceViewportMode === "mini";
  const conferenceSurfaceStyle: CSSProperties | undefined =
    isConferenceMinimized && conferenceMiniPosition
      ? {
          left: `${conferenceMiniPosition.x}px`,
          top: `${conferenceMiniPosition.y}px`,
          right: "auto",
          bottom: "auto",
        }
      : undefined;
  const workspaceStyle: CSSProperties = {
    ["--north-sidebar-width" as string]: `${sidebarWidth}px`,
  };

  return (
    <main
      className="workspace-shell north-workspace"
      data-mobile-pane={mobilePane}
      style={workspaceStyle}
    >
      <aside className="sidebar north-sidebar">
        <div className="north-sidebar-top">
          <button
            type="button"
            ref={menuButtonRef}
            className={isMenuOpen ? "sidebar-menu-button is-active" : "sidebar-menu-button"}
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-label="Открыть меню"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="north-search-shell">
          <input
            className="north-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск"
          />

          {showTopSearchResults ? (
            <div className="search-dropdown top-search-dropdown">
              {userSearchQuery.isFetching ? (
                <div className="search-result-empty">Ищем пользователей...</div>
              ) : userSearchResults.length === 0 ? (
                <div className="search-result-empty">Ничего не найдено.</div>
              ) : (
                userSearchResults.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    className="search-result-row"
                    onClick={() => {
                      createChatMutation.mutate(user.username);
                      setSearch("");
                    }}
                  >
                    <AvatarCircle
                      className="menu-row-avatar"
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      online={user.online}
                    />
                    <div className="search-result-copy">
                      <strong>{user.displayName}</strong>
                      <span>@{user.username}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
          </div>
        </div>

        {!sidebarSheet ? (
          <div className="conversation-list-tabs">
            <button
              type="button"
              className={
                activeListTab === "dialogs"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab"
              }
              onClick={() => activateListTab("dialogs")}
            >
              Диалоги
            </button>
            <button
              type="button"
              className={
                activeListTab === "groups"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab"
              }
              onClick={() => activateListTab("groups")}
            >
              Группы
            </button>
            <button
              type="button"
              className={
                activeListTab === "conferences"
                  ? "conversation-list-tab is-active"
                  : "conversation-list-tab"
              }
              onClick={() => activateListTab("conferences")}
            >
              Видеоконференции
            </button>
          </div>
        ) : null}

        {sidebarSheet ? (
          <section className="north-sidebar-sheet">
            <SidebarUtilitySheets
              sheet={
                sidebarSheet === "conference" ||
                sidebarSheet === "archive" ||
                sidebarSheet === "forward"
                  ? sidebarSheet
                  : null
              }
              sessionUser={session.user}
              conferenceComposerMode={conferenceComposerMode}
              conferenceEditingId={conferenceEditingId}
              conferenceTitle={conferenceTitle}
              conferenceScheduledAt={conferenceScheduledAt}
              conferenceCandidates={conferenceCandidates}
              conferenceParticipantUsernames={conferenceParticipantUsernames}
              contactsLoading={contactsLoading}
              createConferencePending={createConferenceMutation.isPending}
              updateConferencePending={updateConferenceMutation.isPending}
              archivedChatsLoading={archivedChatsLoading}
              archivedChats={archivedChats}
              forwardingMessage={forwardingMessage}
              forwardableChats={forwardableChats}
              forwardContactOptions={forwardContactOptions}
              forwardPending={forwardMessageMutation.isPending}
              onClose={() => setSidebarSheet(null)}
              onCloseConferenceComposer={() => {
                resetConferenceComposer();
                setSidebarSheet(null);
              }}
              onOpenConferenceComposer={openConferenceComposer}
              onConferenceTitleChange={setConferenceTitle}
              onConferenceScheduledAtChange={setConferenceScheduledAt}
              onToggleConferenceParticipant={toggleConferenceParticipant}
              onSubmitCreateConferenceNow={() => handleSubmitCreateConferenceNow(formatClock)}
              onSubmitCreateConference={() => handleSubmitCreateConference(formatClock)}
              onSubmitUpdateConference={() => handleSubmitCreateConference(formatClock)}
              onOpenChatContextMenu={openChatContextMenu}
              onOpenChat={openChat}
              onToggleArchiveChat={(chatId) => toggleArchiveChat(chatId, archivedChatIdSet)}
              onCloseForward={() => clearComposerContext("forward")}
              onJumpToReplyTarget={scrollToMessage}
              onForwardToChat={forwardMessageToChat}
              onForwardToContact={forwardMessageToContact}
              createMinimumConferenceDateTime={createMinimumConferenceDateTime}
              buildMessagePreview={buildMessagePreview}
              describeChat={describeChat}
              formatMemberCount={formatMemberCount}
              getDirectParticipant={getDirectParticipant}
            />
            <SidebarManagementSheets
              sheet={
                sidebarSheet === "profile" ||
                sidebarSheet === "group" ||
                sidebarSheet === "groupInfo" ||
                sidebarSheet === "groupMembers" ||
                sidebarSheet === "conferenceMembers" ||
                sidebarSheet === "contacts" ||
                sidebarSheet === "sessions"
                  ? sidebarSheet
                  : null
              }
              profile={profile}
              sessionUser={session.user}
              currentSessionId={session.sessionId}
              profileDisplayName={profileDisplayName}
              profileProfession={profileProfession}
              passwordChangeCurrent={passwordChangeCurrent}
              passwordChangeNext={passwordChangeNext}
              passwordChangeConfirm={passwordChangeConfirm}
              deleteAccountConfirmation={deleteAccountConfirmation}
              deleteAccountRequiresMatch={deleteAccountRequiresMatch}
              groupTitle={groupTitle}
              groupDetailsTitle={groupDetailsTitle}
              groupDetailsAvatarUrl={groupDetailsAvatarUrl}
              contactSearch={contactSearch}
              showContactSearchResults={showContactSearchResults}
              contactSearchResults={contactSearchResults}
              contacts={contacts}
              contactsLoading={contactsLoading}
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              activeChat={activeChat}
              activeConference={activeConference}
              groupInviteLinkUrl={activeGroupInviteUrl}
              groupInviteLinkVisible={activeChatCanShareInviteLink}
              groupContacts={groupContacts}
              selectedGroupContacts={selectedGroupContacts}
              isGroupCreatePickerOpen={isGroupCreatePickerOpen}
              groupParticipantUsernames={groupParticipantUsernames}
              availableGroupInviteContacts={availableGroupInviteContacts}
              selectedGroupInviteContacts={selectedGroupInviteContacts}
              isGroupInvitePickerOpen={isGroupInvitePickerOpen}
              groupInviteUsernames={groupInviteUsernames}
              availableConferenceInviteContacts={availableConferenceInviteContacts}
              conferenceInviteUsernames={conferenceInviteUsernames}
              createGroupPending={createGroupMutation.isPending}
              groupInviteLinkPending={createGroupInviteLinkMutation.isPending}
              addGroupParticipantsPending={addGroupParticipantsMutation.isPending}
              addConferenceParticipantsPending={addConferenceParticipantsMutation.isPending}
              updateGroupPending={updateGroupMutation.isPending}
              createChatPending={createChatMutation.isPending}
              updateProfilePending={updateProfileMutation.isPending}
              changePasswordPending={changePasswordMutation.isPending}
              avatarPending={avatarMutation.isPending}
              deleteAccountPending={deleteAccountMutation.isPending}
              revokeSessionPending={revokeSessionMutation.isPending}
              contactSearchFetching={contactsSearchQuery.isFetching}
              onClose={() => setSidebarSheet(null)}
              onProfileDisplayNameChange={setProfileDisplayName}
              onProfileProfessionChange={setProfileProfession}
              onSubmitProfileDisplayName={handleSubmitProfileDisplayName}
              onPasswordChangeCurrentChange={setPasswordChangeCurrent}
              onPasswordChangeNextChange={setPasswordChangeNext}
              onPasswordChangeConfirmChange={setPasswordChangeConfirm}
              onSubmitPasswordChange={submitPasswordChange}
              onDeleteAccountConfirmationChange={setDeleteAccountConfirmation}
              onDeleteAccount={() => deleteAccountMutation.mutate()}
              onRemoveAvatar={() => avatarMutation.mutate(null)}
              onAvatarSelected={(file) => void uploadAvatarFromFile(file)}
              onGroupTitleChange={setGroupTitle}
              onGroupDetailsTitleChange={setGroupDetailsTitle}
              onGroupAvatarSelected={(file) => void uploadGroupAvatarFromFile(file)}
              onRemoveGroupAvatar={() => setGroupDetailsAvatarUrl(null)}
              onToggleGroupCreatePicker={() => setIsGroupCreatePickerOpen((current) => !current)}
              onToggleGroupParticipant={toggleGroupParticipant}
              onSubmitCreateGroup={handleSubmitCreateGroup}
              onSubmitUpdateGroup={handleSubmitUpdateGroup}
              onOpenGroupMembers={openGroupMembersSheet}
              onToggleGroupInvitePicker={() => setIsGroupInvitePickerOpen((current) => !current)}
              onToggleGroupInviteParticipant={toggleGroupInviteParticipant}
              onSubmitAddGroupParticipants={submitAddGroupParticipants}
              onGenerateGroupInviteLink={handleGenerateGroupInviteLink}
              onCopyGroupInviteLink={(value) => void navigator.clipboard.writeText(value)}
              onToggleConferenceInviteParticipant={toggleConferenceInviteParticipant}
              onSubmitAddConferenceParticipants={submitAddConferenceParticipants}
              onContactSearchChange={setContactSearch}
              onAddContact={handleAddContact}
              onRemoveContact={removeContact}
              onCreateChat={(username) => createChatMutation.mutate(username)}
              onRevokeSession={(sessionId) => revokeSessionMutation.mutate(sessionId)}
              formatProfileDate={formatProfileDate}
              formatSessionTime={formatSessionTime}
            />
          </section>
        ) : null}

        {!sidebarSheet ? (
          <div ref={conferenceListScrollRef} className="chat-list north-chat-list">
            {chatListContent}
          </div>
        ) : null}

        {isMenuOpen ? (
          <SidebarMenuOverlay
            profile={profile}
            menuActions={MENU_ACTIONS}
            menuPanelRef={menuPanelRef}
            isSigningOut={signOutMutation.isPending}
            onClose={() => setIsMenuOpen(false)}
            onAction={handleMenuAction}
          />
        ) : null}
      </aside>

      <div
        className="north-layout-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Изменить ширину списка диалогов"
        onPointerDown={startSidebarResize}
      />

      <section className="conversation north-conversation">
        {activeConference ? (
          <div
            ref={conferenceSurfaceRef}
            className={
              isConferenceMinimized
                ? "conference-surface is-mini"
                : "conference-surface is-full"
            }
            style={conferenceSurfaceStyle}
            onClick={isConferenceMinimized ? handleConferenceMiniSurfaceClick : undefined}
          >
            {isConferenceMinimized ? (
              <div
                className={
                  isConferenceMiniDragging
                    ? "conference-mini-toolbar is-draggable is-dragging"
                    : "conference-mini-toolbar is-draggable"
                }
                onPointerDown={startConferenceMiniDrag}
              >
                <div className="conference-mini-copy">
                  <strong>{activeConference.title}</strong>
                  <span>{activeConferenceStatusLabel ?? "Конференция активна"}</span>
                </div>
              </div>
            ) : null}
            {conferenceConversation}
          </div>
        ) : null}

        {(!activeConference || isConferenceMinimized) && activeChat ? (
          <ActiveChatConversation
            activeChat={activeChat}
            activeDirectParticipant={activeDirectParticipant}
            archivedChatIdSet={archivedChatIdSet}
            sessionUser={session.user}
            conversationSubtitle={conversationSubtitle}
            showTypingIndicator={showTypingIndicator}
            activePinnedMessage={activePinnedMessage}
            timelineItems={timelineItems}
            messagesLoading={messagesLoading}
            hasNextPage={Boolean(messagesQuery.hasNextPage)}
            isFetchingNextPage={messagesQuery.isFetchingNextPage}
            replyingToMessage={replyingToMessage}
            editingMessage={editingMessage}
            activeDraft={activeDraft}
            isChatMenuOpen={isChatMenuOpen}
            isDirectChatBlocked={activeDirectBlockedByMe}
            encryptionIdentityWarning={activeChatEncryptionWarning}
            chatMenuButtonRef={chatMenuButtonRef}
            messageStreamRef={messageStreamRef}
            composerTextareaRef={composerTextareaRef}
            onBack={() => setMobilePane("sidebar")}
            onToggleChatMenu={() => {
              setIsChatMembersOpen(false);
              setIsChatMenuOpen((current) => !current);
            }}
            onToggleArchive={() => toggleArchiveChat(activeChat.id, archivedChatIdSet)}
            onCloseChat={closeActiveChat}
            onJumpToPinned={() => {
              if (activePinnedMessage) {
                scrollToMessage(activeChat.id, activePinnedMessage.id);
              }
            }}
            onUnpin={() =>
              pinMessageMutation.mutate({
                chatId: activeChat.id,
                messageId: null,
              })
            }
            onLoadOlderMessages={loadOlderMessages}
            onOpenMessageContextMenu={openMessageContextMenu}
            onToggleReaction={toggleReactionForMessage}
            onJumpToMessage={scrollToMessage}
            onClearReply={() => clearComposerContext("reply")}
            onClearEdit={() => clearComposerContext("edit")}
            onRecoverEncryptionIdentity={handleRecoverEncryptionIdentity}
            onComposerChange={handleComposerChange}
            onSubmit={() => handleSubmitActiveDraft(activeDraft)}
            formatClock={formatClock}
            getMessageStatusClassName={getMessageStatusClassName}
            getMessageStatusGlyph={getMessageStatusGlyph}
            getMessageStatusLabel={getMessageStatusLabel}
            getReactionOption={getReactionOption}
            buildMessagePreview={buildMessagePreview}
          />
        ) : !activeConference || isConferenceMinimized ? (
          chatsLoading || conferencesLoading ? (
          <div className="empty-state large north-empty-state">Загружаем данные...</div>
        ) : (
          <div className="conversation-empty">
            <div className="conversation-empty-badge">
              {activeListTab === "conferences"
                ? "Выберите видеоконференцию слева"
                : "Выберите, кому хотели бы написать"}
            </div>
          </div>
          )
        ) : null}

        {(!activeConference || isConferenceMinimized) && activeChat && isChatMenuOpen ? (
          <div className="chat-menu-panel-shell is-popover">
            <div ref={chatMenuPanelRef} className="chat-menu-panel-frame">
              <ChatMenuPanel
                activeChat={activeChat}
                sessionUserId={session.user.id}
                activeDirectParticipant={activeDirectParticipant}
                activeDirectInContacts={activeDirectInContacts}
                isDirectBlocked={activeDirectBlockedByMe}
                groupDetailsTitle={groupDetailsTitle}
                groupDetailsAvatarUrl={groupDetailsAvatarUrl}
                groupInviteLinkUrl={activeGroupInviteUrl}
                availableGroupInviteContacts={availableGroupInviteContacts}
                selectedGroupInviteContacts={selectedGroupInviteContacts}
                isGroupInvitePickerOpen={isGroupInvitePickerOpen}
                groupInviteLinkPending={createGroupInviteLinkMutation.isPending}
                addGroupParticipantsPending={addGroupParticipantsMutation.isPending}
                updateGroupPending={updateGroupMutation.isPending}
                createChatPending={createChatMutation.isPending}
                leaveGroupPending={leaveGroupMutation.isPending}
                deleteGroupPending={deleteGroupMutation.isPending}
                banGroupParticipantPending={banGroupParticipantMutation.isPending}
                removeGroupParticipantPending={removeGroupParticipantMutation.isPending}
                assignModeratorPending={assignGroupModeratorMutation.isPending}
                revokeModeratorPending={revokeGroupModeratorMutation.isPending}
                toggleBlockPending={blockUserMutation.isPending || unblockUserMutation.isPending}
                canDeleteGroup={activeChatIsOwnedByCurrentUser}
                canEditGroup={activeChatIsOwnedByCurrentUser}
                canManageInviteLink={activeChatCanShareInviteLink}
                canManageMembers={activeChatIsOwnedByCurrentUser}
                canManageRoles={activeChatIsOwnedByCurrentUser}
                canModerateMembers={activeChatCanModerateMembers}
                onClose={() => setIsChatMenuOpen(false)}
                onOpenMembers={() => {
                  setIsChatMenuOpen(false);
                  setIsChatMembersOpen(true);
                }}
                onGroupDetailsTitleChange={setGroupDetailsTitle}
                onGroupAvatarSelected={(file) => void uploadGroupAvatarFromFile(file)}
                onRemoveGroupAvatar={() => setGroupDetailsAvatarUrl(null)}
                onSubmitUpdateGroup={handleSubmitUpdateGroup}
                onGenerateGroupInviteLink={handleGenerateGroupInviteLink}
                onCopyGroupInviteLink={(value) => void navigator.clipboard.writeText(value)}
                onToggleGroupInvitePicker={() => setIsGroupInvitePickerOpen((current) => !current)}
                onToggleGroupInviteParticipant={toggleGroupInviteParticipant}
                onSubmitAddGroupParticipants={submitAddGroupParticipants}
                onOpenGroupConferenceComposer={openGroupConferenceComposer}
                onCreateChat={(username) => createChatMutation.mutate(username)}
                onLeaveGroup={handleLeaveGroup}
                onDeleteGroup={handleDeleteGroup}
                onBanParticipant={handleBanParticipantAction}
                onRemoveParticipant={handleRemoveParticipantAction}
                onAssignModerator={handleAssignModeratorAction}
                onRevokeModerator={handleRevokeModeratorAction}
                onAddToContacts={addActiveChatToContacts}
                onStartDirectConference={handleStartDirectConference}
                onToggleBlocked={handleToggleDirectBlock}
              />
            </div>
          </div>
        ) : null}

        {(!activeConference || isConferenceMinimized) && activeChat && isChatMembersOpen ? (
          <div className="chat-menu-panel-shell is-modal">
            <div ref={chatMembersPanelRef} className="chat-members-panel-frame">
              <ChatMembersPanel
                activeChat={activeChat}
                sessionUserId={session.user.id}
                createChatPending={createChatMutation.isPending}
                addGroupParticipantsPending={addGroupParticipantsMutation.isPending}
                banGroupParticipantPending={banGroupParticipantMutation.isPending}
                removeGroupParticipantPending={removeGroupParticipantMutation.isPending}
                assignModeratorPending={assignGroupModeratorMutation.isPending}
                revokeModeratorPending={revokeGroupModeratorMutation.isPending}
                canAddMembers={activeChatIsOwnedByCurrentUser}
                canManageRoles={activeChatIsOwnedByCurrentUser}
                canModerateMembers={activeChatCanModerateMembers}
                availableGroupInviteContacts={availableGroupInviteContacts}
                selectedGroupInviteContacts={selectedGroupInviteContacts}
                isGroupInvitePickerOpen={isGroupInvitePickerOpen}
                groupInviteUsernames={groupInviteUsernames}
                onClose={() => setIsChatMembersOpen(false)}
                onCreateChat={(username) => createChatMutation.mutate(username)}
                onToggleGroupInvitePicker={() => setIsGroupInvitePickerOpen((current) => !current)}
                onToggleGroupInviteParticipant={toggleGroupInviteParticipant}
                onSubmitAddGroupParticipants={submitAddGroupParticipants}
                onBanParticipant={handleBanParticipantAction}
                onRemoveParticipant={handleRemoveParticipantAction}
                onAssignModerator={handleAssignModeratorAction}
                onRevokeModerator={handleRevokeModeratorAction}
              />
            </div>
          </div>
        ) : null}

      {errorText ? <div className="floating-error">{errorText}</div> : null}
      </section>
      {contextMenu ? (
        <MessageContextMenu
          contextMenu={contextMenu}
          contextMenuRef={contextMenuRef}
          contextMenuStyle={contextMenuStyle}
          contextMenuMessage={contextMenuMessage}
          reactionOptions={MESSAGE_REACTION_OPTIONS}
          getMessageReaction={getMessageReaction}
          onToggleReaction={toggleReactionFromContextMenu}
          canReactContextMenuMessage={canReactContextMenuMessage}
          canEditContextMenuMessage={canEditContextMenuMessage}
          canForwardContextMenuMessage={canForwardContextMenuMessage}
          canPinContextMenuMessage={canPinContextMenuMessage}
          isPinnedContextMenuMessage={isPinnedContextMenuMessage}
          canDeleteContextMenuMessageForSelf={canDeleteContextMenuMessageForSelf}
          canDeleteContextMenuMessageForEveryone={canDeleteContextMenuMessageForEveryone}
          deleteForEveryoneLabel={deleteForEveryoneLabel}
          deleteForEveryoneHint={deleteForEveryoneHint}
          onReply={replyToMessage}
          onEdit={editMessageAction}
          onForward={forwardMessageAction}
          onTogglePinned={togglePinnedMessageAction}
          onCopy={copyMessageText}
          onDeleteForSelf={deleteMessageForSelf}
          onDeleteForEveryone={deleteMessageForEveryone}
          onDeleteChatForSelf={deleteChatForSelf}
        />
      ) : null}

      {incomingToasts.length > 0 ? (
        <aside className="toast-stack" aria-live="polite">
          {incomingToasts.map((toast) => (
            <button
              type="button"
              key={toast.id}
              className="incoming-toast"
              onClick={() => openChat(toast.chatId)}
            >
              <div className="incoming-toast-title">
                <strong>{toast.title}</strong>
                <span>{toast.senderName}</span>
              </div>
              <p>{toast.preview}</p>
            </button>
          ))}
        </aside>
      ) : null}
    </main>
  );
}

