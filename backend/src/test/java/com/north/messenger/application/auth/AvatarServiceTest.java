package com.north.messenger.application.auth;

import com.north.messenger.domain.model.UserAccount;
import com.north.messenger.domain.repository.UserAccountRepository;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AvatarServiceTest {

    private UserAccountRepository userAccountRepository;
    private AvatarService avatarService;

    @BeforeEach
    void setUp() {
        userAccountRepository = mock(UserAccountRepository.class);
        avatarService = new AvatarService(userAccountRepository);
    }

    @Test
    void shouldResolveCompactAvatarUrlForInlineAvatar() {
        UserAccount user = new UserAccount(
                UUID.fromString("fdcb84e9-689d-4b59-a23d-2e94301a771c"),
                "north",
                "North",
                "data:image/png;base64," + Base64.getEncoder().encodeToString("avatar".getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );

        String avatarUrl = avatarService.resolveAvatarUrl(user);

        assertThat(avatarUrl).startsWith("/api/users/" + user.getId() + "/avatar?v=");
        assertThat(avatarUrl).doesNotContain("data:image");
    }

    @Test
    void shouldDecodeStoredAvatarDataUrl() {
        UUID userId = UUID.randomUUID();
        byte[] avatarBytes = "avatar-image".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        UserAccount user = new UserAccount(
                userId,
                "north",
                "North",
                "data:image/png;base64," + Base64.getEncoder().encodeToString(avatarBytes),
                "password-hash",
                Instant.parse("2026-03-20T12:00:00Z")
        );
        when(userAccountRepository.findById(userId)).thenReturn(Optional.of(user));

        AvatarService.AvatarResource avatar = avatarService.loadAvatar(userId).orElseThrow();

        assertThat(avatar.mediaType()).isEqualTo(MediaType.IMAGE_PNG);
        assertThat(avatar.bytes()).containsExactly(avatarBytes);
        assertThat(avatar.version()).hasSize(16);
    }
}
