import type {
  EncryptedMessagePayload,
  Participant,
  UserEncryptionDeviceBundle,
} from "./types";
import type { ConversationDeviceBundleResolution } from "./e2eeDeviceDirectory";
import type {
  GroupHistoryEnvelope,
  GroupHistoryKeyRecord,
  GroupSenderChainRecord,
  GroupSenderChainState,
  GroupSenderKeyDistribution,
  GroupSharedEnvelope,
} from "./e2eeGroupEngine";
import type { GroupRecipientEncryptionContext } from "./e2eeGroupRecipients";

export function buildGroupDistributionPayload(options: {
  aadVersion: number;
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  senderKeyId: string;
  messageCounter: number;
  chainKey: string;
}) {
  return JSON.stringify({
    aadVersion: options.aadVersion,
    chatId: options.chatId,
    senderUserId: options.senderUserId,
    senderDeviceId: options.senderDeviceId,
    senderKeyId: options.senderKeyId,
    messageCounter: options.messageCounter,
    chainKey: options.chainKey,
  } satisfies GroupSenderKeyDistribution);
}

export async function encryptGroupMessage<
  OwnMaterial extends { deviceId: string; materialId: string },
  SessionRecord,
>(options: {
  token: string;
  chatId: string;
  currentUserId: string;
  content: string;
  participants: Participant[];
  conversationBundles?: ConversationDeviceBundleResolution;
  prepareGroupRecipientEncryptionContext: (
    token: string,
    currentUserId: string,
    participants: Participant[],
    conversationBundles?: ConversationDeviceBundleResolution
  ) => Promise<GroupRecipientEncryptionContext<OwnMaterial, SessionRecord>>;
  readGroupSenderChainState: (userId: string) => Promise<GroupSenderChainState>;
  wasOutboundGroupSenderChainRestoredFromPersistent: (userId: string, chatId: string) => boolean;
  buildRecipientDeviceSetHash: (bundles: UserEncryptionDeviceBundle[]) => string;
  isGroupSenderChainRotationDue: (senderChain: GroupSenderChainRecord) => boolean;
  createGroupSenderChain: (
    chatId: string,
    ownMaterial: OwnMaterial,
    recipientDeviceSetHash: string
  ) => GroupSenderChainRecord;
  base64ToBytes: (value: string) => Uint8Array;
  bytesToBase64: (value: Uint8Array) => string;
  deriveMessageRatchetStep: (
    chainKey: Uint8Array,
    counter: number
  ) => Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }>;
  createGroupSharedEnvelope: (
    chatId: string,
    senderUserId: string,
    ownMaterial: OwnMaterial,
    senderKeyId: string,
    messageCounter: number,
    messageKeyBytes: Uint8Array,
    content: string
  ) => Promise<GroupSharedEnvelope>;
  ensureGroupHistoryKeyRecord: (
    token: string,
    chatId: string,
    currentUserId: string,
    ownMaterial: OwnMaterial,
    targetBundles: UserEncryptionDeviceBundle[],
    nextSessions: Record<string, SessionRecord>
  ) => Promise<GroupHistoryKeyRecord>;
  createGroupHistoryEnvelope: (
    sharedEnvelope: GroupSharedEnvelope,
    historyKeyRecord: GroupHistoryKeyRecord,
    content: string
  ) => Promise<GroupHistoryEnvelope>;
  groupSenderDistributionAadVersion: number;
  getDeviceSessionMapKey: (userId: string, deviceId: string) => string;
  establishInitiatorDeviceSession: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    bundle: UserEncryptionDeviceBundle
  ) => Promise<SessionRecord>;
  setCurrentDeviceSessionRecord: (
    sessions: Record<string, SessionRecord>,
    sessionRecord: SessionRecord
  ) => void;
  createDirectRecipientEnvelopeContent: (
    currentUserId: string,
    ownMaterial: OwnMaterial,
    sessionRecord: SessionRecord,
    content: string
  ) => Promise<unknown>;
  writeDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => void;
  rememberDeviceSessions: (userId: string, sessions: Record<string, SessionRecord>) => Promise<void>;
  writeGroupSenderChainState: (userId: string, state: GroupSenderChainState) => void;
  rememberGroupSenderChainState: (userId: string, state: GroupSenderChainState) => Promise<void>;
  markOutboundGroupSenderChainAsReactivated: (userId: string, chatId: string) => void;
  messageSchemeGroupSenderKey: string;
}) {
  const { ownMaterial, targetBundles, nextSessions } =
    await options.prepareGroupRecipientEncryptionContext(
      options.token,
      options.currentUserId,
      options.participants,
      options.conversationBundles
    );
  const groupSenderChainState = await options.readGroupSenderChainState(options.currentUserId);
  const senderChains = groupSenderChainState.outboundChains;
  let senderChain = senderChains[options.chatId];
  const shouldRefreshRestoredOutboundChain = options.wasOutboundGroupSenderChainRestoredFromPersistent(
    options.currentUserId,
    options.chatId
  );
  const recipientDeviceSetHash = options.buildRecipientDeviceSetHash(targetBundles);
  if (
    !senderChain ||
    senderChain.ownMaterialId !== ownMaterial.materialId ||
    senderChain.senderDeviceId !== ownMaterial.deviceId ||
    senderChain.recipientDeviceSetHash !== recipientDeviceSetHash ||
    options.isGroupSenderChainRotationDue(senderChain) ||
    shouldRefreshRestoredOutboundChain
  ) {
    senderChain = options.createGroupSenderChain(
      options.chatId,
      ownMaterial,
      recipientDeviceSetHash
    );
  }

  const currentChainKey = options.base64ToBytes(senderChain.chainKey);
  const currentMessageCounter = senderChain.nextMessageCounter;
  const ratchetStep = await options.deriveMessageRatchetStep(
    currentChainKey,
    currentMessageCounter
  );
  const sharedEnvelope = await options.createGroupSharedEnvelope(
    options.chatId,
    options.currentUserId,
    ownMaterial,
    senderChain.senderKeyId,
    currentMessageCounter,
    ratchetStep.messageKey,
    options.content
  );
  const historyKeyRecord = await options.ensureGroupHistoryKeyRecord(
    options.token,
    options.chatId,
    options.currentUserId,
    ownMaterial,
    targetBundles,
    nextSessions
  );
  const historyEnvelope = await options.createGroupHistoryEnvelope(
    sharedEnvelope,
    historyKeyRecord,
    options.content
  );
  const distributionPayload = buildGroupDistributionPayload({
    aadVersion: options.groupSenderDistributionAadVersion,
    chatId: options.chatId,
    senderUserId: options.currentUserId,
    senderDeviceId: ownMaterial.deviceId,
    senderKeyId: senderChain.senderKeyId,
    messageCounter: currentMessageCounter,
    chainKey: options.bytesToBase64(currentChainKey),
  });

  const distributionEnvelopes = await Promise.all(
    targetBundles.map(async (bundle) => {
      const sessionRecord =
        nextSessions[options.getDeviceSessionMapKey(bundle.userId, bundle.deviceId)] ??
        (await options.establishInitiatorDeviceSession(
          options.currentUserId,
          ownMaterial,
          bundle
        ));
      options.setCurrentDeviceSessionRecord(nextSessions, sessionRecord);
      return [
        bundle.deviceId,
        await options.createDirectRecipientEnvelopeContent(
          options.currentUserId,
          ownMaterial,
          sessionRecord,
          distributionPayload
        ),
      ] as const;
    })
  );

  senderChains[options.chatId] = {
    ...senderChain,
    chainKey: options.bytesToBase64(ratchetStep.nextChainKey),
    nextMessageCounter: currentMessageCounter + 1,
  };

  options.writeDeviceSessions(options.currentUserId, nextSessions);
  await options.rememberDeviceSessions(options.currentUserId, nextSessions);
  options.writeGroupSenderChainState(options.currentUserId, groupSenderChainState);
  await options.rememberGroupSenderChainState(options.currentUserId, groupSenderChainState);
  options.markOutboundGroupSenderChainAsReactivated(options.currentUserId, options.chatId);

  return {
    scheme: options.messageSchemeGroupSenderKey,
    sharedEnvelope: JSON.stringify(sharedEnvelope),
    historyEnvelope: JSON.stringify(historyEnvelope),
    encryptedKeysByRecipientId: Object.fromEntries(
      distributionEnvelopes.map(([deviceId, envelope]) => [deviceId, JSON.stringify(envelope)])
    ),
  } satisfies EncryptedMessagePayload;
}
