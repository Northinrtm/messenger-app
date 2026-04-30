package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.api.dto.UpsertGroupHistoryKeyRequest;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatHistoryKey;
import com.north.messenger.domain.model.ChatHistoryKeyAccess;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatHistoryKeyUserAccess;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserEncryptionDevice;
import com.north.messenger.domain.model.UserEncryptionSignedPrekey;
import com.north.messenger.domain.repository.ChatHistoryKeyAccessRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyUserAccessRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserEncryptionDeviceRepository;
import com.north.messenger.domain.repository.UserEncryptionEnvelopeCounterRepository;
import com.north.messenger.domain.repository.UserEncryptionSignedPrekeyRepository;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatGroupHistoryKeyServiceTest {

    private AuthService authService;
    private ChatService chatService;
    private ChatHistoryKeyRepository chatHistoryKeyRepository;
    private ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository;
    private ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository;
    private ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private UserEncryptionDeviceRepository userEncryptionDeviceRepository;
    private UserEncryptionSignedPrekeyRepository userEncryptionSignedPrekeyRepository;
    private UserEncryptionEnvelopeCounterRepository userEncryptionEnvelopeCounterRepository;
    private ChatHistoryBackfillStatusService chatHistoryBackfillStatusService;
    private ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;
    private ChatGroupHistoryKeyService chatGroupHistoryKeyService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatHistoryKeyRepository = mock(ChatHistoryKeyRepository.class);
        chatHistoryKeyAccessRepository = mock(ChatHistoryKeyAccessRepository.class);
        chatHistoryKeyUserAccessRepository = mock(ChatHistoryKeyUserAccessRepository.class);
        chatHistoryKeyEscrowRepository = mock(ChatHistoryKeyEscrowRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userEncryptionDeviceRepository = mock(UserEncryptionDeviceRepository.class);
        userEncryptionSignedPrekeyRepository = mock(UserEncryptionSignedPrekeyRepository.class);
        userEncryptionEnvelopeCounterRepository = mock(UserEncryptionEnvelopeCounterRepository.class);
        chatHistoryBackfillStatusService = mock(ChatHistoryBackfillStatusService.class);
        chatHistoryKeyEscrowCryptoService = mock(ChatHistoryKeyEscrowCryptoService.class);
        objectMapper = new ObjectMapper();

        DeviceKeyValidationService deviceKeyValidationService = new DeviceKeyValidationService(objectMapper);
        DeviceEnvelopeCounterService deviceEnvelopeCounterService =
                new DeviceEnvelopeCounterService(userEncryptionEnvelopeCounterRepository);
        chatGroupHistoryKeyService = new ChatGroupHistoryKeyService(
                authService,
                chatService,
                chatHistoryKeyRepository,
                chatHistoryKeyAccessRepository,
                chatHistoryKeyUserAccessRepository,
                chatHistoryKeyEscrowRepository,
                chatParticipantRepository,
                userEncryptionDeviceRepository,
                userEncryptionSignedPrekeyRepository,
                deviceKeyValidationService,
                deviceEnvelopeCounterService,
                chatHistoryBackfillStatusService,
                chatHistoryKeyEscrowCryptoService,
                objectMapper
        );

        when(chatHistoryKeyRepository.save(any(ChatHistoryKey.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyAccessRepository.save(any(ChatHistoryKeyAccess.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyUserAccessRepository.save(any(ChatHistoryKeyUserAccess.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyUserAccessRepository.findAllByChatIdAndRecipientUserIdOrderByCreatedAtAsc(any(), any()))
                .thenReturn(List.of());
        when(chatHistoryKeyAccessRepository.findByHistoryKeyIdAndRecipientDeviceId(any(), any())).thenReturn(Optional.empty());
        when(userEncryptionEnvelopeCounterRepository.findBySenderDeviceIdAndRecipientDeviceIdAndRatchetPublicKey(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(userEncryptionEnvelopeCounterRepository.insertIfAbsent(any(), any(), any(), any(), any(), anyInt(), any(Instant.class)))
                .thenReturn(1);
    }

    @Test
    void upsertGroupHistoryKeyAdvancesDirectEnvelopeCounters() throws Exception {
        UserAccount sender = testUserAccount(
                UUID.randomUUID(),
                "north",
                "north@example.com",
                "North",
                null,
                null,
                "pw",
                Instant.parse("2026-03-24T11:00:00Z")
        );
        ChatRoom room = new ChatRoom(
                UUID.randomUUID(),
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        AuthService.AuthenticatedSession session = new AuthService.AuthenticatedSession(
                sender,
                UUID.randomUUID()
        );
        when(authService.requireAuthenticatedSession("north", "token")).thenReturn(session);
        when(chatService.requireChatMembership(room.getId(), sender)).thenReturn(room);
        when(chatService.findParticipants(room.getId())).thenReturn(List.of(sender));

        UserEncryptionDevice senderDevice = device(sender.getId());
        UserEncryptionDevice recipientDevice = device(sender.getId());
        when(userEncryptionDeviceRepository.findAllByUserIdInAndRetiredAtIsNull(List.of(sender.getId())))
                .thenReturn(List.of(senderDevice, recipientDevice));
        when(userEncryptionSignedPrekeyRepository.findActiveByDeviceIdAndKeyId(any(), eq(7), any(Instant.class)))
                .thenAnswer(invocation -> {
                    UUID deviceId = invocation.getArgument(0);
                    UserEncryptionDevice device = deviceId.equals(senderDevice.getId()) ? senderDevice : recipientDevice;
                    return Optional.of(new UserEncryptionSignedPrekey(
                            UUID.randomUUID(),
                            device.getId(),
                            7,
                            device.getSignedPrekeyPublicKey(),
                            device.getSignedPrekeySignature(),
                            "X25519",
                            Instant.now().minusSeconds(60),
                            null,
                            Instant.now().plusSeconds(3600)
                    ));
                });

        UUID historyKeyId = UUID.randomUUID();
        String senderWrappedEnvelope = directEnvelopeJson(
                sender.getId(),
                senderDevice,
                senderDevice,
                7,
                0
        );
        String recipientWrappedEnvelope = directEnvelopeJson(
                sender.getId(),
                senderDevice,
                recipientDevice,
                7,
                0
        );
        GroupHistoryKeyResponse response = chatGroupHistoryKeyService.upsertGroupHistoryKey(
                "north",
                "token",
                room.getId(),
                new UpsertGroupHistoryKeyRequest(
                        historyKeyId.toString(),
                        Map.of(
                                senderDevice.getId().toString(), senderWrappedEnvelope,
                                recipientDevice.getId().toString(), recipientWrappedEnvelope
                        ),
                        null,
                        null
                )
        );

        assertThat(response.historyKeyId()).isEqualTo(historyKeyId.toString());
        verify(chatHistoryBackfillStatusService).refreshCoverage(
                eq(room.getId()),
                eq(List.of(sender.getId()))
        );
        verify(userEncryptionEnvelopeCounterRepository).insertIfAbsent(
                any(),
                eq(senderDevice.getId()),
                eq(recipientDevice.getId()),
                eq(x25519PublicJwk("ratchet-" + recipientDevice.getId())),
                eq(x25519PublicJwk("initiator-" + recipientDevice.getId())),
                eq(0),
                any(Instant.class)
        );
    }

    @Test
    void listOwnGroupHistoryKeysShouldReturnEscrowForPostJoinHistoryWhenPrejoinHistoryIsDisabled() throws Exception {
        UserAccount member = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                Instant.parse("2026-03-24T11:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-29T17:00:00Z");
        Instant postJoinKeyCreatedAt = joinedAt.plusSeconds(5);
        UUID historyKeyId = UUID.randomUUID();

        ChatRoom room = new ChatRoom(
                chatId,
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        room.updateGroupDetails("Group", null, ChatPrejoinHistoryPolicy.JOIN_ONLY);

        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                joinedAt
        );
        UserEncryptionDevice currentDevice = device(member.getId());
        ChatHistoryKeyEscrow escrow = new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                "{\"ciphertext\":\"server\"}",
                postJoinKeyCreatedAt,
                postJoinKeyCreatedAt
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(member);
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId()))
                .thenReturn(Optional.of(membership));
        when(userEncryptionDeviceRepository.findById(currentDevice.getId()))
                .thenReturn(Optional.of(currentDevice));
        when(chatHistoryKeyAccessRepository.findAllByChatIdAndRecipientUserIdAndRecipientDeviceIdOrderByCreatedAtAsc(
                chatId,
                member.getId(),
                currentDevice.getId()
        )).thenReturn(List.of());
        when(chatHistoryKeyEscrowRepository.findAllByChatIdAndHistoryKeyCreatedAtOnOrAfterOrderByHistoryKeyCreatedAtAsc(
                chatId,
                joinedAt
        )).thenReturn(List.of(escrow));
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("{\"historyKey\":\"post-join\"}");

        var responses = chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                "alice",
                chatId,
                currentDevice.getId().toString()
        );

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).historyKeyId()).isEqualTo(historyKeyId.toString());
        assertThat(responses.get(0).wrappedKeyPayloadJson()).isEmpty();
        assertThat(responses.get(0).serverGrantPayloadJson()).isEqualTo("{\"historyKey\":\"post-join\"}");
        verify(chatHistoryKeyEscrowRepository, never()).findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
    }

    @Test
    void listOwnGroupHistoryKeysShouldAllowEscrowLookupForRetiredOwnedDevice() throws Exception {
        UserAccount member = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                Instant.parse("2026-03-24T11:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-30T06:04:36Z");

        ChatRoom room = new ChatRoom(
                chatId,
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        room.updateGroupDetails("Group", null, ChatPrejoinHistoryPolicy.JOIN_ONLY);

        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                joinedAt
        );
        membership.grantPrejoinHistoryAccess(joinedAt);

        UserEncryptionDevice retiredDevice = new UserEncryptionDevice(
                UUID.randomUUID(),
                member.getId(),
                "device",
                x25519PublicJwk("identity-retired"),
                "X25519",
                ed25519PublicJwk(generateKeyPair("Ed25519")),
                "Ed25519",
                7,
                x25519PublicJwk("signed-retired"),
                sign(generateKeyPair("Ed25519").getPrivate(), signedPrekeySignaturePayload(x25519RawBytes("signed-retired"))),
                "X25519",
                joinedAt.minusSeconds(60),
                joinedAt.minusSeconds(30),
                joinedAt.minusSeconds(5)
        );
        ChatHistoryKeyEscrow escrow = new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                "{\"ciphertext\":\"server\"}",
                joinedAt.plusSeconds(1),
                joinedAt.plusSeconds(1)
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(member);
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId()))
                .thenReturn(Optional.of(membership));
        when(userEncryptionDeviceRepository.findById(retiredDevice.getId()))
                .thenReturn(Optional.of(retiredDevice));
        when(chatHistoryKeyAccessRepository.findAllByChatIdAndRecipientUserIdAndRecipientDeviceIdOrderByCreatedAtAsc(
                chatId,
                member.getId(),
                retiredDevice.getId()
        )).thenReturn(List.of());
        when(chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId))
                .thenReturn(List.of(escrow));
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("{\"historyKey\":\"founding\"}");

        var responses = chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                "alice",
                chatId,
                retiredDevice.getId().toString()
        );

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).historyKeyId()).isEqualTo(historyKeyId.toString());
        assertThat(responses.get(0).wrappedKeyPayloadJson()).isEmpty();
        assertThat(responses.get(0).serverGrantPayloadJson()).isEqualTo("{\"historyKey\":\"founding\"}");
    }

    @Test
    void listOwnGroupHistoryKeysShouldReturnEscrowForDirectChat() throws Exception {
        UserAccount member = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                Instant.parse("2026-03-24T11:00:00Z")
        );
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-30T06:04:36Z");

        ChatRoom room = new ChatRoom(
                chatId,
                "Direct",
                true,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                joinedAt
        );
        UserEncryptionDevice currentDevice = device(member.getId());
        ChatHistoryKeyEscrow escrow = new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                "{\"ciphertext\":\"server\"}",
                joinedAt.plusSeconds(1),
                joinedAt.plusSeconds(1)
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(member);
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId()))
                .thenReturn(Optional.of(membership));
        when(userEncryptionDeviceRepository.findById(currentDevice.getId()))
                .thenReturn(Optional.of(currentDevice));
        when(chatHistoryKeyAccessRepository.findAllByChatIdAndRecipientUserIdAndRecipientDeviceIdOrderByCreatedAtAsc(
                chatId,
                member.getId(),
                currentDevice.getId()
        )).thenReturn(List.of());
        when(chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId))
                .thenReturn(List.of(escrow));
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("{\"historyKey\":\"direct\"}");

        var responses = chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                "alice",
                chatId,
                currentDevice.getId().toString()
        );

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).historyKeyId()).isEqualTo(historyKeyId.toString());
        assertThat(responses.get(0).serverGrantPayloadJson()).isEqualTo("{\"historyKey\":\"direct\"}");
        verify(chatHistoryKeyEscrowRepository).findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
        verify(chatHistoryKeyEscrowRepository, never())
                .findAllByChatIdAndHistoryKeyCreatedAtOnOrAfterOrderByHistoryKeyCreatedAtAsc(any(), any());
    }

    @Test
    void validateMessageHistoryEnvelopeShouldAllowDirectChat() {
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(
                chatId,
                "Direct",
                true,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        ChatHistoryKey historyKey = new ChatHistoryKey(
                historyKeyId,
                chatId,
                UUID.randomUUID(),
                Instant.parse("2026-03-24T11:00:00Z")
        );
        when(chatHistoryKeyRepository.findByIdAndChatId(historyKeyId, chatId))
                .thenReturn(Optional.of(historyKey));

        var validated = chatGroupHistoryKeyService.validateMessageHistoryEnvelope(
                room,
                """
                {"aadVersion":1,"historyKeyId":"%s","senderDeviceId":"sender-device","ciphertext":"Y2lwaGVydGV4dA==","iv":"MDEyMzQ1Njc4OTAx"}
                """.formatted(historyKeyId)
        );

        assertThat(validated).isNotNull();
        assertThat(validated.historyKeyId()).isEqualTo(historyKeyId);
    }

    private UserEncryptionDevice device(UUID userId) throws Exception {
        KeyPair signatureKeyPair = generateKeyPair("Ed25519");
        UUID deviceId = UUID.randomUUID();
        String signedPrekeyPublicKey = x25519PublicJwk("signed-" + deviceId);
        return new UserEncryptionDevice(
                deviceId,
                userId,
                "device",
                x25519PublicJwk("identity-" + deviceId),
                "X25519",
                ed25519PublicJwk(signatureKeyPair),
                "Ed25519",
                7,
                signedPrekeyPublicKey,
                sign(signatureKeyPair.getPrivate(), signedPrekeySignaturePayload(x25519RawBytes("signed-" + deviceId))),
                "X25519",
                Instant.now().minusSeconds(60),
                Instant.now(),
                null
        );
    }

    private KeyPair generateKeyPair(String algorithm) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(algorithm);
        return generator.generateKeyPair();
    }

    private String sign(java.security.PrivateKey privateKey, byte[] payload) throws Exception {
        Signature signature = Signature.getInstance("Ed25519");
        signature.initSign(privateKey);
        signature.update(payload);
        return encode(signature.sign());
    }

    private String encode(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    private String x25519PublicJwk(String seed) {
        byte[] bytes = x25519RawBytes(seed);
        return """
                {"kty":"OKP","crv":"X25519","x":"%s"}
                """.formatted(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes))
                .replace("\n", "")
                .trim();
    }

    private byte[] x25519RawBytes(String seed) {
        byte[] bytes = new byte[32];
        byte[] source = seed.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < bytes.length; index += 1) {
            bytes[index] = source[index % source.length];
        }
        return bytes;
    }

    private byte[] signedPrekeySignaturePayload(byte[] rawPublicKey) {
        byte[] context = "north-signed-prekey-v1".getBytes(StandardCharsets.UTF_8);
        byte[] payload = new byte[context.length + 1 + rawPublicKey.length];
        System.arraycopy(context, 0, payload, 0, context.length);
        payload[context.length] = 0;
        System.arraycopy(rawPublicKey, 0, payload, context.length + 1, rawPublicKey.length);
        return payload;
    }

    private String ed25519PublicJwk(KeyPair keyPair) {
        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] raw = new byte[32];
        System.arraycopy(encoded, encoded.length - raw.length, raw, 0, raw.length);
        return """
                {"kty":"OKP","crv":"Ed25519","x":"%s"}
                """.formatted(Base64.getUrlEncoder().withoutPadding().encodeToString(raw))
                .replace("\n", "")
                .trim();
    }

    private String directEnvelopeJson(
            UUID senderUserId,
            UserEncryptionDevice senderDevice,
            UserEncryptionDevice recipientDevice,
            int recipientSignedPrekeyId,
            int messageCounter
    ) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("aadVersion", 1);
        payload.put("senderUserId", senderUserId.toString());
        payload.put("senderDeviceId", senderDevice.getId().toString());
        payload.put("recipientDeviceId", recipientDevice.getId().toString());
        payload.put("senderIdentityKey", senderDevice.getIdentityKey());
        payload.put("senderIdentitySignatureKey", senderDevice.getIdentitySignatureKey());
        payload.put("recipientSignedPrekeyId", recipientSignedPrekeyId);
        payload.put("initiatorEphemeralPublicKey", x25519PublicJwk("initiator-" + recipientDevice.getId()));
        payload.put("ratchetPublicKey", x25519PublicJwk("ratchet-" + recipientDevice.getId()));
        payload.put("messageCounter", messageCounter);
        payload.put("iv", encode(new byte[12]));
        payload.put("ciphertext", encode("wrapped-key".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        return objectMapper.writeValueAsString(payload);
    }
}
