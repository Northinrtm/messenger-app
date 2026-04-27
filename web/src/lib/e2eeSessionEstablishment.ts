type InitiatorOwnMaterialLike = {
  deviceId: string | null;
  materialId: string;
  identityPrivateKey: string;
  identityKeyAlgorithm: string;
};

type ResponderOwnMaterialLike = InitiatorOwnMaterialLike & {
  deviceId: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeyPrivateKey: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekeys: Array<{ keyId: number; privateKey: string }>;
  retiredOneTimePrekeys?: Array<{ keyId: number; privateKey: string; expiresAt: string }>;
  retiredSignedPrekeys?: Array<{
    signedPrekeyId: number;
    signedPrekeyPublicKey: string;
    signedPrekeyPrivateKey: string;
    signedPrekeyAlgorithm: string;
    expiresAt: string;
  }>;
};

type BundleLike = {
  userId: string;
  deviceId: string;
  identityKey: string;
  identityKeyAlgorithm: string;
  identitySignatureKey: string;
  identitySignatureKeyAlgorithm: string;
  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;
  signedPrekeyAlgorithm: string;
  oneTimePrekey: { keyId: number; publicKey: string } | null;
};

type DirectEnvelopeLike = {
  senderUserId: string;
  senderDeviceId: string;
  senderIdentityKey: string;
  senderIdentitySignatureKey: string;
  initiatorEphemeralPublicKey: string;
  ratchetPublicKey?: string | null;
  recipientSignedPrekeyId: number;
  recipientOneTimePrekeyId: number | null;
};

type SessionRecordLike = {
  sessionId: string;
  peerUserId: string;
  peerDeviceId: string;
  sessionOrigin?: "initiator" | "responder";
  ownMaterialId: string;
  remoteIdentityKey: string;
  remoteIdentitySignatureKey: string;
  remoteSignedPrekeyId: number;
  remoteSignedPrekeyPublicKey: string;
  remoteOneTimePrekeyId: number | null;
  initiatorEphemeralPublicKey: string;
  sendingRatchetPublicKey: string;
  sendingRatchetPrivateKey: string;
  remoteRatchetPublicKey: string | null;
  sendingRatchetUsed: boolean;
  pendingSendingRatchetStep: boolean;
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  sendingCounter: number;
  receivingCounter: number;
  cachedMessageKeys?: Record<string, string>;
  establishedAt: string;
};

function concatByteArrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function buildInitialDeviceSessionTranscript(
  params: {
    initiatorUserId: string;
    initiatorDeviceId: string | null;
    responderUserId: string;
    responderDeviceId: string;
    responderSignedPrekeyId: number;
    responderOneTimePrekeyId: number | null;
    initiatorEphemeralPublicKey: string;
  },
  options: {
    textEncoder: TextEncoder;
    createInitializingError: () => Error;
  }
) {
  if (!params.initiatorDeviceId) {
    throw options.createInitializingError();
  }

  return options.textEncoder.encode(
    JSON.stringify({
      initiatorUserId: params.initiatorUserId,
      initiatorDeviceId: params.initiatorDeviceId,
      responderUserId: params.responderUserId,
      responderDeviceId: params.responderDeviceId,
      responderSignedPrekeyId: params.responderSignedPrekeyId,
      responderOneTimePrekeyId: params.responderOneTimePrekeyId,
      initiatorEphemeralPublicKey: params.initiatorEphemeralPublicKey,
    })
  );
}

function resolveRecipientSignedPrekeyMaterial(
  ownMaterial: ResponderOwnMaterialLike,
  signedPrekeyId: number,
  pruneRetiredSignedPrekeys: (
    prekeys: ResponderOwnMaterialLike["retiredSignedPrekeys"]
  ) => NonNullable<ResponderOwnMaterialLike["retiredSignedPrekeys"]>
) {
  if (ownMaterial.signedPrekeyId === signedPrekeyId) {
    return {
      signedPrekeyId: ownMaterial.signedPrekeyId,
      signedPrekeyPublicKey: ownMaterial.signedPrekeyPublicKey,
      signedPrekeyPrivateKey: ownMaterial.signedPrekeyPrivateKey,
      signedPrekeyAlgorithm: ownMaterial.signedPrekeyAlgorithm,
    };
  }

  const retiredSignedPrekeys = pruneRetiredSignedPrekeys(ownMaterial.retiredSignedPrekeys);
  const retiredSignedPrekey = retiredSignedPrekeys.find(
    (prekey) => prekey.signedPrekeyId === signedPrekeyId
  );
  if (!retiredSignedPrekey) {
    throw new Error("Referenced signed prekey is not available on this device");
  }

  ownMaterial.retiredSignedPrekeys = retiredSignedPrekeys;
  return retiredSignedPrekey;
}

