package com.north.messenger.application.e2ee;

import java.util.UUID;

public record UserAccountKeyChangedEvent(
        UUID userId
) {
}
