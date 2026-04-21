package com.north.messenger.application.message;

import com.north.messenger.api.dto.ChatAttachmentUploadResponse;
import com.north.messenger.application.auth.AuthService;
import com.north.messenger.application.chat.ChatService;
import com.north.messenger.domain.model.ChatAttachment;
import com.north.messenger.domain.model.ChatRoom;
import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.ChatAttachmentRepository;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class ChatAttachmentService {

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatAttachmentRepository chatAttachmentRepository;
    private final ChatAttachmentStorage chatAttachmentStorage;
    private final ChatAttachmentStorageProperties storageProperties;

    public ChatAttachmentService(
            AuthService authService,
            ChatService chatService,
            ChatAttachmentRepository chatAttachmentRepository,
            ChatAttachmentStorage chatAttachmentStorage,
            ChatAttachmentStorageProperties storageProperties
    ) {
        this.authService = authService;
        this.chatService = chatService;
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.chatAttachmentStorage = chatAttachmentStorage;
        this.storageProperties = storageProperties;
    }

    @Transactional
    public ChatAttachmentUploadResponse uploadAttachment(String username, UUID chatId, MultipartFile file) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        ChatRoom room = chatService.requireChatMembership(chatId, currentUser);
        chatService.assertChatInteractionAllowed(room, currentUser);
        validateUpload(file);

        UUID attachmentId = UUID.randomUUID();
        ChatAttachmentStorage.StoredChatAttachment storedAttachment =
                chatAttachmentStorage.store(attachmentId, file);
        ChatAttachment attachment = chatAttachmentRepository.save(
                new ChatAttachment(
                        attachmentId,
                        chatId,
                        currentUser.getId(),
                        storedAttachment.storageKey(),
                        file.getSize(),
                        Instant.now()
                )
        );
        return new ChatAttachmentUploadResponse(
                attachment.getId(),
                attachment.getCiphertextSizeBytes(),
                attachment.getCreatedAt()
        );
    }

    public ChatAttachmentDownload downloadAttachment(String username, UUID chatId, UUID attachmentId) {
        UserAccount currentUser = authService.requireAuthenticatedUser(username);
        chatService.requireChatMembership(chatId, currentUser);
        ChatAttachment attachment = chatAttachmentRepository.findByIdAndChatId(attachmentId, chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat attachment not found"));
        return new ChatAttachmentDownload(
                attachment,
                chatAttachmentStorage.loadAsResource(attachment.getStorageKey()),
                attachment.getId() + ".bin"
        );
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
        cleanupOrphanedAttachments(Instant.now());
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

    private void validateUpload(MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment file is empty");
        }
        if (file.getSize() > storageProperties.maxSizeBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Attachment file is too large");
        }
    }

    public record ChatAttachmentDownload(
            ChatAttachment attachment,
            Resource resource,
            String downloadFileName
    ) {
    }
}
