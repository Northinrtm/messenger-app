package com.north.messenger.observability;

import com.north.messenger.domain.model.ChatRoom;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class MessengerTelemetry {

    private static final Logger log = LoggerFactory.getLogger(MessengerTelemetry.class);
    private static final Duration SLOW_MESSAGE_SEND_THRESHOLD = Duration.ofMillis(150);
    private static final Duration SLOW_MESSAGE_DISPATCH_THRESHOLD = Duration.ofMillis(250);
    private static final Duration SLOW_CHAT_SUMMARY_THRESHOLD = Duration.ofMillis(200);
    private static final Duration[] LATENCY_SLOS = new Duration[] {
            Duration.ofMillis(25),
            Duration.ofMillis(50),
            Duration.ofMillis(100),
            Duration.ofMillis(250),
            Duration.ofMillis(500),
            Duration.ofSeconds(1),
            Duration.ofSeconds(2)
    };

    private final MeterRegistry meterRegistry;

    public MessengerTelemetry(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public Timer.Sample startSample() {
        return Timer.start(meterRegistry);
    }

    public void recordMessageSend(
            Timer.Sample sample,
            ChatRoom room,
            int participantCount,
            String result,
            UUID chatId,
            String clientMessageId
    ) {
        long durationNanos = sample.stop(Timer.builder("messenger.message.send.duration")
                .description("Time spent persisting an outgoing message before async dispatch")
                .publishPercentileHistogram()
                .serviceLevelObjectives(LATENCY_SLOS)
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(Math.max(0, participantCount - 1)),
                        "result", result
                )
                .register(meterRegistry));

        Counter.builder("messenger.message.send.total")
                .description("Outgoing message send attempts")
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(Math.max(0, participantCount - 1)),
                        "result", result
                )
                .register(meterRegistry)
                .increment();

        if (durationNanos >= SLOW_MESSAGE_SEND_THRESHOLD.toNanos()) {
            log.warn(
                    "Slow message send chatId={} chatType={} recipients={} clientMessageId={} result={} durationMs={}",
                    chatId,
                    chatType(room),
                    Math.max(0, participantCount - 1),
                    clientMessageId,
                    result,
                    nanosToMillis(durationNanos)
            );
        }
    }

    public void recordMessageDispatch(
            Timer.Sample sample,
            ChatRoom room,
            int participantCount,
            String source,
            String result,
            UUID chatId,
            UUID messageId
    ) {
        long durationNanos = sample.stop(Timer.builder("messenger.message.dispatch.duration")
                .description("Time spent fanning out a message to chat participants")
                .publishPercentileHistogram()
                .serviceLevelObjectives(LATENCY_SLOS)
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(participantCount),
                        "source", source,
                        "result", result
                )
                .register(meterRegistry));

        Counter.builder("messenger.message.dispatch.total")
                .description("Outgoing message dispatch attempts")
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(participantCount),
                        "source", source,
                        "result", result
                )
                .register(meterRegistry)
                .increment();

        if (durationNanos >= SLOW_MESSAGE_DISPATCH_THRESHOLD.toNanos()) {
            log.warn(
                    "Slow message dispatch chatId={} messageId={} chatType={} audience={} source={} result={} durationMs={}",
                    chatId,
                    messageId,
                    chatType(room),
                    participantCount,
                    source,
                    result,
                    nanosToMillis(durationNanos)
            );
        }
    }

    public void recordMessageDispatchMissing(UUID chatId, UUID messageId, String source) {
        Counter.builder("messenger.message.dispatch.total")
                .description("Outgoing message dispatch attempts")
                .tags(
                        "chat_type", "unknown",
                        "recipient_bucket", "unknown",
                        "source", source,
                        "result", "missing"
                )
                .register(meterRegistry)
                .increment();
        log.warn("Message dispatch skipped because payload was missing chatId={} messageId={} source={}", chatId, messageId, source);
    }

    public void recordChatSummaryBroadcast(
            Timer.Sample sample,
            ChatRoom room,
            int audienceSize,
            String result,
            UUID chatId
    ) {
        long durationNanos = sample.stop(Timer.builder("messenger.chat.summary.broadcast.duration")
                .description("Time spent recomputing and broadcasting chat summaries")
                .publishPercentileHistogram()
                .serviceLevelObjectives(LATENCY_SLOS)
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(audienceSize),
                        "result", result
                )
                .register(meterRegistry));

        Counter.builder("messenger.chat.summary.broadcast.total")
                .description("Chat summary broadcasts")
                .tags(
                        "chat_type", chatType(room),
                        "recipient_bucket", recipientBucket(audienceSize),
                        "result", result
                )
                .register(meterRegistry)
                .increment();

        if (durationNanos >= SLOW_CHAT_SUMMARY_THRESHOLD.toNanos()) {
            log.warn(
                    "Slow chat summary broadcast chatId={} chatType={} audience={} result={} durationMs={}",
                    chatId,
                    chatType(room),
                    audienceSize,
                    result,
                    nanosToMillis(durationNanos)
            );
        }
    }

    private String chatType(ChatRoom room) {
        return room.isDirect() ? "direct" : "group";
    }

    private String recipientBucket(int recipientCount) {
        if (recipientCount <= 0) {
            return "0";
        }
        if (recipientCount == 1) {
            return "1";
        }
        if (recipientCount <= 5) {
            return "2_5";
        }
        if (recipientCount <= 10) {
            return "6_10";
        }
        return "11_plus";
    }

    private long nanosToMillis(long nanos) {
        return Duration.ofNanos(nanos).toMillis();
    }
}
