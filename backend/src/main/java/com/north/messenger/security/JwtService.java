package com.north.messenger.security;

import com.north.messenger.domain.model.UserAccount;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    private final JwtProperties jwtProperties;
    private final SecretKey signingKey;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.signingKey = resolveSigningKey(jwtProperties);
    }

    public IssuedAccessToken issueAccessToken(UserAccount user) {
        Instant issuedAt = Instant.now();
        return issueAccessToken(user, UUID.randomUUID(), issuedAt);
    }

    public IssuedAccessToken issueAccessToken(UserAccount user, Instant issuedAt) {
        return issueAccessToken(user, UUID.randomUUID(), issuedAt);
    }

    public IssuedAccessToken issueAccessToken(UserAccount user, UUID sessionId, Instant issuedAt) {
        Instant expiresAt = accessTokenExpiresAt(issuedAt);

        String token = Jwts.builder()
                .subject(user.getUsername())
                .issuer(jwtProperties.issuer())
                .setAudience(jwtProperties.audience())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .claim("displayName", user.getDisplayName())
                .claim("userId", user.getId().toString())
                .claim("sessionId", sessionId.toString())
                .signWith(signingKey)
                .compact();

        return new IssuedAccessToken(token, expiresAt);
    }

    public String createAccessToken(UserAccount user) {
        return issueAccessToken(user).token();
    }

    public String createAccessToken(UserAccount user, UUID sessionId) {
        return issueAccessToken(user, sessionId, Instant.now()).token();
    }

    public String extractUsername(String token) {
        return readAccessToken(token).username();
    }

    public UUID extractUserId(String token) {
        return readAccessToken(token).userId();
    }

    public UUID extractSessionId(String token) {
        return readAccessToken(token).sessionId();
    }

    public AccessTokenClaims readAccessToken(String token) {
        Claims claims = parseClaims(token);
        return new AccessTokenClaims(
                claims.getSubject(),
                UUID.fromString(claims.get("userId", String.class)),
                UUID.fromString(claims.get("sessionId", String.class)),
                claims.getExpiration().toInstant()
        );
    }

    public boolean isTokenValid(String token, String expectedUsername) {
        AccessTokenClaims claims = readAccessToken(token);
        return expectedUsername.equals(claims.username()) && claims.expiresAt().isAfter(Instant.now());
    }

    private SecretKey resolveSigningKey(JwtProperties jwtProperties) {
        String configuredSecret = jwtProperties.secret();
        if (configuredSecret != null && !configuredSecret.isBlank()) {
            return Keys.hmacShaKeyFor(Decoders.BASE64.decode(configuredSecret));
        }

        if (!jwtProperties.generateSecretIfMissing()) {
            throw new IllegalStateException("app.jwt.secret must be configured via APP_JWT_SECRET");
        }

        byte[] generatedSecret = new byte[32];
        new SecureRandom().nextBytes(generatedSecret);
        log.warn("APP_JWT_SECRET is not set. Generated an ephemeral JWT signing key for this process; all sessions will be invalidated after backend restart.");
        return Keys.hmacShaKeyFor(generatedSecret);
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .requireIssuer(jwtProperties.issuer())
                .requireAudience(jwtProperties.audience())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Instant accessTokenExpiresAt(Instant issuedAt) {
        return issuedAt.plus(jwtProperties.accessTokenTtl());
    }

    public Instant refreshTokenExpiresAt(Instant issuedAt) {
        return issuedAt.plus(jwtProperties.refreshTokenTtl());
    }

    public record IssuedAccessToken(
            String token,
            Instant expiresAt
    ) {
    }

    public record AccessTokenClaims(
            String username,
            UUID userId,
            UUID sessionId,
            Instant expiresAt
    ) {
    }
}
