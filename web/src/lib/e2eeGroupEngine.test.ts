import { describe, expect, it } from "vitest";

import type { UserEncryptionDeviceBundle } from "./types";
import {
  buildRecipientDeviceSetHash,
  getGroupInboundSenderChainMapKey,
  isGroupSenderChainRotationDue,
  parseGroupHistoryEnvelope,
  parseGroupHistoryKeyGrantPayload,
  parseGroupSenderKeyDistribution,
  parseGroupSharedEnvelope,
  resolveInboundGroupSenderChainRecord,
  type GroupSenderChainState,
  type GroupSharedEnvelope,
} from "./e2eeGroupEngine";

const bundle = (userId: string, deviceId: string): UserEncryptionDeviceBundle => ({
  userId,
  deviceId,
  deviceName: `${deviceId}-name`,
  identityKey: `${deviceId}-identity`,
  identityKeyAlgorithm: "X25519",
  identitySignatureKey: `${deviceId}-signature-identity`,
  identitySignatureKeyAlgorithm: "Ed25519",
  signedPrekeyId: 1,
  signedPrekeyPublicKey: `${deviceId}-signed-prekey`,
  signedPrekeySignature: `${deviceId}-signature`,
  signedPrekeyAlgorithm: "X25519",
  oneTimePrekey: null,
  registeredAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  deviceVersion: "v1",
});

describe("e2eeGroupEngine", () => {
  it("builds a stable recipient device set hash", () => {
    expect(buildRecipientDeviceSetHash([bundle("u2", "d2"), bundle("u1", "d1")])).toBe("u1:d1|u2:d2");
  });

  it("parses group envelopes and grants with expected aad versions", () => {
    expect(
      parseGroupSharedEnvelope(
        JSON.stringify({
          aadVersion: 1,
          chatId: "chat",
          senderUserId: "user",
          senderDeviceId: "device",
          senderKeyId: "sender-key",
          messageCounter: 5,
          ciphertext: "ciphertext",
          iv: "iv",
          signature: "sig",
        }),
        1
      )
    ).toMatchObject({ chatId: "chat", messageCounter: 5 });

    expect(
      parseGroupHistoryEnvelope(
        JSON.stringify({
          aadVersion: 1,
          historyKeyId: "history",
          ciphertext: "ciphertext",
          iv: "iv",
        }),
        1
      )
    ).toMatchObject({ historyKeyId: "history" });

    expect(
      parseGroupSenderKeyDistribution(
        JSON.stringify({
          aadVersion: 1,
          chatId: "chat",
          senderUserId: "user",
          senderDeviceId: "device",
          senderKeyId: "sender-key",
          messageCounter: 5,
          chainKey: "chain-key",
        }),
        1
      )
    ).toMatchObject({ senderKeyId: "sender-key" });

    expect(
      parseGroupHistoryKeyGrantPayload(
        JSON.stringify({
          aadVersion: 1,
          chatId: "chat",
          historyKeyId: "history",
          historyKey: "key-material",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        1
      )
    ).toMatchObject({ historyKey: "key-material" });
  });

  it("resolves inbound sender chains by shared envelope key", () => {
    const sharedEnvelope: GroupSharedEnvelope = {
      aadVersion: 1,
      chatId: "chat",
      senderUserId: "user",
      senderDeviceId: "device",
      senderKeyId: "sender-key",
      messageCounter: 5,
      ciphertext: "ciphertext",
      iv: "iv",
      signature: "sig",
    };
    const state: GroupSenderChainState = {
      outboundChains: {},
      inboundChains: {
        [getGroupInboundSenderChainMapKey("chat", "user", "device", "sender-key")]: {
          chatId: "chat",
          senderUserId: "user",
          senderDeviceId: "device",
          senderKeyId: "sender-key",
          nextChainKey: "next-chain",
          nextMessageCounter: 6,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };

    expect(resolveInboundGroupSenderChainRecord(state, sharedEnvelope)).toMatchObject({
      nextChainKey: "next-chain",
      nextMessageCounter: 6,
    });
  });

  it("rotates stale or malformed outbound group sender chains", () => {
    expect(
      isGroupSenderChainRotationDue(
        {
          chatId: "chat",
          ownMaterialId: "material",
          senderDeviceId: "device",
          senderKeyId: "sender-key",
          recipientDeviceSetHash: "u1:d1",
          chainKey: "chain-key",
          nextMessageCounter: 0,
          createdAt: "not-a-date",
        },
        10_000
      )
    ).toBe(true);
  });
});
