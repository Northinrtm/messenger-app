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
    chatVersion: overrides.chatVersion ?? "chat-version-1",
    capabilities:
      overrides.capabilities ?? {
        canEditGroup: false,
        canDeleteGroup: false,
        canManageInviteLink: false,
        canAddMembers: false,
        canManageRoles: false,
        canModerateMembers: false,
        canTogglePrejoinHistory: false,
        canLeaveGroup: false,
      },
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
    activeGroupConference: null,
    sessionUser: userProfile(),
    conversationSubtitle: "subtitle",
    showTypingIndicator: false,
    activePinnedMessage: null,
    activePinnedMessageIndex: 0,
    activePinnedMessageCount: 0,
    reactionTourCount: 0,
    reactionTourIndex: -1,
    onReactionTourPrevious: () => {},
    onReactionTourNext: () => {},
    onReactionTourClose: () => {},
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
    chatMenuButtonRef: { current: null },
    messageStreamRef: { current: null },
    composerTextareaRef: { current: null },
    onBack: () => {},
    onToggleChatMenu: () => {},
    onOpenMembers: () => {},
    onStartOrJoinGroupConference: () => {},
    onCloseChat: () => {},
    onJumpToPinned: () => {},
    onSelectPreviousPinned: () => {},
    onSelectNextPinned: () => {},
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
    onRetryMessage: (_message: ChatMessage) => {},
    onDownloadAttachment: () => {},
    onLoadAttachmentPreview: () => Promise.resolve(new Blob()),
    onComposerChange: () => {},
    onCommitDraft: () => {},
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
    expect(composerChangeSpy).toHaveBeenLastCalledWith("");
    expect(textarea.value).toBe("");
    expect(document.activeElement).toBe(textarea);
  });

  it("clears the textarea immediately on submit so rapid consecutive messages do not concatenate", async () => {
    let resolveSubmit: ((value: boolean) => void) | null = null;
    const submitSpy = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        })
    );
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
      setTextareaValue(textarea, "1");
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await Promise.resolve();
    });

    expect(submitSpy).toHaveBeenCalledWith("1", []);
    expect(textarea.value).toBe("");

    await act(async () => {
      resolveSubmit?.(true);
      await Promise.resolve();
    });

    await act(async () => {
      setTextareaValue(textarea, "2");
      await Promise.resolve();
    });

    expect(textarea.value).toBe("2");
    expect(composerChangeSpy).toHaveBeenLastCalledWith("2");
  });

  it("prevents PageUp and PageDown from leaking layout-scrolling behavior out of the composer", async () => {
    await act(async () => {
      root!.render(<ActiveChatConversation {...conversationProps()} />);
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error("Composer textarea is missing");
    }

    const pageUpEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageUp",
    });
    const pageDownEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });

    await act(async () => {
      textarea.dispatchEvent(pageUpEvent);
      textarea.dispatchEvent(pageDownEvent);
      await Promise.resolve();
    });

    expect(pageUpEvent.defaultPrevented).toBe(true);
    expect(pageDownEvent.defaultPrevented).toBe(true);
  });

  it("does not restore stale parent draft text after the composer was cleared locally", async () => {
    const props = conversationProps({
      activeDraft: "abcdef",
    });

    await act(async () => {
      root!.render(<ActiveChatConversation {...props} />);
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error("Composer textarea is missing");
    }

    await act(async () => {
      setTextareaValue(textarea, "");
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...props}
          activeDraft="abc"
        />
      );
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...props}
          activeDraft=""
        />
      );
      await Promise.resolve();
    });

    expect(textarea.value).toBe("");
  });

  it("does not wipe the next typed message when the parent catches up with a cleared draft", async () => {
    const props = conversationProps({
      activeDraft: "1",
    });

    await act(async () => {
      root!.render(<ActiveChatConversation {...props} />);
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error("Composer textarea is missing");
    }

    await act(async () => {
      setTextareaValue(textarea, "");
      await Promise.resolve();
    });

    await act(async () => {
      setTextareaValue(textarea, "2");
      await Promise.resolve();
    });

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...props}
          activeDraft=""
        />
      );
      await Promise.resolve();
    });

    expect(textarea.value).toBe("2");
  });

  it("keeps the focused composer text when a stale parent draft arrives during typing activity", async () => {
    const props = conversationProps({
      activeDraft: "hello",
    });

    await act(async () => {
      root!.render(<ActiveChatConversation {...props} />);
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error("Composer textarea is missing");
    }

    await act(async () => {
      textarea.focus();
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(textarea);

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...props}
          activeDraft=""
          showTypingIndicator
          conversationSubtitle="Anna is typing"
        />
      );
      await Promise.resolve();
    });

    expect(textarea.value).toBe("hello");
  });

  it("commits the previous local draft and loads the next chat draft on chat switch", async () => {
    const commitDraftSpy = vi.fn();
    const firstChat = chatSummary({ id: "chat-1" });
    const secondChat = chatSummary({ id: "chat-2" });

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: firstChat,
            activeDraft: "",
            onCommitDraft: commitDraftSpy,
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
      setTextareaValue(textarea, "local unsaved draft");
      await Promise.resolve();
    });

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: secondChat,
            activeDraft: "server draft",
            onCommitDraft: commitDraftSpy,
          })}
        />
      );
      await Promise.resolve();
    });

    expect(commitDraftSpy).toHaveBeenCalledWith("chat-1", "local unsaved draft");
    expect(textarea.value).toBe("server draft");
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

  it("records a voice message and adds it to attachments after stopping", async () => {
    const stopTrackSpy = vi.fn();
    const getUserMediaSpy = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrackSpy }],
    }));
    const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaSpy,
      },
    });

    class FakeMediaRecorder {
      static isTypeSupported(type: string) {
        return type.startsWith("audio/webm");
      }

      mimeType: string;
      state: "inactive" | "recording" = "inactive";
      #listeners = new Map<string, Array<(event?: { data?: Blob }) => void>>();

      constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/webm";
      }

      addEventListener(type: string, listener: (event?: { data?: Blob }) => void, options?: { once?: boolean }) {
        const wrapped =
          options?.once === true
            ? (event?: { data?: Blob }) => {
                listener(event);
                this.removeEventListener(type, wrapped);
              }
            : listener;
        const current = this.#listeners.get(type) ?? [];
        current.push(wrapped);
        this.#listeners.set(type, current);
      }

      removeEventListener(type: string, listener: (event?: { data?: Blob }) => void) {
        const current = this.#listeners.get(type) ?? [];
        this.#listeners.set(
          type,
          current.filter((candidate) => candidate !== listener)
        );
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.#listeners.get("dataavailable")?.forEach((listener) =>
          listener({ data: new Blob(["voice"], { type: this.mimeType }) })
        );
        this.#listeners.get("stop")?.forEach((listener) => listener());
      }
    }

    const mediaRecorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });

    try {
      await act(async () => {
        root!.render(<ActiveChatConversation {...conversationProps()} />);
        await Promise.resolve();
      });

      const voiceButton = container.querySelector(".composer-voice-button") as HTMLButtonElement | null;
      if (!voiceButton) {
        throw new Error("Voice record button is missing");
      }

      await act(async () => {
        voiceButton.click();
        await Promise.resolve();
      });

      expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
      expect(container.querySelector(".composer-recording-status")?.textContent).toContain("Идет запись");

      await act(async () => {
        voiceButton.click();
        await Promise.resolve();
      });

      expect(stopTrackSpy).toHaveBeenCalled();
      expect(container.querySelector(".composer-attachment-chip")?.textContent).toContain("voice-message-");
    } finally {
      if (mediaRecorderDescriptor) {
        Object.defineProperty(globalThis, "MediaRecorder", mediaRecorderDescriptor);
      } else {
        delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
      }
      if (mediaDevicesDescriptor) {
        Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
      } else {
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      }
    }
  });

  it("renders a history access notice when older messages are still unavailable", async () => {
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

  it("opens group members from the participant counter without toggling the group menu", async () => {
    const onToggleChatMenu = vi.fn();
    const onOpenMembers = vi.fn();

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: chatSummary({
              direct: false,
              title: "qwe",
            }),
            activeDirectParticipant: null,
            conversationSubtitle: "2 участника",
            onToggleChatMenu,
            onOpenMembers,
          })}
        />
      );
      await Promise.resolve();
    });

    const titleButton = container.querySelector(".conversation-group-title-button") as
      | HTMLButtonElement
      | null;
    const subtitleButton = container.querySelector(".conversation-subtitle-button") as
      | HTMLButtonElement
      | null;

    if (!titleButton || !subtitleButton) {
      throw new Error("Group header buttons are missing");
    }

    await act(async () => {
      titleButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      subtitleButton.click();
      await Promise.resolve();
    });

    expect(onToggleChatMenu).toHaveBeenCalledTimes(1);
    expect(onOpenMembers).toHaveBeenCalledTimes(1);
  });

  it("renders failed direct messages with inline bottom meta so retry does not overlap the timestamp", async () => {
    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            timelineItems: [
              {
                type: "message",
                key: "message-1",
                message: chatMessage({
                  status: {
                    state: "FAILED",
                    recipientCount: 1,
                    deliveredCount: 0,
                    readCount: 0,
                  },
                  clientMessageId: "client-1",
                }),
              },
            ],
          })}
        />
      );
      await Promise.resolve();
    });

    const failedOwnBubble = container.querySelector(
      ".message-row.is-direct.is-mine .message-bubble.has-inline-meta"
    );
    const inlineMeta = container.querySelector(
      ".message-row.is-direct.is-mine .message-meta-clone.is-inline"
    );
    const retryButton = container.querySelector(".message-retry-button");

    expect(failedOwnBubble).not.toBeNull();
    expect(inlineMeta).not.toBeNull();
    expect(retryButton?.textContent).toContain("Retry");
  });

  it("renders pinned banner navigation for multiple pinned messages", async () => {
    const onJumpToPinned = vi.fn();
    const onSelectPreviousPinned = vi.fn();
    const onSelectNextPinned = vi.fn();
    const onUnpin = vi.fn();

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activePinnedMessage: {
              id: "message-2",
              sender: participant({ id: "user-2", username: "anna", displayName: "Anna" }),
              createdAt: "2026-04-19T10:10:00.000Z",
              preview: "Pinned preview",
              serverOrder: 12,
            },
            activePinnedMessageIndex: 1,
            activePinnedMessageCount: 3,
            onJumpToPinned,
            onSelectPreviousPinned,
            onSelectNextPinned,
            onUnpin,
          })}
        />
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Закрепленное сообщение 2/3");
    expect(container.textContent).toContain("Pinned preview");

    const navButtons = container.querySelectorAll(".pinned-message-nav-button");
    const jumpButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Перейти")
    );
    const unpinButton = container.querySelector(".pinned-message-close") as HTMLButtonElement | null;

    await act(async () => {
      (navButtons[0] as HTMLButtonElement).click();
      (navButtons[1] as HTMLButtonElement).click();
      jumpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      unpinButton?.click();
      await Promise.resolve();
    });

    expect(onSelectPreviousPinned).toHaveBeenCalledTimes(1);
    expect(onSelectNextPinned).toHaveBeenCalledTimes(1);
    expect(onJumpToPinned).toHaveBeenCalledTimes(1);
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  it("replaces an active @mention query from the keyboard suggestions", async () => {
    const composerChangeSpy = vi.fn();

    await act(async () => {
      root!.render(
        <ActiveChatConversation
          {...conversationProps({
            activeChat: chatSummary({
              direct: false,
              members: [
                participant({ id: "user-1", username: "north", displayName: "North" }),
                participant({ id: "user-2", username: "anna", displayName: "Anna" }),
              ],
            }),
            activeDirectParticipant: null,
            onComposerChange: composerChangeSpy,
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
      setTextareaValue(textarea, "@an");
      textarea.setSelectionRange(3, 3);
      textarea.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const mentionOption = container.querySelector(
      ".composer-mention-option"
    ) as HTMLButtonElement | null;
    if (!mentionOption) {
      throw new Error("Mention option is missing");
    }

    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    await act(async () => {
      textarea.dispatchEvent(enterEvent);
      await Promise.resolve();
    });

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("@anna ");
    expect(composerChangeSpy).toHaveBeenLastCalledWith("@anna ");
    expect(container.querySelector(".composer-mention-option")).toBeNull();
  });
});
