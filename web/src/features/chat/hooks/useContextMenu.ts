import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import type { ContextMenuState } from "../chatUi";

const CONTEXT_MENU_WIDTH_PX = 224;
const CONTEXT_MENU_ESTIMATED_HEIGHT_PX = 560;
const CONTEXT_MENU_GUTTER_PX = 12;

type UseContextMenuResult = {
  closeContextMenu: () => void;
  contextMenu: ContextMenuState | null;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuStyle: CSSProperties | undefined;
  openChatContextMenu: (event: MouseEvent | ReactMouseEvent, chatId: string) => void;
  openMessageContextMenu: (
    event: MouseEvent | ReactMouseEvent,
    chatId: string,
    messageId: string
  ) => void;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useContextMenu(): UseContextMenuResult {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuSize, setContextMenuSize] = useState<{ width: number; height: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openChatContextMenu = useCallback((event: MouseEvent | ReactMouseEvent, _chatId: string) => {
    const x = event.clientX;
    const y = event.clientY;
    event.preventDefault();
    setContextMenu({
      kind: "chat",
      chatId: _chatId,
      x,
      y,
    });
  }, []);

  const openMessageContextMenu = useCallback((
    event: MouseEvent | ReactMouseEvent,
    chatId: string,
    messageId: string
  ) => {
    const x = event.clientX;
    const y = event.clientY;
    event.preventDefault();
    setContextMenu({
      kind: "message",
      chatId,
      messageId,
      x,
      y,
    });
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }

      closeContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuSize(null);
      return;
    }

    const nextWidth = contextMenuRef.current?.offsetWidth ?? CONTEXT_MENU_WIDTH_PX;
    const nextHeight = contextMenuRef.current?.offsetHeight ?? CONTEXT_MENU_ESTIMATED_HEIGHT_PX;
    setContextMenuSize((current) =>
      current?.width === nextWidth && current.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight }
    );
  }, [contextMenu]);

  const contextMenuStyle: CSSProperties | undefined = contextMenu
    ? (() => {
        const menuWidth = contextMenuSize?.width ?? CONTEXT_MENU_WIDTH_PX;
        const menuHeight = contextMenuSize?.height ?? CONTEXT_MENU_ESTIMATED_HEIGHT_PX;
        const left = Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.x, window.innerWidth - menuWidth - CONTEXT_MENU_GUTTER_PX)
        );
        const top = Math.max(
          CONTEXT_MENU_GUTTER_PX,
          Math.min(contextMenu.y, window.innerHeight - menuHeight - CONTEXT_MENU_GUTTER_PX)
        );

        return {
          left: `${left}px`,
          top: `${top}px`,
        };
      })()
    : undefined;

  return {
    closeContextMenu,
    contextMenu,
    contextMenuRef,
    contextMenuStyle,
    openChatContextMenu,
    openMessageContextMenu,
    setContextMenu,
  };
}
