package com.north.messenger.api;

import com.north.messenger.api.dto.ChatAttachmentUploadResponse;
import com.north.messenger.application.message.ChatAttachmentService;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/chats/{chatId}/attachments")
public class ChatAttachmentController {

    private final ChatAttachmentService chatAttachmentService;

    public ChatAttachmentController(ChatAttachmentService chatAttachmentService) {
        this.chatAttachmentService = chatAttachmentService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ChatAttachmentUploadResponse uploadAttachment(
            Authentication authentication,
            @PathVariable UUID chatId,
            @RequestParam("file") MultipartFile file
    ) {
        return chatAttachmentService.uploadAttachment(authentication.getName(), chatId, file);
    }

    @GetMapping("/{attachmentId}")
    public ResponseEntity<Resource> downloadAttachment(
            Authentication authentication,
            @PathVariable UUID chatId,
            @PathVariable UUID attachmentId
    ) {
        ChatAttachmentService.ChatAttachmentDownload download =
                chatAttachmentService.downloadAttachment(authentication.getName(), chatId, attachmentId);
        ContentDisposition contentDisposition = ContentDisposition.attachment()
                .filename(download.downloadFileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(download.attachment().getCiphertextSizeBytes())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                .body(download.resource());
    }
}
