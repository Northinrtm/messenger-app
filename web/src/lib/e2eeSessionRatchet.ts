type ReceivingChainRecord = {
  chainKey: string;
  counter: number;
};

type SessionRatchetRecordLike = {
  sendingRatchetPublicKey: string;
  sendingRatchetPrivateKey: string;
  remoteRatchetPublicKey: string | null;
  sendingRatchetUsed: boolean;
  pendingSendingRatchetStep: boolean;
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  receivingChains?: Record<string, ReceivingChainRecord>;
  sendingCounter: number;
  receivingCounter: number;
  cachedMessageKeys?: Record<string, string>;
};

type EnvelopeLike = {
  senderUserId: string;
  senderDeviceId: string;
  ratchetPublicKey: string;
  messageCounter: number;
};

export function encodeRatchetCounter(counter: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, counter, false);
  return bytes;
}

export async function deriveMessageRatchetStep(options: {
  chainKey: Uint8Array;
  counter: number;
  deriveSessionSecret: (
    baseSecret: Uint8Array,
    transcript: Uint8Array,
    context: string
  ) => Promise<Uint8Array>;
}) {
  const counterBytes = encodeRatchetCounter(options.counter);
  const messageKey = await options.deriveSessionSecret(
    options.chainKey,
    counterBytes,
    "north-ratchet-message"
  );
  const nextChainKey = await options.deriveSessionSecret(
    options.chainKey,
    counterBytes,
    "north-ratchet-next"
  );
  return {
    messageKey,
    nextChainKey,
  };
}

export function buildSessionMessageCacheKey(
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number
) {
  return `${direction}|${ratchetPublicKey}|${counter}`;
}

export function resolveReceivingChain<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    "remoteRatchetPublicKey" | "receivingChainKey" | "receivingCounter" | "receivingChains"
  >,
>(sessionRecord: SessionRecord, ratchetPublicKey: string) {
  if (sessionRecord.remoteRatchetPublicKey === ratchetPublicKey) {
    return {
      chainKey: sessionRecord.receivingChainKey,
      counter: sessionRecord.receivingCounter,
    };
  }

  return sessionRecord.receivingChains?.[ratchetPublicKey] ?? null;
}

export function storeReceivingChain<
  SessionRecord extends Pick<SessionRatchetRecordLike, "receivingChains">
>(
  sessionRecord: SessionRecord,
  ratchetPublicKey: string,
  chain: ReceivingChainRecord
) {
  sessionRecord.receivingChains = {
    ...(sessionRecord.receivingChains ?? {}),
    [ratchetPublicKey]: chain,
  };
}

export function updateReceivingChain<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    "remoteRatchetPublicKey" | "receivingChainKey" | "receivingCounter" | "receivingChains"
  >,
>(
  sessionRecord: SessionRecord,
  ratchetPublicKey: string,
  chain: ReceivingChainRecord
) {
  if (sessionRecord.remoteRatchetPublicKey === ratchetPublicKey) {
    sessionRecord.receivingChainKey = chain.chainKey;
    sessionRecord.receivingCounter = chain.counter;
    return;
  }

  storeReceivingChain(sessionRecord, ratchetPublicKey, chain);
}

export function pruneCachedSessionMessageKeys(cache: Record<string, string>) {
  return cache;
}

export function cacheSessionMessageKey<
  SessionRecord extends Pick<SessionRatchetRecordLike, "cachedMessageKeys">
>(
  sessionRecord: SessionRecord,
  direction: "send" | "recv",
  ratchetPublicKey: string,
  counter: number,
  messageKey: Uint8Array,
  bytesToBase64: (value: Uint8Array) => string
) {
  const nextCache = {
    ...(sessionRecord.cachedMessageKeys ?? {}),
    [buildSessionMessageCacheKey(direction, ratchetPublicKey, counter)]: bytesToBase64(messageKey),
  };
  sessionRecord.cachedMessageKeys = pruneCachedSessionMessageKeys(nextCache);
}

export async function advanceSendingChain<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    "sendingCounter" | "sendingChainKey" | "sendingRatchetPublicKey" | "cachedMessageKeys"
  >,
>(options: {
  sessionRecord: SessionRecord;
  base64ToBytes: (value: string) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
  deriveMessageRatchetStep: (
    chainKey: Uint8Array,
    counter: number
  ) => Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }>;
}) {
  const currentCounter = options.sessionRecord.sendingCounter;
  const currentChainKey = options.base64ToBytes(options.sessionRecord.sendingChainKey);
  const ratchetStep = await options.deriveMessageRatchetStep(currentChainKey, currentCounter);
  options.sessionRecord.sendingChainKey = options.bytesToBase64(ratchetStep.nextChainKey);
  options.sessionRecord.sendingCounter = currentCounter + 1;
  cacheSessionMessageKey(
    options.sessionRecord,
    "send",
    options.sessionRecord.sendingRatchetPublicKey,
    currentCounter,
    ratchetStep.messageKey,
    options.bytesToBase64
  );
  return {
    messageCounter: currentCounter,
    messageKey: ratchetStep.messageKey,
  };
}

