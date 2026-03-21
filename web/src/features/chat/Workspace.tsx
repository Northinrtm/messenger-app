import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  ApiError,
  createDirectChat,
  getChats,
  getMessages,
  sendMessage,
} from "../../lib/api";
import { subscribeToChats } from "../../lib/realtime";
import type {
  AuthResponse,
  ChatMessage,
  ChatSummary,
} from "../../lib/types";

type Props = {
  session: AuthResponse;
  onSessionChange: (session: AuthResponse | null) => void;
};

export function Workspace({ session, onSessionChange }: Props) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newChatUsername, setNewChatUsername] = useState("");
  const [draft, setDraft] = useState("");
  const deferredSearch = useDeferredValue(search);

  const chatsQuery = useQuery({
    queryKey: ["chats", session.token],
    queryFn: () => getChats(session.token),
  });

  const chats = chatsQuery.data ?? [];
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

  const messagesQuery = useQuery({
    queryKey: ["messages", session.token, activeChat?.id],
    queryFn: () => getMessages(session.token, activeChat!.id),
    enabled: Boolean(activeChat?.id),
  });

  useEffect(() => {
    if (chatsQuery.error instanceof ApiError && chatsQuery.error.status === 401) {
      onSessionChange(null);
    }
  }, [chatsQuery.error, onSessionChange]);

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
    queryClient.setQueryData<ChatMessage[]>(
      ["messages", session.token, message.chatId],
      (current) => mergeMessages(current, message)
    );
    queryClient.setQueryData<ChatSummary[]>(
      ["chats", session.token],
      (current) => updateChatPreview(current, message)
    );
  });

  useEffect(() => {
    const subscriptionIds = chatIdsKey ? chatIdsKey.split(",") : [];
    if (!subscriptionIds.length) {
      return;
    }

    return subscribeToChats({
      chatIds: subscriptionIds,
      token: session.token,
      onMessage: handleRealtimeMessage,
    });
  }, [chatIdsKey, session.token]);

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

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => sendMessage(session.token, activeChat!.id, content),
    onSuccess: (message) => {
      setDraft("");
      queryClient.setQueryData<ChatMessage[]>(
        ["messages", session.token, message.chatId],
        (current) => mergeMessages(current, message)
      );
      queryClient.setQueryData<ChatSummary[]>(
        ["chats", session.token],
        (current) => updateChatPreview(current, message)
      );
    },
  });

  const requestError = [createChatMutation.error, sendMessageMutation.error, chatsQuery.error, messagesQuery.error]
    .find(Boolean);
  const errorText =
    requestError instanceof ApiError
      ? [requestError.message, ...requestError.details].filter(Boolean).join(". ")
      : null;

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
            onClick={() => onSessionChange(null)}
          >
            Sign out
          </button>
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

            <div className="message-stream">
              {(messagesQuery.data ?? []).length === 0 ? (
                <div className="empty-state">
                  Start the conversation. The first message is delivered in realtime.
                </div>
              ) : (
                (messagesQuery.data ?? []).map((message) => {
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

function upsertChat(current: ChatSummary[] | undefined, nextChat: ChatSummary) {
  const list = current ?? [];
  const withoutCurrent = list.filter((chat) => chat.id !== nextChat.id);
  return [nextChat, ...withoutCurrent].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

function updateChatPreview(current: ChatSummary[] | undefined, message: ChatMessage) {
  if (!current) {
    return current;
  }

  return current
    .map((chat) =>
      chat.id === message.chatId
        ? {
            ...chat,
            lastMessage: message.content,
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
          }
        : chat
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergeMessages(current: ChatMessage[] | undefined, incoming: ChatMessage) {
  const list = current ?? [];
  const exists = list.some((message) => message.id === incoming.id);
  if (exists) {
    return list;
  }

  return [...list, incoming].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

function initials(title: string) {
  return title
    .split(" ")
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
