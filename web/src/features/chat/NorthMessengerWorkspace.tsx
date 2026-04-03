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
  useLayoutEffect,
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
  deleteOwnAccount as deleteOwnAccountRequest,
  deleteChat as deleteChatRequest,
  deleteMessage as deleteMessageRequest,
  endVideoConference as endVideoConferenceRequest,
  createDirectChat,
  createGroupChat,
  updateMessage as updateMessageRequest,
  updatePinnedMessage as updatePinnedMessageRequest,
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
  updateEncryptedMessage,
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
  MessageSnippet,
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
  getLatestMessageFromPages,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  removeChatById,
  removeChatPreviewOverride,
  removeMessageById,
  removeMessageByClientMessageId,
  replaceChatPreviewOverride,
  upsertChat,
  upsertChatPreviewOverride,
  updateChatPinnedMessage,
  updateMessageById,
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
import { ActiveChatConversation } from "./components/ActiveChatConversation";
import { AvatarCircle } from "./components/AvatarCircle";
import { ChatListPanel } from "./components/ChatListPanel";
import { MessageContextMenu } from "./components/MessageContextMenu";

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
  | "groupInfo"
  | "groupMembers"
  | "contacts"
  | "sessions"
  | "forward"
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
  replyTo?: MessageSnippet | null;
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
  { id: "profile", label: "РњРѕР№ РїСЂРѕС„РёР»СЊ", symbol: "ME" },
  { id: "archive", label: "РђСЂС…РёРІ", symbol: "AR" },
  { id: "group", label: "Р“СЂСѓРїРїС‹", symbol: "GR" },
  { id: "conference", label: "Р’РёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёРё", symbol: "VC" },
  { id: "contacts", label: "РљРѕРЅС‚Р°РєС‚С‹", symbol: "CT" },
  { id: "sessions", label: "РђРєС‚РёРІРЅС‹Рµ СѓСЃС‚СЂРѕР№СЃС‚РІР°", symbol: "DV" },
  { id: "logout", label: "Р’С‹Р№С‚Рё", symbol: "EX" },
];

