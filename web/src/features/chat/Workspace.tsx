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
  UserSessionInfo,
} from "../../lib/types";
import {
  flattenMessagePages,
  initials,
  mergeMessagePages,
  MESSAGE_PAGE_SIZE,
  parseUsernames,
  upsertChat,
  updateChatPreview,
} from "./chatState";

type Props = {
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

export function Workspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newChatUsername, setNewChatUsername] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupParticipants, setGroupParticipants] = useState("");
  const [draft, setDraft] = useState("");
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScrollOffsetRef = useRef<number | null>(null);
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

  const activeChat =
    chats.find((chat) => chat.id === activeChatId) ??
    chats[0] ??
    null;

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
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    if (!chats.length) {
      if (activeChatId !== null) {
        setActiveChatId(null);
      }
      return;
    }

    if (!activeChatId || !chats.some((chat) => chat.id === activeChatId)) {
      startTransition(() => {
        setActiveChatId(chats[0].id);
      });
    }
  }, [activeChatId, chats]);

  const handleRealtimeMessage = useEffectEvent((message: ChatMessage) => {
    queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
      ["messages", session.token, message.chatId],
      (current) => mergeMessagePages(current, message)
    );
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => updateChatPreview(current, message)
    );
  });

  const handleRealtimeChat = useEffectEvent((chat: ChatSummary) => {
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => upsertChat(current, chat)
    );
  });

  useEffect(() => {
    const subscriptionIds = chatIdsKey ? chatIdsKey.split(",") : [];
    return subscribeToChats({
      chatIds: subscriptionIds,
      token: session.token,
      onChat: handleRealtimeChat,
      onMessage: handleRealtimeMessage,
    });
  }, [chatIdsKey, handleRealtimeChat, handleRealtimeMessage, session.token]);

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
      queryClient.setQueryData<ChatSummary[]>(
        ["chats", session.token],
        (current) => upsertChat(current, chat)
      );
      setNewChatUsername("");
      startTransition(() => {
        setActiveChatId(chat.id);
      });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (input: { title: string; participantUsernames: string[] }) =>
      createGroupChat(session.token, input),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatSummary[]>(
        ["chats", session.token],
        (current) => upsertChat(current, chat)
      );
      setGroupTitle("");
      setGroupParticipants("");
      startTransition(() => {
        setActiveChatId(chat.id);
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => sendMessage(session.token, activeChat!.id, content),
    onSuccess: (message) => {
      setDraft("");
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(
        ["messages", session.token, message.chatId],
        (current) => mergeMessagePages(current, message)
      );
      queryClient.setQueryData<ChatSummary[]>(
        ["chats", session.token],
        (current) => updateChatPreview(current, message)
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
      queryClient.setQueryData<UserSessionInfo[]>(
        ["sessions", session.token],
        (current) => current?.filter((item) => item.id !== sessionId) ?? []
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
  ]
    .find(Boolean);

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

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="eyebrow">Online</div>
            <h2>{session.user.displayName}</h2>
            <p>@{session.user.username}</p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            {signOutMutation.isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>

        <div className="sidebar-card">
          <div className="section-title">Sessions</div>
          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="empty-list">Only the current session is active.</div>
            ) : (
              sessions.map((item) => {
                const current = item.id === session.sessionId;
                return (
                  <div key={item.id} className="session-row">
                    <div className="session-copy">
                      <strong>{current ? "Current session" : "Active session"}</strong>
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
        </div>

        <form
          className="sidebar-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newChatUsername.trim()) {
              return;
            }
            createChatMutation.mutate(newChatUsername.trim());
          }}
        >
          <div className="section-title">New direct chat</div>
          <input
            value={newChatUsername}
            onChange={(event) => setNewChatUsername(event.target.value)}
            placeholder="Teammate username"
          />
          <button
            type="submit"
            className="secondary-button"
            disabled={createChatMutation.isPending}
          >
            {createChatMutation.isPending ? "Creating..." : "Open chat"}
          </button>
        </form>

        <form
          className="sidebar-card"
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
          <div className="section-title">New group</div>
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
          />
          <button
            type="submit"
            className="secondary-button"
            disabled={createGroupMutation.isPending}
          >
            {createGroupMutation.isPending ? "Creating..." : "Create group"}
          </button>
        </form>

        <div className="sidebar-card grow">
          <div className="section-title">Dialogs</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
          />

          <div className="chat-list">
            {filteredChats.length === 0 ? (
              <div className="empty-list">
                {chats.length === 0
                  ? "No chats yet. Create your first conversation."
                  : "Nothing matches your search."}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  type="button"
                  key={chat.id}
                  className={chat.id === activeChat?.id ? "chat-tile is-active" : "chat-tile"}
                  onClick={() => {
                    startTransition(() => {
                      setActiveChatId(chat.id);
                    });
                  }}
                >
                  <div className="avatar">{initials(chat.title)}</div>
                  <div className="chat-copy">
                    <div className="chat-line">
                      <strong>{chat.title}</strong>
                      <span>{formatClock(chat.updatedAt)}</span>
                    </div>
                    <p>{chat.lastMessage ?? "No messages yet"}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <section className="conversation">
        {activeChat ? (
          <>
            <header className="conversation-header">
              <div>
                <div className="eyebrow">Conversation</div>
                <h3>{activeChat.title}</h3>
              </div>
              <div className="member-strip">
                {activeChat.members.map((member) => (
                  <span key={member.id} className="member-pill">
                    {member.displayName}
                  </span>
                ))}
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

              {messages.length === 0 ? (
                <div className="empty-state">
                  Start the conversation. The first message is delivered in realtime.
                </div>
              ) : (
                messages.map((message: ChatMessage) => {
                  const mine = message.sender.id === session.user.id;
                  return (
                    <article
                      key={message.id}
                      className={mine ? "message-bubble is-mine" : "message-bubble"}
                    >
                      <div className="message-meta">
                        <strong>{mine ? "You" : message.sender.displayName}</strong>
                        <span>{formatClock(message.createdAt)}</span>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  );
                })
              )}
            </div>

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = draft.trim();
                if (!trimmed || !activeChat) {
                  return;
                }
                sendMessageMutation.mutate(trimmed);
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message..."
                rows={3}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        ) : (
          <div className="empty-state large">
            Open your first direct chat and start messaging.
          </div>
        )}

        {errorText ? <div className="floating-error">{errorText}</div> : null}
      </section>
    </main>
  );
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
