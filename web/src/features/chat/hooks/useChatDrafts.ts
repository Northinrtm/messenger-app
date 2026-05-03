import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { deleteChatDraft, getChatDrafts, upsertChatDraft } from "../../../lib/api";
import type { ChatDraft } from "../../../lib/types";

const DRAFT_SAVE_DEBOUNCE_MS = 450;

type UseChatDraftsParams = {
  activeChatId: string | null;
  bootstrapReady: boolean;
  initialDrafts?: ChatDraft[];
  initialDraftsUpdatedAt?: number;
  queryClient: QueryClient;
  token: string;
};

type UseChatDraftsResult = {
  activeDraft: string;
  clearDraftForChat: (chatId: string) => void;
  composerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  draftsByChatId: Record<string, string>;
  draftsQuery: ReturnType<typeof useQuery<ChatDraft[]>>;
  focusComposer: () => void;
  handleComposerChange: (chatId: string | null, nextValue: string) => void;
  scheduleDraftSave: (chatId: string, content: string) => void;
  setDraftsByChatId: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useChatDrafts({
  activeChatId,
  bootstrapReady,
  initialDrafts,
  initialDraftsUpdatedAt,
  queryClient,
  token,
}: UseChatDraftsParams): UseChatDraftsResult {
  const [draftsByChatId, setDraftsByChatIdState] = useState<Record<string, string>>({});
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftSaveTimeoutsRef = useRef(new Map<string, number>());
  const pendingDraftContentsRef = useRef(new Map<string, string>());
  const draftSyncLocksRef = useRef(new Set<string>());
  const draftsByChatIdRef = useRef<Record<string, string>>({});
  const draftsQueryKey = ["drafts", token] as const;

  const draftsQuery = useQuery({
    queryKey: draftsQueryKey,
    queryFn: () => getChatDrafts(token),
    enabled: bootstrapReady,
    initialData: initialDrafts,
    initialDataUpdatedAt: initialDrafts ? initialDraftsUpdatedAt : undefined,
    staleTime: 15_000,
  });

  const updateDraftsQueryData = useEffectEvent(
    (updater: (current: ChatDraft[] | undefined) => ChatDraft[]) => {
      queryClient.setQueryData<ChatDraft[]>(draftsQueryKey, (current) => updater(current));
    }
  );

  const persistDraft = useEffectEvent(
    async (chatId: string, content: string, options?: { keepalive?: boolean }) => {
      const normalizedContent = content;
      const trimmedContent = normalizedContent.trim();

      try {
        pendingDraftContentsRef.current.delete(chatId);
        if (trimmedContent.length === 0) {
          await deleteChatDraft(token, chatId, { keepalive: options?.keepalive });
          updateDraftsQueryData((current) =>
            (current ?? []).filter((draft) => draft.chatId !== chatId)
          );
          return;
        }

        const persistedDraft = await upsertChatDraft(token, chatId, normalizedContent, {
          keepalive: options?.keepalive,
        });
        updateDraftsQueryData((current) => {
          const nextDrafts = (current ?? []).filter((draft) => draft.chatId !== chatId);
          nextDrafts.push(persistedDraft);
          return nextDrafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        });
      } finally {
        if (!draftSaveTimeoutsRef.current.has(chatId)) {
          draftSyncLocksRef.current.delete(chatId);
        }
      }
    }
  );

  const flushPendingDraftSaves = useEffectEvent(() => {
    const pendingChatIds = [...draftSaveTimeoutsRef.current.keys()];
    if (!pendingChatIds.length) {
      return;
    }

    pendingChatIds.forEach((chatId) => {
      const timeoutId = draftSaveTimeoutsRef.current.get(chatId);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      draftSaveTimeoutsRef.current.delete(chatId);
      const pendingContent = pendingDraftContentsRef.current.get(chatId);
      pendingDraftContentsRef.current.delete(chatId);
      draftSyncLocksRef.current.delete(chatId);
      void persistDraft(
        chatId,
        pendingContent ?? draftsByChatIdRef.current[chatId] ?? "",
        { keepalive: true }
      ).catch(() => undefined);
    });
  });

  const setDraftsByChatId = useEffectEvent(
    (updater: SetStateAction<Record<string, string>>) => {
      setDraftsByChatIdState((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (value: Record<string, string>) => Record<string, string>)(current)
            : updater;
        draftsByChatIdRef.current = next;
        return next;
      });
    }
  );

  const scheduleDraftSave = useEffectEvent((chatId: string, content: string) => {
    draftSyncLocksRef.current.add(chatId);
    pendingDraftContentsRef.current.set(chatId, content);
    const existingTimeoutId = draftSaveTimeoutsRef.current.get(chatId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      draftSaveTimeoutsRef.current.delete(chatId);
      void persistDraft(
        chatId,
        pendingDraftContentsRef.current.get(chatId) ?? content
      ).catch(() => undefined);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    draftSaveTimeoutsRef.current.set(chatId, timeoutId);
  });

  const handleComposerChange = useEffectEvent((chatId: string | null, nextValue: string) => {
    if (!chatId) {
      return;
    }

    setDraftsByChatId((current) => ({
      ...current,
      [chatId]: nextValue,
    }));
    scheduleDraftSave(chatId, nextValue);
  });

  const focusComposer = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      const length = composerTextareaRef.current?.value.length ?? 0;
      composerTextareaRef.current?.setSelectionRange(length, length);
    });
  });

  const clearDraftForChat = useEffectEvent((chatId: string) => {
    const timeoutId = draftSaveTimeoutsRef.current.get(chatId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      draftSaveTimeoutsRef.current.delete(chatId);
    }
    pendingDraftContentsRef.current.delete(chatId);
    draftSyncLocksRef.current.delete(chatId);
    updateDraftsQueryData((current) => (current ?? []).filter((draft) => draft.chatId !== chatId));
    setDraftsByChatId((current) => {
      if (!(chatId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[chatId];
      return next;
    });
    void deleteChatDraft(token, chatId).catch(() => undefined);
  });

  useEffect(() => {
    if (draftsQuery.data === undefined) {
      return;
    }

    const serverDraftsByChatId = Object.fromEntries(
      draftsQuery.data.map((draft) => [draft.chatId, draft.content])
    );
    setDraftsByChatId((current) => {
      const next = { ...current };
      let changed = false;

      draftsQuery.data.forEach((draft) => {
        if (draftSyncLocksRef.current.has(draft.chatId)) {
          return;
        }

        if (next[draft.chatId] !== draft.content) {
          next[draft.chatId] = draft.content;
          changed = true;
        }
      });

      Object.keys(next).forEach((chatId) => {
        if (draftSyncLocksRef.current.has(chatId)) {
          return;
        }

        if (!(chatId in serverDraftsByChatId)) {
          delete next[chatId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [draftsQuery.data]);

  useEffect(() => {
    const handlePageHide = () => {
      flushPendingDraftSaves();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      flushPendingDraftSaves();
    };
  }, [flushPendingDraftSaves]);

  return {
    activeDraft: activeChatId ? draftsByChatId[activeChatId] ?? "" : "",
    clearDraftForChat,
    composerTextareaRef,
    draftsByChatId,
    draftsQuery,
    focusComposer,
    handleComposerChange,
    scheduleDraftSave,
    setDraftsByChatId,
  };
}
