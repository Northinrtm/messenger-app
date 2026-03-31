package com.north.messenger.application.chat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ConferenceRecordingStorage {

    private final Path rootDirectory;

    public ConferenceRecordingStorage(ConferenceRecordingStorageProperties properties) {
        this.rootDirectory = properties.directory().toAbsolutePath().normalize();
    }

    public StoredConferenceRecordingFile store(
            UUID conferenceId,
            MultipartFile file
    ) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recording file is empty");
        }

        try {
            Files.createDirectories(rootDirectory);
            String extension = determineExtension(file.getContentType());
            String storedFilename = conferenceId + "-" + UUID.randomUUID() + extension;
            Path tempFile = Files.createTempFile(rootDirectory, conferenceId + "-", ".upload");
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }

            Path targetFile = resolveStoredPath(storedFilename);
            Files.move(tempFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
            return new StoredConferenceRecordingFile(storedFilename, targetFile);
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to store conference recording",
                    exception
            );
        }
    }

    public StoredConferenceRecordingFile importStoredFile(
            UUID conferenceId,
            Path sourceFile,
            String mimeType
    ) {
        if (sourceFile == null || !Files.isRegularFile(sourceFile)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference recording not found");
        }

        try {
            Files.createDirectories(rootDirectory);
            String extension = determineExtension(sourceFile, mimeType);
            String storedFilename = conferenceId + "-" + UUID.randomUUID() + extension;
            Path targetFile = resolveStoredPath(storedFilename);
            Files.copy(sourceFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
            return new StoredConferenceRecordingFile(storedFilename, targetFile);
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to store conference recording",
                    exception
            );
        }
    }

    public Resource loadAsResource(String storedFilename) {
        try {
            Path storedPath = resolveStoredPath(storedFilename);
            if (!Files.exists(storedPath) || !Files.isReadable(storedPath)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conference recording not found");
            }

            return new UrlResource(storedPath.toUri());
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to load conference recording",
                    exception
            );
        }
    }

    public void deleteQuietly(String storedFilename) {
        try {
            Files.deleteIfExists(resolveStoredPath(storedFilename));
        } catch (IOException ignored) {
            return;
        }
    }

    private Path resolveStoredPath(String storedFilename) {
        Path resolvedPath = rootDirectory.resolve(storedFilename).normalize();
        if (!resolvedPath.startsWith(rootDirectory)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recording path");
        }
        return resolvedPath;
    }

    private String determineExtension(String mimeType) {
        return determineExtension(null, mimeType);
    }

    private String determineExtension(Path sourceFile, String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return determineExtensionByFileName(sourceFile);
        }

        String normalizedMimeType = mimeType.toLowerCase(Locale.ROOT);
        if (normalizedMimeType.contains("mp4")) {
            return ".mp4";
        }
        if (normalizedMimeType.contains("matroska") || normalizedMimeType.contains("mkv")) {
            return ".mkv";
        }

        return determineExtensionByFileName(sourceFile);
    }

    private String determineExtensionByFileName(Path sourceFile) {
        if (sourceFile != null) {
            String fileName = sourceFile.getFileName().toString().toLowerCase(Locale.ROOT);
            if (fileName.endsWith(".mp4")) {
                return ".mp4";
            }
            if (fileName.endsWith(".mkv")) {
                return ".mkv";
            }
        }
        return ".webm";
    }

    public record StoredConferenceRecordingFile(
            String storedFilename,
            Path storedPath
    ) {
    }
}
