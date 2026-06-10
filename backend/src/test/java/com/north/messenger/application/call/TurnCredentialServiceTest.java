package com.north.messenger.application.call;

import static org.assertj.core.api.Assertions.assertThat;

import com.north.messenger.api.dto.IceServersResponse;
import com.north.messenger.api.dto.IceServersResponse.IceServer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class TurnCredentialServiceTest {

    private static final String SECRET = "super-secret-turn-key";

    @Test
    void returnsStunOnlyWhenTurnDisabled() {
        TurnProperties properties = new TurnProperties(
                false, SECRET, List.of("turn:turn.example:3478"), Duration.ofHours(1), List.of("stun:stun.example:3478"));
        TurnCredentialService service = new TurnCredentialService(properties);

        IceServersResponse response = service.resolveIceServers("alice");

        assertThat(response.iceServers()).hasSize(1);
        IceServer stun = response.iceServers().get(0);
        assertThat(stun.urls()).containsExactly("stun:stun.example:3478");
        assertThat(stun.username()).isNull();
        assertThat(stun.credential()).isNull();
    }

    @Test
    void buildsEphemeralTurnCredential() throws Exception {
        TurnProperties properties = new TurnProperties(
                true,
                SECRET,
                List.of("turn:turn.example:3478?transport=udp"),
                Duration.ofHours(1),
                List.of("stun:stun.example:3478"));
        TurnCredentialService service = new TurnCredentialService(properties);

        IceServersResponse response = service.resolveIceServers("alice");

        assertThat(response.iceServers()).hasSize(2);
        IceServer turn = response.iceServers().get(1);
        assertThat(turn.urls()).containsExactly("turn:turn.example:3478?transport=udp");
        assertThat(turn.username()).endsWith(":alice");

        long expiry = Long.parseLong(turn.username().split(":", 2)[0]);
        assertThat(expiry).isGreaterThan(System.currentTimeMillis() / 1000);
        assertThat(turn.credential()).isEqualTo(expectedCredential(turn.username()));
    }

    @Test
    void skipsTurnWhenSecretMissing() {
        TurnProperties properties = new TurnProperties(
                true, "  ", List.of("turn:turn.example:3478"), Duration.ofHours(1), List.of("stun:stun.example:3478"));
        TurnCredentialService service = new TurnCredentialService(properties);

        assertThat(service.resolveIceServers("alice").iceServers()).hasSize(1);
    }

    private String expectedCredential(String username) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        return Base64.getEncoder().encodeToString(mac.doFinal(username.getBytes(StandardCharsets.UTF_8)));
    }
}
