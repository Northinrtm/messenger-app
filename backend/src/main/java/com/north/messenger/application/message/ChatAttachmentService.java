package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatAttachmentDownloadUrlResponse;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetRequest;
import com.north.messenger.api.dto.ChatAttachmentUploadTargetResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.application.support.ClusterJobLockService;
import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatAttachmentService {

    private static final long ORPHAN_ATTACHMENT_CLEANUP_LOCK_ID = 7_101_001L;

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatAttachmentRepository chatAttachmentRepository;
    private final ChatAttachmentStorage chatAttachmentStorage;
    private final ChatAttachmentStorageProperties storageProperties;
    private final ClusterJobLockService clusterJobLockService;

    public ChatAttachmentService(
            AuthService authService,
            ChatService chatService,
            ChatAttachmentRepository chatAttachmentRepository,
            ChatAttachmentStorage chatAttachmentStorage,
            ChatAttachmentStorageProperties storageProperties,
            ClusterJobLockService clusterJobLockService
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.chatAttachmentStorage = chatAttachmentStorage;
        this.storageProperties = storageProperties;
        this.clusterJobLockService = clusterJobLockService;
    }

    @Transactional
    public ChatAttachmentUploadTargetResponse initiateDirectUpload(
            String username,
            UUID chatId,
            ChatAttachmentUploadTargetRequest request
    ) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);
        validateUpload(request.sizeBytes());

        UUID attachmentId = UUID.randomUUID();
        String normalizedFileName = normalizeFileName(request.fileName());
        String normalizedMimeType = normalizeMimeType(request.mimeType());
        Instant createdAt = Instant.now();

        ChatAttachmentStorage.DirectUploadTarget uploadTarget = chatAttachmentStorage.createDirectUpload(
                attachmentId,
                normalizedFileName,
                normalizedMimeType,
                request.sizeBytes()
        );

        ChatAttachment attachment = chatAttachmentRepository.save(
                new ChatAttachment(
                        attachmentId,
                        chatId,
                        currentUser.getId(),
                        uploadTarget.storageKey(),
                        normalizedFileName,
                        normalizedMimeType,
                        request.sizeBytes(),
                        createdAt
                )
        );
        return new ChatAttachmentUploadTargetResponse(
                attachment.getId(),
                attachment.getFileName(),
                attachment.getMimeType(),
                attachment.getSizeBytes(),
                attachment.getCreatedAt(),
                uploadTarget.url().toString(),
                uploadTarget.method(),
                uploadTarget.headers(),
                uploadTarget.expiresAt()
        );
    }

    public ChatAttachmentDownloadUrlResponse createDownloadUrl(String username, UUID chatId, UUID attachmentId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        ChatAttachment attachment = chatAttachmentRepository.findByIdAndChatId(attachmentId, chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat attachment not found"));
        if (!chatAttachmentStorage.exists(attachment.getStorageKey())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat attachment binary is missing");
        }
        ChatAttachmentStorage.DirectDownloadTarget downloadTarget = chatAttachmentStorage.createDirectDownload(
                attachment.getStorageKey(),
                attachment.getFileName(),
                attachment.getMimeType()
        );
        return new ChatAttachmentDownloadUrlResponse(
                attachment.getId(),
                attachment.getFileName(),
                attachment.getMimeType(),
                downloadTarget.url().toString(),
                downloadTarget.expiresAt()
        );
    }

    public boolean hasAttachments(UUID messageId) {
        if (messageId == null) {
            return false;
        }
        return chatAttachmentRepository.existsByMessageId(messageId);
    }

    @Transactional
    public void attachUploadedAttachments(
            UserAccount currentUser,
            UUID chatId,
            UUID messageId,
            List<UUID> attachmentIds
    ) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return;
        }

        LinkedHashSet<UUID> uniqueAttachmentIds = new LinkedHashSet<>(attachmentIds);
        for (UUID attachmentId : uniqueAttachmentIds) {
            ChatAttachment attachment = chatAttachmentRepository.findByIdAndChatId(attachmentId, chatId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Chat attachment not found"
                    ));
            if (!attachment.getUploaderId().equals(currentUser.getId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Attachment belongs to another user");
            }
            if (attachment.getMessageId() != null && !attachment.getMessageId().equals(messageId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Attachment is already linked to a message");
            }
            if (!chatAttachmentStorage.exists(attachment.getStorageKey())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Attachment upload is incomplete");
            }

            attachment.attachToMessage(messageId);
            chatAttachmentRepository.save(attachment);
        }
    }

    @Transactional
    public void deleteAttachmentsForMessage(UUID messageId) {
        List<ChatAttachment> attachments = chatAttachmentRepository.findAllByMessageId(messageId);
        if (attachments.isEmpty()) {
            return;
        }

        attachments.forEach(attachment -> chatAttachmentStorage.deleteQuietly(attachment.getStorageKey()));
        chatAttachmentRepository.deleteAll(attachments);
    }

    @Scheduled(
            fixedDelayString = "${app.media.message-attachments.orphan-cleanup-fixed-delay-ms:900000}",
            initialDelayString = "${app.media.message-attachments.orphan-cleanup-fixed-delay-ms:900000}"
    )
    @Transactional
    public void cleanupOrphanedAttachments() {
        clusterJobLockService.runIfLockAcquired(
                ORPHAN_ATTACHMENT_CLEANUP_LOCK_ID,
                () -> cleanupOrphanedAttachments(Instant.now())
        );
    }

    int cleanupOrphanedAttachments(Instant now) {
        if (storageProperties.orphanTtl() == null || storageProperties.orphanTtl().isZero()
                || storageProperties.orphanTtl().isNegative()) {
            return 0;
        }

        Instant cutoff = now.minus(storageProperties.orphanTtl());
        List<ChatAttachment> orphanedAttachments =
                chatAttachmentRepository.findAllByMessageIdIsNullAndCreatedAtBefore(cutoff);
        if (orphanedAttachments.isEmpty()) {
            return 0;
        }

        orphanedAttachments.forEach(attachment -> chatAttachmentStorage.deleteQuietly(attachment.getStorageKey()));
        chatAttachmentRepository.deleteAll(orphanedAttachments);
        return orphanedAttachments.size();
    }

    private void validateUpload(long sizeBytes) {
        if (sizeBytes <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment file is empty");
        }
        if (sizeBytes > storageProperties.maxSizeBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Attachment file is too large");
        }
    }

    private String normalizeFileName(String fileName) {
        String normalized = fileName == null ? "" : fileName.trim();
        return normalized.isEmpty() ? "attachment" : normalized;
    }

    private String normalizeMimeType(String mimeType) {
        String normalized = mimeType == null ? "" : mimeType.trim();
        return normalized.isEmpty() ? "application/octet-stream" : normalized;
    }
}
