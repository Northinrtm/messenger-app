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
import { readLocalDrafts, removeLocalDraft, writeLocalDraft } from "../../../lib/localDrafts";
import type { ChatDraft } from "../../../lib/types";

const DRAFT_SAVE_DEBOUNCE_MS = 450;

type UseChatDraftsParams = {
  activeChatId: string | null;
  queryClient: QueryClient;
  token: string;
  userId: string;
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
  queryClient,
  token,
  userId,
}: UseChatDraftsParams): UseChatDraftsResult {
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftSaveTimeoutsRef = useRef(new Map<string, number>());
  const draftSyncLocksRef = useRef(new Set<string>());

  const draftsQuery = useQuery({
    queryKey: ["drafts", token],
    queryFn: async () => readLocalDrafts(userId),
    staleTime: 15_000,
  });

  const persistDraft = useEffectEvent(async (chatId: string, content: string) => {
    try {
      const nextDrafts = writeLocalDraft(userId, chatId, content);
      queryClient.setQueryData<ChatDraft[]>(["drafts", token], nextDrafts);
    } finally {
      if (!draftSaveTimeoutsRef.current.has(chatId)) {
        draftSyncLocksRef.current.delete(chatId);
      }
    }
  });

  const scheduleDraftSave = useEffectEvent((chatId: string, content: string) => {
    draftSyncLocksRef.current.add(chatId);
    const existingTimeoutId = draftSaveTimeoutsRef.current.get(chatId);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      draftSaveTimeoutsRef.current.delete(chatId);
      void persistDraft(chatId, content);
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
    const nextDrafts = removeLocalDraft(userId, chatId);
    queryClient.setQueryData<ChatDraft[]>(["drafts", token], nextDrafts);
    setDraftsByChatId((current) => {
      if (!(chatId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[chatId];
      return next;
    });
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
    return () => {
      draftSaveTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      draftSaveTimeoutsRef.current.clear();
    };
  }, []);

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
