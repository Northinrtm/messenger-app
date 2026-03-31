package com.north.messenger.application.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ConferenceRecordingImportService {

    private static final Logger logger = LoggerFactory.getLogger(ConferenceRecordingImportService.class);

    private final ConferenceRecordingStorageProperties properties;
    private final ObjectMapper objectMapper;

    public ConferenceRecordingImportService(
            ConferenceRecordingStorageProperties properties,
            ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public List<ImportedConferenceRecordingCandidate> discoverAvailableRecordings() {
        Path importDirectory = properties.importDirectory();
        if (importDirectory == null) {
            return List.of();
        }

        Path normalizedImportDirectory = importDirectory.toAbsolutePath().normalize();
        if (!Files.isDirectory(normalizedImportDirectory)) {
            return List.of();
        }

        try (Stream<Path> directories = Files.list(normalizedImportDirectory)) {
            return directories
                    .filter(Files::isDirectory)
                    .map(this::readCandidate)
                    .flatMap(Optional::stream)
                    .sorted(Comparator.comparing(ImportedConferenceRecordingCandidate::completedAt).reversed())
                    .toList();
        } catch (IOException exception) {
            logger.warn("Failed to scan imported conference recordings in {}", normalizedImportDirectory, exception);
            return List.of();
        }
    }

    public void deleteImportedRecordingQuietly(Path directory) {
        if (directory == null) {
            return;
        }

        try (Stream<Path> paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    logger.debug("Failed to delete imported recording path {}", path, exception);
                }
            });
        } catch (IOException exception) {
            logger.debug("Failed to enumerate imported recording directory {}", directory, exception);
        }
    }

    private Optional<ImportedConferenceRecordingCandidate> readCandidate(Path directory) {
        Path metadataFile = directory.resolve("metadata.json");
        if (!Files.isRegularFile(metadataFile)) {
            return Optional.empty();
        }

        try {
            JsonNode metadata = objectMapper.readTree(metadataFile.toFile());
            Path videoFile = findVideoFile(directory).orElse(null);
            if (videoFile == null) {
                return Optional.empty();
            }

            String roomName = firstNonBlank(
                    text(metadata, "extraMetadata", "roomName"),
                    text(metadata, "extra_metadata", "roomName"),
                    text(metadata, "roomName"),
                    text(metadata, "room_name"),
                    extractRoomNameFromMeetingUrl(
                            firstNonBlank(
                                    text(metadata, "meeting_url"),
                                    text(metadata, "meetingUrl")
                            )
                    )
            );
            String conferenceIdText = firstNonBlank(
                    text(metadata, "extraMetadata", "conferenceId"),
                    text(metadata, "extra_metadata", "conferenceId"),
                    text(metadata, "conferenceId"),
                    text(metadata, "conference_id")
            );
            UUID conferenceId = parseUuid(conferenceIdText).orElse(null);
            long sizeBytes = Files.size(videoFile);
            Instant completedAt = Files.getLastModifiedTime(videoFile).toInstant();
            String mimeType = detectMimeType(videoFile);

            if (roomName == null && conferenceId == null) {
                return Optional.empty();
            }

            return Optional.of(new ImportedConferenceRecordingCandidate(
                    directory,
                    videoFile,
                    roomName,
                    conferenceId,
                    mimeType,
                    sizeBytes,
                    completedAt
            ));
        } catch (IOException exception) {
            logger.debug("Failed to inspect imported recording directory {}", directory, exception);
            return Optional.empty();
        }
    }

    private Optional<Path> findVideoFile(Path directory) throws IOException {
        try (Stream<Path> files = Files.walk(directory, 4)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(this::isVideoFile)
                    .max(Comparator.comparingLong(this::safeFileSize));
        }
    }

    private boolean isVideoFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return fileName.endsWith(".mp4") || fileName.endsWith(".webm") || fileName.endsWith(".mkv");
    }

    private long safeFileSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException exception) {
            return -1L;
        }
    }

    private String detectMimeType(Path file) {
        try {
            String probedMimeType = Files.probeContentType(file);
            if (probedMimeType != null && !probedMimeType.isBlank()) {
                return probedMimeType;
            }
        } catch (IOException ignored) {
            // Fall through to extension-based detection.
        }

        String fileName = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".mp4")) {
            return "video/mp4";
        }
        if (fileName.endsWith(".mkv")) {
            return "video/x-matroska";
        }
        return "video/webm";
    }

    private String extractRoomNameFromMeetingUrl(String meetingUrl) {
        if (meetingUrl == null || meetingUrl.isBlank()) {
            return null;
        }

        try {
            String path = java.net.URI.create(meetingUrl).getPath();
            if (path == null || path.isBlank()) {
                return null;
            }
            String normalizedPath = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
            int lastSeparatorIndex = normalizedPath.lastIndexOf('/');
            if (lastSeparatorIndex < 0 || lastSeparatorIndex == normalizedPath.length() - 1) {
                return null;
            }
            return java.net.URLDecoder.decode(
                    normalizedPath.substring(lastSeparatorIndex + 1),
                    java.nio.charset.StandardCharsets.UTF_8
            );
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String text(JsonNode node, String... path) {
        JsonNode current = node;
        for (String segment : path) {
            if (current == null) {
                return null;
            }
            current = current.get(segment);
        }
        if (current == null || current.isNull()) {
            return null;
        }
        String value = current.asText(null);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private Optional<UUID> parseUuid(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }

        try {
            return Optional.of(UUID.fromString(value.trim()));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    public record ImportedConferenceRecordingCandidate(
            Path sourceDirectory,
            Path videoFile,
            String roomName,
            UUID conferenceId,
            String mimeType,
            long sizeBytes,
            Instant completedAt
    ) {
    }
}
