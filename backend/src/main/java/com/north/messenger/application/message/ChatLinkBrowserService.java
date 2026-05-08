package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatLinkBrowserItemResponse;
import com.north.messenger.api.dto.ChatLinkBrowserPageResponse;
import com.north.messenger.api.dto.ParticipantResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatParticipant;
import com.north.messenger.domain.model.ChatPrejoinHistoryPolicy;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageLinkRepository;
import com.north.messenger.domain.repository.ChatParticipantRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.net.URI;
import java.time.Instant;
import java.util.List;
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
public class ChatLinkBrowserService {

    private static final Logger log = LoggerFactory.getLogger(ChatLinkBrowserService.class);

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatParticipantRepository chatParticipantRepository;
    private final ChatMessageLinkRepository chatMessageLinkRepository;
    private final UserAccountRepository userAccountRepository;

    public ChatLinkBrowserService(
            AuthService authService,
            ChatService chatService,
            ChatParticipantRepository chatParticipantRepository,
            ChatMessageLinkRepository chatMessageLinkRepository,
            UserAccountRepository userAccountRepository
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatParticipantRepository = chatParticipantRepository;
        this.chatMessageLinkRepository = chatMessageLinkRepository;
        this.userAccountRepository = userAccountRepository;
    }

    public ChatLinkBrowserPageResponse listLinkBrowserPage(
            UUID chatId,
            String username,
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
        LinkBrowserCursor cursor = parseCursor(rawCursor);
        Instant visibleFrom = resolveVisibleHistoryStart(room, membership);
        int safeLimit = Math.max(1, Math.min(limit, 100));

        List<ChatMessageLinkRepository.LinkBrowserItemView> browserItems = chatMessageLinkRepository.findBrowserItems(
                chatId,
                currentUser.getId(),
                visibleFrom,
                cursor == null ? null : cursor.serverOrder(),
                cursor == null ? null : cursor.positionIndex(),
                PageRequest.of(0, safeLimit + 1)
        );

        boolean hasNextPage = browserItems.size() > safeLimit;
        List<ChatMessageLinkRepository.LinkBrowserItemView> currentPageItems = hasNextPage
                ? browserItems.subList(0, safeLimit)
                : browserItems;

        Map<UUID, UserAccount> sendersById = userAccountRepository.findAllByIdIn(
                        currentPageItems.stream()
                                .map(ChatMessageLinkRepository.LinkBrowserItemView::getSenderId)
                                .filter(Objects::nonNull)
                                .distinct()
                                .toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));
        Map<UUID, Boolean> onlineByUserId = authService.resolveOnlineByUserIds(sendersById.keySet());

        List<ChatLinkBrowserItemResponse> items = currentPageItems.stream()
                .map(item -> toResponse(chatId, item, sendersById, onlineByUserId))
                .flatMap(java.util.Optional::stream)
                .toList();

        String nextCursor = hasNextPage && !currentPageItems.isEmpty()
                ? encodeCursor(currentPageItems.get(currentPageItems.size() - 1))
                : null;
        return new ChatLinkBrowserPageResponse(items, nextCursor);
    }

    private java.util.Optional<ChatLinkBrowserItemResponse> toResponse(
            UUID chatId,
            ChatMessageLinkRepository.LinkBrowserItemView item,
            Map<UUID, UserAccount> sendersById,
            Map<UUID, Boolean> onlineByUserId
    ) {
        UserAccount sender = sendersById.get(item.getSenderId());
        if (sender == null) {
            log.warn(
                    "Skipping link browser item with missing sender chatId={} messageId={} linkId={} senderId={}",
                    chatId,
                    item.getMessageId(),
                    item.getLinkId(),
                    item.getSenderId()
            );
            return java.util.Optional.empty();
        }

        ParticipantResponse senderParticipant = authService.toParticipant(
                sender,
                onlineByUserId.getOrDefault(sender.getId(), false)
        );
        return java.util.Optional.of(new ChatLinkBrowserItemResponse(
                item.getLinkId(),
                item.getMessageId(),
                item.getMessageServerOrder(),
                item.getMessageCreatedAt(),
                senderParticipant,
                item.getUrl(),
                extractHost(item.getUrl())
        ));
    }

    private String extractHost(String url) {
        try {
            URI uri = new URI(url);
            if (uri.getHost() != null && !uri.getHost().isBlank()) {
                return uri.getHost();
            }
            return uri.getAuthority();
        } catch (Exception exception) {
            return null;
        }
    }

    private LinkBrowserCursor parseCursor(String rawCursor) {
        if (rawCursor == null || rawCursor.isBlank()) {
            return null;
        }

        String[] parts = rawCursor.trim().split("\\|", 2);
        if (parts.length != 2) {
            throw invalidCursor();
        }

        try {
            return new LinkBrowserCursor(
                    Long.parseLong(parts[0]),
                    Integer.parseInt(parts[1])
            );
        } catch (RuntimeException exception) {
            throw invalidCursor();
        }
    }

    private String encodeCursor(ChatMessageLinkRepository.LinkBrowserItemView item) {
        return item.getMessageServerOrder() + "|" + item.getPositionIndex();
    }

    private ResponseStatusException invalidCursor() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Link browser cursor is malformed");
    }

    private Instant resolveVisibleHistoryStart(ChatRoom room, ChatParticipant membership) {
        if (room.isDirect()
                || room.getPrejoinHistoryPolicy() == ChatPrejoinHistoryPolicy.FULL_HISTORY
                || membership.getPrejoinHistoryAccessGrantedAt() != null) {
            return null;
        }
        return membership.getJoinedAt();
    }

    private record LinkBrowserCursor(
            long serverOrder,
            int positionIndex
    ) {
    }
}
