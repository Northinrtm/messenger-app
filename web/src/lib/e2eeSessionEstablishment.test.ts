import { describe, expect, it, vi } from "vitest";

import {
  establishInitiatorDeviceSession,
  establishResponderDeviceSession,
  verifySignedPrekeySignature,
} from "./e2eeSessionEstablishment";

type OwnMaterial = {
  deviceId: string;
  materialId: string;
  identityPrivateKey: string;
  identityKeyAlgorithm: string;
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

type Bundle = {
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

const bytesToBase64 = (value: Uint8Array) => `b64:${Array.from(value).join(",")}`;
const base64ToBytes = (value: string) =>
  new Uint8Array(value.replace(/^b64:/, "").split(",").filter(Boolean).map((entry) => Number(entry)));

describe("e2eeSessionEstablishment", () => {
  it("verifies a signed prekey signature against the identity signature key", async () => {
    const verify = vi.fn(async () => true);
    const result = await verifySignedPrekeySignature({
      bundle: {
        userId: "peer",
        deviceId: "peer-device",
        identityKey: "peer-identity",
        identityKeyAlgorithm: "X25519",
        identitySignatureKey: "peer-signature",
        identitySignatureKeyAlgorithm: "Ed25519",
        signedPrekeyId: 1,
        signedPrekeyPublicKey: "peer-signed-prekey",
        signedPrekeySignature: "b64:1,2,3",
        signedPrekeyAlgorithm: "X25519",
        oneTimePrekey: null,
      },
      importDevicePublicKey: vi.fn(async () => ({ key: "signature" } as unknown as CryptoKey)),
      base64ToBytes,
      buildSignedPrekeySignaturePayload: (serializedPublicKey) =>
        new TextEncoder().encode(`sig:${serializedPublicKey}`),
      subtleVerify: verify,
    });

    expect(result).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("establishes an initiator session with an optional one-time prekey", async () => {
    const ephPublicKey = { key: "eph-pub" } as unknown as CryptoKey;
    const ephPrivateKey = { key: "eph-priv" } as unknown as CryptoKey;
    const ratchetPublicKey = { key: "ratchet-pub" } as unknown as CryptoKey;
    const ratchetPrivateKey = { key: "ratchet-priv" } as unknown as CryptoKey;
    const generateAsymmetricKeyPair = vi
      .fn()
      .mockResolvedValueOnce({ publicKey: ephPublicKey, privateKey: ephPrivateKey })
      .mockResolvedValueOnce({ publicKey: ratchetPublicKey, privateKey: ratchetPrivateKey });

    const session = await establishInitiatorDeviceSession({
      currentUserId: "self",
      ownMaterial: {
        deviceId: "self-device",
        materialId: "material",
        identityPrivateKey: "self-id-priv",
        identityKeyAlgorithm: "X25519",
        signedPrekeyId: 1,
        signedPrekeyPublicKey: "self-signed-prekey",
        signedPrekeyPrivateKey: "self-signed-prekey-priv",
        signedPrekeyAlgorithm: "X25519",
        oneTimePrekeys: [],
      },
      bundle: {
        userId: "peer",
        deviceId: "peer-device",
        identityKey: "peer-identity",
        identityKeyAlgorithm: "X25519",
        identitySignatureKey: "peer-signature",
        identitySignatureKeyAlgorithm: "Ed25519",
        signedPrekeyId: 2,
        signedPrekeyPublicKey: "peer-signed-prekey",
        signedPrekeySignature: "b64:1",
        signedPrekeyAlgorithm: "X25519",
        oneTimePrekey: {
          keyId: 7,
          publicKey: "peer-one-time",
        },
      } satisfies Bundle,
      deviceAgreementKeyAlgorithm: "X25519",
      importDevicePrivateKey: vi.fn(async () => ({ key: "self-id" } as unknown as CryptoKey)),
      importDevicePublicKey: vi.fn(async () => ({ key: "remote" } as unknown as CryptoKey)),
      generateAsymmetricKeyPair,
      exportJsonWebKey: vi.fn(async (key) => {
        if (key === ephPublicKey) return "eph-pub-jwk";
        if (key === ephPrivateKey) return "eph-priv-jwk";
        if (key === ratchetPublicKey) return "ratchet-pub-jwk";
        return "ratchet-priv-jwk";
      }),
      deriveAgreementSecret: vi
        .fn()
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockResolvedValueOnce(new Uint8Array([2]))
        .mockResolvedValueOnce(new Uint8Array([3]))
        .mockResolvedValueOnce(new Uint8Array([4])),
      deriveSessionSecret: vi.fn(async (_baseSecret, _transcript, context) => {
        if (context === "north-x3dh-root") return new Uint8Array([10]);
        if (context === "north-x3dh-send") return new Uint8Array([11]);
        return new Uint8Array([12]);
      }),
      bytesToBase64,
      textEncoder: new TextEncoder(),
      createInitializingError: () => new Error("init"),
      createSessionId: () => "session-1",
      now: () => "2026-04-27T12:00:00.000Z",
    });

    expect(session).toMatchObject({
      sessionId: "session-1",
      peerUserId: "peer",
      peerDeviceId: "peer-device",
      sessionOrigin: "initiator",
      ownMaterialId: "material",
      remoteSignedPrekeyId: 2,
      remoteOneTimePrekeyId: 7,
      initiatorEphemeralPublicKey: "eph-pub-jwk",
      sendingRatchetPublicKey: "ratchet-pub-jwk",
      sendingRatchetPrivateKey: "ratchet-priv-jwk",
      remoteRatchetPublicKey: null,
      rootKey: "b64:10",
      sendingChainKey: "b64:11",
      receivingChainKey: "b64:12",
      establishedAt: "2026-04-27T12:00:00.000Z",
    });
    expect(generateAsymmetricKeyPair).toHaveBeenCalledTimes(2);
  });

  it("establishes a responder session and consumes the referenced one-time prekey", async () => {
    const ratchetPublicKey = { key: "ratchet-pub" } as unknown as CryptoKey;
    const ratchetPrivateKey = { key: "ratchet-priv" } as unknown as CryptoKey;
    const ownMaterial: OwnMaterial = {
      deviceId: "self-device",
      materialId: "material",
      identityPrivateKey: "self-id-priv",
      identityKeyAlgorithm: "X25519",
      signedPrekeyId: 5,
      signedPrekeyPublicKey: "self-signed-prekey",
      signedPrekeyPrivateKey: "self-signed-prekey-priv",
      signedPrekeyAlgorithm: "X25519",
      oneTimePrekeys: [{ keyId: 9, privateKey: "self-one-time-priv" }],
      retiredOneTimePrekeys: [],
      retiredSignedPrekeys: [],
    };

    const session = await establishResponderDeviceSession({
      currentUserId: "self",
      ownMaterial,
      envelope: {
        senderUserId: "peer",
        senderDeviceId: "peer-device",
        senderIdentityKey: "peer-identity",
        senderIdentitySignatureKey: "peer-signature",
        initiatorEphemeralPublicKey: "peer-eph",
        ratchetPublicKey: null,
        recipientSignedPrekeyId: 5,
        recipientOneTimePrekeyId: 9,
      },
      deviceAgreementKeyAlgorithm: "X25519",
      pruneRetiredSignedPrekeys: (prekeys) => prekeys ?? [],
      pruneRetiredOneTimePrekeys: (prekeys) => prekeys ?? [],
      importDevicePrivateKey: vi.fn(async () => ({ key: "self-priv" } as unknown as CryptoKey)),
      importDevicePublicKey: vi.fn(async () => ({ key: "remote-pub" } as unknown as CryptoKey)),
      generateAsymmetricKeyPair: vi.fn(async () => ({
        publicKey: ratchetPublicKey,
        privateKey: ratchetPrivateKey,
      })),
      exportJsonWebKey: vi.fn(async (key) =>
        key === ratchetPublicKey ? "ratchet-pub-jwk" : "ratchet-priv-jwk"
      ),
      deriveAgreementSecret: vi
        .fn()
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockResolvedValueOnce(new Uint8Array([2]))
        .mockResolvedValueOnce(new Uint8Array([3]))
        .mockResolvedValueOnce(new Uint8Array([4])),
      deriveSessionSecret: vi.fn(async (_baseSecret, _transcript, context) => {
        if (context === "north-x3dh-root") return new Uint8Array([20]);
        if (context === "north-x3dh-send") return new Uint8Array([21]);
        return new Uint8Array([22]);
      }),
      bytesToBase64,
      textEncoder: new TextEncoder(),
      createInitializingError: () => new Error("init"),
      createSessionId: () => "session-2",
      now: () => "2026-04-27T12:05:00.000Z",
    });

    expect(session).toMatchObject({
      sessionId: "session-2",
      peerUserId: "peer",
      peerDeviceId: "peer-device",
      sessionOrigin: "responder",
      ownMaterialId: "material",
      remoteSignedPrekeyId: 5,
      remoteOneTimePrekeyId: 9,
      initiatorEphemeralPublicKey: "peer-eph",
      sendingRatchetPublicKey: "ratchet-pub-jwk",
      sendingRatchetPrivateKey: "ratchet-priv-jwk",
      remoteRatchetPublicKey: "peer-eph",
      rootKey: "b64:20",
      receivingChainKey: "b64:21",
      sendingChainKey: "b64:22",
      establishedAt: "2026-04-27T12:05:00.000Z",
    });
    expect(ownMaterial.oneTimePrekeys).toHaveLength(0);
  });
});
