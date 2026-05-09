package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatAttachmentBrowserItemResponse;
import com.north.messenger.api.dto.ChatAttachmentBrowserPageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatAttachmentBrowserService {

    private static final Logger log = LoggerFactory.getLogger(ChatAttachmentBrowserService.class);
    private static final Instant DEFAULT_VISIBLE_FROM = Instant.EPOCH;
    private static final long DEFAULT_CURSOR_SERVER_ORDER = Long.MAX_VALUE;
    private static final Instant DEFAULT_CURSOR_ATTACHMENT_CREATED_AT = Instant.EPOCH;
    private static final UUID DEFAULT_CURSOR_ATTACHMENT_ID = new UUID(0L, 0L);

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatAttachmentRepository chatAttachmentRepository;
    private final UserAccountRepository userAccountRepository;

    public ChatAttachmentBrowserService(
            AuthService authService,
            ChatService chatService,
            ChatParticipantRepository chatParticipantRepository,
            ChatAttachmentRepository chatAttachmentRepository,
            UserAccountRepository userAccountRepository
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.userAccountRepository = userAccountRepository;
    }

    public ChatAttachmentBrowserPageResponse listAttachmentBrowserPage(
            UUID chatId,
            String username,
            String rawKind,
            String rawCursor,
            int limit
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        ChatParticipant membership = chatParticipantRepository.findByChatIdAndUserId(chatId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Access denied for this chat"
                ));
        AttachmentBrowserKind kind = AttachmentBrowserKind.parse(rawKind);
        AttachmentBrowserCursor cursor = parseCursor(rawCursor);
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);
        boolean applyVisibleFrom = visibleFrom != null;
        boolean applyCursor = cursor != null;
        int safeLimit = Math.max(1, Math.min(limit, 100));

        List<ChatAttachmentRepository.AttachmentBrowserItemView> browserItems = chatAttachmentRepository.findBrowserItems(
                chatId,
                currentUser.getId(),
                applyVisibleFrom,
                applyVisibleFrom ? visibleFrom : DEFAULT_VISIBLE_FROM,
                kind == AttachmentBrowserKind.PHOTOS,
                kind == AttachmentBrowserKind.DOCUMENTS,
                applyCursor,
                applyCursor ? cursor.serverOrder() : DEFAULT_CURSOR_SERVER_ORDER,
                applyCursor ? cursor.attachmentCreatedAt() : DEFAULT_CURSOR_ATTACHMENT_CREATED_AT,
                applyCursor ? cursor.attachmentId() : DEFAULT_CURSOR_ATTACHMENT_ID,
                PageRequest.of(0, safeLimit + 1)
        );

        boolean hasNextPage = browserItems.size() > safeLimit;
        List<ChatAttachmentRepository.AttachmentBrowserItemView> currentPageItems = hasNextPage
                ? browserItems.subList(0, safeLimit)
                : browserItems;

        Map<UUID, UserAccount> sendersById = userAccountRepository.findAllByIdIn(
                        currentPageItems.stream()
                                .map(ChatAttachmentRepository.AttachmentBrowserItemView::getSenderId)
                                .filter(Objects::nonNull)
                                .distinct()
                                .toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(sendersById.keySet());

        List<ChatAttachmentBrowserItemResponse> items = currentPageItems.stream()
                .map(item -> toResponse(chatId, item, sendersById, onlineByUserId))
                .flatMap(java.util.Optional::stream)
                .toList();

        String nextCursor = hasNextPage && !currentPageItems.isEmpty()
                ? encodeCursor(currentPageItems.get(currentPageItems.size() - 1))
                : null;
        return new ChatAttachmentBrowserPageResponse(items, nextCursor);
    }

    private java.util.Optional<ChatAttachmentBrowserItemResponse> toResponse(
            UUID chatId,
            ChatAttachmentRepository.AttachmentBrowserItemView item,
            Map<UUID, UserAccount> sendersById,
            Map<UUID, Boolean> onlineByUserId
    ) {
        UserAccount sender = sendersById.get(item.getSenderId());
        if (sender == null) {
            log.info(
                    "Rendering attachment browser item with deleted sender chatId={} messageId={} attachmentId={} senderId={}",
                    chatId,
                    item.getMessageId(),
                    item.getAttachmentId(),
                    item.getSenderId()
            );
        }

        ParticipantResponse senderParticipant = sender != null
                ? authService.toParticipant(sender, onlineByUserId.getOrDefault(sender.getId(), false))
                : authService.toDeletedParticipant(item.getSenderId());
        return java.util.Optional.of(new ChatAttachmentBrowserItemResponse(
                item.getAttachmentId(),
                item.getMessageId(),
                item.getMessageServerOrder(),
                item.getMessageCreatedAt(),
                senderParticipant,
                item.getFileName(),
                item.getMimeType(),
                item.getSizeBytes()
        ));
    }

    private AttachmentBrowserCursor parseCursor(String rawCursor) {
        if (rawCursor == null || rawCursor.isBlank()) {
            return null;
        }

        String[] parts = rawCursor.trim().split("\\|", 3);
        if (parts.length != 3) {
            throw invalidCursor();
        }

        try {
            return new AttachmentBrowserCursor(
                    Long.parseLong(parts[0]),
                    Instant.parse(parts[1]),
                    UUID.fromString(parts[2])
            );
        } catch (RuntimeException exception) {
            throw invalidCursor();
        }
    }

    private String encodeCursor(ChatAttachmentRepository.AttachmentBrowserItemView item) {
        return item.getMessageServerOrder() + "|" + item.getAttachmentCreatedAt() + "|" + item.getAttachmentId();
    }

    private ResponseStatusException invalidCursor() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment browser cursor is malformed");
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect()) {
            return membership.getJoinedAt();
        }
        if (room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    private enum AttachmentBrowserKind {
        ALL,
        PHOTOS,
        DOCUMENTS;

        static AttachmentBrowserKind parse(String rawKind) {
            if (rawKind == null || rawKind.isBlank()) {
                return ALL;
            }

            try {
                return valueOf(rawKind.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException exception) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment browser kind is invalid");
            }
        }
    }

    private record AttachmentBrowserCursor(
            long serverOrder,
            Instant attachmentCreatedAt,
            UUID attachmentId
    ) {
    }
}