function resolveRecipientOneTimePrekeyMaterial(
  ownMaterial: ResponderOwnMaterialLike,
  keyId: number,
  pruneRetiredOneTimePrekeys: (
    prekeys: ResponderOwnMaterialLike["retiredOneTimePrekeys"]
  ) => NonNullable<ResponderOwnMaterialLike["retiredOneTimePrekeys"]>
) {
  const currentPrekey = ownMaterial.oneTimePrekeys.find((prekey) => prekey.keyId === keyId);
  if (currentPrekey) {
    return currentPrekey;
  }

  const retiredOneTimePrekeys = pruneRetiredOneTimePrekeys(ownMaterial.retiredOneTimePrekeys);
  const retiredPrekey = retiredOneTimePrekeys.find((prekey) => prekey.keyId === keyId);
  if (!retiredPrekey) {
    return null;
  }

  ownMaterial.retiredOneTimePrekeys = retiredOneTimePrekeys;
  return retiredPrekey;
}

function consumeRecipientOneTimePrekeyMaterial(
  ownMaterial: ResponderOwnMaterialLike,
  keyId: number,
  pruneRetiredOneTimePrekeys: (
    prekeys: ResponderOwnMaterialLike["retiredOneTimePrekeys"]
  ) => NonNullable<ResponderOwnMaterialLike["retiredOneTimePrekeys"]>
) {
  ownMaterial.oneTimePrekeys = ownMaterial.oneTimePrekeys.filter((prekey) => prekey.keyId !== keyId);
  ownMaterial.retiredOneTimePrekeys = pruneRetiredOneTimePrekeys(
    ownMaterial.retiredOneTimePrekeys
  ).filter((prekey) => prekey.keyId !== keyId);
}

