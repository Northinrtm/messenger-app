package com.north.messenger.application.e2ee;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.GroupHistoryKeyResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.message.RealtimeMessagingGateway;
import com.north.messenger.domain.model.ChatHistoryKey;
import com.north.messenger.domain.model.ChatHistoryKeyEscrow;
import com.north.messenger.domain.model.ChatHistoryKeyUserAccess;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.model.UserDeletedChat;
import com.north.messenger.domain.model.UserEncryptionAccountKey;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyUserAccessRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import com.north.messenger.domain.repository.UserDeletedChatRepository;
import com.north.messenger.domain.repository.UserEncryptionAccountKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatGroupHistoryKeyServiceTest {

    private static final String IDENTITY_KEY_ALGORITHM = IdentitySignedAccountKeyService.IDENTITY_KEY_ALGORITHM;
    private static final String ACCOUNT_KEY_ALGORITHM = IdentitySignedAccountKeyService.ACCOUNT_KEY_ALGORITHM;

    private AuthService authService;
    private ChatService chatService;
    private ChatRoomRepository chatRoomRepository;
    private ChatHistoryKeyRepository chatHistoryKeyRepository;
    private ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository;
    private ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private UserEncryptionAccountKeyRepository userEncryptionAccountKeyRepository;
    private UserDeletedChatRepository userDeletedChatRepository;
    private ChatHistoryBackfillStatusService chatHistoryBackfillStatusService;
    private ChatHistoryKeyEscrowCryptoService chatHistoryKeyEscrowCryptoService;
    private AccountKeyWrapCryptoService accountKeyWrapCryptoService;
    private RealtimeMessagingGateway realtimeMessagingGateway;
    private ApplicationEventPublisher eventPublisher;
    private ChatGroupHistoryKeyService chatGroupHistoryKeyService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatService = mock(ChatService.class);
        chatRoomRepository = mock(ChatRoomRepository.class);
        chatHistoryKeyRepository = mock(ChatHistoryKeyRepository.class);
        chatHistoryKeyUserAccessRepository = mock(ChatHistoryKeyUserAccessRepository.class);
        chatHistoryKeyEscrowRepository = mock(ChatHistoryKeyEscrowRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userEncryptionAccountKeyRepository = mock(UserEncryptionAccountKeyRepository.class);
        userDeletedChatRepository = mock(UserDeletedChatRepository.class);
        chatHistoryBackfillStatusService = mock(ChatHistoryBackfillStatusService.class);
        chatHistoryKeyEscrowCryptoService = mock(ChatHistoryKeyEscrowCryptoService.class);
        accountKeyWrapCryptoService = mock(AccountKeyWrapCryptoService.class);
        realtimeMessagingGateway = mock(RealtimeMessagingGateway.class);
        eventPublisher = mock(ApplicationEventPublisher.class);

        chatGroupHistoryKeyService = new ChatGroupHistoryKeyService(
                authService,
                chatService,
                chatRoomRepository,
                chatHistoryKeyRepository,
                chatHistoryKeyUserAccessRepository,
                chatHistoryKeyEscrowRepository,
                chatParticipantRepository,
                userEncryptionAccountKeyRepository,
                userDeletedChatRepository,
                chatHistoryBackfillStatusService,
                chatHistoryKeyEscrowCryptoService,
                accountKeyWrapCryptoService,
                realtimeMessagingGateway,
                eventPublisher,
                new ObjectMapper()
        );

        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyRepository.save(any(ChatHistoryKey.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyUserAccessRepository.save(any(ChatHistoryKeyUserAccess.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyUserAccessRepository.saveAll(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyEscrowRepository.save(any(ChatHistoryKeyEscrow.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(chatHistoryKeyUserAccessRepository.findAllByChatIdAndRecipientUserIdOrderByCreatedAtAsc(any(), any()))
                .thenReturn(List.of());
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of());
        when(userDeletedChatRepository.findAllByChatId(any())).thenReturn(List.of());
    }

    @Test
    void getOwnActiveGroupHistoryKeyShouldReturnUserGrantForActiveEpoch() {
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
        Instant createdAt = Instant.parse("2026-04-29T17:00:00Z");

        ChatRoom room = new ChatRoom(
                chatId,
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        room.updateActiveHistoryKeyId(historyKeyId);
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                createdAt
        );
        ChatHistoryKeyUserAccess access = new ChatHistoryKeyUserAccess(
                UUID.randomUUID(),
                historyKeyId,
                member.getId(),
                "{\"wrapped\":\"history-key\"}",
                member.getId(),
                createdAt,
                createdAt
        );

        when(authService.requireAuthenticatedUser("alice")).thenReturn(member);
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId()))
                .thenReturn(Optional.of(membership));
        when(chatHistoryKeyUserAccessRepository.findByHistoryKeyIdAndRecipientUserId(historyKeyId, member.getId()))
                .thenReturn(Optional.of(access));

        var response = chatGroupHistoryKeyService.getOwnActiveGroupHistoryKey("alice", chatId);

        assertThat(response.historyKeyId()).isEqualTo(historyKeyId.toString());
        assertThat(response.wrappedKeyPayloadJson()).isEqualTo("{\"wrapped\":\"history-key\"}");
        assertThat(response.serverGrantPayloadJson()).isNull();
    }

    @Test
    void getOwnActiveGroupHistoryKeyShouldBootstrapMissingActiveKeyFromServerState() {
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
        ChatRoom room = new ChatRoom(
                chatId,
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                member.getId(),
                Instant.parse("2026-04-29T17:00:00Z")
        );
        UserEncryptionAccountKey accountKey = new UserEncryptionAccountKey(
                UUID.randomUUID(),
                member.getId(),
                "{\"kty\":\"RSA\",\"n\":\"abc\",\"e\":\"AQAB\"}",
                1L,
                "{\"kty\":\"RSA\",\"n\":\"identity\",\"e\":\"AQAB\"}",
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                Instant.parse("2026-04-29T16:59:00Z"),
                "signature",
                Instant.parse("2026-04-29T16:59:00Z"),
                Instant.parse("2026-04-29T16:59:00Z")
        );
        when(authService.requireAuthenticatedUser("alice")).thenReturn(member);
        when(chatService.requireChatMembership(chatId, member)).thenReturn(room);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(member));
        when(chatParticipantRepository.findByChatIdAndUserId(chatId, member.getId()))
                .thenReturn(Optional.of(membership));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(accountKey));
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(
                eq(accountKey.getPublicKey()),
                eq(member.getId()),
                eq(accountKey.getAccountKeyVersion()),
                any()
        )).thenReturn("{\"wrapped\":\"bootstrapped\"}");
        when(chatHistoryKeyUserAccessRepository.findByHistoryKeyIdAndRecipientUserId(any(), eq(member.getId())))
                .thenAnswer(invocation -> {
                    UUID historyKeyId = invocation.getArgument(0);
                    return Optional.of(new ChatHistoryKeyUserAccess(
                            UUID.randomUUID(),
                            historyKeyId,
                            member.getId(),
                            "{\"wrapped\":\"bootstrapped\"}",
                            member.getId(),
                            Instant.parse("2026-04-29T17:00:00Z"),
                            Instant.parse("2026-04-29T17:00:00Z")
                    ));
                });

        var response = chatGroupHistoryKeyService.getOwnActiveGroupHistoryKey("alice", chatId);

        assertThat(response.wrappedKeyPayloadJson()).isEqualTo("{\"wrapped\":\"bootstrapped\"}");
        assertThat(room.getActiveHistoryKeyId()).isNotNull();
        verify(chatRoomRepository).save(room);
    }

    @Test
    void listOwnGroupHistoryKeysShouldReturnEscrowForPostJoinHistoryWhenPrejoinHistoryIsDisabled() {
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
        when(chatHistoryKeyEscrowRepository.findAllByChatIdAndHistoryKeyCreatedAtOnOrAfterOrderByHistoryKeyCreatedAtAsc(
                chatId,
                joinedAt
        )).thenReturn(List.of(escrow));
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("{\"historyKey\":\"post-join\"}");

        var responses = chatGroupHistoryKeyService.listOwnGroupHistoryKeys(
                "alice",
                chatId,
                null
        );

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).historyKeyId()).isEqualTo(historyKeyId.toString());
        assertThat(responses.get(0).wrappedKeyPayloadJson()).isEmpty();
        assertThat(responses.get(0).serverGrantPayloadJson()).isEqualTo("{\"historyKey\":\"post-join\"}");
        verify(chatHistoryKeyEscrowRepository, never()).findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId);
    }

    @Test
    void validateMessageHistoryKeyShouldAllowDirectChat() {
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

        chatGroupHistoryKeyService.validateMessageHistoryKey(room, historyKeyId);

        verify(chatHistoryKeyRepository).findByIdAndChatId(historyKeyId, chatId);
    }

    @Test
    void validateMessageHistoryKeyShouldRejectStaleNonActiveHistoryKey() {
        UUID chatId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        UUID activeHistoryKeyId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(
                chatId,
                "Group",
                false,
                Instant.parse("2026-03-24T11:00:00Z")
        );
        room.updateActiveHistoryKeyId(activeHistoryKeyId);
        ChatHistoryKey historyKey = new ChatHistoryKey(
                historyKeyId,
                chatId,
                UUID.randomUUID(),
                Instant.parse("2026-03-24T11:00:00Z")
        );
        when(chatHistoryKeyRepository.findByIdAndChatId(historyKeyId, chatId))
                .thenReturn(Optional.of(historyKey));

        assertThatThrownBy(() -> chatGroupHistoryKeyService.validateMessageHistoryKey(room, historyKeyId))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("Encrypted chat epoch history key is no longer active");
    }

    @Test
    void backfillHistoryAccessFromEscrowShouldWrapMissingGrantsForEligibleMembers() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");

        ChatRoom room = new ChatRoom(chatId, "Group", false, createdAt.minusSeconds(60));
        room.updateGroupDetails("Group", null, ChatPrejoinHistoryPolicy.FULL_HISTORY);
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                recipientUserId,
                Instant.parse("2026-04-29T17:00:00Z")
        );
        ChatHistoryKeyEscrow escrow = new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                "{\"ciphertext\":\"server\"}",
                createdAt,
                createdAt
        );

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(membership));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(
                accountKey(
                        recipientUserId,
                        "{\"kty\":\"RSA\",\"n\":\"public\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity\",\"e\":\"AQAB\"}",
                        "signature",
                        createdAt
                )
        ));
        when(chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId))
                .thenReturn(List.of(escrow));
        when(chatHistoryKeyUserAccessRepository.findAllByRecipientUserIdAndHistoryKeyIdIn(
                eq(recipientUserId),
                any()
        )).thenReturn(List.of());
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("""
                        {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"%s","historyKeyId":"%s","historyKey":"history-material","membershipVersion":3,"historyPolicy":"FULL_HISTORY","createdAt":"%s"}
                        """.formatted(chatId, historyKeyId, createdAt));
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(any(), any(), anyLong(), any()))
                .thenReturn("{\"aadVersion\":1,\"ciphertext\":\"wrapped\"}");

        chatGroupHistoryKeyService.backfillHistoryAccessFromEscrow(
                chatId,
                Set.of(recipientUserId),
                grantorUserId
        );

        verify(chatHistoryKeyUserAccessRepository).saveAll(any());
        verify(chatHistoryBackfillStatusService).refreshCoverage(chatId, List.of(recipientUserId));
    }

    @Test
    void rotateActiveHistoryKeyForCurrentParticipantsShouldCreateWrappedGrantsAndEscrow() {
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");
        UserAccount owner = testUserAccount(
                grantorUserId,
                "north",
                "north@example.com",
                "North",
                null,
                null,
                "pw",
                createdAt
        );
        UserAccount participant = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                createdAt
        );
        ChatRoom room = new ChatRoom(chatId, "Group", false, createdAt.minusSeconds(60));

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(owner, participant));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(
                accountKey(
                        owner.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"owner\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-owner\",\"e\":\"AQAB\"}",
                        "signature-owner",
                        createdAt
                ),
                accountKey(
                        participant.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"participant\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-participant\",\"e\":\"AQAB\"}",
                        "signature-participant",
                        createdAt
                )
        ));
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(any(), any(), anyLong(), any()))
                .thenReturn("{\"aadVersion\":1,\"ciphertext\":\"wrapped\"}");
        when(chatHistoryKeyEscrowCryptoService.encryptGrantPayload(any()))
                .thenReturn("{\"ciphertext\":\"escrow\"}");
        when(chatHistoryKeyEscrowRepository.findByHistoryKeyId(any())).thenReturn(Optional.empty());

        chatGroupHistoryKeyService.rotateActiveHistoryKeyForCurrentParticipants(chatId, grantorUserId);

        verify(chatHistoryKeyRepository).save(any(ChatHistoryKey.class));
        verify(chatHistoryKeyUserAccessRepository).saveAll(any());
        verify(chatHistoryKeyEscrowRepository).save(any(ChatHistoryKeyEscrow.class));
        verify(chatHistoryBackfillStatusService).refreshCoverage(chatId);
        verify(eventPublisher).publishEvent(any(ActiveGroupHistoryKeyBroadcastRequestedEvent.class));
        assertThat(room.getActiveHistoryKeyId()).isNotNull();
    }

    @Test
    void rotateActiveHistoryKeyForCurrentParticipantsShouldAlsoSupportDirectChats() {
        UUID chatId = UUID.randomUUID();
        UUID grantorUserId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");
        UserAccount currentUser = testUserAccount(
                grantorUserId,
                "north",
                "north@example.com",
                "North",
                null,
                null,
                "pw",
                createdAt
        );
        UserAccount peer = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                createdAt
        );
        ChatRoom room = new ChatRoom(chatId, "Direct", true, createdAt.minusSeconds(60));

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(currentUser, peer));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(
                accountKey(
                        currentUser.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"current\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-current\",\"e\":\"AQAB\"}",
                        "signature-current",
                        createdAt
                ),
                accountKey(
                        peer.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"peer\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-peer\",\"e\":\"AQAB\"}",
                        "signature-peer",
                        createdAt
                )
        ));
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(any(), any(), anyLong(), any()))
                .thenReturn("{\"aadVersion\":1,\"ciphertext\":\"wrapped\"}");
        when(chatHistoryKeyEscrowCryptoService.encryptGrantPayload(any()))
                .thenReturn("{\"ciphertext\":\"escrow\"}");
        when(chatHistoryKeyEscrowRepository.findByHistoryKeyId(any())).thenReturn(Optional.empty());

        chatGroupHistoryKeyService.rotateActiveHistoryKeyForCurrentParticipants(chatId, grantorUserId);

        verify(chatHistoryKeyRepository).save(any(ChatHistoryKey.class));
        verify(chatHistoryKeyUserAccessRepository).saveAll(any());
        verify(chatHistoryKeyEscrowRepository).save(any(ChatHistoryKeyEscrow.class));
        assertThat(room.getActiveHistoryKeyId()).isNotNull();
    }

    @Test
    void rotateOwnActiveHistoryKeyShouldRequireModeratorOrOwnerForGroups() {
        UUID chatId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");
        UserAccount owner = testUserAccount(
                UUID.randomUUID(),
                "north",
                "north@example.com",
                "North",
                null,
                null,
                "pw",
                createdAt
        );
        UserAccount participant = testUserAccount(
                UUID.randomUUID(),
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                createdAt
        );
        ChatRoom room = new ChatRoom(chatId, "Group", false, createdAt.minusSeconds(60));
        AuthService.AuthenticatedSession session = new AuthService.AuthenticatedSession(
                owner,
                UUID.randomUUID()
        );

        when(authService.requireAuthenticatedSession("north", "token")).thenReturn(session);
        when(chatService.requireChatMembership(chatId, owner)).thenReturn(room);
        when(chatService.findParticipants(chatId)).thenReturn(List.of(owner, participant));
        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(
                accountKey(
                        owner.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"owner\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-owner\",\"e\":\"AQAB\"}",
                        "signature-owner",
                        createdAt
                ),
                accountKey(
                        participant.getId(),
                        "{\"kty\":\"RSA\",\"n\":\"participant\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-participant\",\"e\":\"AQAB\"}",
                        "signature-participant",
                        createdAt
                )
        ));
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(any(), any(), anyLong(), any()))
                .thenReturn("{\"aadVersion\":1,\"ciphertext\":\"wrapped\"}");
        when(chatHistoryKeyEscrowCryptoService.encryptGrantPayload(any()))
                .thenReturn("{\"ciphertext\":\"escrow\"}");
        when(chatHistoryKeyEscrowRepository.findByHistoryKeyId(any())).thenReturn(Optional.empty());

        GroupHistoryKeyResponse response = chatGroupHistoryKeyService.rotateOwnActiveHistoryKey(
                "north",
                "token",
                chatId
        );

        verify(chatService).requireGroupModeratorOrOwnerAccess(room, owner);
        assertThat(response.historyKeyId()).isEqualTo(room.getActiveHistoryKeyId().toString());
    }

    @Test
    void refreshVisibleHistoryAccessForRecipientShouldRewrapVisibleDirectEscrow() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");
        ChatRoom room = new ChatRoom(chatId, "Direct", true, createdAt.minusSeconds(60));
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                recipientUserId,
                createdAt.minusSeconds(30)
        );
        ChatHistoryKey historyKey = new ChatHistoryKey(
                historyKeyId,
                chatId,
                UUID.randomUUID(),
                createdAt
        );
        ChatHistoryKeyEscrow escrow = new ChatHistoryKeyEscrow(
                UUID.randomUUID(),
                historyKeyId,
                chatId,
                "{\"ciphertext\":\"server\"}",
                createdAt,
                createdAt
        );

        when(userEncryptionAccountKeyRepository.findAllByUserIdIn(any())).thenReturn(List.of(
                accountKey(
                        recipientUserId,
                        "{\"kty\":\"RSA\",\"n\":\"recipient\",\"e\":\"AQAB\"}",
                        "{\"kty\":\"RSA\",\"n\":\"identity-recipient\",\"e\":\"AQAB\"}",
                        "signature-recipient",
                        createdAt
                )
        ));
        when(chatParticipantRepository.findAllByUserIdOrderByJoinedAtAsc(recipientUserId))
                .thenReturn(List.of(membership));
        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatHistoryKeyEscrowRepository.findAllByChatIdOrderByHistoryKeyCreatedAtAsc(chatId))
                .thenReturn(List.of(escrow));
        when(chatHistoryKeyRepository.findById(historyKeyId)).thenReturn(Optional.of(historyKey));
        when(chatHistoryKeyEscrowCryptoService.decryptGrantPayload("{\"ciphertext\":\"server\"}"))
                .thenReturn("""
                        {"aadVersion":1,"context":"north.group-history-key-grant.v1","chatId":"%s","historyKeyId":"%s","historyKey":"history-material","membershipVersion":1,"historyPolicy":"DIRECT","createdAt":"%s"}
                        """.formatted(chatId, historyKeyId, createdAt));
        when(chatHistoryKeyUserAccessRepository.findAllByRecipientUserIdAndHistoryKeyIdIn(
                eq(recipientUserId),
                any()
        )).thenReturn(List.of());
        when(accountKeyWrapCryptoService.wrapHistoryKeyGrant(any(), any(), anyLong(), any()))
                .thenReturn("{\"aadVersion\":1,\"ciphertext\":\"wrapped\"}");

        chatGroupHistoryKeyService.refreshVisibleHistoryAccessForRecipient(recipientUserId);

        verify(chatHistoryKeyUserAccessRepository).saveAll(any());
        verify(chatHistoryBackfillStatusService).refreshCoverage(chatId, List.of(recipientUserId));
        verify(eventPublisher).publishEvent(any(ActiveGroupHistoryKeyBroadcastRequestedEvent.class));
    }

    @Test
    void broadcastOwnActiveHistoryKeyAccessesShouldSendActiveGrantToRecipientQueue() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID historyKeyId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-04-20T10:00:00Z");
        UserAccount recipient = testUserAccount(
                recipientUserId,
                "alice",
                "alice@example.com",
                "Alice",
                null,
                null,
                "pw",
                createdAt
        );
        ChatRoom room = new ChatRoom(chatId, "Group", false, createdAt.minusSeconds(60));
        room.updateActiveHistoryKeyId(historyKeyId);
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                recipientUserId,
                createdAt.minusSeconds(30)
        );
        ChatHistoryKeyUserAccess access = new ChatHistoryKeyUserAccess(
                UUID.randomUUID(),
                historyKeyId,
                recipientUserId,
                "{\"wrapped\":\"active\"}",
                UUID.randomUUID(),
                createdAt,
                createdAt
        );

        when(chatRoomRepository.findById(chatId)).thenReturn(Optional.of(room));
        when(chatService.findParticipants(chatId)).thenReturn(List.of(recipient));
        when(chatParticipantRepository.findAllByChatIdOrderByJoinedAtAsc(chatId)).thenReturn(List.of(membership));
        when(chatHistoryKeyUserAccessRepository.findByHistoryKeyIdAndRecipientUserId(historyKeyId, recipientUserId))
                .thenReturn(Optional.of(access));

        chatGroupHistoryKeyService.broadcastOwnActiveHistoryKeyAccesses(chatId, Set.of(recipientUserId));

        verify(realtimeMessagingGateway).sendToUser(
                eq(recipient.getUsername()),
                eq("/queue/group-history-active-keys"),
                any()
        );
    }

    private UserEncryptionAccountKey accountKey(
            UUID userId,
            String publicKey,
            String identitySigningPublicKey,
            String signature,
            Instant createdAt
    ) {
        return new UserEncryptionAccountKey(
                UUID.randomUUID(),
                userId,
                publicKey,
                1L,
                identitySigningPublicKey,
                IDENTITY_KEY_ALGORITHM,
                ACCOUNT_KEY_ALGORITHM,
                createdAt,
                signature,
                createdAt,
                createdAt
        );
    }
}
