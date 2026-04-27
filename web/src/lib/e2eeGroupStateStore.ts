import type {
  GroupHistoryKeyRecord,
  GroupHistoryKeyState,
  GroupInboundSenderChainRecord,
  GroupSenderChainRecord,
  GroupSenderChainState,
} from "./e2eeGroupEngine";

type RememberedGroupSenderChainStateRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type UnlockedIdentityLike = {
  privateKey: string;
};

function isValidGroupSenderChainRecord(
  value: unknown
): value is GroupSenderChainRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<GroupSenderChainRecord>;
  return (
    typeof parsed.chatId === "string" &&
    typeof parsed.ownMaterialId === "string" &&
    typeof parsed.senderDeviceId === "string" &&
    typeof parsed.senderKeyId === "string" &&
    typeof parsed.recipientDeviceSetHash === "string" &&
    typeof parsed.chainKey === "string" &&
    typeof parsed.nextMessageCounter === "number" &&
    typeof parsed.createdAt === "string"
  );
}

function isValidGroupInboundSenderChainRecord(
  value: unknown
): value is GroupInboundSenderChainRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<GroupInboundSenderChainRecord>;
  return (
    typeof parsed.chatId === "string" &&
    typeof parsed.senderUserId === "string" &&
    typeof parsed.senderDeviceId === "string" &&
    typeof parsed.senderKeyId === "string" &&
    typeof parsed.nextChainKey === "string" &&
    typeof parsed.nextMessageCounter === "number" &&
    typeof parsed.updatedAt === "string" &&
    (typeof parsed.cachedMessageKeys === "undefined" ||
      (parsed.cachedMessageKeys !== null &&
        typeof parsed.cachedMessageKeys === "object" &&
        Object.values(parsed.cachedMessageKeys).every(
          (entry) => typeof entry === "string"
        )))
  );
}

function isValidGroupSenderChainCollection(
  value: unknown
): value is Record<string, GroupSenderChainRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) =>
    isValidGroupSenderChainRecord(entry)
  );
}

function isValidGroupInboundSenderChainCollection(
  value: unknown
): value is Record<string, GroupInboundSenderChainRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) =>
    isValidGroupInboundSenderChainRecord(entry)
  );
}

function normalizeGroupSenderChainState(
  value: unknown
): GroupSenderChainState | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isValidGroupSenderChainCollection(
      (value as Partial<GroupSenderChainState>).outboundChains ?? {}
    ) &&
    isValidGroupInboundSenderChainCollection(
      (value as Partial<GroupSenderChainState>).inboundChains ?? {}
    )
  ) {
    return value as GroupSenderChainState;
  }

  if (isValidGroupSenderChainCollection(value)) {
    return {
      outboundChains: value,
      inboundChains: {},
    };
  }

  return null;
}

function normalizeGroupHistoryKeyRecord(
  value: unknown
): GroupHistoryKeyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyRecord>;
  if (
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.keyMaterial !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return parsed as GroupHistoryKeyRecord;
}

function normalizeGroupHistoryKeyState(
  value: unknown
): GroupHistoryKeyState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<GroupHistoryKeyState>;
  if (
    !parsed.currentKeyIdsByChatId ||
    typeof parsed.currentKeyIdsByChatId !== "object" ||
    Array.isArray(parsed.currentKeyIdsByChatId) ||
    !parsed.keysById ||
    typeof parsed.keysById !== "object" ||
    Array.isArray(parsed.keysById)
  ) {
    return null;
  }

  const currentKeyIdsByChatId = Object.fromEntries(
    Object.entries(parsed.currentKeyIdsByChatId).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
  const keysById = Object.fromEntries(
    Object.entries(parsed.keysById)
      .map(([keyId, entry]) => [keyId, normalizeGroupHistoryKeyRecord(entry)] as const)
      .filter(
        (entry): entry is [string, GroupHistoryKeyRecord] => entry[1] !== null
      )
  );

  return {
    currentKeyIdsByChatId: Object.fromEntries(
      Object.entries(currentKeyIdsByChatId).filter(([, keyId]) =>
        Boolean(keysById[keyId])
      )
    ),
    keysById,
  };
}

export async function encryptRememberedGroupSenderChainState(options: {
  privateKey: string;
  state: GroupSenderChainState;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  bytesToBase64: (bytes: Uint8Array) => string;
  textEncoder: TextEncoder;
  kdfIterations: number;
}) {
  const salt = options.randomBytes(16);
  const iv = options.randomBytes(12);
  const wrappingKey = await options.deriveWrappingKey(
    options.privateKey,
    salt,
    options.kdfIterations
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    wrappingKey,
    options.textEncoder.encode(JSON.stringify(options.state))
  );

  return {
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  } satisfies RememberedGroupSenderChainStateRecord;
}

