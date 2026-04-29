package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ChatHistoryBackfillStatusResponse;
import com.north.messenger.application.chat.ChatUpdatedDeferredEvent;
import com.north.messenger.domain.model.ChatHistoryBackfillState;
import com.north.messenger.domain.model.ChatHistoryBackfillStatus;
import com.north.messenger.domain.repository.ChatHistoryBackfillStatusRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyAccessRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ChatHistoryBackfillStatusService {

    private final ChatHistoryBackfillStatusRepository chatHistoryBackfillStatusRepository;
    private final ChatHistoryKeyRepository chatHistoryKeyRepository;
    private final ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository;
    private final ApplicationEventPublisher eventPublisher;

    public ChatHistoryBackfillStatusService(
            ChatHistoryBackfillStatusRepository chatHistoryBackfillStatusRepository,
            ChatHistoryKeyRepository chatHistoryKeyRepository,
            ChatHistoryKeyAccessRepository chatHistoryKeyAccessRepository,
            ApplicationEventPublisher eventPublisher
    ) {
        this.chatHistoryBackfillStatusRepository = chatHistoryBackfillStatusRepository;
        this.chatHistoryKeyRepository = chatHistoryKeyRepository;
        this.chatHistoryKeyAccessRepository = chatHistoryKeyAccessRepository;
        this.eventPublisher = eventPublisher;
    }

    public ChatHistoryBackfillStatusResponse getStatus(UUID chatId, UUID recipientUserId) {
        return chatHistoryBackfillStatusRepository.findByChatIdAndRecipientUserId(chatId, recipientUserId)
                .map(this::toResponse)
                .orElse(null);
    }

    public Map<UUID, ChatHistoryBackfillStatusResponse> getStatusesByChatIdsForUser(
            Collection<UUID> chatIds,
            UUID recipientUserId
    ) {
        if (chatIds == null || chatIds.isEmpty()) {
            return Map.of();
        }

        return chatHistoryBackfillStatusRepository.findAllByRecipientUserIdAndChatIdIn(recipientUserId, chatIds)
                .stream()
                .collect(LinkedHashMap::new, (map, status) -> map.put(status.getChatId(), toResponse(status)), Map::putAll);
    }

    public Map<UUID, ChatHistoryBackfillStatusResponse> getStatusesByUserIdsForChat(
            UUID chatId,
            Collection<UUID> recipientUserIds
    ) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return Map.of();
        }

        return chatHistoryBackfillStatusRepository.findAllByChatIdAndRecipientUserIdIn(chatId, recipientUserIds)
                .stream()
                .collect(LinkedHashMap::new, (map, status) -> map.put(status.getRecipientUserId(), toResponse(status)), Map::putAll);
    }

    @Transactional
    public void trackParticipantBackfill(
            UUID chatId,
            UUID recipientUserId,
            UUID primaryGrantorUserId,
            Instant joinedAt
    ) {
        int requiredHistoryKeyCount = Math.toIntExact(
                chatHistoryKeyRepository.countByChatIdAndCreatedAtBefore(chatId, joinedAt)
        );
        if (requiredHistoryKeyCount <= 0) {
            chatHistoryBackfillStatusRepository.deleteByChatIdAndRecipientUserId(chatId, recipientUserId);
            return;
        }

        Instant now = Instant.now();
        int grantedHistoryKeyCount = Math.toIntExact(
                chatHistoryKeyAccessRepository.countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
                        chatId,
                        recipientUserId,
                        joinedAt
                )
        );
        chatHistoryBackfillStatusRepository.findByChatIdAndRecipientUserId(chatId, recipientUserId)
                .map(existing -> {
                    existing.updateCoverage(
                            primaryGrantorUserId,
                            requiredHistoryKeyCount,
                            grantedHistoryKeyCount,
                            now
                    );
                    return existing;
                })
                .orElseGet(() -> chatHistoryBackfillStatusRepository.save(new ChatHistoryBackfillStatus(
                        UUID.randomUUID(),
                        chatId,
                        recipientUserId,
                        primaryGrantorUserId,
                        joinedAt,
                        requiredHistoryKeyCount,
                        grantedHistoryKeyCount,
                        ChatHistoryBackfillStatus.resolveState(requiredHistoryKeyCount, grantedHistoryKeyCount),
                        grantedHistoryKeyCount >= requiredHistoryKeyCount ? now : null,
                        now,
                        now
                )));
    }

    @Transactional
    public void refreshCoverage(UUID chatId, Collection<UUID> recipientUserIds) {
        if (chatId == null || recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        List<ChatHistoryBackfillStatus> statuses = chatHistoryBackfillStatusRepository
                .findAllByChatIdAndRecipientUserIdIn(chatId, recipientUserIds);
        if (statuses.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        boolean changed = false;
        for (ChatHistoryBackfillStatus status : statuses) {
            int grantedHistoryKeyCount = Math.toIntExact(
                    chatHistoryKeyAccessRepository.countDistinctHistoryKeysByChatIdAndRecipientUserIdBeforeJoinedAt(
                            status.getChatId(),
                            status.getRecipientUserId(),
                            status.getJoinedAt()
                    )
            );
            changed |= status.updateCoverage(
                    status.getPrimaryGrantorUserId(),
                    status.getRequiredHistoryKeyCount(),
                    grantedHistoryKeyCount,
                    now
            );
        }

        if (changed) {
            eventPublisher.publishEvent(new ChatUpdatedDeferredEvent(chatId));
        }
    }

    @Transactional
    public void clearParticipantBackfill(UUID chatId, UUID recipientUserId) {
        chatHistoryBackfillStatusRepository.deleteByChatIdAndRecipientUserId(chatId, recipientUserId);
    }

    private ChatHistoryBackfillStatusResponse toResponse(ChatHistoryBackfillStatus status) {
        return new ChatHistoryBackfillStatusResponse(
                status.getState().name(),
                status.getRequiredHistoryKeyCount(),
                status.getGrantedHistoryKeyCount(),
                status.getPrimaryGrantorUserId(),
                status.getJoinedAt(),
                status.getCompletedAt()
        );
    }
}
