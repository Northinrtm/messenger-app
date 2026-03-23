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
  useRef,
  useState,
} from "react";
import {
  ApiError,
  addGroupParticipants,
  createDirectChat,
  createGroupChat,
  getChats,
  getMessages,
  getProfile,
  getSessions,
  logout,
  revokeSession,
  searchUsers,
  sendMessage,
  updateProfile,
  updateProfileAvatar,
} from "../../lib/api";
import { subscribeToChats } from "../../lib/realtime";
import type {
  AuthResponse,
  ChatMessage,
  ChatSummary,
  SessionEvent,
  UserProfile,
  UserSessionInfo,
} from "../../lib/types";
import {
  flattenMessagePages,
  initials,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  upsertChat,
  updateChatPreview,
} from "./chatState";

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

type Contact = UserProfile;

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

const ARCHIVE_STORAGE_KEY = "north-messenger-archived-chats";
const CONTACTS_STORAGE_KEY = "north-messenger-contacts";

export function TelegramWorkspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarSheet, setSidebarSheet] = useState<SidebarSheet>(null);
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState(session.user.displayName);
  const [groupParticipantUsernames, setGroupParticipantUsernames] = useState<string[]>([]);
  const [groupInviteUsernames, setGroupInviteUsernames] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [archivedChatIds, setArchivedChatIds] = useState<string[]>(() =>
    loadArchivedChatIds(session.user.id)
  );
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts(session.user.id));
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const toastTimeoutsRef = useRef(new Map<string, number>());
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageId: string | null }>({
    chatId: null,
    lastMessageId: null,
  });
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
  const userSearchResults = userSearchQuery.data ?? [];
  const contactSearchResults = contactsSearchQuery.data ?? [];
  const chatsLoading = chatsQuery.data === undefined && chatsQuery.isFetching;
  const sessionsLoading = sessionsQuery.data === undefined && sessionsQuery.isFetching;
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
  const activeDirectParticipant = activeChat ? getDirectParticipant(activeChat, session.user.id) : null;
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

  const clearUnreadForChat = (chatId: string) => {
    setUnreadCounts((current) => {
      if (!(chatId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[chatId];
      return next;
    });
  };

  const dismissIncomingToast = useEffectEvent((toastId: string) => {
    const timeoutId = toastTimeoutsRef.current.get(toastId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }

    setIncomingToasts((current) => current.filter((toast) => toast.id !== toastId));
  });

  const clearChatAttention = useEffectEvent((chatId: string) => {
    clearUnreadForChat(chatId);

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

  const toggleArchiveChat = useEffectEvent((chatId: string) => {
    setArchivedChatIds((current) =>
      current.includes(chatId) ? current.filter((item) => item !== chatId) : [...current, chatId]
    );

    if (activeChatId === chatId && !archivedChatIdSet.has(chatId)) {
      setSidebarSheet("archive");
      setMobilePane("sidebar");
    }
  });

  const addContact = (user: UserProfile) => {
    if (user.username === session.user.username) {
      return;
    }

    setContacts((current) => {
      const withoutDuplicate = current.filter((contact) => contact.username !== user.username);
      return [user, ...withoutDuplicate];
    });
    setContactSearch("");
  };

  const removeContact = (username: string) => {
    setContacts((current) => current.filter((contact) => contact.username !== username));
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
    if (message.sender.id === session.user.id || message.chatId === activeChatId) {
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
    setArchivedChatIds(loadArchivedChatIds(session.user.id));
    setContacts(loadContacts(session.user.id));
  }, [session.user.id]);

  useEffect(() => {
    saveArchivedChatIds(session.user.id, archivedChatIds);
  }, [archivedChatIds, session.user.id]);

  useEffect(() => {
    saveContacts(session.user.id, contacts);
  }, [contacts, session.user.id]);

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

  const handleRealtimeMessage = useEffectEvent((message: ChatMessage) => {
    if (handledRealtimeMessageIdsRef.current.has(message.id)) {
      return;
    }

    rememberRealtimeMessage(message.id);

    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, message.chatId],
      (current) => mergeMessagePages(current, message)
    );
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => updateChatPreview(current, message)
    );

    if (message.sender.id !== session.user.id && message.chatId !== activeChatId) {
      setUnreadCounts((current) => ({
        ...current,
        [message.chatId]: Math.min(99, (current[message.chatId] ?? 0) + 1),
      }));
    }

    showIncomingToast(message);
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

  useEffect(() => {
    const subscriptionIds = chatIdsKey ? chatIdsKey.split(",") : [];
    return subscribeToChats({
      chatIds: subscriptionIds,
      token: session.token,
      onChat: handleRealtimeChat,
      onMessage: handleRealtimeMessage,
      onSessionEvent: handleRealtimeSession,
    });
  }, [chatIdsKey, handleRealtimeChat, handleRealtimeMessage, handleRealtimeSession, session.token]);

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
      rememberRealtimeMessage(message.id);
      setDraftsByChatId((current) => {
        const existingDraft = current[message.chatId] ?? "";
        if (existingDraft.trim() !== message.content) {
          return current;
        }

        const next = { ...current };
        delete next[message.chatId];
        return next;
      });
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, message.chatId],
        (current) => mergeMessagePages(current, message)
      );
      queryClient.setQueryData<ChatSummary[]>(["chats", session.token], (current) =>
        updateChatPreview(current, message)
      );
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => logout(session.refreshToken),
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

  const requestError = [
    createChatMutation.error,
    createGroupMutation.error,
    addGroupParticipantsMutation.error,
    sendMessageMutation.error,
    signOutMutation.error,
    revokeSessionMutation.error,
    updateProfileMutation.error,
    avatarMutation.error,
    chatsQuery.error,
    sessionsQuery.error,
    profileQuery.error,
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

  return (
    <main className="workspace-shell telegram-workspace" data-mobile-pane={mobilePane}>
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
                  {archivedChats.length === 0 ? (
                    <div className="empty-list">Архив пока пуст.</div>
                  ) : (
                    archivedChats.map((chat) => (
                      <div key={chat.id} className="sheet-row">
                        <div className="sheet-row-copy">
                          <strong>{chat.title}</strong>
                          <span>
                            {chat.direct
                              ? describeChat(chat, session.user.id)
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
                    {groupContacts.length === 0 ? (
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
                  {contacts.length === 0 ? (
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
              const directParticipant = getDirectParticipant(chat, session.user.id);
              const unread = unreadCounts[chat.id] ?? 0;
              const draftPreview = draftsByChatId[chat.id]?.trim() ?? "";
              const preview = draftPreview || chat.lastMessage || "Нет сообщений";
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
                      <span>{describeChat(chat, session.user.id)}</span>
                      {!chat.direct ? <span className="chat-detail-dot">|</span> : null}
                      {!chat.direct ? <span>{formatMemberCount(chat.members.length)}</span> : null}
                    </div>

                    <div className="chat-preview-line">
                      <p>
                        {draftPreview ? <span className="chat-draft">Черновик: </span> : null}
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
                    <p className="conversation-subtitle">
                      {activeChat.direct
                        ? describeChat(activeChat, session.user.id)
                        : formatMemberCount(activeChat.members.length)}
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
                        item.message.sender.id === session.user.id
                          ? "message-bubble is-mine"
                          : "message-bubble"
                      }
                    >
                      <div className="message-meta">
                        <strong>
                          {item.message.sender.id === session.user.id
                            ? "Вы"
                            : item.message.sender.displayName}
                        </strong>
                        <span>{formatClock(item.message.createdAt)}</span>
                      </div>
                      <p>{item.message.content}</p>
                    </article>
                  )
                )
              )}
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
                onChange={(event) => {
                  if (!activeChat) {
                    return;
                  }

                  const nextValue = event.target.value;
                  setDraftsByChatId((current) => ({
                    ...current,
                    [activeChat.id]: nextValue,
                  }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!sendMessageMutation.isPending) {
                      submitActiveDraft();
                    }
                  }
                }}
                placeholder="Напишите сообщение"
                rows={3}
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

function getDirectParticipant(chat: ChatSummary, currentUserId: string) {
  if (!chat.direct) {
    return null;
  }

  return chat.members.find((member) => member.id !== currentUserId) ?? null;
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

function describeChat(chat: ChatSummary, currentUserId: string) {
  if (chat.direct) {
    const otherParticipant = chat.members.find((member) => member.id !== currentUserId);
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

function avatarTone(seed: string) {
  const tones = ["tone-blue", "tone-violet", "tone-green", "tone-orange", "tone-rose"];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return tones[Math.abs(hash) % tones.length];
}

function loadArchivedChatIds(userId: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(`${ARCHIVE_STORAGE_KEY}:${userId}`);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveArchivedChatIds(userId: string, chatIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${ARCHIVE_STORAGE_KEY}:${userId}`, JSON.stringify(chatIds));
}

function loadContacts(userId: string): Contact[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(`${CONTACTS_STORAGE_KEY}:${userId}`);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeStoredContact)
      .filter((contact): contact is Contact => contact !== null);
  } catch {
    return [];
  }
}

function saveContacts(userId: string, contacts: Contact[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${CONTACTS_STORAGE_KEY}:${userId}`, JSON.stringify(contacts));
}

function isContact(value: unknown): value is Contact {
  return normalizeStoredContact(value) !== null;
}

function normalizeStoredContact(value: unknown): Contact | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Contact>;
  if (
    typeof candidate.username !== "string" ||
    typeof candidate.displayName !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: typeof candidate.id === "string" ? candidate.id : `contact:${candidate.username}`,
    username: candidate.username,
    displayName: candidate.displayName,
    createdAt: candidate.createdAt,
    avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : null,
    online: candidate.online === true,
  };
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
