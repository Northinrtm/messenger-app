package com.north.messenger.api;

import com.north.messenger.api.dto.ChatAttachmentBrowserPageResponse;
import com.north.messenger.api.dto.ChatAttachmentDownloadUrlResponse;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetRequest;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetResponse;
import com.north.messenger.application.message.ChatAttachmentBrowserService;
import com.north.messenger.application.message.ChatAttachmentService;
import io.swagger.v3.oas.annotations.Operation;
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
    public ChatAttachmentUploadTargetResponse initiateUpload(
            Authentication authentication,
            @PathVariable UUID chatId,
            @Valid @RequestBody ChatAttachmentUploadTargetRequest request
    ) {
        return chatAttachmentService.initiateDirectUpload(authentication.getName(), chatId, request);
    }

    @GetMapping("/browser")
    @Operation(summary = "List chat attachments for the shared media browser")
    public ChatAttachmentBrowserPageResponse listAttachmentBrowserPage(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam(required = false) String kind,
            @RequestParam(required = false) String cursor,
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
    public ChatAttachmentDownloadUrlResponse downloadAttachmentUrl(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable UUID attachmentId
    ) {
        return chatAttachmentService.createDownloadUrl(authentication.getName(), chatId, attachmentId);
    }
}