const TYPING_EVENT_TTL_MS = 8_000;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 8_000;
const CHATS_POLL_INTERVAL_MS = 2_000;
const ACTIVE_MESSAGE_POLL_INTERVAL_MS = 1_000;
const ACTIVE_TYPING_POLL_INTERVAL_MS = 1_500;
const ARCHIVED_CONFERENCES_SYNC_INTERVAL_MS = 60_000;
const MESSAGE_QUERY_GC_TIME_MS = 60_000;
const TYPING_QUERY_GC_TIME_MS = 15_000;
const SEARCH_QUERY_GC_TIME_MS = 30_000;
const MAX_CACHED_MESSAGE_PAGES = 4;
const DRAFT_SAVE_DEBOUNCE_MS = 450;
const CONFERENCE_ACTIVATION_LEAD_MS = 5 * 60 * 1000;
const CONTEXT_MENU_WIDTH_PX = 224;
const CONTEXT_MENU_ESTIMATED_HEIGHT_PX = 560;
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
  { key: "LIKE", emoji: "рџ‘Ќ", label: "Р›Р°Р№Рє" },
  { key: "DISLIKE", emoji: "рџ‘Ћ", label: "Р”РёР·Р»Р°Р№Рє" },
  { key: "EYES", emoji: "рџ‘Ђ", label: "Р“Р»Р°Р·Р°" },
  { key: "OK", emoji: "рџ‘Њ", label: "РћРєРµР№" },
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
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [isGroupCreatePickerOpen, setIsGroupCreatePickerOpen] = useState(false);
  const [isGroupInvitePickerOpen, setIsGroupInvitePickerOpen] = useState(false);
  const [pendingOutgoingCountByChatId, setPendingOutgoingCountByChatId] = useState<Record<string, number>>({});
  const [contactSearch, setContactSearch] = useState("");
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [chatPreviewOverrides, setChatPreviewOverrides] = useState<
    Record<string, { lastMessage: string; lastMessageAt: string }>
  >(() => readLocalChatPreviews(session.user.id));
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [typingByChatId, setTypingByChatId] = useState<Record<string, Participant[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuSize, setContextMenuSize] = useState<{ width: number; height: number } | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const [isConferenceInfoOpen, setIsConferenceInfoOpen] = useState(false);
  const [conferenceRecordingState, setConferenceRecordingState] =
    useState<ConferenceRecordingState>("idle");
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);
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
  const shouldFetchSessions = sidebarSheet === "sessions";
  const shouldAggressivelyRefreshConferences =
    activeListTab === "conferences" || Boolean(activeConferenceId);
  const shouldFetchConferences =
    shouldAggressivelyRefreshConferences ||
    sidebarSheet === "conference" ||
    sidebarSheet === "conferenceMembers";
  const shouldFetchArchivedConferences = sidebarSheet === "archive" || Boolean(activeConferenceId);

  const chatsQuery = useQuery({
    queryKey: ["chats", session.token],
    queryFn: () => getChats(session.token),
    refetchInterval: isRealtimeConnected ? false : CHATS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", session.token],
    queryFn: () => getSessions(session.token),
    enabled: shouldFetchSessions,
    refetchInterval: shouldFetchSessions ? 60_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
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
    enabled: shouldFetchConferences,
    refetchInterval: shouldAggressivelyRefreshConferences ? 5_000 : false,
    refetchIntervalInBackground: false,
    staleTime: shouldAggressivelyRefreshConferences ? 5_000 : 60_000,
    refetchOnWindowFocus: shouldFetchConferences,
  });

  const archivedConferencesQuery = useQuery({
    queryKey: ["video-conferences-archive", session.token],
    queryFn: () => getArchivedVideoConferences(session.token),
    enabled: shouldFetchArchivedConferences,
    refetchInterval: sidebarSheet === "archive" ? ARCHIVED_CONFERENCES_SYNC_INTERVAL_MS : false,
    refetchIntervalInBackground: sidebarSheet === "archive",
    staleTime: ARCHIVED_CONFERENCES_SYNC_INTERVAL_MS,
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
    gcTime: SEARCH_QUERY_GC_TIME_MS,
  });

  const contactsSearchQuery = useQuery({
    queryKey: ["contact-search", session.token, deferredContactSearch],
    queryFn: () => searchUsers(session.token, deferredContactSearch.trim()),
    enabled: deferredContactSearch.trim().length > 0,
    staleTime: 15_000,
    gcTime: SEARCH_QUERY_GC_TIME_MS,
  });

  const serverChats = chatsQuery.data ?? [];
  const chats = applyChatPreviewOverrides(serverChats, chatPreviewOverrides);
  const sessions = sessionsQuery.data ?? [];
  const profile = profileQuery.data ?? session.user;
  const deleteAccountRequiresMatch =
    normalizeAccountDeletionConfirmation(deleteAccountConfirmation) ===
    profile.username.toLowerCase();
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
  const listedConferences = conferences.filter((conference) =>
    conference.participants.some((participant) => participant.id === session.user.id) && !conference.endedAt
  );
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
  const previewHydrationChats =
    sidebarSheet === "archive"
      ? archivedChats
      : activeListTab === "groups"
        ? visibleGroupChats
        : activeListTab === "dialogs"
          ? visibleDirectChats
          : [];
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
  const activeTypingQuery = useQuery({
    queryKey: ["typing", session.token, activeChatId],
    queryFn: () => getTypingParticipants(session.token, activeChatId!),
    enabled: Boolean(activeChatId) && !isRealtimeConnected,
    refetchInterval: !isRealtimeConnected && activeChatId ? ACTIVE_TYPING_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: TYPING_QUERY_GC_TIME_MS,
  });
  const activeTypingParticipants = activeChatId
    ? isRealtimeConnected
      ? typingByChatId[activeChatId] ?? []
      : mergeTypingParticipants(
          typingByChatId[activeChatId] ?? [],
          activeTypingQuery.data ?? []
        )
    : [];
  const activePendingOutgoingCount = activeChat?.id
    ? pendingOutgoingCountByChatId[activeChat.id] ?? 0
    : 0;
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
    maxPages: MAX_CACHED_MESSAGE_PAGES,
    refetchInterval:
      !isRealtimeConnected && activeChat?.id && activePendingOutgoingCount === 0
        ? ACTIVE_MESSAGE_POLL_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: MESSAGE_QUERY_GC_TIME_MS,
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
  const deleteForEveryoneLabel = activeChat?.direct ? "РЈРґР°Р»РёС‚СЊ РґР»СЏ РѕР±РѕРёС…" : "РЈРґР°Р»РёС‚СЊ РґР»СЏ РІСЃРµС…";
  const deleteForEveryoneHint = activeChat?.direct
    ? "РЎРѕРѕР±С‰РµРЅРёРµ РёСЃС‡РµР·РЅРµС‚ Сѓ РІР°СЃ РѕР±РѕРёС…"
    : "РЎРѕРѕР±С‰РµРЅРёРµ РёСЃС‡РµР·РЅРµС‚ Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ";

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

  const applyChatPreviewMessage = useEffectEvent(
    (message: Pick<ChatMessage, "chatId" | "content" | "createdAt" | "replyTo">) => {
      const previewText = buildChatListPreviewText(message);
      if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
        return;
      }

      setChatPreviewOverrides((current) =>
        upsertChatPreviewOverride(current, {
          chatId: message.chatId,
          content: previewText,
          createdAt: message.createdAt,
        })
      );
    }
  );

  const applyServerChatPreviewMessage = useEffectEvent((
    message: ChatMessage,
    unreadMode: ChatMessageActivityMode = "keep"
  ) => {
    const previewText = buildChatListPreviewText(message);
    if (!previewText.trim() || isUnavailableEncryptedMessage(message.content)) {
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
      applyChatMessageActivity(
        current,
        {
          ...message,
          content: previewText,
        },
        unreadMode
      )
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
    return publishTypingEvent(chatId, typing);
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
    if (!sentHeartbeat) {
      typingSignalRef.current = {
        chatId,
        active: false,
        lastSentAt: 0,
      };
      return;
    }

    typingSignalRef.current = {
      chatId,
      active: true,
      lastSentAt: now,
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
      chatId: sentStop ? targetChatId : null,
      active: false,
      lastSentAt: 0,
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

  const syncChatPreviewFromCache = useEffectEvent((chatId: string) => {
    const cachedPages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>([
      "messages",
      session.token,
      chatId,
    ]);
    if (cachedPages === undefined) {
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
      return;
    }

    const latestMessage = getLatestMessageFromPages(cachedPages);
    if (!latestMessage || !latestMessage.content.trim() || isUnavailableEncryptedMessage(latestMessage.content)) {
      clearChatPreviewOverride(chatId);
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        current?.map((chat) =>
          chat.id !== chatId
            ? chat
            : {
                ...chat,
                lastMessage: null,
                lastMessageAt: null,
              }
        ) ?? []
      );
      return;
    }

    const previewText = buildChatListPreviewText(latestMessage);
    setChatPreviewOverrides((current) =>
      replaceChatPreviewOverride(current, chatId, {
        lastMessage: previewText,
        lastMessageAt: latestMessage.createdAt,
      })
    );
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      applyChatMessageActivity(
        current,
        {
          ...latestMessage,
          content: previewText,
        },
        "keep"
      )
    );
  });

  const shouldHydrateChatListPreview = useEffectEvent((chat: ChatSummary) => {
    if (!chat.lastMessageAt) {
      return false;
    }

    if (chatPreviewOverridesRef.current[chat.id]?.lastMessageAt === chat.lastMessageAt) {
      return false;
    }

    const currentPreview = chat.lastMessage?.trim() ?? "";
    return currentPreview.length === 0 || isUnavailableEncryptedMessage(currentPreview);
  });

  const refreshChatPreviewFromServer = useEffectEvent(async (chatId: string) => {
    try {
      const messages = await getEncryptedMessages(session.token, session.user.id, chatId, {
        limit: 1,
      });
      const latestMessage = messages[messages.length - 1] ?? null;

      if (!latestMessage || !latestMessage.content.trim() || isUnavailableEncryptedMessage(latestMessage.content)) {
        clearChatPreviewOverride(chatId);
        queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
          current?.map((chat) =>
            chat.id !== chatId
              ? chat
              : {
                  ...chat,
                  lastMessage: null,
                  lastMessageAt: null,
                }
          ) ?? []
        );
        return;
      }

      const previewText = buildChatListPreviewText(latestMessage);
      setChatPreviewOverrides((current) =>
        replaceChatPreviewOverride(current, chatId, {
          lastMessage: previewText,
          lastMessageAt: latestMessage.createdAt,
        })
      );
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        applyChatMessageActivity(
          current,
          {
            ...latestMessage,
            content: previewText,
          },
          "keep"
        )
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    }
  });

  const syncChatPinnedSummary = useEffectEvent((chatId: string, pinnedMessage: MessageSnippet | null) => {
    queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
      updateChatPinnedMessage(current, chatId, pinnedMessage)
    );
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

  const focusComposer = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      const length = composerTextareaRef.current?.value.length ?? 0;
      composerTextareaRef.current?.setSelectionRange(length, length);
    });
  });

  const scrollMessageIntoStream = useEffectEvent((messageId: string) => {
    const container = messageStreamRef.current;
    if (!container) {
      return false;
    }

    const messageNode = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!messageNode) {
      return false;
    }

    const targetTop =
      messageNode.offsetTop - container.clientHeight / 2 + messageNode.offsetHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });

    return true;
  });

  const scrollToMessage = useEffectEvent((chatId: string, messageId: string) => {
    if (activeChatId !== chatId) {
      openChat(chatId);
      window.setTimeout(() => {
        scrollMessageIntoStream(messageId);
      }, 120);
      return;
    }

    scrollMessageIntoStream(messageId);
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
      clearComposerContext();
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
    setDeleteAccountConfirmation("");
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
    setConferenceTitle(`Р’СЃС‚СЂРµС‡Р° ${activeChat.title}`);
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
    clearComposerContext();
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
    clearComposerContext();
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setSidebarSheet(null);
    setMobilePane("sidebar");
    setActiveChatId(null);
  });

  const closeActiveConference = useEffectEvent(() => {
    setIsConferenceInfoOpen(false);
    clearComposerContext();
    setSidebarSheet(null);
    setMobilePane("sidebar");
    setActiveConferenceId(null);
  });

  const openConference = useEffectEvent((conferenceId: string) => {
    setContextMenu(null);
    clearComposerContext();
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
    const title = chat?.title ?? "СЌС‚РѕС‚ С‡Р°С‚";
    if (!window.confirm(`РЈРґР°Р»РёС‚СЊ С‡Р°С‚ "${title}" С‚РѕР»СЊРєРѕ Сѓ РІР°СЃ?`)) {
      return;
    }

    deleteChatMutation.mutate(chatId);
  });

  const deleteMessageForEveryone = useEffectEvent((chatId: string, messageId: string) => {
    setContextMenu(null);
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РґР»СЏ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ С‡Р°С‚Р°?")) {
      return;
    }

    deleteMessageMutation.mutate({ chatId, messageId, scope: "EVERYONE" });
  });

  const deleteMessageForSelf = useEffectEvent((chatId: string, messageId: string) => {
    setContextMenu(null);
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ С‚РѕР»СЊРєРѕ Сѓ РІР°СЃ?")) {
      return;
    }

    deleteMessageMutation.mutate({ chatId, messageId, scope: "SELF" });
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
    setEditingMessageId(null);
    setReplyingToMessageId(message.id);
    focusComposer();
  });

  const editMessage = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    setReplyingToMessageId(null);
    setEditingMessageId(message.id);
    setDraftsByChatId((current) => ({
      ...current,
      [message.chatId]: message.content,
    }));
    scheduleDraftSave(message.chatId, message.content);
    focusComposer();
  });

  const forwardMessage = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    setForwardingMessageId(message.id);
    openSidebarSheet("forward");
  });

  const togglePinnedMessage = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    pinMessageMutation.mutate({
      chatId: message.chatId,
      messageId: activeChat?.pinnedMessage?.id === message.id ? null : message.id,
    });
  });

  const copyMessageText = useEffectEvent((message: ChatMessage) => {
    setContextMenu(null);
    void navigator.clipboard.writeText(message.content).catch(() => {
      window.alert("РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ.");
    });
  });

  const forwardMessageToChat = useEffectEvent((chatId: string) => {
    if (!forwardingMessage) {
      return;
    }

    forwardMessageMutation.mutate({
      message: forwardingMessage,
      targetChatId: chatId,
    });
  });

  const forwardMessageToContact = useEffectEvent((username: string) => {
    if (!forwardingMessage) {
      return;
    }

    forwardMessageMutation.mutate({
      message: forwardingMessage,
      targetUsername: username,
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
      title: chat?.title ?? "РќРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ",
      senderName: message.sender.displayName,
      preview: formatToastPreview(buildChatListPreviewText(message)),
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
    if (sidebarSheet !== "group") {
      setIsGroupCreatePickerOpen(false);
    }

    if (sidebarSheet !== "groupMembers") {
      setGroupInviteUsernames([]);
      setIsGroupInvitePickerOpen(false);
    }

    if (sidebarSheet !== "conferenceMembers") {
      setConferenceInviteUsernames([]);
    }

    if (sidebarSheet !== "forward") {
      setForwardingMessageId(null);
    }
  }, [sidebarSheet]);

  useEffect(() => {
    if (replyingToMessageId && !replyingToMessage) {
      setReplyingToMessageId(null);
    }
  }, [replyingToMessage, replyingToMessageId]);

  useEffect(() => {
    if (editingMessageId && !editingMessage) {
      setEditingMessageId(null);
    }
  }, [editingMessage, editingMessageId]);

  useEffect(() => {
    if (forwardingMessageId && !forwardingMessage && sidebarSheet === "forward") {
      setSidebarSheet(null);
      setForwardingMessageId(null);
    }
  }, [forwardingMessage, forwardingMessageId, sidebarSheet]);

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

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuSize(null);
      return;
    }

    const nextWidth = contextMenuRef.current?.offsetWidth ?? CONTEXT_MENU_WIDTH_PX;
    const nextHeight = contextMenuRef.current?.offsetHeight ?? CONTEXT_MENU_ESTIMATED_HEIGHT_PX;
    setContextMenuSize((current) =>
      current?.width === nextWidth && current.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight }
    );
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
    if (activeChat?.pinnedMessage?.id === event.messageId) {
      syncChatPinnedSummary(event.chatId, null);
    }
    if (replyingToMessageId === event.messageId) {
      setReplyingToMessageId(null);
    }
    if (editingMessageId === event.messageId) {
      setEditingMessageId(null);
    }
    if (forwardingMessageId === event.messageId) {
      clearComposerContext("forward");
    }
    syncChatPreviewFromCache(event.chatId);
    void refreshChatPreviewFromServer(event.chatId);
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
    queryClient
      .getQueryCache()
      .findAll({ queryKey: ["messages", session.token] })
      .forEach((query) => {
        const queryChatId = typeof query.queryKey[2] === "string" ? query.queryKey[2] : null;
        if (queryChatId !== activeChatId) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      });

    queryClient
      .getQueryCache()
      .findAll({ queryKey: ["typing", session.token] })
      .forEach((query) => {
        const queryChatId = typeof query.queryKey[2] === "string" ? query.queryKey[2] : null;
        if (queryChatId !== activeChatId) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      });
  }, [activeChatId, queryClient, session.token]);

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
    if (!shouldHydrateChatListPreview(chat)) {
      return;
    }

    const targetVersion = chat.lastMessageAt!;

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
      for (const chat of previewHydrationChats) {
        if (cancelled || archivedChatIdsLookup.has(chat.id) || !chat.lastMessageAt) {
          continue;
        }

        await hydrateChatListPreview(chat);
      }
    };

    if (previewHydrationChats.length > 0) {
      void hydrateVisibleChatPreviews();
    }

    return () => {
      cancelled = true;
    };
  }, [archivedChatIds, hydrateChatListPreview, previewHydrationChats]);

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
    if (!activeChat?.id || !activeChat.pinnedMessage || !hydratedPinnedMessage) {
      return;
    }

    if (activeChat.pinnedMessage.preview === hydratedPinnedMessage.preview) {
      return;
    }

    syncChatPinnedSummary(activeChat.id, hydratedPinnedMessage);
  }, [
    activeChat?.id,
    activeChat?.pinnedMessage,
    hydratedPinnedMessage,
    syncChatPinnedSummary,
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
      setIsGroupCreatePickerOpen(false);
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
      setIsGroupInvitePickerOpen(false);
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
        input.replyTo?.id ?? null,
        {
          sendViaRealtime: (request) => publishOutgoingMessage(input.chatId, request),
        }
      ),
    onMutate: (input) => {
      incrementPendingOutgoing(input.chatId);
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
      if (input.replyTo) {
        clearComposerContext("reply");
      }
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
    onSettled: (_result, _error, input) => {
      decrementPendingOutgoing(input.chatId);
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

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteOwnAccountRequest(session.token),
    onSuccess: () => {
      queryClient.clear();
      onSessionChange(null);
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
    mutationFn: ({
      chatId,
      messageId,
      scope,
    }: {
      chatId: string;
      messageId: string;
      scope: "SELF" | "EVERYONE";
    }) => deleteMessageRequest(session.token, chatId, messageId, scope),
    onMutate: async ({ chatId, messageId }) => {
      const messageKey = ["messages", session.token, chatId] as const;
      await queryClient.cancelQueries({ queryKey: messageKey });
      const previousMessages = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(messageKey);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(messageKey, (current) =>
        removeMessageById(current, messageId)
      );
      if (activeChat?.pinnedMessage?.id === messageId) {
        syncChatPinnedSummary(chatId, null);
      }
      if (replyingToMessageId === messageId) {
        setReplyingToMessageId(null);
      }
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
      }
      if (forwardingMessageId === messageId) {
        clearComposerContext("forward");
      }
      syncChatPreviewFromCache(chatId);
      return {
        chatId,
        previousMessages,
      };
    },
    onError: (_error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", session.token, variables.chatId], context.previousMessages);
      }
      void queryClient.invalidateQueries({ queryKey: ["messages", session.token, variables.chatId] });
      void queryClient.invalidateQueries({ queryKey: ["chats", session.token] });
    },
    onSuccess: (_result, variables) => {
      syncChatPreviewFromCache(variables.chatId);
      void refreshChatPreviewFromServer(variables.chatId);
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: ({
      chatId,
      messageId,
      content,
      participants,
    }: {
      chatId: string;
      messageId: string;
      content: string;
      participants: Participant[];
    }) =>
      updateEncryptedMessage(
        session.token,
        session.user.id,
        chatId,
        messageId,
        content,
        participants
      ),
    onSuccess: (message, variables) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, variables.chatId],
        (current) => updateMessageById(current, variables.messageId, () => message)
      );
      if (activeChat?.pinnedMessage?.id === message.id) {
        syncChatPinnedSummary(variables.chatId, toMessageSnippet(message));
      }
      syncChatPreviewFromCache(variables.chatId);
      clearComposerContext("edit");
      setDraftsByChatId((current) => ({
        ...current,
        [variables.chatId]: "",
      }));
      scheduleDraftSave(variables.chatId, "");
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: string; messageId: string | null }) =>
      updatePinnedMessageRequest(session.token, chatId, messageId),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, chat)
      );
    },
  });

  const forwardMessageMutation = useMutation({
    mutationFn: async ({
      message,
      targetChatId,
      targetUsername,
    }: {
      message: ChatMessage;
      targetChatId?: string;
      targetUsername?: string;
    }) => {
      let targetChat = targetChatId ? chats.find((chat) => chat.id === targetChatId) ?? null : null;
      if (!targetChat) {
        if (!targetUsername) {
          throw new ApiError("Forward target is required", 400);
        }
        targetChat = await createDirectChat(session.token, targetUsername);
      }

      const sentMessage = await sendEncryptedMessage(
        session.token,
        targetChat.id,
        message.content,
        targetChat.members,
        crypto.randomUUID(),
        null,
        {
          sendViaRealtime: (request) => publishOutgoingMessage(targetChat.id, request),
        }
      );

      return { targetChat, sentMessage };
    },
    onSuccess: ({ targetChat, sentMessage }) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, targetChat)
      );
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, targetChat.id],
        (current) => mergeMessagePages(current, ensureOwnMessageStatus(sentMessage, session.user))
      );
      applyChatPreviewMessage(sentMessage);
      applyServerChatPreviewMessage(sentMessage, "clear");
      clearComposerContext("forward");
      openChat(targetChat.id, targetChat.direct ? "dialogs" : "groups");
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
    if (editingMessage) {
      editMessageMutation.mutate({
        chatId: activeChat.id,
        messageId: editingMessage.id,
        content: trimmed,
        participants: activeChat.members,
      });
      return;
    }

    sendMessageMutation.mutate({
      chatId: activeChat.id,
      clientMessageId: `client-${window.crypto.randomUUID()}`,
      content: trimmed,
      participants: activeChat.members,
      replyTo: replyingToMessage ? toMessageSnippet(replyingToMessage) : null,
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
    const title = conferenceTitle.trim() || `Р’СЃС‚СЂРµС‡Р° ${formatClock(scheduledAt.toISOString())}`;
    createConferenceMutation.mutate({
      title,
      scheduledAt: scheduledAt.toISOString(),
      participantUsernames: conferenceParticipantUsernames,
    });
  };

  const submitCreateConferenceNow = () => {
    const now = new Date();
    const title = conferenceTitle.trim() || `Р’СЃС‚СЂРµС‡Р° ${formatClock(now.toISOString())}`;
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

  const openGroupMembersSheet = (options?: { openInvitePicker?: boolean }) => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    setIsGroupInvitePickerOpen(Boolean(options?.openInvitePicker));
    openSidebarSheet("groupMembers");
  };

  const openGroupInfoSheet = () => {
    if (!activeChat || activeChat.direct) {
      return;
    }

    openSidebarSheet("groupInfo");
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
        ? "РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ."
        : "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… РґРёР°Р»РѕРіРѕРІ."
      : normalizedSearch
        ? "РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ."
        : "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… РіСЂСѓРїРї.";
  const chatListContent = (
    <ChatListPanel
      activeListTab={activeListTab}
      normalizedSearch={normalizedSearch}
      conferencesLoading={conferencesLoading}
      visibleConferences={visibleConferences}
      activeConferenceId={activeConference?.id ?? null}
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
      formatConferenceListPreview={formatConferenceListPreviewV3}
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
    <>
      <header className="conversation-header north-conversation-header conference-header">
        <div className="conversation-heading">
          <button
            type="button"
            className="ghost-button compact mobile-back"
            onClick={() => setMobilePane("sidebar")}
          >
            РќР°Р·Р°Рґ
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
                  РРЅС„Рѕ
                </button>
              </div>
              <p className="conversation-subtitle">{formatConferenceSchedule(activeConference.scheduledAt)}</p>
              {isConferenceInfoOpen ? (
                <div
                  ref={conferenceInfoPanelRef}
                  className="conference-summary"
                  role="dialog"
                  aria-label="РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РєРѕРЅС„РµСЂРµРЅС†РёРё"
                >
                  <div className="conference-summary-grid">
                    <div className="conference-summary-item">
                      <span>РћСЂРіР°РЅРёР·Р°С‚РѕСЂ</span>
                      <strong>{activeConferenceOrganizerLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Р’Р°С€Р° СЂРѕР»СЊ</span>
                      <strong>{activeConferenceRoleLabel}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>Р’СЂРµРјСЏ</span>
                      <strong>{formatConferenceSchedule(activeConference.scheduledAt)}</strong>
                    </div>
                    <div className="conference-summary-item">
                      <span>РЈС‡Р°СЃС‚РЅРёРєРё</span>
                      <strong>{formatMemberCount(activeConference.participants.length)}</strong>
                    </div>
                  </div>

                  <div className="conference-summary-rows">
                    <div className="conference-summary-row">
                      <span className="conference-summary-label">Р”РѕСЃС‚СѓРї</span>
                      <span className="conference-summary-code">
                        РљРѕРјРЅР°С‚Р° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РїСЂРёРіР»Р°С€С‘РЅРЅС‹Рј СѓС‡Р°СЃС‚РЅРёРєР°Рј РІРЅСѓС‚СЂРё РїСЂРёР»РѕР¶РµРЅРёСЏ.
                      </span>
                    </div>

                    <div className="conference-summary-row participants">
                      <span className="conference-summary-label">РЈС‡Р°СЃС‚РЅРёРєРё</span>
                      <div className="conference-participants">
                        {activeConference.participants.map((participant) => (
                          <span key={participant.id} className="member-pill">
                            {participant.displayName}
                            {participant.id === activeConference.createdBy.id ? " В· РѕСЂРі." : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    {activeConferenceCanManageParticipants ? (
                      <div className="conference-summary-row">
                        <span className="conference-summary-label">РЈРїСЂР°РІР»РµРЅРёРµ</span>
                        <button
                          type="button"
                          className="ghost-button compact"
                          onClick={openConferenceMembersSheet}
                        >
                          Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ
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
                Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ
              </button>
            ) : null}
            {activeConferenceLocalRecordingActive ? (
              <span className="conference-recording-badge">РРґРµС‚ Р»РѕРєР°Р»СЊРЅР°СЏ Р·Р°РїРёСЃСЊ</span>
            ) : null}
          </div>
        ) : null}

        <div className="conference-summary">
        <div className="conference-summary-grid">
          <div className="conference-summary-item">
            <span>РћСЂРіР°РЅРёР·Р°С‚РѕСЂ</span>
            <strong>{activeConferenceOrganizerLabel}</strong>
          </div>
          <div className="conference-summary-item">
            <span>Р’Р°С€Р° СЂРѕР»СЊ</span>
            <strong>{activeConferenceRoleLabel}</strong>
          </div>
          <div className="conference-summary-item">
            <span>Р’СЂРµРјСЏ</span>
            <strong>{formatConferenceSchedule(activeConference.scheduledAt)}</strong>
          </div>
          <div className="conference-summary-item">
            <span>РЈС‡Р°СЃС‚РЅРёРєРё</span>
            <strong>{formatMemberCount(activeConference.participants.length)}</strong>
          </div>
        </div>

        <div className="conference-summary-rows">
          <div className="conference-summary-row">
            <span className="conference-summary-label">Р”РѕСЃС‚СѓРї</span>
            <span className="conference-summary-code">
              РџСЂСЏРјС‹Рµ СЃСЃС‹Р»РєРё Рё РєРѕРґС‹ СЃРєСЂС‹С‚С‹. Р’РѕР№С‚Рё РјРѕРіСѓС‚ С‚РѕР»СЊРєРѕ РїСЂРёРіР»Р°С€С‘РЅРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё.
            </span>
          </div>

          <div className="conference-summary-row participants">
            <span className="conference-summary-label">РЈС‡Р°СЃС‚РЅРёРєРё</span>
            <div className="conference-participants">
              {activeConference.participants.map((participant) => (
                <span key={participant.id} className="member-pill">
                  {participant.displayName}
                  {participant.id === activeConference.createdBy.id ? " В· РѕСЂРі." : ""}
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
              <strong>РћСЂРіР°РЅРёР·Р°С‚РѕСЂ</strong>
              <span>{activeConferenceOrganizerLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Р вЂ™Р В°РЎв‚¬Р В° РЎР‚Р С•Р В»РЎРЉ</strong>
              <span>{activeConferenceRoleLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>Р’СЂРµРјСЏ</strong>
              <span>{formatConferenceSchedule(activeConference.scheduledAt)}</span>
            </div>
            <div className="conference-meta-line">
              <strong>РЎС‚Р°С‚СѓСЃ</strong>
              <span>{activeConferenceStatusLabel}</span>
            </div>
            <div className="conference-meta-line">
              <strong>РЈС‡Р°СЃС‚РЅРёРєРё</strong>
              <div className="conference-participants">
                {activeConference.participants.map((participant) => (
                  <span key={participant.id} className="member-pill">
                    {participant.displayName}
                    {participant.id === activeConference.createdBy.id ? " В· РѕСЂРі." : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="conference-meta-line">
              <strong>Р С™Р С•Р Т‘ Р С”Р С•Р СР Р…Р В°РЎвЂљРЎвЂ№</strong>
              <div className="conference-link-row">
                <input
                  className="conference-link-input"
                  readOnly
                  value="Р’С…РѕРґ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РІРЅСѓС‚СЂРё РїСЂРёР»РѕР¶РµРЅРёСЏ"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled
                >
                  Р С™Р С•Р С—Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ
                </button>
              </div>
            </div>
            {activeConferenceShareUrl ? (
              <div className="conference-meta-line">
                <strong>РЎСЃС‹Р»РєР°</strong>
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
                    РљРѕРїРёСЂРѕРІР°С‚СЊ
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
    ? (() => {
        const menuWidth = contextMenuSize?.width ?? CONTEXT_MENU_WIDTH_PX;
        const menuHeight = contextMenuSize?.height ?? CONTEXT_MENU_ESTIMATED_HEIGHT_PX;
        const left = Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.x, window.innerWidth - menuWidth - CONTEXT_MENU_GUTTER_PX)
        );
        const top = Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.y, window.innerHeight - menuHeight - CONTEXT_MENU_GUTTER_PX)
        );

        return {
          left: `${left}px`,
          top: `${top}px`,
        };
      })()
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
            aria-label="РћС‚РєСЂС‹С‚СЊ РјРµРЅСЋ"
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
            placeholder="РџРѕРёСЃРє"
          />

          {showTopSearchResults ? (
            <div className="search-dropdown top-search-dropdown">
              {userSearchQuery.isFetching ? (
                <div className="search-result-empty">РС‰РµРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№...</div>
              ) : userSearchResults.length === 0 ? (
                <div className="search-result-empty">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ.</div>
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
              Р”РёР°Р»РѕРіРё
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
              Р“СЂСѓРїРїС‹
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
              Р’РёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёРё
            </button>
          </div>
        ) : null}

        {sidebarSheet ? (
          <section className="north-sidebar-sheet">
            {sidebarSheet === "conference" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Р’РёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёРё</div>
                    <p className="sheet-copy">
                      Р—Р°РїСѓСЃС‚Рё РІСЃС‚СЂРµС‡Сѓ СЃСЂР°Р·Сѓ РёР»Рё Р·Р°РїР»Р°РЅРёСЂСѓР№ РµРµ РЅР° СѓРґРѕР±РЅРѕРµ РІСЂРµРјСЏ.
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
                    Р—Р°РєСЂС‹С‚СЊ
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
                    РќР°С‡Р°С‚СЊ СЃРµР№С‡Р°СЃ
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
                    Р—Р°РїР»Р°РЅРёСЂРѕРІР°С‚СЊ
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
                      placeholder="РќР°Р·РІР°РЅРёРµ РІСЃС‚СЂРµС‡Рё РёР»Рё РѕСЃС‚Р°РІСЊ РїСѓСЃС‚С‹Рј"
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
                        <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
                      ) : conferenceCandidates.length === 0 ? (
                        <div className="empty-list">
                          РџРѕРєР° РЅРµРєРѕРіРѕ РґРѕР±Р°РІР»СЏС‚СЊ. РЎРѕР·РґР°Р№С‚Рµ РіСЂСѓРїРїСѓ РёР»Рё РґРѕР±Р°РІСЊС‚Рµ РєРѕРЅС‚Р°РєС‚С‹.
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
                                {selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}
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
                        Р—Р°РєСЂС‹С‚СЊ
                      </button>
                      <button
                        type="submit"
                        className="secondary-button"
                        disabled={createConferenceMutation.isPending}
                      >
                        {createConferenceMutation.isPending
                          ? "РЎРѕР·РґР°РµРј..."
                          : conferenceComposerMode === "instant"
                            ? "РЎРѕР·РґР°С‚СЊ СЃРµР№С‡Р°СЃ"
                            : "Р—Р°РїР»Р°РЅРёСЂРѕРІР°С‚СЊ"}
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
                    <div className="section-title">РђСЂС…РёРІ</div>
                    <p className="sheet-copy">Р—РґРµСЃСЊ Р»РµР¶Р°С‚ Р°СЂС…РёРІРёСЂРѕРІР°РЅРЅС‹Рµ С‡Р°С‚С‹ Рё РіСЂСѓРїРїС‹.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                <div className="sheet-list">
                  {archivedChatsLoading ? (
                    <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј Р°СЂС…РёРІ...</div>
                  ) : archivedChats.length === 0 ? (
                    <div className="empty-list">РђСЂС…РёРІ РїРѕРєР° РїСѓСЃС‚.</div>
                  ) : (
                    <>
                      {archivedChats.length > 0 ? <div className="section-title">Р§Р°С‚С‹</div> : null}
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
                            РћС‚РєСЂС‹С‚СЊ
                          </button>
                          <button
                            type="button"
                            className="ghost-button compact"
                            onClick={() => toggleArchiveChat(chat.id)}
                          >
                            Р’РµСЂРЅСѓС‚СЊ
                          </button>
                        </div>
                      </div>
                    ))}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {sidebarSheet === "forward" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">РџРµСЂРµСЃР»Р°С‚СЊ</div>
                    <p className="sheet-copy">Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚, РіСЂСѓРїРїСѓ РёР»Рё РєРѕРЅС‚Р°РєС‚ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё СЃРѕРѕР±С‰РµРЅРёСЏ.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => clearComposerContext("forward")}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                {!forwardingMessage ? (
                  <div className="empty-list">РЎРѕРѕР±С‰РµРЅРёРµ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё РЅРµ РЅР°Р№РґРµРЅРѕ.</div>
                ) : (
                  <div className="sheet-list">
                    <div className="forward-preview-card">
                      <span className="forward-preview-label">РЎРѕРѕР±С‰РµРЅРёРµ</span>
                      {forwardingMessage.replyTo ? (
                        <button
                          type="button"
                          className="message-reply-card is-compact"
                          onClick={() =>
                            scrollToMessage(forwardingMessage.chatId, forwardingMessage.replyTo!.id)
                          }
                        >
                          <span className="message-reply-accent" aria-hidden="true" />
                          <span className="message-reply-copy">
                            <strong>{forwardingMessage.replyTo.sender.displayName}</strong>
                            <span>{forwardingMessage.replyTo.preview}</span>
                          </span>
                        </button>
                      ) : null}
                      <div className="forward-preview-body">
                        <strong>{forwardingMessage.sender.displayName}</strong>
                        <p>{buildMessagePreview(forwardingMessage.content, 180)}</p>
                      </div>
                    </div>

                    <div className="forward-target-section">
                      <div className="section-title">Р§Р°С‚С‹ Рё РіСЂСѓРїРїС‹</div>
                      {forwardableChats.length === 0 ? (
                        <div className="empty-list">РќРµС‚ РґСЂСѓРіРёС… РѕС‚РєСЂС‹С‚С‹С… С‡Р°С‚РѕРІ РґР»СЏ РїРµСЂРµСЃС‹Р»РєРё.</div>
                      ) : (
                        forwardableChats.map((chat) => {
                          const directParticipant = getDirectParticipant(chat, session.user);
                          return (
                            <button
                              type="button"
                              key={chat.id}
                              className="sheet-row sheet-row-with-avatar forward-target-row"
                              onClick={() => forwardMessageToChat(chat.id)}
                              disabled={forwardMessageMutation.isPending}
                            >
                              <AvatarCircle
                                className="menu-row-avatar sheet-contact-avatar"
                                name={directParticipant?.displayName ?? chat.title}
                                avatarUrl={directParticipant?.avatarUrl ?? null}
                                badge={chat.direct ? undefined : "GR"}
                                online={chat.direct ? directParticipant?.online : false}
                              />
                              <div className="sheet-row-copy">
                                <strong>{chat.title}</strong>
                                <span>
                                  {chat.direct
                                    ? describeChat(chat, session.user)
                                    : formatMemberCount(chat.members.length)}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="forward-target-section">
                      <div className="section-title">РљРѕРЅС‚Р°РєС‚С‹</div>
                      {forwardContactOptions.length === 0 ? (
                        <div className="empty-list">РќРµС‚ РєРѕРЅС‚Р°РєС‚РѕРІ Р±РµР· Р»РёС‡РЅРѕРіРѕ С‡Р°С‚Р°.</div>
                      ) : (
                        forwardContactOptions.map((contact) => (
                          <button
                            type="button"
                            key={contact.username}
                            className="sheet-row sheet-row-with-avatar forward-target-row"
                            onClick={() => forwardMessageToContact(contact.username)}
                            disabled={forwardMessageMutation.isPending}
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
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {sidebarSheet === "profile" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">РњРѕР№ РїСЂРѕС„РёР»СЊ</div>
                    <p className="sheet-copy">РРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РµРєСѓС‰РµРј Р°РєРєР°СѓРЅС‚Рµ.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
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
                      Р’СЃС‚Р°РІСЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РёР· Р±СѓС„РµСЂР° РѕР±РјРµРЅР° С‡РµСЂРµР· Ctrl+V, РєРѕРіРґР° РѕС‚РєСЂС‹С‚ РїСЂРѕС„РёР»СЊ.
                    </p>
                    <div className="profile-avatar-actions">
                      {profile.avatarUrl ? (
                        <button
                          type="button"
                          className="ghost-button compact"
                          disabled={avatarMutation.isPending}
                          onClick={() => avatarMutation.mutate(null)}
                        >
                          РЈР±СЂР°С‚СЊ С„РѕС‚Рѕ
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
                    <span className="profile-label">РРјСЏ</span>
                    <input
                      value={profileDisplayName}
                      onChange={(event) => setProfileDisplayName(event.target.value)}
                      placeholder="РќРѕРІРѕРµ РёРјСЏ"
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
                      {updateProfileMutation.isPending ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ РёРјСЏ"}
                    </button>
                  </form>
                  <div className="profile-line">
                    <span className="profile-label">Username</span>
                    <strong>@{profile.username}</strong>
                  </div>
                  <div className="profile-line">
                    <span className="profile-label">ID Р°РєРєР°СѓРЅС‚Р°</span>
                    <span>{profile.id}</span>
                  </div>
                  <div className="profile-line">
                    <span className="profile-label">РЎРѕР·РґР°РЅ</span>
                    <span>{formatProfileDate(profile.createdAt)}</span>
                  </div>
                  <div className="profile-danger-card">
                    <div className="profile-danger-copy">
                      <span className="profile-label">РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°</span>
                      <strong>Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµРѕР±СЂР°С‚РёРјРѕ.</strong>
                      <p>
                        Р’СЃРµ СЃРµСЃСЃРёРё Р±СѓРґСѓС‚ Р·Р°РІРµСЂС€РµРЅС‹, Р° РїСЂРѕС„РёР»СЊ Рё СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹.
                        Р’РІРµРґРёС‚Рµ @{profile.username}, С‡С‚РѕР±С‹ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РѕРїРµСЂР°С†РёСЋ.
                      </p>
                    </div>
                    <input
                      value={deleteAccountConfirmation}
                      onChange={(event) => setDeleteAccountConfirmation(event.target.value)}
                      placeholder={`@${profile.username}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      disabled={deleteAccountMutation.isPending || !deleteAccountRequiresMatch}
                      onClick={() => deleteAccountMutation.mutate()}
                    >
                      {deleteAccountMutation.isPending ? "РЈРґР°Р»СЏРµРј Р°РєРєР°СѓРЅС‚..." : "РЈРґР°Р»РёС‚СЊ Р°РєРєР°СѓРЅС‚"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {sidebarSheet === "group" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Р“СЂСѓРїРїС‹</div>
                    <p className="sheet-copy">РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІСѓСЋ РіСЂСѓРїРїСѓ Рё РґРѕР±Р°РІР»СЏР№С‚Рµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїРѕ РєРЅРѕРїРєРµ.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
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
                    placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹"
                  />
                  <div className="sheet-section">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setIsGroupCreatePickerOpen((current) => !current)}
                    >
                      {isGroupCreatePickerOpen ? "РЎРєСЂС‹С‚СЊ СЃРїРёСЃРѕРє РєРѕРЅС‚Р°РєС‚РѕРІ" : "Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°"}
                    </button>
                    {selectedGroupContacts.length > 0 ? (
                      <div className="sheet-chip-list">
                        {selectedGroupContacts.map((contact) => (
                          <span key={contact.username} className="sheet-chip">
                            {contact.displayName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {isGroupCreatePickerOpen ? (
                      <div className="group-picker-list">
                        {contactsLoading ? (
                          <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
                        ) : groupContacts.length === 0 ? (
                          <div className="empty-list">Р”РѕР±Р°РІСЊ СЃРЅР°С‡Р°Р»Р° РєРѕРЅС‚Р°РєС‚С‹, С‡С‚РѕР±С‹ СЃРѕР±СЂР°С‚СЊ РіСЂСѓРїРїСѓ.</div>
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
                                <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={
                      createGroupMutation.isPending || !groupTitle.trim() || !groupParticipantUsernames.length
                    }
                  >
                    {createGroupMutation.isPending ? "РЎРѕР·РґР°РµРј..." : "РЎРѕР·РґР°С‚СЊ"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "groupInfo" && activeChat && !activeChat.direct ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">РРЅС„Рѕ</div>
                    <p className="sheet-copy">РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РіСЂСѓРїРїРµ Рё СѓРїСЂР°РІР»РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєР°РјРё.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                <div className="profile-avatar-card">
                  <AvatarCircle
                    className="profile-sheet-avatar"
                    name={activeChat.title}
                    avatarUrl={null}
                    badge="GR"
                    online={false}
                  />
                  <div className="profile-avatar-copy">
                    <strong>{activeChat.title}</strong>
                    <span>{activeChat.members.length} СѓС‡Р°СЃС‚РЅРёРєРѕРІ</span>
                  </div>
                </div>

                <div className="sheet-actions-stack">
                  <button
                    type="button"
                    className="sheet-row sheet-row-button"
                    onClick={() => openGroupMembersSheet()}
                  >
                    <div className="sheet-row-copy">
                      <strong>РЈС‡Р°СЃС‚РЅРёРєРё</strong>
                      <span>РћС‚РєСЂС‹С‚СЊ СЃРїРёСЃРѕРє СѓС‡Р°СЃС‚РЅРёРєРѕРІ РіСЂСѓРїРїС‹.</span>
                    </div>
                    <span className="member-pill">{activeChat.members.length}</span>
                  </button>
                  <button
                    type="button"
                    className="sheet-row sheet-row-button"
                    onClick={() => openGroupMembersSheet({ openInvitePicker: true })}
                  >
                    <div className="sheet-row-copy">
                      <strong>Р”РѕР±Р°РІРёС‚СЊ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ</strong>
                      <span>
                        {availableGroupInviteContacts.length > 0
                          ? "Р’С‹Р±РµСЂРё Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ Рё РґРѕР±Р°РІСЊ РёС… РІ РіСЂСѓРїРїСѓ."
                          : "Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РґРѕР±Р°РІР»РµРЅС‹ РІ СЌС‚Сѓ РіСЂСѓРїРїСѓ."}
                      </span>
                    </div>
                    <span className="member-pill">
                      {availableGroupInviteContacts.length > 0 ? "Р”РѕР±Р°РІРёС‚СЊ" : "Р“РѕС‚РѕРІРѕ"}
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {sidebarSheet === "groupMembers" && activeChat && !activeChat.direct ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">РЈС‡Р°СЃС‚РЅРёРєРё РіСЂСѓРїРїС‹</div>
                    <p className="sheet-copy">
                      РџРѕСЃРјРѕС‚СЂРё РєС‚Рѕ СѓР¶Рµ РІ {activeChat.title} Рё РґРѕР±Р°РІСЊ РЅРѕРІС‹С… Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                <form
                  className="sheet-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitAddGroupParticipants();
                  }}
                >
                  <div className="sheet-section">
                    <div className="section-title">Р’ СЌС‚РѕР№ РіСЂСѓРїРїРµ</div>
                    <div className="sheet-list">
                      {activeChat.members.map((member) => (
                        <div key={member.id} className="sheet-row sheet-row-with-avatar">
                          <AvatarCircle
                            className="menu-row-avatar sheet-contact-avatar"
                            name={member.displayName}
                            avatarUrl={member.avatarUrl}
                            online={member.online}
                          />
                          <div className="sheet-row-copy">
                            <strong>
                              {member.displayName}
                              {isCurrentUserParticipant(member, session.user) ? " (Р’С‹)" : ""}
                            </strong>
                            <span>@{member.username}</span>
                          </div>
                          <span className="member-pill">
                            {isCurrentUserParticipant(member, session.user) ? "Р’С‹" : "Р’ РіСЂСѓРїРїРµ"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="sheet-section">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setIsGroupInvitePickerOpen((current) => !current)}
                    >
                      {isGroupInvitePickerOpen ? "РЎРєСЂС‹С‚СЊ СЃРїРёСЃРѕРє РєРѕРЅС‚Р°РєС‚РѕРІ" : "Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°"}
                    </button>
                    {selectedGroupInviteContacts.length > 0 ? (
                      <div className="sheet-chip-list">
                        {selectedGroupInviteContacts.map((contact) => (
                          <span key={contact.username} className="sheet-chip">
                            {contact.displayName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {isGroupInvitePickerOpen ? (
                      <>
                        <div className="group-picker-list">
                          {availableGroupInviteContacts.length === 0 ? (
                            <div className="empty-list">Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ РёР»Рё СЃРїРёСЃРѕРє РїСѓСЃС‚.</div>
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
                                  <span className="member-pill">{selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}</span>
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
                          {addGroupParticipantsMutation.isPending ? "Р”РѕР±Р°РІР»СЏРµРј..." : "Р”РѕР±Р°РІРёС‚СЊ РІ РіСЂСѓРїРїСѓ"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </form>
              </div>
            ) : null}

            {false ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Р“СЂСѓРїРїС‹</div>
                    <p className="sheet-copy">РЎРѕР·РґР°Р№С‚Рµ РЅРѕРІСѓСЋ РіСЂСѓРїРїСѓ Рё СЃСЂР°Р·Сѓ РІС‹Р±РµСЂРёС‚Рµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
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
                    placeholder="РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹"
                  />
                  <div className="group-picker-list">
                    {contactsLoading ? (
                      <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
                    ) : groupContacts.length === 0 ? (
                      <div className="empty-list">Р”РѕР±Р°РІСЊ СЃРЅР°С‡Р°Р»Р° РєРѕРЅС‚Р°РєС‚С‹, С‡С‚РѕР±С‹ СЃРѕР±СЂР°С‚СЊ РіСЂСѓРїРїСѓ.</div>
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
                              {selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}
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
                    {createGroupMutation.isPending ? "РЎРѕР·РґР°РµРј..." : "РЎРѕР·РґР°С‚СЊ"}
                  </button>
                </form>
              </div>
            ) : null}

            {false ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Р”РѕР±Р°РІРёС‚СЊ РІ РіСЂСѓРїРїСѓ</div>
                    <p className="sheet-copy">Р’С‹Р±РµСЂРё Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ РґР»СЏ {activeChat?.title ?? "РіСЂСѓРїРїС‹"}.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
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
                      <div className="empty-list">Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ РёР»Рё СЃРїРёСЃРѕРє РїСѓСЃС‚.</div>
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
                              {selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}
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
                    {addGroupParticipantsMutation.isPending ? "Р”РѕР±Р°РІР»СЏРµРј..." : "Р”РѕР±Р°РІРёС‚СЊ РІ РіСЂСѓРїРїСѓ"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "conferenceMembers" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">Р”РѕР±Р°РІРёС‚СЊ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ</div>
                    <p className="sheet-copy">
                      Р’С‹Р±РµСЂРё Р»СЋРґРµР№ РёР· РєРѕРЅС‚Р°РєС‚РѕРІ РґР»СЏ {activeConference?.title ?? "РІСЃС‚СЂРµС‡Рё"}.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
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
                        Р’СЃРµ РєРѕРЅС‚Р°РєС‚С‹ СѓР¶Рµ РїСЂРёРіР»Р°С€РµРЅС‹ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ РёР»Рё СЃРїРёСЃРѕРє РїСѓСЃС‚.
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
                              {selected ? "Р’С‹Р±СЂР°РЅ" : "Р’С‹Р±СЂР°С‚СЊ"}
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
                      ? "Р”РѕР±Р°РІР»СЏРµРј..."
                      : "Р”РѕР±Р°РІРёС‚СЊ РІ РєРѕРЅС„РµСЂРµРЅС†РёСЋ"}
                  </button>
                </form>
              </div>
            ) : null}

            {sidebarSheet === "contacts" ? (
              <div className="sheet-card">
                <div className="sheet-head">
                  <div>
                    <div className="section-title">РљРѕРЅС‚Р°РєС‚С‹</div>
                    <p className="sheet-copy">Р”РѕР±Р°РІР»СЏР№ РєРѕРЅС‚Р°РєС‚С‹ Рё РѕС‚РєСЂС‹РІР°Р№ СЃ РЅРёРјРё Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                <div className="sheet-form contact-search-form">
                  <div className="contact-search-shell">
                  <input
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    placeholder="Username РёР»Рё display name"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />

                  {showContactSearchResults ? (
                    <div className="search-dropdown contact-search-dropdown">
                      {contactsSearchQuery.isFetching ? (
                        <div className="search-result-empty">РС‰РµРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№...</div>
                      ) : contactSearchResults.length === 0 ? (
                        <div className="search-result-empty">РџРѕР»СЊР·РѕРІР°С‚РµР»Рё РЅРµ РЅР°Р№РґРµРЅС‹.</div>
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
                              Р”РѕР±Р°РІРёС‚СЊ
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
                    <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРЅС‚Р°РєС‚С‹...</div>
                  ) : contacts.length === 0 ? (
                    <div className="empty-list">РљРѕРЅС‚Р°РєС‚РѕРІ РїРѕРєР° РЅРµС‚.</div>
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
                            Р§Р°С‚
                          </button>
                          <button
                            type="button"
                            className="ghost-button compact"
                            onClick={() => removeContact(contact.username)}
                          >
                            РЈРґР°Р»РёС‚СЊ
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
                    <div className="section-title">РђРєС‚РёРІРЅС‹Рµ СѓСЃС‚СЂРѕР№СЃС‚РІР°</div>
                    <p className="sheet-copy">РЎРµСЃСЃРёРё Рё СѓСЃС‚СЂРѕР№СЃС‚РІРѕ, СЃ РєРѕС‚РѕСЂРѕРіРѕ РІС‹РїРѕР»РЅРµРЅ РІС…РѕРґ.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setSidebarSheet(null)}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>

                <div className="session-list menu-session-list">
                  {sessionsLoading ? (
                    <div className="empty-list">Р—Р°РіСЂСѓР¶Р°РµРј СЃРїРёСЃРѕРє СѓСЃС‚СЂРѕР№СЃС‚РІ...</div>
                  ) : sessions.length === 0 ? (
                    <div className="empty-list">РђРєС‚РёРІРЅР° С‚РѕР»СЊРєРѕ С‚РµРєСѓС‰Р°СЏ СЃРµСЃСЃРёСЏ.</div>
                  ) : (
                    sessions.map((item) => {
                      const current = item.id === session.sessionId;
                      return (
                        <div key={item.id} className="session-row">
                          <div className="session-copy">
                            <strong>{item.deviceName}</strong>
                            <span>РџРѕСЃР»РµРґРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ: {formatSessionTime(item.lastUsedAt)}</span>
                            <span>РСЃС‚РµРєР°РµС‚: {formatSessionTime(item.expiresAt)}</span>
                          </div>
                          {current ? (
                            <span className="member-pill">РўРµРєСѓС‰РµРµ</span>
                          ) : (
                            <button
                              type="button"
                              className="ghost-button compact"
                              disabled={revokeSessionMutation.isPending}
                              onClick={() => revokeSessionMutation.mutate(item.id)}
                            >
                              РћС‚РєР»СЋС‡РёС‚СЊ
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
                aria-label="РЎРєСЂС‹С‚СЊ РјРµРЅСЋ"
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
                    {id === "logout" && signOutMutation.isPending ? "Р’С‹С…РѕРґ..." : label}
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
        aria-label="РР·РјРµРЅРёС‚СЊ С€РёСЂРёРЅСѓ СЃРїРёСЃРєР° РґРёР°Р»РѕРіРѕРІ"
        onPointerDown={startSidebarResize}
      />

      <section className="conversation north-conversation">
        {activeConference ? (
          conferenceConversation
        ) : activeChat ? (
          <ActiveChatConversation
            activeChat={activeChat}
            activeDirectParticipant={activeDirectParticipant}
            activeDirectInContacts={activeDirectInContacts}
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
            messageStreamRef={messageStreamRef}
            composerTextareaRef={composerTextareaRef}
            onBack={() => setMobilePane("sidebar")}
            onOpenGroupConferenceComposer={openGroupConferenceComposer}
            onOpenGroupInfo={openGroupInfoSheet}
            onAddToContacts={addActiveChatToContacts}
            onToggleArchive={() => toggleArchiveChat(activeChat.id)}
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
            onComposerChange={handleComposerChange}
            onSubmit={submitActiveDraft}
            formatClock={formatClock}
            getMessageStatusClassName={getMessageStatusClassName}
            getMessageStatusGlyph={getMessageStatusGlyph}
            getMessageStatusLabel={getMessageStatusLabel}
            getReactionOption={getReactionOption}
            buildMessagePreview={buildMessagePreview}
          />
        ) : chatsLoading || conferencesLoading ? (
          <div className="empty-state large north-empty-state">Р—Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ...</div>
        ) : (
          <div className="conversation-empty">
            <div className="conversation-empty-badge">
              {activeListTab === "conferences"
                ? "Р’С‹Р±РµСЂРёС‚Рµ РІРёРґРµРѕРєРѕРЅС„РµСЂРµРЅС†РёСЋ СЃР»РµРІР°"
                : "Р’С‹Р±РµСЂРёС‚Рµ, РєРѕРјСѓ С…РѕС‚РµР»Рё Р±С‹ РЅР°РїРёСЃР°С‚СЊ"}
            </div>
          </div>
        )}

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
          onEdit={editMessage}
          onForward={forwardMessage}
          onTogglePinned={togglePinnedMessage}
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
    return otherParticipant ? `@${otherParticipant.username}` : "Р›РёС‡РЅС‹Р№ С‡Р°С‚";
  }

  return "Р“СЂСѓРїРїР°";
}

function formatMemberCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} СѓС‡Р°СЃС‚РЅРёРє`;
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} СѓС‡Р°СЃС‚РЅРёРєР°`;
  }

  return `${count} СѓС‡Р°СЃС‚РЅРёРєРѕРІ`;
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
    return "РЎРµРіРѕРґРЅСЏ";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Р’С‡РµСЂР°";
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
    return `Р—Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° РёРґРµС‚";
  }

  if (conference.roomName || conference.activatedAt) {
    return scheduledTime <= now ? "Р—Р°РїСѓСЃРєР°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё" : "РћР¶РёРґР°РµС‚ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРіРѕ СЃС‚Р°СЂС‚Р°";
  }

  return `РћС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(getConferenceActivationTime(conference.scheduledAt).toISOString())}`;
}

function formatConferenceListPreviewV2(conference: VideoConference, currentUsername: string) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return "Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР°.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `РљРѕРјРЅР°С‚Р° РѕС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString()
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "Р’СЃС‚СЂРµС‡Р° Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё."
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ РёРґРµС‚.";
}

function formatConferenceStageHint(conference: VideoConference, isOrganizer: boolean) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ Р·Р°РїСѓС‰РµРЅР°.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "Р’СЃС‚СЂРµС‡Р° Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. РџРѕРґРєР»СЋС‡РµРЅРёРµ РїРѕСЏРІРёС‚СЃСЏ С‡РµСЂРµР· РЅРµСЃРєРѕР»СЊРєРѕ СЃРµРєСѓРЅРґ.";
    }

    return isOrganizer
      ? `РљРѕРјРЅР°С‚Р° РїРѕРґРіРѕС‚РѕРІР»РµРЅР°. Р’СЃС‚СЂРµС‡Р° РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(
          conference.scheduledAt
        )}.`
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString()
  );
  return `РљРѕРјРЅР°С‚Р° СЃС‚Р°РЅРµС‚ РґРѕСЃС‚СѓРїРЅР° Р·Р° 5 РјРёРЅСѓС‚ РґРѕ СЃС‚Р°СЂС‚Р°: ${activationAt}.`;
}

function formatConferenceStatusLabelV3(conference: VideoConference) {
  if (conference.endedAt) {
    return `Р—Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° РёРґРµС‚";
  }

  if (conference.roomName || conference.activatedAt) {
    return "РљРѕРјРЅР°С‚Р° РѕС‚РєСЂС‹С‚Р° РґР»СЏ РїСЂРёРіР»Р°С€РµРЅРЅС‹С…";
  }

  return `РћС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(getConferenceActivationTime(conference.scheduledAt).toISOString())}`;
}

function formatConferenceListPreviewV3(conference: VideoConference, currentUsername: string) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return "Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР°.";
  }

  if (!conference.roomName && !conference.activatedAt) {
    return `РљРѕРјРЅР°С‚Р° РѕС‚РєСЂРѕРµС‚СЃСЏ ${formatConferenceSchedule(
      getConferenceActivationTime(conference.scheduledAt).toISOString()
    )}.`;
  }

  if (!conference.startedAt) {
    return scheduledTime <= now
      ? "РљРѕРјРЅР°С‚Р° СѓР¶Рµ РѕС‚РєСЂС‹С‚Р° РґР»СЏ РїСЂРёРіР»Р°С€РµРЅРЅС‹С…."
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const participantPreview = conference.participants
    .filter((participant) => participant.username !== currentUsername)
    .map((participant) => participant.displayName)
    .join(", ");

  return participantPreview || "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ РёРґРµС‚.";
}

function formatConferenceStageHintV3(conference: VideoConference, isOrganizer: boolean) {
  const now = Date.now();
  const scheduledTime = new Date(conference.scheduledAt).getTime();

  if (conference.endedAt) {
    return `Р’СЃС‚СЂРµС‡Р° Р·Р°РІРµСЂС€РµРЅР° ${formatConferenceSchedule(conference.endedAt)}.`;
  }

  if (conference.startedAt) {
    return "Р’СЃС‚СЂРµС‡Р° СѓР¶Рµ Р·Р°РїСѓС‰РµРЅР°.";
  }

  if (conference.roomName || conference.activatedAt) {
    if (scheduledTime <= now) {
      return "РљРѕРјРЅР°С‚Р° СѓР¶Рµ РѕС‚РєСЂС‹С‚Р°. Р’РѕР№С‚Рё РјРѕРіСѓС‚ С‚РѕР»СЊРєРѕ РїСЂРёРіР»Р°С€С‘РЅРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё.";
    }

    return isOrganizer
      ? `РљРѕРјРЅР°С‚Р° РїРѕРґРіРѕС‚РѕРІР»РµРЅР°. Р’С…РѕРґ РґР»СЏ РїСЂРёРіР»Р°С€С‘РЅРЅС‹С… РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(
          conference.scheduledAt
        )}.`
      : `РџРѕРґРєР»СЋС‡РµРЅРёРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё ${formatConferenceSchedule(conference.scheduledAt)}.`;
  }

  const activationAt = formatConferenceSchedule(
    getConferenceActivationTime(conference.scheduledAt).toISOString()
  );
  return `РљРѕРјРЅР°С‚Р° СЃС‚Р°РЅРµС‚ РґРѕСЃС‚СѓРїРЅР° Р·Р° 5 РјРёРЅСѓС‚ РґРѕ СЃС‚Р°СЂС‚Р°: ${activationAt}.`;
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
  return organizer.id === currentUser.id ? `${organizer.displayName} (РІС‹)` : organizer.displayName;
}

function describeConferenceRole(isOrganizer: boolean) {
  if (isOrganizer) {
    return "РћСЂРіР°РЅРёР·Р°С‚РѕСЂ";
  }

  return "РЈС‡Р°СЃС‚РЅРёРє";
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
    editedAt: null,
    clientMessageId: input.clientMessageId,
    replyTo: input.replyTo ?? null,
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

function getReactionOption(key: MessageReaction["key"]) {
  return MESSAGE_REACTION_OPTIONS.find((reaction) => reaction.key === key) ?? null;
}

function buildMessagePreview(content: string, maxLength = 96) {
  const collapsedText = content.trim().replace(/\s+/g, " ");
  if (collapsedText.length <= maxLength) {
    return collapsedText;
  }

  return `${collapsedText.slice(0, maxLength - 3)}...`;
}

function buildChatListPreviewText(message: Pick<ChatMessage, "content" | "replyTo">) {
  if (message.replyTo) {
    return `в†Є ${message.replyTo.sender.displayName}: ${buildMessagePreview(message.replyTo.preview, 56)}`;
  }

  return buildMessagePreview(message.content, 88);
}

function toMessageSnippet(
  message: Pick<ChatMessage, "id" | "sender" | "createdAt" | "content">
): MessageSnippet {
  return {
    id: message.id,
    sender: message.sender,
    createdAt: message.createdAt,
    preview: buildMessagePreview(message.content, 88),
  };
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
      return "РџСЂРѕС‡РёС‚Р°РЅРѕ";
    case "DELIVERED":
      return "Р”РѕСЃС‚Р°РІР»РµРЅРѕ";
    case "SENT":
    default:
      return "РћС‚РїСЂР°РІР»РµРЅРѕ";
  }
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

function normalizeAccountDeletionConfirmation(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return normalized.trim().toLowerCase();
}


