package com.north.messenger.security;

import com.north.messenger.domain.model.UserAccount;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final JwtProperties jwtProperties;
    private final SecretKey signingKey;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(jwtProperties.secret()));
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

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
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
