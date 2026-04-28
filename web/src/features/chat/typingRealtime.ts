export type TypingActivitySnapshot = {
  chatId: string | null;
  lastInputAt: number;
};

export function shouldSendTypingHeartbeat(
  activity: TypingActivitySnapshot,
  chatId: string,
  now: number,
  idleMs: number
) {
  return (
    activity.chatId === chatId &&
    activity.lastInputAt > 0 &&
    now - activity.lastInputAt <= idleMs
  );
}

export function getTypingIndicatorClearDelay(
  visibleSince: number | undefined,
  now: number,
  minVisibleMs: number
) {
  if (visibleSince === undefined || minVisibleMs <= 0) {
    return 0;
  }

  return Math.max(0, minVisibleMs - Math.max(0, now - visibleSince));
}

export function shouldProcessTypingEvent(
  lastObservedAt: number | undefined,
  nextObservedAt: number
) {
  return lastObservedAt === undefined || nextObservedAt > lastObservedAt;
}

export function parseRealtimeEventTimestamp(
  value: string | null | undefined,
  fallbackMs = Date.now()
) {
  const parsedValue = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsedValue) ? parsedValue : fallbackMs;
}
