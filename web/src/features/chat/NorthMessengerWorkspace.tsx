import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  acknowledgeDelivered as acknowledgeDeliveredRequest,
  acknowledgeRead as acknowledgeReadRequest,
  addContact as addContactRequest,
  addConferenceParticipants as addConferenceParticipantsRequest,
  addGroupParticipants,
  createVideoConference as createVideoConferenceRequest,
  deleteChat as deleteChatRequest,
  deleteMessage as deleteMessageRequest,
  endVideoConference as endVideoConferenceRequest,
  createDirectChat,
  createGroupChat,
  getArchivedChats,
  getArchivedVideoConferences,
  getChats,
  getContacts,
  getProfile,
  getSessions,
  getTypingParticipants,
  getVideoConferences,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  searchUsers,
  sendTypingState,
  toggleMessageReaction as toggleMessageReactionRequest,
  updateArchivedChat,
  updateProfile,
  updateProfileAvatar,
} from "../../lib/api";
import { JITSI_BASE_URL } from "../../lib/config";
import {
  getEncryptedMessages,
  isUnavailableEncryptedMessage,
  primeEncryptedMessageRecipients,
  sendEncryptedMessage,
} from "../../lib/e2ee";
import { readLocalChatPreviews, writeLocalChatPreviews } from "../../lib/chatPreviewCache";
import { readLocalDrafts, removeLocalDraft, writeLocalDraft } from "../../lib/localDrafts";
import {
  publishOutgoingMessage,
  publishTypingEvent,
  replaceSubscribedChatIds,
  subscribeToChats,
} from "../../lib/realtime";
import type {
  AuthResponse,
  ChatRemovalEvent,
  ChatDraft,
  ChatMessage,
  MessageReaction,
  MessageReactionEvent,
  ChatSummary,
  MessageDeletionEvent,
  MessageStatus,
  MessageStatusEvent,
  Participant,
  SessionEvent,
  TypingEvent,
  UserProfile,
  UserSessionInfo,
  VideoConference,
} from "../../lib/types";
import {
  applyChatMessageActivity,
  applyChatPreviewOverrides,
  type ChatMessageActivityMode,
  clearChatUnreadCount,
  flattenMessagePages,
  initials,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  removeChatById,
  removeChatPreviewOverride,
  removeMessageById,
  removeMessageByClientMessageId,
  upsertChat,
  upsertChatPreviewOverride,
  updateMessageReactionsPages,
  updateMessageStatusPages,
} from "./chatState";
import {
  applyTypingEvent,
  formatTypingParticipants,
  removeTypingParticipant,
} from "./typingState";
import {
  type ConferenceRecordingState,
  ManagedConferenceStage,
} from "./ManagedConferenceStage";

