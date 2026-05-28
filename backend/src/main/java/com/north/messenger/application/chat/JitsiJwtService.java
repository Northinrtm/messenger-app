package com.north.messenger.application.chat;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class JitsiJwtService {

    private final JitsiJwtProperties properties;
    private final SecretKey signingKey;

    public JitsiJwtService(JitsiJwtProperties properties) {
        this.properties = properties;
        if (properties.enabled()) {
            byte[] keyBytes = properties.appSecret().getBytes(StandardCharsets.UTF_8);
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        } else {
            this.signingKey = null;
        }
    }

    public boolean isEnabled() {
        return properties.enabled();
    }

    public String generateToken(UUID userId, String displayName, String email, String roomName, boolean moderator) {
        if (!properties.enabled() || signingKey == null) {
            throw new IllegalStateException("Jitsi JWT is not enabled");
        }

        Instant now = Instant.now();
        Instant exp = now.plus(properties.tokenTtl());

        Map<String, Object> userContext = new LinkedHashMap<>();
        userContext.put("id", userId.toString());
        userContext.put("name", displayName);
        userContext.put("email", email);
        userContext.put("moderator", moderator);

        Map<String, Object> featuresContext = new LinkedHashMap<>();
        featuresContext.put("recording", false);
        featuresContext.put("livestreaming", false);
        featuresContext.put("transcription", false);
        featuresContext.put("outbound-call", false);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("user", userContext);
        context.put("features", featuresContext);

        return Jwts.builder()
                .issuer(properties.appId())
                .subject(properties.domain())
                .audience().add(properties.appId()).and()
                .issuedAt(Date.from(now))
                .notBefore(Date.from(now))
                .expiration(Date.from(exp))
                .claim("room", roomName != null ? roomName : "*")
                .claim("context", context)
                .signWith(signingKey)
                .compact();
    }
}
