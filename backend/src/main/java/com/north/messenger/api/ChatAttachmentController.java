package com.north.messenger.api;

import com.north.messenger.api.dto.ChatAttachmentBrowserPageResponse;
import com.north.messenger.api.dto.ChatAttachmentDownloadUrlResponse;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetRequest;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetResponse;
import com.north.messenger.application.message.ChatAttachmentBrowserService;
import com.north.messenger.application.message.ChatAttachmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}/attachments")
@Tag(name = "Chat attachments", description = "Attachment upload, browsing, and download-url operations")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
        @ApiResponse(responseCode = "401", ref = "#/components/responses/UnauthorizedError"),
        @ApiResponse(responseCode = "500", ref = "#/components/responses/InternalServerError")
})
public class ChatAttachmentController {

    private final ChatAttachmentService chatAttachmentService;
    private final ChatAttachmentBrowserService chatAttachmentBrowserService;

    public ChatAttachmentController(
            ChatAttachmentService chatAttachmentService,
            ChatAttachmentBrowserService chatAttachmentBrowserService
    ) {
        this.chatAttachmentService = chatAttachmentService;
        this.chatAttachmentBrowserService = chatAttachmentBrowserService;
    }

    @PostMapping("/initiate")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Initiate direct attachment upload",
            description = "Allocates attachment metadata and returns the upload target used by the client to upload a file before sending the message payload."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatAttachmentUploadTargetResponse initiateUpload(
            Authentication authentication,
            @Parameter(description = "Chat that will own the uploaded attachment")
            @PathVariable UUID chatId,
            @Valid @RequestBody ChatAttachmentUploadTargetRequest request
    ) {
        return chatAttachmentService.initiateDirectUpload(authentication.getName(), chatId, request);
    }

    @GetMapping("/browser")
    @Operation(
            summary = "List chat attachments for the shared media browser",
            description = "Returns a cursor-paged attachment browser feed for the chat. The optional kind filter narrows the result set to media categories such as photos or documents."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "400", ref = "#/components/responses/BadRequestError"),
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatAttachmentBrowserPageResponse listAttachmentBrowserPage(
            Authentication authentication,
            @Parameter(description = "Chat whose attachment browser should be returned")
            @PathVariable UUID chatId,
            @Parameter(description = "Optional attachment kind filter. Typical values are ALL, PHOTOS, and DOCUMENTS.")
            @RequestParam(required = false) String kind,
            @Parameter(description = "Opaque cursor returned by the previous browser page")
            @RequestParam(required = false) String cursor,
            @Parameter(description = "Maximum number of items to return in one page")
            @RequestParam(defaultValue = "60") int limit
    ) {
        return chatAttachmentBrowserService.listAttachmentBrowserPage(
                chatId,
                authentication.getName(),
                kind,
                cursor,
                limit
        );
    }

    @GetMapping("/{attachmentId}/download-url")
    @Operation(
            summary = "Create a temporary attachment download URL",
            description = "Returns a short-lived authenticated download URL for one attachment already attached to the chat."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "403", ref = "#/components/responses/ForbiddenError"),
            @ApiResponse(responseCode = "404", ref = "#/components/responses/NotFoundError")
    })
    public ChatAttachmentDownloadUrlResponse downloadAttachmentUrl(
            Authentication authentication,
            @Parameter(description = "Chat that owns the requested attachment")
            @PathVariable UUID chatId,
            @Parameter(description = "Attachment identifier to resolve into a temporary download URL")
            @PathVariable UUID attachmentId
    ) {
        return chatAttachmentService.createDownloadUrl(authentication.getName(), chatId, attachmentId);
    }
}
