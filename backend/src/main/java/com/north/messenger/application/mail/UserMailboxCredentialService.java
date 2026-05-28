package com.north.messenger.application.mail;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class UserMailboxCredentialService {

    private final byte[] secretKeyBytes;

    public UserMailboxCredentialService(MailProperties properties) {
        this.secretKeyBytes = properties.credentialSecret().getBytes(StandardCharsets.UTF_8);
    }

    public String derivePassword(UUID userId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKeyBytes, "HmacSHA256"));
            byte[] hash = mac.doFinal(userId.toString().getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash).substring(0, 24);
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", exception);
        }
    }
}
