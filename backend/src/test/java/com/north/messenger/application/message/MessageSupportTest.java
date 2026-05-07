package com.north.messenger.application.message;

import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MessageSupportTest {

    private MessageSupport messageSupport;
    private AuthService authService;
    private ChatAttachmentRepository chatAttachmentRepository;
    private ChatMessageRepository chatMessageRepository;
    private ChatParticipantRepository chatParticipantRepository;
    private UserAccountRepository userAccountRepository;
    private UserDeletedMessageRepository userDeletedMessageRepository;
    private MessageContentCryptoService messageContentCryptoService;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        chatAttachmentRepository = mock(ChatAttachmentRepository.class);
        chatMessageRepository = mock(ChatMessageRepository.class);
        chatParticipantRepository = mock(ChatParticipantRepository.class);
        userAccountRepository = mock(UserAccountRepository.class);
        userDeletedMessageRepository = mock(UserDeletedMessageRepository.class);
        messageContentCryptoService = mock(MessageContentCryptoService.class);
        when(chatAttachmentRepository.findAllByMessageIdInOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(messageContentCryptoService.requirePlainContent(any(ChatMessage.class))).thenAnswer(invocation -> {
            ChatMessage message = invocation.getArgument(0);
            return message.getContent();
        });
        messageSupport = new MessageSupport(
                authService,
                chatAttachmentRepository,
                chatMessageRepository,
                chatParticipantRepository,
                mock(MessageReceiptRepository.class),
                mock(MessageReactionRepository.class),
                userAccountRepository,
                userDeletedMessageRepository,
                mock(MessagePreviewService.class),
                messageContentCryptoService
        );
    }

    @Test
    void toPlainPayloadShouldReturnStoredContent() {
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "hello",
                Instant.parse("2026-04-30T13:09:37Z")
        );

        assertThat(messageSupport.toPlainPayload(message)).isEqualTo(new com.north.messenger.api.dto.PlainMessagePayloadResponse("hello"));
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
