package com.north.messenger.application.call;

import com.north.messenger.api.dto.IceServersResponse;
import com.north.messenger.api.dto.IceServersResponse.IceServer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Builds the ICE server list for a call client. TURN credentials are short-lived
 * and derived from the shared {@code static-auth-secret} configured on coturn, so
 * no long-lived passwords are ever distributed.
 */
@Service
public class TurnCredentialService {

    private final TurnProperties properties;

    public TurnCredentialService(TurnProperties properties) {
        this.properties = properties;
    }

    public IceServersResponse resolveIceServers(String identifier) {
        List<IceServer> servers = new ArrayList<>();

        if (!properties.stunUrls().isEmpty()) {
            servers.add(new IceServer(List.copyOf(properties.stunUrls()), null, null));
        }

        if (turnAvailable()) {
            long expiry = Instant.now().plus(properties.credentialTtl()).getEpochSecond();
            String username = expiry + ":" + identifier;
            String credential = computeCredential(username);
            servers.add(new IceServer(List.copyOf(properties.urls()), username, credential));
        }

        return new IceServersResponse(servers);
    }

    private boolean turnAvailable() {
        return properties.enabled()
                && !properties.urls().isEmpty()
                && properties.secret() != null
                && !properties.secret().isBlank();
    }

    private String computeCredential(String username) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            byte[] signature = mac.doFinal(username.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature);
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to build TURN credential",
                    exception
            );
        }
    }
}
