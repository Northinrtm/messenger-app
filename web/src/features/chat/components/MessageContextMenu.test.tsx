import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage, Participant } from "../../../lib/types";
import type { ContextMenuState } from "../chatUi";
import { MessageContextMenu } from "./MessageContextMenu";

type ReactActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "user-1",
    username: "north",
    displayName: "North",
    profession: null,
    avatarUrl: null,
    online: true,
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    chatId: "chat-1",
    sender: participant(),
    content: "hello",
    createdAt: "2026-04-28T11:00:00Z",
    editedAt: null,
    status: null,
    clientMessageId: "client-message-1",
    replyTo: null,
    reactions: [],
    ...overrides,
  };
}

function renderMenu(root: Root, overrides: Partial<Parameters<typeof MessageContextMenu>[0]> = {}) {
  const contextMenu: ContextMenuState = {
    kind: "message",
    chatId: "chat-1",
    messageId: "message-1",
    x: 120,
    y: 80,
  };

  return act(async () => {
    root.render(
      <MessageContextMenu
        contextMenu={contextMenu}
        contextMenuRef={createRef<HTMLDivElement>()}
        contextMenuStyle={{ top: 0, left: 0 }}
        contextMenuMessage={message()}
        reactionOptions={[]}
        getMessageReaction={() => null}
        onToggleReaction={() => undefined}
        canReactContextMenuMessage={false}
        canEditContextMenuMessage={false}
        canForwardContextMenuMessage={true}
        canPinContextMenuMessage={false}
        isPinnedContextMenuMessage={false}
        canDeleteContextMenuMessageForSelf={false}
        showDeleteContextMenuMessageForEveryone={false}
        canDeleteContextMenuMessageForEveryone={false}
        deleteForEveryoneLabel={
          "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445"
        }
        deleteForEveryoneHint={
          "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0443 \u0432\u0441\u0435\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432"
        }
        onReply={() => undefined}
        onEdit={() => undefined}
        onForward={() => undefined}
        onSelect={() => undefined}
        onTogglePinned={() => undefined}
        onCopy={() => undefined}
        onDeleteForSelf={() => undefined}
        onDeleteForEveryone={() => undefined}
        isChatArchived={false}
        onToggleChatArchive={() => undefined}
        onDeleteChatForSelf={() => undefined}
        {...overrides}
      />
    );

    await Promise.resolve();
  });
}

describe("MessageContextMenu", () => {
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

  it("hides delete actions for another user's message in group chats", async () => {
    await renderMenu(root!, {
      contextMenuMessage: message({
        id: "message-foreign",
        sender: participant({ id: "user-2", username: "guest", displayName: "Guest" }),
      }),
      contextMenu: {
        kind: "message",
        chatId: "chat-1",
        messageId: "message-foreign",
        x: 120,
        y: 80,
      },
    });

    expect(container.textContent).toContain("\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C");
    expect(container.textContent).not.toContain(
      "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0443 \u0441\u0435\u0431\u044F"
    );
    expect(container.textContent).not.toContain(
      "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445"
    );
    expect(container.querySelectorAll(".context-menu-item.is-danger")).toHaveLength(0);
  });

  it("shows delete-for-everyone for an allowed group message", async () => {
    await renderMenu(root!, {
      contextMenuMessage: message({
        id: "message-own",
        clientMessageId: "client-message-0",
      }),
      contextMenu: {
        kind: "message",
        chatId: "chat-1",
        messageId: "message-own",
        x: 120,
        y: 80,
      },
      showDeleteContextMenuMessageForEveryone: true,
      canDeleteContextMenuMessageForEveryone: true,
    });

    expect(container.textContent).toContain(
      "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445"
    );
    expect(container.querySelectorAll(".context-menu-item.is-danger")).toHaveLength(1);
  });

  it("archives a chat from the chat context menu", async () => {
    const toggleArchiveSpy = vi.fn();

    await renderMenu(root!, {
      contextMenu: {
        kind: "chat",
        chatId: "chat-archive",
        x: 120,
        y: 80,
      },
      contextMenuMessage: null,
      isChatArchived: false,
      onToggleChatArchive: toggleArchiveSpy,
    });

    expect(container.textContent).toContain("В архив");

    const archiveButton = container.querySelector(".context-menu-item") as HTMLButtonElement | null;
    if (!archiveButton) {
      throw new Error("Archive chat button is missing");
    }

    await act(async () => {
      archiveButton.click();
      await Promise.resolve();
    });

    expect(toggleArchiveSpy).toHaveBeenCalledWith("chat-archive");
  });
});
