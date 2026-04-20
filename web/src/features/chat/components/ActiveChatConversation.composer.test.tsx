import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatSummary, MessageSnippet, Participant, UserProfile } from "../../../lib/types";
import { ActiveChatConversation } from "./ActiveChatConversation.next";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: overrides.id ?? "user-1",
    username: overrides.username ?? "north",
    displayName: overrides.displayName ?? "North",
    profession: overrides.profession ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    online: overrides.online ?? true,
  };
}

function userProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ...participant(overrides),
    createdAt: overrides.createdAt ?? "2026-04-19T10:00:00.000Z",
  };
}

function chatSummary(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: overrides.id ?? "chat-1",
    direct: overrides.direct ?? true,
    title: overrides.title ?? "North",
    avatarUrl: overrides.avatarUrl ?? null,
    ownerUserId: overrides.ownerUserId ?? null,
    moderatorUserIds: overrides.moderatorUserIds ?? [],
    members:
      overrides.members ??
      [participant(), participant({ id: "user-2", username: "anna", displayName: "Anna" })],
    lastMessage: overrides.lastMessage ?? null,
    lastMessageAt: overrides.lastMessageAt ?? null,
    lastMessageServerOrder: overrides.lastMessageServerOrder ?? null,
    updatedAt: overrides.updatedAt ?? "2026-04-19T10:00:00.000Z",
    unreadCount: overrides.unreadCount ?? 0,
    pinnedMessage: overrides.pinnedMessage ?? null,
  };
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ActiveChatConversation composer", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    vi.clearAllMocks();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("keeps typed text responsive and submits the latest local draft even if parent draft lags", async () => {
    const submitSpy = vi.fn(() => true);
    const composerChangeSpy = vi.fn();

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          activeChat={chatSummary()}
          activeDirectParticipant={participant({ id: "user-2", username: "anna", displayName: "Anna" })}
          archivedChatIdSet={new Set()}
          sessionUser={userProfile()}
          conversationSubtitle="subtitle"
          showTypingIndicator={false}
          activePinnedMessage={null}
          timelineItems={[]}
          messagesLoading={false}
          hasNextPage={false}
          isFetchingNextPage={false}
          replyingToMessage={null}
          editingMessage={null}
          activeDraft=""
          isChatMenuOpen={false}
          isDirectChatBlocked={false}
          encryptionIdentityWarning={null}
          chatMenuButtonRef={{ current: null }}
          messageStreamRef={{ current: null }}
          composerTextareaRef={{ current: null }}
          onBack={() => {}}
          onToggleChatMenu={() => {}}
          onToggleArchive={() => {}}
          onCloseChat={() => {}}
          onJumpToPinned={() => {}}
          onUnpin={() => {}}
          onLoadOlderMessages={() => {}}
          onOpenMessageContextMenu={() => {}}
          onToggleReaction={() => {}}
          onJumpToMessage={() => {}}
          onClearReply={() => {}}
          onClearEdit={() => {}}
          onRecoverEncryptionIdentity={() => {}}
          onRetryMessage={(_message: ChatMessage) => {}}
          onComposerChange={composerChangeSpy}
          onSubmit={submitSpy}
          formatClock={(value) => value}
          getMessageStatusClassName={() => "status"}
          getMessageStatusGlyph={() => "sent"}
          getMessageStatusLabel={() => "sent"}
          getReactionOption={() => null}
          buildMessagePreview={(content) => content}
        />
      );
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error("Composer textarea is missing");
    }

    await act(async () => {
      setTextareaValue(textarea, "qweeeee");
      await Promise.resolve();
    });

    expect(textarea.value).toBe("qweeeee");
    expect(composerChangeSpy).toHaveBeenLastCalledWith("qweeeee");

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
      await Promise.resolve();
    });

    expect(submitSpy).toHaveBeenCalledWith("qweeeee");
    expect(textarea.value).toBe("");
  });
});
