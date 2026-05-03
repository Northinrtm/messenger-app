package com.north.messenger.application.e2ee;

import java.util.UUID;

public record UserIdentityResetEvent(
        UUID userId
) {
}
