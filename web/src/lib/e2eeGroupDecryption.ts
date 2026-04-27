import type { ApiChatMessage } from "./types";
import type {
  GroupSenderChainState,
  GroupSenderKeyDistribution,
  GroupSharedEnvelope,
} from "./e2eeGroupEngine";

type GroupDistributionEnvelope = {
  recipientDeviceId: string;
  senderIdentitySignatureKey: string;
  senderUserId: string;
  senderDeviceId: string;
};

export async function decryptGroupMessage<
  OwnMaterial extends { deviceId: string },
  CachedInboundChain,
  DirectEnvelope extends GroupDistributionEnvelope,
>(options: {
  message: ApiChatMessage;
  userId: string;
  readOwnMaterial: (userId: string) => Promise<OwnMaterial | null>;
  parseGroupSharedEnvelope: (value: string) => GroupSharedEnvelope;
  decryptGroupHistoryMessage: (
    message: ApiChatMessage,
    userId: string,
    ownMaterial: OwnMaterial,
    sharedEnvelope: GroupSharedEnvelope
  ) => Promise<string>;
  parseDirectDeviceEnvelope: (value: string) => DirectEnvelope;
  assertGroupDistributionSenderMatchesSharedEnvelope: (
    distributionEnvelope: Pick<
      DirectEnvelope,
      "senderUserId" | "senderDeviceId" | "senderIdentitySignatureKey"
    >,
    sharedEnvelope: GroupSharedEnvelope
  ) => void;
  readGroupSenderChainState: (userId: string) => Promise<GroupSenderChainState>;
  resolveInboundGroupSenderChainRecord: (
    state: GroupSenderChainState,
    sharedEnvelope: GroupSharedEnvelope
  ) => CachedInboundChain | null;
  assertValidGroupEnvelopeSignature: (
    sharedEnvelope: GroupSharedEnvelope,
    senderIdentitySignatureKey: string
  ) => Promise<void>;
  resolveInboundGroupMessageKey: (
    record: CachedInboundChain,
    messageCounter: number
  ) => Promise<Uint8Array>;
  writeGroupSenderChainState: (userId: string, state: GroupSenderChainState) => void;
  rememberGroupSenderChainState: (userId: string, state: GroupSenderChainState) => Promise<void>;
  decryptGroupSharedEnvelopeContent: (
    sharedEnvelope: GroupSharedEnvelope,
    messageKeyBytes: Uint8Array
  ) => Promise<string>;
  decryptDirectRecipientEnvelope: (
    serializedEnvelope: string,
    userId: string,
    ownMaterial: OwnMaterial
  ) => Promise<{ content: string; envelope: DirectEnvelope }>;
  isRecoverableGroupHistoryFallbackError: (error: unknown) => boolean;
  parseGroupSenderKeyDistribution: (value: string) => GroupSenderKeyDistribution;
  base64ToBytes: (value: string) => Uint8Array;
  deriveMessageRatchetStep: (
    chainKey: Uint8Array,
    counter: number
  ) => Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }>;
  upsertInboundGroupSenderChainRecord: (
    state: GroupSenderChainState,
    distribution: GroupSenderKeyDistribution,
    ratchetStep: { messageKey: Uint8Array; nextChainKey: Uint8Array }
  ) => void;
}) {
  const payload = options.message.encryptedPayload;
  if (!payload) {
    throw new Error("Encrypted group payload is not available");
  }
  const ownMaterial = await options.readOwnMaterial(options.userId);
  if (!ownMaterial) {
    throw new Error("Encrypted device session is not available in this browser");
  }

  if (!payload.sharedEnvelope) {
    throw new Error("Encrypted group envelope is not available");
  }

  const sharedEnvelope = options.parseGroupSharedEnvelope(payload.sharedEnvelope);
  const serializedDistributionEnvelope = payload.encryptedKeysByRecipientId[ownMaterial.deviceId];
  if (!serializedDistributionEnvelope) {
    if (payload.historyEnvelope) {
      return options.decryptGroupHistoryMessage(
        options.message,
        options.userId,
        ownMaterial,
        sharedEnvelope
      );
    }
    throw new Error("Encrypted group sender key distribution is not available for this device");
  }

  const distributionEnvelopeMetadata = options.parseDirectDeviceEnvelope(serializedDistributionEnvelope);
  if (distributionEnvelopeMetadata.recipientDeviceId !== ownMaterial.deviceId) {
    throw new Error("Encrypted device envelope is not addressed to this device");
  }
  options.assertGroupDistributionSenderMatchesSharedEnvelope(
    distributionEnvelopeMetadata,
    sharedEnvelope
  );
  const senderChainState = await options.readGroupSenderChainState(options.userId);
  const cachedInboundSenderChain = options.resolveInboundGroupSenderChainRecord(
    senderChainState,
    sharedEnvelope
  );
  if (cachedInboundSenderChain) {
    await options.assertValidGroupEnvelopeSignature(
      sharedEnvelope,
      distributionEnvelopeMetadata.senderIdentitySignatureKey
    );
    try {
      const cachedMessageKey = await options.resolveInboundGroupMessageKey(
        cachedInboundSenderChain,
        sharedEnvelope.messageCounter
      );
      options.writeGroupSenderChainState(options.userId, senderChainState);
      await options.rememberGroupSenderChainState(options.userId, senderChainState);
      return options.decryptGroupSharedEnvelopeContent(sharedEnvelope, cachedMessageKey);
    } catch {
      if (payload.historyEnvelope) {
        return options.decryptGroupHistoryMessage(
          options.message,
          options.userId,
          ownMaterial,
          sharedEnvelope
        );
      }
    }
  }

  let distributionContent: string;
  let distributionEnvelope: DirectEnvelope;
  try {
    ({ content: distributionContent, envelope: distributionEnvelope } =
      await options.decryptDirectRecipientEnvelope(
        serializedDistributionEnvelope,
        options.userId,
        ownMaterial
      ));
  } catch (error) {
    if (payload.historyEnvelope && options.isRecoverableGroupHistoryFallbackError(error)) {
      return options.decryptGroupHistoryMessage(
        options.message,
        options.userId,
        ownMaterial,
        sharedEnvelope
      );
    }
    throw error;
  }
  options.assertGroupDistributionSenderMatchesSharedEnvelope(distributionEnvelope, sharedEnvelope);

  const distribution = options.parseGroupSenderKeyDistribution(distributionContent);
  if (
    distribution.chatId !== sharedEnvelope.chatId ||
    distribution.senderUserId !== sharedEnvelope.senderUserId ||
    distribution.senderDeviceId !== sharedEnvelope.senderDeviceId ||
    distribution.senderKeyId !== sharedEnvelope.senderKeyId ||
    distribution.messageCounter !== sharedEnvelope.messageCounter
  ) {
    throw new Error("Encrypted group sender key distribution does not match the message");
  }

  await options.assertValidGroupEnvelopeSignature(
    sharedEnvelope,
    distributionEnvelope.senderIdentitySignatureKey
  );

  const groupRatchetStep = await options.deriveMessageRatchetStep(
    options.base64ToBytes(distribution.chainKey),
    distribution.messageCounter
  );
  const plaintext = await options.decryptGroupSharedEnvelopeContent(
    sharedEnvelope,
    groupRatchetStep.messageKey
  );
  options.upsertInboundGroupSenderChainRecord(
    senderChainState,
    distribution,
    groupRatchetStep
  );
  options.writeGroupSenderChainState(options.userId, senderChainState);
  await options.rememberGroupSenderChainState(options.userId, senderChainState);
  return plaintext;
}
