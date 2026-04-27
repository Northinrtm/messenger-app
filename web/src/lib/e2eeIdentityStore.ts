export type StoredLocalIdentity = {
  publicKey: string;
  privateKey: string;
};

export type RememberedUnlockedIdentityRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

type AutoUnlockedIdentityRecord = StoredLocalIdentity & {
  createdAt: string;
};

function normalizeLocalIdentity(value: unknown): StoredLocalIdentity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredLocalIdentity>;
  if (
    typeof candidate.publicKey !== "string" ||
    candidate.publicKey.length === 0 ||
    typeof candidate.privateKey !== "string" ||
    candidate.privateKey.length === 0
  ) {
    return null;
  }

  return {
    publicKey: candidate.publicKey,
    privateKey: candidate.privateKey,
  };
}

export function normalizeRememberedUnlockedIdentityRecord(
  value: unknown
): RememberedUnlockedIdentityRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RememberedUnlockedIdentityRecord>;
  if (
    typeof candidate.salt !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) {
    return null;
  }

  return {
    salt: candidate.salt,
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
  };
}

export function readUnlockedIdentity(options: {
  userId: string;
  unlockedIdentityByUserId: Map<string, StoredLocalIdentity>;
  readUnlockedIdentityFromSession: (userId: string) => StoredLocalIdentity | null;
  readUnlockedIdentityFromPersistentAutoStorage: (
    userId: string
  ) => StoredLocalIdentity | null;
  writeUnlockedIdentityToSession: (userId: string, identity: StoredLocalIdentity) => void;
}) {
  const inMemoryIdentity = options.unlockedIdentityByUserId.get(options.userId) ?? null;
  if (inMemoryIdentity) {
    return inMemoryIdentity;
  }

  const sessionIdentity = options.readUnlockedIdentityFromSession(options.userId);
  if (!sessionIdentity) {
    const persistentIdentity = options.readUnlockedIdentityFromPersistentAutoStorage(
      options.userId
    );
    if (!persistentIdentity) {
      return null;
    }

    options.unlockedIdentityByUserId.set(options.userId, persistentIdentity);
    options.writeUnlockedIdentityToSession(options.userId, persistentIdentity);
    return persistentIdentity;
  }

  options.unlockedIdentityByUserId.set(options.userId, sessionIdentity);
  return sessionIdentity;
}

export function writeUnlockedIdentity(options: {
  userId: string;
  identity: StoredLocalIdentity;
  unlockedIdentityByUserId: Map<string, StoredLocalIdentity>;
  writeUnlockedIdentityToSession: (userId: string, identity: StoredLocalIdentity) => void;
  writeUnlockedIdentityToPersistentAutoStorage: (
    userId: string,
    identity: StoredLocalIdentity
  ) => void;
}) {
  options.unlockedIdentityByUserId.set(options.userId, options.identity);
  options.writeUnlockedIdentityToSession(options.userId, options.identity);
  options.writeUnlockedIdentityToPersistentAutoStorage(options.userId, options.identity);
}

export function readRememberedUnlockedIdentityRecord(options: {
  userId: string;
  getRememberedUnlockedIdentityStorageKey: (userId: string) => string;
  removeUnlockedIdentityFromPersistentStorage: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(
      options.getRememberedUnlockedIdentityStorageKey(options.userId)
    );
    if (!rawValue) {
      return null;
    }

    const parsedRecord = normalizeRememberedUnlockedIdentityRecord(
      JSON.parse(rawValue) as unknown
    );
    if (!parsedRecord) {
      options.removeUnlockedIdentityFromPersistentStorage(options.userId);
      return null;
    }

    return parsedRecord;
  } catch {
    options.removeUnlockedIdentityFromPersistentStorage(options.userId);
    return null;
  }
}

export function writeRememberedUnlockedIdentityRecord(options: {
  userId: string;
  record: RememberedUnlockedIdentityRecord;
  getRememberedUnlockedIdentityStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      options.getRememberedUnlockedIdentityStorageKey(options.userId),
      JSON.stringify(options.record)
    );
  } catch {
    return;
  }
}

