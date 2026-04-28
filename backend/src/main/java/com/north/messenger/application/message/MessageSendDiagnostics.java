package com.north.messenger.application.message;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MessageSendDiagnostics {

    private static final Logger log = LoggerFactory.getLogger(MessageSendDiagnostics.class);

    private MessageSendDiagnostics() {
    }

    public static void logIngress(String transport, UUID chatId, String username, String clientMessageId) {
        log.debug(
                "Message send ingress transport={} user={} chatId={} clientMessageId={}",
                transport,
                safe(username),
                chatId,
                safe(clientMessageId)
        );
    }

    public static void logOutcome(
            String transport,
            String stage,
            String result,
            UUID chatId,
            UUID messageId,
            String username,
            String clientMessageId
    ) {
        log.info(
                "Message send trace transport={} stage={} result={} user={} chatId={} messageId={} clientMessageId={}",
                transport,
                stage,
                result,
                safe(username),
                chatId,
                messageId,
                safe(clientMessageId)
        );
    }

    public static void logFailure(
            String transport,
            String stage,
            UUID chatId,
            UUID messageId,
            String username,
            String clientMessageId,
            Integer status,
            String error,
            List<String> details,
            Throwable exception
    ) {
        List<String> normalizedDetails = details == null ? List.of() : details;
        String statusLabel = status == null ? "n/a" : Integer.toString(status);
        if (status != null && status >= 500 || exception != null && !(exception instanceof org.springframework.web.server.ResponseStatusException)) {
            log.error(
                    "Message send failure transport={} stage={} status={} user={} chatId={} messageId={} clientMessageId={} error={} details={}",
                    transport,
                    stage,
                    statusLabel,
                    safe(username),
                    chatId,
                    messageId,
                    safe(clientMessageId),
                    safe(error),
                    normalizedDetails,
                    exception
            );
            return;
        }

        log.warn(
                "Message send failure transport={} stage={} status={} user={} chatId={} messageId={} clientMessageId={} error={} details={}",
                transport,
                stage,
                statusLabel,
                safe(username),
                chatId,
                messageId,
                safe(clientMessageId),
                safe(error),
                normalizedDetails
        );
    }

    public static List<String> withServerStage(String stage, List<String> details) {
        List<String> normalizedDetails = details == null ? List.of() : details;
        List<String> nextDetails = new ArrayList<>(normalizedDetails.size() + 1);
        nextDetails.add("serverStage=" + stage);
        nextDetails.addAll(normalizedDetails);
        return List.copyOf(nextDetails);
    }

    private static String safe(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }
}
