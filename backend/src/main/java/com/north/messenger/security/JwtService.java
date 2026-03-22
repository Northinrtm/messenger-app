package com.north.messenger.security;

import com.north.messenger.domain.model.UserAccount;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Instant;
import java.util.Date;
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
        return issueAccessToken(user, issuedAt);
    }

    public IssuedAccessToken issueAccessToken(UserAccount user, Instant issuedAt) {
        Instant expiresAt = accessTokenExpiresAt(issuedAt);

        String token = Jwts.builder()
                .subject(user.getUsername())
                .issuer(jwtProperties.issuer())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .claim("displayName", user.getDisplayName())
                .claim("userId", user.getId().toString())
                .signWith(signingKey)
                .compact();

        return new IssuedAccessToken(token, expiresAt);
    }

    public String createAccessToken(UserAccount user) {
        return issueAccessToken(user).token();
    }

    public String extractUsername(String token) {
        return parseClaims(token).getSubject();
    }

    public boolean isTokenValid(String token, String expectedUsername) {
        Claims claims = parseClaims(token);
        return expectedUsername.equals(claims.getSubject()) && claims.getExpiration().after(new Date());
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
}
