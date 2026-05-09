package com.north.messenger.application.message;

import com.north.messenger.domain.model.ChatMessage;
import com.north.messenger.domain.model.ChatMessageLink;
import com.north.messenger.domain.repository.ChatMessageLinkRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ChatMessageLinkService {

    private final ChatMessageLinkRepository chatMessageLinkRepository;
    private final MessageLinkExtractor messageLinkExtractor;

    ChatMessageLinkService(
            ChatMessageLinkRepository chatMessageLinkRepository,
            MessageLinkExtractor messageLinkExtractor
    ) {
        this.chatMessageLinkRepository = chatMessageLinkRepository;
        this.messageLinkExtractor = messageLinkExtractor;
    }

    @Transactional
    void syncLinks(ChatMessage message, String plainContent) {
        chatMessageLinkRepository.deleteAllByMessageId(message.getId());
        chatMessageLinkRepository.flush();

        List<ChatMessageLink> links = messageLinkExtractor.extractLinks(plainContent).stream()
                .map(link -> new ChatMessageLink(
                        UUID.randomUUID(),
                        message.getChatId(),
                        message.getId(),
                        link.url(),
                        link.positionIndex(),
                        message.getCreatedAt()
                ))
                .toList();
        if (!links.isEmpty()) {
            chatMessageLinkRepository.saveAll(links);
        }
    }
}
