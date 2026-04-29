package com.north.messenger.application.e2ee;

import com.north.messenger.application.chat.ChatUpdatedDeferredEvent;
import com.north.messenger.domain.model.ChatHistoryBackfillState;
import com.north.messenger.domain.model.ChatHistoryBackfillStatus;
import com.north.messenger.domain.repository.ChatHistoryBackfillStatusRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyAccessRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatHistoryBackfillStatusServiceTest {

    private ChatHistoryBackfillStatusRepository chatHistoryBackfillStatusRepository;
    private ChatHistoryKeyRepository chatHistoryKeyRepository;
    private ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository;
    private ApplicationEventPublisher eventPublisher;
    private ChatHistoryBackfillStatusService chatHistoryBackfillStatusService;

    @BeforeEach
    void setUp() {
        chatHistoryBackfillStatusRepository = mock(ChatHistoryBackfillStatusRepository.class);
        chatHistoryKeyRepository = mock(ChatHistoryKeyRepository.class);
        chatHistoryKeyAccessRepository = mock(ChatHistoryKeyAccessRepository.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        chatHistoryBackfillStatusService = new ChatHistoryBackfillStatusService(
                chatHistoryBackfillStatusRepository,
                chatHistoryKeyRepository,
                chatHistoryKeyAccessRepository,
                eventPublisher
        );

        when(chatHistoryBackfillStatusRepository.save(any(ChatHistoryBackfillStatus.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void trackParticipantBackfillCreatesPendingStatusWhenGroupHasOlderHistory() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        UUID primaryGrantorUserId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-29T10:00:00Z");

        when(chatHistoryKeyRepository.countByChatIdAndCreatedAtBefore(chatId, joinedAt)).thenReturn(3L);
        when(chatHistoryKeyAccessRepository.countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
                chatId,
                recipientUserId,
                joinedAt
        )).thenReturn(0L);
        when(chatHistoryBackfillStatusRepository.findByChatIdAndRecipientUserId(chatId, recipientUserId))
                .thenReturn(Optional.empty());

        chatHistoryBackfillStatusService.trackParticipantBackfill(
                chatId,
                recipientUserId,
                primaryGrantorUserId,
                joinedAt
        );

        verify(chatHistoryBackfillStatusRepository).save(any(ChatHistoryBackfillStatus.class));
    }

    @Test
    void refreshCoveragePublishesChatUpdateWhenProgressChanges() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-29T10:00:00Z");
        ChatHistoryBackfillStatus status = new ChatHistoryBackfillStatus(
                UUID.randomUUID(),
                chatId,
                recipientUserId,
                UUID.randomUUID(),
                joinedAt,
                4,
                1,
                ChatHistoryBackfillState.PARTIAL,
                null,
                Instant.parse("2026-04-29T10:00:00Z"),
                Instant.parse("2026-04-29T10:00:00Z")
        );

        when(chatHistoryBackfillStatusRepository.findAllByChatIdAndRecipientUserIdIn(chatId, List.of(recipientUserId)))
                .thenReturn(List.of(status));
        when(chatHistoryKeyAccessRepository.countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
                chatId,
                recipientUserId,
                joinedAt
        )).thenReturn(4L);

        chatHistoryBackfillStatusService.refreshCoverage(chatId, List.of(recipientUserId));

        assertThat(status.getGrantedHistoryKeyCount()).isEqualTo(4);
        assertThat(status.getState()).isEqualTo(ChatHistoryBackfillState.COMPLETE);
        verify(eventPublisher).publishEvent(eq(new ChatUpdatedDeferredEvent(chatId)));
    }

    @Test
    void refreshCoverageSkipsRealtimeNoiseWhenCoverageDidNotChange() {
        UUID chatId = UUID.randomUUID();
        UUID recipientUserId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2026-04-29T10:00:00Z");
        ChatHistoryBackfillStatus status = new ChatHistoryBackfillStatus(
                UUID.randomUUID(),
                chatId,
                recipientUserId,
                UUID.randomUUID(),
                joinedAt,
                2,
                2,
                ChatHistoryBackfillState.COMPLETE,
                Instant.parse("2026-04-29T10:01:00Z"),
                Instant.parse("2026-04-29T10:00:00Z"),
                Instant.parse("2026-04-29T10:01:00Z")
        );

        when(chatHistoryBackfillStatusRepository.findAllByChatIdAndRecipientUserIdIn(chatId, List.of(recipientUserId)))
                .thenReturn(List.of(status));
        when(chatHistoryKeyAccessRepository.countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
                chatId,
                recipientUserId,
                joinedAt
        )).thenReturn(2L);

        chatHistoryBackfillStatusService.refreshCoverage(chatId, List.of(recipientUserId));

        verify(eventPublisher, never()).publishEvent(any());
    }
}
