import { describe, expect, it, vi } from "vitest";

import type { ApiChatMessage } from "./types";
import type { GroupInboundSenderChainRecord, GroupSenderChainState, GroupSharedEnvelope } from "./e2eeGroupEngine";
import { decryptGroupMessage } from "./e2eeGroupDecryption";

type OwnMaterial = {
  deviceId: string;
};

type DistributionEnvelope = {
  recipientDeviceId: string;
  senderIdentitySignatureKey: string;
  senderUserId: string;
  senderDeviceId: string;
};

const baseMessage = (): ApiChatMessage => ({
  id: "message-id",
  chatId: "chat",
  sender: {
    id: "sender",
    username: "sender",
    displayName: "Sender",
    profession: null,
    avatarUrl: null,
    online: true,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  editedAt: null,
  status: null,
  clientMessageId: null,
  replyTo: null,
  reactions: [],
  encryptedPayload: {
    scheme: "GROUP-SENDER-KEY-AES-GCM",
    encryptedKeysByRecipientId: {},
    sharedEnvelope: "{}",
    historyEnvelope: "{}",
  },
});

const sharedEnvelope: GroupSharedEnvelope = {
  aadVersion: 1,
  chatId: "chat",
  senderUserId: "sender",
  senderDeviceId: "sender-device",
  senderKeyId: "sender-key",
  messageCounter: 5,
  ciphertext: "ciphertext",
  iv: "iv",
  signature: "sig",
};

describe("e2eeGroupDecryption", () => {
  it("falls back to group history when distribution envelope is missing for the current device", async () => {
    const historyFallback = vi.fn(async () => "history-plaintext");

    await expect(
      decryptGroupMessage<OwnMaterial, GroupInboundSenderChainRecord, DistributionEnvelope>({
        message: baseMessage(),
        userId: "self",
        readOwnMaterial: async () => ({ deviceId: "self-device" }),
        parseGroupSharedEnvelope: () => sharedEnvelope,
        decryptGroupHistoryMessage: historyFallback,
        parseDirectDeviceEnvelope: () => {
          throw new Error("should not parse");
        },
        assertGroupDistributionSenderMatchesSharedEnvelope: () => undefined,
        readGroupSenderChainState: async () => ({ outboundChains: {}, inboundChains: {} }),
        resolveInboundGroupSenderChainRecord: () => null,
        assertValidGroupEnvelopeSignature: async () => undefined,
        resolveInboundGroupMessageKey: async () => new Uint8Array(),
        writeGroupSenderChainState: () => undefined,
        rememberGroupSenderChainState: async () => undefined,
        decryptGroupSharedEnvelopeContent: async () => "plaintext",
        decryptDirectRecipientEnvelope: async () => {
          throw new Error("should not decrypt");
        },
        isRecoverableGroupHistoryFallbackError: () => false,
        parseGroupSenderKeyDistribution: () => {
          throw new Error("should not parse");
        },
        base64ToBytes: () => new Uint8Array(),
        deriveMessageRatchetStep: async () => ({
          messageKey: new Uint8Array(),
          nextChainKey: new Uint8Array(),
        }),
        upsertInboundGroupSenderChainRecord: () => undefined,
      })
    ).resolves.toBe("history-plaintext");

    expect(historyFallback).toHaveBeenCalledTimes(1);
  });

  it("decrypts group messages through the distribution envelope path and persists inbound chain state", async () => {
    const message = baseMessage();
    message.encryptedPayload = {
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      encryptedKeysByRecipientId: {
        "self-device": "{\"distribution\":true}",
      },
      sharedEnvelope: "{}",
      historyEnvelope: null,
    };
    const senderChainState: GroupSenderChainState = {
      outboundChains: {},
      inboundChains: {},
    };
    const rememberState = vi.fn(async () => undefined);
    const upsertInbound = vi.fn();

    await expect(
      decryptGroupMessage<OwnMaterial, GroupInboundSenderChainRecord, DistributionEnvelope>({
        message,
        userId: "self",
        readOwnMaterial: async () => ({ deviceId: "self-device" }),
        parseGroupSharedEnvelope: () => sharedEnvelope,
        decryptGroupHistoryMessage: async () => "history-plaintext",
        parseDirectDeviceEnvelope: () => ({
          recipientDeviceId: "self-device",
          senderIdentitySignatureKey: "sender-signature-key",
          senderUserId: "sender",
          senderDeviceId: "sender-device",
        }),
        assertGroupDistributionSenderMatchesSharedEnvelope: () => undefined,
        readGroupSenderChainState: async () => senderChainState,
        resolveInboundGroupSenderChainRecord: () => null,
        assertValidGroupEnvelopeSignature: async () => undefined,
        resolveInboundGroupMessageKey: async () => new Uint8Array(),
        writeGroupSenderChainState: () => undefined,
        rememberGroupSenderChainState: rememberState,
        decryptGroupSharedEnvelopeContent: async () => "distribution-plaintext",
        decryptDirectRecipientEnvelope: async () => ({
          content: JSON.stringify({
            aadVersion: 1,
            chatId: "chat",
            senderUserId: "sender",
            senderDeviceId: "sender-device",
            senderKeyId: "sender-key",
            messageCounter: 5,
            chainKey: "chain-key",
          }),
          envelope: {
            recipientDeviceId: "self-device",
            senderIdentitySignatureKey: "sender-signature-key",
            senderUserId: "sender",
            senderDeviceId: "sender-device",
          },
        }),
        isRecoverableGroupHistoryFallbackError: () => false,
        parseGroupSenderKeyDistribution: (value) => JSON.parse(value) as never,
        base64ToBytes: () => new Uint8Array([1, 2, 3]),
        deriveMessageRatchetStep: async () => ({
          messageKey: new Uint8Array([4, 5, 6]),
          nextChainKey: new Uint8Array([7, 8, 9]),
        }),
        upsertInboundGroupSenderChainRecord: upsertInbound,
      })
    ).resolves.toBe("distribution-plaintext");

    expect(upsertInbound).toHaveBeenCalledTimes(1);
    expect(rememberState).toHaveBeenCalledTimes(1);
  });

  it("falls back to group history when direct distribution decrypt fails with a recoverable error", async () => {
    const message = baseMessage();
    message.encryptedPayload = {
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      encryptedKeysByRecipientId: {
        "self-device": "{\"distribution\":true}",
      },
      sharedEnvelope: "{}",
      historyEnvelope: "{}",
    };
    const historyFallback = vi.fn(async () => "history-plaintext");

    await expect(
      decryptGroupMessage<OwnMaterial, GroupInboundSenderChainRecord, DistributionEnvelope>({
        message,
        userId: "self",
        readOwnMaterial: async () => ({ deviceId: "self-device" }),
        parseGroupSharedEnvelope: () => sharedEnvelope,
        decryptGroupHistoryMessage: historyFallback,
        parseDirectDeviceEnvelope: () => ({
          recipientDeviceId: "self-device",
          senderIdentitySignatureKey: "sender-signature-key",
          senderUserId: "sender",
          senderDeviceId: "sender-device",
        }),
        assertGroupDistributionSenderMatchesSharedEnvelope: () => undefined,
        readGroupSenderChainState: async () => ({ outboundChains: {}, inboundChains: {} }),
        resolveInboundGroupSenderChainRecord: () => null,
        assertValidGroupEnvelopeSignature: async () => undefined,
        resolveInboundGroupMessageKey: async () => new Uint8Array(),
        writeGroupSenderChainState: () => undefined,
        rememberGroupSenderChainState: async () => undefined,
        decryptGroupSharedEnvelopeContent: async () => "distribution-plaintext",
        decryptDirectRecipientEnvelope: async () => {
          throw new Error("distribution decrypt failed");
        },
        isRecoverableGroupHistoryFallbackError: () => true,
        parseGroupSenderKeyDistribution: () => {
          throw new Error("should not parse distribution");
        },
        base64ToBytes: () => new Uint8Array(),
        deriveMessageRatchetStep: async () => ({
          messageKey: new Uint8Array(),
          nextChainKey: new Uint8Array(),
        }),
        upsertInboundGroupSenderChainRecord: () => undefined,
      })
    ).resolves.toBe("history-plaintext");

    expect(historyFallback).toHaveBeenCalledTimes(1);
  });

  it("uses the message-specific direct distribution when a newer cached chain makes an older counter unavailable", async () => {
    const message = baseMessage();
    message.encryptedPayload = {
      scheme: "GROUP-SENDER-KEY-AES-GCM",
      encryptedKeysByRecipientId: {
        "self-device": "{\"distribution\":true}",
      },
      sharedEnvelope: "{}",
      historyEnvelope: "{}",
    };
    const historyFallback = vi.fn(async () => "history-plaintext");
    const rememberState = vi.fn(async () => undefined);
    const senderChainState: GroupSenderChainState = {
      outboundChains: {},
      inboundChains: {
        "chat|sender|sender-device|sender-key": {
          chatId: "chat",
          senderUserId: "sender",
          senderDeviceId: "sender-device",
          senderKeyId: "sender-key",
          nextChainKey: "next-chain",
          nextMessageCounter: 6,
          cachedMessageKeys: {
            "5": "cached",
          },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const upsertInbound = vi.fn();

    await expect(
      decryptGroupMessage<OwnMaterial, GroupInboundSenderChainRecord, DistributionEnvelope>({
        message,
        userId: "self",
        readOwnMaterial: async () => ({ deviceId: "self-device" }),
        parseGroupSharedEnvelope: () => sharedEnvelope,
        decryptGroupHistoryMessage: historyFallback,
        parseDirectDeviceEnvelope: () => ({
          recipientDeviceId: "self-device",
          senderIdentitySignatureKey: "sender-signature-key",
          senderUserId: "sender",
          senderDeviceId: "sender-device",
        }),
        assertGroupDistributionSenderMatchesSharedEnvelope: () => undefined,
        readGroupSenderChainState: async () => senderChainState,
        resolveInboundGroupSenderChainRecord: (state) =>
          state.inboundChains["chat|sender|sender-device|sender-key"] ?? null,
        assertValidGroupEnvelopeSignature: async () => undefined,
        resolveInboundGroupMessageKey: async () => {
          throw new Error("Encrypted group message key is no longer available for this sender chain");
        },
        writeGroupSenderChainState: () => undefined,
        rememberGroupSenderChainState: rememberState,
        decryptGroupSharedEnvelopeContent: async () => "distribution-plaintext",
        decryptDirectRecipientEnvelope: async () => ({
          content: JSON.stringify({
            aadVersion: 1,
            chatId: "chat",
            senderUserId: "sender",
            senderDeviceId: "sender-device",
            senderKeyId: "sender-key",
            messageCounter: 5,
            chainKey: "chain-key",
          }),
          envelope: {
            recipientDeviceId: "self-device",
            senderIdentitySignatureKey: "sender-signature-key",
            senderUserId: "sender",
            senderDeviceId: "sender-device",
          },
        }),
        isRecoverableGroupHistoryFallbackError: () => true,
        parseGroupSenderKeyDistribution: (value) => JSON.parse(value) as never,
        base64ToBytes: () => new Uint8Array([1, 2, 3]),
        deriveMessageRatchetStep: async () => ({
          messageKey: new Uint8Array([4, 5, 6]),
          nextChainKey: new Uint8Array([7, 8, 9]),
        }),
        upsertInboundGroupSenderChainRecord: upsertInbound,
      })
    ).resolves.toBe("distribution-plaintext");

    expect(historyFallback).not.toHaveBeenCalled();
    expect(upsertInbound).toHaveBeenCalledTimes(1);
    expect(rememberState).toHaveBeenCalledTimes(1);
  });
});
