package com.north.messenger.application.message;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ChatAttachmentStorage {

    private final Path rootDirectory;

    public ChatAttachmentStorage(ChatAttachmentStorageProperties properties) {
        this.rootDirectory = properties.directory().toAbsolutePath().normalize();
    }

    public StoredChatAttachment store(UUID attachmentId, MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment file is empty");
        }

        try {
            Files.createDirectories(rootDirectory);
            String storageKey = attachmentId + "-" + UUID.randomUUID() + ".bin";
            Path tempFile = Files.createTempFile(rootDirectory, attachmentId + "-", ".upload");
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }

            Path targetFile = resolveStoredPath(storageKey);
            Files.move(tempFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
            return new StoredChatAttachment(storageKey, targetFile);
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to store chat attachment",
                    exception
            );
        }
    }

    public Resource loadAsResource(String storageKey) {
        try {
            Path storedPath = resolveStoredPath(storageKey);
            if (!Files.exists(storedPath) || !Files.isReadable(storedPath)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chat attachment not found");
            }

            return new UrlResource(storedPath.toUri());
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to load chat attachment",
                    exception
            );
        }
    }

    public void deleteQuietly(String storageKey) {
        try {
            Files.deleteIfExists(resolveStoredPath(storageKey));
        } catch (IOException ignored) {
            return;
        }
    }

    private Path resolveStoredPath(String storageKey) {
        Path resolvedPath = rootDirectory.resolve(storageKey).normalize();
        if (!resolvedPath.startsWith(rootDirectory)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid attachment path");
        }
        return resolvedPath;
    }

    public record StoredChatAttachment(
            String storageKey,
            Path storagePath
    ) {
    }
}
