import { describe, expect, it, vi } from "vitest";

import {
  advanceSendingChain,
  applyIncomingDhRatchet,
  applyOutgoingDhRatchet,
  buildSessionMessageCacheKey,
  getEnvelopeMessageKey,
  getReceivingMessageKey,
} from "./e2eeSessionRatchet";

type SessionRecord = {
  sendingRatchetPublicKey: string;
  sendingRatchetPrivateKey: string;
  remoteRatchetPublicKey: string | null;
  sendingRatchetUsed: boolean;
  pendingSendingRatchetStep: boolean;
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  receivingChains?: Record<string, { chainKey: string; counter: number }>;
  sendingCounter: number;
  receivingCounter: number;
  cachedMessageKeys?: Record<string, string>;
};

const bytesToBase64 = (value: Uint8Array) => `b64:${Array.from(value).join(",")}`;
const base64ToBytes = (value: string) => {
  if (value.startsWith("b64:")) {
    const payload = value.slice(4);
    return new Uint8Array(payload ? payload.split(",").map((entry) => Number(entry)) : []);
  }

  return new Uint8Array(value.split("").map((entry) => entry.charCodeAt(0)));
};

describe("e2eeSessionRatchet", () => {
  it("advances the sending chain and caches the send message key", async () => {
    const sessionRecord: SessionRecord = {
      sendingRatchetPublicKey: "ratchet",
      sendingRatchetPrivateKey: "priv",
      remoteRatchetPublicKey: null,
      sendingRatchetUsed: false,
      pendingSendingRatchetStep: false,
      rootKey: "root",
      sendingChainKey: "chain",
      receivingChainKey: "recv",
      sendingCounter: 2,
      receivingCounter: 0,
      cachedMessageKeys: {},
    };

    const result = await advanceSendingChain({
      sessionRecord,
      base64ToBytes,
      bytesToBase64,
      deriveMessageRatchetStep: vi.fn(async () => ({
        messageKey: new Uint8Array([9]),
        nextChainKey: new Uint8Array([8]),
      })),
    });

    expect(result).toEqual({
      messageCounter: 2,
      messageKey: new Uint8Array([9]),
    });
    expect(sessionRecord.sendingCounter).toBe(3);
    expect(sessionRecord.sendingChainKey).toBe("b64:8");
    expect(sessionRecord.cachedMessageKeys).toMatchObject({
      [buildSessionMessageCacheKey("send", "ratchet", 2)]: "b64:9",
    });
  });

  it("applies an outgoing DH ratchet and rotates the local sending key when needed", async () => {
    const publicKey = {} as CryptoKey;
    const privateKey = {} as CryptoKey;
    const sessionRecord: SessionRecord = {
      sendingRatchetPublicKey: "old-pub",
      sendingRatchetPrivateKey: "old-priv",
      remoteRatchetPublicKey: "remote-pub",
      sendingRatchetUsed: true,
      pendingSendingRatchetStep: true,
      rootKey: "root",
      sendingChainKey: "send-chain",
      receivingChainKey: "recv-chain",
      sendingCounter: 4,
      receivingCounter: 1,
      cachedMessageKeys: {},
    };

    await applyOutgoingDhRatchet({
      sessionRecord,
      deviceAgreementKeyAlgorithm: "X25519",
      generateAsymmetricKeyPair: vi.fn(async () => ({
        publicKey,
        privateKey,
      })),
      exportJsonWebKey: vi.fn(async (key) => (key === publicKey ? "next-pub" : "next-priv")),
      importDevicePrivateKey: vi.fn(async () => privateKey),
      importDevicePublicKey: vi.fn(async () => publicKey),
      deriveAgreementSecret: vi.fn(async () => new Uint8Array([1])),
      deriveSessionSecret: vi.fn(async (_baseSecret, _transcript, context) =>
        context === "north-dh-ratchet-root" ? new Uint8Array([2]) : new Uint8Array([3])
      ),
      base64ToBytes,
      bytesToBase64,
    });

    expect(sessionRecord.sendingRatchetPublicKey).toBe("next-pub");
    expect(sessionRecord.sendingRatchetPrivateKey).toBe("next-priv");
    expect(sessionRecord.rootKey).toBe("b64:2");
    expect(sessionRecord.sendingChainKey).toBe("b64:3");
    expect(sessionRecord.sendingCounter).toBe(0);
    expect(sessionRecord.sendingRatchetUsed).toBe(true);
    expect(sessionRecord.pendingSendingRatchetStep).toBe(false);
  });

  it("derives receiving message keys and advances the receiving chain", async () => {
    const sessionRecord: SessionRecord = {
      sendingRatchetPublicKey: "send-ratchet",
      sendingRatchetPrivateKey: "priv",
      remoteRatchetPublicKey: "recv-ratchet",
      sendingRatchetUsed: false,
      pendingSendingRatchetStep: false,
      rootKey: "root",
      sendingChainKey: "send-chain",
      receivingChainKey: "b64:0",
      sendingCounter: 0,
      receivingCounter: 1,
      cachedMessageKeys: {},
    };

    const messageKey = await getReceivingMessageKey({
      sessionRecord,
      ratchetPublicKey: "recv-ratchet",
      messageCounter: 3,
      deviceMaxMessageGap: 10,
      base64ToBytes,
      bytesToBase64,
      deriveMessageRatchetStep: vi.fn(async (_chainKey, counter) => ({
        messageKey: new Uint8Array([counter]),
        nextChainKey: new Uint8Array([counter + 10]),
      })),
    });

    expect(messageKey).toEqual(new Uint8Array([3]));
    expect(sessionRecord.receivingCounter).toBe(4);
    expect(sessionRecord.receivingChainKey).toBe("b64:13");
    expect(sessionRecord.cachedMessageKeys).toMatchObject({
      [buildSessionMessageCacheKey("recv", "recv-ratchet", 1)]: "b64:1",
      [buildSessionMessageCacheKey("recv", "recv-ratchet", 2)]: "b64:2",
      [buildSessionMessageCacheKey("recv", "recv-ratchet", 3)]: "b64:3",
    });
  });

  it("prefers own cached send keys when resolving an envelope message key", async () => {
    const sessionRecord: SessionRecord = {
      sendingRatchetPublicKey: "send-ratchet",
      sendingRatchetPrivateKey: "priv",
      remoteRatchetPublicKey: "recv-ratchet",
      sendingRatchetUsed: false,
      pendingSendingRatchetStep: false,
      rootKey: "root",
      sendingChainKey: "send-chain",
      receivingChainKey: "recv-chain",
      sendingCounter: 0,
      receivingCounter: 0,
      cachedMessageKeys: {
        [buildSessionMessageCacheKey("send", "send-ratchet", 5)]: "b64:5,6",
      },
    };

    const getReceivingMessageKeyMock = vi.fn(async () => new Uint8Array([1]));

    const messageKey = await getEnvelopeMessageKey({
      sessionRecord,
      envelope: {
        senderUserId: "self",
        senderDeviceId: "self-device",
        ratchetPublicKey: "send-ratchet",
        messageCounter: 5,
      },
      currentUserId: "self",
      currentDeviceId: "self-device",
      base64ToBytes,
      getReceivingMessageKey: getReceivingMessageKeyMock,
    });

    expect(messageKey).toEqual(new Uint8Array([5, 6]));
    expect(getReceivingMessageKeyMock).not.toHaveBeenCalled();
  });

  it("applies an incoming DH ratchet and archives the previous receiving chain", async () => {
    const publicKey = {} as CryptoKey;
    const privateKey = {} as CryptoKey;
    const sessionRecord: SessionRecord = {
      sendingRatchetPublicKey: "send-ratchet",
      sendingRatchetPrivateKey: "send-priv",
      remoteRatchetPublicKey: "old-remote",
      sendingRatchetUsed: false,
      pendingSendingRatchetStep: false,
      rootKey: "root",
      sendingChainKey: "send-chain",
      receivingChainKey: "prev-chain",
      receivingChains: {},
      sendingCounter: 0,
      receivingCounter: 7,
      cachedMessageKeys: {},
    };

    await applyIncomingDhRatchet({
      sessionRecord,
      remoteRatchetPublicKey: "new-remote",
      deviceAgreementKeyAlgorithm: "X25519",
      importDevicePrivateKey: vi.fn(async () => privateKey),
      importDevicePublicKey: vi.fn(async () => publicKey),
      deriveAgreementSecret: vi.fn(async () => new Uint8Array([1])),
      deriveSessionSecret: vi.fn(async (_baseSecret, _transcript, context) =>
        context === "north-dh-ratchet-root" ? new Uint8Array([2]) : new Uint8Array([3])
      ),
      base64ToBytes,
      bytesToBase64,
    });

    expect(sessionRecord.receivingChains).toMatchObject({
      "old-remote": {
        chainKey: "prev-chain",
        counter: 7,
      },
    });
    expect(sessionRecord.rootKey).toBe("b64:2");
    expect(sessionRecord.receivingChainKey).toBe("b64:3");
    expect(sessionRecord.receivingCounter).toBe(0);
    expect(sessionRecord.remoteRatchetPublicKey).toBe("new-remote");
    expect(sessionRecord.sendingRatchetUsed).toBe(true);
    expect(sessionRecord.pendingSendingRatchetStep).toBe(true);
  });
});
