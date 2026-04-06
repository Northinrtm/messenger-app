package com.north.messenger.application.auth;

import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

@Component
public class AvatarService {

    private static final Pattern DATA_URL_PATTERN = Pattern.compile("^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$");

    private final UserAccountRepository userAccountRepository;

    public AvatarService(UserAccountRepository userAccountRepository) {
        this.userAccountRepository = userAccountRepository;
    }

    public String resolveAvatarUrl(UserAccount user) {
        String avatarDataUrl = user.getAvatarUrl();
        if (avatarDataUrl == null || avatarDataUrl.isBlank()) {
            return null;
        }

        return "/api/users/" + user.getId() + "/avatar?v=" + fingerprint(avatarDataUrl);
    }

    public Optional<AvatarResource> loadAvatar(UUID userId) {
        return userAccountRepository.findById(userId)
                .flatMap(user -> decodeAvatar(user.getAvatarUrl()));
    }

    private Optional<AvatarResource> decodeAvatar(String avatarDataUrl) {
        if (avatarDataUrl == null || avatarDataUrl.isBlank()) {
            return Optional.empty();
        }

        Matcher matcher = DATA_URL_PATTERN.matcher(avatarDataUrl);
        if (!matcher.matches()) {
            return Optional.empty();
        }

        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(matcher.group(2));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(matcher.group(1));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }

        return Optional.of(new AvatarResource(mediaType, bytes, fingerprint(avatarDataUrl)));
    }

    private String fingerprint(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for avatar fingerprinting", exception);
        }
    }

    public record AvatarResource(
            MediaType mediaType,
            byte[] bytes,
            String version
    ) {
    }
}
