package com.north.messenger.application.e2ee;

import com.north.messenger.api.dto.ChatHistoryBackfillStatusResponse;
import com.north.messenger.application.chat.ChatUpdatedDeferredEvent;
import com.north.messenger.domain.model.ChatHistoryBackfillState;
import com.north.messenger.domain.model.ChatHistoryBackfillStatus;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.repository.ChatHistoryBackfillStatusRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyEscrowRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyRepository;
import com.north.messenger.domain.repository.ChatHistoryKeyUserAccessRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.ChatRoomRepository;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ChatHistoryBackfillStatusService {

    private final ChatHistoryBackfillStatusRepository chatHistoryBackfillStatusRepository;
    private final ChatHistoryKeyRepository chatHistoryKeyRepository;
    private final ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository;
    private final ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ApplicationEventPublisher eventPublisher;

    public ChatHistoryBackfillStatusService(
            ChatHistoryBackfillStatusRepository chatHistoryBackfillStatusRepository,
            ChatHistoryKeyRepository chatHistoryKeyRepository,
            ChatHistoryKeyUserAccessRepository chatHistoryKeyUserAccessRepository,
            ChatHistoryKeyEscrowRepository chatHistoryKeyEscrowRepository,
            ChatParticipantRepository chatParticipantRepository,
            ChatRoomRepository chatRoomRepository,
            ApplicationEventPublisher eventPublisher
    ) {
        this.chatHistoryBackfillStatusRepository = chatHistoryBackfillStatusRepository;
        this.chatHistoryKeyRepository = chatHistoryKeyRepository;
        this.chatHistoryKeyUserAccessRepository = chatHistoryKeyUserAccessRepository;
        this.chatHistoryKeyEscrowRepository = chatHistoryKeyEscrowRepository;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatRoomRepository = chatRoomRepository;
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
        int grantedHistoryKeyCount = resolveAccessibleHistoryKeyCount(chatId, recipientUserId, joinedAt);
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
            int grantedHistoryKeyCount = resolveAccessibleHistoryKeyCount(
                    status.getChatId(),
                    status.getRecipientUserId(),
                    status.getJoinedAt()
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

    @Transactional
    public void refreshCoverage(UUID chatId) {
        if (chatId == null) {
            return;
        }

        List<ChatHistoryBackfillStatus> statuses = chatHistoryBackfillStatusRepository.findAllByChatId(chatId);
        if (statuses.isEmpty()) {
            return;
        }

        refreshCoverage(
                chatId,
                statuses.stream().map(ChatHistoryBackfillStatus::getRecipientUserId).toList()
        );
    }

    private int resolveAccessibleHistoryKeyCount(UUID chatId, UUID recipientUserId, Instant joinedAt) {
        Set<UUID> accessibleHistoryKeyIds = new LinkedHashSet<>(
                chatHistoryKeyUserAccessRepository.findDistinctHistoryKeyIdsByChatIdAndRecipientUserIdBeforeJoinedAt(
                        chatId,
                        recipientUserId,
                        joinedAt
                )
        );
        ChatRoom room = chatRoomRepository.findById(chatId).orElse(null);
        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, recipientUserId)
                .orElse(null);
        boolean hasServerManagedPrejoinAccess = room != null
                && room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY;
        if (membership != null
                && (hasServerManagedPrejoinAccess || membership.getPrejoinHistoryAccessGrantedAt() != null)) {
            accessibleHistoryKeyIds.addAll(
                    chatHistoryKeyEscrowRepository.findDistinctHistoryKeyIdsByChatIdAndHistoryKeyCreatedAtBefore(
                            chatId,
                            joinedAt
                    )
            );
        }
        return accessibleHistoryKeyIds.size();
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
