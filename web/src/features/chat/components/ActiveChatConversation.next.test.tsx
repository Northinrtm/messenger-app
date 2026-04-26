import { act } from "react";
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage, MessageReaction, MessageStatus, Participant, UserProfile } from "../../../lib/types";
import type { TimelineItem } from "../chatWorkspaceUtils";
import { ConversationTimeline } from "./ActiveChatConversation.next";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type HarnessState = {
  bumpDraft: () => void;
};

type HarnessProps = {
  onReady: (value: HarnessState) => void;
  onTimelineRender: () => void;
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

function messageStatus(state: MessageStatus["state"]): MessageStatus {
  return {
    state,
    recipientCount: 1,
    deliveredCount: 1,
    readCount: state === "READ" ? 1 : 0,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? "message-1",
    chatId: overrides.chatId ?? "chat-1",
    serverOrder: overrides.serverOrder ?? 1,
    sender: overrides.sender ?? participant(),
    content: overrides.content ?? "Hello",
    createdAt: overrides.createdAt ?? "2026-04-19T10:00:00.000Z",
    editedAt: overrides.editedAt ?? null,
    status: overrides.status ?? messageStatus("READ"),
    clientMessageId: overrides.clientMessageId ?? null,
    localOrder: overrides.localOrder ?? null,
    replyTo: overrides.replyTo ?? null,
    reactions: overrides.reactions ?? [],
  };
}

const timelineItems: TimelineItem[] = [
  {
    type: "day",
    key: "day-1",
    label: "Today",
  },
  {
    type: "message",
    key: "message-1",
    message: message({
      id: "message-1",
      sender: participant({ id: "user-2", username: "anna", displayName: "Anna" }),
      reactions: [
        {
          key: "LIKE" satisfies MessageReaction["key"],
          count: 1,
          reactedByCurrentUser: false,
        },
      ],
    }),
  },
];

const timelineSessionUser = userProfile();
const emptySelectionSet = new Set<string>();
const noop = () => undefined;
const loadAttachmentPreview = () => Promise.resolve(new Blob());
const formatClock = (value: string) => value;
const getMessageStatusClassName = () => "status";
const getMessageStatusGlyph = () => "✓";
const getMessageStatusLabel = () => "sent";
const getReactionOption = () => ({
  key: "LIKE" as const,
  emoji: "👍",
  label: "Like",
});

function TimelineHarness({ onReady, onTimelineRender }: HarnessProps) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    onReady({
      bumpDraft: () => setDraft((current) => `${current}e`),
    });
  }, [onReady]);

  return (
    <div data-draft={draft}>
        <ConversationTimeline
          activeChatId="chat-1"
          directChat={true}
          isSelectingMessages={false}
          selectedMessageIdSet={emptySelectionSet}
        timelineItems={timelineItems}
        sessionUser={timelineSessionUser}
        onRender={onTimelineRender}
        onOpenMessageContextMenu={noop}
        onJumpToMessage={noop}
        onToggleSelectedMessage={noop}
        onToggleReaction={noop}
        onRetryMessage={noop}
        onDownloadAttachment={noop}
        onLoadAttachmentPreview={loadAttachmentPreview}
        formatClock={formatClock}
        getMessageStatusClassName={getMessageStatusClassName}
        getMessageStatusGlyph={getMessageStatusGlyph}
        getMessageStatusLabel={getMessageStatusLabel}
        getReactionOption={getReactionOption}
      />
    </div>
  );
}

describe("ActiveChatConversation timeline memoization", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    (globalThis as ReactActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("does not rerender the message timeline when unrelated draft state changes", async () => {
    const onTimelineRender = vi.fn();
    const latestStateRef: { current: HarnessState | null } = { current: null };

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TimelineHarness
          onReady={(value) => {
            latestStateRef.current = value;
          }}
          onTimelineRender={onTimelineRender}
        />
      );
      await Promise.resolve();
    });

    const renderCountAfterMount = onTimelineRender.mock.calls.length;
    expect(renderCountAfterMount).toBeGreaterThan(0);

    await act(async () => {
      latestStateRef.current?.bumpDraft();
      await Promise.resolve();
    });

    expect(onTimelineRender).toHaveBeenCalledTimes(renderCountAfterMount);
  });

  it("toggles a message from the selection circle when selection mode is active", async () => {
    const onToggleSelectedMessage = vi.fn();

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ConversationTimeline
          activeChatId="chat-1"
          directChat={true}
          isSelectingMessages
          selectedMessageIdSet={emptySelectionSet}
          timelineItems={timelineItems}
          sessionUser={timelineSessionUser}
          onRender={noop}
          onOpenMessageContextMenu={noop}
          onJumpToMessage={noop}
          onToggleSelectedMessage={onToggleSelectedMessage}
          onToggleReaction={noop}
          onRetryMessage={noop}
          onDownloadAttachment={noop}
          onLoadAttachmentPreview={loadAttachmentPreview}
          formatClock={formatClock}
          getMessageStatusClassName={getMessageStatusClassName}
          getMessageStatusGlyph={getMessageStatusGlyph}
          getMessageStatusLabel={getMessageStatusLabel}
          getReactionOption={getReactionOption}
        />
      );
      await Promise.resolve();
    });

    const selectionToggle = container.querySelector(".message-select-toggle") as HTMLButtonElement | null;
    if (!selectionToggle) {
      throw new Error("Selection toggle is missing");
    }

    await act(async () => {
      selectionToggle.click();
      await Promise.resolve();
    });

    expect(onToggleSelectedMessage).toHaveBeenCalledWith("message-1");
  });
});
