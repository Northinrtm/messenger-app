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
  addGroupParticipants,
  createDirectChat,
  createGroupChat,
  getArchivedChats,
  getChats,
  getContacts,
  getDrafts,
  getMessages,
  getProfile,
  getSessions,
  getTypingParticipants,
  logout,
  removeContact as removeContactRequest,
  revokeSession,
  searchUsers,
  sendMessage,
  sendTypingState as sendTypingStateRequest,
  updateArchivedChat,
  updateDraft as updateDraftRequest,
  updateProfile,
  updateProfileAvatar,
} from "../../lib/api";
import { subscribeToChats } from "../../lib/realtime";
import type {
  AuthResponse,
  ChatDraft,
  ChatMessage,
  ChatSummary,
  MessageStatus,
  MessageStatusEvent,
  Participant,
  SessionEvent,
  TypingEvent,
  UserProfile,
  UserSessionInfo,
} from "../../lib/types";
import {
  flattenMessagePages,
  initials,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  upsertChat,
  updateMessageStatusPages,
  updateChatPreview,
} from "./chatState";
import {
  applyTypingEvent,
  formatTypingParticipants,
  removeTypingParticipant,
} from "./typingState";

type Props = {
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

type SidebarSheet =
  | "archive"
  | "profile"
  | "group"
  | "groupMembers"
  | "contacts"
  | "sessions"
  | null;

type MenuActionId =
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

const MENU_ACTIONS: MenuAction[] = [
  { id: "archive", label: "Архив", symbol: "AR" },
  { id: "profile", label: "Мой профиль", symbol: "ME" },
  { id: "group", label: "Создать группу", symbol: "GR" },
  { id: "contacts", label: "Контакты", symbol: "CT" },
  { id: "sessions", label: "Активные устройства", symbol: "DV" },
  { id: "logout", label: "Выйти", symbol: "EX" },
];

const TYPING_EVENT_TTL_MS = 8_000;
const TYPING_HEARTBEAT_MS = 3_000;
const TYPING_IDLE_MS = 8_000;
const DRAFT_SAVE_DEBOUNCE_MS = 450;
const SIDEBAR_WIDTH_STORAGE_KEY = "north-messenger-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;

export function TelegramWorkspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarSheet, setSidebarSheet] = useState<SidebarSheet>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState(session.user.displayName);
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [typingByChatId, setTypingByChatId] = useState<Record<string, Participant[]>>({});
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
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
  const sidebarResizeStateRef = useRef({ active: false, startX: 0, startWidth: DEFAULT_SIDEBAR_WIDTH });
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredContactSearch = useDeferredValue(contactSearch);

  const chatsQuery = useQuery({
    queryKey: ["chats", session.token],
    queryFn: () => getChats(session.token),
    refetchInterval: 4000,
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

  const draftsQuery = useQuery({
    queryKey: ["drafts", session.token],
    queryFn: () => getDrafts(session.token),
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

  const chats = chatsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const profile = profileQuery.data ?? session.user;
  const archivedChatIds = archivedChatsQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  const userSearchResults = userSearchQuery.data ?? [];
  const contactSearchResults = contactsSearchQuery.data ?? [];
  const chatsLoading = chatsQuery.data === undefined && chatsQuery.isFetching;
  const sessionsLoading = sessionsQuery.data === undefined && sessionsQuery.isFetching;
  const archivedChatsLoading = archivedChatsQuery.data === undefined && archivedChatsQuery.isFetching;
  const contactsLoading = contactsQuery.data === undefined && contactsQuery.isFetching;
  const archivedChatIdSet = new Set(archivedChatIds);
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
  const archivedChats = listedChats.filter((chat) => archivedChatIdSet.has(chat.id));
  const groupContacts = contacts.filter((contact) => contact.username !== session.user.username);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const activeDirectParticipant = activeChat ? getDirectParticipant(activeChat, session.user) : null;
  const activeDirectInContacts = activeDirectParticipant
    ? contacts.some((contact) => contact.username === activeDirectParticipant.username)
    : false;
  const activeDraft = activeChatId ? draftsByChatId[activeChatId] ?? "" : "";
  const availableGroupInviteContacts =
    activeChat && !activeChat.direct
      ? groupContacts.filter(
          (contact) => !activeChat.members.some((member) => member.username === contact.username)
        )
      : [];
  const activeTypingQuery = useQuery({
    queryKey: ["typing", session.token, activeChat?.id],
    queryFn: () => getTypingParticipants(session.token, activeChat!.id),
    enabled: Boolean(activeChat?.id),
    refetchInterval: activeChat?.id ? 1_000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const activeTypingParticipants = activeChatId
    ? activeTypingQuery.data ?? typingByChatId[activeChatId] ?? []
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
      getMessages(session.token, activeChat!.id, {
        before: pageParam,
        limit: MESSAGE_PAGE_SIZE,
      }),
    enabled: Boolean(activeChat?.id),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === MESSAGE_PAGE_SIZE ? lastPage[0]?.createdAt ?? undefined : undefined,
    refetchInterval: activeChat?.id ? 5000 : false,
    refetchIntervalInBackground: true,
  });
  const messages = flattenMessagePages(messagesQuery.data?.pages);
  const timelineItems = buildTimeline(messages);
  const messagesLoading =
    Boolean(activeChat?.id) && messagesQuery.data === undefined && messagesQuery.isFetching;
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  const rememberRealtimeMessage = (messageId: string) => {
    handledRealtimeMessageIdsRef.current.set(messageId, true);
    if (handledRealtimeMessageIdsRef.current.size > 300) {
      const oldestMessageId = handledRealtimeMessageIdsRef.current.keys().next().value;
      if (oldestMessageId) {
        handledRealtimeMessageIdsRef.current.delete(oldestMessageId);
      }
    }
  };

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

  const syncTypingState = useEffectEvent(async (chatId: string, typing: boolean) => {
    try {
      await sendTypingStateRequest(session.token, chatId, typing);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
    }
  });

  const sendTypingHeartbeat = useEffectEvent((chatId: string) => {
    const now = Date.now();
    const currentSignal = typingSignalRef.current;

    if (currentSignal.active && currentSignal.chatId && currentSignal.chatId !== chatId) {
      void syncTypingState(currentSignal.chatId, false);
      typingSignalRef.current = {
        chatId: currentSignal.chatId,
        active: false,
        lastSentAt: now,
      };
    }

    const nextSignal = typingSignalRef.current;
    if (nextSignal.active && nextSignal.chatId === chatId && now - nextSignal.lastSentAt < TYPING_HEARTBEAT_MS) {
      return;
    }

    void syncTypingState(chatId, true);
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

    void syncTypingState(targetChatId, false);
    typingSignalRef.current = {
      chatId: targetChatId,
      active: false,
      lastSentAt: Date.now(),
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
      await updateDraftRequest(session.token, chatId, content);
      queryClient.setQueryData<ChatDraft[]>(["drafts", session.token], (current) =>
        upsertDrafts(current, chatId, content)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionChange(null);
      }
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

  const openSidebarSheet = useEffectEvent((sheet: Exclude<SidebarSheet, null>) => {
    setSidebarSheet(sheet);
    setIsMenuOpen(false);
    setMobilePane("sidebar");
  });

  const openChat = useEffectEvent((chatId: string) => {
    clearChatAttention(chatId);
    setIsMenuOpen(false);
    setSidebarSheet(null);
    setMobilePane("conversation");
    startTransition(() => {
      setActiveChatId(chatId);
    });
  });

  const closeActiveChat = useEffectEvent(() => {
    if (activeChatId) {
      stopTyping(activeChatId);
    }

    setSidebarSheet(null);
    setMobilePane("sidebar");
    startTransition(() => {
      setActiveChatId(null);
    });
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

  const toggleGroupInviteParticipant = (username: string) => {
    setGroupInviteUsernames((current) => toggleUsernameSelection(current, username));
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
  }, [activeChatId, clearChatAttention]);

  useEffect(() => {
    if (!activeChatId || activeTypingQuery.data === undefined) {
      return;
    }

    setTypingByChatId((current) => {
      const nextParticipants = activeTypingQuery.data;
      if (!nextParticipants.length) {
        if (!(activeChatId in current)) {
          return current;
        }

        const { [activeChatId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [activeChatId]: nextParticipants,
      };
    });
  }, [activeChatId, activeTypingQuery.data]);

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
    if (sidebarSheet !== "groupMembers") {
      setGroupInviteUsernames([]);
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

  const handleRealtimeMessage = useEffectEvent((message: ChatMessage) => {
    if (handledRealtimeMessageIdsRef.current.has(message.id)) {
      return;
    }

    const nextMessage = ensureOwnMessageStatus(message, session.user);
    clearTypingParticipant(message.chatId, message.sender.id);
    rememberRealtimeMessage(message.id);

    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, nextMessage.chatId],
      (current) => mergeMessagePages(current, nextMessage)
    );
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => updateChatPreview(current, nextMessage)
    );

    if (!isOwnMessage(nextMessage, session.user)) {
      if (nextMessage.chatId === activeChatId && document.visibilityState !== "hidden") {
        void acknowledgeRead(nextMessage.chatId, [nextMessage.id]);
      } else {
        void acknowledgeDelivered(nextMessage.chatId, [nextMessage.id]);
      }
    }

    showIncomingToast(nextMessage);
  });

  const handleRealtimeChat = useEffectEvent((chat: ChatSummary) => {
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => upsertChat(current, chat)
    );
  });

  const handleRealtimeSession = useEffectEvent((event: SessionEvent) => {
    if (event.type === "SESSION_REVOKED" && event.sessionId === session.sessionId) {
      onSessionChange(null);
    }
  });

  const handleRealtimeMessageStatus = useEffectEvent((event: MessageStatusEvent) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, event.chatId],
      (current) => updateMessageStatusPages(current, event)
    );
    void queryClient.invalidateQueries({
      queryKey: ["messages", session.token, event.chatId],
    });
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
    const subscriptionIds = chatIdsKey ? chatIdsKey.split(",") : [];
    return subscribeToChats({
      chatIds: subscriptionIds,
      token: session.token,
      onChat: handleRealtimeChat,
      onMessage: handleRealtimeMessage,
      onMessageStatus: handleRealtimeMessageStatus,
      onSessionEvent: handleRealtimeSession,
      onTyping: handleRealtimeTyping,
    });
  }, [
    chatIdsKey,
    handleRealtimeChat,
    handleRealtimeMessage,
    handleRealtimeMessageStatus,
    handleRealtimeSession,
    handleRealtimeTyping,
    session.token,
  ]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    acknowledgeVisibleMessagesAsRead();
  }, [acknowledgeVisibleMessagesAsRead, activeChatId, lastMessageId, messages.length]);

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
      setSidebarSheet(null);
      openChat(chat.id);
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (input: { title: string; participantUsernames: string[] }) =>
      createGroupChat(session.token, input),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        upsertChat(current, chat)
      );
      setGroupTitle("");
      setGroupParticipantUsernames([]);
      setSidebarSheet(null);
      openChat(chat.id);
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
    mutationFn: (content: string) => sendMessage(session.token, activeChat!.id, content),
    onSuccess: (message) => {
      const nextMessage = ensureOwnMessageStatus(message, session.user);
      rememberRealtimeMessage(nextMessage.id);
      setDraftsByChatId((current) => {
        const existingDraft = current[nextMessage.chatId] ?? "";
        if (existingDraft.trim() !== nextMessage.content) {
          return current;
        }

        const next = { ...current };
        delete next[nextMessage.chatId];
        return next;
      });
      scheduleDraftSave(nextMessage.chatId, "");
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, nextMessage.chatId],
        (current) => mergeMessagePages(current, nextMessage)
      );
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        updateChatPreview(current, nextMessage)
      );
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
    addGroupParticipantsMutation.error,
    sendMessageMutation.error,
    signOutMutation.error,
    revokeSessionMutation.error,
    updateProfileMutation.error,
    avatarMutation.error,
    updateArchivedChatMutation.error,
    addContactMutation.error,
    removeContactMutation.error,
    chatsQuery.error,
    sessionsQuery.error,
    profileQuery.error,
    archivedChatsQuery.error,
    contactsQuery.error,
    draftsQuery.error,
    userSearchQuery.error,
    contactsSearchQuery.error,
    activeTypingQuery.error,
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
    sendMessageMutation.mutate(trimmed);
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

  const handleMenuAction = (actionId: MenuActionId) => {
    switch (actionId) {
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
  const workspaceStyle: CSSProperties = {
    ["--telegram-sidebar-width" as string]: `${sidebarWidth}px`,
  };

  return (
    <main
      className="workspace-shell telegram-workspace"
      data-mobile-pane={mobilePane}
      style={workspaceStyle}
    >
      <aside className="sidebar telegram-sidebar">
        <div className="telegram-sidebar-top">
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

          <div className="telegram-search-shell">
          <input
            className="telegram-search"
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

        {sidebarSheet ? (
          <section className="telegram-sidebar-sheet">
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
                    archivedChats.map((chat) => (
                      <div key={chat.id} className="sheet-row">
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
                    ))
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
                    <div className="section-title">Создать группу</div>
                    <p className="sheet-copy">Название и участники. Остальное добавим потом.</p>
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

        {!sidebarSheet ? <div className="chat-list telegram-chat-list">
          {chatsLoading ? (
            <div className="empty-list">Загружаем чаты...</div>
          ) : visibleChats.length === 0 ? (
            <div className="empty-list">
              {chats.length === 0
                ? "Пока нет диалогов."
                : listedChats.length === 0
                  ? "Диалоги появятся после первого сообщения."
                : archivedChats.length > 0
                  ? "Все чаты в архиве или не найдены."
                  : "Ничего не найдено."}
            </div>
          ) : (
            visibleChats.map((chat) => {
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
                      ? "chat-tile telegram-chat-tile is-active"
                      : unread > 0
                        ? "chat-tile telegram-chat-tile is-unread"
                        : "chat-tile telegram-chat-tile"
                  }
                  onClick={() => openChat(chat.id)}
                >
                  <AvatarCircle
                    className="avatar telegram-avatar"
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
                        {draftPreview && !isChatTyping ? (
                          <span className="chat-draft">Черновик: </span>
                        ) : null}
                        {trimPreview(preview, 88)}
                      </p>
                      {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div> : null}

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
        className="telegram-layout-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Изменить ширину списка диалогов"
        onPointerDown={startSidebarResize}
      />

      <section className="conversation telegram-conversation">
        {activeChat ? (
          <>
            <header className="conversation-header telegram-conversation-header">
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
                    className="avatar conversation-avatar telegram-avatar"
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
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={openGroupMembersSheet}
                  >
                    Добавить людей
                  </button>
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

            <div className="message-stream telegram-message-stream" ref={messageStreamRef}>
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
              className="composer telegram-composer"
              onSubmit={(event) => {
                event.preventDefault();
                submitActiveDraft();
              }}
            >
              <textarea
                value={activeDraft}
                onChange={(event) => handleComposerChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!sendMessageMutation.isPending) {
                      submitActiveDraft();
                    }
                  }
                }}
                placeholder="Напишите сообщение"
                rows={1}
              />
              <button
                type="submit"
                className="primary-button telegram-send-button"
                disabled={sendMessageMutation.isPending || !activeDraft.trim()}
              >
                &gt;
              </button>
            </form>
          </>
        ) : chatsLoading ? (
          <div className="empty-state large telegram-empty-state">Загружаем диалоги...</div>
        ) : (
          <div className="conversation-empty">
            <div className="conversation-empty-badge">Выберите, кому хотели бы написать</div>
          </div>
        )}

        {errorText ? <div className="floating-error">{errorText}</div> : null}
      </section>

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

function isOwnMessage(message: ChatMessage, currentUser: UserProfile) {
  return message.sender.username === currentUser.username;
}

function isCurrentUserParticipant(participant: Participant, currentUser: UserProfile) {
  return participant.username === currentUser.username;
}

function getMessageStatusClassName(status: MessageStatus | null) {
  switch (status?.state) {
    case "READ":
      return "message-status is-read";
    case "DELIVERED":
      return "message-status is-delivered";
    case "SENT":
    default:
      return "message-status is-sent";
  }
}

function getMessageStatusGlyph(status: MessageStatus | null) {
  return status?.state === "SENT" ? "\u2713" : "\u2713\u2713";
}

function getMessageStatusLabel(status: MessageStatus | null) {
  switch (status?.state) {
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
