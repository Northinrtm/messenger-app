package com.north.messenger.application.message;

import com.north.messenger.application.message.RedisDistributedRealtimeEvent.DeliveryMode;
import com.north.messenger.security.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConditionalOnProperty(name = "app.realtime.redis.enabled", havingValue = "true")
public class RedisRealtimeIntegrityService {

    private static final String MAC_ALGORITHM = "HmacSHA256";

    private final SecretKeySpec macKey;

    @Autowired
    public RedisRealtimeIntegrityService(
            @Value("${app.realtime.redis.mac-secret:}") String macSecret,
            JwtProperties jwtProperties
    ) {
        this(resolveMacSecret(macSecret, jwtProperties));
    }

    RedisRealtimeIntegrityService(String macSecret) {
        if (!StringUtils.hasText(macSecret)) {
            throw new IllegalStateException(
                    "app.realtime.redis.mac-secret or app.jwt.secret must be configured when Redis realtime is enabled"
            );
        }
        this.macKey = new SecretKeySpec(macSecret.getBytes(StandardCharsets.UTF_8), MAC_ALGORITHM);
    }

    private static String resolveMacSecret(String macSecret, JwtProperties jwtProperties) {
        if (StringUtils.hasText(macSecret)) {
            return macSecret;
        }
        return jwtProperties.secret();
    }

    public RedisDistributedRealtimeEvent sign(RedisDistributedRealtimeEvent event) {
        return new RedisDistributedRealtimeEvent(
                event.deliveryMode(),
                event.destination(),
                event.username(),
                event.payload(),
                computeMac(
                        event.deliveryMode() != null ? event.deliveryMode().name() : null,
                        event.destination(),
                        event.username(),
                        event.payload()
                )
        );
    }

    public boolean isAuthentic(RedisDistributedRealtimeEvent event) {
        if (event == null || !StringUtils.hasText(event.mac())) {
            return false;
        }

        return macEquals(
                computeMac(
                        event.deliveryMode() != null ? event.deliveryMode().name() : null,
                        event.destination(),
                        event.username(),
                        event.payload()
                ),
                event.mac()
        );
    }

    public String signTypingState(UUID chatId, UUID userId, long updatedAtEpochMillis) {
        return computeMac(
                "typing-state",
                chatId != null ? chatId.toString() : null,
                userId != null ? userId.toString() : null,
                Long.toString(updatedAtEpochMillis)
        );
    }

    public boolean isAuthenticTypingState(UUID chatId, UUID userId, long updatedAtEpochMillis, String mac) {
        if (!StringUtils.hasText(mac)) {
            return false;
        }
        return macEquals(signTypingState(chatId, userId, updatedAtEpochMillis), mac);
    }

    private boolean macEquals(String expectedMac, String actualMac) {
        return java.security.MessageDigest.isEqual(
                expectedMac.getBytes(StandardCharsets.UTF_8),
                actualMac.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String computeMac(String... parts) {
        try {
            Mac mac = Mac.getInstance(MAC_ALGORITHM);
            mac.init(macKey);
            for (int index = 0; index < parts.length; index += 1) {
                if (index > 0) {
                    mac.update((byte) '\n');
                }
                mac.update(normalize(parts[index]));
            }
            return Base64.getEncoder().encodeToString(mac.doFinal());
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to compute Redis realtime message MAC", exception);
        }
    }

    private byte[] normalize(String value) {
        return value == null ? new byte[0] : value.getBytes(StandardCharsets.UTF_8);
    }
}
