package com.north.messenger.application.message;

import com.north.messenger.api.dto.CreateMessageRequest;
import com.north.messenger.api.dto.MessageResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatMessageRepository;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class MessageService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageRepository chatMessageRepository;
    private final UserAccountRepository userAccountRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageService(
            AuthService authService,
            ChatService chatService,
            ChatMessageRepository chatMessageRepository,
            UserAccountRepository userAccountRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatMessageRepository = chatMessageRepository;
        this.userAccountRepository = userAccountRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public List<MessageResponse> listMessages(UUID chatId, String username, Instant before, int limit) {
        UserAccount currentUser = authService.requireUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        int safeLimit = Math.max(1, Math.min(limit, 100));
        PageRequest pageRequest = PageRequest.of(0, safeLimit);
        List<ChatMessage> recentMessages = new ArrayList<>(
                before == null
                        ? chatMessageRepository.findByChatIdOrderByCreatedAtDesc(chatId, pageRequest)
                        : chatMessageRepository.findByChatIdAndCreatedAtBeforeOrderByCreatedAtDesc(chatId, before, pageRequest)
        );
        recentMessages.sort((left, right) -> left.getCreatedAt().compareTo(right.getCreatedAt()));

        Map<UUID, UserAccount> usersById = userAccountRepository.findAllByIdIn(
                        recentMessages.stream().map(ChatMessage::getSenderId).toList()
                ).stream()
                .collect(Collectors.toMap(UserAccount::getId, Function.identity()));

        return recentMessages.stream()
                .map(message -> toResponse(message, usersById.get(message.getSenderId())))
                .toList();
    }

    @Transactional
    public MessageResponse sendMessage(UUID chatId, String username, CreateMessageRequest request) {
        UserAccount currentUser = authService.requireUser(username);
        chatService.requireChatMembership(chatId, currentUser);

        String content = request.content().trim();
        if (content.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message content cannot be blank");
        }

        ChatMessage message = new ChatMessage(
                UUID.randomUUID(),
                chatId,
                currentUser.getId(),
                content,
                Instant.now()
        );
        chatMessageRepository.save(message);

        MessageResponse response = toResponse(message, currentUser);
        messagingTemplate.convertAndSend("/topic/chats." + chatId, response);
        return response;
    }

    private MessageResponse toResponse(ChatMessage message, UserAccount sender) {
        return new MessageResponse(
                message.getId(),
                message.getChatId(),
                authService.toParticipant(sender),
                message.getContent(),
                message.getCreatedAt()
        );
    }
}