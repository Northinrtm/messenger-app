package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record ChatLinkBrowserPageResponse(
        @Schema(description = "Link items for the current page")
        List<ChatLinkBrowserItemResponse> items,
        @Schema(description = "Cursor for the next page, null when the page is final")
        String nextCursor
) {
}
