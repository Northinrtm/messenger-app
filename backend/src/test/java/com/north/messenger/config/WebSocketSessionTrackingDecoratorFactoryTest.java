package com.north.messenger.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.EOFException;
import java.net.URI;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketSessionTrackingDecoratorFactoryTest {

    private Logger logger;
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void setUp() {
        logger = (Logger) LoggerFactory.getLogger(WebSocketSessionTrackingDecoratorFactory.class);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    void handleTransportErrorShouldLogBenignDisconnectsAsInfo() throws Exception {
        AuthenticatedWebSocketSessionRegistry registry = new AuthenticatedWebSocketSessionRegistry(mock(ApplicationEventPublisher.class));
        WebSocketSessionTrackingDecoratorFactory factory =
                new WebSocketSessionTrackingDecoratorFactory(registry);
        WebSocketHandler delegate = mock(WebSocketHandler.class);
        WebSocketSession session = mock(WebSocketSession.class);
        EOFException exception = new EOFException("peer closed");

        when(session.getId()).thenReturn("ws-1");
        when(session.getUri()).thenReturn(URI.create("ws://localhost/ws"));
        when(session.isOpen()).thenReturn(false);
        registry.register("ws-1", "north", UUID.randomUUID(), UUID.randomUUID());

        factory.decorate(delegate).handleTransportError(session, exception);

        verify(delegate).handleTransportError(session, exception);
        assertThat(appender.list).anySatisfy(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).contains("WebSocket transport disconnected");
        });
    }

    @Test
    void afterConnectionClosedShouldLogNoCloseFrameWithoutReasonAsInfo() throws Exception {
        AuthenticatedWebSocketSessionRegistry registry = new AuthenticatedWebSocketSessionRegistry(mock(ApplicationEventPublisher.class));
        WebSocketSessionTrackingDecoratorFactory factory =
                new WebSocketSessionTrackingDecoratorFactory(registry);
        WebSocketHandler delegate = mock(WebSocketHandler.class);
        WebSocketSession session = mock(WebSocketSession.class);
        CloseStatus closeStatus = new CloseStatus(CloseStatus.NO_CLOSE_FRAME.getCode(), "");

        when(session.getId()).thenReturn("ws-1");
        when(session.getUri()).thenReturn(URI.create("ws://localhost/ws"));
        registry.register("ws-1", "north", UUID.randomUUID(), UUID.randomUUID());

        factory.decorate(delegate).afterConnectionClosed(session, closeStatus);

        verify(delegate).afterConnectionClosed(session, closeStatus);
        assertThat(appender.list).anySatisfy(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getFormattedMessage()).contains("WebSocket closed by peer");
        });
    }
}
