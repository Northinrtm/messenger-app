import type {
  PreparedConversationDeviceState,
  PreparedDeviceManifestState,
} from "./e2eeDeviceDirectory";

type TimestampMap = Map<string, number>;

type ConversationStateMap = Map<string, PreparedConversationDeviceState>;
type ManifestStateMap = Map<string, PreparedDeviceManifestState>;

type ReadPreparedStateOptions<TState> = {
  preparationKey: string;
  completedPreparation: TimestampMap;
  preparedStates: Map<string, TState>;
  ttlMs: number;
  clearPreparedState: (preparationKey: string) => void;
  now?: () => number;
};

function readPreparedState<TState>(
  options: ReadPreparedStateOptions<TState>
): TState | null {
  const preparedAt = options.completedPreparation.get(options.preparationKey);
  const cachedPreparedState = options.preparedStates.get(options.preparationKey);
  if (!preparedAt || !cachedPreparedState) {
    options.clearPreparedState(options.preparationKey);
    return null;
  }

  const now = options.now ?? Date.now;
  if (now() - preparedAt >= options.ttlMs) {
    options.clearPreparedState(options.preparationKey);
    return null;
  }

  return cachedPreparedState;
}

export function readPreparedConversationDeviceState(options: {
  preparationKey: string;
  completedDevicePreparation: TimestampMap;
  preparedConversationDeviceStates: ConversationStateMap;
  ttlMs: number;
  clearPreparedConversationDeviceState: (preparationKey: string) => void;
  now?: () => number;
}) {
  return readPreparedState({
    preparationKey: options.preparationKey,
    completedPreparation: options.completedDevicePreparation,
    preparedStates: options.preparedConversationDeviceStates,
    ttlMs: options.ttlMs,
    clearPreparedState: options.clearPreparedConversationDeviceState,
    now: options.now,
  });
}

