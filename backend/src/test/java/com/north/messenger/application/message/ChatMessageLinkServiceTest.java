package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatMessageLink;
import com.north.messenger.domain.repository.ChatMessageLinkRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatMessageLinkServiceTest {

    @Test
    void syncLinksShouldFlushDeletesBeforeReinsertingSameMessagePositions() {
        ChatMessageLinkRepository chatMessageLinkRepository = mock(ChatMessageLinkRepository.class);
        when(chatMessageLinkRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        ChatMessageLinkService chatMessageLinkService = new ChatMessageLinkService(
                chatMessageLinkRepository,
                new MessageLinkExtractor()
        );
        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "before",
                "client-1",
                null,
                Instant.parse("2026-05-09T09:00:00Z")
        );

        chatMessageLinkService.syncLinks(message, "Updated https://north.example/one and https://north.example/two");

        var invocationOrder = inOrder(chatMessageLinkRepository);
        invocationOrder.verify(chatMessageLinkRepository).deleteAllByMessageId(message.getId());
        invocationOrder.verify(chatMessageLinkRepository).flush();
        invocationOrder.verify(chatMessageLinkRepository).saveAll(anyList());

        ArgumentCaptor<List<ChatMessageLink>> savedLinksCaptor = ArgumentCaptor.forClass(List.class);
        verify(chatMessageLinkRepository).saveAll(savedLinksCaptor.capture());
        List<ChatMessageLink> savedLinks = savedLinksCaptor.getValue();

        assertThat(savedLinks).hasSize(2);
        assertThat(savedLinks).extracting(ChatMessageLink::getMessageId).containsOnly(message.getId());
        assertThat(savedLinks).extracting(ChatMessageLink::getPositionIndex).containsExactly(0, 1);
    }
}