export async function decryptRememberedUnlockedIdentityRecord(options: {
  record: RememberedUnlockedIdentityRecord;
  password: string;
  deriveWrappingKey: (
    password: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  textDecoder: TextDecoder;
  kdfIterations: number;
}) {
  try {
    const wrappingKey = await options.deriveWrappingKey(
      options.password,
      options.base64ToBytes(options.record.salt),
      options.kdfIterations
    );
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: options.base64ToBytes(options.record.iv) as BufferSource,
      },
      wrappingKey,
      options.base64ToBytes(options.record.ciphertext) as BufferSource
    );
    return normalizeLocalIdentity(
      JSON.parse(options.textDecoder.decode(plaintext)) as unknown
    );
  } catch {
    return null;
  }
}

export async function readRememberedUnlockedIdentity(options: {
  userId: string;
  password: string;
  readRememberedUnlockedIdentityRecord: (
    userId: string
  ) => RememberedUnlockedIdentityRecord | null;
  decryptRememberedUnlockedIdentityRecord: (
    record: RememberedUnlockedIdentityRecord,
    password: string
  ) => Promise<StoredLocalIdentity | null>;
}) {
  const parsedRecord = options.readRememberedUnlockedIdentityRecord(options.userId);
  if (!parsedRecord) {
    return null;
  }

  return options.decryptRememberedUnlockedIdentityRecord(parsedRecord, options.password);
}

export async function rememberUnlockedIdentity(options: {
  userId: string;
  identity: StoredLocalIdentity;
  password: string;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (
    password: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  bytesToBase64: (bytes: Uint8Array) => string;
  textEncoder: TextEncoder;
  kdfIterations: number;
  writeRememberedUnlockedIdentityRecord: (
    userId: string,
    record: RememberedUnlockedIdentityRecord
  ) => void;
  now?: () => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const salt = options.randomBytes(16);
  const iv = options.randomBytes(12);
  const wrappingKey = await options.deriveWrappingKey(
    options.password,
    salt,
    options.kdfIterations
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    wrappingKey,
    options.textEncoder.encode(JSON.stringify(options.identity))
  );

  options.writeRememberedUnlockedIdentityRecord(options.userId, {
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: options.now?.() ?? new Date().toISOString(),
  });
}

export function readUnlockedIdentityFromSession(options: {
  userId: string;
  getUnlockedIdentityStorageKey: (userId: string) => string;
  removeUnlockedIdentityFromSession: (userId: string) => void;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      options.getUnlockedIdentityStorageKey(options.userId)
    );
    if (!rawValue) {
      return null;
    }

    const parsedIdentity = normalizeLocalIdentity(JSON.parse(rawValue) as unknown);
    if (!parsedIdentity) {
      options.removeUnlockedIdentityFromSession(options.userId);
      return null;
    }

    return parsedIdentity;
  } catch {
    options.removeUnlockedIdentityFromSession(options.userId);
    return null;
  }
}

export function writeUnlockedIdentityToSession(options: {
  userId: string;
  identity: StoredLocalIdentity;
  getUnlockedIdentityStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      options.getUnlockedIdentityStorageKey(options.userId),
      JSON.stringify(options.identity)
    );
  } catch {
    return;
  }
}

export function removeUnlockedIdentityFromSession(options: {
  userId: string;
  getUnlockedIdentityStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      options.getUnlockedIdentityStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export function removeUnlockedIdentityFromPersistentStorage(options: {
  userId: string;
  getAutoUnlockedIdentityStorageKey: (userId: string) => string;
  getRememberedUnlockedIdentityStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(
      options.getAutoUnlockedIdentityStorageKey(options.userId)
    );
    window.localStorage.removeItem(
      options.getRememberedUnlockedIdentityStorageKey(options.userId)
    );
  } catch {
    return;
  }
}

export function readUnlockedIdentityFromPersistentAutoStorage(options: {
  userId: string;
  getAutoUnlockedIdentityStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = options.getAutoUnlockedIdentityStorageKey(options.userId);

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedIdentity = normalizeLocalIdentity(JSON.parse(rawValue) as unknown);
    if (!parsedIdentity) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsedIdentity;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      return null;
    }
    return null;
  }
}

export function writeUnlockedIdentityToPersistentAutoStorage(options: {
  userId: string;
  identity: StoredLocalIdentity;
  getAutoUnlockedIdentityStorageKey: (userId: string) => string;
  now?: () => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const record: AutoUnlockedIdentityRecord = {
    publicKey: options.identity.publicKey,
    privateKey: options.identity.privateKey,
    createdAt: options.now?.() ?? new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      options.getAutoUnlockedIdentityStorageKey(options.userId),
      JSON.stringify(record)
    );
  } catch {
    return;
  }
}
