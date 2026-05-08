package com.north.messenger.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record ChatAttachmentBrowserPageResponse(
        @Schema(description = "Attachment items for the current page")
        List<ChatAttachmentBrowserItemResponse> items,
        @Schema(description = "Cursor for the next page, null when the page is final")
        String nextCursor
) {
}