type Props = {
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

type SidebarSheet =
  | "archive"
  | "conference"
  | "conferenceMembers"
  | "profile"
  | "group"
  | "groupMembers"
  | "contacts"
  | "sessions"
  | null;

type ConversationListTab = "dialogs" | "groups" | "conferences";

type MenuActionId =
  | "conference"
  | "archive"
  | "profile"
  | "group"
  | "contacts"
  | "sessions"
  | "logout";

type MenuAction = {
  id: MenuActionId;
  label: string;
  symbol: string;
  badge?: string;
};

type IncomingToast = {
  id: string;
  chatId: string;
  title: string;
  senderName: string;
  preview: string;
};

type TimelineItem =
  | {
      type: "day";
      key: string;
      label: string;
    }
  | {
      type: "message";
      key: string;
      message: ChatMessage;
    };

type SendMessageInput = {
  chatId: string;
  clientMessageId: string;
  content: string;
  participants: Participant[];
};

type ContextMenuState =
  | {
      kind: "chat";
      chatId: string;
      x: number;
      y: number;
    }
  | {
      kind: "message";
      chatId: string;
      messageId: string;
      x: number;
      y: number;
    };

const MENU_ACTIONS: MenuAction[] = [
  { id: "profile", label: "Мой профиль", symbol: "ME" },
  { id: "archive", label: "Архив", symbol: "AR" },
  { id: "group", label: "Группы", symbol: "GR" },
  { id: "conference", label: "Видеоконференции", symbol: "VC" },
  { id: "contacts", label: "Контакты", symbol: "CT" },
  { id: "sessions", label: "Активные устройства", symbol: "DV" },
  { id: "logout", label: "Выйти", symbol: "EX" },
];

const TYPING_EVENT_TTL_MS = 8_000;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 8_000;
const CHATS_POLL_INTERVAL_MS = 2_000;
const ACTIVE_MESSAGE_POLL_INTERVAL_MS = 1_000;
const ACTIVE_TYPING_POLL_INTERVAL_MS = 1_500;
const DRAFT_SAVE_DEBOUNCE_MS = 450;
const CONFERENCE_ACTIVATION_LEAD_MS = 5 * 60 * 1000;
const CONTEXT_MENU_WIDTH_PX = 224;
const CONTEXT_MENU_GUTTER_PX = 12;
const SIDEBAR_WIDTH_STORAGE_KEY = "north-messenger-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;
const MESSAGE_REACTION_OPTIONS: Array<{
  key: MessageReaction["key"];
  emoji: string;
  label: string;
}> = [
  { key: "LIKE", emoji: "👍", label: "Лайк" },
  { key: "DISLIKE", emoji: "👎", label: "Дизлайк" },
  { key: "EYES", emoji: "👀", label: "Глаза" },
  { key: "OK", emoji: "👌", label: "Окей" },
];

export function NorthMessengerWorkspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
  const [activeListTab, setActiveListTab] = useState<ConversationListTab>("dialogs");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarSheet, setSidebarSheet] = useState<SidebarSheet>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [conferenceTitle, setConferenceTitle] = useState("");
  const [conferenceScheduledAt, setConferenceScheduledAt] = useState(() =>
    createInitialConferenceDateTime()
  );
  const [conferenceComposerMode, setConferenceComposerMode] = useState<"instant" | "scheduled" | null>(null);
  const [conferenceParticipantUsernames, setConferenceParticipantUsernames] = useState<string[]>([]);
  const [conferenceInviteUsernames, setConferenceInviteUsernames] = useState<string[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState(session.user.displayName);
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [chatPreviewOverrides, setChatPreviewOverrides] = useState<
    Record<string, { lastMessage: string; lastMessageAt: string }>
  >(() => readLocalChatPreviews(session.user.id));
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [typingByChatId, setTypingByChatId] = useState<Record<string, Participant[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const [isConferenceInfoOpen, setIsConferenceInfoOpen] = useState(false);
  const [conferenceRecordingState, setConferenceRecordingState] =
    useState<ConferenceRecordingState>("idle");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const conferenceInfoButtonRef = useRef<HTMLButtonElement | null>(null);
  const conferenceInfoPanelRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const toastTimeoutsRef = useRef(new Map<string, number>());
  const typingTimeoutsRef = useRef(new Map<string, number>());
  const draftSaveTimeoutsRef = useRef(new Map<string, number>());
  const draftSyncLocksRef = useRef(new Set<string>());
  const typingSignalRef = useRef<{ chatId: string | null; active: boolean; lastSentAt: number }>({
    chatId: null,
    active: false,
    lastSentAt: 0,
  });
  const typingActivityRef = useRef<{ chatId: string | null; lastInputAt: number }>({
    chatId: null,
    lastInputAt: 0,
  });
  const previousActiveChatIdRef = useRef<string | null>(null);
  const deliveredMessageIdsRef = useRef(new Set<string>());
  const deliveredMessageIdsInFlightRef = useRef(new Set<string>());
  const readMessageIdsRef = useRef(new Set<string>());
  const readMessageIdsInFlightRef = useRef(new Set<string>());
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageId: string | null }>({
    chatId: null,
    lastMessageId: null,
  });
  const chatPreviewOverridesRef = useRef<Record<string, { lastMessage: string; lastMessageAt: string }>>(
    {}
  );
  const chatPreviewHydrationRef = useRef(new Map<string, string>());
  const sidebarResizeStateRef = useRef({ active: false, startX: 0, startWidth: DEFAULT_SIDEBAR_WIDTH });
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredContactSearch = useDeferredValue(contactSearch);

  const chatsQuery = useQuery({
    queryKey: ["chats", session.token],
    queryFn: () => getChats(session.token),
    refetchInterval: CHATS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", session.token],
    queryFn: () => getSessions(session.token),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", session.token],
    queryFn: () => getProfile(session.token),
    staleTime: 60_000,
  });

  const archivedChatsQuery = useQuery({
    queryKey: ["archived-chats", session.token],
    queryFn: () => getArchivedChats(session.token),
    staleTime: 60_000,
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts", session.token],
    queryFn: () => getContacts(session.token),
    staleTime: 60_000,
  });

  const conferencesQuery = useQuery({
    queryKey: ["video-conferences", session.token],
    queryFn: () => getVideoConferences(session.token),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });

  const archivedConferencesQuery = useQuery({
    queryKey: ["video-conferences-archive", session.token],
    queryFn: () => getArchivedVideoConferences(session.token),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
  });

  const draftsQuery = useQuery({
    queryKey: ["drafts", session.token],
    queryFn: async () => readLocalDrafts(session.user.id),
    staleTime: 15_000,
  });

  const userSearchQuery = useQuery({
    queryKey: ["user-search", session.token, deferredSearch],
    queryFn: () => searchUsers(session.token, deferredSearch.trim()),
    enabled: deferredSearch.trim().length > 0,
    staleTime: 15_000,
  });

  const contactsSearchQuery = useQuery({
    queryKey: ["contact-search", session.token, deferredContactSearch],
    queryFn: () => searchUsers(session.token, deferredContactSearch.trim()),
    enabled: deferredContactSearch.trim().length > 0,
    staleTime: 15_000,
  });

  const serverChats = chatsQuery.data ?? [];
  const chats = applyChatPreviewOverrides(serverChats, chatPreviewOverrides);
  const sessions = sessionsQuery.data ?? [];
  const profile = profileQuery.data ?? session.user;
  const archivedChatIds = archivedChatsQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
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
  const archivedChatIdSet = new Set(archivedChatIds);
  const allConferences = mergeVideoConferenceCollections(conferences, archivedConferences);
  const chatIds = chats.map((chat) => chat.id).sort();
  const chatIdsKey = chatIds.join(",");
  const normalizedSearch = deferredSearch.trim().toLowerCase();
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
  const visibleConferences = !normalizedSearch
    ? allConferences
    : allConferences.filter((conference) => {
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
  const conferenceCandidates = mergeConferenceCandidates(
    groupContacts,
    activeChat && !activeChat.direct ? activeChat.members : [],
    session.user.username
  );
  const activeDirectParticipant = activeChat ? getDirectParticipant(activeChat, session.user) : null;
  const activeDirectInContacts = activeDirectParticipant
    ? contacts.some((contact) => contact.username === activeDirectParticipant.username)
    : false;
  const activeDraft = activeChatId ? draftsByChatId[activeChatId] ?? "" : "";
  const activeConferenceIsArchived = Boolean(activeConference?.endedAt);
  const activeConferenceCanJoin = Boolean(
    activeConference?.roomName &&
      activeConference?.roomAccessCode &&
      activeConference.activatedAt &&
      !activeConference.endedAt
  );
  const activeConferenceShareUrl: string | null = null;
  const activeConferenceIsOwnedByCurrentUser = activeConference
    ? activeConference.createdBy.id === profile.id
    : false;
  const activeConferenceCanManageParticipants = Boolean(
    activeConference && activeConferenceIsOwnedByCurrentUser && !activeConferenceIsArchived
  );
  const activeConferenceRoleLabel = activeConference
    ? describeConferenceRole(activeConferenceIsOwnedByCurrentUser)
    : null;
  const activeConferenceOrganizerLabel = activeConference
    ? formatConferenceOrganizerLabel(activeConference.createdBy, profile)
    : null;
  const activeConferenceStatusLabel = activeConference
    ? formatConferenceStatusLabelV3(activeConference)
    : null;
  const activeConferenceLocalRecordingActive =
    conferenceRecordingState === "starting" || conferenceRecordingState === "recording";
  const activeConferenceStageHint = activeConference
    ? formatConferenceStageHintV3(activeConference, activeConferenceIsOwnedByCurrentUser)
    : null;
  const availableGroupInviteContacts =
    activeChat && !activeChat.direct
      ? groupContacts.filter(
          (contact) => !activeChat.members.some((member) => member.username === contact.username)
        )
      : [];
  const availableConferenceInviteContacts = activeConference
    ? groupContacts.filter(
        (contact) =>
          !activeConference.participants.some((participant) => participant.username === contact.username)
      )
    : [];
  const activeTypingQuery = useQuery({
    queryKey: ["typing", session.token, activeChatId],
    queryFn: () => getTypingParticipants(session.token, activeChatId!),
    enabled: Boolean(activeChatId) && !isRealtimeConnected,
    refetchInterval: !isRealtimeConnected && activeChatId ? ACTIVE_TYPING_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
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

  const messagesQuery = useInfiniteQuery({
    queryKey: ["messages", session.token, activeChat?.id],
    queryFn: ({ pageParam }) =>
      getEncryptedMessages(session.token, session.user.id, activeChat!.id, {
        before: pageParam,
        limit: MESSAGE_PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === MESSAGE_PAGE_SIZE ? lastPage[0]?.createdAt ?? undefined : undefined,
    refetchInterval: !isRealtimeConnected && activeChat?.id ? ACTIVE_MESSAGE_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
  const messages = flattenMessagePages(messagesQuery.data?.pages);
  const timelineItems = buildTimeline(messages);
  const messagesLoading =
    Boolean(activeChat?.id) && messagesQuery.data === undefined && messagesQuery.isFetching;
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const lastMessage = messages[messages.length - 1] ?? null;
  const contextMenuMessage =
    contextMenu?.kind === "message"
      ? messages.find((message) => message.id === contextMenu.messageId) ?? null
      : null;
  const canDeleteContextMenuMessage = Boolean(
    contextMenuMessage &&
      isOwnMessage(contextMenuMessage, session.user) &&
      contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );
  const canReactContextMenuMessage = Boolean(
    contextMenuMessage && contextMenuMessage.id !== contextMenuMessage.clientMessageId
  );

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
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeChat?.id, onSessionChange, session.token]);

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

  const applyChatPreviewMessage = useEffectEvent(
    (message: Pick<ChatMessage, "chatId" | "content" | "createdAt">) => {
      if (!message.content.trim() || isUnavailableEncryptedMessage(message.content)) {
        return;
      }

      setChatPreviewOverrides((current) => upsertChatPreviewOverride(current, message));
    }
  );

  const applyServerChatPreviewMessage = useEffectEvent((
    message: ChatMessage,
    unreadMode: ChatMessageActivityMode = "keep"
  ) => {
    if (!message.content.trim() || isUnavailableEncryptedMessage(message.content)) {
      return;
    }

    const hasChat = (
      queryClient.getQueryData<ChatSummary[]>(["chats", session.token]) ?? []
    ).some((chat) => chat.id === message.chatId);
    if (!hasChat) {
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      return;
    }

    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      applyChatMessageActivity(current, message, unreadMode)
    );
  });

  const clearTypingParticipant = useEffectEvent((chatId: string, participantId: string) => {
    const key = `${chatId}:${participantId}`;
    const timeoutId = typingTimeoutsRef.current.get(key);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      typingTimeoutsRef.current.delete(key);
    }

    setTypingByChatId((current) => removeTypingParticipant(current, chatId, participantId));
  });

  const acknowledgeDelivered = useEffectEvent(async (chatId: string, messageIds: string[]) => {
    const pendingIds = messageIds.filter(
      (messageId) =>
        !deliveredMessageIdsRef.current.has(messageId) &&
        !readMessageIdsRef.current.has(messageId) &&
        !deliveredMessageIdsInFlightRef.current.has(messageId)
    );
    if (!pendingIds.length) {
      return;
    }

    pendingIds.forEach((messageId) => deliveredMessageIdsInFlightRef.current.add(messageId));
    try {
      await acknowledgeDeliveredRequest(session.token, chatId, pendingIds);
      pendingIds.forEach((messageId) => deliveredMessageIdsRef.current.add(messageId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    } finally {
      pendingIds.forEach((messageId) => deliveredMessageIdsInFlightRef.current.delete(messageId));
    }
  });

  const acknowledgeRead = useEffectEvent(async (chatId: string, messageIds: string[]) => {
    const pendingIds = messageIds.filter(
      (messageId) =>
        !readMessageIdsRef.current.has(messageId) && !readMessageIdsInFlightRef.current.has(messageId)
    );
    if (!pendingIds.length) {
      return;
    }

    clearChatUnreadIndicator(chatId);
    pendingIds.forEach((messageId) => readMessageIdsInFlightRef.current.add(messageId));
    try {
      await acknowledgeReadRequest(session.token, chatId, pendingIds);
      pendingIds.forEach((messageId) => {
        readMessageIdsRef.current.add(messageId);
        deliveredMessageIdsRef.current.add(messageId);
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    } finally {
      pendingIds.forEach((messageId) => readMessageIdsInFlightRef.current.delete(messageId));
    }
  });

  const acknowledgeVisibleMessagesAsRead = useEffectEvent(() => {
    if (!activeChatId || document.visibilityState === "hidden") {
      return;
    }

    const incomingMessageIds = messages
      .filter((message) => !isOwnMessage(message, session.user))
      .map((message) => message.id);
    if (!incomingMessageIds.length) {
      return;
    }

    void acknowledgeRead(activeChatId, incomingMessageIds);
  });

  const syncTypingState = useEffectEvent((chatId: string, typing: boolean) => {
    if (publishTypingEvent(chatId, typing)) {
      return true;
    }

    void sendTypingState(session.token, chatId, typing).catch((error) => {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    });
    return true;
  });

  const sendTypingHeartbeat = useEffectEvent((chatId: string) => {
    const now = Date.now();
    const currentSignal = typingSignalRef.current;

    if (currentSignal.active && currentSignal.chatId && currentSignal.chatId !== chatId) {
      const sentStop = syncTypingState(currentSignal.chatId, false);
      typingSignalRef.current = {
        chatId: currentSignal.chatId,
        active: false,
        lastSentAt: sentStop ? now : 0,
      };
    }

    const nextSignal = typingSignalRef.current;
    if (nextSignal.active && nextSignal.chatId === chatId && now - nextSignal.lastSentAt < TYPING_HEARTBEAT_MS) {
      return;
    }

    const sentHeartbeat = syncTypingState(chatId, true);
    typingSignalRef.current = {
      chatId,
      active: true,
      lastSentAt: sentHeartbeat ? now : 0,
    };
  });

  const stopTyping = useEffectEvent((chatId?: string | null) => {
    const currentSignal = typingSignalRef.current;
    const targetChatId = chatId ?? currentSignal.chatId;
    if (!targetChatId || !currentSignal.active || currentSignal.chatId !== targetChatId) {
      return;
    }

    const sentStop = syncTypingState(targetChatId, false);
    typingSignalRef.current = {
      chatId: targetChatId,
      active: false,
      lastSentAt: sentStop ? Date.now() : 0,
    };
  });

  const dismissIncomingToast = useEffectEvent((toastId: string) => {
    const timeoutId = toastTimeoutsRef.current.get(toastId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }

    setIncomingToasts((current) => current.filter((toast) => toast.id !== toastId));
  });

  const persistDraft = useEffectEvent(async (chatId: string, content: string) => {
    try {
      const nextDrafts = writeLocalDraft(session.user.id, chatId, content);
      queryClient.setQueryData<ChatDraft[]>(["drafts", session.token], nextDrafts);
    } finally {
      if (!draftSaveTimeoutsRef.current.has(chatId)) {
        draftSyncLocksRef.current.delete(chatId);
      }
    }
  });

  const scheduleDraftSave = useEffectEvent((chatId: string, content: string) => {
    draftSyncLocksRef.current.add(chatId);
    const existingTimeoutId = draftSaveTimeoutsRef.current.get(chatId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      draftSaveTimeoutsRef.current.delete(chatId);
      void persistDraft(chatId, content);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    draftSaveTimeoutsRef.current.set(chatId, timeoutId);
  });

  const clearChatAttention = useEffectEvent((chatId: string) => {
    const toastIds = incomingToasts
      .filter((toast) => toast.chatId === chatId)
      .map((toast) => toast.id);
    if (!toastIds.length) {
      return;
    }

    toastIds.forEach((toastId) => {
      const timeoutId = toastTimeoutsRef.current.get(toastId);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        toastTimeoutsRef.current.delete(toastId);
      }
    });

    setIncomingToasts((current) => current.filter((toast) => toast.chatId !== chatId));
  });

  const clearChatUnreadIndicator = useEffectEvent((chatId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      clearChatUnreadCount(current, chatId)
    );
  });

  const clearChatPreviewOverride = useEffectEvent((chatId: string) => {
    setChatPreviewOverrides((current) => removeChatPreviewOverride(current, chatId));
  });

  const finalizeDeletedChatArtifacts = useEffectEvent((chatId: string) => {
    const nextDrafts = removeLocalDraft(session.user.id, chatId);
    queryClient.setQueryData<ChatDraft[]>(["drafts", session.token], nextDrafts);
  });

  const deleteChatLocally = useEffectEvent((chatId: string) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      removeChatById(current, chatId)
    );
    queryClient.setQueryData<string[]>(["archived-chats", session.token], (current) =>
      current?.filter((item) => item !== chatId) ?? []
    );
    queryClient.setQueryData<ChatDraft[]>(["drafts", session.token], (current) =>
      current?.filter((draft) => draft.chatId !== chatId) ?? []
    );
    queryClient.removeQueries({ queryKey: ["messages", session.token, chatId] });
    clearChatPreviewOverride(chatId);
    clearChatAttention(chatId);
    setDraftsByChatId((current) => {
      if (!(chatId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[chatId];
      return next;
    });

    if (activeChatId === chatId) {
      closeActiveChat();
    }
  });

  const openChatContextMenu = useEffectEvent((event: MouseEvent | React.MouseEvent, chatId: string) => {
    const x = event.clientX;
    const y = event.clientY;
    event.preventDefault();
    setContextMenu({
      kind: "chat",
      chatId,
      x,
      y,
    });
  });

  const openMessageContextMenu = useEffectEvent(
    (event: MouseEvent | React.MouseEvent, chatId: string, messageId: string) => {
      const x = event.clientX;
      const y = event.clientY;
      event.preventDefault();
      setContextMenu({
        kind: "message",
        chatId,
        messageId,
        x,
        y,
      });
    }
  );

  const openSidebarSheet = useEffectEvent((sheet: Exclude<SidebarSheet, null>) => {
    setSidebarSheet(sheet);
    setIsMenuOpen(false);
    setMobilePane("sidebar");
  });

  const resetConferenceComposer = useEffectEvent(() => {
    setConferenceTitle("");
    setConferenceScheduledAt(createInitialConferenceDateTime());
    setConferenceParticipantUsernames([]);
    setConferenceComposerMode(null);
  });

  const openConferenceSheet = useEffectEvent(() => {
    setActiveListTab("conferences");
    setActiveConferenceId(null);
    openSidebarSheet("conference");
  });

  const openConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    openConferenceSheet();
    setConferenceComposerMode(mode);
    if (mode === "scheduled") {
      setConferenceScheduledAt(createInitialConferenceDateTime());
    }
  });

  const openGroupConferenceComposer = useEffectEvent((mode: "instant" | "scheduled") => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openConferenceSheet();
    setConferenceComposerMode(mode);
    setConferenceTitle(`Встреча ${activeChat.title}`);
    setConferenceParticipantUsernames(
      activeChat.members
        .filter((member) => member.username !== session.user.username)
        .map((member) => member.username)
    );
    if (mode === "scheduled") {
      setConferenceScheduledAt(createInitialConferenceDateTime());
    }
  });

  const activateListTab = useEffectEvent((tab: ConversationListTab) => {
    setActiveListTab(tab);
    setSidebarSheet(null);
    setIsMenuOpen(false);
    if (tab !== "conferences") {
      setConferenceComposerMode(null);
      setActiveConferenceId(null);
    }
  });

  const openChat = useEffectEvent((chatId: string, tabHint?: ConversationListTab) => {
    setContextMenu(null);
    clearChatAttention(chatId);
    clearChatUnreadIndicator(chatId);
    if (tabHint && tabHint !== "conferences") {
      setActiveListTab(tabHint);
    } else {
      const targetChat = chats.find((chat) => chat.id === chatId) ?? null;
      if (targetChat) {
        setActiveListTab(targetChat.direct ? "dialogs" : "groups");
      }
    }
    setIsMenuOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setMobilePane("conversation");
    setActiveConferenceId(null);
    setActiveChatId(chatId);
  });

  const closeActiveChat = useEffectEvent(() => {
    setContextMenu(null);
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setSidebarSheet(null);
    setMobilePane("sidebar");
    setActiveChatId(null);
  });

  const closeActiveConference = useEffectEvent(() => {
    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setMobilePane("sidebar");
    setActiveConferenceId(null);
  });

  const openConference = useEffectEvent((conferenceId: string) => {
    setContextMenu(null);
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setActiveListTab("conferences");
    setIsMenuOpen(false);
    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setConferenceComposerMode(null);
    setMobilePane("conversation");
    setActiveChatId(null);
    setActiveConferenceId(conferenceId);
  });

  const handleConferenceStageExit = useEffectEvent(() => {
    if (!activeConference) {
      closeActiveConference();
      return;
    }

    const conference = activeConference;
    if (activeConferenceIsOwnedByCurrentUser) {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", session.token], (current) =>
        removeVideoConference(current, conference.id)
      );
      endConferenceMutation.mutate(conference.id, {
        onError: () => {
          void queryClient.invalidateQueries({ queryKey: ["video-conferences", session.token] });
        },
      });
    }

    closeActiveConference();
  });

  const toggleArchiveChat = useEffectEvent((chatId: string) => {
    const archived = !archivedChatIdSet.has(chatId);
    updateArchivedChatMutation.mutate({ chatId, archived });

    if (activeChatId === chatId && archived) {
      setSidebarSheet("archive");
      setMobilePane("sidebar");
    }
  });

  const addContact = (user: UserProfile) => {
    if (user.username === session.user.username) {
      return;
    }

    addContactMutation.mutate(user);
    setContactSearch("");
  };

  const removeContact = (username: string) => {
    removeContactMutation.mutate(username);
  };

  const deleteChatForSelf = useEffectEvent((chatId: string) => {
    setContextMenu(null);
    const chat = chats.find((item) => item.id === chatId);
    const title = chat?.title ?? "этот чат";
    if (!window.confirm(`Удалить чат "${title}" только у вас?`)) {
      return;
    }

    deleteChatMutation.mutate(chatId);
  });

  const deleteMessageForEveryone = useEffectEvent((chatId: string, messageId: string) => {
    setContextMenu(null);
    if (!window.confirm("Удалить сообщение для всех участников чата?")) {
      return;
    }

    deleteMessageMutation.mutate({ chatId, messageId });
  });

  const toggleReactionForMessage = useEffectEvent(
    (chatId: string, messageId: string, key: MessageReaction["key"]) => {
      toggleMessageReactionMutation.mutate({ chatId, messageId, key });
    }
  );

  const toggleReactionFromContextMenu = useEffectEvent(
    (chatId: string, messageId: string, key: MessageReaction["key"]) => {
      setContextMenu(null);
      toggleMessageReactionMutation.mutate({ chatId, messageId, key });
    }
  );

  const replyToMessage = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    const currentDraft = draftsByChatId[message.chatId] ?? "";
    const replyPrefix = buildReplyDraftPrefix(message);
    const nextDraft = currentDraft.startsWith(replyPrefix)
      ? currentDraft
      : currentDraft.trim()
        ? `${replyPrefix}\n${currentDraft}`
        : replyPrefix;

    setDraftsByChatId((current) => ({
      ...current,
      [message.chatId]: nextDraft,
    }));
    scheduleDraftSave(message.chatId, nextDraft);
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      const length = composerTextareaRef.current?.value.length ?? 0;
      composerTextareaRef.current?.setSelectionRange(length, length);
    });
  });

  const copyMessageText = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    void navigator.clipboard.writeText(message.content).catch(() => {
      window.alert("Не получилось скопировать текст сообщения.");
    });
  });

  const addActiveChatToContacts = () => {
    if (!activeDirectParticipant) {
      return;
    }

    addContact({
      id: activeDirectParticipant.id,
      username: activeDirectParticipant.username,
      displayName: activeDirectParticipant.displayName,
      createdAt: new Date().toISOString(),
      avatarUrl: activeDirectParticipant.avatarUrl ?? null,
      online: activeDirectParticipant.online === true,
    });
  };

  const handleComposerChange = useEffectEvent((nextValue: string) => {
    if (!activeChat) {
      return;
    }

    setDraftsByChatId((current) => ({
      ...current,
      [activeChat.id]: nextValue,
    }));
    scheduleDraftSave(activeChat.id, nextValue);

    if (nextValue.trim()) {
      typingActivityRef.current = {
        chatId: activeChat.id,
        lastInputAt: Date.now(),
      };
      sendTypingHeartbeat(activeChat.id);
      return;
    }

    typingActivityRef.current = {
      chatId: activeChat.id,
      lastInputAt: 0,
    };
    stopTyping(activeChat.id);
  });

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 960) {
      return;
    }

    sidebarResizeStateRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    document.body.classList.add("is-resizing-chat-layout");
    event.preventDefault();
  };

  const toggleGroupParticipant = (username: string) => {
    setGroupParticipantUsernames((current) => toggleUsernameSelection(current, username));
  };

  const toggleConferenceParticipant = (username: string) => {
    setConferenceParticipantUsernames((current) => toggleUsernameSelection(current, username));
  };

  const toggleGroupInviteParticipant = (username: string) => {
    setGroupInviteUsernames((current) => toggleUsernameSelection(current, username));
  };

  const toggleConferenceInviteParticipant = (username: string) => {
    setConferenceInviteUsernames((current) => toggleUsernameSelection(current, username));
  };

  const syncProfile = useEffectEvent((nextProfile: UserProfile) => {
    queryClient.setQueryData(["profile", session.token], nextProfile);
    onSessionChange({
      ...session,
      user: nextProfile,
    });
  });

  const uploadAvatarFromFile = useEffectEvent(async (file: File) => {
    try {
      const avatarUrl = await readFileAsDataUrl(file);
      avatarMutation.mutate(avatarUrl);
    } catch {
      return;
    }
  });

  const showIncomingToast = useEffectEvent((message: ChatMessage) => {
    if (isOwnMessage(message, session.user) || message.chatId === activeChatId) {
      return;
    }

    const chatsSnapshot = queryClient.getQueryData<ChatSummary[]>(["chats", session.token]) ?? [];
    const chat = chatsSnapshot.find((item) => item.id === message.chatId);
    const toastId = message.id;
    const nextToast: IncomingToast = {
      id: toastId,
      chatId: message.chatId,
      title: chat?.title ?? "Новое сообщение",
      senderName: message.sender.displayName,
      preview: formatToastPreview(message.content),
    };

    const existingTimeoutId = toastTimeoutsRef.current.get(toastId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    setIncomingToasts((current) =>
      [...current.filter((toast) => toast.id !== toastId), nextToast].slice(-3)
    );

    const timeoutId = window.setTimeout(() => {
      dismissIncomingToast(toastId);
    }, 3000);
    toastTimeoutsRef.current.set(toastId, timeoutId);
  });

  useEffect(() => {
    if (!chats.length) {
      if (activeChatId !== null) {
        setActiveChatId(null);
      }
      return;
    }

    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      startTransition(() => {
        setActiveChatId(null);
      });
    }
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    clearChatAttention(activeChatId);
    clearChatUnreadIndicator(activeChatId);
  }, [activeChatId, clearChatAttention, clearChatUnreadIndicator]);

  useEffect(() => {
    if (draftsQuery.data === undefined) {
      return;
    }

    const serverDraftsByChatId = Object.fromEntries(
      draftsQuery.data.map((draft) => [draft.chatId, draft.content])
    );
    setDraftsByChatId((current) => {
      const next = { ...current };
      let changed = false;

      draftsQuery.data.forEach((draft) => {
        if (draftSyncLocksRef.current.has(draft.chatId)) {
          return;
        }

        if (next[draft.chatId] !== draft.content) {
          next[draft.chatId] = draft.content;
          changed = true;
        }
      });

      Object.keys(next).forEach((chatId) => {
        if (draftSyncLocksRef.current.has(chatId)) {
          return;
        }

        if (!(chatId in serverDraftsByChatId)) {
          delete next[chatId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [draftsQuery.data]);

  useEffect(() => {
    setProfileDisplayName(profile.displayName);
  }, [profile.displayName]);

  useEffect(() => {
    setIsConferenceInfoOpen(false);
  }, [activeConferenceId]);

  useEffect(() => {
    if (
      !activeConferenceId ||
      conferencesQuery.data === undefined ||
      archivedConferencesQuery.data === undefined
    ) {
      return;
    }

    if (
      conferences.some((conference) => conference.id === activeConferenceId) ||
      archivedConferences.some((conference) => conference.id === activeConferenceId)
    ) {
      return;
    }

    setIsConferenceInfoOpen(false);
    setSidebarSheet(null);
    setMobilePane("sidebar");
    startTransition(() => {
      setActiveConferenceId(null);
    });
  }, [
    activeConferenceId,
    archivedConferences,
    archivedConferencesQuery.data,
    conferences,
    conferencesQuery.data,
  ]);

  useEffect(() => {
    if (sidebarSheet !== "groupMembers") {
      setGroupInviteUsernames([]);
    }

    if (sidebarSheet !== "conferenceMembers") {
      setConferenceInviteUsernames([]);
    }
  }, [sidebarSheet]);

  useEffect(() => {
    if (sidebarSheet !== "profile") {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const file = extractImageFromClipboard(event.clipboardData);
      if (!file) {
        return;
      }

      event.preventDefault();
      void uploadAvatarFromFile(file);
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [sidebarSheet, uploadAvatarFromFile]);

  useEffect(() => {
    return () => {
      draftSaveTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      draftSaveTimeoutsRef.current.clear();
      typingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      typingTimeoutsRef.current.clear();
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isConferenceInfoOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (
        conferenceInfoPanelRef.current?.contains(target) ||
        conferenceInfoButtonRef.current?.contains(target)
      ) {
        return;
      }

      setIsConferenceInfoOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsConferenceInfoOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConferenceInfoOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (menuPanelRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth((current) => clampSidebarWidth(current, window.innerWidth));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = sidebarResizeStateRef.current;
      if (!resizeState.active) {
        return;
      }

      const nextWidth = resizeState.startWidth + event.clientX - resizeState.startX;
      setSidebarWidth(clampSidebarWidth(nextWidth, window.innerWidth));
    };

    const finishResize = () => {
      if (!sidebarResizeStateRef.current.active) {
        return;
      }

      sidebarResizeStateRef.current.active = false;
      document.body.classList.remove("is-resizing-chat-layout");
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.body.classList.remove("is-resizing-chat-layout");
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => {
      setContextMenu(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }

      closeContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleRealtimeMessage = useEffectEvent((message: ChatMessage) => {
    if (handledRealtimeMessageIdsRef.current.has(message.id)) {
      return;
    }

    const nextMessage = ensureOwnMessageStatus(message, session.user);
    const ownMessage = isOwnMessage(nextMessage, session.user);
    const isVisibleActiveChat =
      nextMessage.chatId === activeChatId && document.visibilityState !== "hidden";
    clearTypingParticipant(message.chatId, message.sender.id);
    rememberRealtimeMessage(message.id);
    applyChatPreviewMessage(nextMessage);

    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, nextMessage.chatId],
      (current) => mergeMessagePages(current, nextMessage)
    );
    applyServerChatPreviewMessage(
      nextMessage,
      ownMessage || isVisibleActiveChat ? "clear" : "increment"
    );

    if (!ownMessage) {
      if (isVisibleActiveChat) {
        clearChatUnreadIndicator(nextMessage.chatId);
        void acknowledgeRead(nextMessage.chatId, [nextMessage.id]);
      } else {
        void acknowledgeDelivered(nextMessage.chatId, [nextMessage.id]);
      }
    }

    showIncomingToast(nextMessage);
  });

  const handleRealtimeChat = useEffectEvent((chat: ChatSummary) => {
    const isNewChat = !(
      queryClient.getQueryData<ChatSummary[]>(["chats", session.token]) ?? []
    ).some((currentChat) => currentChat.id === chat.id);

    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => upsertChat(current, chat)
    );

    if (isNewChat) {
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    }
  });

  const handleRealtimeSession = useEffectEvent((event: SessionEvent) => {
    if (event.type === "SESSION_REVOKED" && event.sessionId === session.sessionId) {
      onSessionChange(null);
    }
  });

  const handleRealtimeConnect = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    if (!activeChatId) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["messages", session.token, activeChatId] });
    if (activeDraft.trim()) {
      sendTypingHeartbeat(activeChatId);
    }
  });

  useEffect(() => {
    if (isRealtimeConnected) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    if (!activeChatId) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["messages", session.token, activeChatId] });
    void queryClient.invalidateQueries({ queryKey: ["typing", session.token, activeChatId] });
  }, [activeChatId, isRealtimeConnected, queryClient, session.token]);

  const handleRealtimeMessageStatus = useEffectEvent((event: MessageStatusEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, event.chatId],
      (current) => updateMessageStatusPages(current, event)
    );
  });

  const handleRealtimeMessageDeletion = useEffectEvent((event: MessageDeletionEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, event.chatId],
      (current) => removeMessageById(current, event.messageId)
    );
    clearChatPreviewOverride(event.chatId);
    void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    void queryClient.invalidateQueries({ queryKey: ["messages", session.token, event.chatId] });
  });

  const handleRealtimeMessageReaction = useEffectEvent((event: MessageReactionEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, event.chatId],
      (current) => updateMessageReactionsPages(current, event)
    );
  });

  const handleRealtimeChatRemoval = useEffectEvent((event: ChatRemovalEvent) => {
    deleteChatLocally(event.chatId);
    finalizeDeletedChatArtifacts(event.chatId);
    void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    void queryClient.invalidateQueries({ queryKey: ["archived-chats", session.token] });
  });

  const handleRealtimeTyping = useEffectEvent((event: TypingEvent) => {
    if (event.participant.id === session.user.id) {
      return;
    }

    if (!event.typing) {
      clearTypingParticipant(event.chatId, event.participant.id);
      return;
    }

    setTypingByChatId((current) => applyTypingEvent(current, event, session.user.id));
    const key = `${event.chatId}:${event.participant.id}`;
    const existingTimeoutId = typingTimeoutsRef.current.get(key);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      clearTypingParticipant(event.chatId, event.participant.id);
    }, TYPING_EVENT_TTL_MS);
    typingTimeoutsRef.current.set(key, timeoutId);
  });

  useEffect(() => {
    return subscribeToChats({
      chatIds: [],
      token: session.token,
      currentUserId: session.user.id,
      onChat: handleRealtimeChat,
      onChatRemoval: handleRealtimeChatRemoval,
      onConnectionChange: setIsRealtimeConnected,
      onConnect: handleRealtimeConnect,
      onMessage: handleRealtimeMessage,
      onMessageDeletion: handleRealtimeMessageDeletion,
      onMessageReaction: handleRealtimeMessageReaction,
      onMessageStatus: handleRealtimeMessageStatus,
      onSessionEvent: handleRealtimeSession,
      onTyping: handleRealtimeTyping,
    });
  }, [
    handleRealtimeConnect,
    handleRealtimeChat,
    handleRealtimeChatRemoval,
    handleRealtimeMessage,
    handleRealtimeMessageDeletion,
    handleRealtimeMessageReaction,
    handleRealtimeMessageStatus,
    handleRealtimeSession,
    handleRealtimeTyping,
    session.token,
    session.user.id,
  ]);

  useEffect(() => {
    replaceSubscribedChatIds(chatIdsKey ? chatIdsKey.split(",") : []);
  }, [chatIdsKey, session.token]);

  useEffect(() => {
    chatPreviewOverridesRef.current = chatPreviewOverrides;
    writeLocalChatPreviews(
      session.user.id,
      Object.fromEntries(
        Object.entries(chatPreviewOverrides).filter(
          ([, preview]) =>
            preview.lastMessage.trim().length > 0 &&
            !isUnavailableEncryptedMessage(preview.lastMessage)
        )
      )
    );
  }, [chatPreviewOverrides, session.user.id]);

  const hydrateChatListPreview = useEffectEvent(async (chat: ChatSummary) => {
    const targetVersion = chat.lastMessageAt;
    if (!targetVersion) {
      return;
    }

    if (chatPreviewOverridesRef.current[chat.id]?.lastMessageAt === targetVersion) {
      return;
    }

    if (chatPreviewHydrationRef.current.get(chat.id) === targetVersion) {
      return;
    }

    chatPreviewHydrationRef.current.set(chat.id, targetVersion);
    try {
      const messages = await getEncryptedMessages(session.token, session.user.id, chat.id, {
        limit: 1,
      });
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        applyChatPreviewMessage(latestMessage);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    } finally {
      if (chatPreviewHydrationRef.current.get(chat.id) === targetVersion) {
        chatPreviewHydrationRef.current.delete(chat.id);
      }
    }
  });

  useEffect(() => {
    let cancelled = false;
    const archivedChatIdsLookup = new Set(archivedChatIds);

    const hydrateVisibleChatPreviews = async () => {
      for (const chat of serverChats) {
        if (cancelled || archivedChatIdsLookup.has(chat.id) || !chat.lastMessageAt) {
          continue;
        }

        await hydrateChatListPreview(chat);
      }
    };

    if (serverChats.length > 0) {
      void hydrateVisibleChatPreviews();
    }

    return () => {
      cancelled = true;
    };
  }, [archivedChatIds, hydrateChatListPreview, serverChats]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    acknowledgeVisibleMessagesAsRead();
  }, [acknowledgeVisibleMessagesAsRead, activeChatId, lastMessageId, messages.length]);

  useEffect(() => {
    if (!activeChatId || !lastMessage) {
      return;
    }

    applyChatPreviewMessage(lastMessage);
    applyServerChatPreviewMessage(lastMessage, "clear");
  }, [
    activeChatId,
    applyChatPreviewMessage,
    applyServerChatPreviewMessage,
    lastMessage,
    queryClient,
    session.token,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        acknowledgeVisibleMessagesAsRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [acknowledgeVisibleMessagesAsRead]);

  useEffect(() => {
    const previousChatId = previousActiveChatIdRef.current;
    if (previousChatId && previousChatId !== activeChatId) {
      stopTyping(previousChatId);
    }

    previousActiveChatIdRef.current = activeChatId;
  }, [activeChatId, stopTyping]);

  useEffect(() => {
    if (!activeChatId || !activeDraft.trim()) {
      if (activeChatId) {
        stopTyping(activeChatId);
      } else {
        stopTyping();
      }
      return;
    }

    const tick = () => {
      const activity = typingActivityRef.current;
      if (activity.chatId !== activeChatId || activity.lastInputAt === 0) {
        stopTyping(activeChatId);
        return;
      }

      if (Date.now() - activity.lastInputAt > TYPING_IDLE_MS) {
        stopTyping(activeChatId);
        return;
      }

      sendTypingHeartbeat(activeChatId);
    };

    tick();
    const intervalId = window.setInterval(tick, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeChatId, activeDraft, sendTypingHeartbeat, stopTyping]);

  useEffect(() => {
    const container = messageStreamRef.current;
    if (!container) {
      return;
    }

    const pendingOlderOffset = pendingOlderScrollOffsetRef.current;
    if (pendingOlderOffset !== null) {
      container.scrollTop = container.scrollHeight - pendingOlderOffset;
      pendingOlderScrollOffsetRef.current = null;
      viewportSnapshotRef.current = {
        chatId: activeChat?.id ?? null,
        lastMessageId,
      };
      return;
    }

    const previous = viewportSnapshotRef.current;
    const chatChanged = previous.chatId !== (activeChat?.id ?? null);
    const tailChanged = previous.lastMessageId !== lastMessageId;
    if (chatChanged || tailChanged) {
      container.scrollTop = container.scrollHeight;
    }

    viewportSnapshotRef.current = {
      chatId: activeChat?.id ?? null,
      lastMessageId,
    };
  }, [activeChat?.id, lastMessageId, messages.length]);

  const createChatMutation = useMutation({
    mutationFn: (participantUsername: string) =>
      createDirectChat(session.token, participantUsername),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, chat)
      );
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      setSidebarSheet(null);
      openChat(chat.id, "dialogs");
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (input: { title: string; participantUsernames: string[] }) =>
      createGroupChat(session.token, input),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, chat)
      );
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      setGroupTitle("");
      setGroupParticipantUsernames([]);
      setSidebarSheet(null);
      openChat(chat.id, "groups");
    },
  });

  const createConferenceMutation = useMutation({
    mutationFn: (input: {
      title: string;
      scheduledAt: string;
      participantUsernames: string[];
    }) => createVideoConferenceRequest(session.token, input),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", session.token], (current) =>
        upsertVideoConferences(current, conference)
      );
      resetConferenceComposer();
      setActiveListTab("conferences");
      openConference(conference.id);
    },
  });

  const endConferenceMutation = useMutation({
    mutationFn: (conferenceId: string) => endVideoConferenceRequest(session.token, conferenceId),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", session.token], (current) =>
        removeVideoConference(current, conference.id)
      );
      queryClient.setQueryData<VideoConference[]>(
        ["video-conferences-archive", session.token],
        (current) => upsertVideoConferences(current, conference)
      );
      if (activeConferenceId === conference.id) {
        closeActiveConference();
      }
    },
  });

  const addConferenceParticipantsMutation = useMutation({
    mutationFn: (participantUsernames: string[]) =>
      addConferenceParticipantsRequest(session.token, activeConference!.id, { participantUsernames }),
    onSuccess: (conference) => {
      queryClient.setQueryData<VideoConference[]>(["video-conferences", session.token], (current) =>
        upsertVideoConferences(current, conference)
      );
      setConferenceInviteUsernames([]);
      setSidebarSheet(null);
    },
  });

  const addGroupParticipantsMutation = useMutation({
    mutationFn: (participantUsernames: string[]) =>
      addGroupParticipants(session.token, activeChat!.id, { participantUsernames }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, chat)
      );
      setGroupInviteUsernames([]);
      setSidebarSheet(null);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (input: SendMessageInput) =>
      sendEncryptedMessage(
        session.token,
        input.chatId,
        input.content,
        input.participants,
        input.clientMessageId,
        {
          sendViaRealtime: (request) => publishOutgoingMessage(input.chatId, request),
        }
      ),
    onMutate: (input) => {
      void queryClient.cancelQueries({ queryKey: ["messages", session.token, input.chatId] });
      const optimisticMessage = createOptimisticOutgoingMessage(session.user, input);
      applyChatPreviewMessage(optimisticMessage);
      applyServerChatPreviewMessage(optimisticMessage, "clear");
      setDraftsByChatId((current) => {
        const existingDraft = current[input.chatId] ?? "";
        if (existingDraft.trim() !== input.content) {
          return current;
        }

        const next = { ...current };
        delete next[input.chatId];
        return next;
      });
      scheduleDraftSave(input.chatId, "");
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, input.chatId],
        (current) => mergeMessagePages(current, optimisticMessage)
      );
      return input;
    },
    onSuccess: (message, input) => {
      const nextMessage = ensureOwnMessageStatus(message, session.user);
      rememberRealtimeMessage(nextMessage.id);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, input.chatId],
        (current) => mergeMessagePages(current, nextMessage)
      );
      applyChatPreviewMessage(nextMessage);
      applyServerChatPreviewMessage(nextMessage, "clear");
    },
    onError: (_error, input) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, input.chatId],
        (current) => removeMessageByClientMessageId(current, input.clientMessageId)
      );
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      setDraftsByChatId((current) => {
        if ((current[input.chatId] ?? "").trim()) {
          return current;
        }

        return {
          ...current,
          [input.chatId]: input.content,
        };
      });
      scheduleDraftSave(input.chatId, input.content);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      onSessionChange(null);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => revokeSession(session.token, sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.setQueryData<UserSessionInfo[]>(["sessions", session.token], (current) =>
        current?.filter((item) => item.id !== sessionId) ?? []
      );
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (displayName: string) => updateProfile(session.token, { displayName }),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string | null) => updateProfileAvatar(session.token, avatarUrl),
    onSuccess: (nextProfile) => {
      syncProfile(nextProfile);
    },
  });

  const updateArchivedChatMutation = useMutation({
    mutationFn: ({ chatId, archived }: { chatId: string; archived: boolean }) =>
      updateArchivedChat(session.token, chatId, archived),
    onMutate: async ({ chatId, archived }) => {
      const queryKey = ["archived-chats", session.token] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next = archived
        ? previous.includes(chatId)
          ? previous
          : [...previous, chatId]
        : previous.filter((item) => item !== chatId);
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["archived-chats", session.token], context.previous);
      }
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: (chatId: string) => deleteChatRequest(session.token, chatId),
    onMutate: async (chatId) => {
      const chatsKey = ["chats", session.token] as const;
      const archivedKey = ["archived-chats", session.token] as const;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: chatsKey }),
        queryClient.cancelQueries({ queryKey: archivedKey }),
      ]);

      const previousChats = queryClient.getQueryData<ChatSummary[]>(chatsKey);
      const previousArchived = queryClient.getQueryData<string[]>(archivedKey);
      deleteChatLocally(chatId);
      return {
        chatId,
        previousChats,
        previousArchived,
      };
    },
    onError: (_error, _chatId, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(["chats", session.token], context.previousChats);
      }
      if (context?.previousArchived) {
        queryClient.setQueryData(["archived-chats", session.token], context.previousArchived);
      }
      void queryClient.invalidateQueries({ queryKey: ["drafts", session.token] });
    },
    onSuccess: (_result, chatId) => {
      finalizeDeletedChatArtifacts(chatId);
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      void queryClient.invalidateQueries({ queryKey: ["archived-chats", session.token] });
      void queryClient.invalidateQueries({ queryKey: ["drafts", session.token] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string }) =>
      deleteMessageRequest(session.token, chatId, messageId),
    onMutate: async ({ chatId, messageId }) => {
      const messageKey = ["messages", session.token, chatId] as const;
      await queryClient.cancelQueries({ queryKey: messageKey });
      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(messageKey);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(messageKey, (current) =>
        removeMessageById(current, messageId)
      );
      clearChatPreviewOverride(chatId);
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      return {
        chatId,
        previousMessages,
      };
    },
    onError: (_error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", session.token, variables.chatId], context.previousMessages);
      }
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["messages", session.token, variables.chatId] });
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    },
  });

  const toggleMessageReactionMutation = useMutation({
    mutationFn: ({
      chatId,
      messageId,
      key,
    }: {
      chatId: string;
      messageId: string;
      key: MessageReaction["key"];
    }) => toggleMessageReactionRequest(session.token, chatId, messageId, key),
    onSuccess: (event) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, event.chatId],
        (current) => updateMessageReactionsPages(current, event)
      );
    },
  });

  const addContactMutation = useMutation({
    mutationFn: (user: UserProfile) => addContactRequest(session.token, user.username),
    onSuccess: (contact) => {
      queryClient.setQueryData<UserProfile[]>(["contacts", session.token], (current) => {
        const withoutDuplicate = current?.filter((item) => item.username !== contact.username) ?? [];
        return [contact, ...withoutDuplicate];
      });
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: (username: string) => removeContactRequest(session.token, username),
    onSuccess: (_result, username) => {
      queryClient.setQueryData<UserProfile[]>(["contacts", session.token], (current) =>
        current?.filter((item) => item.username !== username) ?? []
      );
    },
  });

  const requestError = [
    createChatMutation.error,
    createGroupMutation.error,
    createConferenceMutation.error,
    endConferenceMutation.error,
    addConferenceParticipantsMutation.error,
    addGroupParticipantsMutation.error,
    sendMessageMutation.error,
    signOutMutation.error,
    revokeSessionMutation.error,
    updateProfileMutation.error,
    avatarMutation.error,
    updateArchivedChatMutation.error,
    deleteChatMutation.error,
    deleteMessageMutation.error,
    toggleMessageReactionMutation.error,
    addContactMutation.error,
    removeContactMutation.error,
    chatsQuery.error,
    sessionsQuery.error,
    profileQuery.error,
    archivedChatsQuery.error,
    contactsQuery.error,
    conferencesQuery.error,
    archivedConferencesQuery.error,
    draftsQuery.error,
    userSearchQuery.error,
    contactsSearchQuery.error,
    messagesQuery.error,
  ].find(Boolean);

  useEffect(() => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionChange(null);
    }
  }, [onSessionChange, requestError]);

  const errorText =
    requestError instanceof ApiError
      ? [requestError.message, ...requestError.details].filter(Boolean).join(". ")
      : null;

  const loadOlderMessages = () => {
    if (!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) {
      return;
    }

    const container = messageStreamRef.current;
    pendingOlderScrollOffsetRef.current = container
      ? container.scrollHeight - container.scrollTop
      : 0;
    void messagesQuery.fetchNextPage();
  };

  const submitActiveDraft = () => {
    const trimmed = activeDraft.trim();
    if (!trimmed || !activeChat) {
      return;
    }

    stopTyping(activeChat.id);
    sendMessageMutation.mutate({
      chatId: activeChat.id,
      clientMessageId: `client-${window.crypto.randomUUID()}`,
      content: trimmed,
      participants: activeChat.members,
    });
  };

  const submitProfileDisplayName = () => {
    const nextDisplayName = profileDisplayName.trim();
    if (!nextDisplayName || nextDisplayName === profile.displayName) {
      return;
    }

    updateProfileMutation.mutate(nextDisplayName);
  };

  const submitCreateGroup = () => {
    const title = groupTitle.trim();
    if (!title || !groupParticipantUsernames.length) {
      return;
    }

    createGroupMutation.mutate({
      title,
      participantUsernames: groupParticipantUsernames,
    });
  };

  const submitCreateConference = () => {
    const parsedDate = new Date(conferenceScheduledAt);
    const scheduledAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const title = conferenceTitle.trim() || `Встреча ${formatClock(scheduledAt.toISOString())}`;
    createConferenceMutation.mutate({
      title,
      scheduledAt: scheduledAt.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
    });
  };

  const submitCreateConferenceNow = () => {
    const now = new Date();
    const title = conferenceTitle.trim() || `Встреча ${formatClock(now.toISOString())}`;
    createConferenceMutation.mutate({
      title,
      scheduledAt: now.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
    });
  };

  const submitAddConferenceParticipants = () => {
    if (!conferenceInviteUsernames.length || !activeConference || activeConferenceIsArchived) {
      return;
    }

    addConferenceParticipantsMutation.mutate(conferenceInviteUsernames);
  };

  const submitAddGroupParticipants = () => {
    if (!groupInviteUsernames.length || !activeChat || activeChat.direct) {
      return;
    }

    addGroupParticipantsMutation.mutate(groupInviteUsernames);
  };

  const openGroupMembersSheet = () => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openSidebarSheet("groupMembers");
  };

  const openConferenceMembersSheet = () => {
    if (!activeConference || !activeConferenceIsOwnedByCurrentUser || activeConferenceIsArchived) {
      return;
    }

    openSidebarSheet("conferenceMembers");
  };

  const handleMenuAction = (actionId: MenuActionId) => {
    switch (actionId) {
      case "conference":
        openConferenceSheet();
        return;
      case "archive":
        openSidebarSheet("archive");
        return;
      case "profile":
        openSidebarSheet("profile");
        return;
      case "group":
        openSidebarSheet("group");
        return;
      case "contacts":
        openSidebarSheet("contacts");
        return;
      case "sessions":
        openSidebarSheet("sessions");
        return;
      case "logout":
        setIsMenuOpen(false);
        signOutMutation.mutate();
        return;
      default:
        setIsMenuOpen(false);
    }
  };

  const showTopSearchResults = deferredSearch.trim().length > 0;
  const showContactSearchResults = deferredContactSearch.trim().length > 0;
  const tabChats = activeListTab === "dialogs" ? visibleDirectChats : visibleGroupChats;
  const tabChatsEmptyText =
    activeListTab === "dialogs"
      ? normalizedSearch
        ? "Ничего не найдено."
        : "Пока нет активных диалогов."
      : normalizedSearch
        ? "Ничего не найдено."
        : "Пока нет активных групп.";
  const chatListContent =
    activeListTab === "conferences" ? (
      conferencesLoading ? (
        <div className="empty-list">Загружаем видеоконференции...</div>
      ) : visibleConferences.length === 0 ? (
        <div className="empty-list">
          {normalizedSearch ? "Ничего не найдено." : "Пока нет запланированных видеоконференций."}
        </div>
      ) : (
        visibleConferences.map((conference) => {
          const participantPreview = formatConferenceListPreviewV3(
            conference,
            session.user.username
          );
          return (
            <button
              type="button"
              key={conference.id}
              className={
                conference.id === activeConference?.id
                  ? "chat-tile north-chat-tile is-active"
                  : "chat-tile north-chat-tile"
              }
              onClick={() => openConference(conference.id)}
            >
              <AvatarCircle className="avatar north-avatar" name={conference.title} badge="VC" />

              <div className="chat-copy">
                <div className="chat-line">
                  <div className="chat-title-wrap">
                    <span className="chat-type-mark is-conference">VC</span>
                    <strong>{conference.title}</strong>
                  </div>
                  <span>{formatConferenceTileTime(conference.scheduledAt)}</span>
                </div>

                <div className="chat-detail-line">
                  <span>{formatConferenceSchedule(conference.scheduledAt)}</span>
                  <span className="chat-detail-dot">|</span>
                  <span>{formatMemberCount(conference.participants.length)}</span>
                </div>

                <div className="chat-preview-line">
                  <p className="chat-preview-copy">
                    {trimPreview(
                      participantPreview || "Участники будут видны после приглашения.",
                      88
                    )}
                  </p>
                </div>
              </div>
            </button>
          );
        })
      )
    ) : chatsLoading ? (
      <div className="empty-list">
        {activeListTab === "dialogs" ? "Загружаем диалоги..." : "Загружаем группы..."}
      </div>
    ) : tabChats.length === 0 ? (
      <div className="empty-list">{tabChatsEmptyText}</div>
    ) : (
      tabChats.map((chat) => {
        const directParticipant = getDirectParticipant(chat, session.user);
        const unread = chat.unreadCount;
        const chatTypingParticipants = typingByChatId[chat.id] ?? [];
        const isChatTyping = chatTypingParticipants.length > 0;
        const draftPreview = draftsByChatId[chat.id]?.trim() ?? "";
        const preview = isChatTyping
          ? formatTypingParticipants(chatTypingParticipants)
          : draftPreview || chat.lastMessage || "Нет сообщений";
        const previewTimestamp = chat.lastMessageAt ?? chat.updatedAt;

        return (
          <button
            type="button"
            key={chat.id}
            className={
              chat.id === activeChat?.id
                ? "chat-tile north-chat-tile is-active"
                : unread > 0
                  ? "chat-tile north-chat-tile is-unread"
                  : "chat-tile north-chat-tile"
            }
            onClick={() => openChat(chat.id)}
            onContextMenu={(event) => openChatContextMenu(event, chat.id)}
          >
            <AvatarCircle
              className="avatar north-avatar"
              name={directParticipant?.displayName ?? chat.title}
              avatarUrl={directParticipant?.avatarUrl ?? null}
              badge={chat.direct ? undefined : "GR"}
              online={chat.direct ? directParticipant?.online : false}
            />

            <div className="chat-copy">
              <div className="chat-line">
                <div className="chat-title-wrap">
                  <span className={chat.direct ? "chat-type-mark is-direct" : "chat-type-mark is-group"}>
                    {chat.direct ? "@" : "GR"}
                  </span>
                  <strong>{chat.title}</strong>
                </div>
                <span>{formatChatTimestamp(previewTimestamp)}</span>
              </div>

              <div className="chat-detail-line">
                <span>{describeChat(chat, session.user)}</span>
                {!chat.direct ? <span className="chat-detail-dot">|</span> : null}
                {!chat.direct ? <span>{formatMemberCount(chat.members.length)}</span> : null}
              </div>

              <div className={isChatTyping ? "chat-preview-line is-typing" : "chat-preview-line"}>
                <p className={isChatTyping ? "chat-preview-copy is-typing" : "chat-preview-copy"}>
                  {draftPreview && !isChatTyping ? <span className="chat-draft">Черновик: </span> : null}
                  {trimPreview(preview, 88)}
                </p>
                {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
              </div>
            </div>
          </button>
        );
      })
    );
  const conferenceConversation = activeConference ? (
    <>
      <header className="conversation-header north-conversation-header conference-header">
        <div className="conversation-heading">
          <button
            type="button"
            className="ghost-button compact mobile-back"
            onClick={() => setMobilePane("sidebar")}
          >
            Назад
          </button>

          <div className="conversation-identity">
            <AvatarCircle
              className="avatar conversation-avatar north-avatar"
              name={activeConference.title}
              badge="VC"
            />
            <div className="conference-title-stack">
              <div className="conference-title-row">
                <h3>{activeConference.title}</h3>
                <button
                  ref={conferenceInfoButtonRef}
                  type="button"
                  className={
                    isConferenceInfoOpen
                      ? "ghost-button compact conference-info-button is-active"
                      : "ghost-button compact conference-info-button"
                  }
                  onClick={() => setIsConferenceInfoOpen((current) => !current)}
                  aria-expanded={isConferenceInfoOpen}
                  aria-haspopup="dialog"
                >
                  Инфо
                </button>
              </div>
              <p className="conversation-subtitle">{formatConferenceSchedule(activeConference.scheduledAt)}</p>
              {isConferenceInfoOpen ? (
                <div
                  ref={conferenceInfoPanelRef}
                  className="conference-summary"
                  role="dialog"
                  aria-label="Информация о конференции"
                >
                  <div className="conference-summary-grid">
                    <div className="conference-summary-item">
                      <span>Организатор</span>
                      <strong>{activeConferenceOrganizerLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Ваша роль</span>
                      <strong>{activeConferenceRoleLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Время</span>
                      <strong>{formatConferenceSchedule(activeConference.scheduledAt)}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Участники</span>
                      <strong>{formatMemberCount(activeConference.participants.length)}</strong>
                    </div>
                  </div>

                  <div className="conference-summary-rows">
                    <div className="conference-summary-row">
                      <span className="conference-summary-label">Доступ</span>
                      <span className="conference-summary-code">
                        Комната доступна только приглашённым участникам внутри приложения.
                      </span>
                    </div>

                    <div className="conference-summary-row participants">
                      <span className="conference-summary-label">Участники</span>
                      <div className="conference-participants">
                        {activeConference.participants.map((participant) => (
                          <span key={participant.id} className="member-pill">
                            {participant.displayName}
                            {participant.id === activeConference.createdBy.id ? " · орг." : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    {activeConferenceCanManageParticipants ? (
                      <div className="conference-summary-row">
                        <span className="conference-summary-label">Управление</span>
                        <button
                          type="button"
                          className="ghost-button compact"
                          onClick={openConferenceMembersSheet}
                        >
                          Добавить участников
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {activeConferenceCanJoin ||
        activeConferenceCanManageParticipants ||
        activeConferenceLocalRecordingActive ? (
          <div className="conversation-actions conference-actions">
            {activeConferenceCanManageParticipants ? (
              <button
                type="button"
                className="ghost-button compact"
                onClick={openConferenceMembersSheet}
              >
                Добавить участников
              </button>
            ) : null}
            {activeConferenceLocalRecordingActive ? (
              <span className="conference-recording-badge">Идет локальная запись</span>
            ) : null}
          </div>
        ) : null}

        <div className="conference-summary">
        <div className="conference-summary-grid">
          <div className="conference-summary-item">
            <span>Организатор</span>
            <strong>{activeConferenceOrganizerLabel}</strong>
          </div>
          <div className="conference-summary-item">
            <span>Ваша роль</span>
            <strong>{activeConferenceRoleLabel}</strong>
          </div>
          <div className="conference-summary-item">
            <span>Время</span>
            <strong>{formatConferenceSchedule(activeConference.scheduledAt)}</strong>
          </div>
          <div className="conference-summary-item">
            <span>Участники</span>
            <strong>{formatMemberCount(activeConference.participants.length)}</strong>
          </div>
        </div>

        <div className="conference-summary-rows">
          <div className="conference-summary-row">
            <span className="conference-summary-label">Доступ</span>
            <span className="conference-summary-code">
              Прямые ссылки и коды скрыты. Войти могут только приглашённые участники.
            </span>
          </div>

          <div className="conference-summary-row participants">
            <span className="conference-summary-label">Участники</span>
            <div className="conference-participants">
              {activeConference.participants.map((participant) => (
                <span key={participant.id} className="member-pill">
                  {participant.displayName}
                  {participant.id === activeConference.createdBy.id ? " · орг." : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        </div>
      </header>

      <div className="conference-shell">
        <div className="conference-meta-card">
          <div className="conference-meta-grid">
            <div className="conference-meta-line">
              <strong>Организатор</strong>
              <span>{activeConferenceOrganizerLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Р’Р°С€Р° СЂРѕР»СЊ</strong>
              <span>{activeConferenceRoleLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Время</strong>
              <span>{formatConferenceSchedule(activeConference.scheduledAt)}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Статус</strong>
              <span>{activeConferenceStatusLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Участники</strong>
              <div className="conference-participants">
                {activeConference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === activeConference.createdBy.id ? " · орг." : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="conference-meta-line">
              <strong>РљРѕРґ РєРѕРјРЅР°С‚С‹</strong>
              <div className="conference-link-row">
                <input
                  className="conference-link-input"
                  readOnly
                  value="Вход доступен только внутри приложения"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled
                >
                  РљРѕРїРёСЂРѕРІР°С‚СЊ
                </button>
              </div>
            </div>
            {activeConferenceShareUrl ? (
              <div className="conference-meta-line">
                <strong>Ссылка</strong>
                <div className="conference-link-row">
                  <input
                    className="conference-link-input"
                    readOnly
                    value={activeConferenceShareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => void navigator.clipboard.writeText(activeConferenceShareUrl)}
                  >
                    Копировать
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {activeConferenceCanJoin && activeConference.roomName ? (
          <div className="conference-stage">
            <ManagedConferenceStage
              key={`${activeConference.id}:${activeConference.roomName}:${activeConference.roomAccessCode}`}
              baseUrl={JITSI_BASE_URL}
              roomName={activeConference.roomName!}
              accessCode={activeConference.roomAccessCode!}
              displayName={profile.displayName}
              title={activeConference.title}
              onRecordingStateChange={setConferenceRecordingState}
              onConferenceExit={handleConferenceStageExit}
            />
          </div>
        ) : (
          <div className="conference-placeholder">
            <span>{activeConferenceStageHint}</span>
          </div>
        )}
      </div>
    </>
  ) : null;
  const workspaceStyle: CSSProperties = {
    ["--north-sidebar-width" as string]: `${sidebarWidth}px`,
  };
  const contextMenuStyle: CSSProperties | undefined = contextMenu
    ? {
        left: `${Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.x, window.innerWidth - CONTEXT_MENU_WIDTH_PX - CONTEXT_MENU_GUTTER_PX)
        )}px`,
        top: `${Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.y, window.innerHeight - 64 - CONTEXT_MENU_GUTTER_PX)
        )}px`,
      }
    : undefined;

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
            {sidebarSheet === "conference" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Видеоконференции</div>
                    <p className="sheet-copy">
                      Запусти встречу сразу или запланируй ее на удобное время.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => {
                      resetConferenceComposer();
                      setSidebarSheet(null);
                    }}
                  >
                    Закрыть
                  </button>
                </div>

                <div className="conference-browser-actions">
                  <button
                    type="button"
                    className={
                      conferenceComposerMode === "instant"
                        ? "ghost-button compact is-active"
                        : "ghost-button compact"
                    }
                    onClick={() => openConferenceComposer("instant")}
                  >
                    Начать сейчас
                  </button>
                  <button
                    type="button"
                    className={
                      conferenceComposerMode === "scheduled"
                        ? "ghost-button compact is-active"
                        : "ghost-button compact"
                    }
                    onClick={() => openConferenceComposer("scheduled")}
                  >
                    Запланировать
                  </button>
                </div>

                {conferenceComposerMode ? (
                  <form
                    className="conference-browser-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (conferenceComposerMode === "instant") {
                        submitCreateConferenceNow();
                        return;
                      }
                      submitCreateConference();
                    }}
                  >
                    <input
                      value={conferenceTitle}
                      onChange={(event) => setConferenceTitle(event.target.value)}
                      placeholder="Название встречи или оставь пустым"
                      maxLength={120}
                    />

                    {conferenceComposerMode === "scheduled" ? (
                      <input
                        type="datetime-local"
                        value={conferenceScheduledAt}
                        min={createMinimumConferenceDateTime()}
                        onChange={(event) => setConferenceScheduledAt(event.target.value)}
                      />
                    ) : null}

                    <div className="group-picker-list conference-picker-list">
                      {contactsLoading && conferenceCandidates.length === 0 ? (
                        <div className="empty-list">Загружаем контакты...</div>
                      ) : conferenceCandidates.length === 0 ? (
                        <div className="empty-list">
                          Пока некого добавлять. Создайте группу или добавьте контакты.
                        </div>
                      ) : (
                        conferenceCandidates.map((contact) => {
                          const selected = conferenceParticipantUsernames.includes(contact.username);
                          return (
                            <button
                              type="button"
                              key={contact.username}
                              className={
                                selected
                                  ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                                  : "sheet-row sheet-row-with-avatar group-picker-row"
                              }
                              onClick={() => toggleConferenceParticipant(contact.username)}
                            >
                              <AvatarCircle
                                className="menu-row-avatar sheet-contact-avatar"
                                name={contact.displayName}
                                avatarUrl={contact.avatarUrl}
                                online={contact.online}
                              />
                              <div className="sheet-row-copy">
                                <strong>{contact.displayName}</strong>
                                <span>@{contact.username}</span>
                              </div>
                              <span className="member-pill">
                                {selected ? "Выбран" : "Выбрать"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="conference-browser-actions">
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => {
                          resetConferenceComposer();
                          setSidebarSheet(null);
                        }}
                      >
                        Закрыть
                      </button>
                      <button
                        type="submit"
                        className="secondary-button"
                        disabled={createConferenceMutation.isPending}
                      >
                        {createConferenceMutation.isPending
                          ? "Создаем..."
                          : conferenceComposerMode === "instant"
                            ? "Создать сейчас"
                            : "Запланировать"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}

            {sidebarSheet === "archive" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Архив</div>
                    <p className="sheet-copy">Здесь лежат архивированные чаты и группы.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <div className="sheet-list">
                  {archivedChatsLoading ? (
                    <div className="empty-list">Загружаем архив...</div>
                  ) : archivedChats.length === 0 ? (
                    <div className="empty-list">Архив пока пуст.</div>
                  ) : (
                    <>
                      {archivedChats.length > 0 ? <div className="section-title">Чаты</div> : null}
                      {archivedChats.map((chat) => (
                      <div
                        key={chat.id}
                        className="sheet-row"
                        onContextMenu={(event) => openChatContextMenu(event, chat.id)}
                      >
                        <div className="sheet-row-copy">
                          <strong>{chat.title}</strong>
                          <span>
                            {chat.direct
                              ? describeChat(chat, session.user)
                              : formatMemberCount(chat.members.length)}
                          </span>
                        </div>
                        <div className="sheet-row-actions">
                          <button
                            type="button"
                            className="ghost-button compact"
                            onClick={() => openChat(chat.id)}
                          >
                            Открыть
                          </button>
                          <button
                            type="button"
                            className="ghost-button compact"
                            onClick={() => toggleArchiveChat(chat.id)}
                          >
                            Вернуть
                          </button>
                        </div>
                      </div>
                    ))}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {sidebarSheet === "profile" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Мой профиль</div>
                    <p className="sheet-copy">Информация о текущем аккаунте.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <div className="sheet-list profile-sheet">
                  <div className="profile-avatar-card">
                    <AvatarCircle
                      className="menu-profile-avatar profile-sheet-avatar"
                      name={profile.displayName}
                      avatarUrl={profile.avatarUrl}
                      online={profile.online}
                    />
                    <div className="profile-avatar-copy">
                      <strong>{profile.displayName}</strong>
                      <span>@{profile.username}</span>
                    </div>
                    <p className="profile-avatar-hint">
                      Вставь изображение из буфера обмена через Ctrl+V, когда открыт профиль.
                    </p>
                    <div className="profile-avatar-actions">
                      {profile.avatarUrl ? (
                        <button
                          type="button"
                          className="ghost-button compact"
                          disabled={avatarMutation.isPending}
                          onClick={() => avatarMutation.mutate(null)}
                        >
                          Убрать фото
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <form
                    className="profile-line profile-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitProfileDisplayName();
                    }}
                  >
                    <span className="profile-label">Имя</span>
                    <input
                      value={profileDisplayName}
                      onChange={(event) => setProfileDisplayName(event.target.value)}
                      placeholder="Новое имя"
                      maxLength={40}
                    />
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={
                        updateProfileMutation.isPending ||
                        profileDisplayName.trim().length < 2 ||
                        profileDisplayName.trim() === profile.displayName
                      }
                    >
                      {updateProfileMutation.isPending ? "Сохраняем..." : "Сохранить имя"}
                    </button>
                  </form>
                  <div className="profile-line">
                    <span className="profile-label">Username</span>
                    <strong>@{profile.username}</strong>
                  </div>
                  <div className="profile-line">
                    <span className="profile-label">ID аккаунта</span>
                    <span>{profile.id}</span>
                  </div>
                  <div className="profile-line">
                    <span className="profile-label">Создан</span>
                    <span>{formatProfileDate(profile.createdAt)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {sidebarSheet === "group" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Группы</div>
                    <p className="sheet-copy">Создайте новую группу и сразу выберите участников.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <form
                  className="sheet-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitCreateGroup();
                  }}
                >
                  <input
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    placeholder="Название группы"
                  />
                  <div className="group-picker-list">
                    {contactsLoading ? (
                      <div className="empty-list">Загружаем контакты...</div>
                    ) : groupContacts.length === 0 ? (
                      <div className="empty-list">Добавь сначала контакты, чтобы собрать группу.</div>
                    ) : (
                      groupContacts.map((contact) => {
                        const selected = groupParticipantUsernames.includes(contact.username);
                        return (
                          <button
                            type="button"
                            key={contact.username}
                            className={
                              selected
                                ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                                : "sheet-row sheet-row-with-avatar group-picker-row"
                            }
                            onClick={() => toggleGroupParticipant(contact.username)}
                          >
                            <AvatarCircle
                              className="menu-row-avatar sheet-contact-avatar"
                              name={contact.displayName}
                              avatarUrl={contact.avatarUrl}
                              online={contact.online}
                            />
                            <div className="sheet-row-copy">
                              <strong>{contact.displayName}</strong>
                              <span>@{contact.username}</span>
                            </div>
                            <span className="member-pill">
                              {selected ? "Выбран" : "Выбрать"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={
                      createGroupMutation.isPending || !groupTitle.trim() || !groupParticipantUsernames.length
                    }
                  >
                    {createGroupMutation.isPending ? "Создаем..." : "Создать"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "groupMembers" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Добавить в группу</div>
                    <p className="sheet-copy">Выбери людей из контактов для {activeChat?.title ?? "группы"}.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <form
                  className="sheet-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitAddGroupParticipants();
                  }}
                >
                  <div className="group-picker-list">
                    {availableGroupInviteContacts.length === 0 ? (
                      <div className="empty-list">Все контакты уже в этой группе или список пуст.</div>
                    ) : (
                      availableGroupInviteContacts.map((contact) => {
                        const selected = groupInviteUsernames.includes(contact.username);
                        return (
                          <button
                            type="button"
                            key={contact.username}
                            className={
                              selected
                                ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                                : "sheet-row sheet-row-with-avatar group-picker-row"
                            }
                            onClick={() => toggleGroupInviteParticipant(contact.username)}
                          >
                            <AvatarCircle
                              className="menu-row-avatar sheet-contact-avatar"
                              name={contact.displayName}
                              avatarUrl={contact.avatarUrl}
                              online={contact.online}
                            />
                            <div className="sheet-row-copy">
                              <strong>{contact.displayName}</strong>
                              <span>@{contact.username}</span>
                            </div>
                            <span className="member-pill">
                              {selected ? "Выбран" : "Выбрать"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={addGroupParticipantsMutation.isPending || !groupInviteUsernames.length}
                  >
                    {addGroupParticipantsMutation.isPending ? "Добавляем..." : "Добавить в группу"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "conferenceMembers" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Добавить в конференцию</div>
                    <p className="sheet-copy">
                      Выбери людей из контактов для {activeConference?.title ?? "встречи"}.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <form
                  className="sheet-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitAddConferenceParticipants();
                  }}
                >
                  <div className="group-picker-list">
                    {availableConferenceInviteContacts.length === 0 ? (
                      <div className="empty-list">
                        Все контакты уже приглашены в конференцию или список пуст.
                      </div>
                    ) : (
                      availableConferenceInviteContacts.map((contact) => {
                        const selected = conferenceInviteUsernames.includes(contact.username);
                        return (
                          <button
                            type="button"
                            key={contact.username}
                            className={
                              selected
                                ? "sheet-row sheet-row-with-avatar group-picker-row is-selected"
                                : "sheet-row sheet-row-with-avatar group-picker-row"
                            }
                            onClick={() => toggleConferenceInviteParticipant(contact.username)}
                          >
                            <AvatarCircle
                              className="menu-row-avatar sheet-contact-avatar"
                              name={contact.displayName}
                              avatarUrl={contact.avatarUrl}
                              online={contact.online}
                            />
                            <div className="sheet-row-copy">
                              <strong>{contact.displayName}</strong>
                              <span>@{contact.username}</span>
                            </div>
                            <span className="member-pill">
                              {selected ? "Выбран" : "Выбрать"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={
                      addConferenceParticipantsMutation.isPending || !conferenceInviteUsernames.length
                    }
                  >
                    {addConferenceParticipantsMutation.isPending
                      ? "Добавляем..."
                      : "Добавить в конференцию"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "contacts" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Контакты</div>
                    <p className="sheet-copy">Добавляй контакты и открывай с ними личные чаты.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <div className="sheet-form contact-search-form">
                  <div className="contact-search-shell">
                  <input
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    placeholder="Username или display name"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />

                  {showContactSearchResults ? (
                    <div className="search-dropdown contact-search-dropdown">
                      {contactsSearchQuery.isFetching ? (
                        <div className="search-result-empty">Ищем пользователей...</div>
                      ) : contactSearchResults.length === 0 ? (
                        <div className="search-result-empty">Пользователи не найдены.</div>
                      ) : (
                        contactSearchResults.map((user) => (
                          <div key={user.id} className="search-result-row with-action">
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
                            <button
                              type="button"
                              className="ghost-button compact"
                              onClick={() => addContact(user)}
                            >
                              Добавить
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                  </div>
                </div>

                <div className="sheet-list">
                  {contactsLoading ? (
                    <div className="empty-list">Загружаем контакты...</div>
                  ) : contacts.length === 0 ? (
                    <div className="empty-list">Контактов пока нет.</div>
                  ) : (
                    contacts.map((contact) => (
                      <div key={contact.username} className="sheet-row sheet-row-with-avatar">
                        <AvatarCircle
                          className="menu-row-avatar sheet-contact-avatar"
                          name={contact.displayName}
                          avatarUrl={contact.avatarUrl}
                          online={contact.online}
                        />
                        <div className="sheet-row-copy">
                          <strong>{contact.displayName}</strong>
                          <span>@{contact.username}</span>
                        </div>
                        <div className="sheet-row-actions">
                          <button
                            type="button"
                            className="ghost-button compact"
                            disabled={createChatMutation.isPending}
                            onClick={() => createChatMutation.mutate(contact.username)}
                          >
                            Чат
                          </button>
                          <button
                            type="button"
                            className="ghost-button compact"
                            onClick={() => removeContact(contact.username)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {sidebarSheet === "sessions" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Активные устройства</div>
                    <p className="sheet-copy">Сессии и устройство, с которого выполнен вход.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Закрыть
                  </button>
                </div>

                <div className="session-list menu-session-list">
                  {sessionsLoading ? (
                    <div className="empty-list">Загружаем список устройств...</div>
                  ) : sessions.length === 0 ? (
                    <div className="empty-list">Активна только текущая сессия.</div>
                  ) : (
                    sessions.map((item) => {
                      const current = item.id === session.sessionId;
                      return (
                        <div key={item.id} className="session-row">
                          <div className="session-copy">
                            <strong>{item.deviceName}</strong>
                            <span>Последняя активность: {formatSessionTime(item.lastUsedAt)}</span>
                            <span>Истекает: {formatSessionTime(item.expiresAt)}</span>
                          </div>
                          {current ? (
                            <span className="member-pill">Текущее</span>
                          ) : (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={revokeSessionMutation.isPending}
                              onClick={() => revokeSessionMutation.mutate(item.id)}
                            >
                              Отключить
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!sidebarSheet ? <div className="chat-list north-chat-list">{chatListContent}</div> : null}

        {isMenuOpen ? (
          <div className="sidebar-menu-overlay" ref={menuPanelRef}>
            <div className="sidebar-menu-profile">
              <AvatarCircle
                className="menu-profile-avatar"
                name={profile.displayName}
                avatarUrl={profile.avatarUrl}
                online={profile.online}
              />
              <div className="menu-profile-copy">
                <strong>{profile.displayName}</strong>
              </div>
              <button
                type="button"
                className="sidebar-menu-collapse"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Скрыть меню"
              >
                ^
              </button>
            </div>

            <div className="menu-section menu-account-list">
              <button
                type="button"
                className="menu-row account-row is-current"
                onClick={() => setIsMenuOpen(false)}
              >
                <AvatarCircle
                  className="menu-row-avatar"
                  name={profile.displayName}
                  avatarUrl={profile.avatarUrl}
                  online={profile.online}
                />
                <div className="menu-row-copy">
                  <strong>{profile.displayName}</strong>
                  <span>@{profile.username}</span>
                </div>
              </button>
            </div>

            <div className="menu-section menu-item-list">
              {MENU_ACTIONS.map(({ id, label, symbol, badge }) => (
                <button
                  type="button"
                  key={id}
                  className="menu-row"
                  onClick={() => handleMenuAction(id)}
                >
                  <span className="menu-row-icon">{symbol}</span>
                  <span className="menu-row-label">
                    {id === "logout" && signOutMutation.isPending ? "Выход..." : label}
                  </span>
                  {badge ? <span className="menu-badge-new">{badge}</span> : null}
                </button>
              ))}
            </div>
          </div>
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
          conferenceConversation
        ) : activeChat ? (
          <>
            <header className="conversation-header north-conversation-header">
              <div className="conversation-heading">
                <button
                  type="button"
                  className="ghost-button compact mobile-back"
                  onClick={() => setMobilePane("sidebar")}
                >
                  Чаты
                </button>

                <div className="conversation-identity">
                  <AvatarCircle
                    className="avatar conversation-avatar north-avatar"
                    name={activeDirectParticipant?.displayName ?? activeChat.title}
                    avatarUrl={activeDirectParticipant?.avatarUrl ?? null}
                    badge={activeChat.direct ? undefined : "GR"}
                    online={activeChat.direct ? activeDirectParticipant?.online : false}
                  />
                  <div>
                    <h3>{activeChat.title}</h3>
                    <p className={showTypingIndicator ? "conversation-subtitle is-typing" : "conversation-subtitle"}>
                      {conversationSubtitle}
                    </p>
                  </div>
                </div>
                {!activeChat.direct ? (
                  <div className="member-strip">
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => openGroupConferenceComposer("instant")}
                    >
                      Созвон
                    </button>
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={() => openGroupConferenceComposer("scheduled")}
                    >
                      Запланировать
                    </button>
                    <button
                      type="button"
                      className="ghost-button compact"
                      onClick={openGroupMembersSheet}
                    >
                      Добавить людей
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="conversation-actions">
                {activeChat.direct && activeDirectParticipant ? (
                  <button
                    type="button"
                    className="ghost-button compact archive-toggle-button"
                    onClick={addActiveChatToContacts}
                    disabled={activeDirectInContacts}
                  >
                    {activeDirectInContacts ? "В контактах" : "В контакты"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-button compact archive-toggle-button"
                  onClick={() => toggleArchiveChat(activeChat.id)}
                >
                  {archivedChatIdSet.has(activeChat.id) ? "Вернуть" : "В архив"}
                </button>
                <button
                  type="button"
                  className="ghost-button compact archive-toggle-button close-chat-button"
                  onClick={closeActiveChat}
                >
                  Закрыть
                </button>
              </div>
            </header>

            <div className="message-stream north-message-stream" ref={messageStreamRef}>
              {messagesQuery.hasNextPage ? (
                <button
                  type="button"
                  className="ghost-button history-button"
                  onClick={loadOlderMessages}
                  disabled={messagesQuery.isFetchingNextPage}
                >
                  {messagesQuery.isFetchingNextPage ? "Загружаем..." : "Показать более ранние"}
                </button>
              ) : null}

              {messagesLoading ? (
                <div className="empty-state">Загружаем сообщения...</div>
              ) : timelineItems.length === 0 ? (
                <div className="empty-state">Начните переписку. Сообщения придут сюда.</div>
              ) : (
                timelineItems.map((item) =>
                  item.type === "day" ? (
                    <div key={item.key} className="timeline-day">
                      <span>{item.label}</span>
                    </div>
                  ) : (
                    <article
                      key={item.key}
                      className={
                        isOwnMessage(item.message, session.user)
                          ? "message-bubble is-mine"
                          : "message-bubble"
                      }
                      onContextMenu={(event) =>
                        openMessageContextMenu(event, item.message.chatId, item.message.id)
                      }
                    >
                      <div className="message-meta">
                        <strong>
                          {isOwnMessage(item.message, session.user)
                            ? "Вы"
                            : item.message.sender.displayName}
                        </strong>
                        <div className="message-meta-trailing">
                          <span>{formatClock(item.message.createdAt)}</span>
                          {isOwnMessage(item.message, session.user) ? (
                            <span
                              className={getMessageStatusClassName(item.message.status)}
                              title={getMessageStatusLabel(item.message.status)}
                              aria-label={getMessageStatusLabel(item.message.status)}
                            >
                              {getMessageStatusGlyph(item.message.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p>{item.message.content}</p>
                      <div className="message-reactions" aria-label="Реакции на сообщение">
                        {MESSAGE_REACTION_OPTIONS.map((reactionOption) => {
                          const reaction = getMessageReaction(item.message, reactionOption.key);
                          const canReact = item.message.id !== item.message.clientMessageId;
                          return (
                            <button
                              type="button"
                              key={reactionOption.key}
                              className={
                                reaction?.reactedByCurrentUser
                                  ? "message-reaction-button is-active"
                                  : "message-reaction-button"
                              }
                              onClick={() =>
                                toggleReactionForMessage(
                                  item.message.chatId,
                                  item.message.id,
                                  reactionOption.key
                                )
                              }
                              disabled={!canReact}
                              title={reactionOption.label}
                              aria-label={reactionOption.label}
                            >
                              <span>{reactionOption.emoji}</span>
                              {reaction ? (
                                <span className="message-reaction-count">{reaction.count}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  )
                )
              )}

              {showTypingIndicator ? (
                <div className="typing-indicator" aria-live="polite">
                  <div className="typing-indicator-bubble" aria-hidden="true">
                    <span className="typing-indicator-dot" />
                    <span className="typing-indicator-dot" />
                    <span className="typing-indicator-dot" />
                  </div>
                  <span className="typing-indicator-copy">{conversationSubtitle}</span>
                </div>
              ) : null}
            </div>

            <form
              className="composer north-composer"
              onSubmit={(event) => {
                event.preventDefault();
                submitActiveDraft();
              }}
            >
              <textarea
                ref={composerTextareaRef}
                value={activeDraft}
                onChange={(event) => handleComposerChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitActiveDraft();
                  }
                }}
                placeholder="Напишите сообщение"
                rows={1}
              />
              <button
                type="submit"
                className="primary-button north-send-button"
                disabled={!activeDraft.trim()}
              >
                &gt;
              </button>
            </form>
          </>
        ) : chatsLoading || conferencesLoading ? (
          <div className="empty-state large north-empty-state">Загружаем данные...</div>
        ) : (
          <div className="conversation-empty">
            <div className="conversation-empty-badge">
              {activeListTab === "conferences"
                ? "Выберите видеоконференцию слева"
                : "Выберите, кому хотели бы написать"}
            </div>
          </div>
        )}

      {errorText ? <div className="floating-error">{errorText}</div> : null}
      </section>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="context-menu-shell"
          style={contextMenuStyle}
        >
          {contextMenu.kind === "message" && contextMenuMessage ? (
            <div className="context-menu-reaction-bar" aria-label="Реакции на сообщение">
              {MESSAGE_REACTION_OPTIONS.map((reactionOption) => {
                const reaction = getMessageReaction(contextMenuMessage, reactionOption.key);
                return (
                  <button
                    key={reactionOption.key}
                    type="button"
                    className={
                      reaction?.reactedByCurrentUser
                        ? "context-menu-reaction-button is-active"
                        : "context-menu-reaction-button"
                    }
                    onClick={() =>
                      toggleReactionFromContextMenu(
                        contextMenu.chatId,
                        contextMenu.messageId,
                        reactionOption.key
                      )
                    }
                    disabled={!canReactContextMenuMessage}
                    title={reactionOption.label}
                    aria-label={reactionOption.label}
                  >
                    {reactionOption.emoji}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            className="context-menu-surface"
            role="menu"
            aria-label={contextMenu.kind === "chat" ? "Chat actions" : "Message actions"}
          >
          {contextMenu.kind === "message" && contextMenuMessage ? (
            <>
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => replyToMessage(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">↩</span>
                <span className="context-menu-item-label">Ответить</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                role="menuitem"
                onClick={() => copyMessageText(contextMenuMessage)}
              >
                <span className="context-menu-item-icon">⧉</span>
                <span className="context-menu-item-label">Копировать текст</span>
              </button>
            </>
          ) : null}
          {contextMenu.kind === "chat" ? (
            <button
              type="button"
              className="context-menu-item is-danger"
              role="menuitem"
              onClick={() => deleteChatForSelf(contextMenu.chatId)}
            >
              Удалить чат только у меня
            </button>
          ) : canDeleteContextMenuMessage ? (
            <button
              type="button"
              className="context-menu-item is-danger"
              role="menuitem"
              onClick={() => deleteMessageForEveryone(contextMenu.chatId, contextMenu.messageId)}
            >
              Удалить сообщение для всех
            </button>
          ) : (
            <div className="context-menu-item is-disabled" role="presentation">
              Удалять для всех можно только свои сообщения
            </div>
          )}
        </div>
        </div>
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

type AvatarCircleProps = {
  className: string;
  name: string;
  avatarUrl?: string | null;
  badge?: string;
  online?: boolean;
};

function AvatarCircle({ className, name, avatarUrl = null, badge, online = false }: AvatarCircleProps) {
  return (
    <div className={`${className} ${avatarUrl ? "has-image" : avatarTone(name)}`}>
      {avatarUrl ? <img src={avatarUrl} alt={name} /> : initials(name)}
      {badge ? <span className="avatar-badge">{badge}</span> : null}
      {online ? <span className="avatar-presence" /> : null}
    </div>
  );
}

function getDirectParticipant(chat: ChatSummary, currentUser: UserProfile) {
  if (!chat.direct) {
    return null;
  }

  return chat.members.find((member) => !isCurrentUserParticipant(member, currentUser)) ?? null;
}

function buildTimeline(messages: ChatMessage[]): TimelineItem[] {
  if (!messages.length) {
    return [];
  }

  const items: TimelineItem[] = [];
  let previousLabel = "";
  messages.forEach((message) => {
    const label = formatTimelineDay(message.createdAt);
    if (label !== previousLabel) {
      items.push({
        type: "day",
        key: `day-${message.id}`,
        label,
      });
      previousLabel = label;
    }

    items.push({
      type: "message",
      key: message.id,
      message,
    });
  });

  return items;
}

function describeChat(chat: ChatSummary, currentUser: UserProfile) {
  if (chat.direct) {
    const otherParticipant = chat.members.find(
      (member) => !isCurrentUserParticipant(member, currentUser),
    );
    return otherParticipant ? `@${otherParticipant.username}` : "Личный чат";
  }

  return "Группа";
}

function formatMemberCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} участник`;
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} участника`;
  }

  return `${count} участников`;
}

function formatChatTimestamp(value: string) {
  const target = new Date(value);
  const now = new Date();
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  if (sameDay) {
    return formatClock(value);
  }

  const withinWeek = now.getTime() - target.getTime() < 6 * 24 * 60 * 60 * 1000;
  if (withinWeek) {
    return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(target);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(target);
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatProfileDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimelineDay(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return "Сегодня";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function trimPreview(content: string, maxLength: number) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength - 3)}...`;
}

function formatToastPreview(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }

  return `${trimmed.slice(0, 117)}...`;
}

function upsertDrafts(current: ChatDraft[] | undefined, chatId: string, content: string) {
  const withoutCurrent = (current ?? []).filter((draft) => draft.chatId !== chatId);
  if (!content.trim()) {
    return withoutCurrent;
  }

  return [
    {
      chatId,
      content,
      updatedAt: new Date().toISOString(),
    },
    ...withoutCurrent,
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertVideoConferences(
  current: VideoConference[] | undefined,
  conference: VideoConference
) {
  const withoutCurrent = (current ?? []).filter((item) => item.id !== conference.id);
  return [...withoutCurrent, conference].sort((left, right) =>
    left.scheduledAt.localeCompare(right.scheduledAt)
  );
}

function mergeVideoConferenceCollections(
  current: VideoConference[] | undefined,
  incoming: VideoConference[] | undefined
) {
  return (incoming ?? []).reduce(
    (next, conference) => upsertVideoConferences(next, conference),
    current ?? []
  );
}

function removeVideoConference(current: VideoConference[] | undefined, conferenceId: string) {
  return (current ?? []).filter((item) => item.id !== conferenceId);
}

function mergeConferenceCandidates(
  contacts: Array<Participant | UserProfile>,
  groupMembers: Participant[],
  currentUsername: string
) {
  const candidates = new Map<string, Participant | UserProfile>();

  contacts.forEach((contact) => {
    if (contact.username !== currentUsername) {
      candidates.set(contact.username, contact);
    }
  });

  groupMembers.forEach((member) => {
    if (member.username === currentUsername) {
      return;
    }

    if (candidates.has(member.username)) {
      return;
    }

    candidates.set(member.username, member);
  });

  return [...candidates.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "ru-RU")
  );
}

function getConferenceActivationTime(value: string) {
  return new Date(new Date(value).getTime() - CONFERENCE_ACTIVATION_LEAD_MS);
}

function formatConferenceStatusLabelV2(conference: VideoConference) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Завершена ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "Встреча идет";
  }

  if (conference.roomName || conference.activatedAt) {
    return scheduledTime <= now ? "Запускается автоматически" : "Ожидает автоматического старта";
  }

  return `Откроется ${formatConferenceSchedule(getConferenceActivationTime(conference.scheduledAt).toISOString())}`;
}

function formatConferenceListPreviewV2(conference: VideoConference, currentUsername: string) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return "Встреча завершена.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `Комната откроется ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString()
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "Встреча запускается автоматически."
      : `Подключение откроется автоматически ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "Встреча уже идет.";
}

function formatConferenceStageHint(conference: VideoConference, isOrganizer: boolean) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Встреча завершена ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "Встреча уже запущена.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "Встреча запускается автоматически. Подключение появится через несколько секунд.";
    }

    return isOrganizer
      ? `Комната подготовлена. Встреча откроется автоматически ${formatConferenceSchedule(
          conference.scheduledAt
        )}.`
      : `Подключение откроется автоматически ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString()
  );
  return `Комната станет доступна за 5 минут до старта: ${activationAt}.`;
}

function formatConferenceStatusLabelV3(conference: VideoConference) {
  if (conference.endedAt) {
    return `Завершена ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "Встреча идет";
  }

  if (conference.roomName || conference.activatedAt) {
    return "Комната открыта для приглашенных";
  }

  return `Откроется ${formatConferenceSchedule(getConferenceActivationTime(conference.scheduledAt).toISOString())}`;
}

function formatConferenceListPreviewV3(conference: VideoConference, currentUsername: string) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return "Встреча завершена.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `Комната откроется ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString()
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "Комната уже открыта для приглашенных."
      : `Подключение откроется автоматически ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "Встреча уже идет.";
}

function formatConferenceStageHintV3(conference: VideoConference, isOrganizer: boolean) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Встреча завершена ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "Встреча уже запущена.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "Комната уже открыта. Войти могут только приглашённые участники.";
    }

    return isOrganizer
      ? `Комната подготовлена. Вход для приглашённых откроется автоматически ${formatConferenceSchedule(
          conference.scheduledAt
        )}.`
      : `Подключение откроется автоматически ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString()
  );
  return `Комната станет доступна за 5 минут до старта: ${activationAt}.`;
}

function formatConferenceSchedule(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConferenceTileTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return formatClock(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function createInitialConferenceDateTime() {
  return formatDateTimeInputValue(new Date(Date.now() + 30 * 60 * 1000));
}

function createMinimumConferenceDateTime() {
  return formatDateTimeInputValue(new Date());
}

function formatDateTimeInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatConferenceOrganizerLabel(organizer: Participant, currentUser: UserProfile) {
  return organizer.id === currentUser.id ? `${organizer.displayName} (вы)` : organizer.displayName;
}

function describeConferenceRole(isOrganizer: boolean) {
  if (isOrganizer) {
    return "Организатор";
  }

  return "Участник";
}

function readStoredSidebarWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const rawValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsedWidth = rawValue ? Number(rawValue) : NaN;
  if (!Number.isFinite(parsedWidth)) {
    return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, window.innerWidth);
  }

  return clampSidebarWidth(parsedWidth, window.innerWidth);
}

function clampSidebarWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - 420));
  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function mergeTypingParticipants(primary: Participant[], fallback: Participant[]) {
  const merged = new Map<string, Participant>();
  primary.forEach((participant) => merged.set(participant.id, participant));
  fallback.forEach((participant) => {
    if (!merged.has(participant.id)) {
      merged.set(participant.id, participant);
    }
  });
  return [...merged.values()];
}

function syncChatTypingParticipants(
  current: Record<string, Participant[]>,
  chatId: string,
  participants: Participant[]
) {
  const nextParticipants = participants.filter(
    (participant, index, list) => list.findIndex((item) => item.id === participant.id) === index
  );
  const existingParticipants = current[chatId] ?? [];
  const isSame =
    existingParticipants.length === nextParticipants.length &&
    existingParticipants.every((participant, index) => participant.id === nextParticipants[index]?.id);

  if (isSame) {
    return current;
  }

  if (!nextParticipants.length) {
    if (!existingParticipants.length) {
      return current;
    }

    const { [chatId]: _removed, ...rest } = current;
    return rest;
  }

  return {
    ...current,
    [chatId]: nextParticipants,
  };
}

function createOptimisticOutgoingMessage(
  currentUser: UserProfile,
  input: SendMessageInput
): ChatMessage {
  return {
    id: input.clientMessageId,
    chatId: input.chatId,
    sender: currentUser,
    content: input.content,
    createdAt: new Date().toISOString(),
    clientMessageId: input.clientMessageId,
    reactions: [],
    status: {
      state: "SENDING",
      recipientCount: Math.max(0, input.participants.length - 1),
      deliveredCount: 0,
      readCount: 0,
    },
  };
}

function ensureOwnMessageStatus(message: ChatMessage, currentUser: UserProfile): ChatMessage {
  if (!isOwnMessage(message, currentUser) || message.status !== null) {
    return message;
  }

  return {
    ...message,
    status: {
      state: "SENT",
      recipientCount: 0,
      deliveredCount: 0,
      readCount: 0,
    },
  };
}

function getMessageReaction(message: ChatMessage, key: MessageReaction["key"]) {
  return message.reactions.find((reaction) => reaction.key === key) ?? null;
}

function buildReplyDraftPrefix(message: ChatMessage) {
  const collapsedText = message.content.trim().replace(/\s+/g, " ");
  const preview = collapsedText.length > 96 ? `${collapsedText.slice(0, 93)}...` : collapsedText;
  return `↪ ${message.sender.displayName}: ${preview}`;
}

function isOwnMessage(message: ChatMessage, currentUser: UserProfile) {
  return message.sender.username === currentUser.username;
}

function isCurrentUserParticipant(participant: Participant, currentUser: UserProfile) {
  return participant.username === currentUser.username;
}

function getMessageStatusClassName(status: MessageStatus | null) {
  switch (status?.state) {
    case "SENDING":
    case "SENT":
      return "message-status is-sent";
    case "READ":
      return "message-status is-read";
    case "DELIVERED":
      return "message-status is-delivered";
    default:
      return "message-status is-sent";
  }
}

function getMessageStatusGlyph(status: MessageStatus | null) {
  switch (status?.state) {
    case "SENDING":
      return "\u2026";
    case "READ":
    case "DELIVERED":
      return "\u2713\u2713";
    case "SENT":
    default:
      return "\u2713";
  }
}

function getMessageStatusLabel(status: MessageStatus | null) {
  switch (status?.state) {
    case "SENDING":
      return "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F";
    case "READ":
      return "Прочитано";
    case "DELIVERED":
      return "Доставлено";
    case "SENT":
    default:
      return "Отправлено";
  }
}

function avatarTone(seed: string) {
  const tones = ["tone-blue", "tone-violet", "tone-green", "tone-orange", "tone-rose"];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read avatar"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read avatar"));
    reader.readAsDataURL(file);
  });
}

function extractImageFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return null;
  }

  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }

  return null;
}

function toggleUsernameSelection(usernames: string[], username: string) {
  return usernames.includes(username)
    ? usernames.filter((item) => item !== username)
    : [...usernames, username];
}