export async function decryptRememberedGroupSenderChainState(options: {
  privateKey: string;
  record: RememberedGroupSenderChainStateRecord;
  base64ToBytes: (value: string) => Uint8Array;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  textDecoder: TextDecoder;
  kdfIterations: number;
}) {
  try {
    const salt = options.base64ToBytes(options.record.salt);
    const iv = options.base64ToBytes(options.record.iv);
    const ciphertext = options.base64ToBytes(options.record.ciphertext);
    const wrappingKey = await options.deriveWrappingKey(
      options.privateKey,
      salt,
      options.kdfIterations
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
      },
      wrappingKey,
      ciphertext as BufferSource
    );
    return options.textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

export async function readRememberedGroupSenderChainState(options: {
  userId: string;
  readUnlockedIdentity: (userId: string) => UnlockedIdentityLike | null;
  getRememberedGroupSenderChainStorageKey: (userId: string) => string;
  decryptRememberedGroupSenderChainState: (
    privateKey: string,
    record: RememberedGroupSenderChainStateRecord
  ) => Promise<string | null>;
  removeRememberedGroupSenderChainState: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  const identity = options.readUnlockedIdentity(options.userId);
  if (!identity) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      options.getRememberedGroupSenderChainStorageKey(options.userId)
    );
    if (!rawValue) {
      return null;
    }

    const parsedRecord =
      JSON.parse(rawValue) as Partial<RememberedGroupSenderChainStateRecord>;
    if (
      typeof parsedRecord.salt !== "string" ||
      typeof parsedRecord.iv !== "string" ||
      typeof parsedRecord.ciphertext !== "string"
    ) {
      options.removeRememberedGroupSenderChainState(options.userId);
      return null;
    }

    const stateJson = await options.decryptRememberedGroupSenderChainState(
      identity.privateKey,
      parsedRecord as RememberedGroupSenderChainStateRecord
    );
    if (!stateJson) {
      options.removeRememberedGroupSenderChainState(options.userId);
      return null;
    }

    const normalizedState = normalizeGroupSenderChainState(
      JSON.parse(stateJson) as unknown
    );
    if (!normalizedState) {
      options.removeRememberedGroupSenderChainState(options.userId);
      return null;
    }

    return normalizedState;
  } catch {
    options.removeRememberedGroupSenderChainState(options.userId);
    return null;
  }
}

export async function rememberGroupSenderChainState(options: {
  userId: string;
  state: GroupSenderChainState;
  readUnlockedIdentity: (userId: string) => UnlockedIdentityLike | null;
  encryptRememberedGroupSenderChainState: (
    privateKey: string,
    state: GroupSenderChainState
  ) => Promise<RememberedGroupSenderChainStateRecord>;
  getRememberedGroupSenderChainStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = options.readUnlockedIdentity(options.userId);
  if (!identity) {
    return;
  }

  try {
    const record = await options.encryptRememberedGroupSenderChainState(
      identity.privateKey,
      options.state
    );
    window.localStorage.setItem(
      options.getRememberedGroupSenderChainStorageKey(options.userId),
      JSON.stringify(record)
    );
  } catch {
    return;
  }
}

export async function readGroupSenderChainState(options: {
  userId: string;
  getGroupSenderChainStorageKey: (userId: string) => string;
  readRememberedGroupSenderChainState: (
    userId: string
  ) => Promise<GroupSenderChainState | null>;
  writeGroupSenderChainState: (userId: string, state: GroupSenderChainState) => void;
  markPersistentRestoredOutboundGroupChats: (
    userId: string,
    state: GroupSenderChainState
  ) => void;
  removeGroupSenderChains: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return {
      outboundChains: {},
      inboundChains: {},
    } satisfies GroupSenderChainState;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      options.getGroupSenderChainStorageKey(options.userId)
    );
    if (rawValue) {
      const parsedState = normalizeGroupSenderChainState(
        JSON.parse(rawValue) as unknown
      );
      if (parsedState) {
        return parsedState;
      }
      options.removeGroupSenderChains(options.userId);
      return {
        outboundChains: {},
        inboundChains: {},
      } satisfies GroupSenderChainState;
    }

    const rememberedState = await options.readRememberedGroupSenderChainState(
      options.userId
    );
    if (rememberedState) {
      options.writeGroupSenderChainState(options.userId, rememberedState);
      options.markPersistentRestoredOutboundGroupChats(
        options.userId,
        rememberedState
      );
      return rememberedState;
    }
  } catch {
    options.removeGroupSenderChains(options.userId);
    return {
      outboundChains: {},
      inboundChains: {},
    } satisfies GroupSenderChainState;
  }

  return {
    outboundChains: {},
    inboundChains: {},
  } satisfies GroupSenderChainState;
}

