package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;

public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String path,
        List<String> details
) {
}

