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
  createDirectChat,
  createGroupChat,
  getChats,
  getMessages,
  getSessions,
  logout,
  revokeSession,
  sendMessage,
} from "../../lib/api";
import { subscribeToChats } from "../../lib/realtime";
import type {
  AuthResponse,
  ChatMessage,
  ChatSummary,
  SessionEvent,
  UserSessionInfo,
} from "../../lib/types";
import {
  flattenMessagePages,
  initials,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  normalizeUsername,
  parseUsernames,
  upsertChat,
  updateChatPreview,
} from "./chatState";

type Props = {
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

type SidebarPanel = "chats" | "direct" | "group" | "sessions";

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

export function TelegramWorkspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>("chats");
  const [search, setSearch] = useState("");
  const [newChatUsername, setNewChatUsername] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupParticipants, setGroupParticipants] = useState("");
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mobilePane, setMobilePane] = useState<"sidebar" | "conversation">("sidebar");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
  const handledRealtimeMessageIdsRef = useRef(new Map<string, true>());
  const toastTimeoutsRef = useRef(new Map<string, number>());
  const viewportSnapshotRef = useRef<{ chatId: string | null; lastMessageId: string | null }>({
    chatId: null,
    lastMessageId: null,
  });
  const deferredSearch = useDeferredValue(search);

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

  const chats = chatsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const chatsLoading = chatsQuery.data === undefined && chatsQuery.isFetching;
  const sessionsLoading = sessionsQuery.data === undefined && sessionsQuery.isFetching;
  const chatIds = chats.map((chat) => chat.id).sort();
  const chatIdsKey = chatIds.join(",");
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredChats = !normalizedSearch
    ? chats
    : chats.filter((chat) => {
        return (
          chat.title.toLowerCase().includes(normalizedSearch) ||
          chat.members.some((member) =>
            `${member.username} ${member.displayName}`.toLowerCase().includes(normalizedSearch)
          )
        );
      });

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const activeDraft = activeChatId ? draftsByChatId[activeChatId] ?? "" : "";

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

  const openChat = useEffectEvent((chatId: string) => {
    clearChatAttention(chatId);
    setSidebarPanel("chats");
    setMobilePane("conversation");
    startTransition(() => {
      setActiveChatId(chatId);
    });
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
      title: chat?.title ?? "New message",
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
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current.clear();
    };
  }, []);

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
      setNewChatUsername("");
      setSidebarPanel("chats");
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
      setGroupParticipants("");
      setSidebarPanel("chats");
      openChat(chat.id);
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

  const requestError = [
    createChatMutation.error,
    createGroupMutation.error,
    sendMessageMutation.error,
    signOutMutation.error,
    revokeSessionMutation.error,
    chatsQuery.error,
    sessionsQuery.error,
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

  return (
    <main className="workspace-shell" data-mobile-pane={mobilePane}>
      <aside className="sidebar">
        <header className="sidebar-header telegram-profile">
          <div className="profile-copy">
            <div className="eyebrow">North Messenger</div>
            <h2>{session.user.displayName}</h2>
            <p>@{session.user.username}</p>
          </div>
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            {signOutMutation.isPending ? "..." : "Sign out"}
          </button>
        </header>

        <div className="sidebar-toolbar">
          <button
            type="button"
            className={
              sidebarPanel === "chats"
                ? "ghost-button compact toolbar-button is-active"
                : "ghost-button compact toolbar-button"
            }
            onClick={() => setSidebarPanel("chats")}
          >
            Chats
          </button>
          <button
            type="button"
            className={
              sidebarPanel === "direct"
                ? "ghost-button compact toolbar-button is-active"
                : "ghost-button compact toolbar-button"
            }
            onClick={() => setSidebarPanel((current) => (current === "direct" ? "chats" : "direct"))}
          >
            New chat
          </button>
          <button
            type="button"
            className={
              sidebarPanel === "group"
                ? "ghost-button compact toolbar-button is-active"
                : "ghost-button compact toolbar-button"
            }
            onClick={() => setSidebarPanel((current) => (current === "group" ? "chats" : "group"))}
          >
            Group
          </button>
          <button
            type="button"
            className={
              sidebarPanel === "sessions"
                ? "ghost-button compact toolbar-button is-active"
                : "ghost-button compact toolbar-button"
            }
            onClick={() => setSidebarPanel((current) => (current === "sessions" ? "chats" : "sessions"))}
          >
            Devices
          </button>
        </div>

        {sidebarPanel === "direct" ? (
          <form
            className="sidebar-card sidebar-sheet"
            onSubmit={(event) => {
              event.preventDefault();
              const participantUsername = normalizeUsername(newChatUsername);
              if (!participantUsername) {
                return;
              }

              createChatMutation.mutate(participantUsername);
            }}
          >
            <div className="section-title">Start direct chat</div>
            <input
              value={newChatUsername}
              onChange={(event) => setNewChatUsername(event.target.value)}
              placeholder="@username"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={createChatMutation.isPending}
            >
              {createChatMutation.isPending ? "Creating..." : "Open dialog"}
            </button>
          </form>
        ) : null}

        {sidebarPanel === "group" ? (
          <form
            className="sidebar-card sidebar-sheet"
            onSubmit={(event) => {
              event.preventDefault();
              const title = groupTitle.trim();
              const participantUsernames = parseUsernames(groupParticipants);
              if (!title || !participantUsernames.length) {
                return;
              }

              createGroupMutation.mutate({ title, participantUsernames });
            }}
          >
            <div className="section-title">Create group</div>
            <input
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
              placeholder="Team launch"
            />
            <textarea
              value={groupParticipants}
              onChange={(event) => setGroupParticipants(event.target.value)}
              placeholder="alice, bob, charlie"
              rows={3}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? "Creating..." : "Create group"}
            </button>
          </form>
        ) : null}

        {sidebarPanel === "sessions" ? (
          <section className="sidebar-card sidebar-sheet">
            <div className="section-title">Active devices</div>
            <div className="session-list">
              {sessionsLoading ? (
                <div className="empty-list">Loading active sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="empty-list">Only the current session is active.</div>
              ) : (
                sessions.map((item) => {
                  const current = item.id === session.sessionId;
                  return (
                    <div key={item.id} className="session-row">
                      <div className="session-copy">
                        <strong>{current ? "Current device" : "Active device"}</strong>
                        <span>Used {formatSessionTime(item.lastUsedAt)}</span>
                        <span>Expires {formatSessionTime(item.expiresAt)}</span>
                      </div>
                      {current ? (
                        <span className="member-pill">Current</span>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button compact"
                          disabled={revokeSessionMutation.isPending}
                          onClick={() => revokeSessionMutation.mutate(item.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        <section className="sidebar-card chat-browser">
          <input
            className="sidebar-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
          />

          <div className="chat-list">
            {chatsLoading ? (
              <div className="empty-list">Loading chats...</div>
            ) : filteredChats.length === 0 ? (
              <div className="empty-list">
                {chats.length === 0
                  ? "No chats yet. Create your first conversation."
                  : "Nothing matches your search."}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const unread = unreadCounts[chat.id] ?? 0;
                const draftPreview = draftsByChatId[chat.id]?.trim() ?? "";
                const preview = draftPreview || chat.lastMessage || "No messages yet";
                const previewTimestamp = chat.lastMessageAt ?? chat.updatedAt;

                return (
                  <button
                    type="button"
                    key={chat.id}
                    className={
                      chat.id === activeChat?.id
                        ? "chat-tile is-active"
                        : unread > 0
                          ? "chat-tile is-unread"
                          : "chat-tile"
                    }
                    onClick={() => openChat(chat.id)}
                  >
                    <div className="avatar">{initials(chat.title)}</div>
                    <div className="chat-copy">
                      <div className="chat-line">
                        <strong>{chat.title}</strong>
                        <span>{formatChatTimestamp(previewTimestamp)}</span>
                      </div>
                      <div className="chat-preview-line">
                        <p>
                          {draftPreview ? <span className="chat-draft">Draft: </span> : null}
                          {trimPreview(preview, 80)}
                        </p>
                        {unread > 0 ? <span className="chat-badge">{unread}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </aside>

      <section className="conversation">
        {activeChat ? (
          <>
            <header className="conversation-header">
              <div className="conversation-heading">
                <button
                  type="button"
                  className="ghost-button compact mobile-back"
                  onClick={() => setMobilePane("sidebar")}
                >
                  Chats
                </button>
                <div className="conversation-identity">
                  <div className="avatar conversation-avatar">{initials(activeChat.title)}</div>
                  <div>
                    <div className="eyebrow">{activeChat.direct ? "Direct" : "Group"}</div>
                    <h3>{activeChat.title}</h3>
                    <p className="conversation-subtitle">
                      {describeChat(activeChat, session.user.id)}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <div className="message-stream" ref={messageStreamRef}>
              {messagesQuery.hasNextPage ? (
                <button
                  type="button"
                  className="ghost-button history-button"
                  onClick={loadOlderMessages}
                  disabled={messagesQuery.isFetchingNextPage}
                >
                  {messagesQuery.isFetchingNextPage ? "Loading..." : "Load earlier messages"}
                </button>
              ) : null}

              {messagesLoading ? (
                <div className="empty-state">Loading messages...</div>
              ) : timelineItems.length === 0 ? (
                <div className="empty-state">
                  Start the conversation. The first message is delivered in realtime.
                </div>
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
                            ? "You"
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
              className="composer"
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
                placeholder="Write a message"
                rows={3}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={sendMessageMutation.isPending || !activeDraft.trim()}
              >
                {sendMessageMutation.isPending ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        ) : chatsLoading ? (
          <div className="empty-state large">Loading conversations...</div>
        ) : chats.length > 0 ? (
          <div className="empty-state large">
            Select a chat on the left. New messages stay in the list and show unread counters.
          </div>
        ) : (
          <div className="empty-state large">
            Open your first direct chat or create a group from the left panel.
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
    return otherParticipant ? `@${otherParticipant.username}` : "Direct chat";
  }

  return `${chat.members.length} members`;
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

function formatTimelineDay(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Yesterday";
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
