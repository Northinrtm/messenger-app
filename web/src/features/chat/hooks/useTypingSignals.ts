import { useEffect, useEffectEvent, useRef, useState } from "react";
import { publishTypingEvent } from "../../../lib/realtime";
import type { Participant } from "../../../lib/types";
import { removeTypingParticipant } from "../typingState";
import {
  getTypingIndicatorClearDelay,
  shouldSendTypingHeartbeat,
} from "../typingRealtime";

type UseTypingSignalsOptions = {
  activeChatId: string | null;
  activeDraft: string;
  composerChatId: string | null;
  heartbeatMs: number;
  idleMs: number;
  minVisibleMs: number;
  ttlMs: number;
  setComposerDraft: (chatId: string, nextValue: string) => void;
};

export function useTypingSignals({
  activeChatId,
  activeDraft,
  composerChatId,
  heartbeatMs,
  idleMs,
  minVisibleMs,
  ttlMs,
  setComposerDraft,
}: UseTypingSignalsOptions) {
  const [typingByChatId, setTypingByChatId] = useState<Record<string, Participant[]>>({});
  const typingTimeoutsRef = useRef(new Map<string, number>());
  const typingVisibleSinceRef = useRef(new Map<string, number>());
  const typingSignalRef = useRef<{ chatId: string | null; active: boolean; lastSentAt: number }>({
    chatId: null,
    active: false,
    lastSentAt: 0,
  });
  const typingActivityRef = useRef<{ chatId: string | null; lastInputAt: number }>({
    chatId: null,
    lastInputAt: 0,
  });
  const previousActiveChatIdRef = useRef<string | null>(null);

  const clearTypingParticipant = useEffectEvent((chatId: string, participantId: string) => {
    const key = `${chatId}:${participantId}`;
    const timeoutId = typingTimeoutsRef.current.get(key);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      typingTimeoutsRef.current.delete(key);
    }
    typingVisibleSinceRef.current.delete(key);

    setTypingByChatId((current) => removeTypingParticipant(current, chatId, participantId));
  });

  const syncTypingState = useEffectEvent((chatId: string, typing: boolean) => {
    return publishTypingEvent(chatId, typing);
  });

  const sendTypingHeartbeat = useEffectEvent((chatId: string) => {
    const now = Date.now();
    if (!shouldSendTypingHeartbeat(typingActivityRef.current, chatId, now, idleMs)) {
      return;
    }

    const currentSignal = typingSignalRef.current;

    if (currentSignal.active && currentSignal.chatId && currentSignal.chatId !== chatId) {
      const sentStop = syncTypingState(currentSignal.chatId, false);
      typingSignalRef.current = {
        chatId: currentSignal.chatId,
        active: false,
        lastSentAt: sentStop ? now : 0,
      };
    }

    const nextSignal = typingSignalRef.current;
    if (
      nextSignal.active &&
      nextSignal.chatId === chatId &&
      now - nextSignal.lastSentAt < heartbeatMs
    ) {
      return;
    }

    const sentHeartbeat = syncTypingState(chatId, true);
    if (!sentHeartbeat) {
      typingSignalRef.current = {
        chatId,
        active: false,
        lastSentAt: 0,
      };
      return;
    }

    typingSignalRef.current = {
      chatId,
      active: true,
      lastSentAt: now,
    };
  });

  const stopTyping = useEffectEvent((chatId?: string | null) => {
    const currentSignal = typingSignalRef.current;
    const targetChatId = chatId ?? currentSignal.chatId;
    if (targetChatId && typingActivityRef.current.chatId === targetChatId) {
      typingActivityRef.current = {
        chatId: targetChatId,
        lastInputAt: 0,
      };
    }

    if (!targetChatId || !currentSignal.active || currentSignal.chatId !== targetChatId) {
      return;
    }

    const sentStop = syncTypingState(targetChatId, false);
    typingSignalRef.current = {
      chatId: sentStop ? targetChatId : null,
      active: false,
      lastSentAt: 0,
    };
  });

  const scheduleTypingTimeout = useEffectEvent((chatId: string, participantId: string) => {
    const key = `${chatId}:${participantId}`;
    const existingTimeoutId = typingTimeoutsRef.current.get(key);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }
    if (!typingVisibleSinceRef.current.has(key)) {
      typingVisibleSinceRef.current.set(key, Date.now());
    }

    const timeoutId = window.setTimeout(() => {
      clearTypingParticipant(chatId, participantId);
    }, ttlMs);
    typingTimeoutsRef.current.set(key, timeoutId);
  });

  const scheduleTypingStop = useEffectEvent((chatId: string, participantId: string) => {
    const key = `${chatId}:${participantId}`;
    const existingTimeoutId = typingTimeoutsRef.current.get(key);
    if (existingTimeoutId !== undefined) {
      window.clearTimeout(existingTimeoutId);
    }

    const delayMs = getTypingIndicatorClearDelay(
      typingVisibleSinceRef.current.get(key),
      Date.now(),
      minVisibleMs
    );
    if (delayMs <= 0) {
      clearTypingParticipant(chatId, participantId);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearTypingParticipant(chatId, participantId);
    }, delayMs);
    typingTimeoutsRef.current.set(key, timeoutId);
  });

  const handleComposerChange = useEffectEvent((nextValue: string) => {
    if (!composerChatId) {
      return;
    }

    setComposerDraft(composerChatId, nextValue);

    if (nextValue.trim()) {
      typingActivityRef.current = {
        chatId: composerChatId,
        lastInputAt: Date.now(),
      };
      sendTypingHeartbeat(composerChatId);
      return;
    }

    typingActivityRef.current = {
      chatId: composerChatId,
      lastInputAt: 0,
    };
    stopTyping(composerChatId);
  });

  useEffect(() => {
    return () => {
      typingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      typingTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    const previousChatId = previousActiveChatIdRef.current;
    if (previousChatId && previousChatId !== activeChatId) {
      stopTyping(previousChatId);
    }

    previousActiveChatIdRef.current = activeChatId;
  }, [activeChatId, stopTyping]);

  useEffect(() => {
    if (!activeChatId || !activeDraft.trim()) {
      if (activeChatId) {
        stopTyping(activeChatId);
      } else {
        stopTyping();
      }
      return;
    }

    const tick = () => {
      const activity = typingActivityRef.current;
      if (activity.chatId !== activeChatId || activity.lastInputAt === 0) {
        stopTyping(activeChatId);
        return;
      }

      if (Date.now() - activity.lastInputAt > idleMs) {
        stopTyping(activeChatId);
        return;
      }

      sendTypingHeartbeat(activeChatId);
    };

    tick();
    const intervalId = window.setInterval(tick, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeChatId, activeDraft, idleMs, sendTypingHeartbeat, stopTyping]);

  return {
    clearTypingParticipant,
    handleComposerChange,
    scheduleTypingStop,
    scheduleTypingTimeout,
    sendTypingHeartbeat,
    setTypingByChatId,
    stopTyping,
    typingByChatId,
  };
}