export function rememberPreparedConversationDeviceState(options: {
  preparationKey: string;
  preparedState: PreparedConversationDeviceState;
  completedDevicePreparation: TimestampMap;
  preparedConversationDeviceStates: ConversationStateMap;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  options.completedDevicePreparation.set(options.preparationKey, now());
  options.preparedConversationDeviceStates.set(options.preparationKey, {
    rawBundles: [...options.preparedState.rawBundles],
    trustedBundles: [...options.preparedState.trustedBundles],
  });
}

export function clearPreparedConversationDeviceState(options: {
  preparationKey: string;
  completedDevicePreparation: TimestampMap;
  preparedConversationDeviceStates: ConversationStateMap;
}) {
  options.completedDevicePreparation.delete(options.preparationKey);
  options.preparedConversationDeviceStates.delete(options.preparationKey);
}

export function readPreparedOwnSiblingDeviceState(options: {
  preparationKey: string;
  completedOwnSiblingDevicePreparation: TimestampMap;
  preparedOwnSiblingDeviceStates: ConversationStateMap;
  ttlMs: number;
  clearPreparedOwnSiblingDeviceState: (preparationKey: string) => void;
  now?: () => number;
}) {
  return readPreparedState({
    preparationKey: options.preparationKey,
    completedPreparation: options.completedOwnSiblingDevicePreparation,
    preparedStates: options.preparedOwnSiblingDeviceStates,
    ttlMs: options.ttlMs,
    clearPreparedState: options.clearPreparedOwnSiblingDeviceState,
    now: options.now,
  });
}

export function rememberPreparedOwnSiblingDeviceState(options: {
  preparationKey: string;
  preparedState: PreparedConversationDeviceState;
  completedOwnSiblingDevicePreparation: TimestampMap;
  preparedOwnSiblingDeviceStates: ConversationStateMap;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  options.completedOwnSiblingDevicePreparation.set(options.preparationKey, now());
  options.preparedOwnSiblingDeviceStates.set(
    options.preparationKey,
    options.preparedState
  );
}

export function clearPreparedOwnSiblingDeviceState(options: {
  preparationKey: string;
  completedOwnSiblingDevicePreparation: TimestampMap;
  preparedOwnSiblingDeviceStates: ConversationStateMap;
}) {
  options.completedOwnSiblingDevicePreparation.delete(options.preparationKey);
  options.preparedOwnSiblingDeviceStates.delete(options.preparationKey);
}

export function readPreparedDeviceManifestState(options: {
  preparationKey: string;
  completedDeviceManifestPreparation: TimestampMap;
  preparedDeviceManifestStates: ManifestStateMap;
  ttlMs: number;
  clearPreparedDeviceManifestState: (preparationKey: string) => void;
  now?: () => number;
}) {
  const cachedPreparedState = readPreparedState({
    preparationKey: options.preparationKey,
    completedPreparation: options.completedDeviceManifestPreparation,
    preparedStates: options.preparedDeviceManifestStates,
    ttlMs: options.ttlMs,
    clearPreparedState: options.clearPreparedDeviceManifestState,
    now: options.now,
  });
  if (!cachedPreparedState) {
    return null;
  }

  return {
    version: cachedPreparedState.version,
    rawBundles: [...cachedPreparedState.rawBundles],
  } satisfies PreparedDeviceManifestState;
}

export function rememberPreparedDeviceManifestState(options: {
  preparationKey: string;
  preparedState: PreparedDeviceManifestState;
  completedDeviceManifestPreparation: TimestampMap;
  preparedDeviceManifestStates: ManifestStateMap;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  options.completedDeviceManifestPreparation.set(options.preparationKey, now());
  options.preparedDeviceManifestStates.set(options.preparationKey, {
    version: options.preparedState.version,
    rawBundles: [...options.preparedState.rawBundles],
  });
}

export function clearPreparedDeviceManifestState(options: {
  preparationKey: string;
  completedDeviceManifestPreparation: TimestampMap;
  preparedDeviceManifestStates: ManifestStateMap;
}) {
  options.completedDeviceManifestPreparation.delete(options.preparationKey);
  options.preparedDeviceManifestStates.delete(options.preparationKey);
}

export function clearCompletedDevicePreparation(options: {
  userId: string;
  completedDevicePreparation: TimestampMap;
  preparedConversationDeviceStates: ConversationStateMap;
  completedOwnSiblingDevicePreparation: TimestampMap;
  preparedOwnSiblingDeviceStates: ConversationStateMap;
  completedDeviceManifestPreparation: TimestampMap;
  preparedDeviceManifestStates: ManifestStateMap;
  clearPreparedConversationDeviceState: (preparationKey: string) => void;
  clearPreparedOwnSiblingDeviceState: (preparationKey: string) => void;
  clearPreparedDeviceManifestState: (preparationKey: string) => void;
}) {
  for (const cacheKey of Array.from(options.completedDevicePreparation.keys())) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.clearPreparedConversationDeviceState(cacheKey);
    }
  }

  for (const cacheKey of Array.from(
    options.preparedConversationDeviceStates.keys()
  )) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.preparedConversationDeviceStates.delete(cacheKey);
    }
  }

  for (const cacheKey of Array.from(
    options.completedOwnSiblingDevicePreparation.keys()
  )) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.clearPreparedOwnSiblingDeviceState(cacheKey);
    }
  }

  for (const cacheKey of Array.from(
    options.preparedOwnSiblingDeviceStates.keys()
  )) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.preparedOwnSiblingDeviceStates.delete(cacheKey);
    }
  }

  for (const cacheKey of Array.from(
    options.completedDeviceManifestPreparation.keys()
  )) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.clearPreparedDeviceManifestState(cacheKey);
    }
  }

  for (const cacheKey of Array.from(options.preparedDeviceManifestStates.keys())) {
    if (cacheKey.startsWith(`${options.userId}:`)) {
      options.preparedDeviceManifestStates.delete(cacheKey);
    }
  }
}