export async function applyOutgoingDhRatchet<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    | "remoteRatchetPublicKey"
    | "sendingRatchetUsed"
    | "sendingRatchetPublicKey"
    | "sendingRatchetPrivateKey"
    | "rootKey"
    | "sendingChainKey"
    | "sendingCounter"
    | "pendingSendingRatchetStep"
  >,
>(options: {
  sessionRecord: SessionRecord;
  deviceAgreementKeyAlgorithm: string;
  generateAsymmetricKeyPair: (
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKeyPair>;
  exportJsonWebKey: (key: CryptoKey) => Promise<string>;
  importDevicePrivateKey: (
    key: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
  importDevicePublicKey: (
    key: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
  deriveAgreementSecret: (
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ) => Promise<Uint8Array>;
  deriveSessionSecret: (
    baseSecret: Uint8Array,
    transcript: Uint8Array,
    context: string
  ) => Promise<Uint8Array>;
  base64ToBytes: (value: string) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
}) {
  if (!options.sessionRecord.remoteRatchetPublicKey) {
    return;
  }

  if (options.sessionRecord.sendingRatchetUsed) {
    const nextRatchetKeyPair = await options.generateAsymmetricKeyPair(
      options.deviceAgreementKeyAlgorithm,
      ["deriveBits"]
    );
    options.sessionRecord.sendingRatchetPublicKey = await options.exportJsonWebKey(
      nextRatchetKeyPair.publicKey
    );
    options.sessionRecord.sendingRatchetPrivateKey = await options.exportJsonWebKey(
      nextRatchetKeyPair.privateKey
    );
    options.sessionRecord.sendingRatchetUsed = false;
  }

  const sendingRatchetPrivateKey = await options.importDevicePrivateKey(
    options.sessionRecord.sendingRatchetPrivateKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteRatchetPublicKey = await options.importDevicePublicKey(
    options.sessionRecord.remoteRatchetPublicKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const dhSecret = await options.deriveAgreementSecret(
    sendingRatchetPrivateKey,
    remoteRatchetPublicKey
  );
  const nextRootKey = await options.deriveSessionSecret(
    dhSecret,
    options.base64ToBytes(options.sessionRecord.rootKey),
    "north-dh-ratchet-root"
  );
  const nextSendingChainKey = await options.deriveSessionSecret(
    nextRootKey,
    encodeRatchetCounter(0),
    "north-dh-ratchet-send"
  );

  options.sessionRecord.rootKey = options.bytesToBase64(nextRootKey);
  options.sessionRecord.sendingChainKey = options.bytesToBase64(nextSendingChainKey);
  options.sessionRecord.sendingCounter = 0;
  options.sessionRecord.sendingRatchetUsed = true;
  options.sessionRecord.pendingSendingRatchetStep = false;
}

export async function getReceivingMessageKey<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    | "cachedMessageKeys"
    | "remoteRatchetPublicKey"
    | "receivingChainKey"
    | "receivingCounter"
    | "receivingChains"
  >,
>(options: {
  sessionRecord: SessionRecord;
  ratchetPublicKey: string;
  messageCounter: number;
  deviceMaxMessageGap: number;
  base64ToBytes: (value: string) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
  deriveMessageRatchetStep: (
    chainKey: Uint8Array,
    counter: number
  ) => Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }>;
}) {
  const cacheKey = buildSessionMessageCacheKey("recv", options.ratchetPublicKey, options.messageCounter);
  const cachedMessageKey = options.sessionRecord.cachedMessageKeys?.[cacheKey];
  if (cachedMessageKey) {
    return options.base64ToBytes(cachedMessageKey);
  }

  const currentReceivingChain = resolveReceivingChain(
    options.sessionRecord,
    options.ratchetPublicKey
  );
  if (!currentReceivingChain) {
    throw new Error("Encrypted message chain is no longer available for this session");
  }

  if (options.messageCounter < currentReceivingChain.counter) {
    throw new Error("Encrypted message key is no longer available for this session");
  }
  if (options.messageCounter - currentReceivingChain.counter > options.deviceMaxMessageGap) {
    throw new Error("Encrypted message counter gap is too large for this session");
  }

  let currentCounter = currentReceivingChain.counter;
  let currentChainKey: Uint8Array = options.base64ToBytes(currentReceivingChain.chainKey);
  while (currentCounter <= options.messageCounter) {
    const ratchetStep = await options.deriveMessageRatchetStep(currentChainKey, currentCounter);
    cacheSessionMessageKey(
      options.sessionRecord,
      "recv",
      options.ratchetPublicKey,
      currentCounter,
      ratchetStep.messageKey,
      options.bytesToBase64
    );
    currentChainKey = Uint8Array.from(ratchetStep.nextChainKey);
    currentCounter += 1;
  }

  updateReceivingChain(options.sessionRecord, options.ratchetPublicKey, {
    chainKey: options.bytesToBase64(currentChainKey),
    counter: currentCounter,
  });
  const resolvedMessageKey =
    options.sessionRecord.cachedMessageKeys?.[
      buildSessionMessageCacheKey("recv", options.ratchetPublicKey, options.messageCounter)
    ];
  if (!resolvedMessageKey) {
    throw new Error("Encrypted message key could not be derived for this session");
  }

  return options.base64ToBytes(resolvedMessageKey);
}

export async function getEnvelopeMessageKey<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    | "cachedMessageKeys"
    | "remoteRatchetPublicKey"
    | "receivingChainKey"
    | "receivingCounter"
    | "receivingChains"
  >,
  Envelope extends EnvelopeLike,
>(options: {
  sessionRecord: SessionRecord;
  envelope: Envelope;
  currentUserId: string;
  currentDeviceId: string;
  base64ToBytes: (value: string) => Uint8Array;
  getReceivingMessageKey: (ratchetPublicKey: string, messageCounter: number) => Promise<Uint8Array>;
}) {
  if (
    options.envelope.senderUserId === options.currentUserId &&
    options.envelope.senderDeviceId === options.currentDeviceId
  ) {
    const ownSentMessageKey =
      options.sessionRecord.cachedMessageKeys?.[
        buildSessionMessageCacheKey(
          "send",
          options.envelope.ratchetPublicKey,
          options.envelope.messageCounter
        )
      ];
    if (ownSentMessageKey) {
      return options.base64ToBytes(ownSentMessageKey);
    }
  }

  return options.getReceivingMessageKey(
    options.envelope.ratchetPublicKey,
    options.envelope.messageCounter ?? 0
  );
}

export async function applyIncomingDhRatchet<
  SessionRecord extends Pick<
    SessionRatchetRecordLike,
    | "sendingRatchetPrivateKey"
    | "rootKey"
    | "receivingChainKey"
    | "receivingCounter"
    | "remoteRatchetPublicKey"
    | "receivingChains"
    | "sendingRatchetUsed"
    | "pendingSendingRatchetStep"
  >,
>(options: {
  sessionRecord: SessionRecord;
  remoteRatchetPublicKey: string;
  deviceAgreementKeyAlgorithm: string;
  importDevicePrivateKey: (
    key: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
  importDevicePublicKey: (
    key: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
  deriveAgreementSecret: (
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ) => Promise<Uint8Array>;
  deriveSessionSecret: (
    baseSecret: Uint8Array,
    transcript: Uint8Array,
    context: string
  ) => Promise<Uint8Array>;
  base64ToBytes: (value: string) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
}) {
  const sendingRatchetPrivateKey = await options.importDevicePrivateKey(
    options.sessionRecord.sendingRatchetPrivateKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteRatchetPublic = await options.importDevicePublicKey(
    options.remoteRatchetPublicKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const dhSecret = await options.deriveAgreementSecret(
    sendingRatchetPrivateKey,
    remoteRatchetPublic
  );
  const nextRootKey = await options.deriveSessionSecret(
    dhSecret,
    options.base64ToBytes(options.sessionRecord.rootKey),
    "north-dh-ratchet-root"
  );
  const nextReceivingChainKey = await options.deriveSessionSecret(
    nextRootKey,
    encodeRatchetCounter(0),
    "north-dh-ratchet-recv"
  );

  if (options.sessionRecord.remoteRatchetPublicKey) {
    storeReceivingChain(options.sessionRecord, options.sessionRecord.remoteRatchetPublicKey, {
      chainKey: options.sessionRecord.receivingChainKey,
      counter: options.sessionRecord.receivingCounter,
    });
  }
  options.sessionRecord.rootKey = options.bytesToBase64(nextRootKey);
  options.sessionRecord.receivingChainKey = options.bytesToBase64(nextReceivingChainKey);
  options.sessionRecord.receivingCounter = 0;
  options.sessionRecord.remoteRatchetPublicKey = options.remoteRatchetPublicKey;
  options.sessionRecord.sendingRatchetUsed = true;
  options.sessionRecord.pendingSendingRatchetStep = true;
}
