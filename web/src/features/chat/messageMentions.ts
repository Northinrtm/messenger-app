const MENTION_TOKEN_PATTERN = /@[A-Za-z][A-Za-z0-9_]{2,23}/g;
const ACTIVE_MENTION_QUERY_PATTERN = /(?:^|[\s([{"'`])@([A-Za-z0-9_]*)$/;
const INVALID_MENTION_PREFIX_PATTERN = /[A-Za-z0-9_.%+-]/;

export type ActiveMentionQuery = {
  start: number;
  end: number;
  query: string;
};

export function extractMentionUsernames(content: string) {
  if (!content.trim()) {
    return [];
  }

  const usernames = new Set<string>();
  for (const match of content.matchAll(MENTION_TOKEN_PATTERN)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (!isMentionBoundary(content, index)) {
      continue;
    }

    usernames.add(normalizeMentionUsername(value));
  }

  return [...usernames];
}

export function findActiveMentionQuery(content: string, caretPosition: number) {
  const safeCaretPosition = Math.max(0, Math.min(caretPosition, content.length));
  const beforeCaret = content.slice(0, safeCaretPosition);
  const match = beforeCaret.match(ACTIVE_MENTION_QUERY_PATTERN);
  if (!match) {
    return null;
  }

  const start = beforeCaret.lastIndexOf("@");
  if (start < 0) {
    return null;
  }

  return {
    start,
    end: safeCaretPosition,
    query: (match[1] ?? "").toLowerCase(),
  } satisfies ActiveMentionQuery;
}

export function replaceActiveMentionQuery(
  content: string,
  activeMentionQuery: ActiveMentionQuery,
  username: string
) {
  const normalizedUsername = normalizeMentionUsername(username);
  const mentionText = `@${normalizedUsername} `;
  const nextValue =
    content.slice(0, activeMentionQuery.start) +
    mentionText +
    content.slice(activeMentionQuery.end);

  return {
    value: nextValue,
    caretPosition: activeMentionQuery.start + mentionText.length,
  };
}

export function normalizeMentionUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isMentionBoundary(content: string, index: number) {
  if (index <= 0) {
    return true;
  }

  return !INVALID_MENTION_PREFIX_PATTERN.test(content[index - 1] ?? "");
}
