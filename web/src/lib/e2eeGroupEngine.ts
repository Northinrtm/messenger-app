import type { UserEncryptionDeviceBundle } from "./types";

import { getDeviceBundleMapKey } from "./e2eeDeviceDirectory";

const textEncoder = new TextEncoder();

export type GroupSharedEnvelope = {
  aadVersion: number;
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  messageCounter: number;
  ciphertext: string;
  iv: string;
  signature: string;
};

export type GroupHistoryEnvelope = {
  aadVersion: number;
  historyKeyId: string;
  ciphertext: string;
  iv: string;
};

export type GroupSenderKeyDistribution = {
  aadVersion: number;
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  messageCounter: number;
  chainKey: string;
};

export type GroupSenderChainRecord = {
  chatId: string;
  ownMaterialId: string;
  senderDeviceId: string;
  senderKeyId: string;
  recipientDeviceSetHash: string;
  chainKey: string;
  nextMessageCounter: number;
  createdAt: string;
};

export type GroupInboundSenderChainRecord = {
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  nextChainKey: string;
  nextMessageCounter: number;
  cachedMessageKeys?: Record<string, string>;
  updatedAt: string;
};

export type GroupSenderChainState = {
  outboundChains: Record<string, GroupSenderChainRecord>;
  inboundChains: Record<string, GroupInboundSenderChainRecord>;
};

export type GroupHistoryKeyGrantPayload = {
  aadVersion: number;
  chatId: string;
  historyKeyId: string;
  historyKey: string;
  createdAt: string;
};

export type GroupHistoryKeyRecord = {
  historyKeyId: string;
  chatId: string;
  keyMaterial: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupHistoryKeyState = {
  currentKeyIdsByChatId: Record<string, string>;
  keysById: Record<string, GroupHistoryKeyRecord>;
};

export function buildRecipientDeviceSetHash(bundles: UserEncryptionDeviceBundle[]) {
  return bundles
    .map((bundle) => getDeviceBundleMapKey(bundle.userId, bundle.deviceId))
    .sort()
    .join("|");
}

export function isGroupSenderChainRotationDue(
  senderChain: GroupSenderChainRecord,
  maxAgeMs: number
) {
  const createdAt = Date.parse(senderChain.createdAt);
  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt >= maxAgeMs;
}

export function buildGroupEnvelopeAdditionalData(
  envelope: Omit<GroupSharedEnvelope, "ciphertext" | "signature">
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      chatId: envelope.chatId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderKeyId: envelope.senderKeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
    })
  );
}

export function buildGroupHistoryEnvelopeAdditionalData(
  historyEnvelope: Omit<GroupHistoryEnvelope, "ciphertext">,
  sharedEnvelope: Pick<
    GroupSharedEnvelope,
    "chatId" | "senderUserId" | "senderDeviceId" | "senderKeyId" | "messageCounter"
  >
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: historyEnvelope.aadVersion,
      historyKeyId: historyEnvelope.historyKeyId,
      chatId: sharedEnvelope.chatId,
      senderUserId: sharedEnvelope.senderUserId,
      senderDeviceId: sharedEnvelope.senderDeviceId,
      senderKeyId: sharedEnvelope.senderKeyId,
      messageCounter: sharedEnvelope.messageCounter,
      iv: historyEnvelope.iv,
    })
  );
}

export function buildGroupEnvelopeSignatureData(
  envelope: GroupSharedEnvelope | (Omit<GroupSharedEnvelope, "signature"> & { signature?: string })
) {
  return textEncoder.encode(
    JSON.stringify({
      aadVersion: envelope.aadVersion,
      chatId: envelope.chatId,
      senderUserId: envelope.senderUserId,
      senderDeviceId: envelope.senderDeviceId,
      senderKeyId: envelope.senderKeyId,
      messageCounter: envelope.messageCounter,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
    })
  );
}

export function parseGroupSharedEnvelope(value: string, expectedAadVersion: number): GroupSharedEnvelope {
  const parsed = JSON.parse(value) as Partial<GroupSharedEnvelope>;
  if (
    parsed.aadVersion !== expectedAadVersion ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.senderKeyId !== "string" ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.signature !== "string"
  ) {
    throw new Error("Malformed group shared envelope");
  }

  return parsed as GroupSharedEnvelope;
}

export function parseGroupHistoryEnvelope(
  value: string,
  expectedAadVersion: number
): GroupHistoryEnvelope {
  const parsed = JSON.parse(value) as Partial<GroupHistoryEnvelope>;
  if (
    parsed.aadVersion !== expectedAadVersion ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iv !== "string"
  ) {
    throw new Error("Malformed group history envelope");
  }

  return parsed as GroupHistoryEnvelope;
}

export function parseGroupSenderKeyDistribution(
  value: string,
  expectedAadVersion: number
): GroupSenderKeyDistribution {
  const parsed = JSON.parse(value) as Partial<GroupSenderKeyDistribution>;
  if (
    parsed.aadVersion !== expectedAadVersion ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.senderUserId !== "string" ||
    typeof parsed.senderDeviceId !== "string" ||
    typeof parsed.senderKeyId !== "string" ||
    typeof parsed.messageCounter !== "number" ||
    typeof parsed.chainKey !== "string"
  ) {
    throw new Error("Malformed group sender key distribution");
  }

  return parsed as GroupSenderKeyDistribution;
}

export function parseGroupHistoryKeyGrantPayload(
  value: string,
  expectedAadVersion: number
): GroupHistoryKeyGrantPayload {
  const parsed = JSON.parse(value) as Partial<GroupHistoryKeyGrantPayload>;
  if (
    parsed.aadVersion !== expectedAadVersion ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.historyKeyId !== "string" ||
    typeof parsed.historyKey !== "string" ||
    typeof parsed.createdAt !== "string"
  ) {
    throw new Error("Malformed group history key grant");
  }

  return parsed as GroupHistoryKeyGrantPayload;
}

export function getGroupInboundSenderChainMapKey(
  chatId: string,
  senderUserId: string,
  senderDeviceId: string,
  senderKeyId: string
) {
  return `${chatId}|${senderUserId}|${senderDeviceId}|${senderKeyId}`;
}

export function resolveInboundGroupSenderChainRecord(
  state: GroupSenderChainState,
  sharedEnvelope: GroupSharedEnvelope
) {
  return (
    state.inboundChains[
      getGroupInboundSenderChainMapKey(
        sharedEnvelope.chatId,
        sharedEnvelope.senderUserId,
        sharedEnvelope.senderDeviceId,
        sharedEnvelope.senderKeyId
      )
    ] ?? null
  );
}

export function assertGroupDistributionSenderMatchesSharedEnvelope(
  distributionEnvelope: {
    senderUserId: string;
    senderDeviceId: string;
    senderIdentitySignatureKey: string;
  },
  sharedEnvelope: GroupSharedEnvelope
) {
  if (
    distributionEnvelope.senderUserId !== sharedEnvelope.senderUserId ||
    distributionEnvelope.senderDeviceId !== sharedEnvelope.senderDeviceId
  ) {
    throw new Error("Encrypted group sender key distribution sender is invalid");
  }
}
