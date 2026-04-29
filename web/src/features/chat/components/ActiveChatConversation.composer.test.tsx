import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatSummary, MessageSnippet, Participant, UserProfile } from "../../../lib/types";
import type { TimelineItem } from "../chatWorkspaceUtils";
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

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? "message-1",
    chatId: overrides.chatId ?? "chat-1",
    serverOrder: overrides.serverOrder ?? 1,
    sender: overrides.sender ?? userProfile(),
    content: overrides.content ?? "Hello",
    createdAt: overrides.createdAt ?? "2026-04-19T10:00:00.000Z",
    editedAt: overrides.editedAt ?? null,
    status: overrides.status ?? null,
    clientMessageId: overrides.clientMessageId ?? null,
    localOrder: overrides.localOrder ?? null,
    replyTo: overrides.replyTo ?? null,
    reactions: overrides.reactions ?? [],
    attachments: overrides.attachments ?? [],
  };
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function conversationProps(
  overrides: Partial<ComponentProps<typeof ActiveChatConversation>> = {}
): ComponentProps<typeof ActiveChatConversation> {
  return {
    activeChat: chatSummary(),
    activeDirectParticipant: participant({ id: "user-2", username: "anna", displayName: "Anna" }),
    archivedChatIdSet: new Set(),
    sessionUser: userProfile(),
    conversationSubtitle: "subtitle",
    showTypingIndicator: false,
    activePinnedMessage: null,
    timelineItems: [],
    messagesLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    replyingToMessage: null,
    editingMessage: null,
    isSelectingMessages: false,
    selectedMessageCount: 0,
    selectedMessageIdSet: new Set<string>(),
    canForwardSelectedMessages: false,
    canDeleteSelectedMessagesForEveryone: false,
    isDeleteSelectedMessagesDialogOpen: false,
    activeDraft: "",
    isChatMenuOpen: false,
    isDirectChatBlocked: false,
    historyAccessNotice: null,
    encryptionIdentityWarning: null,
    chatMenuButtonRef: { current: null },
    messageStreamRef: { current: null },
    composerTextareaRef: { current: null },
    onBack: () => {},
    onToggleChatMenu: () => {},
    onToggleArchive: () => {},
    onCloseChat: () => {},
    onJumpToPinned: () => {},
    onUnpin: () => {},
    onLoadOlderMessages: () => {},
    onOpenMessageContextMenu: () => {},
    onToggleReaction: () => {},
    onJumpToMessage: () => {},
    onClearReply: () => {},
    onClearEdit: () => {},
    onToggleSelectedMessage: () => {},
    onCancelMessageSelection: () => {},
    onForwardSelectedMessages: () => {},
    onRequestDeleteSelectedMessages: () => {},
    onCloseDeleteSelectedMessagesDialog: () => {},
    onDeleteSelectedMessagesForSelf: () => {},
    onDeleteSelectedMessagesForEveryone: () => {},
    onRecoverEncryptionIdentity: () => {},
    onRetryMessage: (_message: ChatMessage) => {},
    onDownloadAttachment: () => {},
    onLoadAttachmentPreview: () => Promise.resolve(new Blob()),
    onComposerChange: () => {},
    onSubmit: () => true,
    formatClock: (value) => value,
    getMessageStatusClassName: () => "status",
    getMessageStatusGlyph: () => "sent",
    getMessageStatusLabel: () => "sent",
    getReactionOption: () => null,
    buildMessagePreview: (content) => content,
    ...overrides,
  };
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
          {...conversationProps({
            onComposerChange: composerChangeSpy,
            onSubmit: submitSpy,
          })}
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

    const submitButton = container.querySelector(".north-send-button") as HTMLButtonElement | null;
    if (!submitButton) {
      throw new Error("Composer submit button is missing");
    }

    await act(async () => {
      submitButton.focus();
      submitButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(submitSpy).toHaveBeenCalledWith("qweeeee", []);
    expect(textarea.value).toBe("");
    expect(document.activeElement).toBe(textarea);
  });

  it("shows upload progress and can abort an in-flight attachment upload", async () => {
    let submitOptions: Parameters<
      NonNullable<ComponentProps<typeof ActiveChatConversation>["onSubmit"]>
    >[2];
    let resolveSubmit: ((value: boolean) => void) | null = null;
    const submitSpy = vi.fn(
      (_draft: string, _files: File[] | undefined, options: typeof submitOptions) => {
        submitOptions = options;
        options?.onAttachmentProgress?.({
          fileIndex: 0,
          fileCount: 1,
          fileName: "image.png",
          loadedBytes: 512,
          phase: "uploading",
          ratio: 0.5,
          totalBytes: 1024,
        });
        return new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        });
      }
    );

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            onSubmit: submitSpy,
          })}
        />
      );
      await Promise.resolve();
    });

    const fileInput = container.querySelector(".composer-file-input") as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error("Composer file input is missing");
    }

    const imageFile = new File(["image-bytes"], "image.png", { type: "image/png" });
    await act(async () => {
      setInputFiles(fileInput, [imageFile]);
      await Promise.resolve();
    });

    const submitButton = container.querySelector(".north-send-button") as HTMLButtonElement | null;
    if (!submitButton) {
      throw new Error("Composer submit button is missing");
    }

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(submitSpy).toHaveBeenCalledWith("", [imageFile], expect.any(Object));
    expect(container.querySelector(".composer-upload-progress")?.textContent).toContain("50%");

    const cancelButton = container.querySelector(".composer-upload-cancel") as HTMLButtonElement | null;
    if (!cancelButton) {
      throw new Error("Composer upload cancel button is missing");
    }

    await act(async () => {
      cancelButton.click();
      await Promise.resolve();
    });

    expect(submitOptions?.signal?.aborted).toBe(true);

    await act(async () => {
      resolveSubmit?.(false);
      await Promise.resolve();
    });

    expect(container.querySelector(".composer-upload-progress")).toBeNull();
    expect(container.querySelector(".composer-attachment-chip")?.textContent).toContain("image.png");
  });

  it("renders a group history access notice when older encrypted messages are still unavailable", async () => {
    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: chatSummary({ direct: false, title: "Group chat" }),
            activeDirectParticipant: null,
            historyAccessNotice: {
              title: "History is preparing",
              description: "Older messages should appear automatically.",
              isPending: true,
            },
          })}
        />
      );
      await Promise.resolve();
    });

    const notice = container.querySelector(".message-history-notice") as HTMLDivElement | null;
    if (!notice) {
      throw new Error("History access notice is missing");
    }

    expect(notice.textContent).toContain("History is preparing");
    expect(notice.textContent).toContain("Older messages should appear automatically.");
    expect(notice.classList.contains("is-pending")).toBe(true);
  });

  it("renders the selection toolbar and delete dialog actions", async () => {
    const forwardSpy = vi.fn();
    const requestDeleteSpy = vi.fn();
    const deleteForSelfSpy = vi.fn();
    const deleteForEveryoneSpy = vi.fn();
    const cancelSelectionSpy = vi.fn();
    const closeDeleteDialogSpy = vi.fn();
    const timelineItems: TimelineItem[] = [
      {
        type: "message",
        key: "message-1",
        message: chatMessage(),
      },
    ];

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            isSelectingMessages: true,
            selectedMessageCount: 2,
            selectedMessageIdSet: new Set(["message-1"]),
            canForwardSelectedMessages: true,
            canDeleteSelectedMessagesForEveryone: false,
            isDeleteSelectedMessagesDialogOpen: true,
            timelineItems,
            onForwardSelectedMessages: forwardSpy,
            onRequestDeleteSelectedMessages: requestDeleteSpy,
            onDeleteSelectedMessagesForSelf: deleteForSelfSpy,
            onDeleteSelectedMessagesForEveryone: deleteForEveryoneSpy,
            onCancelMessageSelection: cancelSelectionSpy,
            onCloseDeleteSelectedMessagesDialog: closeDeleteDialogSpy,
          })}
        />
      );
      await Promise.resolve();
    });

    const toolbarButtons = Array.from(
      container.querySelectorAll(".message-selection-toolbar .ghost-button")
    ) as HTMLButtonElement[];
    expect(toolbarButtons.some((button) => button.textContent?.includes("ПЕРЕСЛАТЬ 2"))).toBe(true);
    expect(toolbarButtons.some((button) => button.textContent?.includes("УДАЛИТЬ 2"))).toBe(true);

    const deleteButton = toolbarButtons.find((button) => button.textContent?.includes("УДАЛИТЬ 2"));
    if (!deleteButton) {
      throw new Error("Delete selection button is missing");
    }

    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
    });

    expect(requestDeleteSpy).toHaveBeenCalledTimes(1);

    const deleteForSelfButton = Array.from(
      container.querySelectorAll(".message-selection-dialog-option")
    )[0] as HTMLButtonElement | undefined;
    const deleteForEveryoneButton = Array.from(
      container.querySelectorAll(".message-selection-dialog-option")
    )[1] as HTMLButtonElement | undefined;
    const cancelDialogButton = container.querySelector(
      ".message-selection-dialog-cancel"
    ) as HTMLButtonElement | null;

    if (!deleteForSelfButton || !deleteForEveryoneButton || !cancelDialogButton) {
      throw new Error("Delete dialog actions are missing");
    }

    await act(async () => {
      deleteForSelfButton.click();
      await Promise.resolve();
    });

    expect(deleteForSelfSpy).toHaveBeenCalledTimes(1);
    expect(deleteForEveryoneButton.disabled).toBe(true);

    await act(async () => {
      cancelDialogButton.click();
      await Promise.resolve();
    });

    expect(closeDeleteDialogSpy).toHaveBeenCalledTimes(1);

    const cancelSelectionButton = toolbarButtons.find((button) => button.textContent?.includes("ОТМЕНА"));
    if (!cancelSelectionButton) {
      throw new Error("Selection cancel button is missing");
    }

    await act(async () => {
      cancelSelectionButton.click();
      await Promise.resolve();
    });

    expect(cancelSelectionSpy).toHaveBeenCalledTimes(1);
    expect(forwardSpy).not.toHaveBeenCalled();
    expect(deleteForEveryoneSpy).not.toHaveBeenCalled();
  });

  it("shows only delete-for-everyone action for selected messages in group chats", async () => {
    const deleteForSelfSpy = vi.fn();
    const deleteForEveryoneSpy = vi.fn();

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: chatSummary({ direct: false, title: "Group" }),
            isSelectingMessages: true,
            selectedMessageCount: 1,
            selectedMessageIdSet: new Set(["message-1"]),
            canDeleteSelectedMessagesForEveryone: true,
            isDeleteSelectedMessagesDialogOpen: true,
            onDeleteSelectedMessagesForSelf: deleteForSelfSpy,
            onDeleteSelectedMessagesForEveryone: deleteForEveryoneSpy,
          })}
        />
      );
      await Promise.resolve();
    });

    const deleteOptions = Array.from(
      container.querySelectorAll(".message-selection-dialog-option")
    ) as HTMLButtonElement[];

    expect(deleteOptions).toHaveLength(1);
    expect(deleteOptions[0]?.textContent).toContain("Удалить для всех");
    expect(container.textContent).not.toContain("Удалить у себя");

    await act(async () => {
      deleteOptions[0]?.click();
      await Promise.resolve();
    });

    expect(deleteForEveryoneSpy).toHaveBeenCalledTimes(1);
    expect(deleteForSelfSpy).not.toHaveBeenCalled();
  });
});