export async function verifySignedPrekeySignature(options: {
  bundle: BundleLike;
  importDevicePublicKey: (
    key: string,
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKey>;
  base64ToBytes: (value: string) => Uint8Array;
  buildSignedPrekeySignaturePayload: (serializedPublicKey: string) => Uint8Array;
  subtleVerify: (
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    signature: BufferSource,
    data: BufferSource
  ) => Promise<boolean>;
}) {
  const signatureKey = await options.importDevicePublicKey(
    options.bundle.identitySignatureKey,
    options.bundle.identitySignatureKeyAlgorithm,
    ["verify"]
  );
  return options.subtleVerify(
    { name: options.bundle.identitySignatureKeyAlgorithm } as AlgorithmIdentifier,
    signatureKey,
    options.base64ToBytes(options.bundle.signedPrekeySignature) as BufferSource,
    options.buildSignedPrekeySignaturePayload(
      options.bundle.signedPrekeyPublicKey
    ) as BufferSource
  );
}

export async function establishInitiatorDeviceSession<
  OwnMaterial extends InitiatorOwnMaterialLike,
  SessionRecord extends SessionRecordLike,
>(options: {
  currentUserId: string;
  ownMaterial: OwnMaterial;
  bundle: BundleLike;
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
  generateAsymmetricKeyPair: (
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKeyPair>;
  exportJsonWebKey: (key: CryptoKey) => Promise<string>;
  deriveAgreementSecret: (
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ) => Promise<Uint8Array>;
  deriveSessionSecret: (
    baseSecret: Uint8Array,
    transcript: Uint8Array,
    context: string
  ) => Promise<Uint8Array>;
  bytesToBase64: (value: Uint8Array) => string;
  textEncoder: TextEncoder;
  createInitializingError: () => Error;
  createSessionId: () => string;
  now: () => string;
}) {
  const ownIdentityPrivateKey = await options.importDevicePrivateKey(
    options.ownMaterial.identityPrivateKey,
    options.ownMaterial.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteIdentityPublicKey = await options.importDevicePublicKey(
    options.bundle.identityKey,
    options.bundle.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const remoteSignedPrekeyPublicKey = await options.importDevicePublicKey(
    options.bundle.signedPrekeyPublicKey,
    options.bundle.signedPrekeyAlgorithm,
    ["deriveBits"]
  );
  const initiatorEphemeralKeyPair = await options.generateAsymmetricKeyPair(
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const sendingRatchetKeyPair = await options.generateAsymmetricKeyPair(
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const initiatorEphemeralPublicKey = await options.exportJsonWebKey(
    initiatorEphemeralKeyPair.publicKey
  );

  const sharedSecrets = [
    await options.deriveAgreementSecret(ownIdentityPrivateKey, remoteSignedPrekeyPublicKey),
    await options.deriveAgreementSecret(
      initiatorEphemeralKeyPair.privateKey,
      remoteIdentityPublicKey
    ),
    await options.deriveAgreementSecret(
      initiatorEphemeralKeyPair.privateKey,
      remoteSignedPrekeyPublicKey
    ),
  ];

  let remoteOneTimePrekeyId: number | null = null;
  if (options.bundle.oneTimePrekey) {
    const remoteOneTimePrekeyPublicKey = await options.importDevicePublicKey(
      options.bundle.oneTimePrekey.publicKey,
      options.deviceAgreementKeyAlgorithm,
      ["deriveBits"]
    );
    sharedSecrets.push(
      await options.deriveAgreementSecret(
        initiatorEphemeralKeyPair.privateKey,
        remoteOneTimePrekeyPublicKey
      )
    );
    remoteOneTimePrekeyId = options.bundle.oneTimePrekey.keyId;
  }

  const transcript = buildInitialDeviceSessionTranscript(
    {
      initiatorUserId: options.currentUserId,
      initiatorDeviceId: options.ownMaterial.deviceId,
      responderUserId: options.bundle.userId,
      responderDeviceId: options.bundle.deviceId,
      responderSignedPrekeyId: options.bundle.signedPrekeyId,
      responderOneTimePrekeyId: remoteOneTimePrekeyId,
      initiatorEphemeralPublicKey,
    },
    {
      textEncoder: options.textEncoder,
      createInitializingError: options.createInitializingError,
    }
  );
  const masterSecret = concatByteArrays(sharedSecrets);
  const rootKey = await options.deriveSessionSecret(masterSecret, transcript, "north-x3dh-root");
  const sendingChainKey = await options.deriveSessionSecret(
    rootKey,
    transcript,
    "north-x3dh-send"
  );
  const receivingChainKey = await options.deriveSessionSecret(
    rootKey,
    transcript,
    "north-x3dh-recv"
  );

  return {
    sessionId: options.createSessionId(),
    peerUserId: options.bundle.userId,
    peerDeviceId: options.bundle.deviceId,
    sessionOrigin: "initiator",
    ownMaterialId: options.ownMaterial.materialId,
    remoteIdentityKey: options.bundle.identityKey,
    remoteIdentitySignatureKey: options.bundle.identitySignatureKey,
    remoteSignedPrekeyId: options.bundle.signedPrekeyId,
    remoteSignedPrekeyPublicKey: options.bundle.signedPrekeyPublicKey,
    remoteOneTimePrekeyId,
    initiatorEphemeralPublicKey,
    sendingRatchetPublicKey: await options.exportJsonWebKey(sendingRatchetKeyPair.publicKey),
    sendingRatchetPrivateKey: await options.exportJsonWebKey(sendingRatchetKeyPair.privateKey),
    remoteRatchetPublicKey: null,
    sendingRatchetUsed: false,
    pendingSendingRatchetStep: false,
    rootKey: options.bytesToBase64(rootKey),
    sendingChainKey: options.bytesToBase64(sendingChainKey),
    receivingChainKey: options.bytesToBase64(receivingChainKey),
    sendingCounter: 0,
    receivingCounter: 0,
    cachedMessageKeys: {},
    establishedAt: options.now(),
  } as SessionRecord;
}

export async function establishResponderDeviceSession<
  OwnMaterial extends ResponderOwnMaterialLike,
  SessionRecord extends SessionRecordLike,
>(options: {
  currentUserId: string;
  ownMaterial: OwnMaterial;
  envelope: DirectEnvelopeLike;
  deviceAgreementKeyAlgorithm: string;
  pruneRetiredSignedPrekeys: (
    prekeys: OwnMaterial["retiredSignedPrekeys"]
  ) => NonNullable<OwnMaterial["retiredSignedPrekeys"]>;
  pruneRetiredOneTimePrekeys: (
    prekeys: OwnMaterial["retiredOneTimePrekeys"]
  ) => NonNullable<OwnMaterial["retiredOneTimePrekeys"]>;
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
  generateAsymmetricKeyPair: (
    algorithm: string,
    usages: KeyUsage[]
  ) => Promise<CryptoKeyPair>;
  exportJsonWebKey: (key: CryptoKey) => Promise<string>;
  deriveAgreementSecret: (
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ) => Promise<Uint8Array>;
  deriveSessionSecret: (
    baseSecret: Uint8Array,
    transcript: Uint8Array,
    context: string
  ) => Promise<Uint8Array>;
  bytesToBase64: (value: Uint8Array) => string;
  textEncoder: TextEncoder;
  createInitializingError: () => Error;
  createSessionId: () => string;
  now: () => string;
}) {
  const ownIdentityPrivateKey = await options.importDevicePrivateKey(
    options.ownMaterial.identityPrivateKey,
    options.ownMaterial.identityKeyAlgorithm,
    ["deriveBits"]
  );
  const recipientSignedPrekey = resolveRecipientSignedPrekeyMaterial(
    options.ownMaterial,
    options.envelope.recipientSignedPrekeyId,
    options.pruneRetiredSignedPrekeys
  );
  const ownSignedPrekeyPrivateKey = await options.importDevicePrivateKey(
    recipientSignedPrekey.signedPrekeyPrivateKey,
    recipientSignedPrekey.signedPrekeyAlgorithm,
    ["deriveBits"]
  );
  const senderIdentityPublicKey = await options.importDevicePublicKey(
    options.envelope.senderIdentityKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const sendingRatchetKeyPair = await options.generateAsymmetricKeyPair(
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );
  const initiatorEphemeralPublicKey = await options.importDevicePublicKey(
    options.envelope.initiatorEphemeralPublicKey,
    options.deviceAgreementKeyAlgorithm,
    ["deriveBits"]
  );

  const sharedSecrets = [
    await options.deriveAgreementSecret(ownSignedPrekeyPrivateKey, senderIdentityPublicKey),
    await options.deriveAgreementSecret(ownIdentityPrivateKey, initiatorEphemeralPublicKey),
    await options.deriveAgreementSecret(ownSignedPrekeyPrivateKey, initiatorEphemeralPublicKey),
  ];

  if (options.envelope.recipientOneTimePrekeyId !== null) {
    const oneTimePrekey = resolveRecipientOneTimePrekeyMaterial(
      options.ownMaterial,
      options.envelope.recipientOneTimePrekeyId,
      options.pruneRetiredOneTimePrekeys
    );
    if (!oneTimePrekey) {
      throw new Error("Referenced one-time prekey is not available on this device");
    }
    const oneTimePrekeyPrivateKey = await options.importDevicePrivateKey(
      oneTimePrekey.privateKey,
      options.deviceAgreementKeyAlgorithm,
      ["deriveBits"]
    );
    sharedSecrets.push(
      await options.deriveAgreementSecret(oneTimePrekeyPrivateKey, initiatorEphemeralPublicKey)
    );
    consumeRecipientOneTimePrekeyMaterial(
      options.ownMaterial,
      options.envelope.recipientOneTimePrekeyId,
      options.pruneRetiredOneTimePrekeys
    );
  }

  const transcript = buildInitialDeviceSessionTranscript(
    {
      initiatorUserId: options.envelope.senderUserId,
      initiatorDeviceId: options.envelope.senderDeviceId,
      responderUserId: options.currentUserId,
      responderDeviceId: options.ownMaterial.deviceId,
      responderSignedPrekeyId: options.envelope.recipientSignedPrekeyId,
      responderOneTimePrekeyId: options.envelope.recipientOneTimePrekeyId,
      initiatorEphemeralPublicKey: options.envelope.initiatorEphemeralPublicKey,
    },
    {
      textEncoder: options.textEncoder,
      createInitializingError: options.createInitializingError,
    }
  );
  const masterSecret = concatByteArrays(sharedSecrets);
  const rootKey = await options.deriveSessionSecret(masterSecret, transcript, "north-x3dh-root");
  const receivingChainKey = await options.deriveSessionSecret(
    rootKey,
    transcript,
    "north-x3dh-send"
  );
  const sendingChainKey = await options.deriveSessionSecret(
    rootKey,
    transcript,
    "north-x3dh-recv"
  );

  return {
    sessionId: options.createSessionId(),
    peerUserId: options.envelope.senderUserId,
    peerDeviceId: options.envelope.senderDeviceId,
    sessionOrigin: "responder",
    ownMaterialId: options.ownMaterial.materialId,
    remoteIdentityKey: options.envelope.senderIdentityKey,
    remoteIdentitySignatureKey: options.envelope.senderIdentitySignatureKey,
    remoteSignedPrekeyId: options.envelope.recipientSignedPrekeyId,
    remoteSignedPrekeyPublicKey: recipientSignedPrekey.signedPrekeyPublicKey,
    remoteOneTimePrekeyId: options.envelope.recipientOneTimePrekeyId,
    initiatorEphemeralPublicKey: options.envelope.initiatorEphemeralPublicKey,
    sendingRatchetPublicKey: await options.exportJsonWebKey(sendingRatchetKeyPair.publicKey),
    sendingRatchetPrivateKey: await options.exportJsonWebKey(sendingRatchetKeyPair.privateKey),
    remoteRatchetPublicKey:
      options.envelope.ratchetPublicKey ?? options.envelope.initiatorEphemeralPublicKey,
    sendingRatchetUsed: false,
    pendingSendingRatchetStep: true,
    rootKey: options.bytesToBase64(rootKey),
    sendingChainKey: options.bytesToBase64(sendingChainKey),
    receivingChainKey: options.bytesToBase64(receivingChainKey),
    sendingCounter: 0,
    receivingCounter: 0,
    cachedMessageKeys: {},
    establishedAt: options.now(),
  } as SessionRecord;
}
