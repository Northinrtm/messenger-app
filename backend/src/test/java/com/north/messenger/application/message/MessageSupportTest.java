package com.north.messenger.application.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.observability.MessengerTelemetry;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.MessageReceiptRepository;
import com.north.messenger.domain.repository.MessageReactionRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import com.north.messenger.domain.repository.UserDeletedMessageRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.north.messenger.support.TestUserAccounts.testUserAccount;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MessageSupportTest {

    private MessageSupport messageSupport;
    private AuthService authService;
    private ChatMessageRepository chatMessageRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private UserAccountRepository userAccountRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        authService = mock(AuthService.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        messageSupport = new MessageSupport(
                authService,
                chatMessageRepository,
                chatParticipantRepository,
                mock(MessageReceiptRepository.class),
                mock(MessageReactionRepository.class),
                userAccountRepository,
                userDeletedMessageRepository,
                mock(MessengerTelemetry.class),
                objectMapper,
                mock(EncryptedMessagePreviewService.class)
        );
    }

    @Test
    void toEncryptedPayloadShouldReturnChatEpochEnvelope() {
        UUID senderId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        String sharedEnvelope = """
                {"aadVersion":1,"chatId":"%s","senderUserId":"%s","historyKeyId":"%s","ciphertext":"Y2lwaGVydGV4dA==","iv":"MDEyMzQ1Njc4OTAx"}
                """.formatted(chatId, senderId, UUID.randomUUID());
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderId,
                sharedEnvelope,
                "CHAT-EPOCH-KEY-AES-GCM",
                "MDEyMzQ1Njc4OTAx",
                UUID.randomUUID(),
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        var response = messageSupport.toEncryptedPayload(message);

        assertThat(response.scheme()).isEqualTo("CHAT-EPOCH-KEY-AES-GCM");
        assertThat(response.sharedEnvelope()).isEqualTo(sharedEnvelope);
    }

    @Test
    void toEncryptedPayloadShouldRejectNonEncryptedChatEpochMessages() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "",
                "CHAT-EPOCH-KEY-AES-GCM",
                "iv",
                UUID.randomUUID(),
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThatThrownBy(() -> messageSupport.toEncryptedPayload(message))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Encrypted chat epoch envelope is missing");
    }

    @Test
    void toEncryptedPayloadShouldRejectUnsupportedEncryptedMessageScheme() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "ciphertext",
                "UNSUPPORTED-SCHEME",
                "iv",
                null,
                "client-message-id",
                null,
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThatThrownBy(() -> messageSupport.toEncryptedPayload(message))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported encrypted message scheme");
    }

    @Test
    void loadReplySnippetsShouldHideRepliesToMessagesBeforeVisibleHistoryWindow() {
        UUID chatId = UUID.randomUUID();
        UUID viewerUserId = UUID.randomUUID();
        UUID senderUserId = UUID.randomUUID();
        ChatRoom room = new ChatRoom(chatId, "group", false, Instant.parse("2026-05-01T00:00:00Z"));
        room.updateGroupDetails("group", null, ChatPrejoinHistoryPolicy.JOIN_ONLY);
        ChatParticipant membership = new ChatParticipant(
                UUID.randomUUID(),
                chatId,
                viewerUserId,
                Instant.parse("2026-05-02T00:00:00Z")
        );
        ChatMessage referencedMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                senderUserId,
                "old message",
                Instant.parse("2026-05-01T10:00:00Z")
        );
        ChatMessage replyMessage = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                viewerUserId,
                "new message",
                null,
                null,
                null,
                referencedMessage.getId(),
                Instant.parse("2026-05-03T10:00:00Z")
        );
        UserAccount sender = testUserAccount(
                senderUserId,
                "alice",
                "Alice",
                "hash",
                Instant.parse("2026-04-01T00:00:00Z")
        );
        UserAccount viewer = testUserAccount(
                viewerUserId,
                "viewer",
                "Viewer",
                "hash",
                Instant.parse("2026-04-01T00:00:00Z")
        );

        when(chatParticipantRepository.findByChatIdAndUserId(chatId, viewerUserId)).thenReturn(Optional.of(membership));
        when(chatMessageRepository.findAllById(List.of(referencedMessage.getId()))).thenReturn(List.of(referencedMessage));
        when(userAccountRepository.findAllByIdIn(List.of(senderUserId))).thenReturn(List.of(sender));
        when(userDeletedMessageRepository.existsByUserIdAndMessageId(viewerUserId, referencedMessage.getId())).thenReturn(false);
        when(authService.toParticipant(sender)).thenReturn(
                new ParticipantResponse(sender.getId(), sender.getUsername(), sender.getDisplayName(), sender.getAvatarUrl(), false)
        );

        assertThat(messageSupport.loadReplySnippetsByMessageId(
                List.of(replyMessage),
                Map.of(viewerUserId, viewer),
                room,
                viewerUserId
        )).isEmpty();
    }
}
