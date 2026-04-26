package com.north.messenger.application.message;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class MessageDispatchOutboxQueuedListenerTest {

    @Test
    void onQueuedShouldCoalesceNestedDrainRequestsIntoFollowUpDrain() {
        MessageDispatchOutboxProcessor messageDispatchOutboxProcessor = mock(MessageDispatchOutboxProcessor.class);
        MessageDispatchOutboxQueuedListener listener =
                new MessageDispatchOutboxQueuedListener(messageDispatchOutboxProcessor);
        AtomicInteger drainInvocations = new AtomicInteger();

        doAnswer(invocation -> {
            if (drainInvocations.getAndIncrement() == 0) {
                listener.onQueued(new MessageDispatchOutboxQueuedEvent());
            }
            return null;
        }).when(messageDispatchOutboxProcessor).drainAvailableEntries();

        listener.onQueued(new MessageDispatchOutboxQueuedEvent());

        verify(messageDispatchOutboxProcessor, times(2)).drainAvailableEntries();
    }
}
