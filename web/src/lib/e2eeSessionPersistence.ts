export type RememberedDeviceSessionRecord = {
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export function isRememberedDeviceSessionRecord(
  value: unknown
): value is RememberedDeviceSessionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RememberedDeviceSessionRecord>;
  return (
    typeof candidate.salt === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.ciphertext === "string"
  );
}

export function isValidSessionCollection<SessionRecord>(
  value: unknown,
  validateSession: (session: unknown) => session is SessionRecord
): value is Record<string, SessionRecord> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((session) => validateSession(session));
}

export async function readRememberedDeviceSessions<SessionRecord>(options: {
  userId: string;
  readUnlockedIdentity: (userId: string) => { privateKey: string } | null;
  getRememberedDeviceSessionStorageKey: (userId: string) => string;
  decryptRememberedDeviceSessions: (
    privateKey: string,
    record: RememberedDeviceSessionRecord
  ) => Promise<string | null>;
  validateSessionCollection: (value: unknown) => value is Record<string, SessionRecord>;
  removeRememberedDeviceSessions: (userId: string) => void;
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
      options.getRememberedDeviceSessionStorageKey(options.userId)
    );
    if (!rawValue) {
      return null;
    }

    const parsedRecord = JSON.parse(rawValue) as unknown;
    if (!isRememberedDeviceSessionRecord(parsedRecord)) {
      options.removeRememberedDeviceSessions(options.userId);
      return null;
    }

    const sessionsJson = await options.decryptRememberedDeviceSessions(
      identity.privateKey,
      parsedRecord
    );
    if (!sessionsJson) {
      options.removeRememberedDeviceSessions(options.userId);
      return null;
    }

    const parsedSessions = JSON.parse(sessionsJson) as unknown;
    return options.validateSessionCollection(parsedSessions) ? parsedSessions : null;
  } catch {
    options.removeRememberedDeviceSessions(options.userId);
    return null;
  }
}

export async function rememberDeviceSessions<SessionRecord>(options: {
  userId: string;
  sessions: Record<string, SessionRecord>;
  readUnlockedIdentity: (userId: string) => { privateKey: string } | null;
  sanitizeStoredDeviceSessions: (
    sessions: Record<string, SessionRecord>
  ) => Record<string, SessionRecord>;
  encryptRememberedDeviceSessions: (
    privateKey: string,
    sessions: Record<string, SessionRecord>
  ) => Promise<RememberedDeviceSessionRecord>;
  getRememberedDeviceSessionStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const identity = options.readUnlockedIdentity(options.userId);
  if (!identity) {
    return;
  }

  try {
    const record = await options.encryptRememberedDeviceSessions(
      identity.privateKey,
      options.sanitizeStoredDeviceSessions(options.sessions)
    );
    window.localStorage.setItem(
      options.getRememberedDeviceSessionStorageKey(options.userId),
      JSON.stringify(record)
    );
  } catch {
    return;
  }
}

export async function encryptRememberedDeviceSessions<SessionRecord>(options: {
  privateKey: string;
  sessions: Record<string, SessionRecord>;
  kdfIterations: number;
  randomBytes: (length: number) => Uint8Array;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  bytesToBase64: (value: Uint8Array) => string;
  textEncoder: TextEncoder;
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
    options.textEncoder.encode(JSON.stringify(options.sessions))
  );

  return {
    salt: options.bytesToBase64(salt),
    iv: options.bytesToBase64(iv),
    ciphertext: options.bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  } satisfies RememberedDeviceSessionRecord;
}

export async function decryptRememberedDeviceSessions(options: {
  privateKey: string;
  record: RememberedDeviceSessionRecord;
  kdfIterations: number;
  deriveWrappingKey: (
    privateKey: string,
    salt: Uint8Array,
    iterations: number
  ) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  textDecoder: TextDecoder;
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

export function removeRememberedDeviceSessions(options: {
  userId: string;
  getRememberedDeviceSessionStorageKey: (userId: string) => string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(
      options.getRememberedDeviceSessionStorageKey(options.userId)
    );
  } catch {
    return;
  }
}
