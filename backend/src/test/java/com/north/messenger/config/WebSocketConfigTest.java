package com.north.messenger.config;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class WebSocketConfigTest {

    @Test
    void configureWebSocketTransportShouldApplyConfiguredLimitsAndSessionDecorator() {
        WebSocketSessionTrackingDecoratorFactory decoratorFactory = mock(WebSocketSessionTrackingDecoratorFactory.class);
        WebSocketConfig config = new WebSocketConfig(
                mock(WebSocketAuthChannelInterceptor.class),
                mock(WebSocketOutboundSecurityInterceptor.class),
                decoratorFactory,
                new String[]{"http://localhost:5173"},
                8_388_608,
                4_194_304,
                20_000
        );
        InspectableWebSocketTransportRegistration registration =
                new InspectableWebSocketTransportRegistration();

        config.configureWebSocketTransport(registration);

        assertThat(registration.messageSizeLimit()).isEqualTo(8_388_608);
        assertThat(registration.sendBufferSizeLimit()).isEqualTo(4_194_304);
        assertThat(registration.sendTimeLimit()).isEqualTo(20_000);
        assertThat(registration.decoratorFactories()).containsExactly(decoratorFactory);
    }

    private static class InspectableWebSocketTransportRegistration extends WebSocketTransportRegistration {

        Integer messageSizeLimit() {
            return getMessageSizeLimit();
        }

        Integer sendBufferSizeLimit() {
            return getSendBufferSizeLimit();
        }

        Integer sendTimeLimit() {
            return getSendTimeLimit();
        }

        List<WebSocketHandlerDecoratorFactory> decoratorFactories() {
            return getDecoratorFactories();
        }
    }
}