export function writeGroupSenderChainState(options: {
  userId: string;
  state: GroupSenderChainState;
  getGroupSenderChainStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      options.getGroupSenderChainStorageKey(options.userId),
      JSON.stringify(options.state)
    );
  } catch {
    return;
  }
}

export async function writeGroupSenderChains(options: {
  userId: string;
  chains: Record<string, GroupSenderChainRecord>;
  readGroupSenderChainState: (userId: string) => Promise<GroupSenderChainState>;
  writeGroupSenderChainState: (
    userId: string,
    state: GroupSenderChainState
  ) => void;
  rememberGroupSenderChainState: (
    userId: string,
    state: GroupSenderChainState
  ) => Promise<void>;
}) {
  const state = await options.readGroupSenderChainState(options.userId);
  options.writeGroupSenderChainState(options.userId, {
    ...state,
    outboundChains: options.chains,
  });
  await options.rememberGroupSenderChainState(options.userId, {
    ...state,
    outboundChains: options.chains,
  });
}

export function removeGroupSenderChains(options: {
  userId: string;
  clearPersistentRestoredOutboundGroupChats: (userId: string) => void;
  getGroupSenderChainStorageKey: (userId: string) => string;
  getRememberedGroupSenderChainStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    options.clearPersistentRestoredOutboundGroupChats(options.userId);
    window.sessionStorage.removeItem(
      options.getGroupSenderChainStorageKey(options.userId)
    );
    window.localStorage.removeItem(
      options.getRememberedGroupSenderChainStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export function removeRememberedGroupSenderChainState(options: {
  userId: string;
  getRememberedGroupSenderChainStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(
      options.getRememberedGroupSenderChainStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export async function readGroupHistoryKeyState(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
  removeGroupHistoryKeys: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return {
      currentKeyIdsByChatId: {},
      keysById: {},
    } satisfies GroupHistoryKeyState;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      options.getGroupHistoryKeyStorageKey(options.userId)
    );
    if (!rawValue) {
      return {
        currentKeyIdsByChatId: {},
        keysById: {},
      } satisfies GroupHistoryKeyState;
    }

    const parsedState = normalizeGroupHistoryKeyState(
      JSON.parse(rawValue) as unknown
    );
    if (parsedState) {
      return parsedState;
    }
  } catch {
    // Fall through to cleanup.
  }

  options.removeGroupHistoryKeys(options.userId);
  return {
    currentKeyIdsByChatId: {},
    keysById: {},
  } satisfies GroupHistoryKeyState;
}

export function writeGroupHistoryKeyState(options: {
  userId: string;
  state: GroupHistoryKeyState;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      options.getGroupHistoryKeyStorageKey(options.userId),
      JSON.stringify(options.state)
    );
  } catch {
    return;
  }
}

export function removeGroupHistoryKeys(options: {
  userId: string;
  getGroupHistoryKeyStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      options.getGroupHistoryKeyStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export async function persistGroupHistoryKeyRecord(options: {
  userId: string;
  record: GroupHistoryKeyRecord;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
  writeGroupHistoryKeyState: (
    userId: string,
    state: GroupHistoryKeyState
  ) => void;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  options.writeGroupHistoryKeyState(options.userId, {
    currentKeyIdsByChatId: {
      ...state.currentKeyIdsByChatId,
      [options.record.chatId]: options.record.historyKeyId,
    },
    keysById: {
      ...state.keysById,
      [options.record.historyKeyId]: options.record,
    },
  });
}

export async function resolveLocalGroupHistoryKeyRecord(options: {
  userId: string;
  chatId: string;
  historyKeyId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  const record = state.keysById[options.historyKeyId] ?? null;
  if (record && record.chatId === options.chatId) {
    return record;
  }

  return null;
}

export async function readCurrentGroupHistoryKeyRecord(options: {
  userId: string;
  chatId: string;
  readGroupHistoryKeyState: (userId: string) => Promise<GroupHistoryKeyState>;
}) {
  const state = await options.readGroupHistoryKeyState(options.userId);
  const currentKeyId = state.currentKeyIdsByChatId[options.chatId];
  if (!currentKeyId) {
    return null;
  }

  const record = state.keysById[currentKeyId] ?? null;
  return record?.chatId === options.chatId ? record : null;
}
