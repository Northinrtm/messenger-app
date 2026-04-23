package com.north.messenger.application.message;

import com.north.messenger.domain.model.MessageDispatchOutboxEntry;
import com.north.messenger.domain.repository.MessageDispatchOutboxRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class MessageDispatchOutboxService {

    private final MessageDispatchOutboxRepository messageDispatchOutboxRepository;
    private final ApplicationEventPublisher eventPublisher;

    MessageDispatchOutboxService(
            MessageDispatchOutboxRepository messageDispatchOutboxRepository,
            ApplicationEventPublisher eventPublisher
    ) {
        this.messageDispatchOutboxRepository = messageDispatchOutboxRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    void enqueue(MessageDispatchEvent event) {
        messageDispatchOutboxRepository.save(
                new MessageDispatchOutboxEntry(UUID.randomUUID(), event, Instant.now())
        );
        eventPublisher.publishEvent(new MessageDispatchOutboxQueuedEvent());
    }
}
