package com.north.messenger.domain.repository;

import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.MessageReceipt;
import com.north.messenger.domain.model.UserDeletedMessage;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class MessageReceiptRepositoryTest {

    @Autowired
    private MessageReceiptRepository messageReceiptRepository;

    @Autowired
    private TestEntityManager entityManager;

    private long nextServerOrder = 1L;

    @Test
    void countUnreadByUserIdAndChatIdInShouldIgnoreMessagesDeletedForSelf() {
        UUID chatId = UUID.randomUUID();
        UUID senderId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();
        ChatMessage visibleMessage = persistEncryptedMessage(chatId, senderId, Instant.parse("2026-04-18T10:00:00Z"));
        ChatMessage deletedMessage = persistEncryptedMessage(chatId, senderId, Instant.parse("2026-04-18T10:01:00Z"));
        persistReceipt(visibleMessage.getId(), recipientId);
        persistReceipt(deletedMessage.getId(), recipientId);
        persistDeletedMessage(recipientId, deletedMessage.getId());

        List<MessageReceiptRepository.ChatUnreadCountView> unreadCounts =
                messageReceiptRepository.countUnreadByUserIdAndChatIdIn(recipientId, List.of(chatId));

        assertThat(unreadCounts).hasSize(1);
        assertThat(unreadCounts.get(0).getChatId()).isEqualTo(chatId);
        assertThat(unreadCounts.get(0).getUnreadCount()).isEqualTo(1L);
    }

    @Test
    void countUnreadByChatIdShouldIgnoreMessagesDeletedForEachRecipient() {
        UUID chatId = UUID.randomUUID();
        UUID senderId = UUID.randomUUID();
        UUID aliceId = UUID.randomUUID();
        UUID bobId = UUID.randomUUID();
        ChatMessage messageOne = persistEncryptedMessage(chatId, senderId, Instant.parse("2026-04-18T10:00:00Z"));
        ChatMessage messageTwo = persistEncryptedMessage(chatId, senderId, Instant.parse("2026-04-18T10:01:00Z"));
        persistReceipt(messageOne.getId(), aliceId);
        persistReceipt(messageTwo.getId(), aliceId);
        persistReceipt(messageOne.getId(), bobId);
        persistReceipt(messageTwo.getId(), bobId);
        persistDeletedMessage(aliceId, messageTwo.getId());
        persistDeletedMessage(bobId, messageOne.getId());

        List<MessageReceiptRepository.UserUnreadCountView> unreadCounts =
                messageReceiptRepository.countUnreadByChatId(chatId);

        assertThat(unreadCounts)
                .extracting(MessageReceiptRepository.UserUnreadCountView::getUserId)
                .containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(unreadCounts)
                .extracting(MessageReceiptRepository.UserUnreadCountView::getUnreadCount)
                .containsExactlyInAnyOrder(1L, 1L);
    }

    private ChatMessage persistEncryptedMessage(UUID chatId, UUID senderId, Instant createdAt) {
        UUID messageId = UUID.randomUUID();
        long serverOrder = nextServerOrder++;
        entityManager.getEntityManager()
                .createNativeQuery("""
                        insert into chat_messages (
                            id,
                            chat_id,
                            sender_id,
                            content,
                            encryption_scheme,
                            encryption_iv,
                            encrypted_keys_json,
                            client_message_id,
                            server_order,
                            created_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """)
                .setParameter(1, messageId)
                .setParameter(2, chatId)
                .setParameter(3, senderId)
                .setParameter(4, "ciphertext")
                .setParameter(5, "RSA-OAEP-256/AES-GCM")
                .setParameter(6, "iv")
                .setParameter(7, "{\"key\":\"value\"}")
                .setParameter(8, "client-" + messageId)
                .setParameter(9, serverOrder)
                .setParameter(10, createdAt)
                .executeUpdate();
        return entityManager.find(ChatMessage.class, messageId);
    }

    private void persistReceipt(UUID messageId, UUID userId) {
        entityManager.persist(new MessageReceipt(
                UUID.randomUUID(),
                messageId,
                userId,
                null,
                null
        ));
    }

    private void persistDeletedMessage(UUID userId, UUID messageId) {
        entityManager.persist(new UserDeletedMessage(
                UUID.randomUUID(),
                userId,
                messageId,
                Instant.parse("2026-04-18T10:05:00Z")
        ));
    }
}
